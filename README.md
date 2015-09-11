socket.io-backlog
=================

A socket.io adapter that backlogs messages given a custom monotonous stamp.

mstamp is either a number or a string.
If it's a string, it is parsed using Date.parse() and converted to a number.

If no mstamp is given when joining, no backlog is sent.
If no mstamp property exists on emitted messages, they are not stored for backlogging.

Rule of thumb: keep mstamp generation on server side to keep the same stamp for all.

# Server

In this example, all messages are given a default mstamp.

```
io.adapter(require('socket.io-backlog')({
	length: 1000,   // how many messages are backlogged for each room
	cacheSize: 100, // cache size for packets of messages for each room
	key: 'mtime'    // which key in messages is compared to mstamp
}));

io.on('connection', function(socket) {
	socket.on('join', function(data) {
		socket.backlog(data.mtime).join(data.room);
	});
	socket.on('leave', function(data) {
		socket.leave(data.room);
	});
	socket.on('message', function(msg) {
		// this mtime will be converted to ISO 8601 by JSON.stringify
		if (!msg.mtime) msg.mtime = Date.now();
		io.to(msg.room).emit('message', msg);
	});
});
```


# Client

In this example, messages missed during a disconnection are sent back to the
client upon reconnection.

```
var mstamp;

io.on('connect', function() {
  io.emit('join', {
	  room: this.room,
	  mtime: mstamp
  });
});

io.on('message', function(msg) {
	if (msg.mtime) mstamp = msg.mtime;
	// ...
});

```


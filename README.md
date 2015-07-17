socket.io-backlog
=================

A socket.io adapter that backlogs messages given a custom timestamp mtime.

If no mtime is given when joining, no backlog is sent.
If no mtime property exists on emitted messages, they are not stored for backlogging.

Rule of thumb: keep mtime generation on server side to keep the same time for all.

# Server

In this example, all messages are given a default mtime.

```
io.on('connection', function(socket) {
	socket.on('join', function(data) {
		socket.backlog(data.mtime).join(data.room);
	});
	socket.on('leave', function(data) {
		socket.leave(data.room);
	});
	socket.on('message', function(msg) {
		if (!msg.mtime) msg.mtime = Date.now();
		io.to(msg.room).emit('message', msg);
	});
});
```


# Client

In this example, messages missed during a disconnection are sent back to the
client upon reconnection.

```
var lastmod;

io.on('connect', function() {
  io.emit('join', {
	  room: this.room,
	  mtime: lastmod
  });
});

io.on('message', function(msg) {
	if (msg.mtime) lastmod = msg.mtime;
	// ...
});

```


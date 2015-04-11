socket.io-backlog
=================

A socket.io adapter that backlogs messages given a custom timestamp param

# Server

```
io.on('connection', function(socket) {
	socket.on('join', function(data) {
		socket.join(data.room, data.mtime);
	});
	socket.on('leave', function(data) {
		socket.leave(data.room);
	});
});
```


# Client

```
io.emit('join', {
	room: this.room,
	mtime: date.getTime() // a timestamp
});

io.emit('leave', {
	room: this.room
});

```


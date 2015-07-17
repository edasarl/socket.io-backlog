var express = require("express");
var socketio = require('socket.io');
var backlog = require("../");

createApp().listen(3000, function() {
	console.log("http://localhost:3000");
});

function createApp() {
	var app = express();
	var http = require("http").Server(app);
	app.use(express.static(__dirname));

	var io = socketio(http);
	io.adapter(backlog({
		length: 100,
		peremption: 86400,
		cacheSize: 2
	}));
	io.on("connection", function(socket) {
		console.log('a user connected', socket.id);
		socket.on('join', function(data) {
			socket.backlog(data.mtime).join(data.room);
		});
		socket.on('leave', function(data) {
			socket.leave(data.room);
		});
		socket.on("message", function(message) {
			console.log(socket.id, 'message', message);
			var now = new Date();
			var completeMessage = {
				text: message,
				mtime: now.getTime()
			};
			io.to('messages').emit('message', completeMessage);
		});
	});
	return http;
}

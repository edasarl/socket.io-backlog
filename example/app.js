const express = require("express");
const IoServer = require('socket.io');
const backlog = require("../");

createApp().listen(3000, function() {
	console.log("http://localhost:3000");
});

function createApp() {
	const app = express();
	const http = require("http").Server(app);
	app.use(express.static(__dirname));

	const io = IoServer(http);
	io.adapter(backlog({
		logSize: 100,
		cacheSize: 2
	}));
	io.on("connection", function(socket) {
		console.log('a user connected', socket.id);
		socket.on('join', function (data) {
			console.log('user joins room', data);
			socket.backlog(data.mtime).join(data.room);
		});
		socket.on('leave', function(data) {
			socket.leave(data.room);
		});
		socket.on("message", function(message) {
			console.log(socket.id, 'message', message);
			const now = new Date();
			const completeMessage = {
				text: message,
				mtime: now.getTime()
			};
			io.to('messages').emit('message', completeMessage);
		});
	});
	return http;
}

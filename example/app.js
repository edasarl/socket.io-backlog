const express = require("express");
const ioServer = require('socket.io');
const Backlog = require("../");

createApp().listen(3000, function() {
	console.log("http://localhost:3000");
});

function createApp() {
	const app = express();
	const http = require("http").Server(app);
	app.use(express.static(__dirname));

	const io = ioServer(http);
	io.adapter(new Backlog({
		logSize: 100,
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

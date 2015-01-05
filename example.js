createApp().listen(3000, function() {
	console.log("listen on localhost:3000");
});

function createApp() {
	var app = require("express")();
	var http = require("http").Server(app);

	app.get("/", function(req, res){
		res.sendFile(__dirname + "/example.html");
	});

	var io = require('socket.io')(http);
	var txt = require("./index.js");
	io.adapter( txt({ name: "session.txt"}) );

	io.on("connection", function(socket){
		console.log('a user connected', socket.id);
		socket.on('join', function(data) {
			console.log('join', data);
			if (data.mtime) socket.joinArgs = data.mtime;
			socket.join(data.room);
			socket.on("message", function(message){
				console.log(socket.id, 'message', message);
				var now = new Date();
				var completeMessage = {
					text: message,
					mtime: now.getTime()
				};
				io.to(data.room).emit('message', completeMessage);
			});
		});

		socket.on("disconnect", function(){
			console.log("disconnect", socket.id);
		});
	});
	return http;
}
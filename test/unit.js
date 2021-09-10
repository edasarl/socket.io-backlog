const assert = require('assert');
const ClientIO = require('socket.io-client');
const backlog = require('../');

describe("backlog", function () {
	this.timeout(5000);
	const httpServer = require("http").createServer();
	let iourl = "http://";
	let master;

	const io = require('socket.io')(httpServer);
	io.adapter(backlog({
		logSize: 100,
		cacheSize: 2
	}));
	io.on("connection", function(socket) {
		socket.on('join', function (data) {
			socket.backlog(data.mtime).join(data.room);
		});
		socket.on('leave', function(data) {
			socket.leave(data.room);
		});
		socket.on("message", function (msg) {
			msg.mtime = Date.now();
			io.to(msg.room).emit('message', msg);
		});
	});

	before(function (done) {
		httpServer.listen(function () {
			const { port } = httpServer.address();
			iourl = `http://127.0.0.1:${port}`;
			master = ClientIO(iourl);
			master.on('connect', function () {
				master.emit('join', { room: '*' });
				done();
			});
		});
	});
	after(function () {
		httpServer.close();
	});

	it("should get last message", function (done) {
		master.emit({ room: 'test1', test: 1 });
		const client = ClientIO(iourl);
		client.on('connect', function () {
			client.emit('join', {room: 'test1', mtime: 0});
		});
		client.on('message', function (msg) {
			console.log(msg);
			done();
		});
	});
});

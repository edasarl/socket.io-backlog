const assert = require('assert');
const ClientIO = require('socket.io-client');
const backlog = require('../');

describe("backlog", function () {
	this.timeout(3000);
	const httpServer = require("http").createServer();
	let iourl = "http://";
	let master;

	const io = require('socket.io')(httpServer);
	io.adapter(backlog({
		logSize: 100,
		cacheSize: 10
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
		master.close();
		httpServer.close();
	});
	beforeEach(function () {
		this.client = ClientIO(iourl);
	});
	afterEach(function () {
		this.client.close();
	});



	it("should broadcast a message", function (done) {
		const client = this.client;
		client.on('connect', function () {
			client.emit('join', { room: 'test1', mtime: 0 });
			master.emit('message', { room: 'test1', test: 1 });
		});
		client.on('message', function (msg) {
			assert.strictEqual(msg.test, 1);
			done();
		});
	});

	it("should catch up a message", function (done) {
		master.emit('message', { room: 'test2', test: 2 });
		const client = this.client;
		client.on('connect', function () {
			client.emit('join', { room: 'test2', mtime: 0 });
		});
		client.on('message', function (msg) {
			assert.strictEqual(msg.test, 2);
			done();
		});
	});

	it("should catch up only last message", function (done) {
		const client = this.client;
		const room = 'test3';
		const test = 30;
		client.on('connect', function () {
			client.emit('join', { room });
			master.emit('message', { room, test });
		});
		let total = 0;
		client.on('message', function (msg) {
			total++;
			if (msg.test === test) {
				const witness = ClientIO(iourl);
				witness.on('connect', function () {
					witness.emit('join', { room, mtime: Date.now() });
					master.emit('message', { room, test: test + 1 });
				});
				witness.on('message', function (msg) {
					assert.strictEqual(msg.test, test + 1);
					assert.strictEqual(total, 2);
					witness.close();
					done();
				});
			}
		});
	});

	it("should catch up last two messages", function (done) {
		const client = this.client;
		const room = 'test4';
		const test = 40;
		const refTime = Date.now();
		client.on('connect', function () {
			client.emit('join', { room });
			master.emit('message', { room, test });
		});
		let total = 0;
		client.on('message', function (msg) {
			total++;
			if (msg.test !== test) return;
			const witness = ClientIO(iourl);
			witness.on('connect', function () {
				witness.emit('join', { room, mtime: refTime });
			});
			let count = 0;
			witness.on('message', function (msg) {
				if (count++ == 0) {
					master.emit('message', { room, test: test + 1 });
					assert.strictEqual(msg.test, test);
				} else {
					assert.strictEqual(msg.test, test + 1);
					assert.strictEqual(total, 2);
					witness.close();
					done();
				}
			});
		});
	});
});

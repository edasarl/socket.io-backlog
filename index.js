var Adapter = require("socket.io-adapter");

module.exports = adapter;

function SimpleCache(size) {
	this.size = size;
	this.cache = {};
}
SimpleCache.prototype.reset = function() {
	this.cache = {};
};
SimpleCache.prototype.resetRoom = function(room) {
	delete this.cache[room];
};
SimpleCache.prototype.get = function(room, ts) {
	return this.cache[room] ? this.cache[room].data[ts] : undefined;
};
SimpleCache.prototype.set = function(room, ts, val) {
	this.cache[room] = this.cache[room] || {size: 0, data: {}};
	var currentSize = ++this.cache[room].size;
	this.cache[room].data[ts] = val;
	if (currentSize > 2 * this.size) this.cleanRoom(room);
};
SimpleCache.prototype.cleanRoom = function(room) {
	var data = this.cache[room].data;
	var keys = Object.keys(data);
	keys.sort();
	for (var i = 0; i < keys.length - this.size; i++) {
		delete data[keys[i]];
	}
};

function adapter(option) {
	var opt = option || {};
	var peremption = opt.peremption || 24 * 3600 * 1000;
	var length = opt.length || 100;
	var cacheSize = opt.cacheSize || 30;

	function Backlog(nsp) {
		Adapter.call(this, nsp);
		this.previousMessages = {};
		this.cache = new SimpleCache(cacheSize);
		var self = this;
		function cleanOldMessages() {
			var previousMessages = self.previousMessages;
			var timeLimit = (new Date()).getTime() - peremption;
			for (var room in previousMessages) {
				var messages = previousMessages[room];
				var recentMessages = [];
				var nMessages = messages.length;
				var iMin = Math.max(0, nMessages - length);
				for (var i = iMin; i < nMessages; i++) {
					var message = messages[i];
					if (message.data[1].mtime > timeLimit) recentMessages.push(message);
				};
				previousMessages[room] = recentMessages;
			}
			self.cache.reset();
		}
		setInterval(cleanOldMessages, peremption / 2);
	}
	require('util').inherits(Backlog, Adapter);

	Backlog.prototype.broadcast = function(packet, opts, forget) {
		var rooms = opts.rooms || [];
		var except = opts.except || [];
		var flags = opts.flags || {};
		var ids = {};
		var self = this;
		var socket;

		function sendEncodedPackets(encodedPackets) {
			if (rooms.length) {
				for (var i = 0; i < rooms.length; i++) {
					var room = self.rooms[rooms[i]];
					if (!room) continue;
					for (var id in room) {
						if (room.hasOwnProperty(id)) {
							if (ids[id] || ~except.indexOf(id)) continue;
							socket = self.nsp.connected[id];
							if (socket) {
								socket.packet(encodedPackets, true, flags.volatile);
								ids[id] = true;
							}
						}
					}
				}
			} else {
				for (var id in self.sids) {
					if (self.sids.hasOwnProperty(id)) {
						if (~except.indexOf(id)) continue;
						socket = self.nsp.connected[id];
						if (socket) socket.packet(encodedPackets, true, flags.volatile);
					}
				}
			}
		}

		if (rooms.length && !forget) {
			for (var i = 0 ; i < rooms.length; i++) {
				var room = rooms[i];
				var previousRoomMessages = this.previousMessages[room];
				if (previousRoomMessages) previousRoomMessages.push(packet);
				else this.previousMessages[room] = [packet];
				this.cache.resetRoom(room);
			}
		}
		if (forget) {
			sendEncodedPackets(packet);
		} else {
			packet.nsp = this.nsp.name;
			this.encoder.encode(packet, sendEncodedPackets);
		}
	};

	Backlog.prototype.add = function(id, room, fn) {
		if (id == room) {
			var self = this;
			setImmediate(function() {
				var socket = self.nsp.connected[id];
				socket.on('join', function(data) {
					socket.joinArgs = data.mtime;
					socket.join(data.room);
				});
			});
		} else {
			var previousRoomMessages = this.previousMessages[room];
			var joinArgs = null;
			if (this.nsp.connected[id]) {
				joinArgs = this.nsp.connected[id].joinArgs;
				delete this.nsp.connected[id].joinArgs;
			}
			if (previousRoomMessages && joinArgs) {
				var cachedValue = this.cache.get(room, joinArgs);
				if (cachedValue) {
					this.broadcast(cachedValue, {rooms: [id]}, true);
				} else if (cachedValue !== null) {
					var messagesAgregate = {
						type: 2,
						data: ['message', []],
						nsp: this.nsp.name
					};

					for (var i = 0 ; i < previousRoomMessages.length; i++) {
						var message = previousRoomMessages[i];
						if (message.type != 2 || message.data[0] != 'message') {
							console.log('Wrong message format. Type is', message.type, 'and event is', message.data[0]);
							continue;
						}
						var content = message.data[1];
						if (content.mtime && content.mtime > joinArgs) {
							messagesAgregate.data[1].push(message.data[1]);
						}
					}
					if (messagesAgregate.data[1].length) {
						var self = this;
						this.encoder.encode(messagesAgregate, function(encodedPackets) {
							self.cache.set(room, joinArgs, encodedPackets);
							self.broadcast(encodedPackets, {rooms: [id]}, true);
						});
					} else {
						this.cache.set(room, joinArgs, null);
					}
				}
			}
		}
		Adapter.prototype.add.call(this, id, room, fn);
	};
	return Backlog;
}
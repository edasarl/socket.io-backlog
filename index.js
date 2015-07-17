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

function compare(a, b) {
	return parseInt(a, 10) - parseInt(b, 10);
}

SimpleCache.prototype.cleanRoom = function(room) {
	var data = this.cache[room].data;
	var keys = Object.keys(data);
	var iMax = keys.length - this.size;
	for (var i = 0; i < iMax; i++) {
	keys.sort(compare);
		delete data[keys[i]];
	}
	this.cache[room].size = this.size;
};

function adapter(option) {
	var opt = option || {};
	var length = opt.length || 100;
	var cacheSize = opt.cacheSize || 30;

	function Backlog(nsp) {
		Adapter.call(this, nsp);
		this.previousMessages = {};
		this.cache = new SimpleCache(cacheSize);
	}
	require('util').inherits(Backlog, Adapter);

	Backlog.prototype.cleanOldMessages = function(room) {
		var messages = this.previousMessages[room];
		if (messages.length > 2 * length) {
			this.previousMessages[room] = messages.slice(-length);
		}
	};

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

		if (rooms.length && !forget && packet.data[1].mtime) {
			for (var i = 0 ; i < rooms.length; i++) {
				var room = rooms[i];
				var previousRoomMessages = this.previousMessages[room];
				if (previousRoomMessages) {
					previousRoomMessages.push(packet);
					this.cleanOldMessages(room);
				} else {
					this.previousMessages[room] = [packet];
				}
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
		var socket = this.nsp.connected[id];
		if (id == room) {
			if (!socket) {
				// socket.io without https://github.com/Automattic/socket.io/commit/42540994
				socket = this.nsp.sockets[this.nsp.sockets.length - 1];
			}
			if (!socket.backlog) socket.backlog = function(mtime) {
				this.backlog.mtime = mtime;
				return this;
			};
		} else {
			var previousRoomMessages = this.previousMessages[room];
			var mtime = socket && socket.backlog && socket.backlog.mtime;
			if (previousRoomMessages && mtime) {
				var self = this;
				var cachedValue = this.cache.get(room, mtime);
				if (!cachedValue) {
					cachedValue = [];
					var message;
					(function build(i) {
						message = previousRoomMessages[i];
						if (i < 0 || message.data[1].mtime <= mtime) {
							cachedValue.reverse();
							self.cache.set(room, mtime, cachedValue);
						} else {
							self.encoder.encode(message, function(encodedPackets) {
								cachedValue.push(encodedPackets);
								build(i - 1);
							});
						}
					})(previousRoomMessages.length - 1);
				}
				cachedValue.forEach(function(elt) {
					self.broadcast(elt, {rooms: [id]}, true);
				});
			}
		}
		Adapter.prototype.add.call(this, id, room, fn);
	};
	return Backlog;
}

const { Adapter } = require("socket.io-adapter");
const SimpleCache = require('./src/cache');

module.exports = class Backlog extends Adapter {
	constructor(nsp, { cacheSize = 30, keyStamp = 'mtime', logSize = 100 } = {}) {
		super(nsp);
		this.previousMessages = {};
		this.cache = new SimpleCache(cacheSize);
		this.keyStamp = keyStamp;
		this.logSize = logSize;
	}
	cleanOldMessages(room) {
		const messages = this.previousMessages[room];
		if (messages.length > 2 * this.logSize) {
			messages.splice(0, messages.length - this.logSize);
		}
	}

	broadcast(packet, { rooms = [], except = [], flags = {} }, forget) {
		const packetOpts = {
			preEncoded: true,
			volatile: flags.volatile,
			compress: flags.compress
		};
		const ids = {};
		const self = this;
		let socket;

		function sendEncodedPackets(encodedPackets) {
			if (rooms.length) {
				for (const key of rooms) {
					const room = self.rooms[key];
					if (!room) continue;
					const sockets = room.sockets;
					for (const id in sockets) {
						if (Object.prototype.hasOwnProperty.call(sockets, id)) {
							if (ids[id] || except.indexOf(id) !== -1) continue;
							socket = self.nsp.connected[id];
							if (socket) {
								socket.packet(encodedPackets, packetOpts);
								ids[id] = true;
							}
						}
					}
				}
			} else {
				for (const id in self.sids) {
					if (Object.prototype.hasOwnProperty.call(self.sids, id)) {
						if (except.indexOf(id) === -1) continue;
						socket = self.nsp.connected[id];
						if (socket) socket.packet(encodedPackets, packetOpts);
					}
				}
			}
		}

		if (rooms.length && !forget && packet.data[1][this.keyStamp]) {
			for (const key of rooms) {
				const previousRoomMessages = this.previousMessages[key];
				if (previousRoomMessages) {
					previousRoomMessages.push(packet);
					this.cleanOldMessages(key);
				} else {
					this.previousMessages[key] = [packet];
				}
				this.cache.resetRoom(key);
			}
		}
		if (forget) {
			sendEncodedPackets(packet);
		} else {
			packet.nsp = this.nsp.name;
			this.encoder.encode(packet, sendEncodedPackets);
		}
	}

	addAll(id, rooms, fn) {
		for (const key of rooms) {
			this.backlogJoin(id, key);
		}
		super.addAll(id, rooms, fn);
	}

	backlogJoin(id, room) {
		const socket = this.nsp.connected[id];
		if (id == room) {
			if (!socket.backlog) socket.backlog = function (mstamp) {
				this.backlog.mstamp = parseStamp(mstamp);
				return this;
			};
		} else {
			const previousRoomMessages = this.previousMessages[room];
			const mstamp = socket && socket.backlog && socket.backlog.mstamp;
			if (previousRoomMessages && mstamp) {
				let cachedValue = this.cache.get(room, mstamp);
				if (!cachedValue) {
					cachedValue = [];
					let message;
					const build = (i) => {
						message = previousRoomMessages[i];
						if (i < 0 || parseStamp(message.data[1][this.keyStamp]) <= mstamp) {
							cachedValue.reverse();
							this.cache.set(room, mstamp, cachedValue);
						} else {
							this.encoder.encode(message, function (encodedPackets) {
								cachedValue.push(encodedPackets);
								build(i - 1);
							});
						}
					};
					build(previousRoomMessages.length - 1);
				}
				for (const elt of cachedValue) {
					this.broadcast(elt, { rooms: [id] }, true);
				}
			}
		}
	}
};

function parseStamp(st) {
	if (st == null) return st;
	switch(typeof st) {
		case "string": return Date.parse(st);
		case "date": return st.getTime();
		case "number": return st;
		default: throw new Error("Unusable stamp " + st);
	}
}


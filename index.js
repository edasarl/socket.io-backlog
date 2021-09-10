const { Adapter } = require("socket.io-adapter");
const SimpleCache = require('./src/cache');

module.exports = createBacklog;
class Backlog extends Adapter {
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

	broadcast(packet, opts, forget) {
		const { rooms } = opts;
		if (rooms.size && !forget && packet.data[1][this.keyStamp]) {
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
		return super.broadcast(packet, opts);
	}

	addAll(id, rooms, fn) {
		for (const key of rooms) {
			this.backlogJoin(id, key);
		}
		super.addAll(id, rooms, fn);
	}

	backlogJoin(id, room) {
		const socket = this.nsp.sockets.get(id);
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
					for (let i = previousRoomMessages.length - 1; i >= 0; i--) {
						const msg = previousRoomMessages[i];
						if (parseStamp(msg.data[1][this.keyStamp]) <= mstamp) { // FIXME mstamp comes from the client socket ! it is hackable so easily !
							this.cache.set(room, mstamp, cachedValue);
							break;
						} else {
							cachedValue.unshift(msg);
						}
					}
				}
				for (const msg of cachedValue) socket.packet(msg);
			}
		}
	}
}

function parseStamp(st) {
	if (st == null) return st;
	switch(typeof st) {
		case "string": return Date.parse(st);
		case "date": return st.getTime();
		case "number": return st;
		default: throw new Error("Unusable stamp " + st);
	}
}

function createBacklog(opts) {
	return function (nsp) {
		return new Backlog(nsp, opts);
	};
}

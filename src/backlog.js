const { Adapter } = require("socket.io-adapter");
const SimpleCache = require('./cache');

module.exports = createBacklog;

class Backlog extends Adapter {
	constructor(nsp, { cacheSize = 30, keyStamp = 'mtime', logSize = 100 } = {}) {
		super(nsp);
		this.messages = {};
		this.cache = new SimpleCache(cacheSize);
		this.keyStamp = keyStamp;
		this.logSize = logSize;
	}
	gc(key) {
		const messages = this.messages[key];
		if (messages.length > 2 * this.logSize) {
			messages.splice(0, messages.length - this.logSize);
		}
	}

	broadcast(packet, opts, forget) {
		const { rooms } = opts;
		if (rooms.size && !forget && packet.data[1][this.keyStamp]) {
			for (const key of rooms) {
				const messages = this.messages[key];
				if (messages) {
					messages.push(packet);
					this.gc(key);
				} else {
					this.messages[key] = [packet];
				}
				this.cache.resetRoom(key);
			}
		}
		return super.broadcast(packet, opts);
	}

	addAll(id, rooms, fn) {
		const { sockets } = this.nsp;
		for (const key of rooms) {
			const socket = sockets.get(id);
			if (!socket) continue;
			if (id === key) {
				if (!socket.backlog) socket.backlog = function (mstamp) {
					this.backlog.mstamp = parseStamp(mstamp);
					return this;
				};
			} else {
				if (socket.backlog) this.backlogJoin(socket, key);
			}
		}
		super.addAll(id, rooms, fn);
	}

	backlogJoin(socket, room) {
		const messages = this.messages[room];
		if (messages == null) return;
		const { mstamp } = socket.backlog;
		if (mstamp == null) return;
		let cachedValue = this.cache.get(room, mstamp);
		if (!cachedValue) {
			cachedValue = [];
			for (let i = messages.length - 1; i >= 0; i--) {
				const msg = messages[i];
				if (parseStamp(msg.data[1][this.keyStamp]) <= mstamp) {
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

function parseStamp(st) {
	if (st == null) return 0;
	switch(typeof st) {
		case "string": return Date.parse(st);
		case "date": return st.getTime();
		case "number": return st;
		default: return 0;
	}
}

function createBacklog(opts) {
	return function (nsp) {
		return new Backlog(nsp, opts);
	};
}

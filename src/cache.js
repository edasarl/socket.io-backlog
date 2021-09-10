module.exports = class SimpleCache {
	constructor(size) {
		this.size = size;
		this.cache = {};
	}
	reset() {
		this.cache = {};
	}
	resetRoom(room) {
		delete this.cache[room];
	}
	get(room, ts) {
		// FIXME ts is at high resolution, we want at least a 30 seconds window
		return this.cache[room] ? this.cache[room].data[ts] : undefined;
	}
	set(room, ts, val) {
		let obj = this.cache[room];
		if (!obj) obj = this.cache[room] = { size: 0, data: {} };
		const currentSize = ++obj.size;
		obj.data[ts] = val;
		if (currentSize > 2 * this.size) this.cleanRoom(room);
	}

	cleanRoom(room) {
		const obj = this.cache[room];
		const data = obj.data;
		const keys = Object.keys(data);
		keys.sort(function(a, b) {
			return parseInt(a) - parseInt(b);
		});
		for (let i = keys.length - this.size - 1; i >= 0; i--) {
			data[keys[i]] = null;
		}
		obj.size = this.size;
	}
};

var inherits = require("inherits");
var Adapter = require("socket.io-adapter");

module.exports = adapter;

function adapter(option) {
	var opt = option || {};

	function Text(nsp) {
		Adapter.call(this, nsp);
		this.previousMessages = {};
	}
	inherits(Text, Adapter);

	Text.prototype.broadcast = function(packet, opts, forget) {
		var rooms = opts.rooms;
		if (rooms && !forget) {
			for (var i = 0 ; i < rooms.length; i++) {
				var room = rooms[i];
				var previousRoomMessages = this.previousMessages[room];
				if (previousRoomMessages) previousRoomMessages.push(packet);
				else this.previousMessages[room] = [packet];
			}
		}
		Adapter.prototype.broadcast.call(this, packet, opts);
	};

	Text.prototype.add = function(id, room, fn) {
		var previousRoomMessages = this.previousMessages[room];
		if (previousRoomMessages) {
			var joinArgs = this.nsp.connected[id].joinArgs;
			if (joinArgs) {
				delete this.nsp.connected[id].joinArgs;
				var messagesAgregate = {
					type: 2,
					data: ['message', []],
					nsp: this.nsp
				};

				for (var i = 0 ; i < previousRoomMessages.length; i++) {
					var message = previousRoomMessages[i];
					var content = message.data[1];
					if (content.mtime && content.mtime > joinArgs) {
						messagesAgregate.data[1].push(message.data[1]);
					}
				}
				this.broadcast(messagesAgregate, {rooms: [id]}, true);
			} else {
				for (var i = 0 ; i < previousRoomMessages.length; i++) {
					this.broadcast(previousRoomMessages[i], {rooms: [id]}, true);
				}
			}
		}
		Adapter.prototype.add.call(this, id, room, fn);
	};
	return Text;
}


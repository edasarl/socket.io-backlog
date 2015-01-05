var Adapter = require("socket.io-adapter");

module.exports = adapter;

function adapter(option) {
	var opt = option || {};
	var peremption = opt.peremption || 24 * 3600 * 1000;
	var length = opt.length || 100;

	function Backlog(nsp) {
		Adapter.call(this, nsp);
		this.previousMessages = {};
		var self = this;
		function cleanOldMessages() {
			var previousMessages = self.previousMessages;
			var timeLimit = (new Date()).getTime() - peremption;
			for(var room in previousMessages) {
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
		}
		setInterval(cleanOldMessages, peremption / 2);
	}
	require('util').inherits(Backlog, Adapter);

	Backlog.prototype.broadcast = function(packet, opts, forget) {
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

	Backlog.prototype.add = function(id, room, fn) {
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
				if (messagesAgregate.data[1].length) this.broadcast(messagesAgregate, {rooms: [id]}, true);
			}
		}
		Adapter.prototype.add.call(this, id, room, fn);
	};
	return Backlog;
}


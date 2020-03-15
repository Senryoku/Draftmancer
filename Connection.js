'use strict'

let Connections = {};
function Connection(socket, userID, userName) {
	this.socket = socket;
	this.userID = userID;
	this.userName = userName;
	this.sessionID = null;
	this.collection = {};
	this.useCollection = true;
	
	this.pickedThisRound = false;
	this.pickedCards = [];
};

module.exports.Connections = Connections; 
module.exports.Connection = Connection;
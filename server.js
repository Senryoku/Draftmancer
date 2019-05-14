"use strict";

const express = require('express'); 
const app = express();
const http = require('http').Server(app);
const io = require('socket.io')(http);
const cookieParser = require('cookie-parser');
const uuidv1 = require('uuid/v1');
  
app.use(cookieParser()); 

function Session(id) {
	this.id = id;
	this.users = new Set();
	this.collection = function () {
		// Compute collections intersection
		let intersection = {};
		for(let user of this.users) {
			if(Connections[user].collection) {
				for(let c in Connections[user].collection) {
					if(c in intersection)
						intersection[c] = Math.min(intersection[c], Connections[user].collection[c]);
					else
						intersection[c] = Connections[user].collection[c];
				}
			}
		}
		return intersection;
	};
	this.drafting = false;
	this.boostersPerPlayer = 3;
	this.boosters = [];
}

let Sessions = {};
let Connections = {};

function isEmpty(obj) {
	return Object.entries(obj).length === 0 && obj.constructor === Object;
}

io.on('connection', function(socket) {
	const query = socket.handshake.query;
	log(`${query.userName} [${query.userID}] connected.`);
	
	Connections[query.userID] = {
		socket: socket,
		userID: query.userID,
		userName: query.userName,
		sessionID: query.sessionID,
		readyToDraft: false,
		collection: {}
	};
	addUserToSession(query.userID, query.sessionID);
	
	socket.userID = query.userID;
	
	// Messages
	
	socket.on('disconnect', function() {
		let userID = query.userID;
		log(`${Connections[userID].userName} [${userID}] disconnected.`, FgRed);
		removeUserFromSession(userID, Connections[userID].sessionID);
		delete Connections[userID];
	});
	
	socket.on('setCollection', function(collection) {
		let userID = query.userID;
		let sessionID = Connections[userID].sessionID;
		Connections[userID].collection = collection;
		notifyUserChange(sessionID);
	});
	
	socket.on('boostersPerPlayer', function(boostersPerPlayer) {
		let sessionID = Connections[this.userID].sessionID;
		Sessions[sessionID].boostersPerPlayer = boostersPerPlayer;
		for(let user of Sessions[sessionID].users) {
			Connections[user].socket.emit('boostersPerPlayer', boostersPerPlayer);
		}
	});
	
	socket.on('readyToDraft', function(readyToDraft) {
		let userID = query.userID;
		let sessionID = Connections[userID].sessionID;
		Connections[userID].readyToDraft = readyToDraft;
		notifyUserChange(sessionID);
		
		let allReady = true;
		for(let user of Sessions[sessionID].users) {
			if(!Connections[user].readyToDraft) {
				allReady = false;
				break;
			}
		}
		
		if(allReady) {
			startDraft(sessionID);
		}
	});
	
	socket.on('pickCard', function(sessionID, cardID) {
		let userID = query.userID;
		log(`${Connections[userID].userName} [${userID}] picked card ${cardID}.`);
		for(let user of Sessions[sessionID].users) {
			Connections[user].socket.emit('signalPick', userID);
		}
	});
});

function startDraft(sessionID) {
	let sess = Sessions[sessionID];
	sess.drafting = true;
	let booster = [];
	
	let collection = sess.collection();
	
	// Generate Boosters
	for(let i = 0; i < sess.users.length * sess.boostersPerPlayer; ++i) {
	}
	
	for(let user of Sessions[sessionID].users) {
		Connections[user].socket.emit('startDraft');
		Connections[user].socket.emit('nextBooster', booster);
	}
}

// Serve files in the public directory
app.use(express.static(__dirname + '/public/'));

app.get('/getUserID', (req, res) => {
	if(!req.cookies.userID)
		res.cookie("userID", uuidv1());
	res.send(req.cookies.userID);
});

app.get('/getUserName', (req, res) => {
	if(!req.cookies.userName)
		res.cookie("userName", "Anon");
	res.send(req.cookies.userName);
});

app.get('/setUserName/:userName', (req, res) => {
	if(!req.params.userName) {
		res.sendStatus(400);
	} else {
		log('New userName: '+req.params.userName);
		Connections[req.cookies.userID].userName = req.params.userName;
		res.cookie("userName", req.params.userName);
		res.sendStatus(200);
		
		notifyUserChange(req.cookies.sessionID);
	}
});

app.get('/getSession', (req, res) => {
	if(!req.cookies.sessionID)
		res.cookie("sessionID", uuidv1());
	res.send(req.cookies.sessionID);
});

app.get('/setSession/:id', (req, res) => {
	if(!req.params.id) {
		res.sendStatus(400);
	} else {
		removeUserFromSession(getUserID(req, res), req.cookies.sessionID);
		addUserToSession(getUserID(req, res), req.params.id);
		res.cookie("sessionID", req.params.id);
		res.sendStatus(200);
	}
});

app.get('/getCollection', (req, res) => {
	if(!req.cookies.sessionID)
		res.sendStatus(400);
	else
		res.send(Sessions[req.cookies.sessionID].collection());
});

app.get('/getCollection/:id', (req, res) => {
	if(!req.params.id) {
		res.sendStatus(400);
	} else {
		res.send(Sessions[req.params.id].collection());
	}
});

app.get('/getUsers/:sessionID', (req, res) => {
	res.send(JSON.stringify([...Sessions[req.params.sessionID].users]));
	res.sendStatus(200);
});

http.listen(3000, (err) => { 
	if(err) 
		throw err; 
	console.log('listening on port 3000'); 
}); 

function getUserID(req, res) {
	if(!req.cookies.userID) {
		let ID = uuidv1();
		res.cookie("userID", ID);
		return ID;
	} else {
		return req.cookies.userID;
	}
}

// Remove user from previous session and cleanup if empty
function removeUserFromSession(userID, sessionID) {
	if(sessionID in Sessions) {
		Sessions[sessionID].users.delete(userID);
		if(Sessions[sessionID].users.size == 0)
			delete Sessions[sessionID];
		else
			notifyUserChange(sessionID);
	}
}

function addUserToSession(userID, sessionID) {
	if(sessionID in Sessions) {
		Sessions[sessionID].users.add(userID)
	} else {
		Sessions[sessionID] = new Session(sessionID);
		Sessions[sessionID].users.add(userID);
	}
	notifyUserChange(sessionID);
}

function notifyUserChange(sessionID) {
	// Send only necessary data
	let user_info = [];
	for(let user of Sessions[sessionID].users) {
		let u = Connections[user];
		user_info.push({
			userID: u.userID, 
			userName: u.userName,
			collection: u.collection,
			readyToDraft: u.readyToDraft
		});
	}
	
	// Send to all session users
	for(let user of Sessions[sessionID].users) {
		Connections[user].socket.emit('sessionUsers', JSON.stringify(user_info));
	}
}

// Log helper

function log(text, color = Reset) {
	console.log(color + text + '\x1b[0m');
}

const Reset = "\x1b[0m"
const Bright = "\x1b[1m"
const Dim = "\x1b[2m"
const Underscore = "\x1b[4m"
const Blink = "\x1b[5m"
const Reverse = "\x1b[7m"
const Hidden = "\x1b[8m"

const FgBlack = "\x1b[30m"
const FgRed = "\x1b[31m"
const FgGreen = "\x1b[32m"
const FgYellow = "\x1b[33m"
const FgBlue = "\x1b[34m"
const FgMagenta = "\x1b[35m"
const FgCyan = "\x1b[36m"
const FgWhite = "\x1b[37m"

const BgBlack = "\x1b[40m"
const BgRed = "\x1b[41m"
const BgGreen = "\x1b[42m"
const BgYellow = "\x1b[43m"
const BgBlue = "\x1b[44m"
const BgMagenta = "\x1b[45m"
const BgCyan = "\x1b[46m"
const BgWhite = "\x1b[47m"

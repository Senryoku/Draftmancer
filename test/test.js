'use strict'

let rewire = require("rewire");
let expect = require('chai').expect
let server = rewire('../server') // Rewire exposes internal variables of the module

const NODE_PORT = process.env.NODE_PORT || 3000

let io = require('socket.io-client')
const ioOptions = { 
	transports: ['websocket'], 
	forceNew: true, 
	reconnection: false
};

function connectClient(query) {
	let r = io(`http://localhost:${NODE_PORT}`, Object.assign({query: query}, ioOptions));
	r.on('alreadyConnected', function(newID) {
		this.query.userID = newID;
	});
	return r;
}

let outputbuffer;
function disableLogs() {
	outputbuffer = "";
	console.log = console.debug = console.warn = function(msg) { 
		outputbuffer += msg+'\n';
	};
}
function enableLogs(print) {
	delete console.log;
	delete console.debug;
	delete console.warn;
	if (print && outputbuffer != "") {
		console.log('--- Delayed Output ---------------------------------------------------------');
		console.log(outputbuffer);
		console.log('----------------------------------------------------- Delayed Output End ---');
	}
}

describe('Inter client communication', function() {
	let sender, receiver;
	
    beforeEach(function(done) {
		disableLogs();
		done();
	});
	
	afterEach(function(done) {
		enableLogs(this.currentTest.state == 'failed');
		done();
	});

	before(function(done) {
		disableLogs();
		const Connections = server.__get__("Connections");
		expect(Object.keys(Connections).length).to.equal(0);
		sender = connectClient({
			userID: 'sender', 
			sessionID: 'sessionID',
			userName: 'sender'
		});
		receiver = connectClient({
			userID: 'receiver', 
			sessionID: 'sessionID',
			userName: 'receiver'
		});
		enableLogs(false);
		done();
	});

	after(function(done) {
		sender.disconnect()
		sender.close()
		receiver.disconnect()
		receiver.close()
		// Wait for the sockets to be disconnected, I haven't found another way...
		setTimeout(function() {
			const Connections = server.__get__("Connections");
			expect(Object.keys(Connections).length).to.equal(0);
			done();
		}, 250);
	});

	describe('Chat Events', function() {
		const text = 'Text Value';
		it('Clients should receive a message when the `chatMessage` event is emited.', function(done) {
		  sender.emit('chatMessage', {text: text})
		  receiver.on('chatMessage', function(msg){
			expect(msg.text).to.equal(text);
			done();
		  });
		});
	});

	describe('Personal options updates', function() {
		it('Clients should receive the updated userName when a user changes it.', function(done) {
		  sender.emit('setUserName', 'senderUpdatedUserName')
		  receiver.on('updateUser', function(data) {
			expect(data.userID).to.equal('sender');
			expect(data.updatedProperties.userName).to.equal('senderUpdatedUserName');
			this.removeListener('updateUser');
			done()
		  });
		});
		it('Clients should receive the updated useCollection status.', function(done) {
		  sender.emit('useCollection', false);
		  receiver.on('updateUser', function(data) {
			expect(data.userID).to.equal('sender');
			expect(data.updatedProperties.useCollection).to.equal(false);
			this.removeListener('updateUser');
			done();
		  });
		});
		it('Clients should NOT receive an update if the option is not actually changed.', function(done) {
			this.timeout(200 + 100);
			let timeout = setTimeout(() => {
				receiver.removeListener('updateUser');
				done();
			}, 200); 
			sender.emit('useCollection', false);
			receiver.on('updateUser', () => {
				clearTimeout(timeout);
				this.removeListener('updateUser');
				done(new Error('Unexpected Call'));
			});
		});
		it('Clients should receive the updated useCollection status.', function(done) {
		  sender.emit('useCollection', true);
		  receiver.on('updateUser', function(data) {
			expect(data.userID).to.equal('sender');
			expect(data.updatedProperties.useCollection).to.equal(true);
			this.removeListener('updateUser');
			done();
		  });
		});
	});
});

describe('Single Draft', function() {
	let clients = [];
	let sessionID = 'sessionID';
	
    beforeEach(function(done) {
		disableLogs();
		done();
	});
	
	afterEach(function(done) {
		enableLogs(this.currentTest.state == 'failed');
		done();
	});
	
	before(function(done) {
		disableLogs();
		const Connections = server.__get__("Connections");
		expect(Object.keys(Connections).length).to.equal(0);
		clients.push(connectClient({
			userID: 'sameID', 
			sessionID: sessionID,
			userName: 'Client1'
		}));
		clients.push(connectClient({
			userID: 'sameID', 
			sessionID: sessionID,
			userName: 'Client2'
		}));

		// Wait for all clients to be connected
		let connectedClients = 0;
		for(let c of clients) {
			c.on('connect', function() {
				connectedClients += 1;
				if(connectedClients == clients.length) {
					enableLogs(false);
					done();
				}
			});
		}
	});

	after(function(done) {
		for(let c of clients) {
			c.disconnect();
			c.close();
		}
		// Wait for the sockets to be disconnected, I haven't found another way...
		setTimeout(function() {
			const Connections = server.__get__("Connections");
			expect(Object.keys(Connections).length).to.equal(0);
			done();
		}, 250);
	});
	
	it('A user with userID "sameID" should be connected.', function(done) {
		const Connections = server.__get__("Connections");
		expect(Connections).to.have.property('sameID');
		done();
	});

	it('2 clients with different userID should be connected.', function(done) {
		const Connections = server.__get__("Connections");
		expect(Object.keys(Connections).length).to.equal(2);
		done();
	});

	it('3 clients with different userID should be connected.', function(done) {
		let idx = clients.push(io('http://localhost:3000/', Object.assign({query: {
			userID: 'sameID', 
			sessionID: sessionID,
			userName: 'Client3'
		}}, ioOptions)));
		
		clients[idx - 1].on('connect', function() {
			const Connections = server.__get__("Connections");
			expect(Object.keys(Connections).length).to.equal(3);
			done();
		});
	});
	
	it('First client should be the session owner', function(done) {
		const Sessions = server.__get__("Sessions");
		expect(Sessions[sessionID].owner).to.equal('sameID');
		done();
	});
	
	it('When session owner launch draft, everyone should receive a startDraft event', function(done) {
		clients[0].emit('startDraft');
		let connectedClients = 0;
		for(let c of clients) {
			c.on('startDraft', function() {
				connectedClients += 1;
				if(connectedClients == clients.length)
					done();
			});
		}
	});
});

describe('Multiple Drafts', function() {
	let clients = [];
	let sessionIDs = [];
	const sessionCount = 4;
	const playersPerSession = 7;
	
    beforeEach(function(done) {
		disableLogs();
		done();
	});
	
	afterEach(function(done) {
		enableLogs(this.currentTest.state == 'failed');
		done();
	});
	
	before(function(done) {
		disableLogs();
		const Connections = server.__get__("Connections");
		expect(Object.keys(Connections).length).to.equal(0);
		for(let sess = 0; sess < sessionCount; ++sess) {
			sessionIDs[sess] = `Session ${sess}`;
			clients[sess] = [];
			for(let i = 0; i < playersPerSession; ++i) {
				clients[sess].push(connectClient({
					userID: 'sameID', 
					sessionID: sessionIDs[sess],
					userName: `Client ${sess * playersPerSession + i}`
				}));
			}
		}
		
		// Wait for all clients to be connected
		let connectedClients = 0;
		for(let s of clients) {
			for(let c of s) {
				c.on('connect', function() {
					connectedClients += 1;
					if(connectedClients == playersPerSession * clients.length) {
						enableLogs(false);
						done();
					}
				});
			}
		}
	});

	after(function(done) {
		for(let s of clients)
			for(let c of s) {
				c.disconnect();
				c.close();
			}
		// Wait for the sockets to be disconnected, I haven't found another way...
		setTimeout(function() {
			const Connections = server.__get__("Connections");
			expect(Object.keys(Connections).length).to.equal(0);
			done();
		}, 250);
	});
	
	it(`${sessionCount} sessions should be live.`, function(done) {
		const Sessions = server.__get__("Sessions");
		expect(Object.keys(Sessions).length).to.equal(sessionCount);
		done();
	});
	
	it(`${playersPerSession * sessionCount} players should be connected.`, function(done) {
		const Connections = server.__get__("Connections");
		expect(Object.keys(Connections).length).to.equal(playersPerSession * sessionCount);
		done();
	});
	
	let boosters = [];
	it('When session owner launch draft, everyone in session should receive a startDraft event, and a unique booster', function(done) {
		let sessionsCorrectlyStartedDrafting = 0;
		let receivedBoosters = 0;
		for(let [sessionIdx, sessionClients] of clients.entries()) {
			(() => {
				let connectedClients = 0;
				for(let c of sessionClients) {
					c.on('startDraft', function() {
						connectedClients += 1;
						if(connectedClients == sessionClients.length)
							sessionsCorrectlyStartedDrafting += 1;
					});
					
					c.on('nextBooster', function(data) {
						expect(boosters).not.include(data);
						boosters.push(data);
						c.removeListener('nextBooster');
						if(sessionsCorrectlyStartedDrafting == sessionCount && boosters.length == playersPerSession * sessionCount)
							done();
					});
				}
				const Sessions = server.__get__("Sessions");
				let ownerIdx = sessionClients.findIndex(c => c.query.userID == Sessions[sessionIDs[sessionIdx]].owner);
				sessionClients[ownerIdx].emit('startDraft');
			})();
		}
	});
	
	it('New players should not be able to join once drafting has started', function(done) {
		let newClient = io('http://localhost:3000/', Object.assign({query: {
			userID: 'sameID', 
			sessionID: sessionIDs[0],
			userName: `New Client`
		}}, ioOptions));
		
		newClient.on('setSession', function(newSessionID) {
			expect(newSessionID).to.not.equal(sessionIDs[0]);
			const Sessions = server.__get__("Sessions");
			expect(Sessions[sessionIDs[0]].users.size).to.equal(playersPerSession);
			newClient.disconnect();
			done();
		});
	});
		
	it('Once everyone in a session has picked a card, receive next boosters.', function(done) {
		let receivedBoosters = 0;
		for(let sess = 0; sess < clients.length; ++sess) {
			for(let c = 0; c < clients[sess].length; ++c) {
				clients[sess][c].on('nextBooster', function(data) {
					receivedBoosters += 1;
					let idx = (() => playersPerSession * sess + c)();
					expect(data.booster.length).to.equal(boosters[idx].booster.length - 1);
					boosters[idx] = data;
					this.removeListener('nextBooster');
					if(receivedBoosters == playersPerSession * sessionCount)
						done();
				});
				clients[sess][c].emit('pickCard', boosters[playersPerSession * sess + c].boosterIndex, boosters[playersPerSession * sess + c].booster[0]);
			}
		}
	});
		
	it('Do it enough times, and all the drafts should end.', function(done) {
		this.timeout(20000);
		let draftEnded = 0;
		for(let sess = 0; sess < clients.length; ++sess) {
			for(let c = 0; c < clients[sess].length; ++c) {
				clients[sess][c].on('nextBooster', function(data) {
					let idx = (() => playersPerSession * sess + c)();
					boosters[idx] = data.booster;
					this.emit('pickCard', c, boosters[idx][0]);
				});
				clients[sess][c].on('endDraft', function() {
					draftEnded += 1;
					this.removeListener('endDraft');
					this.removeListener('nextBooster');
					if(draftEnded == playersPerSession * sessionCount)
						done();
				});
			}
		}
		for(let sess = 0; sess < clients.length; ++sess) {
			for(let c = 0; c < clients[sess].length; ++c) {
				clients[sess][c].emit('pickCard', boosters[playersPerSession * sess + c].boosterIndex, boosters[playersPerSession * sess + c].booster[0]);
			}
		}
	});
});

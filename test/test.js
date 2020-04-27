"use strict";

let rewire = require("rewire");
let expect = require("chai").expect;
let server = rewire("../server"); // Rewire exposes internal variables of the module
const Cards = require("./../Cards");
const randomjs = require("random-js");

const NODE_PORT = process.env.NODE_PORT || 3000;

let io = require("socket.io-client");
const ioOptions = {
	transports: ["websocket"],
	forceNew: true,
	reconnection: false,
};

function connectClient(query) {
	let r = io(`http://localhost:${NODE_PORT}`, Object.assign({ query: query }, ioOptions));
	r.on("alreadyConnected", function (newID) {
		this.query.userID = newID;
	});
	return r;
}

let outputbuffer;
function disableLogs() {
	outputbuffer = "";
	console.log = console.debug = console.warn = function () {
		for (var i = 0; i < arguments.length; i++) outputbuffer += arguments[i];
		outputbuffer += "\n";
	};
}
function enableLogs(print) {
	delete console.log;
	delete console.debug;
	delete console.warn;
	if (print && outputbuffer != "") {
		console.log("--- Delayed Output ---------------------------------------------------------");
		console.log(outputbuffer);
		console.log("----------------------------------------------------- Delayed Output End ---");
	}
}

describe("Inter client communication", function () {
	let sender, receiver;

	beforeEach(function (done) {
		disableLogs();
		done();
	});

	afterEach(function (done) {
		enableLogs(this.currentTest.state == "failed");
		done();
	});

	before(function (done) {
		disableLogs();
		const Connections = server.__get__("Connections");
		expect(Object.keys(Connections).length).to.equal(0);
		sender = connectClient({
			userID: "sender",
			sessionID: "sessionID",
			userName: "sender",
		});
		receiver = connectClient({
			userID: "receiver",
			sessionID: "sessionID",
			userName: "receiver",
		});
		enableLogs(false);
		done();
	});

	after(function (done) {
		disableLogs();
		sender.disconnect();
		sender.close();
		receiver.disconnect();
		receiver.close();
		// Wait for the sockets to be disconnected, I haven't found another way...
		setTimeout(function () {
			const Connections = server.__get__("Connections");
			expect(Object.keys(Connections).length).to.equal(0);
			enableLogs(false);
			done();
		}, 250);
	});

	describe("Chat Events", function () {
		const text = "Text Value";
		it("Clients should receive a message when the `chatMessage` event is emited.", function (done) {
			sender.emit("chatMessage", { text: text });
			receiver.on("chatMessage", function (msg) {
				expect(msg.text).to.equal(text);
				done();
			});
		});
	});

	describe("Personal options updates", function () {
		it("Clients should receive the updated userName when a user changes it.", function (done) {
			sender.emit("setUserName", "senderUpdatedUserName");
			receiver.on("updateUser", function (data) {
				expect(data.userID).to.equal("sender");
				expect(data.updatedProperties.userName).to.equal("senderUpdatedUserName");
				this.removeListener("updateUser");
				done();
			});
		});
		it("Clients should receive the updated useCollection status.", function (done) {
			sender.emit("useCollection", false);
			receiver.on("updateUser", function (data) {
				expect(data.userID).to.equal("sender");
				expect(data.updatedProperties.useCollection).to.equal(false);
				this.removeListener("updateUser");
				done();
			});
		});
		it("Clients should NOT receive an update if the option is not actually changed.", function (done) {
			this.timeout(200 + 100);
			let timeout = setTimeout(() => {
				receiver.removeListener("updateUser");
				done();
			}, 200);
			sender.emit("useCollection", false);
			receiver.on("updateUser", () => {
				clearTimeout(timeout);
				this.removeListener("updateUser");
				done(new Error("Unexpected Call"));
			});
		});
		it("Clients should receive the updated useCollection status.", function (done) {
			sender.emit("useCollection", true);
			receiver.on("updateUser", function (data) {
				expect(data.userID).to.equal("sender");
				expect(data.updatedProperties.useCollection).to.equal(true);
				this.removeListener("updateUser");
				done();
			});
		});
		it("Clients should receive the updated userName.", function (done) {
			sender.emit("setUserName", "Sender New UserName");
			receiver.on("updateUser", function (data) {
				expect(data.userID).to.equal("sender");
				expect(data.updatedProperties.userName).to.equal("Sender New UserName");
				this.removeListener("updateUser");
				done();
			});
		});
		it("Clients should receive the updated maxDuplicates.", function (done) {
			const newMaxDuplicates = { common: 5, uncommon: 4, rare: 1, mythic: 1 };
			sender.emit("setMaxDuplicates", newMaxDuplicates);
			receiver.on("sessionOptions", function (options) {
				expect(options.maxDuplicates).to.eql(newMaxDuplicates);
				this.removeListener("sessionOptions");
				done();
			});
		});
	});
});

describe("Checking sets", function () {
	let clients = [];
	let sessionID = "sessionID";

	let sets = {
		dom: { common: 101, uncommon: 80, rare: 53, mythic: 15 },
		grn: { common: 111, uncommon: 80, rare: 53, mythic: 15 },
		rna: { common: 111, uncommon: 80, rare: 53, mythic: 15 },
		war: { common: 101, uncommon: 80, rare: 53, mythic: 15 },
		eld: { common: 101, uncommon: 80, rare: 53, mythic: 15 },
		thb: { common: 101, uncommon: 80, rare: 53, mythic: 15 },
		iko: { common: 111, uncommon: 80, rare: 53, mythic: 15 },
	};

	beforeEach(function (done) {
		disableLogs();
		done();
	});

	afterEach(function (done) {
		enableLogs(this.currentTest.state == "failed");
		done();
	});

	before(function (done) {
		disableLogs();
		const Connections = server.__get__("Connections");
		expect(Object.keys(Connections).length).to.equal(0);
		clients.push(
			connectClient({
				userID: "sameID",
				sessionID: sessionID,
				userName: "Client1",
			})
		);
		clients.push(
			connectClient({
				userID: "sameID",
				sessionID: sessionID,
				userName: "Client2",
			})
		);

		// Wait for all clients to be connected
		let connectedClients = 0;
		for (let c of clients) {
			c.on("connect", function () {
				connectedClients += 1;
				if (connectedClients == clients.length) {
					enableLogs(false);
					done();
				}
			});
		}
	});

	after(function (done) {
		disableLogs();
		for (let c of clients) {
			c.disconnect();
			c.close();
		}
		// Wait for the sockets to be disconnected, I haven't found another way...
		setTimeout(function () {
			const Connections = server.__get__("Connections");
			expect(Object.keys(Connections).length).to.equal(0);
			enableLogs(false);
			done();
		}, 250);
	});

	it("First client should be the session owner", function (done) {
		const Sessions = server.__get__("Sessions");
		expect(Sessions[sessionID].owner).to.equal("sameID");
		done();
	});

	for (let set in sets) {
		it(`Checking ${set}`, function (done) {
			const Sessions = server.__get__("Sessions");
			let ownerIdx = clients.findIndex((c) => c.query.userID == Sessions[sessionID].owner);
			clients[ownerIdx].emit("ignoreCollections", true);
			clients[ownerIdx].emit("setRestriction", [set]);
			// Wait for request to arrive
			clients[1].on("setRestriction", function (sR) {
				const localCollection = Sessions[sessionID].restrictedCollectionByRarity();
				for (let r in sets[set]) expect(Object.keys(localCollection[r]).length).to.equal(sets[set][r]);
				clients[1].removeListener("setRestriction");
				done();
			});
		});
	}
});

describe("Single Draft", function () {
	let clients = [];
	let sessionID = "sessionID";

	beforeEach(function (done) {
		disableLogs();
		done();
	});

	afterEach(function (done) {
		enableLogs(this.currentTest.state == "failed");
		done();
	});

	before(function (done) {
		disableLogs();
		const Connections = server.__get__("Connections");
		expect(Object.keys(Connections).length).to.equal(0);
		clients.push(
			connectClient({
				userID: "sameID",
				sessionID: sessionID,
				userName: "Client1",
			})
		);
		clients.push(
			connectClient({
				userID: "sameID",
				sessionID: sessionID,
				userName: "Client2",
			})
		);

		// Wait for all clients to be connected
		let connectedClients = 0;
		for (let c of clients) {
			c.on("connect", function () {
				connectedClients += 1;
				if (connectedClients == clients.length) {
					enableLogs(false);
					done();
				}
			});
		}
	});

	after(function (done) {
		disableLogs();
		for (let c of clients) {
			c.disconnect();
			c.close();
		}
		// Wait for the sockets to be disconnected, I haven't found another way...
		setTimeout(function () {
			const Connections = server.__get__("Connections");
			expect(Object.keys(Connections).length).to.equal(0);
			enableLogs(false);
			done();
		}, 250);
	});

	it('A user with userID "sameID" should be connected.', function (done) {
		const Connections = server.__get__("Connections");
		expect(Connections).to.have.property("sameID");
		done();
	});

	it("2 clients with different userID should be connected.", function (done) {
		const Connections = server.__get__("Connections");
		expect(Object.keys(Connections).length).to.equal(2);
		done();
	});

	it("3 clients with different userID should be connected.", function (done) {
		let idx = clients.push(
			connectClient({
				userID: "sameID",
				sessionID: sessionID,
				userName: "Client3",
			})
		);

		clients[idx - 1].on("connect", function () {
			const Connections = server.__get__("Connections");
			expect(Object.keys(Connections).length).to.equal(3);
			done();
		});
	});

	it("First client should be the session owner", function (done) {
		const Sessions = server.__get__("Sessions");
		expect(Sessions[sessionID].owner).to.equal("sameID");
		done();
	});

	it(`Collection should be all of THB set (+ distribution quick test)`, function (done) {
		const Sessions = server.__get__("Sessions");
		let ownerIdx = clients.findIndex((c) => c.query.userID == Sessions[sessionID].owner);
		clients[ownerIdx].emit("ignoreCollections", true);
		clients[1].on("setRestriction", (_) => {
			const localCollection = Sessions[sessionID].restrictedCollectionByRarity();
			expect(Object.keys(localCollection["common"]).length).to.equal(101);
			expect(Object.keys(localCollection["uncommon"]).length).to.equal(80);
			expect(Object.keys(localCollection["rare"]).length).to.equal(53);
			expect(Object.keys(localCollection["mythic"]).length).to.equal(15);
			done();
		});
		clients[ownerIdx].emit("setRestriction", ["thb"]);
		/*
		const random = new randomjs.Random(randomjs.nodeCrypto);
		const get_random_key = () => random.integer(0, Object.keys(localCollection['rare']).length - 1);
		process.stdout.write('Distribution samples:\n');
		for(let repeat = 0; repeat < 5; ++repeat) {
			let samples = {};
			const sampleCount = 8 * 3;
			for(let i = 0; i < Object.keys(localCollection['rare']).length; ++i)
				samples[i] = 0;
			for(let i = 0; i < sampleCount; ++i) {
				samples[get_random_key()] += 1;
			}
			for(let i = 0; i < Object.keys(localCollection['rare']).length; ++i)
				process.stdout.write(`${samples[i]} `);
				//process.stdout.write(`${samples[i]}; ${samples[i] * 100.0 / sampleCount} %)`);
			process.stdout.write('\n');
		}
		*/
	});

	let boosters = [];
	it("When session owner launch draft, everyone should receive a startDraft event", function (done) {
		let connectedClients = 0;
		let receivedBoosters = 0;
		let index = 0;
		for (let c of clients) {
			c.on("startDraft", function () {
				connectedClients += 1;
				this.removeListener("startDraft");
				if (connectedClients == clients.length && receivedBoosters == clients.length) done();
			});

			((_) => {
				const _idx = index;
				c.on("nextBooster", function (data) {
					expect(boosters).not.include(data);
					boosters[_idx] = data;
					receivedBoosters += 1;
					this.removeListener("nextBooster");
					if (connectedClients == clients.length && receivedBoosters == clients.length) done();
				});
			})();
			++index;
		}
		clients[0].emit("startDraft");
	});

	it("Once everyone in a session has picked a card, receive next boosters.", function (done) {
		let receivedBoosters = 0;
		for (let c = 0; c < clients.length; ++c) {
			clients[c].on("nextBooster", function (data) {
				receivedBoosters += 1;
				let idx = c;
				expect(data.booster.length).to.equal(boosters[idx].booster.length - 1);
				boosters[idx] = data;
				this.removeListener("nextBooster");
				if (receivedBoosters == clients.length) done();
			});
			clients[c].emit("pickCard", boosters[c].booster[0], (_) => {});
		}
	});

	it("Do it enough times, and all the drafts should end.", function (done) {
		this.timeout(20000);
		let draftEnded = 0;
		for (let c = 0; c < clients.length; ++c) {
			clients[c].on("nextBooster", function (data) {
				let idx = c;
				boosters[idx] = data.booster;
				this.emit("pickCard", boosters[idx][0], (_) => {});
			});
			clients[c].on("endDraft", function () {
				draftEnded += 1;
				this.removeListener("endDraft");
				this.removeListener("nextBooster");
				if (draftEnded == clients.length) done();
			});
		}
		for (let c = 0; c < clients.length; ++c) {
			clients[c].emit("pickCard", boosters[c].booster[0], (_) => {});
		}
	});
});

describe("Single Draft without Color Balance", function () {
	let clients = [];
	let sessionID = "sessionID";

	beforeEach(function (done) {
		disableLogs();
		done();
	});

	afterEach(function (done) {
		enableLogs(this.currentTest.state == "failed");
		done();
	});

	before(function (done) {
		disableLogs();
		const Connections = server.__get__("Connections");
		expect(Object.keys(Connections).length).to.equal(0);
		clients.push(
			connectClient({
				userID: "sameID",
				sessionID: sessionID,
				userName: "Client1",
			})
		);
		clients.push(
			connectClient({
				userID: "sameID",
				sessionID: sessionID,
				userName: "Client2",
			})
		);

		// Wait for all clients to be connected
		let connectedClients = 0;
		for (let c of clients) {
			c.on("connect", function () {
				connectedClients += 1;
				if (connectedClients == clients.length) {
					enableLogs(false);
					done();
				}
			});
		}
	});

	after(function (done) {
		disableLogs();
		for (let c of clients) {
			c.disconnect();
			c.close();
		}
		// Wait for the sockets to be disconnected, I haven't found another way...
		setTimeout(function () {
			const Connections = server.__get__("Connections");
			expect(Object.keys(Connections).length).to.equal(0);
			enableLogs(false);
			done();
		}, 250);
	});

	it("First client should be the session owner", function (done) {
		const Sessions = server.__get__("Sessions");
		expect(Sessions[sessionID].owner).to.equal("sameID");
		done();
	});

	it("Clients should receive the updated colorBalance status.", function (done) {
		clients[1].on("sessionOptions", function (options) {
			expect(options.colorBalance).to.equal(false);
			this.removeListener("sessionOptions");
			done();
		});
		clients[0].emit("setColorBalance", false);
	});

	let boosters = [];
	it("When session owner launch draft, everyone should receive a startDraft event", function (done) {
		let connectedClients = 0;
		let receivedBoosters = 0;
		let index = 0;
		for (let c of clients) {
			c.on("startDraft", function () {
				connectedClients += 1;
				this.removeListener("startDraft");
				if (connectedClients == clients.length && receivedBoosters == clients.length) done();
			});

			((_) => {
				const _idx = index;
				c.on("nextBooster", function (data) {
					expect(boosters).not.include(data);
					boosters[_idx] = data;
					receivedBoosters += 1;
					this.removeListener("nextBooster");
					if (connectedClients == clients.length && receivedBoosters == clients.length) done();
				});
			})();
			++index;
		}
		clients[0].emit("startDraft");
	});

	it("Once everyone in a session has picked a card, receive next boosters.", function (done) {
		let receivedBoosters = 0;
		for (let c = 0; c < clients.length; ++c) {
			clients[c].on("nextBooster", function (data) {
				receivedBoosters += 1;
				let idx = c;
				expect(data.booster.length).to.equal(boosters[idx].booster.length - 1);
				boosters[idx] = data;
				this.removeListener("nextBooster");
				if (receivedBoosters == clients.length) done();
			});
			clients[c].emit("pickCard", boosters[c].booster[0], (_) => {});
		}
	});

	it("Do it enough times, and all the drafts should end.", function (done) {
		this.timeout(20000);
		let draftEnded = 0;
		for (let c = 0; c < clients.length; ++c) {
			clients[c].on("nextBooster", function (data) {
				let idx = c;
				boosters[idx] = data.booster;
				this.emit("pickCard", boosters[idx][0], (_) => {});
			});
			clients[c].on("endDraft", function () {
				draftEnded += 1;
				this.removeListener("endDraft");
				this.removeListener("nextBooster");
				if (draftEnded == clients.length) done();
			});
		}
		for (let c = 0; c < clients.length; ++c) {
			clients[c].emit("pickCard", boosters[c].booster[0], (_) => {});
		}
	});
});

describe("Single Draft With disconnect and reconnect", function () {
	let clients = [];
	let sessionID = "sessionID";

	beforeEach(function (done) {
		disableLogs();
		done();
	});

	afterEach(function (done) {
		enableLogs(this.currentTest.state == "failed");
		done();
	});

	before(function (done) {
		disableLogs();
		const Connections = server.__get__("Connections");
		expect(Object.keys(Connections).length).to.equal(0);
		clients.push(
			connectClient({
				userID: "sameID",
				sessionID: sessionID,
				userName: "Client1",
			})
		);
		clients.push(
			connectClient({
				userID: "anotherID",
				sessionID: sessionID,
				userName: "Client2",
			})
		);

		// Wait for all clients to be connected
		let connectedClients = 0;
		for (let c of clients) {
			c.on("connect", function () {
				connectedClients += 1;
				if (connectedClients == clients.length) {
					enableLogs(false);
					done();
				}
			});
		}
	});

	after(function (done) {
		disableLogs();
		for (let c of clients) {
			c.disconnect();
			c.close();
		}
		// Wait for the sockets to be disconnected, I haven't found another way...
		setTimeout(function () {
			const Connections = server.__get__("Connections");
			expect(Object.keys(Connections).length).to.equal(0);
			enableLogs(false);
			done();
		}, 250);
	});

	it("First client should be the session owner", function (done) {
		const Sessions = server.__get__("Sessions");
		expect(Sessions[sessionID].owner).to.equal("sameID");
		done();
	});

	let boosters = [];
	it("When session owner launch draft, everyone should receive a startDraft event", function (done) {
		let connectedClients = 0;
		let receivedBoosters = 0;
		let index = 0;
		for (let c of clients) {
			c.on("startDraft", function () {
				connectedClients += 1;
				this.removeListener("startDraft");
				if (connectedClients == clients.length && receivedBoosters == clients.length) done();
			});

			((_) => {
				const _idx = index;
				c.on("nextBooster", function (data) {
					expect(boosters).not.include(data);
					boosters[_idx] = data;
					receivedBoosters += 1;
					this.removeListener("nextBooster");
					if (connectedClients == clients.length && receivedBoosters == clients.length) done();
				});
			})();
			++index;
		}
		clients[0].emit("startDraft");
	});

	it("Once everyone in a session has picked a card, receive next boosters.", function (done) {
		let receivedBoosters = 0;
		for (let c = 0; c < clients.length; ++c) {
			clients[c].on("nextBooster", function (data) {
				receivedBoosters += 1;
				let idx = c;
				expect(data.booster.length).to.equal(boosters[idx].booster.length - 1);
				boosters[idx] = data;
				this.removeListener("nextBooster");
				if (receivedBoosters == clients.length) done();
			});
			clients[c].emit("pickCard", boosters[c].booster[0], (_) => {});
		}
	});

	it("Client 1 disconnects, Client 0 receives a warning.", function (done) {
		clients[0].on("userDisconnected", function (userName) {
			this.removeListener("userDisconnected");
			done();
		});
		clients[1].disconnect();
		clients.pop();
	});

	it("Client 0 choose to replace by bots.", function (done) {
		clients[0].on("message", function (sessionUsers) {
			this.removeListener("message");
			done();
		});
		clients[0].emit("replaceDisconnectedPlayers");
	});

	it("Pick enough times, and all the drafts should end.", function (done) {
		this.timeout(4000);
		let draftEnded = 0;
		for (let c = 0; c < clients.length; ++c) {
			clients[c].on("nextBooster", function (data) {
				let idx = c;
				boosters[idx] = data.booster;
				this.emit("pickCard", boosters[idx][0], (_) => {});
			});
			clients[c].on("endDraft", function () {
				draftEnded += 1;
				this.removeListener("endDraft");
				this.removeListener("nextBooster");
				if (draftEnded == clients.length) done();
			});
		}
		for (let c = 0; c < clients.length; ++c) {
			clients[c].emit("pickCard", boosters[c].booster[0], (_) => {});
		}
	});
});

describe("Single Draft With disconnect and bots", function () {
	let clients = [];
	let sessionID = "sessionID";

	beforeEach(function (done) {
		disableLogs();
		done();
	});

	afterEach(function (done) {
		enableLogs(this.currentTest.state == "failed");
		done();
	});

	before(function (done) {
		disableLogs();
		const Connections = server.__get__("Connections");
		expect(Object.keys(Connections).length).to.equal(0);
		clients.push(
			connectClient({
				userID: "sameID",
				sessionID: sessionID,
				userName: "Client1",
			})
		);
		clients.push(
			connectClient({
				userID: "anotherID",
				sessionID: sessionID,
				userName: "Client2",
			})
		);

		// Wait for all clients to be connected
		let connectedClients = 0;
		for (let c of clients) {
			c.on("connect", function () {
				connectedClients += 1;
				if (connectedClients == clients.length) {
					enableLogs(false);
					done();
				}
			});
		}
	});

	after(function (done) {
		disableLogs();
		for (let c of clients) {
			c.disconnect();
			c.close();
		}
		// Wait for the sockets to be disconnected, I haven't found another way...
		setTimeout(function () {
			const Connections = server.__get__("Connections");
			expect(Object.keys(Connections).length).to.equal(0);
			enableLogs(false);
			done();
		}, 250);
	});

	it("First client should be the session owner", function (done) {
		const Sessions = server.__get__("Sessions");
		expect(Sessions[sessionID].owner).to.equal("sameID");
		done();
	});

	it("Clients should receive the updated bot count.", function (done) {
		clients[1].on("bots", function (bots) {
			expect(bots).to.equal(6);
			this.removeListener("bots");
			done();
		});
		clients[0].emit("bots", 6);
	});

	let boosters = [];
	it("When session owner launch draft, everyone should receive a startDraft event", function (done) {
		let connectedClients = 0;
		let receivedBoosters = 0;
		let index = 0;
		for (let c of clients) {
			c.on("startDraft", function () {
				connectedClients += 1;
				this.removeListener("startDraft");
				if (connectedClients == clients.length && receivedBoosters == clients.length) done();
			});

			((_) => {
				const _idx = index;
				c.on("nextBooster", function (data) {
					expect(boosters).not.include(data);
					boosters[_idx] = data;
					receivedBoosters += 1;
					this.removeListener("nextBooster");
					if (connectedClients == clients.length && receivedBoosters == clients.length) done();
				});
			})();
			++index;
		}
		clients[0].emit("startDraft");
	});

	it("Once everyone in a session has picked a card, receive next boosters.", function (done) {
		let receivedBoosters = 0;
		for (let c = 0; c < clients.length; ++c) {
			clients[c].on("nextBooster", function (data) {
				receivedBoosters += 1;
				let idx = c;
				expect(data.booster.length).to.equal(boosters[idx].booster.length - 1);
				boosters[idx] = data;
				this.removeListener("nextBooster");
				if (receivedBoosters == clients.length) done();
			});
			clients[c].emit("pickCard", boosters[c].booster[0], (_) => {});
		}
	});

	it("Client 1 disconnects, Client 0 receives updated user infos.", function (done) {
		clients[0].on("userDisconnected", function (userName) {
			this.removeListener("userDisconnected");
			done();
		});
		clients[1].disconnect();
	});

	it("Client 1 reconnects, draft restarts.", function (done) {
		clients[0].on("message", function (sessionUsers) {
			this.removeListener("message");
			done();
		});
		clients[1].connect();
	});

	it("Pick enough times, and all the drafts should end.", function (done) {
		this.timeout(4000);
		let draftEnded = 0;
		for (let c = 0; c < clients.length; ++c) {
			clients[c].on(
				"nextBooster",
				((_) => {
					const idx = c;
					const self = clients[c];
					return (data) => {
						boosters[idx] = data.booster;
						process.nextTick((_) => {
							self.emit("pickCard", boosters[idx][0], (_) => {});
						});
					};
				})()
			);
			clients[c].on("endDraft", function () {
				draftEnded += 1;
				this.removeListener("endDraft");
				this.removeListener("nextBooster");
				if (draftEnded == clients.length) done();
			});
		}
		for (let c = 0; c < clients.length; ++c) {
			clients[c].emit("pickCard", boosters[c].booster[0], (_) => {});
		}
	});
});

describe("Single Draft with Bots", function () {
	let clients = [];
	let sessionID = "sessionID";

	beforeEach(function (done) {
		disableLogs();
		done();
	});

	afterEach(function (done) {
		enableLogs(this.currentTest.state == "failed");
		done();
	});

	before(function (done) {
		disableLogs();
		const Connections = server.__get__("Connections");
		expect(Object.keys(Connections).length).to.equal(0);
		clients.push(
			connectClient({
				userID: "sameID",
				sessionID: sessionID,
				userName: "Client1",
			})
		);
		clients.push(
			connectClient({
				userID: "sameID",
				sessionID: sessionID,
				userName: "Client2",
			})
		);

		// Wait for all clients to be connected
		let connectedClients = 0;
		for (let c of clients) {
			c.on("connect", function () {
				connectedClients += 1;
				if (connectedClients == clients.length) {
					enableLogs(false);
					done();
				}
			});
		}
	});

	after(function (done) {
		disableLogs();
		for (let c of clients) {
			c.disconnect();
			c.close();
		}
		// Wait for the sockets to be disconnected, I haven't found another way...
		setTimeout(function () {
			const Connections = server.__get__("Connections");
			expect(Object.keys(Connections).length).to.equal(0);
			enableLogs(false);
			done();
		}, 250);
	});

	it('A user with userID "sameID" should be connected.', function (done) {
		const Connections = server.__get__("Connections");
		expect(Connections).to.have.property("sameID");
		done();
	});

	it("2 clients with different userID should be connected.", function (done) {
		const Connections = server.__get__("Connections");
		expect(Object.keys(Connections).length).to.equal(2);
		done();
	});

	it("First client should be the session owner", function (done) {
		const Sessions = server.__get__("Sessions");
		expect(Sessions[sessionID].owner).to.equal("sameID");
		done();
	});

	it("Clients should receive the updated bot count.", function (done) {
		clients[1].on("bots", function (bots) {
			expect(bots).to.equal(6);
			this.removeListener("bots");
			done();
		});
		clients[0].emit("bots", 6);
	});

	let boosters = [];
	it("When session owner launch draft, everyone should receive a startDraft event", function (done) {
		let connectedClients = 0;
		let receivedBoosters = 0;
		let index = 0;
		for (let c of clients) {
			c.on("startDraft", function () {
				connectedClients += 1;
				this.removeListener("startDraft");
				if (connectedClients == clients.length && receivedBoosters == clients.length) done();
			});

			((_) => {
				const _idx = index;
				c.on("nextBooster", function (data) {
					expect(boosters).not.include(data);
					boosters[_idx] = data;
					receivedBoosters += 1;
					this.removeListener("nextBooster");
					if (connectedClients == clients.length && receivedBoosters == clients.length) done();
				});
			})();
			++index;
		}
		clients[0].emit("startDraft");
	});

	it("Once everyone in a session has picked a card, receive next boosters.", function (done) {
		let receivedBoosters = 0;
		for (let c = 0; c < clients.length; ++c) {
			clients[c].on("nextBooster", function (data) {
				receivedBoosters += 1;
				let idx = c;
				expect(data.booster.length).to.equal(boosters[idx].booster.length - 1);
				boosters[idx] = data;
				this.removeListener("nextBooster");
				if (receivedBoosters == clients.length) done();
			});
			clients[c].emit("pickCard", boosters[c].booster[0], (_) => {});
		}
	});

	it("Do it enough times, and all the drafts should end.", function (done) {
		this.timeout(20000);
		let draftEnded = 0;
		for (let c = 0; c < clients.length; ++c) {
			clients[c].on("nextBooster", function (data) {
				let idx = c;
				boosters[idx] = data.booster;
				this.emit("pickCard", boosters[idx][0], (_) => {});
			});
			clients[c].on("endDraft", function () {
				draftEnded += 1;
				this.removeListener("endDraft");
				this.removeListener("nextBooster");
				if (draftEnded == clients.length) done();
			});
		}
		for (let c = 0; c < clients.length; ++c) {
			clients[c].emit("pickCard", boosters[c].booster[0], (_) => {});
		}
	});
});

describe("Multiple Drafts", function () {
	let clients = [];
	let sessionIDs = [];
	const sessionCount = 4;
	const playersPerSession = 7;
	let boosters = [];

	beforeEach(function (done) {
		disableLogs();
		done();
	});

	afterEach(function (done) {
		enableLogs(this.currentTest.state == "failed");
		done();
	});

	before(function (done) {
		disableLogs();
		const Connections = server.__get__("Connections");
		expect(Object.keys(Connections).length).to.equal(0);
		for (let sess = 0; sess < sessionCount; ++sess) {
			sessionIDs[sess] = `Session ${sess}`;
			clients[sess] = [];
			for (let i = 0; i < playersPerSession; ++i) {
				clients[sess].push(
					connectClient({
						userID: "sameID",
						sessionID: sessionIDs[sess],
						userName: `Client ${sess * playersPerSession + i}`,
					})
				);
			}
		}

		// Wait for all clients to be connected
		let connectedClients = 0;
		for (let s of clients) {
			for (let c of s) {
				c.on("connect", function () {
					connectedClients += 1;
					if (connectedClients == playersPerSession * clients.length) {
						enableLogs(false);
						done();
					}
				});
			}
		}
	});

	after(function (done) {
		disableLogs();
		for (let s of clients)
			for (let c of s) {
				c.disconnect();
				c.close();
			}
		// Wait for the sockets to be disconnected, I haven't found another way...
		setTimeout(function () {
			const Connections = server.__get__("Connections");
			expect(Object.keys(Connections).length).to.equal(0);
			enableLogs(false);
			done();
		}, 500);
	});

	it(`${sessionCount} sessions should be live.`, function (done) {
		const Sessions = server.__get__("Sessions");
		expect(Object.keys(Sessions).length).to.equal(sessionCount);
		done();
	});

	it(`${playersPerSession * sessionCount} players should be connected.`, function (done) {
		const Connections = server.__get__("Connections");
		expect(Object.keys(Connections).length).to.equal(playersPerSession * sessionCount);
		done();
	});

	it("When session owner launch draft, everyone in session should receive a startDraft event, and a unique booster", function (done) {
		let sessionsCorrectlyStartedDrafting = 0;
		for (let [sessionIdx, sessionClients] of clients.entries()) {
			boosters.push([]);
			(() => {
				let connectedClients = 0;
				for (let c of sessionClients) {
					c.on("startDraft", function () {
						connectedClients += 1;
						if (connectedClients == sessionClients.length) sessionsCorrectlyStartedDrafting += 1;
					});

					c.on("nextBooster", function (data) {
						expect(boosters).not.include(data);
						boosters[playersPerSession * sessionIdx + sessionClients.findIndex((cl) => cl == c)] = data;
						this.removeListener("nextBooster");
						if (
							sessionsCorrectlyStartedDrafting == sessionCount &&
							boosters.length == playersPerSession * sessionCount
						)
							done();
					});
				}
				const Sessions = server.__get__("Sessions");
				let ownerIdx = sessionClients.findIndex(
					(c) => c.query.userID == Sessions[sessionIDs[sessionIdx]].owner
				);
				sessionClients[ownerIdx].emit("startDraft");
			})();
		}
	});

	it("New players should not be able to join once drafting has started", function (done) {
		let newClient = io(
			"http://localhost:3000/",
			Object.assign(
				{
					query: {
						userID: "sameID",
						sessionID: sessionIDs[0],
						userName: `New Client`,
					},
				},
				ioOptions
			)
		);

		newClient.on("setSession", function (newSessionID) {
			expect(newSessionID).to.not.equal(sessionIDs[0]);
			const Sessions = server.__get__("Sessions");
			expect(Sessions[sessionIDs[0]].users.size).to.equal(playersPerSession);
			newClient.disconnect();
			done();
		});
	});

	it("Once everyone in a session has picked a card, receive next boosters.", function (done) {
		let receivedBoosters = 0;
		expect(boosters.length).to.equal(playersPerSession * sessionCount);
		for (let sess = 0; sess < clients.length; ++sess) {
			for (let c = 0; c < clients[sess].length; ++c) {
				clients[sess][c].on(
					"nextBooster",
					(function () {
						let idx = playersPerSession * sess + c;
						return function (data) {
							receivedBoosters += 1;
							expect(data.booster.length).to.equal(boosters[idx].booster.length - 1);
							boosters[idx] = data;
							this.removeListener("nextBooster");
							if (receivedBoosters == playersPerSession * sessionCount) done();
						};
					})()
				);
				clients[sess][c].emit("pickCard", boosters[playersPerSession * sess + c].booster[0], (_) => {});
			}
		}
	});

	it("Do it enough times, and all the drafts should end.", function (done) {
		this.timeout(20000);
		let draftEnded = 0;
		for (let sess = 0; sess < clients.length; ++sess) {
			for (let c = 0; c < clients[sess].length; ++c) {
				clients[sess][c].on("nextBooster", function (data) {
					let idx = playersPerSession * sess + c;
					boosters[idx] = data.booster;
					this.emit("pickCard", boosters[idx][0], (_) => {});
				});
				clients[sess][c].on("endDraft", function () {
					draftEnded += 1;
					this.removeListener("endDraft");
					this.removeListener("nextBooster");
					if (draftEnded == playersPerSession * sessionCount) done();
				});
			}
		}
		for (let sess = 0; sess < clients.length; ++sess) {
			for (let c = 0; c < clients[sess].length; ++c) {
				clients[sess][c].emit("pickCard", boosters[playersPerSession * sess + c].booster[0], (_) => {});
			}
		}
	});
});

describe("Winston Draft", function () {
	let clients = [];
	const clientIDs = ["FirstClientID", "SecondClientID"];
	let sessionID = "sessionID";

	beforeEach(function (done) {
		disableLogs();
		done();
	});

	afterEach(function (done) {
		enableLogs(this.currentTest.state == "failed");
		done();
	});

	before(function (done) {
		disableLogs();
		const Connections = server.__get__("Connections");
		expect(Object.keys(Connections).length).to.equal(0);
		clients.push(
			connectClient({
				userID: clientIDs[0],
				sessionID: sessionID,
				userName: "Client1",
			})
		);
		clients.push(
			connectClient({
				userID: clientIDs[1],
				sessionID: sessionID,
				userName: "Client2",
			})
		);

		// Wait for all clients to be connected
		let connectedClients = 0;
		for (let c of clients) {
			c.on("connect", function () {
				connectedClients += 1;
				if (connectedClients == clients.length) {
					enableLogs(false);
					done();
				}
			});
		}
	});

	after(function (done) {
		disableLogs();
		for (let c of clients) {
			c.disconnect();
			c.close();
		}
		// Wait for the sockets to be disconnected, I haven't found another way...
		setTimeout(function () {
			const Connections = server.__get__("Connections");
			expect(Object.keys(Connections).length).to.equal(0);
			enableLogs(false);
			done();
		}, 250);
	});

	it("2 clients with different userID should be connected.", function (done) {
		const Connections = server.__get__("Connections");
		expect(Object.keys(Connections).length).to.equal(2);
		done();
	});

	it("First client should be the session owner", function (done) {
		const Sessions = server.__get__("Sessions");
		expect(Sessions[sessionID].owner).to.equal("FirstClientID");
		done();
	});

	let states = [];
	it("When session owner launch Winston draft, everyone should receive a startWinstonDraft event", function (done) {
		let connectedClients = 0;
		let receivedState = 0;
		let index = 0;
		for (let c of clients) {
			c.on("startWinstonDraft", function () {
				connectedClients += 1;
				this.removeListener("startWinstonDraft");
				if (connectedClients == clients.length && receivedState == clients.length) done();
			});

			((_) => {
				const _idx = index;
				c.on("winstonDraftNextRound", function (state) {
					states[_idx] = state;
					receivedState += 1;
					this.removeListener("winstonDraftNextRound");
					if (connectedClients == clients.length && receivedState == clients.length) done();
				});
			})();
			++index;
		}
		clients[0].emit("startWinstonDraft");
	});

	it("Client 1 disconnects, Client 0 receives updated user infos.", function (done) {
		clients[0].on("userDisconnected", function (userName) {
			this.removeListener("userDisconnected");
			done();
		});
		clients[1].disconnect();
	});

	it("Client 1 reconnects, draft restarts.", function (done) {
		clients[1].on("rejoinWinstonDraft", function (state) {
			this.removeListener("rejoinWinstonDraft");
			done();
		});
		clients[1].connect();
	});

	it("Every player takes the first pile possible and the draft should end.", function (done) {
		this.timeout(2000);
		let draftEnded = 0;
		for (let c = 0; c < clients.length; ++c) {
			clients[c].on("winstonDraftNextRound", function (userID) {
				if (userID === clientIDs[c]) this.emit("winstonDraftTakePile");
			});
			clients[c].on("winstonDraftEnd", function () {
				draftEnded += 1;
				this.removeListener("winstonDraftEnd");
				this.removeListener("winstonDraftNextRound");
				if (draftEnded == clients.length) done();
			});
		}
		clients[0].emit("winstonDraftTakePile");
	});

	it("When session owner launch Winston draft, everyone should receive a startWinstonDraft event", function (done) {
		states = [];
		let connectedClients = 0;
		let receivedState = 0;
		let index = 0;
		for (let c of clients) {
			c.on("startWinstonDraft", function () {
				connectedClients += 1;
				this.removeListener("startWinstonDraft");
				if (connectedClients == clients.length && receivedState == clients.length) done();
			});

			((_) => {
				const _idx = index;
				c.on("winstonDraftNextRound", function (state) {
					states[_idx] = state;
					receivedState += 1;
					this.removeListener("winstonDraftNextRound");
					if (connectedClients == clients.length && receivedState == clients.length) done();
				});
			})();
			++index;
		}
		clients[0].emit("startWinstonDraft");
	});

	it("Taking first pile.", function (done) {
		let nextRound = 0;
		for (let c = 0; c < clients.length; ++c) {
			clients[c].on("winstonDraftNextRound", function (userID) {
				++nextRound;
				if (nextRound == clients.length) done();
			});
		}
		clients[0].emit("winstonDraftTakePile");
	});

	it("Skiping, then taking pile.", function (done) {
		let nextRound = 0;
		for (let c = 0; c < clients.length; ++c) {
			clients[c].on("winstonDraftNextRound", function (userID) {
				++nextRound;
				if (nextRound == clients.length) done();
			});
		}
		clients[1].emit("winstonDraftSkipPile");
		clients[1].emit("winstonDraftTakePile");
	});

	it("Skiping, skiping, then taking pile.", function (done) {
		let nextRound = 0;
		for (let c = 0; c < clients.length; ++c) {
			clients[c].on("winstonDraftNextRound", function (userID) {
				++nextRound;
				if (nextRound == clients.length) done();
			});
		}
		clients[0].emit("winstonDraftSkipPile");
		clients[0].emit("winstonDraftSkipPile");
		clients[0].emit("winstonDraftTakePile");
	});

	it("Skiping, skiping and skiping.", function (done) {
		let nextRound = 0;
		let receivedRandomCard = false;
		for (let c = 0; c < clients.length; ++c) {
			clients[c].on("winstonDraftNextRound", function (userID) {
				++nextRound;
				if (receivedRandomCard && nextRound == clients.length) done();
			});
		}
		clients[1].on("winstonDraftRandomCard", function (card) {
			if (card) receivedRandomCard = true;
		});
		clients[1].emit("winstonDraftSkipPile");
		clients[1].emit("winstonDraftSkipPile");
		clients[1].emit("winstonDraftSkipPile");
	});

	it("Every player takes the first pile possible and the draft should end.", function (done) {
		this.timeout(2000);
		let draftEnded = 0;
		for (let c = 0; c < clients.length; ++c) {
			clients[c].on("winstonDraftNextRound", function (userID) {
				if (userID === clientIDs[c]) this.emit("winstonDraftTakePile");
			});
			clients[c].on("winstonDraftEnd", function () {
				draftEnded += 1;
				this.removeListener("winstonDraftEnd");
				this.removeListener("winstonDraftNextRound");
				if (draftEnded == clients.length) done();
			});
		}
		clients[0].emit("winstonDraftTakePile");
	});
});

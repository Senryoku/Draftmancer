"use strict";

import chai from "chai";
const expect = chai.expect;
import { Sessions } from "../src/Session.js";
import { Connections } from "../src/Connection.js";
import { makeClients, enableLogs, disableLogs, waitForSocket, waitForClientDisconnects } from "./src/common.js";

describe("Winston Draft", function() {
	let clients = [];
	let sessionID = "sessionID";
	var ownerIdx;
	var nonOwnerIdx;

	const getCurrentPlayer = () => {
		const currentPlayerID = Sessions[sessionID].draftState.currentPlayer();
		const currentPlayerIdx = clients.findIndex(c => c.query.userID == currentPlayerID);
		return clients[currentPlayerIdx];
	};

	beforeEach(function(done) {
		disableLogs();
		done();
	});

	afterEach(function(done) {
		enableLogs(this.currentTest.state == "failed");
		done();
	});

	before(function(done) {
		clients = makeClients(
			[
				{
					userID: "id1",
					sessionID: sessionID,
					userName: "Client1",
				},
				{
					userID: "id2",
					sessionID: sessionID,
					userName: "Client2",
				},
			],
			done
		);
	});

	after(function(done) {
		disableLogs();
		for (let c of clients) {
			c.disconnect();
		}
		waitForClientDisconnects(done);
	});

	it("2 clients with different userID should be connected.", function(done) {
		expect(Object.keys(Connections).length).to.equal(2);
		done();
	});

	let states = [];
	it("When session owner launch Winston draft, everyone should receive a startWinstonDraft event", function(done) {
		ownerIdx = clients.findIndex(c => c.query.userID == Sessions[sessionID].owner);
		nonOwnerIdx = 1 - ownerIdx;
		let connectedClients = 0;
		let receivedState = 0;
		let index = 0;
		for (let c of clients) {
			c.once("startWinstonDraft", function() {
				connectedClients += 1;
				if (connectedClients == clients.length && receivedState == clients.length) done();
			});

			(() => {
				const _idx = index;
				c.once("winstonDraftNextRound", function(state) {
					states[_idx] = state;
					receivedState += 1;
					if (connectedClients == clients.length && receivedState == clients.length) done();
				});
			})();
			++index;
		}
		clients[ownerIdx].emit("startWinstonDraft");
	});

	it("Non-owner disconnects, owner receives updated user infos.", function(done) {
		clients[ownerIdx].once("userDisconnected", function() {
			waitForSocket(clients[nonOwnerIdx], done);
		});
		clients[nonOwnerIdx].disconnect();
	});

	it("Non-owner reconnects, draft restarts.", function(done) {
		clients[nonOwnerIdx].once("rejoinWinstonDraft", function(state) {
			done();
		});
		clients[nonOwnerIdx].connect();
	});

	it("Every player takes the first pile possible and the draft should end.", function(done) {
		let draftEnded = 0;
		for (let c = 0; c < clients.length; ++c) {
			clients[c].on("winstonDraftNextRound", function(userID) {
				if (userID === clients[c].query.userID) this.emit("winstonDraftTakePile");
			});
			clients[c].once("winstonDraftEnd", function() {
				draftEnded += 1;
				this.removeListener("winstonDraftNextRound");
				if (draftEnded == clients.length) done();
			});
		}
		getCurrentPlayer().emit("winstonDraftTakePile");
	});

	it("When session owner launch Winston draft, everyone should receive a startWinstonDraft event", function(done) {
		states = [];
		let connectedClients = 0;
		let receivedState = 0;
		let index = 0;
		for (let c of clients) {
			c.once("startWinstonDraft", function() {
				connectedClients += 1;
				if (connectedClients == clients.length && receivedState == clients.length) done();
			});

			(_ => {
				const _idx = index;
				c.once("winstonDraftNextRound", function(state) {
					states[_idx] = state;
					receivedState += 1;
					if (connectedClients == clients.length && receivedState == clients.length) done();
				});
			})();
			++index;
		}
		clients[ownerIdx].emit("startWinstonDraft");
	});

	it("Taking first pile.", function(done) {
		let nextRound = 0;
		for (let c = 0; c < clients.length; ++c) {
			clients[c].on("winstonDraftNextRound", function(userID) {
				++nextRound;
				if (nextRound == clients.length) done();
			});
		}
		getCurrentPlayer().emit("winstonDraftTakePile");
	});

	it("Skiping, then taking pile.", function(done) {
		let nextRound = 0;
		for (let c = 0; c < clients.length; ++c) {
			clients[c].on("winstonDraftNextRound", function(userID) {
				++nextRound;
				if (nextRound == clients.length) done();
			});
		}
		getCurrentPlayer().emit("winstonDraftSkipPile");
		getCurrentPlayer().emit("winstonDraftTakePile");
	});

	it("Skiping, skiping, then taking pile.", function(done) {
		let nextRound = 0;
		for (let c = 0; c < clients.length; ++c) {
			clients[c].on("winstonDraftNextRound", function(userID) {
				++nextRound;
				if (nextRound == clients.length) done();
			});
		}
		getCurrentPlayer().emit("winstonDraftSkipPile");
		getCurrentPlayer().emit("winstonDraftSkipPile");
		getCurrentPlayer().emit("winstonDraftTakePile");
	});

	it("Skiping, skiping and skiping.", function(done) {
		let nextRound = 0;
		let receivedRandomCard = false;
		for (let c = 0; c < clients.length; ++c) {
			clients[c].on("winstonDraftNextRound", function(userID) {
				++nextRound;
				if (receivedRandomCard && nextRound == clients.length) done();
			});
		}
		getCurrentPlayer().on("winstonDraftRandomCard", function(card) {
			if (card) receivedRandomCard = true;
		});
		getCurrentPlayer().emit("winstonDraftSkipPile");
		getCurrentPlayer().emit("winstonDraftSkipPile");
		getCurrentPlayer().emit("winstonDraftSkipPile");
	});

	it("Every player takes the first pile possible and the draft should end.", function(done) {
		this.timeout(2000);
		let draftEnded = 0;
		for (let c = 0; c < clients.length; ++c) {
			clients[c].on("winstonDraftNextRound", function(userID) {
				if (userID === clients[c].query.userID) this.emit("winstonDraftTakePile");
			});
			clients[c].once("winstonDraftEnd", function() {
				draftEnded += 1;
				this.removeListener("winstonDraftNextRound");
				if (draftEnded == clients.length) done();
			});
		}
		getCurrentPlayer().emit("winstonDraftTakePile");
	});
});

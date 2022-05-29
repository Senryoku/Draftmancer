"use strict";

import chai from "chai";
const expect = chai.expect;
import { Sessions } from "../dist/Session.js";
import { Connections } from "../dist/Connection.js";
import { makeClients, enableLogs, disableLogs, waitForSocket, waitForClientDisconnects } from "./src/common.js";

describe.only("Rochester Draft", function() {
	let clients = [];
	let sessionID = "sessionID";
	let ownerIdx;

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
				{
					userID: "id3",
					sessionID: sessionID,
					userName: "Client3",
				},
				{
					userID: "id4",
					sessionID: sessionID,
					userName: "Client4",
				},
				{
					userID: "id5",
					sessionID: sessionID,
					userName: "Client5",
				},
				{
					userID: "id6",
					sessionID: sessionID,
					userName: "Client6",
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

	it(`6 clients with different userID should be connected.`, function(done) {
		expect(Object.keys(Connections).length).to.equal(6);
		ownerIdx = clients.findIndex(c => c.query.userID == Sessions[sessionID].owner);
		expect(ownerIdx).to.not.be.null;
		expect(ownerIdx).to.not.be.undefined;
		done();
	});

	let rochesterDraftState = null;

	const startDraft = () => {
		it("When session owner launch Rochester draft, everyone should receive a startRochesterDraft event", function(done) {
			let connectedClients = 0;
			for (let c of clients) {
				c.once("startRochesterDraft", function(state) {
					connectedClients += 1;
					if (connectedClients == clients.length) {
						rochesterDraftState = state;
						done();
					}
				});
			}
			clients[ownerIdx].emit("startRochesterDraft");
		});
	};

	const endDraft = () => {
		it("Every player randomly chooses a card and the draft should end.", function(done) {
			let draftEnded = 0;

			for (let c = 0; c < clients.length; ++c) {
				// Pick randomly and retry on error
				const pick = state => {
					const cl = clients[c];
					cl.emit("rochesterDraftPick", [Math.floor(Math.random() * state.booster.length)], response => {
						if (response.code !== 0) pick(state);
					});
				};
				clients[c].on("rochesterDraftNextRound", function(state) {
					if (state.currentPlayer === clients[c].query.userID) pick(state);
				});
				clients[c].once("rochesterDraftEnd", function() {
					draftEnded += 1;
					this.removeListener("rochesterDraftNextRound");
					if (draftEnded == clients.length) done();
				});
			}
			// Pick the first card
			let currPlayer = clients.findIndex(c => c.query.userID == rochesterDraftState.currentPlayer);
			clients[currPlayer].emit("rochesterDraftPick", [0]);
		});
	};

	describe("Default settings with a disconnect", function() {
		startDraft();

		it("Non-owner disconnects, owner receives updated user infos.", function(done) {
			let nonOwnerIdx = (ownerIdx + 1) % clients.length;
			clients[ownerIdx].once("userDisconnected", function() {
				waitForSocket(clients[nonOwnerIdx], done);
			});
			clients[nonOwnerIdx].disconnect();
		});

		it("Non-owner reconnects, draft restarts.", function(done) {
			let nonOwnerIdx = (ownerIdx + 1) % clients.length;
			clients[nonOwnerIdx].once("rejoinRochesterDraft", function(state) {
				done();
			});
			clients[nonOwnerIdx].connect();
		});

		endDraft();
	});

	describe("Using a Cube", function() {
		it("Emit Settings.", function(done) {
			let nonOwnerIdx = (ownerIdx + 1) % clients.length;
			clients[nonOwnerIdx].once("sessionOptions", function(options) {
				if (options.useCustomCardList) done();
			});
			clients[ownerIdx].emit("setUseCustomCardList", true);
			clients[ownerIdx].emit("loadLocalCustomCardList", "Arena Historic Cube #1");
		});

		startDraft();
		endDraft();
	});

	function checklogs(desc, setup, func) {
		describe(desc, function() {
			it("Emit Settings.", setup);
			startDraft();
			it("Every player randomly chooses a card and players should receive a valid draft log.", function(done) {
				let draftEnded = 0;

				for (let c = 0; c < clients.length; ++c) {
					// Pick randomly and retry on error
					const pick = state => {
						const cl = clients[c];
						cl.emit("rochesterDraftPick", [Math.floor(Math.random() * state.booster.length)], response => {
							if (response.code !== 0) pick(state);
						});
					};
					clients[c].on("rochesterDraftNextRound", function(state) {
						if (state.currentPlayer === clients[c].query.userID) pick(state);
					});
					clients[c].once("draftLog", function(draftLog) {
						draftEnded += 1;
						func(c, draftLog);
						this.removeListener("rochesterDraftNextRound");
						if (draftEnded == clients.length) done();
					});
				}
				// Pick the first card
				let currPlayer = clients.findIndex(c => c.query.userID == rochesterDraftState.currentPlayer);
				clients[currPlayer].emit("rochesterDraftPick", [0]);
			});
		});
	}

	function setSettings(draftLogRecipients, personalLogs) {
		return done => {
			const nonOwnerIdx = (ownerIdx + 1) % clients.length;
			clients[nonOwnerIdx].on("sessionOptions", function() {
				if (
					Sessions[sessionID].personalLogs === personalLogs &&
					Sessions[sessionID].draftLogRecipients === draftLogRecipients
				) {
					clients[nonOwnerIdx].removeListener("sessionOptions");
					done();
				}
			});
			clients[ownerIdx].emit("setDraftLogRecipients", draftLogRecipients);
			clients[ownerIdx].emit("setPersonalLogs", personalLogs);
		};
	}

	checklogs(
		"Logs: Complete to Everyone; Personal logs enabled",
		setSettings("everyone", true),
		(clientIndex, draftLog) => {
			expect(draftLog.personalLogs).to.be.true;
			for (let i = 0; i < clients.length; ++i) expect(draftLog.users[clients[i].query.userID].cards).to.exist;
		}
	);

	checklogs(
		"Logs: Complete to Everyone; Personal logs disabled",
		setSettings("everyone", false),
		(clientIndex, draftLog) => {
			expect(draftLog.personalLogs).to.be.false;
			for (let i = 0; i < clients.length; ++i) expect(draftLog.users[clients[i].query.userID].cards).to.exist;
		}
	);

	checklogs(
		"Logs: Complete to Everyone (Delayed); Personal logs enabled",
		setSettings("delayed", true),
		(clientIndex, draftLog) => {
			expect(draftLog.personalLogs).to.be.true;
			if (clientIndex === ownerIdx) {
				for (let i = 0; i < clients.length; ++i) expect(draftLog.users[clients[i].query.userID].cards).to.exist;
			} else {
				expect(draftLog.users[clients[clientIndex].query.userID].cards).to.exist;
				for (let i = 0; i < clients.length; ++i)
					if (i !== clientIndex) expect(draftLog.users[clients[i].query.userID].cards).to.not.exist;
			}
		}
	);

	checklogs(
		"Logs: Complete to Everyone (Delayed); Personal logs disabled",
		setSettings("delayed", false),
		(clientIndex, draftLog) => {
			expect(draftLog.personalLogs).to.be.false;
			if (clientIndex === ownerIdx) {
				for (let i = 0; i < clients.length; ++i) expect(draftLog.users[clients[i].query.userID].cards).to.exist;
			} else {
				for (let i = 0; i < clients.length; ++i)
					expect(draftLog.users[clients[i].query.userID].cards).to.not.exist;
			}
		}
	);

	checklogs("Logs: Complete to No-one; Personal logs enabled", setSettings("none", true), (clientIndex, draftLog) => {
		expect(draftLog.personalLogs).to.be.true;
		expect(draftLog.users[clients[clientIndex].query.userID].cards).to.exist;
		for (let i = 0; i < clients.length; ++i)
			if (i !== clientIndex) expect(draftLog.users[clients[i].query.userID].cards).to.not.exist;
	});

	checklogs(
		"Logs: Complete to No-one; Personal logs disabled",
		setSettings("none", false),
		(clientIndex, draftLog) => {
			expect(draftLog.personalLogs).to.be.false;
			for (let i = 0; i < clients.length; ++i) expect(draftLog.users[clients[i].query.userID].cards).to.not.exist;
		}
	);
});

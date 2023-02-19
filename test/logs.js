"use strict";
import { before, after, beforeEach, afterEach, describe, it } from "mocha";
import chai from "chai";
const expect = chai.expect;
import { Sessions } from "../src/Session.js";
import { Connections } from "../src/Connection.js";
import { makeClients, enableLogs, disableLogs, waitForClientDisconnects } from "./src/common.js";

describe("Draft Logs", function () {
	let clients = [];
	let sessionID = "sessionID";
	let ownerIdx;

	beforeEach(function (done) {
		disableLogs();
		done();
	});

	afterEach(function (done) {
		enableLogs(this.currentTest.state == "failed");
		done();
	});

	before(function (done) {
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

	after(function (done) {
		disableLogs();
		for (let c of clients) {
			c.disconnect();
		}
		waitForClientDisconnects(done);
	});

	it(`6 clients with different userID should be connected.`, function (done) {
		expect(Object.keys(Connections).length).to.equal(6);
		ownerIdx = clients.findIndex((c) => c.query.userID == Sessions[sessionID].owner);
		expect(ownerIdx).to.not.be.null;
		expect(ownerIdx).to.not.be.undefined;
		done();
	});

	function test(gameMode, gameStartFunc, gameEndFunc) {
		function checklogs(desc, setup, validate) {
			describe(gameMode + " " + desc, function () {
				it("Emit Settings.", setup);
				gameStartFunc();
				it("Every player should receive a valid draft log.", gameEndFunc(validate));
			});
		}

		function setSettings(draftLogRecipients, personalLogs) {
			return (done) => {
				const nonOwnerIdx = (ownerIdx + 1) % clients.length;
				clients[nonOwnerIdx].on("sessionOptions", function () {
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
				for (let i = 0; i < clients.length; ++i)
					expect(draftLog.users[clients[i].query.userID].cards).to.be.not.empty;
			}
		);

		checklogs(
			"Logs: Complete to Everyone; Personal logs disabled",
			setSettings("everyone", false),
			(clientIndex, draftLog) => {
				expect(draftLog.personalLogs).to.be.false;
				for (let i = 0; i < clients.length; ++i)
					expect(draftLog.users[clients[i].query.userID].cards).to.be.not.empty;
			}
		);

		checklogs(
			"Logs: Complete to Everyone (Delayed); Personal logs enabled",
			setSettings("delayed", true),
			(clientIndex, draftLog) => {
				expect(draftLog.personalLogs).to.be.true;
				if (clientIndex === ownerIdx) {
					for (let i = 0; i < clients.length; ++i)
						expect(draftLog.users[clients[i].query.userID].cards).to.be.not.empty;
				} else {
					expect(draftLog.users[clients[clientIndex].query.userID].cards).to.be.not.empty;
					for (let i = 0; i < clients.length; ++i)
						if (i !== clientIndex) expect(draftLog.users[clients[i].query.userID].cards).to.be.empty;
				}
			}
		);

		checklogs(
			"Logs: Complete to Everyone (Delayed); Personal logs disabled",
			setSettings("delayed", false),
			(clientIndex, draftLog) => {
				expect(draftLog.personalLogs).to.be.false;
				if (clientIndex === ownerIdx) {
					for (let i = 0; i < clients.length; ++i)
						expect(draftLog.users[clients[i].query.userID].cards).to.be.not.empty;
				} else {
					for (let i = 0; i < clients.length; ++i)
						expect(draftLog.users[clients[i].query.userID].cards).to.be.empty;
				}
			}
		);

		checklogs(
			"Logs: Complete to No-one; Personal logs enabled",
			setSettings("none", true),
			(clientIndex, draftLog) => {
				expect(draftLog.personalLogs).to.be.true;
				expect(draftLog.users[clients[clientIndex].query.userID].cards).to.be.not.empty;
				for (let i = 0; i < clients.length; ++i)
					if (i !== clientIndex) expect(draftLog.users[clients[i].query.userID].cards).to.be.empty;
			}
		);

		checklogs(
			"Logs: Complete to No-one; Personal logs disabled",
			setSettings("none", false),
			(clientIndex, draftLog) => {
				expect(draftLog.personalLogs).to.be.false;
				for (let i = 0; i < clients.length; ++i)
					expect(draftLog.users[clients[i].query.userID].cards).to.be.empty;
			}
		);
	}

	function startDraft() {
		it("When session owner launches draft, everyone should receive a startDraft event", function (done) {
			let connectedClients = 0;
			let receivedBoosters = 0;
			for (let c in clients) {
				clients[c].once("startDraft", () => {
					connectedClients += 1;
					if (connectedClients == clients.length && receivedBoosters == clients.length) done();
				});
				(() => {
					clients[c].once("draftState", (state) => {
						receivedBoosters += 1;
						clients[c].state = state;
						if (connectedClients == clients.length && receivedBoosters == clients.length) done();
					});
				})();
			}
			clients[ownerIdx].emit("startDraft");
		});
	}
	const endDraft = (validate) => (done) => {
		let draftEnded = 0;
		for (let c = 0; c < clients.length; ++c) {
			clients[c].on("draftState", function (state) {
				if (state.pickNumber !== clients[c].state.pickNumber && state.boosterCount > 0) {
					clients[c].state = state;
					this.emit("pickCard", { pickedCards: [0] }, () => {});
				}
			});
			clients[c].once("draftLog", function (draftLog) {
				draftEnded += 1;
				validate(c, draftLog);
				this.removeListener("draftState");
				if (draftEnded == clients.length) done();
			});
		}
		for (let c = 0; c < clients.length; ++c) {
			clients[c].emit("pickCard", { pickedCards: [0] }, () => {});
		}
	};
	test("Draft", startDraft, endDraft);

	let rochesterDraftState = null;
	const startRochesterDraft = () => {
		it("When session owner launch Rochester draft, everyone should receive a startRochesterDraft event", function (done) {
			let connectedClients = 0;
			for (let c of clients) {
				c.once("startRochesterDraft", function (state) {
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
	const endRochesterDraft = (validate) => (done) => {
		let draftEnded = 0;
		for (let c = 0; c < clients.length; ++c) {
			// Pick randomly and retry on error
			const pick = (state) => {
				const cl = clients[c];
				cl.emit("rochesterDraftPick", [Math.floor(Math.random() * state.booster.length)], (response) => {
					if (response.code !== 0) pick(state);
				});
			};
			clients[c].on("rochesterDraftNextRound", function (state) {
				if (state.currentPlayer === clients[c].query.userID) pick(state);
			});
			clients[c].once("draftLog", function (draftLog) {
				draftEnded += 1;
				validate(c, draftLog);
				this.removeListener("rochesterDraftNextRound");
				if (draftEnded == clients.length) done();
			});
		}
		// Pick the first card
		let currPlayer = clients.findIndex((c) => c.query.userID == rochesterDraftState.currentPlayer);
		clients[currPlayer].emit("rochesterDraftPick", [0]);
	};
	test("Rochester Draft", startRochesterDraft, endRochesterDraft);

	// Note: Other game mode aren't tested yet.
});

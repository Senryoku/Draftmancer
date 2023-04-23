"use strict";
import { before, after, beforeEach, afterEach, describe, it } from "mocha";
import chai from "chai";
const expect = chai.expect;
import { Sessions } from "../src/Session.js";
import { Connections } from "../src/Connection.js";
import {
	makeClients,
	enableLogs,
	disableLogs,
	waitForSocket,
	waitForClientDisconnects,
	ackNoError,
} from "./src/common.js";
import { SolomonDraftSyncData, SolomonDraftStep } from "../src/SolomonDraft.js";
import { random, shuffleArray } from "../src/utils.js";
import { UniqueCardID } from "../src/CardTypes";
import { SocketAck, ackError } from "../src/Message";

for (const settings of [
	{ cardCount: 8, roundCount: 10 },
	{ cardCount: 9, roundCount: 9 },
	{ cardCount: 7, roundCount: 11 },
])
	describe(`Solomon Draft: ${JSON.stringify(settings)}`, function () {
		let clients: ReturnType<typeof makeClients> = [];
		let sessionID = "sessionID";
		let ownerIdx: number;
		let nonOwnerIdx: number;
		let states: Record<string, SolomonDraftSyncData> = {};

		// Get the current draft state, it should be the same for both players.
		function getState() {
			return Object.values(states).at(0)!;
		}

		const getCurrentPlayer = () => {
			const currentPlayerID = states[(clients[ownerIdx] as any).query.userID].currentPlayer;
			const currentPlayerIdx = clients.findIndex((c) => (c as any).query.userID === currentPlayerID);
			return clients[currentPlayerIdx];
		};

		beforeEach(function (done) {
			disableLogs();
			done();
		});

		afterEach(function (done) {
			enableLogs(this.currentTest?.state === "failed");
			done();
		});

		before(function (done) {
			const queries = [];
			for (let i = 0; i < 2; ++i)
				queries.push({
					userID: "id" + i,
					sessionID: sessionID,
					userName: "Client" + i,
				});
			clients = makeClients(queries, done);
		});

		after(function (done) {
			disableLogs();
			for (let c of clients) {
				c.disconnect();
			}
			waitForClientDisconnects(done);
		});

		it("2 clients with different userID should be connected.", function (done) {
			expect(Object.keys(Connections).length).to.equal(clients.length);
			done();
		});

		it("When session owner launch Solomon draft, everyone should receive a startSolomonDraft event", function (done) {
			ownerIdx = clients.findIndex((c) => (c as any).query.userID == Sessions[sessionID].owner);
			nonOwnerIdx = (ownerIdx + 1) % clients.length;
			let receivedStates = 0;
			for (const c of clients) {
				c.once("startSolomonDraft", function (state) {
					receivedStates += 1;
					states[(c as any).query.userID] = state;
					expect(state.roundCount).to.equal(settings.roundCount);
					expect(state.roundNum).to.equal(0);
					expect(state.piles).to.be.of.length(2);
					expect(state.step).to.equal("dividing");
					expect(state.currentPlayer).to.exist;
					if (receivedStates === clients.length) done();
				});
			}
			clients[ownerIdx].emit("startSolomonDraft", settings.cardCount, settings.roundCount, ackNoError);
		});

		function randomlyReorganize() {
			const ids = getState()
				.piles.flat()
				.map((card) => card.uniqueID);
			shuffleArray(ids);
			const randomIdx = random.integer(0, ids.length - 1);
			const piles = [ids.slice(0, randomIdx), ids.slice(randomIdx)] as [UniqueCardID[], UniqueCardID[]];
			getCurrentPlayer().emit("solomonDraftOrganize", piles, ackNoError);
			return piles;
		}

		function confirmPiles() {
			getCurrentPlayer().emit("solomonDraftConfirmPiles", ackNoError);
		}

		function randomPick() {
			const randomIdx = random.integer(0, 1) as 0 | 1;
			getCurrentPlayer().emit("solomonDraftPick", randomIdx, ackNoError);
		}

		function divisingStep() {
			it("Current player randomly reorganize piles", (done) => {
				expect(getState().step).to.be.eql("dividing");
				let updateReceived = 0;
				for (let c = 0; c < clients.length; ++c) {
					clients[c].once("solomonDraftUpdatePiles", (piles) => {
						expect(piles).to.be.of.length(2);
						expect(piles[0]).to.eql(sendPiles[0]);
						expect(piles[1]).to.eql(sendPiles[1]);
						++updateReceived;
						if (updateReceived === clients.length) done();
					});
				}
				const sendPiles = randomlyReorganize();
			});
			it("Current player confirm piles.", function (done) {
				expect(getState().step).to.be.eql("dividing");
				let updateReceived = 0;
				clients.forEach((c) =>
					c.once("solomonDraftState", (state) => {
						expect(state.step).to.be.eql("picking");
						states[(c as any).query.userID] = state;
						++updateReceived;
						if (updateReceived === clients.length) done();
					})
				);

				confirmPiles();
			});
		}

		function pickingStep() {
			it("Current player picks randomly.", function (done) {
				expect(getState().step).to.be.eql("picking");
				let pickReceived = 0;
				for (let c = 0; c < clients.length; ++c) {
					clients[c].once("solomonDraftState", (state) => {
						expect(state.step).to.be.eql("dividing");
						states[(clients[c] as any).query.userID] = state;
					});
					clients[c].once("solomonDraftPicked", (pileIdx) => {
						expect(pileIdx, "pileIdx should be 0 or 1").to.be.oneOf([0, 1]);
						++pickReceived;
						if (pickReceived === clients.length) done();
					});
				}
				randomPick();
			});
		}

		function oneRound() {
			divisingStep();
			pickingStep();
		}

		oneRound();

		it("should not be able to pick when is the divising step.", function (done) {
			expect(getState().step).to.equal("dividing");
			getCurrentPlayer().emit("solomonDraftPick", 0, (r: SocketAck) => {
				expect(r.code !== 0);
				done();
			});
		});

		divisingStep();

		it("should not be able to reorganize when is the picking step.", function (done) {
			expect(getState().step).to.equal("picking");
			const ids = getState()
				.piles.flat()
				.map((card) => card.uniqueID);
			shuffleArray(ids);
			const randomIdx = random.integer(0, ids.length - 1);
			const piles = [ids.slice(0, randomIdx), ids.slice(randomIdx)] as [UniqueCardID[], UniqueCardID[]];
			getCurrentPlayer().emit("solomonDraftOrganize", piles, (r: SocketAck) => {
				expect(r.code !== 0);
				done();
			});
		});

		it("should not be able to confirm piles when is the picking step.", function (done) {
			expect(getState().step).to.equal("picking");
			getCurrentPlayer().emit("solomonDraftConfirmPiles", (r: SocketAck) => {
				expect(r.code !== 0);
				done();
			});
		});

		pickingStep();

		it("Non-owner disconnects, owner receives updated user infos.", function (done) {
			clients[ownerIdx].once("userDisconnected", function () {
				waitForSocket(clients[nonOwnerIdx], done);
			});
			clients[nonOwnerIdx].disconnect();
		});

		it("Non-owner reconnects, draft restarts.", function (done) {
			clients[nonOwnerIdx].once("rejoinSolomonDraft", function (data) {
				expect(data.pickedCards).to.exist;
				expect(data.state).to.exist;
				states[(clients[nonOwnerIdx] as any).query.userID] = data.state;
				done();
			});
			clients[nonOwnerIdx].connect();
		});

		oneRound();

		it("Owner disconnects, non-owner receives updated user infos.", function (done) {
			clients[nonOwnerIdx].once("userDisconnected", function () {
				waitForSocket(clients[ownerIdx], done);
			});
			clients[ownerIdx].disconnect();
		});

		it("Owner reconnects, draft restarts.", function (done) {
			clients[ownerIdx].once("rejoinSolomonDraft", function (data) {
				expect(data.pickedCards).to.exist;
				expect(data.state).to.exist;
				ownerIdx = clients.findIndex((c) => (c as any).query.userID == Sessions[sessionID].owner);
				nonOwnerIdx = (ownerIdx + 1) % clients.length;
				done();
			});
			clients[ownerIdx].connect();
		});

		oneRound();

		it("Both the owner and a non-owner disconnects.", function (done) {
			clients[nonOwnerIdx].disconnect();
			clients[ownerIdx].disconnect();
			done();
		});

		it("Owner reconnects.", function (done) {
			clients[ownerIdx].once("rejoinSolomonDraft", function (data) {
				expect(data.pickedCards).to.exist;
				expect(data.state).to.exist;
				states[(clients[ownerIdx] as any).query.userID] = data.state;
				done();
			});
			clients[ownerIdx].connect();
		});

		it("Non-owner reconnects, draft restarts.", function (done) {
			clients[nonOwnerIdx].once("rejoinSolomonDraft", function (data) {
				expect(data.pickedCards).to.exist;
				expect(data.state).to.exist;
				states[(clients[nonOwnerIdx] as any).query.userID] = data.state;
				done();
			});
			clients[nonOwnerIdx].connect();
		});

		oneRound();

		it("Every player picks randomly until the draft ends.", function (done) {
			this.timeout(2000);
			const c = clients[0];

			const round = () => {
				if (states[(c as any).query.userID].step === "dividing") {
					randomlyReorganize();
					confirmPiles();
				} else {
					randomPick();
				}
			};

			c.on("solomonDraftState", function (state) {
				states[(c as any).query.userID] = state;
				round();
			});
			c.once("solomonDraftEnd", function () {
				c.removeListener("solomonDraftState");
				done();
			});

			round();
		});
	});

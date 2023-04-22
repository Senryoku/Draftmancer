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
import { HousmanDraftSyncData } from "../src/HousmanDraft.js";
import { random } from "../src/utils.js";

for (const settings of [
	{ playerCount: 2, handSize: 9, revealedCardsCount: 9, exchangeCount: 3, roundCount: 9 },
	{ playerCount: 4, handSize: 9, revealedCardsCount: 9, exchangeCount: 3, roundCount: 9 },
	{ playerCount: 2, handSize: 10, revealedCardsCount: 15, exchangeCount: 4, roundCount: 8 },
	{ playerCount: 4, handSize: 10, revealedCardsCount: 15, exchangeCount: 4, roundCount: 8 },
])
	describe(`Housman Draft: ${JSON.stringify(settings)}`, function () {
		let clients: ReturnType<typeof makeClients> = [];
		let sessionID = "sessionID";
		let ownerIdx: number;
		let nonOwnerIdx: number;
		let states: Record<string, HousmanDraftSyncData> = {};

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
			for (let i = 0; i < settings.playerCount; ++i)
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

		it(`${clients.length} clients with different userID should be connected.`, function (done) {
			expect(Object.keys(Connections).length).to.equal(clients.length);
			done();
		});

		it("When session owner launch Housman draft, everyone should receive a startHousmanDraft event", function (done) {
			ownerIdx = clients.findIndex((c) => (c as any).query.userID == Sessions[sessionID].owner);
			nonOwnerIdx = (ownerIdx + 1) % clients.length;
			let receivedStates = 0;
			for (const c of clients) {
				c.on("housmanDraftSync", function (state) {
					states[(c as any).query.userID] = state;
				});
				c.once("startHousmanDraft", function (state) {
					receivedStates += 1;
					states[(c as any).query.userID] = state;
					expect(state.exchangeNum).to.equal(0);
					expect(state.roundNum).to.equal(0);
					expect(state.currentPlayer).to.exist;
					expect(state.hand).to.exist;
					if (receivedStates === clients.length) done();
				});
			}
			clients[ownerIdx].emit(
				"startHousmanDraft",
				settings.handSize,
				settings.revealedCardsCount,
				settings.exchangeCount,
				settings.roundCount,
				ackNoError
			);
		});

		function randomPick(socket: ReturnType<typeof makeClients>[0], state: HousmanDraftSyncData) {
			const randomHandIdx = random.integer(0, state.hand.length - 1);
			const randomRevealedCardsIdx = random.integer(0, state.revealedCards.length - 1);
			socket.emit("housmanDraftPick", randomHandIdx, randomRevealedCardsIdx, ackNoError);
		}

		function oneRandomPick() {
			it("Current player picks randomly.", function (done) {
				let nextExchange = 0;
				for (let c = 0; c < clients.length; ++c) {
					clients[c].once("housmanDraftExchange", function (index, card, currentPlayer) {
						++nextExchange;
						expect(index, "index should exist").to.exist;
						expect(card, "card should exist").to.exist;
						expect(currentPlayer, "currentPlayer should exist").to.exist;
						states[(clients[c] as any).query.userID].revealedCards[index] = card;
						states[(clients[c] as any).query.userID].currentPlayer = currentPlayer;
						if (nextExchange === clients.length) done();
					});
				}
				randomPick(getCurrentPlayer(), states[(getCurrentPlayer() as any).query.userID]);
			});
		}

		oneRandomPick();

		it("Non-owner disconnects, owner receives updated user infos.", function (done) {
			clients[ownerIdx].once("userDisconnected", function () {
				waitForSocket(clients[nonOwnerIdx], done);
			});
			clients[nonOwnerIdx].disconnect();
		});

		it("Non-owner reconnects, draft restarts.", function (done) {
			clients[nonOwnerIdx].once("rejoinHousmanDraft", function (data) {
				states[(clients[nonOwnerIdx] as any).query.userID] = data.state;
				done();
			});
			clients[nonOwnerIdx].connect();
		});

		oneRandomPick();

		it("Owner disconnects, owner receives updated user infos.", function (done) {
			clients[nonOwnerIdx].once("userDisconnected", function () {
				waitForSocket(clients[ownerIdx], done);
			});
			clients[ownerIdx].disconnect();
		});

		it("Owner reconnects, draft restarts.", function (done) {
			clients[ownerIdx].once("rejoinHousmanDraft", function () {
				ownerIdx = clients.findIndex((c) => (c as any).query.userID == Sessions[sessionID].owner);
				nonOwnerIdx = (ownerIdx + 1) % clients.length;
				done();
			});
			clients[ownerIdx].connect();
		});

		oneRandomPick();

		it("Both the owner and a non-owner disconnects.", function (done) {
			clients[nonOwnerIdx].disconnect();
			clients[ownerIdx].disconnect();
			done();
		});

		it("Owner reconnects.", function (done) {
			clients[ownerIdx].once("rejoinHousmanDraft", function (data) {
				expect(data.pickedCards).to.exist;
				expect(data.state).to.exist;
				states[(clients[ownerIdx] as any).query.userID] = data.state;
				done();
			});
			clients[ownerIdx].connect();
		});

		it("Non-owner reconnects, draft restarts.", function (done) {
			clients[nonOwnerIdx].once("rejoinHousmanDraft", function (data) {
				expect(data.pickedCards).to.exist;
				expect(data.state).to.exist;
				states[(clients[nonOwnerIdx] as any).query.userID] = data.state;
				done();
			});
			clients[nonOwnerIdx].connect();
		});

		it("Every player picks randomly until the draft ends.", function (done) {
			this.timeout(2000);
			let draftEnded = 0;

			let nextExchange = 0;
			let round = 0;
			for (let c = 0; c < clients.length; ++c) {
				clients[c].on("housmanDraftExchange", function (index, card, currentPlayer) {
					++nextExchange;
					expect(index).to.exist;
					expect(card).to.exist;
					expect(currentPlayer).to.exist;
					states[(clients[c] as any).query.userID].revealedCards[index] = card;
					states[(clients[c] as any).query.userID].currentPlayer = currentPlayer;
					if (nextExchange === clients.length && draftEnded === 0) {
						nextExchange = 0;
						randomPick(getCurrentPlayer(), states[(getCurrentPlayer() as any).query.userID]);
					}
				});
				clients[c].on("housmanDraftRoundEnd", function (pickedCards) {
					++round;
				});
				clients[c].once("housmanDraftEnd", function () {
					draftEnded += 1;
					clients[c].removeListener("housmanDraftExchange");
					clients[c].removeListener("housmanDraftSync");
					clients[c].removeListener("housmanDraftRoundEnd");
					if (draftEnded == clients.length) done();
				});
			}
			randomPick(getCurrentPlayer(), states[(getCurrentPlayer() as any).query.userID]);
		});
	});

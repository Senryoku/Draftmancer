"use strict";
import { before, after, beforeEach, afterEach, describe, it } from "mocha";
import { expect } from "chai";
import { Sessions } from "../src/Session.js";
import { Connections } from "../src/Connection.js";
import {
	makeClients,
	enableLogs,
	disableLogs,
	waitForSocket,
	waitForClientDisconnects,
	ackNoError,
	getUID,
} from "./src/common.js";
import { SolomonDraftSyncData, SolomonDraftState } from "../src/SolomonDraft.js";
import { random, shuffleArray } from "../src/utils.js";
import { UniqueCardID } from "../src/CardTypes";
import { SocketAck, isMessageError } from "../src/Message.js";
import { getUnique } from "../src/Cards.js";

describe("SolomonDraftState", function () {
	const randomCard = "fcd63377-4a2a-4f9d-ba32-ba3f1faf2ce0";
	const cardPool = [];
	const cardCount = 8;
	const roundCount = 10;
	for (let i = 0; i < cardCount * roundCount; ++i) cardPool.push(getUnique(randomCard));
	const state = new SolomonDraftState(["0", "1"], cardCount, roundCount);
	state.init(cardPool);

	const reorganize = () => {
		const syncData = state.syncData();
		expect(syncData.step).to.eql("dividing");
		expect(
			isMessageError(
				state.reorganize([syncData.piles[1].map((c) => c.uniqueID), syncData.piles[0].map((c) => c.uniqueID)])
			)
		).to.be.false;
		expect(isMessageError(state.confirmPiles())).to.be.false;
	};

	const pick = () => {
		const syncData = state.syncData();
		expect(syncData.step).to.eql("picking");
		expect(isMessageError(state.pick(random.integer(0, 1) as 0 | 1))).to.be.false;
	};

	it("should start with player 0 dividing.", function () {
		expect(state.currentPlayer(), "Player 0 turn").to.eql("0");
		expect(state.step).to.eql("dividing");

		const syncData = state.syncData();
		expect(syncData.currentPlayer, "Player 0 turn").to.eql("0");
		expect(syncData.roundNum, "Round 0").to.eql(0);
		expect(syncData.step).to.eql("dividing");
		expect(syncData.piles[0].length + syncData.piles[1].length).to.eql(cardCount);
	});

	it("should not allow picking during dividing step.", function () {
		const syncData = state.syncData();
		expect(syncData.roundNum, "Round 0").to.eql(0);
		expect(syncData.currentPlayer, "Player 0 turn").to.eql("0");
		expect(isMessageError(state.pick(0))).to.be.true;
	});

	it("should allow player 0 to reorganize and confirm piles.", function () {
		const syncData = state.syncData();
		expect(syncData.roundNum, "Round 0").to.eql(0);
		expect(syncData.currentPlayer, "Player 0 turn").to.eql("0");
		reorganize();
	});

	it("should not allow dividing during picking step.", function () {
		const syncData = state.syncData();
		expect(syncData.roundNum, "Round 0").to.eql(0);
		expect(syncData.step).to.eql("picking");
		expect(syncData.currentPlayer, "Player 1 turn").to.eql("1");
		expect(
			isMessageError(
				state.reorganize([syncData.piles[1].map((c) => c.uniqueID), syncData.piles[0].map((c) => c.uniqueID)])
			)
		).to.be.true;
		expect(isMessageError(state.confirmPiles())).to.be.true;
	});

	it("should allow player 1 to pick a pile.", function () {
		const syncData = state.syncData();
		expect(syncData.roundNum, "Round 0").to.eql(0);
		expect(syncData.currentPlayer, "Player 1 turn").to.eql("1");
		pick();
	});

	it("should allow player 1 to reorganize and confirm piles.", function () {
		const syncData = state.syncData();
		expect(syncData.roundNum, "Round 1").to.eql(1);
		expect(syncData.currentPlayer, "Player 1 turn").to.eql("1");
		reorganize();
	});

	it("should allow player 0 to pick a pile.", function () {
		const syncData = state.syncData();
		expect(syncData.roundNum, "Round 1").to.eql(1);
		expect(syncData.currentPlayer, "Player 0 turn").to.eql("0");
		pick();
	});
});

for (const settings of [
	{ cardCount: 8, roundCount: 10, removeBasicLands: true },
	{ cardCount: 8, roundCount: 10, removeBasicLands: false },
	{ cardCount: 9, roundCount: 9, removeBasicLands: true },
	{ cardCount: 9, roundCount: 9, removeBasicLands: false },
	{ cardCount: 7, roundCount: 11, removeBasicLands: true },
	{ cardCount: 7, roundCount: 11, removeBasicLands: false },
])
	describe(`Solomon Draft: ${JSON.stringify(settings)}`, function () {
		let clients: ReturnType<typeof makeClients> = [];
		const sessionID = "sessionID";
		let ownerIdx: number;
		let nonOwnerIdx: number;
		let state: SolomonDraftSyncData | null;

		// Get the current draft state, it should be the same for both players.
		function getState() {
			return state!;
		}

		const getCurrentPlayer = () => {
			const currentPlayerID = getState().currentPlayer;
			const currentPlayerIdx = clients.findIndex((c) => getUID(c) === currentPlayerID);
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
			for (const c of clients) {
				c.disconnect();
			}
			waitForClientDisconnects(done);
		});

		it("2 clients with different userID should be connected.", function (done) {
			expect(Object.keys(Connections).length).to.equal(clients.length);
			done();
		});

		it("When session owner launch Solomon draft, everyone should receive a startSolomonDraft event", function (done) {
			ownerIdx = clients.findIndex((c) => getUID(c) === Sessions[sessionID].owner);
			nonOwnerIdx = (ownerIdx + 1) % clients.length;
			let receivedStates = 0;
			for (const c of clients) {
				c.once("startSolomonDraft", function (s) {
					receivedStates += 1;
					state = s;
					expect(s.roundCount).to.equal(settings.roundCount);
					expect(s.roundNum).to.equal(0);
					expect(s.piles).to.be.of.length(2);
					expect(s.step).to.equal("dividing");
					expect(s.currentPlayer).to.exist;
					if (receivedStates === clients.length) done();
				});
			}
			clients[ownerIdx].emit(
				"startSolomonDraft",
				settings.cardCount,
				settings.roundCount,
				settings.removeBasicLands,
				ackNoError
			);
		});

		function randomlyReorganize() {
			expect(getState().step).to.be.eql("dividing");
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
			expect(getState().step).to.be.eql("dividing");
			getCurrentPlayer().emit("solomonDraftConfirmPiles", ackNoError);
		}

		function randomPick() {
			expect(getState().step).to.be.eql("picking");
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
					c.once("solomonDraftState", (s) => {
						expect(s.step).to.be.eql("picking");
						state = s;
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
				let statesReceived = 0;
				for (let c = 0; c < clients.length; ++c) {
					clients[c].once("solomonDraftState", (s) => {
						expect(s.step).to.be.eql("dividing");
						state = s;
						++statesReceived;
						if (pickReceived === clients.length && statesReceived === clients.length) done();
					});
					clients[c].once("solomonDraftPicked", (pileIdx) => {
						expect(pileIdx, "pileIdx should be 0 or 1").to.be.oneOf([0, 1]);
						++pickReceived;
						if (pickReceived === clients.length && statesReceived === clients.length) done();
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

		it("should not be able to pick when in the divising step.", function (done) {
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
				state = data.state;
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
				ownerIdx = clients.findIndex((c) => getUID(c) === Sessions[sessionID].owner);
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
				state = data.state;
				done();
			});
			clients[ownerIdx].connect();
		});

		it("Non-owner reconnects, draft restarts.", function (done) {
			clients[nonOwnerIdx].once("rejoinSolomonDraft", function (data) {
				expect(data.pickedCards).to.exist;
				expect(data.state).to.exist;
				state = data.state;
				done();
			});
			clients[nonOwnerIdx].connect();
		});

		oneRound();

		it("Every player picks randomly until the draft ends.", function (done) {
			this.timeout(2000);
			const c = clients[0];

			const round = () => {
				if (getState().step === "dividing") {
					randomlyReorganize();
					confirmPiles();
				} else {
					randomPick();
				}
			};

			c.on("solomonDraftState", function (s) {
				state = s;
				round();
			});
			c.once("solomonDraftEnd", function () {
				c.removeListener("solomonDraftState");
				done();
			});

			round();
		});
	});

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
import { dump, random, shuffleArray } from "../src/utils.js";
import { SilentAuctionDraftResults, SilentAuctionDraftSyncData } from "../src/SilentAuctionDraft.js";
import { DefaultTiebreakers, Tiebreaker } from "../src/SilentAuctionDraftTiebreakers.js";

describe(`Silent Auction Draft`, function () {
	describe(`2 players`, function () {
		let clients: ReturnType<typeof makeClients> = [];
		const sessionID = "sessionID";
		let ownerIdx: number;
		let nonOwnerIdx: number;
		let state: SilentAuctionDraftSyncData | null;
		let result: SilentAuctionDraftResults | null;

		const CardsPerPack = 14; // Using TDM packs.

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

		it("Choose set.", function (done) {
			ownerIdx = clients.findIndex((c) => getUID(c) === Sessions[sessionID].owner);
			nonOwnerIdx = (ownerIdx + 1) % clients.length;
			clients[nonOwnerIdx].once("setRestriction", function (data) {
				expect(data).to.deep.equal(["tdm"]);
				done();
			});
			clients[ownerIdx].emit("setRestriction", ["tdm"]);
		});

		function randomBids() {
			return new Promise<void>((done) => {
				let receivedResults = 0;
				let receivedStates = 0;
				for (const c of clients) {
					if (state?.remainingPacks === 0) {
						c.once("silentAuctionDraftEnd", function () {
							receivedStates++;
							if (receivedResults === clients.length && receivedStates === clients.length) done();
						});
					} else {
						c.once("silentAuctionDraftSync", function (newState) {
							state = newState;
							receivedStates++;
							if (receivedResults === clients.length && receivedStates === clients.length) done();
						});
					}
					c.once("silentAuctionDraftResults", function () {
						receivedResults++;
						if (receivedResults === clients.length && receivedStates === clients.length) done();
					});
					const bids: number[] = [];
					let remainingFunds = state!.players.find((p) => p.userID === getUID(c))!.funds!;
					const bidCount = random.integer(1, CardsPerPack);
					for (let i = 0; i < bidCount; ++i) {
						const bid = random.integer(0, remainingFunds);
						bids.push(bid);
						remainingFunds -= bid;
					}
					while (bids.length < CardsPerPack) bids.push(0);
					shuffleArray(bids);
					c.emit("silentAuctionDraftBid", bids, ackNoError);
				}
			});
		}

		function clientBids(bids: number[][]) {
			return new Promise<void>((done) => {
				let receivedResults = 0;
				let receivedStates = 0;

				let nextState = null;

				const onUpdate = () => {
					if (receivedResults === clients.length && receivedStates === clients.length) {
						state = nextState!;
						clients.map((c) => c.off("silentAuctionDraftSync"));
						done();
					}
				};

				for (let idx = 0; idx < clients.length; ++idx) {
					const c = clients.find((c) => getUID(c) === state!.players[idx].userID)!;
					if (state?.remainingPacks === 0) {
						c.once("silentAuctionDraftEnd", function () {
							receivedStates++;
							onUpdate();
						});
					} else {
						c.on("silentAuctionDraftSync", function (newState) {
							if (newState.remainingPacks !== state!.remainingPacks) {
								nextState = newState;
								receivedStates++;
								onUpdate();
							}
						});
					}
					c.once("silentAuctionDraftResults", function (newResults) {
						result = newResults;
						receivedResults++;
						onUpdate();
					});
					c.emit("silentAuctionDraftBid", bids[idx], ackNoError);
				}
			});
		}

		function startSilentAuctionDraft(
			packCount: number = 18,
			startingFunds: number = 200,
			price: "first" | "second" = "first",
			reservePrice: number = 0,
			tiebreakers: readonly Tiebreaker[] = DefaultTiebreakers
		) {
			return new Promise<void>((done) => {
				let receivedStates = 0;
				for (const c of clients) {
					c.once("startSilentAuctionDraft", function (s) {
						receivedStates += 1;
						state = s;
						if (receivedStates === clients.length) done();
					});
				}
				clients[ownerIdx].emit(
					"startSilentAuctionDraft",
					packCount,
					startingFunds,
					price,
					reservePrice,
					tiebreakers as Tiebreaker[],
					ackNoError
				);
			});
		}

		it("When session owner launch Silent Auction draft, everyone should receive a startSilentAuctionDraft event", async function () {
			await startSilentAuctionDraft(18, 200, "first", 0, []);
		});

		it("One player bids, the other receives a notification", function (done) {
			clients[nonOwnerIdx].once("silentAuctionDraftNotifyBid", function (userID) {
				expect(userID).to.equal(getUID(clients[ownerIdx]));
				done();
			});
			clients[ownerIdx].emit("silentAuctionDraftBid", [10, 5, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0], ackNoError);
		});

		it("Tries to bid again, receives an error", function (done) {
			clients[ownerIdx].emit("silentAuctionDraftBid", [5, 10, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0], (err) => {
				expect(err.code).to.not.equal(0);
				expect(err.code).to.not.equal(500);
				done();
			});
		});

		it("Second player bids, both player should receive the results and the next state", function (done) {
			let receivedResults = 0;
			let receivedStates = 0;
			for (const c of clients) {
				c.once("silentAuctionDraftResults", function (results) {
					expect(results[0].winner).to.equal(getUID(clients[ownerIdx]));
					expect(results[1].winner).to.equal(getUID(clients[nonOwnerIdx]));
					receivedResults++;
					if (receivedResults === clients.length && receivedStates === clients.length) done();
				});
				c.once("silentAuctionDraftSync", function (newState) {
					if (state?.currentPack?.[0].uniqueID !== newState.currentPack?.[0].uniqueID) {
						receivedStates++;
						if (receivedResults === clients.length && receivedStates === clients.length) {
							state = newState;
							done();
						}
					}
				});
			}

			clients[nonOwnerIdx].emit("silentAuctionDraftBid", [5, 10, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0], ackNoError);
		});

		it("One player bids with an incorrect number of bids, receives an error", function (done) {
			clients[ownerIdx].emit("silentAuctionDraftBid", [10, 5, 0, 0, 0, 0], (err) => {
				expect(err.code).to.not.equal(0);
				expect(err.code).to.not.equal(500);
				done();
			});
		});

		it("One player bids with too many bids, receives an error", function (done) {
			clients[ownerIdx].emit(
				"silentAuctionDraftBid",
				[5, 10, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 8, 6],
				(err) => {
					expect(err.code).to.not.equal(0);
					expect(err.code).to.not.equal(500);
					done();
				}
			);
		});

		it("One player bids an excessive amount in a single bid, receives an error", function (done) {
			clients[ownerIdx].emit("silentAuctionDraftBid", [5000, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0], (err) => {
				expect(err.code).to.not.equal(0);
				expect(err.code).to.not.equal(500);
				done();
			});
		});

		it("One player bids more points than they have, receives an error", function (done) {
			clients[ownerIdx].emit(
				"silentAuctionDraftBid",
				[56, 89, 48, 34, 58, 58, 52, 32, 14, 58, 21, 24, 87, 12],
				(err) => {
					expect(err.code).to.not.equal(0);
					expect(err.code).to.not.equal(500);
					done();
				}
			);
		});

		it("They play one round.", async function () {
			await randomBids();
		});

		it("Non-owner disconnects, owner receives updated user infos.", function (done) {
			clients[ownerIdx].once("userDisconnected", function () {
				waitForSocket(clients[nonOwnerIdx], done);
			});
			clients[nonOwnerIdx].disconnect();
		});

		it("Non-owner reconnects, draft restarts.", function (done) {
			clients[nonOwnerIdx].once("rejoinSilentAuctionDraft", function (data) {
				expect(data.pickedCards).to.exist;
				expect(data.state).to.exist;
				state = data.state;
				done();
			});
			clients[nonOwnerIdx].connect();
		});

		it("They play one round.", async function () {
			await randomBids();
		});

		it("Owner disconnects, non-owner receives updated user infos.", function (done) {
			clients[nonOwnerIdx].once("userDisconnected", function () {
				waitForSocket(clients[ownerIdx], done);
			});
			clients[ownerIdx].disconnect();
		});

		it("Owner reconnects, draft restarts.", function (done) {
			clients[ownerIdx].once("rejoinSilentAuctionDraft", function (data) {
				expect(data.pickedCards).to.exist;
				expect(data.state).to.exist;
				ownerIdx = clients.findIndex((c) => getUID(c) === Sessions[sessionID].owner);
				nonOwnerIdx = (ownerIdx + 1) % clients.length;
				done();
			});
			clients[ownerIdx].connect();
		});

		it("They play one round.", async function () {
			await randomBids();
		});

		it("Both the owner and a non-owner disconnects.", function (done) {
			clients[nonOwnerIdx].disconnect();
			clients[ownerIdx].disconnect();
			done();
		});

		it("Owner reconnects.", function (done) {
			clients[ownerIdx].once("rejoinSilentAuctionDraft", function (data) {
				expect(data.pickedCards).to.exist;
				expect(data.state).to.exist;
				state = data.state;
				done();
			});
			clients[ownerIdx].connect();
		});

		it("Non-owner reconnects, draft restarts.", function (done) {
			clients[nonOwnerIdx].once("rejoinSilentAuctionDraft", function (data) {
				expect(data.pickedCards).to.exist;
				expect(data.state).to.exist;
				state = data.state;
				done();
			});
			clients[nonOwnerIdx].connect();
		});

		it("They play one round.", async function () {
			await randomBids();
		});

		it("Every player picks randomly until the draft ends.", function (done) {
			this.timeout(2000);

			let endReceived = 0;
			for (const c of clients) {
				c.once("silentAuctionDraftEnd", function () {
					endReceived++;
					if (endReceived === clients.length) done();
				});
			}

			async function nextRound() {
				if (endReceived === 0) {
					await randomBids();
					nextRound();
				}
			}

			nextRound();
		});

		it("When session owner launch Silent Auction draft, everyone should receive a startSilentAuctionDraft event", async function () {
			await startSilentAuctionDraft(18, 200, "first", 0, []);
		});

		it("They play one round.", async function () {
			await randomBids();
		});

		it("Owner stops the draft", function (done) {
			clients[nonOwnerIdx].once("silentAuctionDraftEnd", function () {
				done();
			});
			clients[ownerIdx].emit("stopDraft");
		});

		it("Bidding should now return an error", function (done) {
			clients[ownerIdx].emit("silentAuctionDraftBid", [10, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0], (err) => {
				expect(err.code).to.not.equal(0);
				expect(err.code).to.not.equal(500);
				done();
			});
		});

		it("First price", async function () {
			await startSilentAuctionDraft(2, 100, "first");
			await clientBids([
				[10, 0, 10, 5, 15, 1, 0, 0, 0, 0, 0, 0, 0, 0],
				[0, 10, 5, 10, 1, 15, 0, 0, 0, 0, 0, 0, 0, 0],
			]);
			const pids = state!.players.map((p) => p.userID);
			expect(result).to.not.be.null;
			if (result) {
				expect(result).to.have.length(14);
				expect(result[0].winner).to.equal(pids[0]);
				expect(result[1].winner).to.equal(pids[1]);
				expect(result[2].winner).to.equal(pids[0]);

				expect(result[3].winner).to.equal(pids[1]);

				expect(result[4].winner).to.equal(pids[0]);
				expect(result[4].bids[0].userID).to.equal(pids[0]);
				expect(result[4].bids[0].funds).to.equal(100 - (10 + 10));

				expect(result[5].winner).to.equal(pids[1]);
				expect(result[5].bids[0].userID).to.equal(pids[1]);
				expect(result[5].bids[0].funds).to.equal(100 - (10 + 10));
				expect(result[5].bids[1].funds).to.equal(100 - (10 + 10 + 15));
			}
			expect(state).to.not.be.null;
			if (state) {
				expect(state.players[0].funds).to.equal(100 - 35);
				expect(state.players[1].funds).to.equal(100 - 35);
			}
			// End draft
			await randomBids();
		});

		it("Second price", async function () {
			await startSilentAuctionDraft(2, 100, "second");
			await clientBids([
				[10, 0, 10, 5, 15, 1, 0, 0, 0, 0, 0, 0, 0, 0],
				[0, 10, 5, 10, 1, 15, 0, 0, 0, 0, 0, 0, 0, 0],
			]);
			const pids = state!.players.map((p) => p.userID);
			expect(result).to.not.be.null;
			if (result) {
				expect(result).to.have.length(14);
				expect(result[0].winner).to.equal(pids[0]);
				expect(result[1].winner).to.equal(pids[1]);
				expect(result[2].winner).to.equal(pids[0]);

				expect(result[3].winner).to.equal(pids[1]);

				expect(result[4].winner).to.equal(pids[0]);
				expect(result[4].bids[0].userID).to.equal(pids[0]);
				expect(result[4].bids[0].funds).to.equal(100 - 5);

				expect(result[5].winner).to.equal(pids[1]);
				expect(result[5].bids[0].userID).to.equal(pids[1]);
				expect(result[5].bids[0].funds).to.equal(100 - 5);
				expect(result[5].bids[1].funds).to.equal(100 - (5 + 1));
			}
			expect(state).to.not.be.null;
			if (state) {
				expect(state.players[0].funds).to.equal(100 - (5 + 1));
				expect(state.players[1].funds).to.equal(100 - (5 + 1));
			}
			await randomBids();
		});

		describe("Tiebreakers", function () {
			it("Default settings", async function () {
				await startSilentAuctionDraft(2, 100, "first");
				await clientBids([
					[10, 0, 10, 5, 15, 1, 0, 0, 0, 0, 0, 0, 0, 0],
					[0, 10, 5, 10, 1, 14, 0, 1, 0, 0, 0, 0, 0, 0],
					//0  1  2  3   4   5  6  7  8  9 10 11 12 13
				]);
				const pids = state!.players.map((p) => p.userID);
				expect(result).to.not.be.null;
				if (result) {
					expect(result).to.have.length(14);
					expect(result[0].winner).to.equal(pids[0]);
					expect(result[1].winner).to.equal(pids[1]);
					expect(result[2].winner).to.equal(pids[0]);
					expect(result[3].winner).to.equal(pids[1]);
					expect(result[4].winner).to.equal(pids[0]);
					expect(result[5].winner).to.equal(pids[1]);
					//
					expect(result[6].winner).to.equal(pids[1]);
					expect(result[7].winner).to.equal(pids[1]);
					// pids[1] has 2 more cards
					expect(result[8].winner).to.equal(pids[0]);
					expect(result[9].winner).to.equal(pids[0]);
					// Even ones are random, then it should alternate.
					for (let i = 10; i < 13; i += 2) expect(result[i].winner).to.not.equal(result[i + 1].winner);
				}
				expect(state).to.not.be.null;
				if (state) {
					expect(state.players[0].funds).to.equal(100 - 35);
					expect(state.players[1].funds).to.equal(100 - 35);
				}
				await randomBids();
			});

			it(`[{ property: "cards", winner: "lower" }]`, async function () {
				await startSilentAuctionDraft(2, 100, "first", 0, [{ property: "cards", winner: "lower" }]);
				await clientBids([
					[0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0],
					[0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0],
				]);
				expect(result).to.not.be.null;
				if (result) {
					expect(result).to.have.length(14);
					// Even ones are random, then it should alternate.
					for (let i = 0; i < 13; i += 2) expect(result[i].winner).to.not.equal(result[i + 1].winner);
				}
				expect(state).to.not.be.null;
				await randomBids();
			});
		});
	});
});

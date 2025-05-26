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
import { random, shuffleArray } from "../src/utils.js";
import { SilentAuctionDraftSyncData } from "../src/SilentAuctionDraft.js";

describe(`Silent Auction Draft`, function () {
	describe(`2 players`, function () {
		let clients: ReturnType<typeof makeClients> = [];
		const sessionID = "sessionID";
		let ownerIdx: number;
		let nonOwnerIdx: number;
		let state: SilentAuctionDraftSyncData | null;

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

		function randomBids(done: () => void) {
			let receivedResults = 0;
			let receivedStates = 0;
			for (const c of clients) {
				c.once("silentAuctionDraftSync", function (newState) {
					state = newState;
					receivedStates++;
					if (receivedResults === clients.length && receivedStates === clients.length) done();
				});
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
		}

		function startSilentAuctionDraft(
			packCount: number = 18,
			startingFunds: number = 200,
			price: "first" | "second" = "first",
			reservePrice: number = 0
		) {
			it("When session owner launch Silent Auction draft, everyone should receive a startSilentAuctionDraft event", function (done) {
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
					ackNoError
				);
			});
		}

		startSilentAuctionDraft();

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

		it("They play one round.", function (done) {
			randomBids(done);
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

		it("They play one round.", function (done) {
			randomBids(done);
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

		it("They play one round.", function (done) {
			randomBids(done);
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

		it("They play one round.", function (done) {
			randomBids(done);
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

			function nextRound() {
				if (endReceived === 0) randomBids(nextRound);
			}

			nextRound();
		});

		startSilentAuctionDraft();
		it("They play one round.", function (done) {
			randomBids(done);
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
	});
});

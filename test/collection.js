"use strict";

import { describe, it, beforeEach, afterEach, before, after } from "mocha";
import chai from "chai";
const expect = chai.expect;
import { getCard } from "./../dist/Cards.js";
import { Sessions } from "../dist/Session.js";
import { makeClients, enableLogs, disableLogs, waitForClientDisconnects } from "./src/common.js";

import MTGACards from "../client/src/data/MTGACards.json";

describe("Collection Restriction", function () {
	let clients = [];
	let sessionID = "sessionID";
	let collections;
	let ownerIdx;

	const MTGAIDs = Object.keys(MTGACards);

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

	it(`Submit random collections.`, function (done) {
		collections = Array(clients.length).fill({});
		// Generate random collections
		for (let cid of MTGAIDs) {
			for (let c = 0; c < clients.length; ++c) {
				let cardCount = Math.floor(Math.random() * 5);
				if (cardCount > 0) collections[c][cid] = cardCount;
			}
		}

		let sendCollections = 0;
		for (let c = 0; c < clients.length; ++c) {
			clients[c].emit("setCollection", collections[c], () => {
				++sendCollections;
				if (sendCollections === clients.length) done();
			});
		}
	});

	it(`All cards in Session collection should be in all user collections.`, function (done) {
		const sessColl = Sessions[sessionID].collection();
		for (let cid in sessColl) {
			const arena_id = getCard(cid).arena_id;
			for (let col of collections) {
				expect(col).to.have.own.property(arena_id);
				expect(col[arena_id]).gte(sessColl[cid]);
			}
		}
		done();
	});

	it(`All cards in Session Card Pool (e.g. Session collection with applied set restrictions) should be in all user collections.`, function (done) {
		const sessCardPool = Sessions[sessionID].cardPool();
		for (let cid in sessCardPool) {
			const arena_id = getCard(cid).arena_id;
			for (let col of collections) {
				expect(col).to.have.own.property(arena_id);
				expect(col[arena_id]).gte(sessCardPool[cid]);
			}
		}
		done();
	});

	for (let set of ["znr", "stx"]) {
		it(`Select ${set} as a known MTGA set.`, function (done) {
			ownerIdx = clients.findIndex((c) => c.query.userID == Sessions[sessionID].owner);

			clients[(ownerIdx + 1) % clients.length].once("setRestriction", () => {
				done();
			});
			clients[ownerIdx].emit("setRestriction", [set]);
		});

		it(`Start a draft with default settings (May fail randomly if there's not enough cards in random collections, but seems unlikely).`, function (done) {
			let connectedClients = 0;
			let receivedBoosters = 0;
			for (let c in clients) {
				clients[c].once("startDraft", function () {
					connectedClients += 1;
					if (connectedClients == clients.length && receivedBoosters == clients.length) done();
				});

				(() => {
					clients[c].once("draftState", function (state) {
						expect(state.boosterCount).to.equal(1);
						expect(state.booster).to.exist;
						receivedBoosters += 1;
						clients[c].state = state;
						if (connectedClients == clients.length && receivedBoosters == clients.length) done();
					});
				})();
			}
			clients[ownerIdx].emit("startDraft");
		});

		it(`All cards in generated boosters (default settings) should be in all user collections.`, function (done) {
			for (let booster of Sessions[sessionID].boosters) {
				for (let card of booster) {
					const arena_id = card.arena_id;
					for (let col of collections) {
						expect(col).to.have.own.property(arena_id);
					}
				}
			}
			done();
		});

		it("End draft.", function (done) {
			this.timeout(20000);
			let draftEnded = 0;
			for (let c = 0; c < clients.length; ++c) {
				clients[c].on("draftState", function (state) {
					if (state.pickNumber !== clients[c].state.pickNumber && state.boosterCount > 0) {
						this.emit("pickCard", { pickedCards: [0] }, () => {});
						clients[c].state = state;
					}
				});
				clients[c].once("endDraft", function () {
					draftEnded += 1;
					this.removeListener("draftState");
					if (draftEnded == clients.length) done();
				});
			}
			for (let c = 0; c < clients.length; ++c) {
				clients[c].emit("pickCard", { pickedCards: [0] }, () => {});
			}
		});
	}
});

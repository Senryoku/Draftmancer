"use strict";

import { describe, it, beforeEach, afterEach, before, after } from "mocha";
import chai from "chai";
const expect = chai.expect;
import { getCard } from "../src/Cards.js";
import { Sessions } from "../src/Session.js";
import { makeClients, enableLogs, disableLogs, waitForClientDisconnects, ackNoError, getUID } from "./src/common.js";

import MTGACards from "../client/src/data/MTGACards.json" assert { type: "json" };
import { PlainCollection, UniqueCard } from "../src/CardTypes.js";

describe("Collection Restriction", function () {
	let clients: ReturnType<typeof makeClients> = [];
	const sessionID = "sessionID";
	let collections: PlainCollection[] = [];
	let ownerIdx = 0;

	const MTGAIDs = Object.keys(MTGACards).map((str) => parseInt(str));

	beforeEach(function (done) {
		disableLogs();
		done();
	});

	afterEach(function (done) {
		enableLogs(this.currentTest!.state == "failed");
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
		for (const c of clients) {
			c.disconnect();
		}
		waitForClientDisconnects(done);
	});

	it(`Submit random collections.`, function (done) {
		collections = Array(clients.length).fill({});
		// Generate random collections
		for (const cid of MTGAIDs) {
			for (let c = 0; c < clients.length; ++c) {
				const cardCount = Math.floor(Math.random() * 5);
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
		for (const [cid /*count*/] of sessColl) {
			const arena_id = getCard(cid).arena_id!;
			for (const col of collections) {
				expect(col).to.have.own.property(arena_id.toString());
				expect(col[arena_id]).gte(sessColl.get(cid)!);
			}
		}
		done();
	});

	it(`All cards in Session Card Pool (e.g. Session collection with applied set restrictions) should be in all user collections.`, function (done) {
		const sessCardPool = Sessions[sessionID].cardPool();
		for (const [cid /*count*/] of sessCardPool) {
			const arena_id = getCard(cid).arena_id!;
			for (const col of collections) {
				expect(col).to.have.own.property(arena_id.toString());
				expect(col[arena_id]).gte(sessCardPool.get(cid)!);
			}
		}
		done();
	});

	for (const set of ["znr", "stx"]) {
		it(`Select ${set} as a known MTGA set.`, function (done) {
			ownerIdx = clients.findIndex((c) => getUID(c) === Sessions[sessionID].owner);

			clients[(ownerIdx + 1) % clients.length].once("setRestriction", () => {
				done();
			});
			clients[ownerIdx].emit("setRestriction", [set]);
		});
		it(`Set Ignore Collections to false.`, function (done) {
			clients[(ownerIdx + 1) % clients.length].once("ignoreCollections", (value) => {
				expect(value).to.be.false;
				done();
			});
			clients[ownerIdx].emit("ignoreCollections", false);
		});

		it(`Start a draft with default settings (May fail randomly if there's not enough cards in random collections, but seems unlikely).`, function (done) {
			let connectedClients = 0;
			let receivedBoosters = 0;
			for (const c in clients) {
				clients[c].once("startDraft", function () {
					connectedClients += 1;
					if (connectedClients == clients.length && receivedBoosters == clients.length) done();
				});

				(() => {
					clients[c].once("draftState", function (state) {
						const s = state as {
							booster: UniqueCard[];
							boosterCount: number;
							boosterNumber: number;
							pickNumber: 0;
						};
						expect(s.boosterCount).to.equal(1);
						expect(s.booster).to.exist;
						receivedBoosters += 1;
						(clients[c] as any).state = state;
						if (connectedClients == clients.length && receivedBoosters == clients.length) done();
					});
				})();
			}
			clients[ownerIdx].emit("startDraft", ackNoError);
		});

		it("End draft. All cards in generated boosters (default settings) should be in all user collections.", function (done) {
			this.timeout(20000);
			let draftEnded = 0;
			for (let c = 0; c < clients.length; ++c) {
				clients[c].on("draftState", function (state) {
					const s = state as {
						booster: UniqueCard[];
						boosterCount: number;
						boosterNumber: number;
						pickNumber: 0;
					};
					if (s.pickNumber !== (clients[c] as any).state.pickNumber && s.boosterCount > 0) {
						for (const card of s.booster)
							for (const col of collections) {
								expect(
									col,
									"All cards should be in the intersection of player collections."
								).to.have.own.property(card.arena_id!.toString());
							}
						clients[c].emit("pickCard", { pickedCards: [0], burnedCards: [] }, () => {});
						(clients[c] as any).state = s;
					}
				});
				clients[c].once("endDraft", function () {
					draftEnded += 1;
					clients[c].removeListener("draftState");
					if (draftEnded == clients.length) done();
				});
			}
			for (let c = 0; c < clients.length; ++c) {
				clients[c].emit("pickCard", { pickedCards: [0], burnedCards: [] }, () => {});
			}
		});
	}
});

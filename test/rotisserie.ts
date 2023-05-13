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
	ValidCubes,
	getUID,
} from "./src/common.js";
import { RotisserieDraftCard, RotisserieDraftStartOptions, RotisserieDraftSyncData } from "../src/RotisserieDraft.js";
import { getRandom } from "../src/utils.js";
import { SetCode } from "../src/Types.js";
import { UserID } from "../src/IDTypes.js";

describe("Rotisserie Draft", function () {
	let clients: ReturnType<typeof makeClients> = [];
	const sessionID = "sessionID";
	let ownerIdx: number = 0;

	beforeEach(function (done) {
		disableLogs();
		done();
	});

	afterEach(function (done) {
		enableLogs(this.currentTest!.state == "failed");
		done();
	});

	before(function (done) {
		const queries = [];
		for (let i = 0; i < 8; ++i) {
			queries.push({
				userID: "id" + i,
				sessionID: sessionID,
				userName: "Client" + i,
			});
		}
		clients = makeClients(queries, done);
	});

	after(function (done) {
		disableLogs();
		for (const c of clients) {
			c.disconnect();
		}
		waitForClientDisconnects(done);
	});

	it(`6 clients with different userID should be connected.`, function (done) {
		expect(Object.keys(Connections).length).to.equal(clients.length);
		ownerIdx = clients.findIndex((c) => getUID(c) === Sessions[sessionID].owner);
		expect(ownerIdx).to.not.be.null;
		expect(ownerIdx).to.not.be.undefined;
		done();
	});

	let RotisserieDraftState: RotisserieDraftSyncData | null = null;
	const PlayerCards: { [uid: UserID]: RotisserieDraftCard[] } = {};

	const setRestriction = (sets: SetCode[]) => {
		it(`Set restriction: '${sets}'.`, (done) => {
			clients[ownerIdx].emit("setRestriction", sets);
			done();
		});
	};

	const loadCube = () => {
		it("Load cube.", (done) => {
			const nonOwnerIdx = (ownerIdx + 1) % clients.length;
			clients[nonOwnerIdx].once("sessionOptions", (options) => {
				expect(options.useCustomCardList).to.be.true;
				done();
			});
			clients[ownerIdx].emit("loadLocalCustomCardList", "Arena Historic Cube #1", ackNoError);
		});
	};
	const loadCubeFile = (cubename: string) => {
		it(`Load cube '${cubename}'.`, (done) => {
			clients[ownerIdx].emit("parseCustomCardList", ValidCubes[cubename], (r) => {
				expect(r.code).to.equal(0);
				done();
			});
		});
	};
	const checkCardCount = (cardCount: number) => {
		it(`Each player should end up with ${cardCount} cards.`, (done) => {
			for (const client of clients) {
				expect(PlayerCards[(client as any).query.userID].length).to.equal(cardCount);
			}
			done();
		});
	};

	const startDraft = (options: RotisserieDraftStartOptions) => {
		it("When session owner launch Rotisserie draft, everyone should receive a startRotisserieDraft event", (done) => {
			let connectedClients = 0;
			for (const c of clients) {
				PlayerCards[(c as any).query.userID] = [];
				c.once("startRotisserieDraft", (state) => {
					connectedClients += 1;
					if (options.singleton) {
						if (options.singleton.exactCardCount) {
							expect(state.cards.length).to.equal(clients.length * options.singleton.cardsPerPlayer);
						}
					}
					if (connectedClients == clients.length) {
						RotisserieDraftState = state;
						done();
					}
				});
			}
			clients[ownerIdx].emit("startRotisserieDraft", options, ackNoError);
		});
	};

	const endDraft = () => {
		it("Every player randomly chooses a card and the draft should end.", (done) => {
			let draftEnded = 0;
			let updatedPlayers = 0;

			const pick = (state: RotisserieDraftSyncData) => {
				// Pick a random non-picked card
				const card = getRandom(state.cards.filter((c) => c.owner === null));
				if (card) {
					clients
						.find((c) => (c as any).query.userID === state.currentPlayer)!
						.emit("rotisserieDraftPick", card.uniqueID, ackNoError);
					PlayerCards[state.currentPlayer].push(card);
				}
			};

			for (let c = 0; c < clients.length; ++c) {
				clients[c].on("rotisserieDraftUpdateState", (uniqueCardID, newOwnerID, currentPlayer) => {
					++updatedPlayers;
					if (updatedPlayers === clients.length) {
						updatedPlayers = 0;
						const updatedCard = RotisserieDraftState!.cards.find((c) => c.uniqueID === uniqueCardID);
						expect(updatedCard).to.exist;
						updatedCard!.owner = newOwnerID;
						RotisserieDraftState!.currentPlayer = currentPlayer;
						pick(RotisserieDraftState!);
					}
				});
				clients[c].once("rotisserieDraftEnd", () => {
					draftEnded += 1;
					if (draftEnded == clients.length) {
						for (const client of clients) client.removeListener("rotisserieDraftUpdateState");
						done();
					}
				});
			}
			pick(RotisserieDraftState!);
		});
	};

	describe("Default settings", () => {
		setRestriction(["one", "bro"]);
		startDraft({ singleton: { cardsPerPlayer: 45, exactCardCount: false } });
		endDraft();
	});

	describe("Default settings, single set, not enough cards.", () => {
		setRestriction(["one"]);
		it("Stating should error (not enough cards)", (done) => {
			clients[ownerIdx].emit(
				"startRotisserieDraft",
				{ singleton: { cardsPerPlayer: 45, exactCardCount: false } },
				(r) => {
					expect(r.code !== 0);
					done();
				}
			);
		});
	});

	describe("Default settings with a disconnect", () => {
		setRestriction(["one", "bro"]);
		startDraft({ singleton: { cardsPerPlayer: 45, exactCardCount: false } });

		it("Non-owner disconnects, owner receives updated user infos.", (done) => {
			const nonOwnerIdx = (ownerIdx + 1) % clients.length;
			clients[ownerIdx].once("userDisconnected", () => {
				waitForSocket(clients[nonOwnerIdx], done);
			});
			clients[nonOwnerIdx].disconnect();
		});

		it("Non-owner reconnects, draft restarts.", (done) => {
			const nonOwnerIdx = (ownerIdx + 1) % clients.length;
			clients[nonOwnerIdx].once("rejoinRotisserieDraft", () => {
				done();
			});
			clients[nonOwnerIdx].connect();
		});

		endDraft();
	});

	describe("Default setting, using a Cube", () => {
		loadCube();
		startDraft({ singleton: { cardsPerPlayer: 45, exactCardCount: false } });
		endDraft();

		it("Disable Cube.", (done) => {
			clients[ownerIdx].emit("setUseCustomCardList", false);
			done();
		});
	});

	for (const exactCardCount of [false, true]) {
		for (let i = 30; i <= 60; i += 15) {
			describe(`Singleton, ${i} cards per player, exactCardCount: ${exactCardCount}.`, () => {
				setRestriction(["one", "bro"]);
				startDraft({ singleton: { cardsPerPlayer: i, exactCardCount: exactCardCount } });
				endDraft();
				checkCardCount(i);
			});
		}

		for (let i = 30; i <= 45; i += 5) {
			describe(`Singleton, ${i} cards per player, exactCardCount: ${exactCardCount}, using a cube`, () => {
				loadCube();
				startDraft({ singleton: { cardsPerPlayer: i, exactCardCount: exactCardCount } });
				endDraft();
				checkCardCount(i);
			});
		}

		describe(`Singleton, 70 cards per player, using a cube, exactCardCount: ${exactCardCount}.`, () => {
			loadCube();
			it("Starting should error (not enough cards)", (done) => {
				clients[ownerIdx].emit(
					"startRotisserieDraft",
					{ singleton: { cardsPerPlayer: 70, exactCardCount: exactCardCount } },
					(r) => {
						expect(r.code).to.not.equal(0);
						done();
					}
				);
			});
		});

		describe("Reset Session settings", () => {
			it("Disable Cube.", (done) => {
				clients[ownerIdx].emit("setUseCustomCardList", false);
				done();
			});
		});
	}

	for (let i = 3; i <= 6; ++i) {
		describe(`Standard collation, ${i} boosters per player.`, () => {
			setRestriction(["one"]);
			startDraft({ standard: { boostersPerPlayer: i } });
			endDraft();
			checkCardCount(14 * i);
		});
	}

	for (let i = 3; i <= 4; ++i) {
		describe(`Standard collation, ${i} boosters per player, using a cube`, () => {
			loadCube();
			startDraft({ standard: { boostersPerPlayer: i } });
			endDraft();
			checkCardCount(15 * i);
		});
	}

	// Some example cubes do not have enough unique cards for singleton.
	for (const key of Object.keys(ValidCubes).filter(
		(k) =>
			![
				"CustomCards_NoLayout",
				"CustomCards_SlotSize",
				"WithReplacement",
				"WithReplacementLayouts",
				"DOMLayoutExample",
				"CustomCards_RelatedCards",
			].includes(k)
	)) {
		describe(`Singleton collation, '${key}' cube.`, () => {
			loadCubeFile(key);
			startDraft({ singleton: { cardsPerPlayer: 30, exactCardCount: true } });
			endDraft();
			checkCardCount(30);
		});
	}
	for (const key of Object.keys(ValidCubes).filter(
		(k) => !["WithReplacement", "WithReplacementLayouts"].includes(k)
	)) {
		describe(`Standard collation, '${key}' cube.`, () => {
			loadCubeFile(key);
			startDraft({ standard: { boostersPerPlayer: 3 } });
			endDraft();
			// These cubes have different number of cards per booster.
		});
	}

	for (const key of ["WithReplacement", "WithReplacementLayouts"]) {
		describe(`Standard collation, '${key}' cube.`, () => {
			it(`Set withReplacement.`, (done) => {
				clients[ownerIdx].emit("setCustomCardListWithReplacement", true);
				done();
			});
			loadCubeFile(key);
			startDraft({ standard: { boostersPerPlayer: 3 } });
			endDraft();
		});
	}
});

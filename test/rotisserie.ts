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
	Cubes,
} from "./src/common.js";
import { RotisserieDraftSyncData } from "../src/RotisserieDraft.js";
import { getRandom } from "../src/utils.js";
import { SocketAck } from "../src/Message.js";
import { SetCode } from "../src/Types.js";

describe("Rotisserie Draft", function () {
	let clients: ReturnType<typeof makeClients> = [];
	let sessionID = "sessionID";
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
		for (let c of clients) {
			c.disconnect();
		}
		waitForClientDisconnects(done);
	});

	it(`6 clients with different userID should be connected.`, function (done) {
		expect(Object.keys(Connections).length).to.equal(clients.length);
		ownerIdx = clients.findIndex((c) => (c as any).query.userID == Sessions[sessionID].owner);
		expect(ownerIdx).to.not.be.null;
		expect(ownerIdx).to.not.be.undefined;
		done();
	});

	let RotisserieDraftState: RotisserieDraftSyncData | null = null;

	const setRestriction = (sets: SetCode[]) => {
		it(`Set restriction: '${sets}'.`, (done) => {
			clients[ownerIdx].emit("setRestriction", sets);
			done();
		});
	};

	const loadCube = () => {
		it("Load cube.", (done) => {
			let nonOwnerIdx = (ownerIdx + 1) % clients.length;
			clients[nonOwnerIdx].once("sessionOptions", (options) => {
				expect(options.useCustomCardList).to.be.true;
				done();
			});
			clients[ownerIdx].emit("loadLocalCustomCardList", "Arena Historic Cube #1", ackNoError);
		});
	};
	const loadCubeFile = (cubename: string) => {
		it(`Load cube '${cubename}'.`, (done) => {
			clients[ownerIdx].emit("parseCustomCardList", Cubes[cubename], (r) => {
				expect(r.code).to.equal(0);
				done();
			});
		});
	};
	const checkCardCount = (cardCount: number) => {
		it(`Each player should end up with ${cardCount} cards.`, (done) => {
			for (const client of clients) {
				expect(
					RotisserieDraftState?.cards.filter((card) => card.owner == (client as any).query.userID).length
				).to.equal(cardCount);
			}
			done();
		});
	};

	const startDraft = (options: {
		singleton?: { cardsPerPlayer: number };
		standard?: { boostersPerPlayer: number };
	}) => {
		it("When session owner launch Rotisserie draft, everyone should receive a startRotisserieDraft event", (done) => {
			let connectedClients = 0;
			for (let c of clients) {
				c.once("startRotisserieDraft", (state) => {
					connectedClients += 1;
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
				if (card)
					clients
						.find((c) => (c as any).query.userID === state.currentPlayer)!
						.emit("rotisserieDraftPick", card.uniqueID, ackNoError);
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
					clients[c].removeListener("rotisserieDraftUpdateState");
					if (draftEnded == clients.length) done();
				});
			}
			pick(RotisserieDraftState!);
		});
	};

	describe("Default settings", () => {
		setRestriction(["one", "bro"]);
		startDraft({ singleton: { cardsPerPlayer: 45 } });
		endDraft();
	});

	describe("Default settings, single set, not enough cards.", () => {
		setRestriction(["one"]);
		it("Stating should error (not enough cards)", (done) => {
			clients[ownerIdx].emit("startRotisserieDraft", { singleton: { cardsPerPlayer: 45 } }, (r) => {
				expect(r.code !== 0);
				done();
			});
		});
	});

	describe("Default settings with a disconnect", () => {
		setRestriction(["one", "bro"]);
		startDraft({ singleton: { cardsPerPlayer: 45 } });

		it("Non-owner disconnects, owner receives updated user infos.", (done) => {
			let nonOwnerIdx = (ownerIdx + 1) % clients.length;
			clients[ownerIdx].once("userDisconnected", () => {
				waitForSocket(clients[nonOwnerIdx], done);
			});
			clients[nonOwnerIdx].disconnect();
		});

		it("Non-owner reconnects, draft restarts.", (done) => {
			let nonOwnerIdx = (ownerIdx + 1) % clients.length;
			clients[nonOwnerIdx].once("rejoinRotisserieDraft", () => {
				done();
			});
			clients[nonOwnerIdx].connect();
		});

		endDraft();
	});

	describe("Default setting, using a Cube", () => {
		loadCube();
		startDraft({ singleton: { cardsPerPlayer: 45 } });
		endDraft();
	});

	for (let i = 30; i <= 60; i += 15) {
		describe(`Singleton, ${i} cards per player.`, () => {
			setRestriction(["one", "bro"]);
			startDraft({ singleton: { cardsPerPlayer: i } });
			endDraft();
			checkCardCount(i);
		});
	}
	for (let i = 30; i <= 45; i += 5) {
		describe(`Singleton, ${i} cards per player, using a cube`, () => {
			loadCube();
			startDraft({ singleton: { cardsPerPlayer: i } });
			endDraft();
			checkCardCount(i);
		});
	}
	describe(`Singleton, 50 cards per player, using a cube.`, () => {
		loadCube();
		it("Stating should error (not enough cards)", (done) => {
			clients[ownerIdx].emit("startRotisserieDraft", { singleton: { cardsPerPlayer: 50 } }, (r) => {
				expect(r.code !== 0);
				done();
			});
		});
	});

	for (let i = 3; i <= 6; ++i) {
		describe(`Standard collation, ${i} boosters per player.`, () => {
			startDraft({ standard: { boostersPerPlayer: i } });
			endDraft();
			checkCardCount(15 * i);
		});
		describe(`Standard collation, ${i} boosters per player, using a cube`, () => {
			loadCube();
			startDraft({ standard: { boostersPerPlayer: i } });
			endDraft();
			checkCardCount(15 * i);
		});
	}

	for (const key in Cubes) {
		describe(`Singleton collation, '${key}' cube.`, () => {
			loadCubeFile(key);
			startDraft({ singleton: { cardsPerPlayer: 30 } });
			endDraft();
			checkCardCount(15 * 30);
		});
		describe(`Standard collation, '${key}' cube.`, () => {
			loadCubeFile(key);
			startDraft({ standard: { boostersPerPlayer: 3 } });
			endDraft();
			checkCardCount(15 * 3);
		});
	}
});

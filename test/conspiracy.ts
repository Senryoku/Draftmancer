import fs from "node:fs";
import { before, after, beforeEach, afterEach, describe, it } from "mocha";
import chai from "chai";
const expect = chai.expect;
import { Sessions } from "../src/Session.js";
import { makeClients, waitForClientDisconnects, enableLogs, disableLogs, ackNoError, getUID } from "./src/common.js";
import { OptionalOnPickDraftEffect, UniqueCard, UniqueCardID, UsableDraftEffect } from "../src/CardTypes.js";
import { CogworkLibrarianOracleID } from "../src/Conspiracy.js";

describe("Conspiracy Draft Matters Cards", () => {
	let clients: ReturnType<typeof makeClients> = [];
	let ownerIdx = 0;
	let nonOwnerIdx = 1;
	const states: {
		booster: UniqueCard[];
		boosterCount: number;
		boosterNumber: number;
		pickNumber: number;
	}[] = [];

	beforeEach(function (done) {
		disableLogs();
		done();
	});

	afterEach(function (done) {
		enableLogs(this.currentTest!.state == "failed");
		done();
	});

	before(function (done) {
		disableLogs();
		const queries = [];
		for (let i = 0; i < 2; ++i) {
			queries.push({
				userID: "id" + i,
				sessionID: "ConspiracyTests",
				userName: "Client" + i,
			});
		}
		clients = makeClients(queries, () => {
			ownerIdx = clients.findIndex((c) => getUID(c) == Sessions[(c as any).query.sessionID].owner);
			nonOwnerIdx = (ownerIdx + 1) % clients.length;
			done();
		});
	});

	after(function (done) {
		disableLogs();
		for (const c of clients) c.disconnect();
		waitForClientDisconnects(done);
	});

	const loadCubeAndStart = (cube: string) => (done: Mocha.Done) => {
		disableLogs();
		clients[ownerIdx].emit("parseCustomCardList", fs.readFileSync(`./test/data/${cube}.txt`, "utf8"), (r) => {
			expect(r.code).to.equal(0);
			let eventReceived = 0;
			states.length = clients.length;
			for (let i = 0; i < clients.length; ++i) {
				clients[i].once("draftState", (state) => {
					if (!("pickNumber" in state)) {
						expect(false, "invalid state");
						return;
					}
					++eventReceived;
					states[i] = state;
					if (eventReceived === clients.length) done();
				});
			}
			clients[ownerIdx].emit("startDraft", ackNoError);
		});
	};

	const stopDraft = () => {
		disableLogs();
		clients[ownerIdx].emit("stopDraft");
	};

	describe("Cogwork Librarian", () => {
		const cogworkLibrarians: UniqueCardID[] = [0, 0];
		before(loadCubeAndStart("CogworkLibrarian"));
		after(stopDraft);

		it("Each player tries to pick two cards, but they don't have a Cogwork Librarian", (done) => {
			let acked = 0;
			for (let i = 0; i < clients.length; ++i) {
				clients[i].emit(
					"pickCard",
					{
						pickedCards: [0, 1],
						burnedCards: [],
						draftEffect: { effect: UsableDraftEffect.CogworkLibrarian, cardID: 5457 },
					},
					(err) => {
						expect(err.code).not.to.equal(0);
						++acked;
						if (acked === clients.length) done();
					}
				);
			}
		});

		it("Each player picks a Cogwork Librarian", (done) => {
			for (const s of states)
				expect(s.booster.filter((c) => c.oracle_id === CogworkLibrarianOracleID)).to.have.length(1);
			let eventReceived = 0;
			let messageReceived = 0;
			const checkDone = () => {
				if (messageReceived === clients.length && eventReceived === clients.length) {
					for (const c of clients) c.off("draftState");
					done();
				}
			};
			for (let i = 0; i < clients.length; ++i) {
				clients[i].once("message", (msg) => {
					expect(msg).to.exist;
					++messageReceived;
					checkDone();
				});
				clients[i].on("draftState", (state) => {
					if (!("pickNumber" in state)) {
						expect(false, "invalid state");
						return;
					}
					if (state.pickNumber > 0 && state.boosterCount > 0) {
						++eventReceived;
						states[i] = state;
						expect(
							states[i].booster.filter((c) => c.oracle_id === CogworkLibrarianOracleID)
						).to.have.length(0);
						checkDone();
					}
				});
				const idx = states[i].booster.findIndex((c) => c.oracle_id === CogworkLibrarianOracleID);
				cogworkLibrarians[i] = states[i].booster[idx].uniqueID;
				clients[i].emit(
					"pickCard",
					{
						pickedCards: [idx],
						burnedCards: [],
					},
					ackNoError
				);
			}
		});

		it("Each player tries to pick a single cards using a Cogwork Librarian, should error.", (done) => {
			let acked = 0;
			for (let i = 0; i < clients.length; ++i) {
				clients[i].emit(
					"pickCard",
					{
						pickedCards: [0],
						burnedCards: [],
						draftEffect: { effect: UsableDraftEffect.CogworkLibrarian, cardID: cogworkLibrarians[i] },
					},
					(err) => {
						expect(err.code).not.to.equal(0);
						++acked;
						if (acked === clients.length) done();
					}
				);
			}
		});

		it("Each player picks two cards using their Cogwork Librarian", (done) => {
			let eventReceived = 0;
			for (let i = 0; i < clients.length; ++i) {
				clients[i].on("draftState", (state) => {
					if (!("pickNumber" in state)) {
						expect(false);
						return;
					}
					if (state.pickNumber > 1 && state.boosterCount > 0) {
						++eventReceived;
						states[i] = state;
						if (eventReceived === clients.length) {
							for (const c of clients) c.off("draftState");
							done();
						}
					}
				});
				clients[i].emit(
					"pickCard",
					{
						pickedCards: [0, 1],
						burnedCards: [],
						draftEffect: { effect: UsableDraftEffect.CogworkLibrarian, cardID: cogworkLibrarians[i] },
					},
					ackNoError
				);
			}
		});

		it("Cogwork Librarians should be back in the boosters", (done) => {
			for (let i = 0; i < states.length; ++i) {
				expect(states[i].booster.filter((c) => c.oracle_id === CogworkLibrarianOracleID)).to.have.length(1);
				expect(states[i].booster.filter((c) => c.oracle_id === CogworkLibrarianOracleID)[0].uniqueID).to.eql(
					cogworkLibrarians[(i + 1) % 2]
				);
			}

			done();
		});
	});

	describe("Lore Seeker", () => {
		const loreSeekers: UniqueCardID[] = [0, 0];
		before(loadCubeAndStart("LoreSeeker"));
		after(stopDraft);

		it("Each player picks a Lore Seeker, using its abilty", (done) => {
			for (const s of states) expect(s.booster.filter((c) => c.name === "Lore Seeker")).to.have.length(1);
			let eventReceived = 0;
			let messageReceived = 0;
			const checkDone = () => {
				if (messageReceived === clients.length && eventReceived === clients.length) {
					for (const c of clients) c.off("draftState");
					done();
				}
			};
			for (let i = 0; i < clients.length; ++i) {
				clients[i].once("message", (msg) => {
					expect(msg).to.exist;
					++messageReceived;
					checkDone();
				});
				clients[i].on("draftState", (state) => {
					const s = state as {
						booster: UniqueCard[];
						boosterCount: number;
						boosterNumber: number;
						pickNumber: number;
					};
					if (s.pickNumber > 0 && s.boosterCount > 0) {
						++eventReceived;
						states[i] = s;
						// This should be a new pack
						expect(states[i].booster).to.have.length(10);
						expect(
							states[i].booster.filter((c) => c.name === "Lore Seeker"),
							"New booster should have a Lore Seeker"
						).to.have.length(1);
						expect(loreSeekers, "should be a new lore seeker").not.to.include(
							states[i].booster.filter((c) => c.name === "Lore Seeker")[0].uniqueID
						);
						checkDone();
					}
				});
				const idx = states[i].booster.findIndex((c) => c.name === "Lore Seeker");
				loreSeekers[i] = states[i].booster[idx].uniqueID;
				clients[i].emit(
					"pickCard",
					{
						pickedCards: [idx],
						burnedCards: [],
						optionalOnPickDraftEffect: {
							effect: OptionalOnPickDraftEffect.LoreSeeker,
							cardID: loreSeekers[i],
						},
					},
					ackNoError
				);
			}
		});

		it("Each player picks a Lore Seeker, not using its abilty", (done) => {
			for (const s of states) expect(s.booster.filter((c) => c.name === "Lore Seeker")).to.have.length(1);
			let eventReceived = 0;
			let messageReceived = 0;
			const checkDone = () => {
				if (messageReceived === clients.length && eventReceived === clients.length) {
					for (const c of clients) c.off("draftState");
					done();
				}
			};
			for (let i = 0; i < clients.length; ++i) {
				clients[i].once("message", (msg) => {
					expect(msg).to.exist;
					++messageReceived;
					checkDone();
				});
				clients[i].on("draftState", (state) => {
					const s = state as {
						booster: UniqueCard[];
						boosterCount: number;
						boosterNumber: number;
						pickNumber: number;
					};
					if (s.pickNumber > 1 && s.boosterCount > 0) {
						++eventReceived;
						states[i] = s;
						expect(states[i].booster).to.have.length(9);
						expect(
							states[i].booster.filter((c) => c.name === "Lore Seeker"),
							"Already opened should not have a Lore Seeker"
						).to.have.length(0);
						checkDone();
					}
				});
				const idx = states[i].booster.findIndex((c) => c.name === "Lore Seeker");
				loreSeekers[i] = states[i].booster[idx].uniqueID;
				clients[i].emit(
					"pickCard",
					{
						pickedCards: [idx],
						burnedCards: [],
					},
					ackNoError
				);
			}
		});
	});

	describe("Note how many cards you've drafted this draft round", () => {
		before(loadCubeAndStart("NoteDraftedCards"));
		after(stopDraft);

		for (let pick = 0; pick < 3; ++pick)
			it("Each player picks a card, it should trigger a message.", (done) => {
				for (const s of states) expect(s.booster).to.have.length(4 - pick);
				let eventReceived = 0;
				let messageReceived = 0;
				const checkDone = () => {
					if (messageReceived === clients.length && eventReceived === clients.length) {
						for (const c of clients) c.off("draftState");
						done();
					}
				};
				for (let i = 0; i < clients.length; ++i) {
					clients[i].once("message", (msg) => {
						++messageReceived;
						expect(msg.title).to.contain(`X=${pick + 1}`);
						checkDone();
					});
					clients[i].on("draftState", (state) => {
						const s = state as {
							booster: UniqueCard[];
							boosterCount: number;
							boosterNumber: number;
							pickNumber: number;
						};
						if (s.pickNumber > pick && s.boosterCount > 0) {
							++eventReceived;
							states[i] = s;
							expect(states[i].booster).to.have.length(4 - 1 - pick);
							checkDone();
						}
					});
					clients[i].emit(
						"pickCard",
						{
							pickedCards: [0],
							burnedCards: [],
						},
						ackNoError
					);
				}
			});
	});

	describe("Note passing player", () => {
		before(loadCubeAndStart("NotePassingPlayer"));
		after(stopDraft);

		it("Each player picks a Cogwork Tracker, it should trigger a message.", (done) => {
			for (const s of states) expect(s.booster).to.have.length(2);
			let eventReceived = 0;
			let messageReceived = 0;
			const checkDone = () => {
				if (messageReceived === clients.length && eventReceived === clients.length) {
					for (const c of clients) c.off("draftState");
					done();
				}
			};
			for (let i = 0; i < clients.length; ++i) {
				clients[i].once("message", (msg) => {
					++messageReceived;
					expect(msg.title, "First pick should not have a passing player").to.not.contain(`Passing Player`);
					checkDone();
				});
				clients[i].on("draftState", (state) => {
					const s = state as {
						booster: UniqueCard[];
						boosterCount: number;
						boosterNumber: number;
						pickNumber: number;
					};
					if (s.pickNumber > 0 && s.boosterCount > 0) {
						++eventReceived;
						states[i] = s;
						expect(states[i].booster).to.have.length(1);
						checkDone();
					}
				});
				clients[i].emit(
					"pickCard",
					{
						pickedCards: [0],
						burnedCards: [],
					},
					ackNoError
				);
			}
		});

		it("Each player picks a Cogwork Tracker, it should trigger a message specifying the passing player.", (done) => {
			for (const s of states) expect(s.booster).to.have.length(1);
			let eventReceived = 0;
			let messageReceived = 0;
			const checkDone = () => {
				if (messageReceived === clients.length && eventReceived === clients.length) {
					for (const c of clients) c.off("draftState");
					done();
				}
			};
			for (let i = 0; i < clients.length; ++i) {
				clients[i].once("message", (msg) => {
					++messageReceived;
					expect(msg.title, "should have a passing player").to.contain(`Passing Player: Client${i}`);
					checkDone();
				});
				clients[i].on("draftState", (state) => {
					const s = state as {
						booster: UniqueCard[];
						boosterCount: number;
						boosterNumber: number;
						pickNumber: number;
					};
					if (s.boosterNumber > 0 && s.boosterCount > 0) {
						++eventReceived;
						states[i] = s;
						checkDone();
					}
				});
				clients[i].emit(
					"pickCard",
					{
						pickedCards: [0],
						burnedCards: [],
					},
					ackNoError
				);
			}
		});
	});
});

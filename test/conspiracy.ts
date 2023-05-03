import fs from "node:fs";
import { before, after, beforeEach, afterEach, describe, it } from "mocha";
import chai from "chai";
const expect = chai.expect;
import { Sessions } from "../src/Session.js";
import { makeClients, waitForClientDisconnects, enableLogs, disableLogs, ackNoError } from "./src/common.js";
import { UniqueCard, UniqueCardID, UsableDraftEffect } from "../src/CardTypes.js";
import { CogworkLibrarianOracleID } from "../src/Conspiracy.js";

describe.only("Conspiracy Draft Matters Cards", () => {
	let clients: ReturnType<typeof makeClients> = [];
	let ownerIdx = 0;
	let nonOwnerIdx = 1;
	let states: {
		booster: UniqueCard[];
		boosterCount: number;
		boosterNumber: number;
		pickNumber: number;
	}[] = [];
	let cogworkLibrarians: UniqueCardID[] = [0, 0];

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
			ownerIdx = clients.findIndex((c) => (c as any).query.userID == Sessions[(c as any).query.sessionID].owner);
			nonOwnerIdx = (ownerIdx + 1) % clients.length;
			done();
		});
	});

	after(function (done) {
		disableLogs();
		for (let c of clients) c.disconnect();
		waitForClientDisconnects(done);
	});

	const loadCubeAndStart = (cube: string) => (done: Mocha.Done) => {
		disableLogs();
		clients[ownerIdx].emit("parseCustomCardList", fs.readFileSync(`./test/data/${cube}.txt`, "utf8"), (r) => {
			expect(r.code).to.equal(0);
			let eventReceived = 0;
			states.length = clients.length;
			for (let i = 0; i < clients.length; ++i) {
				clients[i].on("draftState", (state) => {
					states[i] = state as any;
				});
				clients[i].once("draftState", (state) => {
					++eventReceived;
					states[i] = state as any;
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
					for (const c of clients) c.off("message");
					done();
				}
			};
			for (let i = 0; i < clients.length; ++i) {
				clients[i].on("message", (msg) => {
					++messageReceived;
					checkDone();
				});
				clients[i].once("draftState", (state) => {
					++eventReceived;
					states[i] = state as any;
					checkDone();
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
				clients[i].once("draftState", (state) => {
					++eventReceived;
					states[i] = state as any;
					if (eventReceived === clients.length) done();
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
});

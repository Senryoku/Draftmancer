import fs from "node:fs";
import { before, after, beforeEach, afterEach, describe, it } from "mocha";
import { expect } from "chai";
import { Sessions } from "../src/Session.js";
import { makeClients, waitForClientDisconnects, enableLogs, disableLogs, ackNoError, getUID } from "./src/common.js";
import { UniqueCard } from "../src/CardTypes.js";

describe("Custom Draft Effect", () => {
	const sessionID = "DraftEffectsTests";
	let clients: ReturnType<typeof makeClients> = [];
	let ownerIdx = 0;
	const states: {
		booster?: UniqueCard[];
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
				sessionID: sessionID,
				userName: "Client" + i,
			});
		}
		clients = makeClients(queries, () => {
			ownerIdx = clients.findIndex((c) => getUID(c) == Sessions[sessionID].owner);
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
		ownerIdx = clients.findIndex((c) => getUID(c) == Sessions[sessionID].owner);
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

	describe("AddCards", () => {
		before(loadCubeAndStart("CustomCards_DraftEffect_AddCards"));
		after(stopDraft);

		it("Picking a card automatically add another card to the pool", (done) => {
			let cardsReceived = 0;
			for (let i = 0; i < clients.length; ++i) {
				clients[i].once("addCards", (msg, cards) => {
					++cardsReceived;
					expect(cards.length).to.equal(1);
					if (cardsReceived == clients.length) done();
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

		it("Added cards persist after a disconnect", (done) => {
			clients[1].disconnect();

			clients[1].once("rejoinDraft", (data) => {
				expect(data).to.have.property("pickedCards");
				expect(data.pickedCards.main).to.have.length(2);
				done();
			});

			clients[1].connect();
		});
	});

	describe("AddCards - Multiple", () => {
		before(loadCubeAndStart("CustomCards_DraftEffect_AddCards_Squadron_Hawk"));
		after(stopDraft);

		it("Picking a card automatically add 3 other cards to the pool", (done) => {
			let cardsReceived = 0;
			for (let i = 0; i < clients.length; ++i) {
				clients[i].once("addCards", (msg, cards) => {
					++cardsReceived;
					expect(cards.length).to.equal(3);
					if (cardsReceived == clients.length) done();
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

		it("Added cards persist after a disconnect", (done) => {
			clients[1].disconnect();

			clients[1].once("rejoinDraft", (data) => {
				expect(data).to.have.property("pickedCards");
				expect(data.pickedCards.main).to.have.length(4);
				done();
			});

			clients[1].connect();
		});
	});

	describe("AddRandomCards - Multiple", () => {
		before(loadCubeAndStart("CustomCards_DraftEffect_AddRandomCards"));
		after(stopDraft);

		it("Picking a card automatically add 3 other cards to the pool", (done) => {
			let cardsReceived = 0;
			for (let i = 0; i < clients.length; ++i) {
				clients[i].once("addCards", (msg, cards) => {
					++cardsReceived;
					expect(cards.length).to.equal(3);
					if (cardsReceived == clients.length) done();
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

		it("Added cards persist after a disconnect", (done) => {
			clients[1].disconnect();

			clients[1].once("rejoinDraft", (data) => {
				expect(data).to.have.property("pickedCards");
				expect(data.pickedCards.main).to.have.length(4);
				done();
			});

			clients[1].connect();
		});
	});
});

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
} from "./src/common.js";
import { RotisserieDraftSyncData } from "../src/RotisserieDraft.js";
import { getRandom } from "../src/utils.js";

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

	const startDraft = () => {
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
			clients[ownerIdx].emit("startRotisserieDraft", ackNoError);
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
		startDraft();
		endDraft();
	});

	describe("Default settings with a disconnect", () => {
		startDraft();

		it("Non-owner disconnects, owner receives updated user infos.", (done) => {
			let nonOwnerIdx = (ownerIdx + 1) % clients.length;
			clients[ownerIdx].once("userDisconnected", () => {
				waitForSocket(clients[nonOwnerIdx], done);
			});
			clients[nonOwnerIdx].disconnect();
		});

		it("Non-owner reconnects, draft restarts.", function (done) {
			let nonOwnerIdx = (ownerIdx + 1) % clients.length;
			clients[nonOwnerIdx].once("rejoinRotisserieDraft", () => {
				done();
			});
			clients[nonOwnerIdx].connect();
		});

		endDraft();
	});

	describe("Using a Cube", () => {
		it("Emit Settings.", (done) => {
			let nonOwnerIdx = (ownerIdx + 1) % clients.length;
			clients[nonOwnerIdx].once("sessionOptions", (options) => {
				expect(options.useCustomCardList).to.be.true;
				done();
			});
			clients[ownerIdx].emit("loadLocalCustomCardList", "Arena Historic Cube #1", ackNoError);
		});

		startDraft();
		endDraft();
	});
});

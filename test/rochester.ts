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
import { RochesterDraftSyncData } from "../src/RochesterDraft.js";
import { SocketAck } from "../src/Message.js";

describe("Rochester Draft", function () {
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
				{
					userID: "id3",
					sessionID: sessionID,
					userName: "Client3",
				},
				{
					userID: "id4",
					sessionID: sessionID,
					userName: "Client4",
				},
				{
					userID: "id5",
					sessionID: sessionID,
					userName: "Client5",
				},
				{
					userID: "id6",
					sessionID: sessionID,
					userName: "Client6",
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

	it(`6 clients with different userID should be connected.`, function (done) {
		expect(Object.keys(Connections).length).to.equal(6);
		ownerIdx = clients.findIndex((c) => (c as any).query.userID == Sessions[sessionID].owner);
		expect(ownerIdx).to.not.be.null;
		expect(ownerIdx).to.not.be.undefined;
		done();
	});

	let rochesterDraftState: RochesterDraftSyncData | null = null;

	const startDraft = () => {
		it("When session owner launch Rochester draft, everyone should receive a startRochesterDraft event", function (done) {
			let connectedClients = 0;
			for (let c of clients) {
				c.once("startRochesterDraft", function (state) {
					connectedClients += 1;
					if (connectedClients == clients.length) {
						rochesterDraftState = state;
						done();
					}
				});
			}
			clients[ownerIdx].emit("startRochesterDraft", ackNoError);
		});
	};

	const endDraft = () => {
		it("Every player randomly chooses a card and the draft should end.", function (done) {
			let draftEnded = 0;

			for (let c = 0; c < clients.length; ++c) {
				// Pick randomly and retry on error
				const pick = (state: RochesterDraftSyncData) => {
					const cl = clients[c];
					cl.emit(
						"rochesterDraftPick",
						[Math.floor(Math.random() * state.booster.length)],
						(response: SocketAck) => {
							if (response.code !== 0) pick(state);
						}
					);
				};
				clients[c].on("rochesterDraftNextRound", function (state) {
					if (state.currentPlayer === (clients[c] as any).query.userID) pick(state);
				});
				clients[c].once("rochesterDraftEnd", function () {
					draftEnded += 1;
					clients[c].removeListener("rochesterDraftNextRound");
					if (draftEnded == clients.length) done();
				});
			}
			// Pick the first card
			let currPlayer = clients.findIndex((c) => (c as any).query.userID == rochesterDraftState!.currentPlayer);
			clients[currPlayer].emit("rochesterDraftPick", [0], ackNoError);
		});
	};

	describe("Default settings with a disconnect", function () {
		startDraft();

		it("Non-owner disconnects, owner receives updated user infos.", function (done) {
			let nonOwnerIdx = (ownerIdx + 1) % clients.length;
			clients[ownerIdx].once("userDisconnected", function () {
				waitForSocket(clients[nonOwnerIdx], done);
			});
			clients[nonOwnerIdx].disconnect();
		});

		it("Non-owner reconnects, draft restarts.", function (done) {
			let nonOwnerIdx = (ownerIdx + 1) % clients.length;
			clients[nonOwnerIdx].once("rejoinRochesterDraft", function () {
				done();
			});
			clients[nonOwnerIdx].connect();
		});

		endDraft();
	});

	describe("Using a Cube", function () {
		it("Emit Settings.", function (done) {
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

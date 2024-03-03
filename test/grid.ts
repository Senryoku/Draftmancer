"use strict";

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
	connectClient,
	getUID,
} from "./src/common.js";
import { TurnBased } from "../src/IDraftState.js";

describe("Grid Draft", function () {
	let clients: ReturnType<typeof makeClients> = [];
	const sessionID = "sessionID";
	let ownerIdx = 0;
	let nonOwnerIdx = 0;

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

	it("2 clients with different userID should be connected.", function (done) {
		expect(Object.keys(Connections).length).to.equal(2);
		done();
	});

	const startDraft = (boosterCount: number = 18, twoPicksPerGrid: boolean = false) => {
		it("When session owner launch Grid draft, everyone should receive a startGridDraft event", function (done) {
			ownerIdx = clients.findIndex((c) => getUID(c) === Sessions[sessionID].owner);
			nonOwnerIdx = 1 - ownerIdx;
			let connectedClients = 0;
			for (const c of clients) {
				c.once("startGridDraft", function () {
					++connectedClients;
					if (connectedClients === clients.length) done();
				});
			}
			clients[ownerIdx].emit("startGridDraft", boosterCount, twoPicksPerGrid, ackNoError);
		});
	};

	const endDraft = () => {
		it("Every player randomly chooses a row or column and the draft should end.", function (done) {
			let draftEnded = 0;

			for (let c = 0; c < clients.length; ++c) {
				const cl = clients[c];
				cl.on("gridDraftNextRound", function (state) {
					if (state.booster) expect(state.booster.length).to.equal(9);
					if (state.currentPlayer === getUID(cl)) {
						// Pick randomly and retry on error (empty col/row)
						const pick = () => {
							cl.emit("gridDraftPick", Math.floor(Math.random() * 6), (response) => {
								if (response.code !== 0) pick();
							});
						};
						pick();
					}
				});
				cl.once("gridDraftEnd", function () {
					draftEnded += 1;
					cl.removeListener("gridDraftNextRound");
					if (draftEnded == clients.length) done();
				});
			}
			const currentPlayerID = (Sessions[sessionID].draftState as TurnBased).currentPlayer();
			const currentPlayerIdx = clients.findIndex((c) => getUID(c) === currentPlayerID);
			clients[currentPlayerIdx].emit("gridDraftPick", Math.floor(Math.random() * 6), ackNoError);
		});
	};

	describe("Basic, with disconnect", function () {
		startDraft();

		it("Non-owner disconnects, owner receives updated user infos.", function (done) {
			clients[ownerIdx].once("userDisconnected", function () {
				waitForSocket(clients[nonOwnerIdx], done);
			});
			clients[nonOwnerIdx].disconnect();
		});

		it("Non-owner reconnects, draft restarts.", function (done) {
			clients[nonOwnerIdx].once("rejoinGridDraft", function () {
				done();
			});
			clients[nonOwnerIdx].connect();
		});

		endDraft();
	});

	describe("2 Players, 2 picks per grid", function () {
		startDraft(12, true);
		endDraft();
	});

	describe("Using a Cube", function () {
		it("Emit Settings.", function (done) {
			clients[nonOwnerIdx].once("sessionOptions", function (options) {
				if (options.useCustomCardList) done();
			});
			clients[ownerIdx].emit("setUseCustomCardList", true);
			clients[ownerIdx].emit("loadLocalCustomCardList", "Arena Historic Cube #1", ackNoError);
		});

		startDraft();
		endDraft();
	});

	describe("3 Players", function () {
		it("Third player connects.", function (done) {
			const client = connectClient({
				userID: "id3",
				sessionID: sessionID,
				userName: "Client3",
			});
			clients.push(client);

			client.once("connect", function () {
				expect(Object.keys(Connections).length).to.equal(3);
				done();
			});
		});

		startDraft();
		endDraft();
	});

	describe("4 Players", function () {
		it("Fourth player connects.", function (done) {
			const client = connectClient({
				userID: "id4",
				sessionID: sessionID,
				userName: "Client4",
			});
			clients.push(client);

			client.once("connect", function () {
				expect(Object.keys(Connections).length).to.equal(4);
				done();
			});
		});

		startDraft();
		endDraft();
	});
});

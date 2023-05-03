"use strict";

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
	connectClient,
} from "./src/common.js";
import { TurnBased } from "../src/IDraftState.js";

describe("Grid Draft", function () {
	let clients: ReturnType<typeof makeClients> = [];
	let sessionID = "sessionID";
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
		for (let c of clients) {
			c.disconnect();
		}
		waitForClientDisconnects(done);
	});

	it("2 clients with different userID should be connected.", function (done) {
		expect(Object.keys(Connections).length).to.equal(2);
		done();
	});

	const startDraft = (boosterCount: number = 18) => {
		it("When session owner launch Grid draft, everyone should receive a startGridDraft event", function (done) {
			ownerIdx = clients.findIndex((c) => (c as any).query.userID == Sessions[sessionID].owner);
			nonOwnerIdx = 1 - ownerIdx;
			let connectedClients = 0;
			for (let c of clients) {
				c.once("startGridDraft", function () {
					++connectedClients;
					if (connectedClients === clients.length) done();
				});
			}
			clients[ownerIdx].emit("startGridDraft", boosterCount, ackNoError);
		});
	};

	const endDraft = () => {
		it("Every player randomly chooses a row or column and the draft should end.", function (done) {
			let draftEnded = 0;

			for (let c = 0; c < clients.length; ++c) {
				const cl = clients[c];
				cl.on("gridDraftNextRound", function (state) {
					if (state.booster) expect(state.booster.length).to.equal(9);
					if (state.currentPlayer === (cl as any).query.userID) {
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
			let currentPlayerID = (Sessions[sessionID].draftState as TurnBased).currentPlayer();
			let currentPlayerIdx = clients.findIndex((c) => (c as any).query.userID === currentPlayerID);
			clients[currentPlayerIdx].emit("gridDraftPick", Math.floor(Math.random() * 6), ackNoError);
		});
	};

	startDraft();

	it("Non-owner disconnects, owner receives updated user infos.", function (done) {
		clients[ownerIdx].once("userDisconnected", function () {
			waitForSocket(clients[nonOwnerIdx], done);
		});
		clients[nonOwnerIdx].disconnect();
	});

	it("Non-owner reconnects, draft restarts.", function (done) {
		clients[nonOwnerIdx].once("rejoinGridDraft", function (state) {
			done();
		});
		clients[nonOwnerIdx].connect();
	});

	endDraft();

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
			clients.push(
				connectClient({
					userID: "id3",
					sessionID: sessionID,
					userName: "Client3",
				})
			);
			done();
		});

		startDraft();
		endDraft();
	});
});

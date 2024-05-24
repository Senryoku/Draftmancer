"use strict";
import { before, after, beforeEach, afterEach, describe, it } from "mocha";
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
	getUID,
} from "./src/common.js";
import { WinstonDraftState, WinstonDraftSyncData } from "../src/WinstonDraft.js";

describe(`Winston Draft`, function () {
	for (let playerCount = 2; playerCount <= 4; ++playerCount)
		describe(`Winston Draft - ${playerCount} players`, function () {
			let clients: ReturnType<typeof makeClients> = [];
			const sessionID = "sessionID";
			let ownerIdx: number;
			let nonOwnerIdx: number;

			const getCurrentPlayer = () => {
				const currentPlayerID = (Sessions[sessionID].draftState as WinstonDraftState)?.currentPlayer();
				const currentPlayerIdx = clients.findIndex((c) => getUID(c) === currentPlayerID);
				return clients[currentPlayerIdx];
			};

			beforeEach(function (done) {
				disableLogs();
				done();
			});

			afterEach(function (done) {
				enableLogs(this.currentTest?.state === "failed");
				done();
			});

			before(function (done) {
				const queries = [];
				for (let i = 0; i < playerCount; ++i)
					queries.push({
						userID: "id" + i,
						sessionID: sessionID,
						userName: "Client" + i,
					});
				clients = makeClients(queries, done);
			});

			after(function (done) {
				disableLogs();
				for (const c of clients) {
					c.disconnect();
				}
				waitForClientDisconnects(done);
			});

			it("2 clients with different userID should be connected.", function (done) {
				expect(Object.keys(Connections).length).to.equal(playerCount);
				done();
			});

			const states: WinstonDraftSyncData[] = [];
			it("When session owner launch Winston draft, everyone should receive a startWinstonDraft event", function (done) {
				ownerIdx = clients.findIndex((c) => getUID(c) === Sessions[sessionID].owner);
				nonOwnerIdx = 1 - ownerIdx;
				let connectedClients = 0;
				let receivedState = 0;
				let index = 0;
				for (const c of clients) {
					c.once("startWinstonDraft", function () {
						connectedClients += 1;
						if (connectedClients == clients.length && receivedState == clients.length) done();
					});

					(() => {
						const _idx = index;
						c.once("winstonDraftSync", function (state) {
							states[_idx] = state;
							receivedState += 1;
							if (connectedClients == clients.length && receivedState == clients.length) done();
						});
					})();
					++index;
				}
				clients[ownerIdx].emit("startWinstonDraft", 6, true, ackNoError);
			});

			it("Non-owner disconnects, owner receives updated user infos.", function (done) {
				clients[ownerIdx].once("userDisconnected", function () {
					waitForSocket(clients[nonOwnerIdx], done);
				});
				clients[nonOwnerIdx].disconnect();
			});

			it("Non-owner reconnects, draft restarts.", function (done) {
				clients[nonOwnerIdx].once("rejoinWinstonDraft", () => done());
				clients[nonOwnerIdx].connect();
			});

			it("Every player takes the first pile possible and the draft should end.", function (done) {
				let draftEnded = 0;
				for (let c = 0; c < clients.length; ++c) {
					clients[c].on("winstonDraftSync", (data) => (states[c] = data));
					clients[c].on("winstonDraftNextRound", function (userID) {
						if (userID === getUID(clients[c]))
							clients[c].emit("winstonDraftTakePile", states[c].currentPile, ackNoError);
					});
					clients[c].once("winstonDraftEnd", function () {
						draftEnded += 1;
						clients[c].removeListener("winstonDraftSync");
						clients[c].removeListener("winstonDraftNextRound");
						if (draftEnded == clients.length) done();
					});
				}
				getCurrentPlayer().emit("winstonDraftTakePile", 0, ackNoError);
			});

			it("When session owner launch Winston draft, everyone should receive a startWinstonDraft event", function (done) {
				let connectedClients = 0;
				let receivedState = 0;
				for (const c of clients) {
					c.once("startWinstonDraft", function () {
						connectedClients += 1;
						if (connectedClients == clients.length && receivedState == clients.length) done();
					});

					(() => {
						c.once("winstonDraftNextRound", function () {
							receivedState += 1;
							if (connectedClients == clients.length && receivedState == clients.length) done();
						});
					})();
				}
				clients[ownerIdx].emit("startWinstonDraft", 6, true, ackNoError);
			});

			it("Taking first pile.", function (done) {
				let nextRound = 0;
				for (let c = 0; c < clients.length; ++c) {
					clients[c].on("winstonDraftNextRound", function () {
						++nextRound;
						if (nextRound == clients.length) done();
					});
				}
				getCurrentPlayer().emit("winstonDraftTakePile", 0, ackNoError);
			});

			it("Skiping, then taking pile.", function (done) {
				let nextRound = 0;
				for (let c = 0; c < clients.length; ++c) {
					clients[c].on("winstonDraftNextRound", function () {
						++nextRound;
						if (nextRound == clients.length) done();
					});
				}
				getCurrentPlayer().emit("winstonDraftSkipPile", 0, ackNoError);
				getCurrentPlayer().emit("winstonDraftTakePile", 1, ackNoError);
			});

			it("Skiping, skiping, then taking pile.", function (done) {
				let nextRound = 0;
				for (let c = 0; c < clients.length; ++c) {
					clients[c].on("winstonDraftNextRound", function () {
						++nextRound;
						if (nextRound == clients.length) done();
					});
				}
				getCurrentPlayer().emit("winstonDraftSkipPile", 0, ackNoError);
				getCurrentPlayer().emit("winstonDraftSkipPile", 1, ackNoError);
				getCurrentPlayer().emit("winstonDraftTakePile", 2, ackNoError);
			});

			it("Skiping, skiping and skiping.", function (done) {
				let nextRound = 0;
				let receivedRandomCard = false;
				for (let c = 0; c < clients.length; ++c) {
					clients[c].on("winstonDraftNextRound", function () {
						++nextRound;
						if (receivedRandomCard && nextRound == clients.length) done();
					});
				}
				getCurrentPlayer().once("winstonDraftRandomCard", function (card) {
					if (card) receivedRandomCard = true;
				});
				getCurrentPlayer().emit("winstonDraftSkipPile", 0, ackNoError);
				getCurrentPlayer().emit("winstonDraftSkipPile", 1, ackNoError);
				getCurrentPlayer().emit("winstonDraftSkipPile", 2, ackNoError);
			});

			it("Every player takes the first pile possible and the draft should end.", function (done) {
				this.timeout(2000);
				let draftEnded = 0;
				for (let c = 0; c < clients.length; ++c) {
					clients[c].on("winstonDraftSync", (data) => (states[c] = data));
					clients[c].on("winstonDraftNextRound", function (userID) {
						if (userID === getUID(clients[c]))
							clients[c].emit("winstonDraftTakePile", states[c].currentPile, ackNoError);
					});
					clients[c].once("winstonDraftEnd", function () {
						draftEnded += 1;
						clients[c].removeListener("winstonDraftSync");
						clients[c].removeListener("winstonDraftNextRound");
						if (draftEnded == clients.length) done();
					});
				}
				getCurrentPlayer().emit("winstonDraftTakePile", 0, ackNoError);
			});
		});
});

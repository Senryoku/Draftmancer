"use strict";
import { before, after, beforeEach, afterEach, describe, it } from "mocha";
import { expect } from "chai";
import { Sessions } from "../src/Session.js";
import { Connections } from "../src/Connection.js";
import { simulateRestart } from "../src/Persistence.js";
import {
	makeClients,
	connectClient,
	enableLogs,
	disableLogs,
	waitForClientDisconnects,
	waitForSocket,
	ackNoError,
	getUID,
} from "./src/common.js";

describe("Spectators", function () {
	let clients: ReturnType<typeof makeClients> = [];
	const sessionID = "SpectatorsTestSession";
	let ownerIdx = 0;
	let nonOwnerIdx = 1;
	let spectateKey = "";
	const spectatorUserID = "SpectatorID1";
	let spectator: ReturnType<typeof connectClient>;

	beforeEach(function (done) {
		disableLogs();
		done();
	});

	afterEach(function (done) {
		enableLogs(this.currentTest?.state === "failed");
		done();
	});

	before(function (done) {
		clients = makeClients(
			[
				{ userID: "id0", sessionID: sessionID, userName: "Client0" },
				{ userID: "id1", sessionID: sessionID, userName: "Client1" },
			],
			done
		);
	});

	after(function (done) {
		disableLogs();
		for (const c of clients) c.disconnect();
		spectator?.disconnect();
		waitForClientDisconnects(done);
	});

	it("2 clients with different userIDs should be connected.", function (done) {
		expect(Object.keys(Connections).length).to.equal(2);
		ownerIdx = clients.findIndex((c) => getUID(c) === Sessions[sessionID].owner);
		nonOwnerIdx = (ownerIdx + 1) % clients.length;
		done();
	});

	it("Owner disables spectating, the ack carries no key.", function (done) {
		clients[ownerIdx].emit("setAllowSpectators", false, (r) => {
			ackNoError(r);
			expect(r.spectateKey).to.be.undefined;
			expect(Sessions[sessionID].allowSpectators).to.be.false;
			expect(Sessions[sessionID].spectateKey).to.be.undefined;
			done();
		});
	});

	it("Non-owner cannot enable spectating.", function (done) {
		clients[nonOwnerIdx].emit("setAllowSpectators", true, (r) => {
			expect(r.code).to.not.equal(0);
			expect(Sessions[sessionID].allowSpectators).to.be.false;
			done();
		});
	});

	it("Enabling spectating returns the key to the owner and never to other players.", function (done) {
		clients[nonOwnerIdx].once("sessionOptions", (options) => {
			expect(options.allowSpectators).to.be.true;
			expect(options.spectateKey, "spectateKey must never reach non-owners").to.be.undefined;
			done();
		});
		clients[ownerIdx].emit("setAllowSpectators", true, (r) => {
			ackNoError(r);
			expect(r.spectateKey).to.match(/^[0-9a-f]{12}$/);
			expect(r.spectateKey).to.equal(Sessions[sessionID].spectateKey);
			spectateKey = r.spectateKey!;
		});
	});

	it("Re-enabling returns the same key, disabling and enabling again rotates it.", function (done) {
		clients[ownerIdx].emit("setAllowSpectators", true, (r) => {
			expect(r.spectateKey).to.equal(spectateKey);
			clients[ownerIdx].emit("setAllowSpectators", false, (r) => {
				expect(r.spectateKey).to.be.undefined;
				clients[ownerIdx].emit("setAllowSpectators", true, (r) => {
					ackNoError(r);
					expect(r.spectateKey).to.not.equal(spectateKey);
					spectateKey = r.spectateKey!;
					done();
				});
			});
		});
	});

	it("A user opening the spectator link joins as a spectator, everyone is notified.", function (done) {
		let joined = false;
		let notified = false;
		const checkDone = () => {
			if (joined && notified) {
				expect(Sessions[sessionID].spectators.has(spectatorUserID)).to.be.true;
				expect(Sessions[sessionID].users.has(spectatorUserID)).to.be.false;
				done();
			}
		};
		clients[nonOwnerIdx].once("sessionSpectators", (spectators) => {
			expect(spectators).to.deep.include({ userID: spectatorUserID, userName: "Spectator1" });
			notified = true;
			checkDone();
		});
		spectator = connectClient({
			userID: spectatorUserID,
			sessionID: sessionID,
			userName: "Spectator1",
			spectate: spectateKey,
		});
		spectator.on("message", (msg) => {
			if (msg.title === "Joined as spectator") {
				spectator.off("message");
				joined = true;
				checkDone();
			}
		});
	});

	it("Spectators do not appear in the player list.", function (done) {
		expect(Sessions[sessionID].getHumanPlayerCount()).to.equal(2);
		done();
	});

	it("A user with an invalid key is refused.", function (done) {
		const badSpectator = connectClient({
			userID: "BadSpectatorID",
			sessionID: sessionID,
			userName: "BadSpectator",
			spectate: "000000000000",
		});
		badSpectator.once("message", (msg) => {
			expect(msg.title).to.equal("Cannot spectate session");
			expect(Sessions[sessionID].spectators.has("BadSpectatorID")).to.be.false;
			badSpectator.disconnect();
			done();
		});
	});

	it("A spectator link to a non-existing session is refused without creating it.", function (done) {
		const lostSpectator = connectClient({
			userID: "LostSpectatorID",
			sessionID: "NoSuchSession",
			userName: "LostSpectator",
			spectate: spectateKey,
		});
		lostSpectator.once("message", (msg) => {
			expect(msg.title).to.equal("Cannot spectate session");
			expect(Sessions["NoSuchSession"]).to.not.exist;
			lostSpectator.disconnect();
			done();
		});
	});

	it("Spectators do not count toward the player limit.", function (done) {
		clients[ownerIdx].emit("setMaxPlayers", 2);
		const thirdPlayer = connectClient({
			userID: "ThirdPlayerID",
			sessionID: sessionID,
			userName: "Client2",
		});
		thirdPlayer.once("message", (msg) => {
			expect(msg.title, "a third player should be refused, the spectator does not hold a seat").to.equal(
				"Cannot join session"
			);
			thirdPlayer.disconnect();
			clients[ownerIdx].emit("setMaxPlayers", 8);
			done();
		});
	});

	it("Spectator chat reaches players while no game is in progress.", function (done) {
		clients[nonOwnerIdx].once("chatMessage", (msg) => {
			expect(msg.text).to.equal("Hello from the lobby");
			done();
		});
		spectator.emit("chatMessage", { author: spectatorUserID, text: "Hello from the lobby", timestamp: 0 });
	});

	describe("During a draft", function () {
		const secondSpectatorUserID = "SpectatorID2";
		let secondSpectator: ReturnType<typeof connectClient>;
		const clientStates: { [uid: string]: { pickNumber: number; booster: unknown[] } } = {};
		let spectatedPicks = 0;
		let pickAlerts = 0;
		let playerSawSpectatorChat = false;

		it("Setup: bots and private draft logs.", function (done) {
			clients[ownerIdx].emit("setBots", 6);
			clients[ownerIdx].emit("setDraftLogRecipients", "none");
			done();
		});

		it("Draft start sends the spectator startDraft, a skipPick draftState and the live log.", function (done) {
			let startReceived = false;
			let stateReceived = false;
			let logReceived = false;
			const checkDone = () => {
				if (startReceived && stateReceived && logReceived) done();
			};
			spectator.once("startDraft", () => {
				startReceived = true;
				checkDone();
			});
			spectator.once("draftState", (s) => {
				expect((s as { skipPick: boolean }).skipPick).to.be.true;
				stateReceived = true;
				checkDone();
			});
			spectator.once("draftLogLive", (data) => {
				expect(data.log).to.exist;
				logReceived = true;
				checkDone();
			});
			for (const c of clients)
				c.once("draftState", (s) => {
					const state = s as { pickNumber: number; booster: unknown[] };
					clientStates[getUID(c)] = { pickNumber: -1, booster: state.booster };
				});
			clients[ownerIdx].emit("startDraft", ackNoError);
		});

		it("Picks are streamed to the spectator even with draftLogRecipients set to none.", function (done) {
			spectator.on("draftLogLive", (data) => {
				if (data.pick) ++spectatedPicks;
			});
			spectator.on("pickAlert", () => {
				++pickAlerts;
				if (pickAlerts === clients.length) {
					expect(spectatedPicks).to.be.greaterThanOrEqual(clients.length);
					done();
				}
			});
			for (const c of clients) c.emit("pickCard", { pickedCards: [0], burnedCards: [] }, ackNoError);
		});

		it("A spectator joining mid-draft receives the catch-up snapshot.", function (done) {
			secondSpectator = connectClient({
				userID: secondSpectatorUserID,
				sessionID: sessionID,
				userName: "Spectator2",
				spectate: spectateKey,
			});
			secondSpectator.once("draftLogLive", (data) => {
				expect(data.log).to.exist;
				expect(Sessions[sessionID].spectators.has(secondSpectatorUserID)).to.be.true;
				done();
			});
		});

		it("Spectator chat does not reach players during the draft, but reaches other spectators.", function (done) {
			clients[nonOwnerIdx].once("chatMessage", () => {
				playerSawSpectatorChat = true;
			});
			secondSpectator.once("chatMessage", (msg) => {
				expect(msg.text).to.equal("Secret spectator talk");
				setTimeout(() => {
					expect(playerSawSpectatorChat, "players should not receive spectator chat mid-draft").to.be.false;
					clients[nonOwnerIdx].off("chatMessage");
					done();
				}, 100);
			});
			spectator.emit("chatMessage", { author: spectatorUserID, text: "Secret spectator talk", timestamp: 0 });
		});

		it("Player chat reaches spectators during the draft.", function (done) {
			spectator.once("chatMessage", (msg) => {
				expect(msg.text).to.equal("Player talk");
				done();
			});
			clients[nonOwnerIdx].emit("chatMessage", { author: "id1", text: "Player talk", timestamp: 0 });
		});

		it("A spectator disconnect removes them immediately and does not pause the draft.", function (done) {
			secondSpectator.disconnect();
			setTimeout(() => {
				expect(Sessions[sessionID].draftPaused).to.be.false;
				expect(Sessions[sessionID].spectators.has(secondSpectatorUserID)).to.be.false;
				done();
			}, 100);
		});

		it("A disconnected spectator can rejoin mid-draft through the same link.", function (done) {
			secondSpectator.once("draftLogLive", (data) => {
				expect(data.log).to.exist;
				expect(Sessions[sessionID].spectators.has(secondSpectatorUserID)).to.be.true;
				done();
			});
			secondSpectator.connect();
		});

		it("Pick until the draft ends, spectators receive endDraft.", function (done) {
			let spectatorSawEnd = false;
			let draftEnded = 0;
			const checkDone = () => {
				if (spectatorSawEnd && draftEnded === clients.length) done();
			};
			spectator.once("endDraft", () => {
				spectatorSawEnd = true;
				checkDone();
			});
			for (const c of clients) {
				c.on("draftState", (s) => {
					const state = s as { pickNumber: number; booster: unknown[]; boosterCount: number };
					if (state.boosterCount > 0 && state.pickNumber !== clientStates[getUID(c)].pickNumber) {
						clientStates[getUID(c)].pickNumber = state.pickNumber;
						c.emit("pickCard", { pickedCards: [0], burnedCards: [] }, () => {});
					}
				});
				c.once("endDraft", () => {
					c.off("draftState");
					++draftEnded;
					checkDone();
				});
			}
			for (const c of clients) c.emit("pickCard", { pickedCards: [0], burnedCards: [] }, () => {});
		});

		after(function (done) {
			secondSpectator?.disconnect();
			done();
		});
	});

	describe("Moderation", function () {
		it("Non-owners cannot remove a spectator.", function (done) {
			clients[nonOwnerIdx].emit("removePlayer", spectatorUserID);
			setTimeout(() => {
				expect(Sessions[sessionID].spectators.has(spectatorUserID)).to.be.true;
				done();
			}, 100);
		});

		it("The owner can remove a spectator, who is moved to a new session.", function (done) {
			spectator.once("setSession", (newSessionID) => {
				expect(newSessionID).to.not.equal(sessionID);
				expect(Sessions[sessionID].spectators.has(spectatorUserID)).to.be.false;
				done();
			});
			clients[ownerIdx].emit("removePlayer", spectatorUserID);
		});

		it("Disabling spectating sweeps every remaining spectator out.", function (done) {
			const sweptSpectator = connectClient({
				userID: "SweptSpectatorID",
				sessionID: sessionID,
				userName: "Spectator3",
				spectate: spectateKey,
			});
			sweptSpectator.once("sessionOptions", () => {
				sweptSpectator.once("setSession", (newSessionID) => {
					expect(newSessionID).to.not.equal(sessionID);
					expect(Sessions[sessionID].spectators.size).to.equal(0);
					expect(Sessions[sessionID].spectateKey).to.be.undefined;
					sweptSpectator.disconnect();
					done();
				});
				clients[ownerIdx].emit("setAllowSpectators", false, ackNoError);
			});
		});

		it("Session.addSpectator is a no-op while spectating is disabled.", function (done) {
			Sessions[sessionID].addSpectator(spectatorUserID);
			expect(Sessions[sessionID].spectators.size).to.equal(0);
			done();
		});
	});
});

describe("Spectators in unsupported game modes", function () {
	let clients: ReturnType<typeof makeClients> = [];
	const sessionID = "SpectatorsWinstonSession";
	let ownerIdx = 0;
	let spectateKey = "";

	beforeEach(function (done) {
		disableLogs();
		done();
	});

	afterEach(function (done) {
		enableLogs(this.currentTest?.state === "failed");
		done();
	});

	before(function (done) {
		clients = makeClients(
			[
				{ userID: "wid0", sessionID: sessionID, userName: "Client0" },
				{ userID: "wid1", sessionID: sessionID, userName: "Client1" },
			],
			done
		);
	});

	after(function (done) {
		disableLogs();
		for (const c of clients) c.disconnect();
		waitForClientDisconnects(done);
	});

	it("Setup: enable spectating and start a Winston draft.", function (done) {
		ownerIdx = clients.findIndex((c) => getUID(c) === Sessions[sessionID].owner);
		clients[ownerIdx].emit("setAllowSpectators", true, (r) => {
			ackNoError(r);
			spectateKey = r.spectateKey!;
			clients[(ownerIdx + 1) % clients.length].once("startWinstonDraft", () => done());
			clients[ownerIdx].emit("startWinstonDraft", 6, 3, true, ackNoError);
		});
	});

	it("A spectator link is refused while an unsupported game mode is running.", function (done) {
		const spectator = connectClient({
			userID: "WinstonSpectatorID",
			sessionID: sessionID,
			userName: "Spectator1",
			spectate: spectateKey,
		});
		spectator.once("message", (msg) => {
			expect(msg.title).to.equal("Cannot spectate session");
			expect(Sessions[sessionID].spectators.has("WinstonSpectatorID")).to.be.false;
			spectator.disconnect();
			done();
		});
	});
});

describe("Spectators across a server restart", function () {
	let clients: ReturnType<typeof makeClients> = [];
	const sessionID = "SpectatorsRestartSession";
	let ownerIdx = 0;
	let ownerUserID = "";
	let spectateKey = "";
	const spectatorUserID = "RestartSpectatorID";
	let spectator: ReturnType<typeof connectClient>;

	beforeEach(function (done) {
		disableLogs();
		done();
	});

	afterEach(function (done) {
		enableLogs(this.currentTest?.state === "failed");
		done();
	});

	before(function (done) {
		clients = makeClients(
			[
				{ userID: "rid0", sessionID: sessionID, userName: "Client0" },
				{ userID: "rid1", sessionID: sessionID, userName: "Client1" },
			],
			done
		);
	});

	after(function (done) {
		disableLogs();
		for (const c of clients) c.disconnect();
		spectator?.disconnect();
		waitForClientDisconnects(done);
	});

	it("Setup: spectator joins, draft starts.", function (done) {
		ownerIdx = clients.findIndex((c) => getUID(c) === Sessions[sessionID].owner);
		ownerUserID = getUID(clients[ownerIdx]);
		clients[ownerIdx].emit("setBots", 6);
		clients[ownerIdx].emit("setAllowSpectators", true, (r) => {
			ackNoError(r);
			spectateKey = r.spectateKey!;
			spectator = connectClient({
				userID: spectatorUserID,
				sessionID: sessionID,
				userName: "Spectator1",
				spectate: spectateKey,
			});
			spectator.once("sessionSpectators", () => {
				clients[ownerIdx].emit("startDraft", ackNoError);
			});
			spectator.once("startDraft", () => done());
		});
	});

	it("Simulate server restart.", async function () {
		await simulateRestart();
	});

	it("All clients are disconnected.", function (done) {
		let closed = 0;
		const sockets = [...clients, spectator];
		for (const s of sockets)
			waitForSocket(s, () => {
				++closed;
				if (closed === sockets.length) done();
			});
	});

	it("The spectator cannot rejoin while the session is inactive.", function (done) {
		spectator.once("message", (msg) => {
			expect(msg.title).to.equal("Cannot spectate session");
			done();
		});
		spectator.connect();
	});

	it("Players reconnect, the owner first so they keep ownership.", function (done) {
		const nonOwner = clients[(ownerIdx + 1) % clients.length];
		clients[ownerIdx].once("rejoinDraft", () => {
			expect(Sessions[sessionID].owner).to.equal(ownerUserID);
			nonOwner.once("rejoinDraft", () => done());
			nonOwner.connect();
		});
		clients[ownerIdx].connect();
	});

	it("The spectator rejoins through the same link once the session is live again.", function (done) {
		spectator.once("draftLogLive", (data) => {
			expect(data.log).to.exist;
			expect(Sessions[sessionID].spectators.has(spectatorUserID)).to.be.true;
			expect(Sessions[sessionID].owner, "a returning spectator must not become owner").to.equal(ownerUserID);
			expect(Sessions[sessionID].allowSpectators).to.be.true;
			expect(Sessions[sessionID].spectateKey).to.equal(spectateKey);
			done();
		});
		spectator.connect();
	});

	it("The draft can be stopped.", function (done) {
		clients[ownerIdx].emit("stopDraft");
		done();
	});
});

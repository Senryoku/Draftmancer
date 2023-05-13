"use strict";
import { before, after, beforeEach, afterEach, describe, it } from "mocha";
import chai from "chai";
const expect = chai.expect;
import { Sessions } from "../src/Session.js";
import { Connections } from "../src/Connection.js";
import { makeClients, enableLogs, disableLogs, waitForClientDisconnects, ackNoError } from "./src/common.js";
import { TeamSealedSyncData } from "../src/TeamSealed.js";
import { UserID } from "../src/IDTypes.js";

describe("Team Sealed", function () {
	let clients: ReturnType<typeof makeClients> = [];
	const sessionID = "sessionID";
	let ownerIdx = 0;

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
			[0, 1, 2, 3, 4, 5].map((idx) => {
				return {
					userID: "id" + idx,
					sessionID: sessionID,
					userName: "Client" + idx,
				};
			}),
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

	it(`6 clients with different userID should be connected.`, function (done) {
		expect(Object.keys(Connections).length).to.equal(6);
		ownerIdx = clients.findIndex((c) => (c as any).query.userID == Sessions[sessionID].owner);
		expect(ownerIdx).to.not.be.null;
		expect(ownerIdx).to.not.be.undefined;
		done();
	});

	let teamSealedStates: { [uid: UserID]: TeamSealedSyncData } = {};

	const startTeamSealed = (boosterCount = 12, customBoosters: string[] | null = null) => {
		it("Start Team Sealed.", function (done) {
			let eventsReceived = 0;
			teamSealedStates = {};
			for (const c of clients) {
				c.once("startTeamSealed", (data) => {
					expect(data.state).to.exist;
					expect(data.state.team).to.contain((c as any).query.userID);
					expect(data.state.cards).to.exist;
					expect(data.state.cards.length).to.be.greaterThanOrEqual(14 * 12);
					teamSealedStates[(c as any).query.userID as string] = data.state;
					eventsReceived++;
					if (eventsReceived === clients.length) done();
				});
			}
			clients[ownerIdx].emit(
				"startTeamSealed",
				boosterCount,
				customBoosters ?? Array(boosterCount).fill(""),
				[
					clients.map((c: any) => c.query.userID as string).splice(0, 3),
					clients.map((c: any) => c.query.userID as string).splice(3, 6),
				],
				ackNoError
			);
		});
	};

	const pickTeamSealed = (idx = 0) => {
		it(`Player #${idx} picks a card, each player in their team receives an update.`, function (done) {
			const p = (clients[idx] as any).query.userID as string;
			const s = teamSealedStates[p]!;
			const cid = s.cards.find((c) => !c.owner)!.uniqueID;
			expect(cid).to.exist;
			let eventsReceived = 0;
			for (const uid of s.team) {
				clients
					.find((c: any) => c.query.userID === uid)!
					.once("teamSealedUpdateCard", (cardUniqueID, newOwner) => {
						expect(cardUniqueID).to.equal(cid);
						expect(newOwner).to.equal(p);
						const card = teamSealedStates[uid]!.cards.find((c) => c.uniqueID == cardUniqueID)!;
						expect(card.owner).to.equal(null);
						card.owner = newOwner;
						++eventsReceived;
						if (eventsReceived == s.team.length) done();
					});
			}
			clients[idx].emit("teamSealedPick", cid, ackNoError);
		});
	};

	const unavailablePickTeamSealed = (idx = 0) => {
		it(`Player #${idx} tries to pick a already picked card, receives an error.`, function (done) {
			const p = (clients[0] as any).query.userID;
			const s = teamSealedStates[p]!;
			const cid = s.cards.find((c) => c.owner && c.owner !== p)!.uniqueID;
			expect(cid).to.exist;
			clients[0].emit("teamSealedPick", cid, (err) => {
				expect(err.code).to.equal(-1);
				done();
			});
		});
	};

	const endTeamSealed = () => {
		it("Owner ends the event.", function (done) {
			let eventsReceived = 0;

			for (let c = 0; c < clients.length; ++c) {
				clients[c].once("endTeamSealed", () => {
					++eventsReceived;
					if (eventsReceived === clients.length) done();
				});
			}
			clients[ownerIdx].emit("stopDraft");
		});
	};

	describe("Default settings", function () {
		startTeamSealed();
		for (let i = 0; i < 6; i++) pickTeamSealed(i);
		unavailablePickTeamSealed();
		endTeamSealed();
	});

	describe("With custom boosters", function () {
		startTeamSealed(12, ["one", "bro", "rna", "grn", "m20", "dom", "one", "bro", "rna", "grn", "m20", "dom"]);
		for (let i = 0; i < 6; i++) pickTeamSealed(i);
		unavailablePickTeamSealed();
		endTeamSealed();
	});

	describe("With cube", () => {
		it("Load cube.", (done) => {
			const nonOwnerIdx = (ownerIdx + 1) % clients.length;
			clients[nonOwnerIdx].once("sessionOptions", (options) => {
				expect(options.useCustomCardList).to.be.true;
				done();
			});
			clients[ownerIdx].emit("loadLocalCustomCardList", "Arena Historic Cube #1", ackNoError);
		});
		startTeamSealed();
		for (let i = 0; i < 6; i++) pickTeamSealed(i);
		unavailablePickTeamSealed();
		endTeamSealed();
	});
});

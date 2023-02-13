"use strict";
import { before, after, beforeEach, afterEach, describe, it } from "mocha";
import chai from "chai";
const expect = chai.expect;
import { Sessions } from "../dist/Session.js";
import { Connections } from "../dist/Connection.js";
import { makeClients, enableLogs, disableLogs, waitForClientDisconnects } from "./src/common.js";

describe("Team Sealed", function () {
	let clients = [];
	let sessionID = "sessionID";
	let ownerIdx;

	beforeEach(function (done) {
		disableLogs();
		done();
	});

	afterEach(function (done) {
		enableLogs(this.currentTest.state == "failed");
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
		ownerIdx = clients.findIndex((c) => c.query.userID == Sessions[sessionID].owner);
		expect(ownerIdx).to.not.be.null;
		expect(ownerIdx).to.not.be.undefined;
		done();
	});

	let teamSealedStates = {};

	const startTeamSealed = (boosterCount = 12, customBoosters = null) => {
		it("Start Team Sealed.", function (done) {
			let eventsReceived = 0;
			teamSealedStates = {};
			for (const c of clients) {
				c.once("startTeamSealed", (data) => {
					expect(data.state).to.exist;
					expect(data.state.team).to.contain(c.query.userID);
					expect(data.state.cards).to.exist;
					expect(data.state.cards.length).to.be.greaterThanOrEqual(14 * 12);
					teamSealedStates[c.query.userID] = data.state;
					eventsReceived++;
					if (eventsReceived === clients.length) done();
				});
			}
			clients[ownerIdx].emit("startTeamSealed", boosterCount, customBoosters, [
				clients.map((c) => c.query.userID).splice(0, 3),
				clients.map((c) => c.query.userID).splice(3, 6),
			]);
		});
	};

	const pickTeamSealed = (idx = 0) => {
		it(`Player #${idx} picks a card, each player in their team receives an update.`, function (done) {
			const p = clients[idx].query.userID;
			const s = teamSealedStates[p];
			const cid = s.cards.find((c) => !c.owner).uniqueID;
			expect(cid).to.exist;
			let eventsReceived = 0;
			for (const uid of s.team) {
				clients
					.find((c) => c.query.userID === uid)
					.once("teamSealedUpdateCard", (cardUniqueID, newOwner) => {
						expect(cardUniqueID).to.equal(cid);
						expect(newOwner).to.equal(p);
						const card = teamSealedStates[uid].cards.find((c) => c.uniqueID == cardUniqueID);
						expect(card.owner).to.equal(null);
						card.owner = newOwner;
						++eventsReceived;
						if (eventsReceived == s.team.length) done();
					});
			}
			clients[idx].emit("teamSealedPick", cid);
		});
	};

	const unavailablePickTeamSealed = (idx = 0) => {
		it(`Player #${idx} tries to pick a already picked card, receives an error.`, function (done) {
			const p = clients[0].query.userID;
			const s = teamSealedStates[p];
			const cid = s.cards.find((c) => c.owner && c.owner !== p).uniqueID;
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
});

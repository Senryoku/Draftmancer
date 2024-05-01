import { before, after, beforeEach, afterEach, describe, it } from "mocha";
import { makeClients, enableLogs, disableLogs, waitForClientDisconnects, ackNoError, getUID } from "./src/common.js";
import { UniqueCard } from "../src/CardTypes.js";
import { ArrayElement } from "../src/TypeChecks.js";
import { DraftmancerPort } from "../src/server.js";
import { expect } from "chai";
import { DraftLog } from "../src/DraftLog.js";

describe("HTTP API", function () {
	let clients: Array<
		ArrayElement<ReturnType<typeof makeClients>> & {
			state?: {
				booster: UniqueCard[];
				boosterCount: number;
				boosterNumber: number;
				pickNumber: number;
				skipPick: boolean;
			};
		}
	> = [];
	const sessionID = "sessionID";
	const ownerIdx = 0;
	const nonOwnerIdx = 1;

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

	const startDraft = () => {
		it("Start draft", function (done) {
			let connectedClients = 0;
			let receivedBoosters = 0;
			for (const c in clients) {
				clients[c].once("startDraft", () => {
					connectedClients += 1;
					if (connectedClients == clients.length && receivedBoosters == clients.length) done();
				});
				(() => {
					clients[c].once("draftState", (state) => {
						receivedBoosters += 1;
						const s = state as {
							booster: UniqueCard[];
							boosterCount: number;
							boosterNumber: number;
							pickNumber: 0;
							skipPick: boolean;
						};
						clients[c].state = s;
						if (connectedClients == clients.length && receivedBoosters == clients.length) done();
					});
				})();
			}
			clients[ownerIdx].emit("startDraft", ackNoError);
		});
	};

	const endDraft = () => {
		it("End draft", function (done) {
			let draftEnded = 0;
			for (let c = 0; c < clients.length; ++c) {
				clients[c].on("draftState", function (state) {
					const s = state as {
						booster: UniqueCard[];
						boosterCount: number;
						boosterNumber: number;
						pickNumber: 0;
						skipPick: boolean;
					};
					if (s.pickNumber !== clients[c].state?.pickNumber && s.boosterCount > 0) {
						clients[c].state = s;
						clients[c].emit("pickCard", { pickedCards: [0], burnedCards: [] }, () => {});
					}
				});
				clients[c].once("endDraft", function () {
					draftEnded += 1;
					clients[c].removeListener("draftState");
					if (draftEnded === clients.length) done();
				});
			}
			for (let c = 0; c < clients.length; ++c) {
				clients[c].emit("pickCard", { pickedCards: [0], burnedCards: [] }, () => {});
			}
		});
	};

	describe("Default settings", function () {
		it("Request log of invalid session", function (done) {
			fetch(`http://localhost:${DraftmancerPort}/api/getDraftLog/non-existing-session-id`)
				.then((res) => {
					expect(res.status).to.equal(404);
					done();
				})
				.catch(done);
		});

		it("Request non-existing log of a valid session", function (done) {
			fetch(`http://localhost:${DraftmancerPort}/api/getDraftLog/${sessionID}`)
				.then((res) => {
					expect(res.status).to.equal(404);
					done();
				})
				.catch(done);
		});

		startDraft();

		it("Request log of a valid drafting session: Forbidden", function (done) {
			fetch(`http://localhost:${DraftmancerPort}/api/getDraftLog/${sessionID}`)
				.then((res) => {
					expect(res.status).to.equal(403);
					done();
				})
				.catch(done);
		});

		endDraft();

		it("Request existing log of a valid session", function (done) {
			fetch(`http://localhost:${DraftmancerPort}/api/getDraftLog/${sessionID}`)
				.then(async (res) => {
					expect(res.status).to.equal(200);
					const log = (await res.json()) as DraftLog;
					expect(log.sessionID).to.equal(sessionID);
					expect(log.delayed).to.equal(false);
					done();
				})
				.catch(done);
		});
	});

	describe("Delayed logs", function () {
		let ownerDraftLog: DraftLog | undefined = undefined;

		it("Emit settings: Delayed logs", (done) => {
			clients[nonOwnerIdx].once("sessionOptions", (data) => {
				expect(data.draftLogRecipients).to.equal("delayed");
				done();
			});
			clients[ownerIdx].emit("setDraftLogRecipients", "delayed");
		});

		startDraft();

		it("Request log of a valid drafting session: Forbidden", function (done) {
			clients[ownerIdx].once("draftLog", function (draftLog) {
				ownerDraftLog = draftLog;
			});

			fetch(`http://localhost:${DraftmancerPort}/api/getDraftLog/${sessionID}`)
				.then((res) => {
					expect(res.status).to.equal(403);
					done();
				})
				.catch(done);
		});

		endDraft();

		it("Request should return restrited logs.", function (done) {
			fetch(`http://localhost:${DraftmancerPort}/api/getDraftLog/${sessionID}`)
				.then(async (res) => {
					expect(res.status).to.equal(200);
					const log = (await res.json()) as DraftLog;
					expect(log.sessionID).to.equal(sessionID);
					expect(log.delayed).to.equal(true);
					expect(log.boosters).to.be.empty;
					for (let i = 0; i < clients.length; ++i) expect(log.users[getUID(clients[i])].cards).to.be.empty;
					done();
				})
				.catch(done);
		});

		it("Owner unlock the logs, connected users should received it immediately.", (done) => {
			clients[nonOwnerIdx].once("draftLog", function (draftLog) {
				expect(draftLog.delayed).to.be.false;
				done();
			});
			clients[ownerIdx].emit("shareDraftLog", ownerDraftLog!);
		});

		it("Request should return fulls logs.", function (done) {
			fetch(`http://localhost:${DraftmancerPort}/api/getDraftLog/${sessionID}`)
				.then(async (res) => {
					expect(res.status).to.equal(200);
					const log = (await res.json()) as DraftLog;
					expect(log.sessionID).to.equal(sessionID);
					expect(log.delayed).to.equal(false);
					expect(log.boosters).to.not.be.empty;
					for (let i = 0; i < clients.length; ++i)
						expect(log.users[getUID(clients[i])].cards).to.not.be.empty;
					done();
				})
				.catch(done);
		});
	});

	describe("Owner only logs", function () {
		it("Emit settings: Owner only logs", (done) => {
			clients[nonOwnerIdx].once("sessionOptions", (data) => {
				expect(data.draftLogRecipients).to.equal("owner");
				done();
			});
			clients[ownerIdx].emit("setDraftLogRecipients", "owner");
		});

		startDraft();

		it("Request log of a valid drafting session: Forbidden", function (done) {
			fetch(`http://localhost:${DraftmancerPort}/api/getDraftLog/${sessionID}`)
				.then((res) => {
					expect(res.status).to.equal(403);
					done();
				})
				.catch(done);
		});

		endDraft();

		it("Request of draft log should fail: Forbidden.", function (done) {
			fetch(`http://localhost:${DraftmancerPort}/api/getDraftLog/${sessionID}`)
				.then(async (res) => {
					expect(res.status).to.equal(403);
					done();
				})
				.catch(done);
		});
	});

	describe("Private logs", function () {
		it("Emit settings: No logs", (done) => {
			clients[nonOwnerIdx].once("sessionOptions", (data) => {
				expect(data.draftLogRecipients).to.equal("none");
				done();
			});
			clients[ownerIdx].emit("setDraftLogRecipients", "none");
		});

		startDraft();

		it("Request log of a valid drafting session: Forbidden", function (done) {
			fetch(`http://localhost:${DraftmancerPort}/api/getDraftLog/${sessionID}`)
				.then((res) => {
					expect(res.status).to.equal(403);
					done();
				})
				.catch(done);
		});

		endDraft();

		it("Request of draft log should fail: Forbidden.", function (done) {
			fetch(`http://localhost:${DraftmancerPort}/api/getDraftLog/${sessionID}`)
				.then(async (res) => {
					expect(res.status).to.equal(403);
					done();
				})
				.catch(done);
		});
	});
});

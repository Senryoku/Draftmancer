import { before, after, beforeEach, afterEach, describe, it } from "mocha";
import { expect } from "chai";
import { Sessions } from "../src/Session.js";
import { makeClients, waitForClientDisconnects, enableLogs, disableLogs, ackNoError, getUID } from "./src/common.js";
import { BracketType } from "../src/Brackets.js";

describe("Brackets", function () {
	let clients: ReturnType<typeof makeClients> = [];
	const sessionID = "SessionID";
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
		for (let i = 0; i < 8; ++i)
			queries.push({
				sessionID: sessionID,
				userName: "DontCare",
			});
		clients = makeClients(queries, () => {
			ownerIdx = clients.findIndex((c) => getUID(c) === Sessions[sessionID].owner);
			done();
		});
	});

	after(function (done) {
		disableLogs();
		for (const c of clients) {
			c.disconnect();
		}

		waitForClientDisconnects(done);
	});

	it(`Generate bracket, should receive a new bracket.`, function (done) {
		clients[ownerIdx].once("sessionOptions", function (data) {
			expect(data.bracket).to.not.be.null;
			done();
		});
		clients[ownerIdx].emit("generateBracket", BracketType.Single, ackNoError);
	});

	it(`Generate swiss bracket, should receive a new bracket.`, function (done) {
		clients[ownerIdx].once("sessionOptions", function (data) {
			expect(data.bracket).to.not.be.null;
			done();
		});
		clients[ownerIdx].emit("generateBracket", BracketType.Swiss, ackNoError);
	});

	it(`Generate double bracket, should receive a new bracket.`, function (done) {
		clients[ownerIdx].once("sessionOptions", function (data) {
			expect(data.bracket).to.not.be.null;
			done();
		});
		clients[ownerIdx].emit("generateBracket", BracketType.Double, ackNoError);
	});
});

import chai from "chai";
const expect = chai.expect;
import { Sessions } from "../src/Session.js";
import { makeClients, waitForClientDisconnects, enableLogs, disableLogs } from "./src/common.js";

describe("Brackets", function() {
	let clients = [];
	let sessionID = "SessionID";
	let ownerIdx = null;

	beforeEach(function(done) {
		disableLogs();
		done();
	});

	afterEach(function(done) {
		enableLogs(this.currentTest.state == "failed");
		done();
	});

	before(function(done) {
		let queries = [];
		for (let i = 0; i < 8; ++i)
			queries.push({
				sessionID: sessionID,
				userName: "DontCare",
			});
		clients = makeClients(queries, () => {
			ownerIdx = clients.findIndex(c => c.query.userID == Sessions[sessionID].owner);
			done();
		});
	});

	after(function(done) {
		disableLogs();
		for (let c of clients) {
			c.disconnect();
		}

		waitForClientDisconnects(done);
	});

	it(`Generate bracket, should receive a new bracket.`, function(done) {
		clients[ownerIdx].once("sessionOptions", function(data) {
			expect(data.bracket).to.not.be.null;
			done();
		});
		clients[ownerIdx].emit(
			"generateBracket",
			clients.map(c => c.query.userName)
		);
	});

	it(`Generate swiss bracket, should receive a new bracket.`, function(done) {
		clients[ownerIdx].once("sessionOptions", function(data) {
			expect(data.bracket).to.not.be.null;
			done();
		});
		clients[ownerIdx].emit(
			"generateSwissBracket",
			clients.map(c => c.query.userName)
		);
	});

	it(`Generate double bracket, should receive a new bracket.`, function(done) {
		clients[ownerIdx].once("sessionOptions", function(data) {
			expect(data.bracket).to.not.be.null;
			done();
		});
		clients[ownerIdx].emit(
			"generateDoubleBracket",
			clients.map(c => c.query.userName)
		);
	});
});

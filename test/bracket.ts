import { before, after, beforeEach, afterEach, describe, it } from "mocha";
import { expect } from "chai";
import { Sessions } from "../src/Session.js";
import { makeClients, waitForClientDisconnects, enableLogs, disableLogs, ackNoError, getUID } from "./src/common.js";
import { BracketType, IBracket, Match, PlayerPlaceholder } from "../src/Brackets.js";
import { simulateMTGOResult } from "./src/MTGOResult.js";

describe("Brackets", function () {
	let clients: ReturnType<typeof makeClients> = [];
	const sessionID = "SessionID";
	let ownerIdx: number = 0;
	let bracket: IBracket | null = null;

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
				userName: `Player_${i}`,
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

	describe("Single", function () {
		it(`Generate bracket, should receive a new bracket.`, function (done) {
			clients[ownerIdx].once("sessionOptions", function (data) {
				expect(data.bracket).to.not.be.null;
				for (let m = 0; m < 4; ++m) {
					expect(data.bracket!.matches[m].players[0]).to.equal(2 * m + 0);
					expect(data.bracket!.matches[m].players[1]).to.equal(2 * m + 1);
				}
				done();
			});
			clients[ownerIdx].emit("generateBracket", BracketType.Single, ackNoError);
		});

		it(`Update match results.`, function (done) {
			clients[ownerIdx].once("sessionOptions", function (data) {
				expect(data.bracket).to.not.be.null;
				expect(data.bracket!.matches[data.bracket!.bracket[0][0]].results[0]).to.equal(2);
				expect(data.bracket!.matches[data.bracket!.bracket[1][0]].players[0]).to.equal(0);
				expect(data.bracket!.matches[data.bracket!.bracket[1][0]].players[1]).to.equal(PlayerPlaceholder.TBD);
				done();
			});
			clients[ownerIdx].emit("updateBracket", 0, 0, 2);
		});

		it(`Update match results.`, function (done) {
			clients[ownerIdx].once("sessionOptions", function (data) {
				expect(data.bracket).to.not.be.null;
				expect(data.bracket!.matches[data.bracket!.bracket[0][1]].results[1]).to.equal(2);
				expect(data.bracket!.matches[data.bracket!.bracket[1][0]].players[0]).to.equal(0);
				expect(data.bracket!.matches[data.bracket!.bracket[1][0]].players[1]).to.equal(3);
				done();
			});
			clients[ownerIdx].emit("updateBracket", 1, 1, 2);
		});

		it(`Receive MTGO match, without enabling auto sync.`, function (done) {
			clients[ownerIdx].once("sessionOptions", function (data) {
				expect(data.bracket).to.not.be.null;
				expect(data.bracket!.matches[data.bracket!.bracket[1][0]].results[0]).to.equal(0);
				expect(data.bracket!.matches[data.bracket!.bracket[1][0]].results[1]).to.equal(2);
				done();
			});
			simulateMTGOResult(["Player_0", "Player_3"], [2, 1]); // Ignored because MTGO sync is disabled
			clients[ownerIdx].emit("updateBracket", 4, 1, 2);
		});

		it(`Enabled MTGO sync`, function (done) {
			clients[ownerIdx].once("sessionOptions", function (data) {
				expect(data.bracket).to.not.be.null;
				expect(data.bracket!.MTGOSynced).to.be.true;
				bracket = data.bracket;
				done();
			});
			clients[ownerIdx].emit("syncBracketMTGO", true);
		});

		it(`Receive MTGO match, with auto sync. enabled`, function (done) {
			clients[ownerIdx].once("sessionOptions", function (data) {
				expect(data.bracket).to.not.be.null;
				expect(data.bracket!.matches[bracket!.bracket[0][2]].results[0]).to.equal(2);
				expect(data.bracket!.matches[bracket!.bracket[0][2]].results[1]).to.equal(1);
				done();
			});
			simulateMTGOResult(
				[
					bracket!.players[bracket!.matches[bracket!.bracket[0][2]].players[0]]!.userName,
					bracket!.players[bracket!.matches[bracket!.bracket[0][2]].players[1]]!.userName,
				],
				[2, 1]
			);
		});

		it(`Generate new bracket.`, function (done) {
			clients[ownerIdx].once("sessionOptions", function (data) {
				expect(data.bracket).to.not.be.null;
				for (let m = 0; m < 4; ++m) {
					expect(data.bracket!.matches[m].players[0]).to.equal(2 * m + 0);
					expect(data.bracket!.matches[m].players[1]).to.equal(2 * m + 1);
				}
				done();
			});
			clients[ownerIdx].emit("generateBracket", BracketType.Single, ackNoError);
		});

		it(`Receive MTGO match, without enabling auto sync.`, function (done) {
			clients[ownerIdx].once("sessionOptions", function (data) {
				expect(data.bracket).to.not.be.null;
				expect(data.bracket!.matches[data.bracket!.bracket[1][0]].results[0]).to.equal(0);
				expect(data.bracket!.matches[data.bracket!.bracket[1][0]].results[1]).to.equal(2);
				done();
			});
			simulateMTGOResult(["Player_0", "Player_3"], [2, 1]); // Ignored because MTGO sync is disabled
			clients[ownerIdx].emit("updateBracket", 4, 1, 2);
		});

		it(`Enabled MTGO sync`, function (done) {
			clients[ownerIdx].once("sessionOptions", function (data) {
				expect(data.bracket).to.not.be.null;
				expect(data.bracket!.MTGOSynced).to.be.true;
				bracket = data.bracket;
				done();
			});
			clients[ownerIdx].emit("syncBracketMTGO", true);
		});

		it(`Receive MTGO match, with auto sync. enabled`, function (done) {
			clients[ownerIdx].once("sessionOptions", function (data) {
				expect(data.bracket).to.not.be.null;
				expect(data.bracket!.matches[bracket!.bracket[0][2]].results[0]).to.equal(2);
				expect(data.bracket!.matches[bracket!.bracket[0][2]].results[1]).to.equal(1);
				done();
			});
			simulateMTGOResult(
				[
					bracket!.players[bracket!.matches[bracket!.bracket[0][2]].players[0]]!.userName,
					bracket!.players[bracket!.matches[bracket!.bracket[0][2]].players[1]]!.userName,
				],
				[2, 1]
			);
		});
	});

	describe("Swiss", function () {
		it(`Generate swiss bracket, should receive a new bracket.`, function (done) {
			clients[ownerIdx].once("sessionOptions", function (data) {
				expect(data.bracket).to.not.be.null;
				for (let m = 0; m < 8; ++m) {
					expect(data.bracket!.matches[4 + m].players[0]).to.equal(PlayerPlaceholder.TBD);
					expect(data.bracket!.matches[4 + m].players[1]).to.equal(PlayerPlaceholder.TBD);
				}
				done();
			});
			clients[ownerIdx].emit("generateBracket", BracketType.Swiss, ackNoError);
		});

		it(`Update match results.`, function (done) {
			clients[ownerIdx].once("sessionOptions", function (data) {
				expect(data.bracket).to.not.be.null;
				expect(data.bracket!.matches[0].results[0]).to.equal(2);
				for (let m = 0; m < 8; ++m) {
					expect(data.bracket!.matches[4 + m].players[0]).to.equal(PlayerPlaceholder.TBD);
					expect(data.bracket!.matches[4 + m].players[1]).to.equal(PlayerPlaceholder.TBD);
				}
				done();
			});
			clients[ownerIdx].emit("updateBracket", 0, 0, 2);
		});

		it(`Fill first round.`, function (done) {
			let updates = 1;

			clients[ownerIdx].on("sessionOptions", function (data) {
				expect(data.bracket).to.not.be.null;
				expect(data.bracket!.matches[0].results[0]).to.equal(2);
				updates += 1;
				if (updates < 4) {
					for (let m = 0; m < 8; ++m) {
						expect(data.bracket!.matches[4 + m].players[0]).to.equal(PlayerPlaceholder.TBD);
						expect(data.bracket!.matches[4 + m].players[1]).to.equal(PlayerPlaceholder.TBD);
					}
				} else {
					for (let m = 0; m < 4; ++m) {
						expect(data.bracket!.matches[4 + m].players[0]).to.not.equal(PlayerPlaceholder.TBD);
						expect(data.bracket!.matches[4 + m].players[1]).to.not.equal(PlayerPlaceholder.TBD);
					}
					for (let m = 0; m < 4; ++m) {
						expect(data.bracket!.matches[8 + m].players[0]).to.equal(PlayerPlaceholder.TBD);
						expect(data.bracket!.matches[8 + m].players[1]).to.equal(PlayerPlaceholder.TBD);
					}
					clients[ownerIdx].removeListener("sessionOptions");
					done();
				}
			});
			clients[ownerIdx].emit("updateBracket", 1, 0, 2);
			clients[ownerIdx].emit("updateBracket", 2, 0, 2);
			clients[ownerIdx].emit("updateBracket", 3, 0, 2);
		});

		it(`Fill second round.`, function (done) {
			let updates = 0;

			clients[ownerIdx].on("sessionOptions", function (data) {
				expect(data.bracket).to.not.be.null;
				expect(data.bracket!.matches[0].results[0]).to.equal(2);
				updates += 1;
				if (updates < 4) {
					for (let m = 0; m < 4; ++m) {
						expect(data.bracket!.matches[8 + m].players[0]).to.equal(PlayerPlaceholder.TBD);
						expect(data.bracket!.matches[8 + m].players[1]).to.equal(PlayerPlaceholder.TBD);
					}
				} else {
					for (let m = 0; m < 12; ++m) {
						expect(data.bracket!.matches[m].players[0]).to.not.equal(PlayerPlaceholder.TBD);
						expect(data.bracket!.matches[m].players[1]).to.not.equal(PlayerPlaceholder.TBD);
					}

					// No duplicate matches
					const pairings = data.bracket!.matches.map((m: Match) => m.players.toSorted().toString());
					expect(new Set(pairings).size).to.equal(data.bracket!.matches.length);

					clients[ownerIdx].removeListener("sessionOptions");
					done();
				}
			});
			clients[ownerIdx].emit("updateBracket", 4, 0, 2);
			clients[ownerIdx].emit("updateBracket", 5, 0, 2);
			clients[ownerIdx].emit("updateBracket", 6, 0, 2);
			clients[ownerIdx].emit("updateBracket", 7, 0, 2);
		});
	});

	describe("Double", function () {
		it(`Generate double bracket, should receive a new bracket.`, function (done) {
			clients[ownerIdx].once("sessionOptions", function (data) {
				expect(data.bracket).to.not.be.null;
				done();
			});
			clients[ownerIdx].emit("generateBracket", BracketType.Double, ackNoError);
		});
	});
});

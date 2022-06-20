"use strict";

import chai from "chai";
const expect = chai.expect;
import { Sessions } from "../dist/Session.js";
import { Connections } from "../dist/Connection.js";
import { makeClients, enableLogs, disableLogs, waitForSocket, waitForClientDisconnects } from "./src/common.js";

describe("Minesweeper Draft", function() {
	let clients = [];
	let sessionID = "sessionID";
	let ownerIdx;

	beforeEach(function(done) {
		disableLogs();
		done();
	});

	afterEach(function(done) {
		enableLogs(this.currentTest.state == "failed");
		done();
	});

	before(function(done) {
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
			],
			done
		);
	});

	after(function(done) {
		disableLogs();
		for (let c of clients) {
			c.disconnect();
		}
		waitForClientDisconnects(done);
	});

	it(`4 clients with different userID should be connected.`, function(done) {
		expect(Object.keys(Connections).length).to.equal(4);
		ownerIdx = clients.findIndex(c => c.query.userID == Sessions[sessionID].owner);
		expect(ownerIdx).to.not.be.null;
		expect(ownerIdx).to.not.be.undefined;
		done();
	});

	let minesweeper = null;

	const selectCube = () => {
		it("Emit Settings.", function(done) {
			let nonOwnerIdx = (ownerIdx + 1) % clients.length;
			clients[nonOwnerIdx].once("sessionOptions", function(options) {
				if (options.useCustomCardList) done();
			});
			clients[ownerIdx].emit("setUseCustomCardList", true);
			clients[ownerIdx].emit("loadLocalCustomCardList", "Arena Historic Cube #1");
		});
	};

	const startDraft = (gridCount = 4, gridWidth = 10, gridHeight = 9, picksPerGrid = -1) => {
		it(`Start Minesweeper draft (Parameters: gridCount = ${gridCount}, gridWidth = ${gridWidth}, gridHeight = ${gridHeight}, picksPerGrid = ${picksPerGrid})`, function(done) {
			let connectedClients = 0;
			for (let c of clients) {
				c.once("startMinesweeperDraft", function(state) {
					connectedClients += 1;
					if (connectedClients == clients.length) {
						minesweeper = state;
						done();
					}
				});
			}
			if (picksPerGrid === -1) picksPerGrid = clients.length * 9;
			clients[ownerIdx].emit(
				"startMinesweeperDraft",
				gridCount,
				gridWidth,
				gridHeight,
				picksPerGrid,
				response => {
					expect(response?.error).to.be.undefined;
				}
			);
		});
	};

	const endDraft = () => {
		it("Every player randomly chooses a card and the draft should end.", function(done) {
			let draftEnded = 0;

			for (let c = 0; c < clients.length; ++c) {
				const pick = (row, col) => {
					const cl = clients[c];
					cl.emit("minesweeperDraftPick", row, col, response => {
						if (response?.error) console.error(response?.error);
						expect(response?.error).to.be.undefined;
					});
				};
				clients[c].on("minesweeperDraftState", function(state) {
					let choices = [];
					for (let i = 0; i < state.grid.length; ++i) {
						for (let j = 0; j < state.grid[0].length; ++j) {
							if (state.grid[i][j].state === 1) choices.push([i, j]);
							if (state.grid[i][j].state === 2) {
								// If Picked, neightbors should be revealed.
								if (i > 0) expect(state.grid[i - 1][j].state).to.not.equal(0);
								if (i < state.grid.length - 1) expect(state.grid[i + 1][j].state).to.not.equal(0);
								if (j > 0) expect(state.grid[i][j - 1].state).to.not.equal(0);
								if (j < state.grid[0].length - 1) expect(state.grid[i][j + 1].state).to.not.equal(0);
							}
						}
					}
					expect(choices.length).to.be.above(0);
					const choice = choices[Math.floor(Math.random() * choices.length)];
					if (state.currentPlayer === clients[c].query.userID) pick(choice[0], choice[1]);
				});
				clients[c].once("minesweeperDraftEnd", function() {
					draftEnded += 1;
					this.removeListener("minesweeperDraftState");
					if (draftEnded == clients.length) done();
				});
			}
			// Pick the first card
			let currPlayer = clients.findIndex(c => c.query.userID == minesweeper.currentPlayer);

			clients[currPlayer].emit("minesweeperDraftPick", 0, 0, response => {
				if (response?.error) console.error(response?.error);
				expect(response?.error).to.be.undefined;
			});
		});
	};

	const startDraftWithError = (done, gridCount = 3, gridWidth = 10, gridHeight = 9, picksPerGrid = -1) => {
		if (picksPerGrid === -1) picksPerGrid = clients.length * 3 + 1;
		clients[ownerIdx].emit("startMinesweeperDraft", gridCount, gridWidth, gridHeight, picksPerGrid, r => {
			//console.error("Response:", r);
			expect(r?.error).to.exist;
			done();
		});
	};

	describe("Parameter validation", function() {
		it("Error if not using a cube", function(done) {
			startDraftWithError(done);
		});
		selectCube();
		it("Error on invalid gridCount", function(done) {
			startDraftWithError(done, 0);
		});
		it("Error on invalid gridWidth", function(done) {
			startDraftWithError(done, 3, 0);
		});
		it("Error on invalid gridHeight", function(done) {
			startDraftWithError(done, 3, 10, 0);
		});
		it("Error on invalid picksPerGrid", function(done) {
			startDraftWithError(done, 3, 10, 9, 0);
		});
		it("Error on invalid picksPerGrid", function(done) {
			startDraftWithError(done, 3, 10, 9, 10 * 9 + 1);
		});
	});

	describe("Default settings with built-in cube", function() {
		selectCube();
		startDraft();
		endDraft();
	});

	describe("Default settings with a disconnect", function() {
		selectCube();
		startDraft();

		it("Non-owner disconnects, owner receives updated user infos.", function(done) {
			let nonOwnerIdx = (ownerIdx + 1) % clients.length;
			clients[ownerIdx].once("userDisconnected", function() {
				waitForSocket(clients[nonOwnerIdx], done);
			});
			clients[nonOwnerIdx].disconnect();
		});

		it("Non-owner reconnects, draft restarts.", function(done) {
			let nonOwnerIdx = (ownerIdx + 1) % clients.length;
			clients[nonOwnerIdx].once("rejoinMinesweeperDraft", function(state) {
				expect(state).to.exist;
				done();
			});
			clients[nonOwnerIdx].connect();
		});

		endDraft();
	});

	describe("Parameters matrix", function() {
		selectCube();

		for (let [gridCount, gridWidth, gridHeight, picksPerGrid] of [
			[2, 10, 9, -1],
			[2, 10, 10, -1],
			[2, 9, 9, -1],
			[3, 12, 12, -1],
			[3, 8, 8, -1],
			[4, 10, 9, 4 * 8],
			[2, 10, 9, 4 * 2],
			[2, 10, 9, 4 * 12],
			[1, 10, 9, -1],
		]) {
			startDraft(gridCount, gridWidth, gridHeight, picksPerGrid);
			endDraft();
		}
	});
});

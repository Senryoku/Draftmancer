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

	const startDraft = () => {
		it("When session owner launch Minesweeper draft, everyone should receive a startMinesweeperDraft event", function(done) {
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
			const gridCount = 3;
			const gridWidth = 10;
			const gridHeight = 9;
			const picksPerGrid = clients.length * 3 + 1;
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
				const pick = state => {
					const cl = clients[c];
					let row,
						col,
						index = 0;
					do {
						row = Math.floor(index / state.grid[0].length);
						col = Math.floor(index % state.grid[0].length);
						++index;
					} while (index < state.grid.length * state.grid[0].length && state.grid[row][col].state != 1);
					cl.emit("minesweeperDraftPick", row, col, response => {
						expect(response?.error).to.be.undefined;
					});
				};
				clients[c].on("minesweeperDraftState", function(state) {
					if (state.currentPlayer === clients[c].query.userID) pick(state);
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
				expect(response?.error).to.be.undefined;
			});
		});
	};

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
				done();
			});
			clients[nonOwnerIdx].connect();
		});

		endDraft();
	});
});

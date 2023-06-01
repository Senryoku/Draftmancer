"use strict";
import { before, after, beforeEach, afterEach, describe, it } from "mocha";
import chai from "chai";
const expect = chai.expect;
import { Sessions } from "../src/Session.js";
import { Connections } from "../src/Connection.js";
import {
	makeClients,
	enableLogs,
	disableLogs,
	waitForSocket,
	waitForClientDisconnects,
	getUID,
	ackNoError,
} from "./src/common.js";
import { minesweeperApplyDiff, MinesweeperCellState, MinesweeperSyncData } from "../src/MinesweeperDraftTypes.js";
import { SocketAck } from "../src/Message.js";
import { simulateRestart } from "../src/Persistence.js";

describe("Minesweeper Draft", function () {
	let clients: ReturnType<typeof makeClients> = [];
	const sessionID = "sessionID";
	let ownerIdx: number = 0;

	beforeEach(function (done) {
		disableLogs();
		done();
	});

	afterEach(function (done) {
		enableLogs(this.currentTest?.state == "failed");
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

	it(`4 clients with different userID should be connected.`, function (done) {
		expect(Object.keys(Connections).length).to.equal(4);
		ownerIdx = clients.findIndex((c) => getUID(c) === Sessions[sessionID].owner);
		expect(ownerIdx).to.not.be.null;
		expect(ownerIdx).to.not.be.undefined;
		done();
	});

	let minesweeper: MinesweeperSyncData | null = null;

	const selectCube = () => {
		it("Emit Settings.", function (done) {
			const nonOwnerIdx = (ownerIdx + 1) % clients.length;
			clients[nonOwnerIdx].once("sessionOptions", function (options) {
				if (options.useCustomCardList) done();
			});
			clients[ownerIdx].emit("setUseCustomCardList", true);
			clients[ownerIdx].emit("loadLocalCustomCardList", "Arena Historic Cube #1", ackNoError);
		});
	};

	const startDraft = (gridCount = 4, gridWidth = 10, gridHeight = 9, picksPerGrid = -1, revealBorders = true) => {
		it(`Start Minesweeper draft (Parameters: gridCount = ${gridCount}, gridWidth = ${gridWidth}, gridHeight = ${gridHeight}, picksPerGrid = ${picksPerGrid}, revealBorders: ${revealBorders})`, function (done) {
			let connectedClients = 0;
			for (const c of clients) {
				c.once("startMinesweeperDraft", function (state) {
					connectedClients += 1;
					if (connectedClients == clients.length) {
						minesweeper = state;
						validateState(minesweeper);
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
				revealBorders,
				(response: SocketAck) => {
					expect(response?.error).to.be.undefined;
				}
			);
		});
	};

	const validateState = (state: MinesweeperSyncData) => {
		const choices = [];
		for (let i = 0; i < state.grid.length; ++i) {
			for (let j = 0; j < state.grid[0].length; ++j) {
				switch (state.grid[i][j].state) {
					case MinesweeperCellState.Hidden: {
						expect(state.grid[i][j].card).not.to.exist;
						break;
					}
					case MinesweeperCellState.Revealed: {
						choices.push([i, j]);
						expect(state.grid[i][j].card).to.exist;
						break;
					}
					case MinesweeperCellState.Picked: {
						expect(state.grid[i][j].card).to.exist;
						// If Picked, neightbors should be revealed.
						if (i > 0) expect(state.grid[i - 1][j].state).to.not.equal(MinesweeperCellState.Hidden);
						if (i < state.grid.length - 1)
							expect(state.grid[i + 1][j].state).to.not.equal(MinesweeperCellState.Hidden);
						if (j > 0) expect(state.grid[i][j - 1].state).to.not.equal(MinesweeperCellState.Hidden);
						if (j < state.grid[0].length - 1)
							expect(state.grid[i][j + 1].state).to.not.equal(MinesweeperCellState.Hidden);
						break;
					}
				}
			}
		}
		return choices;
	};

	const singlePick = () => {
		it("Single pick.", function (done) {
			let receivedUpdate = 0;
			for (let c = 0; c < clients.length; ++c) {
				clients[c].once("minesweeperDraftUpdateState", function (diff) {
					++receivedUpdate;
					if (receivedUpdate === clients.length) {
						expect(minesweeper).to.exist;
						if (!minesweeper) return;
						minesweeperApplyDiff(minesweeper, diff);
						done();
					}
				});
			}
			expect(minesweeper?.currentPlayer).to.not.be.undefined;
			const cl = clients.find((c) => getUID(c) === minesweeper?.currentPlayer);
			expect(cl).to.exist;
			const choices = validateState(minesweeper!);
			expect(choices.length).to.be.above(0);
			const choice = choices[Math.floor(Math.random() * choices.length)];
			cl!.emit("minesweeperDraftPick", choice[0], choice[1], ackNoError);
		});
	};

	const endDraft = () => {
		it("Every player randomly chooses a card and the draft should end.", function (done) {
			this.timeout(4000);

			let draftEnded = 0;
			let updatesReceived = 0;
			let newStateReceived = 0;

			const pick = (row: number, col: number) => {
				if (minesweeper?.currentPlayer === "") return;
				const cl = clients.find((c) => getUID(c) === minesweeper?.currentPlayer);
				if (!cl) return;
				cl.emit("minesweeperDraftPick", row, col, (response: SocketAck) => {
					if (response?.error) console.error(response?.error);
					expect(response?.error).to.be.undefined;
				});
			};

			for (let c = 0; c < clients.length; ++c) {
				clients[c].on("minesweeperDraftState", function (state) {
					++newStateReceived;
					if (newStateReceived === clients.length) {
						newStateReceived = 0;
						minesweeper = state;
						const choices = validateState(minesweeper);
						expect(choices.length).to.be.above(0);
						const choice = choices[Math.floor(Math.random() * choices.length)];
						pick(choice[0], choice[1]);
					}
				});
				clients[c].on("minesweeperDraftUpdateState", function (diff) {
					++updatesReceived;
					if (updatesReceived === clients.length) {
						updatesReceived = 0;
						expect(minesweeper).to.exist;
						if (!minesweeper) return;
						minesweeperApplyDiff(minesweeper, diff);
						const choices = validateState(minesweeper);
						expect(choices.length).to.be.above(0);
						const choice = choices[Math.floor(Math.random() * choices.length)];
						pick(choice[0], choice[1]);
					}
				});
				clients[c].once("minesweeperDraftEnd", function () {
					draftEnded += 1;
					clients[c].removeListener("minesweeperDraftState");
					clients[c].removeListener("minesweeperDraftUpdateState");
					if (draftEnded == clients.length) done();
				});
			}
			// Pick the first card
			const currPlayer = clients.findIndex((c) => getUID(c) === minesweeper!.currentPlayer);

			for (let i = 0; i < minesweeper!.grid.length; ++i)
				for (let j = 0; j < minesweeper!.grid[0].length; ++j)
					if (minesweeper!.grid[i][j].state === MinesweeperCellState.Revealed) {
						clients[currPlayer].emit("minesweeperDraftPick", i, j, ackNoError);
						return;
					}
		});
	};

	const startDraftWithError = (
		done: Mocha.Done,
		gridCount = 3,
		gridWidth = 10,
		gridHeight = 9,
		picksPerGrid = -1,
		revealBorders = true
	) => {
		if (picksPerGrid === -1) picksPerGrid = clients.length * 3 + 1;
		clients[ownerIdx].emit(
			"startMinesweeperDraft",
			gridCount,
			gridWidth,
			gridHeight,
			picksPerGrid,
			revealBorders,
			(r: SocketAck) => {
				//console.error("Response:", r);
				expect(r?.error).to.exist;
				done();
			}
		);
	};

	describe("Parameter validation", function () {
		it("Error if not using a cube", function (done) {
			startDraftWithError(done);
		});
		selectCube();
		it("Error on invalid gridCount", function (done) {
			startDraftWithError(done, 0);
		});
		it("Error on invalid gridWidth", function (done) {
			startDraftWithError(done, 3, 0);
		});
		it("Error on invalid gridHeight", function (done) {
			startDraftWithError(done, 3, 10, 0);
		});
		it("Error on invalid picksPerGrid", function (done) {
			startDraftWithError(done, 3, 10, 9, 0);
		});
		it("Error on invalid picksPerGrid", function (done) {
			startDraftWithError(done, 3, 10, 9, 10 * 9 + 1);
		});
	});

	describe("Default settings with built-in cube", function () {
		selectCube();
		startDraft();
		endDraft();
	});

	describe("Default settings with a disconnect", function () {
		selectCube();
		startDraft();

		it("Non-owner disconnects, owner receives updated user infos.", function (done) {
			const nonOwnerIdx = (ownerIdx + 1) % clients.length;
			clients[ownerIdx].once("userDisconnected", function () {
				waitForSocket(clients[nonOwnerIdx], done);
			});
			clients[nonOwnerIdx].disconnect();
		});

		it("Non-owner reconnects, draft restarts.", function (done) {
			const nonOwnerIdx = (ownerIdx + 1) % clients.length;
			clients[nonOwnerIdx].once("rejoinMinesweeperDraft", function (state) {
				expect(state).to.exist;
				done();
			});
			clients[nonOwnerIdx].connect();
		});

		endDraft();
	});

	describe("Default settings, all disconnect", function () {
		selectCube();
		startDraft();

		singlePick();

		it("Non-owner disconnects, owner receives updated user infos.", function (done) {
			const nonOwnerIdx = (ownerIdx + 1) % clients.length;
			clients[ownerIdx].once("userDisconnected", function () {
				waitForSocket(clients[nonOwnerIdx], done);
			});
			clients[nonOwnerIdx].disconnect();
		});

		it("Non-owner reconnects, draft restarts.", function (done) {
			const nonOwnerIdx = (ownerIdx + 1) % clients.length;
			clients[nonOwnerIdx].once("rejoinMinesweeperDraft", function (state) {
				expect(state).to.exist;
				done();
			});
			clients[nonOwnerIdx].connect();
		});

		singlePick();

		it("Non-owners disconnects, owner receives updated user infos.", function (done) {
			let disconnected = 0;
			clients[ownerIdx].on("userDisconnected", function (data) {
				++disconnected;
				if (disconnected === clients.length - 1) {
					expect(Object.keys(data.disconnectedUsers).length).to.equal(clients.length - 1);
					clients[ownerIdx].off("userDisconnected");
					done();
				}
			});
			for (let c = 0; c < clients.length; ++c) if (c !== ownerIdx) clients[c].disconnect();
		});

		it("Owner disconnects", function (done) {
			clients[ownerIdx].disconnect();
			waitForSocket(clients[ownerIdx], done);
		});

		it("Owner reconnects.", function (done) {
			clients[ownerIdx].once("rejoinMinesweeperDraft", function (state) {
				expect(state).to.exist;
				done();
			});
			clients[ownerIdx].connect();
		});

		it("Non-owner reconnects, draft restarts.", function (done) {
			let reconnected = 0;
			for (let c = 0; c < clients.length; ++c)
				if (c !== ownerIdx) {
					clients[c].on("rejoinMinesweeperDraft", function (state) {
						++reconnected;
						expect(state).to.exist;
						if (reconnected === clients.length - 1) {
							for (const cl of clients) cl.off("rejoinMinesweeperDraft");
							done();
						}
					});
					clients[c].connect();
				}
		});

		singlePick();

		endDraft();
	});

	describe("Default settings, server restart", function () {
		selectCube();
		startDraft();

		singlePick();

		it("Simulate server restart.", async function () {
			await simulateRestart();
		});

		it("Owner reconnects.", function (done) {
			clients[ownerIdx].once("rejoinMinesweeperDraft", function (state) {
				expect(state).to.exist;
				done();
			});
			clients[ownerIdx].connect();
		});

		it("Non-owner reconnects, draft restarts.", function (done) {
			let reconnected = 0;
			for (let c = 0; c < clients.length; ++c)
				if (c !== ownerIdx) {
					clients[c].on("rejoinMinesweeperDraft", function (state) {
						++reconnected;
						expect(state).to.exist;
						if (reconnected === clients.length - 1) {
							for (const cl of clients) cl.off("rejoinMinesweeperDraft");
							done();
						}
					});
					clients[c].connect();
				}
		});

		endDraft();
	});

	describe("Parameters matrix", function () {
		selectCube();

		for (const [gridCount, gridWidth, gridHeight, picksPerGrid] of [
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

		startDraft(3, 10, 9, -1, false);
		endDraft();
		startDraft(3, 9, 10, -1, false);
		endDraft();
		startDraft(3, 9, 9, -1, false);
		endDraft();
		startDraft(3, 10, 10, -1, false);
		endDraft();
	});
});

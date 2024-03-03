"use strict";
import { before, after, beforeEach, afterEach, describe, it } from "mocha";
import { expect } from "chai";
import { Sessions } from "../src/Session.js";
import { Connections } from "../src/Connection.js";
import {
	makeClients,
	enableLogs,
	disableLogs,
	waitForSocket,
	waitForClientDisconnects,
	ackNoError,
	getUID,
} from "./src/common.js";
import { WinchesterDraftSyncData } from "../src/WinchesterDraft.js";
import { random } from "../src/utils.js";

describe("Winchester Draft", function () {
	let clients: ReturnType<typeof makeClients> = [];
	const sessionID = "sessionID";
	let ownerIdx: number;
	let nonOwnerIdx: number;
	const states: Record<string, WinchesterDraftSyncData> = {};

	const getCurrentPlayer = () => {
		const currentPlayerID = states[getUID(clients[ownerIdx])].currentPlayer;
		const currentPlayerIdx = clients.findIndex((c) => getUID(c) === currentPlayerID);
		return clients[currentPlayerIdx];
	};

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

	it("2 clients with different userID should be connected.", function (done) {
		expect(Object.keys(Connections).length).to.equal(2);
		done();
	});

	it("When session owner launch Winchester draft, everyone should receive a startWinchesterDraft event", function (done) {
		ownerIdx = clients.findIndex((c) => getUID(c) === Sessions[sessionID].owner);
		nonOwnerIdx = 1 - ownerIdx;
		let receivedStates = 0;
		for (const c of clients) {
			c.once("startWinchesterDraft", function (state) {
				receivedStates += 1;
				states[getUID(c)] = state;
				expect(state.round).to.equal(0);
				expect(state.piles[0]).to.have.lengthOf(1);
				expect(state.piles[1]).to.have.lengthOf(1);
				expect(state.piles[2]).to.have.lengthOf(1);
				expect(state.piles[3]).to.have.lengthOf(1);
				if (receivedStates === clients.length) done();
			});
		}
		clients[ownerIdx].emit("startWinchesterDraft", 6, true, ackNoError);
	});

	function randomPick(socket: ReturnType<typeof makeClients>[0], state: WinchesterDraftSyncData) {
		let randomIdx = random.integer(0, state.piles.length - 1);
		if (state.piles[randomIdx].length === 0) randomIdx = state.piles.findIndex((pile) => pile.length > 0);
		socket.emit("winchesterDraftPick", randomIdx, ackNoError);
	}

	it("Take first column.", function (done) {
		let nextRound = 0;
		for (let c = 0; c < clients.length; ++c) {
			clients[c].once("winchesterDraftSync", function (state) {
				++nextRound;
				expect(state.round).to.equal(1);
				expect(state.piles[0]).to.have.lengthOf(1);
				expect(state.piles[1]).to.have.lengthOf(2);
				expect(state.piles[2]).to.have.lengthOf(2);
				expect(state.piles[3]).to.have.lengthOf(2);
				states[getUID(clients[c])] = state;
				if (nextRound === clients.length) done();
			});
		}
		getCurrentPlayer().emit("winchesterDraftPick", 0, ackNoError);
	});

	it("Take second column.", function (done) {
		let nextRound = 0;
		for (let c = 0; c < clients.length; ++c) {
			clients[c].once("winchesterDraftSync", function (state) {
				++nextRound;
				expect(state.round).to.equal(2);
				expect(state.piles[0]).to.have.lengthOf(2);
				expect(state.piles[1]).to.have.lengthOf(1);
				expect(state.piles[2]).to.have.lengthOf(3);
				expect(state.piles[3]).to.have.lengthOf(3);
				states[getUID(clients[c])] = state;
				if (nextRound === clients.length) done();
			});
		}
		getCurrentPlayer().emit("winchesterDraftPick", 1, ackNoError);
	});

	it("Take third column.", function (done) {
		let nextRound = 0;
		for (let c = 0; c < clients.length; ++c) {
			clients[c].once("winchesterDraftSync", function (state) {
				++nextRound;
				expect(state.round).to.equal(3);
				expect(state.piles[0]).to.have.lengthOf(3);
				expect(state.piles[1]).to.have.lengthOf(2);
				expect(state.piles[2]).to.have.lengthOf(1);
				expect(state.piles[3]).to.have.lengthOf(4);
				states[getUID(clients[c])] = state;
				if (nextRound === clients.length) done();
			});
		}
		getCurrentPlayer().emit("winchesterDraftPick", 2, ackNoError);
	});

	it("Take fourth column.", function (done) {
		let nextRound = 0;
		for (let c = 0; c < clients.length; ++c) {
			clients[c].once("winchesterDraftSync", function (state) {
				++nextRound;
				expect(state.round).to.equal(4);
				expect(state.piles[0]).to.have.lengthOf(4);
				expect(state.piles[1]).to.have.lengthOf(3);
				expect(state.piles[2]).to.have.lengthOf(2);
				expect(state.piles[3]).to.have.lengthOf(1);
				states[getUID(clients[c])] = state;
				if (nextRound === clients.length) done();
			});
		}
		getCurrentPlayer().emit("winchesterDraftPick", 3, ackNoError);
	});

	it("Non-owner disconnects, owner receives updated user infos.", function (done) {
		clients[ownerIdx].once("userDisconnected", function () {
			waitForSocket(clients[nonOwnerIdx], done);
		});
		clients[nonOwnerIdx].disconnect();
	});

	it("Non-owner reconnects, draft restarts.", function (done) {
		clients[nonOwnerIdx].once("rejoinWinchesterDraft", function () {
			done();
		});
		clients[nonOwnerIdx].connect();
	});

	it("Random pick.", function (done) {
		let nextRound = 0;
		for (let c = 0; c < clients.length; ++c) {
			clients[c].once("winchesterDraftSync", function (state) {
				++nextRound;
				states[getUID(clients[c])] = state;
				if (nextRound == clients.length) done();
			});
		}
		randomPick(getCurrentPlayer(), states[getUID(getCurrentPlayer())]);
	});

	it("Owner disconnects, owner receives updated user infos.", function (done) {
		clients[nonOwnerIdx].once("userDisconnected", function () {
			waitForSocket(clients[ownerIdx], done);
		});
		clients[ownerIdx].disconnect();
	});

	it("Owner reconnects, draft restarts.", function (done) {
		clients[ownerIdx].once("rejoinWinchesterDraft", function () {
			ownerIdx = clients.findIndex((c) => getUID(c) === Sessions[sessionID].owner);
			nonOwnerIdx = 1 - ownerIdx;
			done();
		});
		clients[ownerIdx].connect();
	});

	it("Random pick.", function (done) {
		let nextRound = 0;
		for (let c = 0; c < clients.length; ++c) {
			clients[c].once("winchesterDraftSync", function () {
				++nextRound;
				if (nextRound == clients.length) done();
			});
		}
		randomPick(getCurrentPlayer(), states[getUID(getCurrentPlayer())]);
	});

	it("Both players disconnects.", function (done) {
		clients[nonOwnerIdx].disconnect();
		clients[ownerIdx].disconnect();
		done();
	});

	it("Owner reconnects.", function (done) {
		clients[ownerIdx].once("rejoinWinchesterDraft", function (data) {
			expect(data.pickedCards).to.exist;
			expect(data.state).to.exist;
			states[getUID(clients[ownerIdx])] = data.state;
			done();
		});
		clients[ownerIdx].connect();
	});

	it("Non-owner reconnects, draft restarts.", function (done) {
		clients[nonOwnerIdx].once("rejoinWinchesterDraft", function (data) {
			expect(data.pickedCards).to.exist;
			expect(data.state).to.exist;
			states[getUID(clients[nonOwnerIdx])] = data.state;
			done();
		});
		clients[nonOwnerIdx].connect();
	});

	it("Every player takes the first pile possible and the draft should end.", function (done) {
		this.timeout(2000);
		let draftEnded = 0;
		for (let c = 0; c < clients.length; ++c) {
			clients[c].on("winchesterDraftSync", function (state) {
				states[getUID(clients[c])] = state;
				if (state.piles.some((p) => p.length > 0) && state.currentPlayer === getUID(clients[c]))
					randomPick(clients[c], state);
			});
			clients[c].once("winchesterDraftEnd", function () {
				draftEnded += 1;
				clients[c].removeListener("winchesterDraftSync");
				if (draftEnded == clients.length) done();
			});
		}
		randomPick(getCurrentPlayer(), states[getUID(getCurrentPlayer())]);
	});
});

describe("Winchester Draft - 4 Players", function () {
	let clients: ReturnType<typeof makeClients> = [];
	const sessionID = "sessionID";
	let ownerIdx: number;
	const states: Record<string, WinchesterDraftSyncData> = {};

	const getCurrentPlayer = () => {
		const currentPlayerID = states[getUID(clients[ownerIdx])].currentPlayer;
		const currentPlayerIdx = clients.findIndex((c) => getUID(c) === currentPlayerID);
		return clients[currentPlayerIdx];
	};

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

	it("4 clients with different userID should be connected.", function (done) {
		expect(Object.keys(Connections).length).to.equal(4);
		done();
	});

	it("When session owner launch Winchester draft, everyone should receive a startWinchesterDraft event", function (done) {
		ownerIdx = clients.findIndex((c) => getUID(c) === Sessions[sessionID].owner);
		let receivedStates = 0;
		for (const c of clients) {
			c.once("startWinchesterDraft", function (state) {
				receivedStates += 1;
				states[getUID(c)] = state;
				expect(state.round).to.equal(0);
				expect(state.piles[0]).to.have.lengthOf(1);
				expect(state.piles[1]).to.have.lengthOf(1);
				expect(state.piles[2]).to.have.lengthOf(1);
				expect(state.piles[3]).to.have.lengthOf(1);
				if (receivedStates === clients.length) done();
			});
		}
		clients[ownerIdx].emit("startWinchesterDraft", 6, true, ackNoError);
	});

	function randomPick(socket: ReturnType<typeof makeClients>[0], state: WinchesterDraftSyncData) {
		let randomIdx = random.integer(0, state.piles.length - 1);
		if (state.piles[randomIdx].length === 0) randomIdx = state.piles.findIndex((pile) => pile.length > 0);
		socket.emit("winchesterDraftPick", randomIdx, ackNoError);
	}

	it("Take first column.", function (done) {
		let nextRound = 0;
		for (let c = 0; c < clients.length; ++c) {
			clients[c].once("winchesterDraftSync", function (state) {
				++nextRound;
				expect(state.round).to.equal(1);
				expect(state.piles[0]).to.have.lengthOf(1);
				expect(state.piles[1]).to.have.lengthOf(2);
				expect(state.piles[2]).to.have.lengthOf(2);
				expect(state.piles[3]).to.have.lengthOf(2);
				states[getUID(clients[c])] = state;
				if (nextRound === clients.length) done();
			});
		}
		getCurrentPlayer().emit("winchesterDraftPick", 0, ackNoError);
	});

	it("Take second column.", function (done) {
		let nextRound = 0;
		for (let c = 0; c < clients.length; ++c) {
			clients[c].once("winchesterDraftSync", function (state) {
				++nextRound;
				expect(state.round).to.equal(2);
				expect(state.piles[0]).to.have.lengthOf(2);
				expect(state.piles[1]).to.have.lengthOf(1);
				expect(state.piles[2]).to.have.lengthOf(3);
				expect(state.piles[3]).to.have.lengthOf(3);
				states[getUID(clients[c])] = state;
				if (nextRound === clients.length) done();
			});
		}
		getCurrentPlayer().emit("winchesterDraftPick", 1, ackNoError);
	});

	it("Take third column.", function (done) {
		let nextRound = 0;
		for (let c = 0; c < clients.length; ++c) {
			clients[c].once("winchesterDraftSync", function (state) {
				++nextRound;
				expect(state.round).to.equal(3);
				expect(state.piles[0]).to.have.lengthOf(3);
				expect(state.piles[1]).to.have.lengthOf(2);
				expect(state.piles[2]).to.have.lengthOf(1);
				expect(state.piles[3]).to.have.lengthOf(4);
				states[getUID(clients[c])] = state;
				if (nextRound === clients.length) done();
			});
		}
		getCurrentPlayer().emit("winchesterDraftPick", 2, ackNoError);
	});

	it("Take fourth column.", function (done) {
		let nextRound = 0;
		for (let c = 0; c < clients.length; ++c) {
			clients[c].once("winchesterDraftSync", function (state) {
				++nextRound;
				expect(state.round).to.equal(4);
				expect(state.piles[0]).to.have.lengthOf(4);
				expect(state.piles[1]).to.have.lengthOf(3);
				expect(state.piles[2]).to.have.lengthOf(2);
				expect(state.piles[3]).to.have.lengthOf(1);
				states[getUID(clients[c])] = state;
				if (nextRound === clients.length) done();
			});
		}
		getCurrentPlayer().emit("winchesterDraftPick", 3, ackNoError);
	});

	it("Non-owner disconnects, owner receives updated user infos.", function (done) {
		clients[ownerIdx].once("userDisconnected", function () {
			waitForSocket(clients[(ownerIdx + 1) % clients.length], done);
		});
		clients[(ownerIdx + 1) % clients.length].disconnect();
	});

	it("Non-owner reconnects, draft restarts.", function (done) {
		clients[(ownerIdx + 1) % clients.length].once("rejoinWinchesterDraft", function () {
			done();
		});
		clients[(ownerIdx + 1) % clients.length].connect();
	});

	it("Random pick.", function (done) {
		let nextRound = 0;
		for (let c = 0; c < clients.length; ++c) {
			clients[c].once("winchesterDraftSync", function (state) {
				++nextRound;
				states[getUID(clients[c])] = state;
				if (nextRound == clients.length) done();
			});
		}
		randomPick(getCurrentPlayer(), states[getUID(getCurrentPlayer())]);
	});

	it("Owner disconnects, owner receives updated user infos.", function (done) {
		clients[(ownerIdx + 1) % clients.length].once("userDisconnected", function () {
			waitForSocket(clients[ownerIdx], done);
		});
		clients[ownerIdx].disconnect();
	});

	it("Owner reconnects, draft restarts.", function (done) {
		clients[ownerIdx].once("rejoinWinchesterDraft", function () {
			ownerIdx = clients.findIndex((c) => getUID(c) === Sessions[sessionID].owner);
			done();
		});
		clients[ownerIdx].connect();
	});

	it("Random pick.", function (done) {
		let nextRound = 0;
		for (let c = 0; c < clients.length; ++c) {
			clients[c].once("winchesterDraftSync", function () {
				++nextRound;
				if (nextRound == clients.length) done();
			});
		}
		randomPick(getCurrentPlayer(), states[getUID(getCurrentPlayer())]);
	});

	it("All players disconnects.", function (done) {
		clients.forEach((c) => c.disconnect());
		done();
	});

	it("Owner reconnects.", function (done) {
		clients[ownerIdx].once("rejoinWinchesterDraft", function (data) {
			expect(data.pickedCards).to.exist;
			expect(data.state).to.exist;
			states[getUID(clients[ownerIdx])] = data.state;
			done();
		});
		clients[ownerIdx].connect();
	});

	it("Non-owner reconnects, draft restarts.", function (done) {
		let reconnected = 0;
		for (let c = 0; c < clients.length; ++c)
			if (c !== ownerIdx)
				clients[c].once("rejoinWinchesterDraft", function (data) {
					expect(data.pickedCards).to.exist;
					expect(data.state).to.exist;
					states[getUID(clients[c])] = data.state;
					++reconnected;
					if (reconnected === clients.length - 1) done();
				});
		clients.forEach((c) => c.connect());
	});

	it("Every player takes the first pile possible and the draft should end.", function (done) {
		this.timeout(2000);
		let draftEnded = 0;
		for (let c = 0; c < clients.length; ++c) {
			clients[c].on("winchesterDraftSync", function (state) {
				states[getUID(clients[c])] = state;
				if (state.piles.some((p) => p.length > 0) && state.currentPlayer === getUID(clients[c]))
					randomPick(clients[c], state);
			});
			clients[c].once("winchesterDraftEnd", function () {
				draftEnded += 1;
				clients[c].removeListener("winchesterDraftSync");
				if (draftEnded == clients.length) done();
			});
		}
		randomPick(getCurrentPlayer(), states[getUID(getCurrentPlayer())]);
	});
});

import { v1 as uuidv1 } from "uuid";
import { beforeEach, afterEach, describe, it } from "mocha";
import { expect } from "chai";
import { Connections } from "../src/Connection.js";
import { makeClients, enableLogs, disableLogs, waitForClientDisconnects, ackNoError } from "./src/common.js";
import { Socket } from "socket.io-client";
import { ClientToServerEvents, ServerToClientEvents } from "../src/SocketType.js";
import { DraftState } from "../src/DraftState.js";

describe("Supreme Draft", function () {
	let client: Socket<ServerToClientEvents, ClientToServerEvents>;
	let state: ReturnType<DraftState["syncData"]> = {
		booster: [],
		boosterCount: 0,
		boosterNumber: 0,
		pickNumber: 0,
		picksThisRound: 0,
		burnsThisRound: 0,
		skipPick: false,
	};

	beforeEach(function (done) {
		disableLogs();
		done();
	});

	afterEach(function (done) {
		enableLogs(this.currentTest!.state === "failed");
		done();
	});

	it("Client connects.", function (done) {
		const sessionID = uuidv1();
		client = makeClients(
			[
				{
					userID: "id1",
					sessionID: sessionID,
					userName: "Client1",
				},
			],
			() => {
				expect(Connections).to.have.property("id1");
				expect(Object.keys(Connections).length).to.equal(1);
				done();
			}
		)[0];
	});

	it("Start Draft", function (done) {
		client.once("draftState", (s) => {
			expect(s.booster).to.exist;
			state = s;
			done();
		});

		client.emit("startSupremeDraft", 18, 2, ackNoError);
	});

	it("Pick until draft ends.", (done) => {
		client.once("endDraft", function () {
			client.removeListener("draftState");
			done();
		});
		client.on("draftState", function (s) {
			if (s.boosterNumber !== state.boosterNumber && s.boosterCount > 0) {
				state = s;
				client.emit("pickCard", { pickedCards: [0, 1], burnedCards: [] }, ackNoError);
			}
		});
		client.emit("pickCard", { pickedCards: [0, 1], burnedCards: [] }, ackNoError);
	});

	it("Start Draft and immediatly disconnects.", function (done) {
		client.once("draftState", (s) => {
			expect(s.booster).to.exist;
			state = s;
			client.disconnect();
			done();
		});

		client.emit("startSupremeDraft", 18, 2, ackNoError);
	});

	it("Reconnects, draft restarts.", function (done) {
		client.once("resumeOnReconnection", () => done());
		client.connect();
	});

	it("Pick until draft ends.", (done) => {
		client.once("endDraft", () => {
			client.removeListener("draftState");
			done();
		});
		client.on("draftState", (s) => {
			if (s.boosterNumber !== state.boosterNumber && s.boosterCount > 0) {
				state = s;
				client.emit("pickCard", { pickedCards: [0, 1], burnedCards: [] }, ackNoError);
			}
		});
		client.emit("pickCard", { pickedCards: [0, 1], burnedCards: [] }, ackNoError);
	});

	it("Client should disconnect.", function (done) {
		client.disconnect();
		waitForClientDisconnects(() => done());
	});
});

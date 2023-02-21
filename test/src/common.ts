import chai from "chai";
import fs from "fs";
import io, { Socket } from "socket.io-client";
const expect = chai.expect;
// eslint-disable-next-line no-unused-vars
/// <amd-dependency path="mega" />
import "../../src/server.js"; // Launch Server
import { Connections } from "../../src/Connection.js";
import { ClientToServerEvents, ServerToClientEvents } from "../../src/SocketType.js";
import { SocketAck } from "../../src/Message.js";

export const Cubes: { [name: string]: string } = {
	CustomSlotsTestFile: fs.readFileSync(`./test/data/CustomSheets.txt`, "utf8"),
	CustomLayoutsTestFile: fs.readFileSync(`./test/data/CustomLayouts.txt`, "utf8"),
	CustomLayouts_WrongPackSizeTestFile: fs.readFileSync(`./test/data/CustomLayouts_WrongPackSize.txt`, "utf8"),
	CustomLayouts_MixedLayoutDefinitionsTestFile: fs.readFileSync(
		`./test/data/CustomLayouts_MixedLayoutDefinitions.txt`,
		"utf8"
	),
	CustomCards_NoLayout: fs.readFileSync(`./test/data/CustomCards_NoLayout.txt`, "utf8"),
	CustomCards_SlotSize: fs.readFileSync(`./test/data/CustomCards_SlotSize.txt`, "utf8"),
	CustomCards_MultipleDefaultSlots_Invalid: fs.readFileSync(
		`./test/data/CustomCards_MultipleDefaultSlots_Invalid.txt`,
		"utf8"
	),
	WithReplacement: fs.readFileSync(`./test/data/ReplacementTest.txt`, "utf8"),
	WithReplacementLayouts: fs.readFileSync(`./test/data/ReplacementTest_Layouts.txt`, "utf8"),
};

const NODE_PORT = process.env.PORT ?? 3000;

const ioOptions = {
	transports: ["websocket"],
	forceNew: true,
	reconnection: false,
};

let UniqueUserID = 0;

export function connectClient(query: any) {
	if (!query.userID) query.userID = `UserID${++UniqueUserID}`;

	let r = io(`http://localhost:${NODE_PORT}`, Object.assign({ query: query }, ioOptions)) as Socket<
		ServerToClientEvents,
		ClientToServerEvents
	>;
	r.on("alreadyConnected", (newID) => {
		(r as any).query.userID = newID;
	});
	r.on("stillAlive", function (ack) {
		if (ack) ack();
	});
	(r as any).query = query; // Hackish: This property disappeared between socket.io v2 and v3
	return r;
}

let outputbuffer: string;
const baseConsogleLog = console.log;
const baseConsogleDebug = console.debug;
const baseConsogleWarn = console.warn;
export const logReplacer = function () {
	for (var i = 0; i < arguments.length; i++) outputbuffer += arguments[i];
	outputbuffer += "\n";
};
export function disableLogs() {
	outputbuffer = "";
	console.log = console.debug = console.warn = logReplacer;
}
export function enableLogs(print: boolean) {
	console.log = baseConsogleLog;
	console.debug = baseConsogleDebug;
	console.warn = baseConsogleWarn;
	if (print && outputbuffer != "") {
		console.log("--- Delayed Output ---------------------------------------------------------");
		console.log(outputbuffer);
		console.log("----------------------------------------------------- Delayed Output End ---");
	}
}

export function makeClients(queries: any[], done: Mocha.Done) {
	let sockets = [];
	disableLogs();
	expect(Object.keys(Connections).length).to.equal(0);
	for (let query of queries) {
		sockets.push(connectClient(query));
	}

	// Wait for all clients to be connected
	let connectedClientCount = 0;
	for (let s of sockets) {
		s.once("connect", function () {
			connectedClientCount += 1;
			if (connectedClientCount == sockets.length) {
				enableLogs(false);
				expect(Object.keys(Connections).length).to.equal(sockets.length);
				done();
			}
		});
	}
	return sockets;
}

export const waitForSocket = (socket: Socket, done: Mocha.Done) => {
	if (socket.io.engine.readyState === "closed") done();
	else
		setTimeout(() => {
			waitForSocket(socket, done);
		}, 1);
};

// Wait for the sockets to be disconnected, I haven't found another way...
export const waitForClientDisconnects = (done: Mocha.Done) => {
	if (Object.keys(Connections).length === 0) {
		enableLogs(false);
		done();
	} else {
		setTimeout(() => {
			waitForClientDisconnects(done);
		}, 1);
	}
};

export function ackNoError(r: SocketAck) {
	if (r.code !== 0) console.error(r);
	expect(r.code).to.equal(0);
	expect(r.error).not.to.exist;
}

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

export const ValidCubes: { [name: string]: string } = {
	CustomSlotsTestFile: fs.readFileSync(`./test/data/CustomSheets.txt`, "utf8"),
	CustomLayoutsTestFile: fs.readFileSync(`./test/data/CustomLayouts.txt`, "utf8"),
	CustomCards_NoLayout: fs.readFileSync(`./test/data/CustomCards_NoLayout.txt`, "utf8"),
	CustomCards_SlotSize: fs.readFileSync(`./test/data/CustomCards_SlotSize.txt`, "utf8"),
	WithReplacement: fs.readFileSync(`./test/data/ReplacementTest.txt`, "utf8"),
	WithReplacementLayouts: fs.readFileSync(`./test/data/ReplacementTest_Layouts.txt`, "utf8"),
	Real_CustomCards: fs.readFileSync(`./test/data/SWR_MTGA_Draft_Experiment_2.txt`, "utf8"),
	Real_CustomCards_2: fs.readFileSync(`./test/data/Over_the_Horizon.txt`, "utf8"),
	Real_CustomCards_3: fs.readFileSync(`./test/data/AGC_MTGA.txt`, "utf8"),
	Real_CustomCards_4: fs.readFileSync(`./test/data/mtga_eggs_export_1_3_1_upload.txt`, "utf8"),
};

export const InvalidCubes: { [name: string]: string } = {
	CustomLayouts_MixedLayoutDefinitionsTestFile: fs.readFileSync(
		`./test/data/CustomLayouts_MixedLayoutDefinitions.txt`,
		"utf8"
	),
	CustomLayouts_WrongPackSizeTestFile: fs.readFileSync(`./test/data/CustomLayouts_WrongPackSize.txt`, "utf8"),
	CustomCards_MultipleDefaultSlots_Invalid: fs.readFileSync(
		`./test/data/CustomCards_MultipleDefaultSlots_Invalid.txt`,
		"utf8"
	),
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

let outputbuffer: string[];
const baseConsogleLog = console.log;
const baseConsogleDebug = console.debug;
const baseConsogleWarn = console.warn;
export const logReplacer = function () {
	let line = "";
	for (var i = 0; i < arguments.length; i++) line += JSON.stringify(arguments[i]);
	outputbuffer.push(line);
};
export function disableLogs() {
	outputbuffer = [];
	console.log = console.debug = console.warn = logReplacer;
}
export function enableLogs(print: boolean) {
	console.log = baseConsogleLog;
	console.debug = baseConsogleDebug;
	console.warn = baseConsogleWarn;
	if (print && outputbuffer.length > 0) {
		console.log("--- Delayed Output ---------------------------------------------------------");
		console.log(outputbuffer.slice(Math.max(0, outputbuffer.length - 20), outputbuffer.length).join("\n"));
		console.log("----------------------------------------------------- Delayed Output End ---");
		outputbuffer = [];
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

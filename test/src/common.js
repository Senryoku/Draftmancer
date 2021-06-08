import chai from "chai";
import io from "socket.io-client";
const expect = chai.expect;
import server from "../../dist/server.js"; // Launch Server
import { Connections } from "../../dist/Connection.js";

const NODE_PORT = process.env.PORT | 3000;

const ioOptions = {
	transports: ["websocket"],
	forceNew: true,
	reconnection: false,
};

let UniqueUserID = 0;

export function connectClient(query) {
	if (!query.userID) query.userID = `UserID${++UniqueUserID}`;

	let r = io(`http://localhost:${NODE_PORT}`, Object.assign({ query: query }, ioOptions));
	r.on("alreadyConnected", function(newID) {
		this.query.userID = newID;
	});
	r.on("stillAlive", function(ack) {
		if (ack) ack();
	});
	return r;
}

let outputbuffer;
const baseConsogleLog = console.log;
const baseConsogleDebug = console.debug;
const baseConsogleWarn = console.warn;
export const logReplacer = function() {
	for (var i = 0; i < arguments.length; i++) outputbuffer += arguments[i];
	outputbuffer += "\n";
};
export function disableLogs() {
	outputbuffer = "";
	console.log = console.debug = console.warn = logReplacer;
}
export function enableLogs(print) {
	console.log = baseConsogleLog;
	console.debug = baseConsogleDebug;
	console.warn = baseConsogleWarn;
	if (print && outputbuffer != "") {
		console.log("--- Delayed Output ---------------------------------------------------------");
		console.log(outputbuffer);
		console.log("----------------------------------------------------- Delayed Output End ---");
	}
}

export function makeClients(queries, done) {
	let sockets = [];
	disableLogs();
	expect(Object.keys(Connections).length).to.equal(0);
	for (let query of queries) {
		sockets.push(connectClient(query));
	}

	// Wait for all clients to be connected
	let connectedClientCount = 0;
	for (let s of sockets) {
		s.once("connect", function() {
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

export const waitForSocket = (socket, done) => {
	if (socket.io.engine.readyState === "closed") done();
	else
		setTimeout(() => {
			waitForSocket(socket, done);
		}, 1);
};

// Wait for the sockets to be disconnected, I haven't found another way...
export const waitForClientDisconnects = done => {
	if (Object.keys(Connections).length === 0) {
		enableLogs(false);
		done();
	} else {
		setTimeout(() => {
			waitForClientDisconnects(done);
		}, 1);
	}
};

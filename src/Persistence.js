"use strict";

if (process.env.NODE_ENV !== "production") {
	require("dotenv").config();
}
const AWS = require("aws-sdk");

const ConnectionModule = require("../Connection");
const Connections = ConnectionModule.Connections;
const SessionModule = require("../Session");
const Sessions = SessionModule.Sessions;
const Bot = require("./Bot");

AWS.config.update({
	region: process.env.AWS_REGION,
	endpoint: process.env.AWS_ENDPOINT,
});

const docClient = new AWS.DynamoDB.DocumentClient();

function filterEmptyStr(obj) {
	if (obj === "") return "(EmptyString)";
	return obj;
}

function restoreEmptyStr(obj) {
	if (obj === "(EmptyString)") return "";
	return obj;
}

// Connections and Session are obsolete after two days
function isObsolete(item) {
	return Math.floor((Date.now() - item.timestamp) / 1000 / 60 / 60 / 24) > 2;
}

async function requestSavedConnections() {
	var connectionsRequestParams = {
		TableName: "mtga-draft-connections",
		ReturnConsumedCapacity: "TOTAL",
	};
	let InactiveConnections = {};

	try {
		const data = await docClient.scan(connectionsRequestParams).promise();

		for (let c of data.Items) {
			InactiveConnections[restoreEmptyStr(c.userID)] = new ConnectionModule.Connection(
				null,
				c.data.userID,
				restoreEmptyStr(c.data.userName)
			);
			for (let prop of Object.getOwnPropertyNames(c.data)) {
				InactiveConnections[restoreEmptyStr(c.userID)][prop] = restoreEmptyStr(c.data[prop]);
			}

			if (isObsolete(c))
				docClient.delete({ TableName: "mtga-draft-connections", Key: { userID: c.userID } }, (err, data) => {
					if (err) console.log(err);
					else console.log("Deleted obsolete connection ", c.userID);
				});
		}
		console.log(`Restored ${data.Count} saved connections.`, data.ConsumedCapacity);
	} catch (err) {
		console.log("error: ", err);
	}

	return InactiveConnections;
}

async function requestSavedSessions() {
	var connections = {
		TableName: "mtga-draft-sessions",
		ReturnConsumedCapacity: "TOTAL",
	};

	let InactiveSessions = {};
	try {
		const data = await docClient.scan(connections).promise();

		for (let s of data.Items) {
			const fixedID = restoreEmptyStr(s.id);
			InactiveSessions[fixedID] = new SessionModule.Session(fixedID, null);
			for (let prop of Object.getOwnPropertyNames(s.data).filter((p) => !["botsInstances"].includes(p))) {
				InactiveSessions[fixedID][prop] = restoreEmptyStr(s.data[prop]);
			}

			if (s.data.botsInstances) {
				InactiveSessions[fixedID].botsInstances = [];
				for (let bot of s.data.botsInstances) {
					const newBot = new Bot(bot.name, bot.id);
					for (let prop of Object.getOwnPropertyNames(bot)) {
						newBot[prop] = bot[prop];
					}
					InactiveSessions[fixedID].botsInstances.push(newBot);
				}
			}

			if (s.data.winstonDraftState) {
				InactiveSessions[fixedID].winstonDraftState = new SessionModule.WinstonDraftState();
				for (let prop of Object.getOwnPropertyNames(s.data.winstonDraftState)) {
					if (!(s.data.winstonDraftState[prop] instanceof Function))
						InactiveSessions[fixedID].winstonDraftState[prop] = s.data.winstonDraftState[prop];
				}
				console.log(InactiveSessions[fixedID].winstonDraftState);
			}

			if (s.data.bracket) s.data.bracket.players = s.data.bracket.players.map((n) => restoreEmptyStr(n));

			if (isObsolete(s))
				docClient.delete({ TableName: "mtga-draft-sessions", Key: { id: s.id } }, (err, data) => {
					if (err) console.log(err);
					else console.log("Deleted obsolete session ", s.id);
				});
		}
		console.log(`Restored ${data.Count} saved sessions.`, data.ConsumedCapacity);
	} catch (err) {
		console.log("error: ", err);
	}

	return InactiveSessions;
}

async function dumpToDynamoDB(exitOnCompletion = false) {
	let ConsumedCapacity = 0;

	// Avoid user interaction during saving
	// (Disconnecting the socket would be better, but explicitly
	// disconnecting socket prevents their automatic reconnection)
	if (exitOnCompletion) {
		for (const userID in Connections) {
			Connections[userID].socket.emit("message", {
				title: "Server Restarting",
				text: "Please wait...",
				showConfirmButton: false,
				timer: 0,
				allowOutsideClick: false,
			});
		}
	}

	const batchWrite = async function (table, Items) {
		console.log(`batchWrite of length ${Items.length} to ${table}.`);
		const params = {
			RequestItems: {},
			ReturnConsumedCapacity: "TOTAL",
		};
		params.RequestItems[table] = Items;

		try {
			const putResult = await docClient.batchWrite(params).promise();
			if (putResult.ConsumedCapacity) return putResult.ConsumedCapacity[0].CapacityUnits;
		} catch (err) {
			console.log("error: ", err);
		}
		return 0;
	};

	let ConnectionsRequests = [];
	for (const userID in Connections) {
		const c = Connections[userID];
		const Item = {
			userID: filterEmptyStr(userID),
			timestamp: Date.now(),
			data: {},
		};

		for (let prop of Object.getOwnPropertyNames(c).filter((p) => p !== "socket")) {
			if (!(c[prop] instanceof Function)) Item.data[prop] = filterEmptyStr(c[prop]);
		}

		ConnectionsRequests.push({ PutRequest: { Item: Item } });

		if (ConnectionsRequests.length === 25) {
			ConsumedCapacity += await batchWrite("mtga-draft-connections", ConnectionsRequests);
			ConnectionsRequests = [];
		}
	}
	if (ConnectionsRequests.length > 0) {
		ConsumedCapacity += await batchWrite("mtga-draft-connections", ConnectionsRequests);
		ConnectionsRequests = [];
	}

	let SessionsRequests = [];
	for (const sessionID in Sessions) {
		const s = Sessions[sessionID];
		const Item = {
			id: filterEmptyStr(sessionID),
			timestamp: Date.now(),
			data: {},
		};

		for (let prop of Object.getOwnPropertyNames(s).filter(
			(p) => !["users", "countdownInterval", "botsInstances"].includes(p)
		)) {
			if (!(s[prop] instanceof Function)) Item.data[prop] = filterEmptyStr(s[prop]);
		}

		if (s.drafting) {
			// Flag every user as disconnected so they can reconnect later
			for (let userID of s.users) {
				Item.data.disconnectedUsers[userID] = s.getDisconnectedUserData(userID);
				for (let prop of Object.getOwnPropertyNames(Item.data.disconnectedUsers[userID])) {
					Item.data.disconnectedUsers[userID][prop] = filterEmptyStr(
						Item.data.disconnectedUsers[userID][prop]
					);
				}
			}

			if (s.botsInstances) {
				Item.data.botsInstances = [];
				for (let bot of s.botsInstances) {
					let podbot = {};
					for (let prop of Object.getOwnPropertyNames(bot)) {
						if (!(bot[prop] instanceof Function)) podbot[prop] = bot[prop];
					}
					Item.data.botsInstances.push(podbot);
				}
			}

			if (s.winstonDraftState) {
				Item.data.winstonDraftState = {};
				for (let prop of Object.getOwnPropertyNames(s.winstonDraftState)) {
					if (!(s.winstonDraftState[prop] instanceof Function))
						Item.data.winstonDraftState[prop] = s.winstonDraftState[prop];
				}
			}
		}

		if (s.bracket) Item.data.bracket.players = Item.data.bracket.players.map((n) => filterEmptyStr(n));

		SessionsRequests.push({ PutRequest: { Item: Item } });
		if (SessionsRequests.length === 25) {
			ConsumedCapacity += await batchWrite("mtga-draft-sessions", SessionsRequests);
			SessionsRequests = [];
		}
	}

	if (SessionsRequests.length > 0) {
		ConsumedCapacity += await batchWrite("mtga-draft-sessions", SessionsRequests);
		SessionsRequests = [];
	}

	console.log(`dumpToDynamoDB: done. Total ConsumedCapacity: ${ConsumedCapacity}`);
	if (exitOnCompletion) process.exit(0);
}

// Can make asynchronous calls, is not called on process.exit() or uncaught
// exceptions.
// See https://nodejs.org/api/process.html#process_event_beforeexit
process.on("beforeExit", (code) => {
	console.log("beforeExit callback.");
});

// Only synchronous calls, called on process.exit()
// See https://nodejs.org/api/process.html#process_event_exit
process.on("exit", (code) => {
	console.log(`exit callback: Process exited with code: ${code}`);
});

/* SIGTERM will be called on new deploy, changes to config vars/add-ons, manual
 * restarts and automatic cycling of dynos (~ every 24h)
 * Process have 30sec. before getting SIGKILL'd.
 * See https://devcenter.heroku.com/articles/dynos#shutdown
 */
process.on("SIGTERM", () => {
	console.log("Received SIGTERM.");
	dumpToDynamoDB(true);
	// Gives dumpToDynamoDB 20sec. to finish saving everything.
	setTimeout((_) => {
		process.exit(0);
	}, 20000);
});

process.on("SIGINT", () => {
	console.log("Received SIGINT.");
	dumpToDynamoDB(true);
	// Gives dumpToDynamoDB 20sec. to finish saving everything.
	setTimeout((_) => {
		process.exit(0);
	}, 20000);
});

process.on("uncaughtException", (err) => {
	console.error("Uncaught Exception thrown: ");
	console.error(err);
	dumpToDynamoDB(true);
	// Gives dumpToDynamoDB 20sec. to finish saving everything.
	setTimeout((_) => {
		process.exit(1);
	}, 20000);
});

if (typeof global.it === "function") {
	// Testing in mocha
	module.exports.InactiveSessions = {};
	module.exports.InactiveConnections = {};
} else {
	module.exports.InactiveSessions = requestSavedSessions();
	module.exports.InactiveConnections = requestSavedConnections();
}

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
const InactiveConnections = {};
const InactiveSessions = {};

// Connections and Session are obsolete after two days
function isObsolete(item) {
	return Math.floor((Date.now() - item.timestamp) / 1000 / 60 / 60 / 24) > 2;
}

(async function requestSavedConnections() {
	var connectionsRequestParams = {
		TableName: "mtga-draft-connections",
		ReturnConsumedCapacity: "TOTAL",
	};

	try {
		const data = await docClient.scan(connectionsRequestParams).promise();

		for (let c of data.Items) {
			InactiveConnections[c.userID] = new ConnectionModule.Connection(null, c.data.userID, c.data.userName);
			for (let prop of Object.getOwnPropertyNames(c.data)) {
				InactiveConnections[c.userID][prop] = c.data[prop];
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
})();

(async function requestSavedSessions() {
	var connections = {
		TableName: "mtga-draft-sessions",
		ReturnConsumedCapacity: "TOTAL",
	};

	try {
		const data = await docClient.scan(connections).promise();

		for (let s of data.Items) {
			InactiveSessions[s.id] = new SessionModule.Session(s.id, null);
			for (let prop of Object.getOwnPropertyNames(s.data).filter((p) => !["botsInstances"].includes(p))) {
				InactiveSessions[s.id][prop] = s.data[prop];
			}

			if (s.data.botsInstances) {
				InactiveSessions[s.id].botsInstances = [];
				for (let bot of s.data.botsInstances) {
					const newBot = new Bot(bot.name, bot.id);
					for (let prop of Object.getOwnPropertyNames(bot)) {
						newBot[prop] = bot[prop];
					}
					InactiveSessions[s.id].botsInstances.push(newBot);
				}
			}

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
})();

async function dumpToDynamoDB(exitOnCompletion = false) {
	let ConsumedCapacity = 0;
	for (const userID in Connections) {
		const c = Connections[userID];
		const params = {
			TableName: "mtga-draft-connections",
			ReturnConsumedCapacity: "TOTAL",
			Item: {
				userID: userID,
				timestamp: Date.now(),
				data: {},
			},
		};

		for (let prop of Object.getOwnPropertyNames(c).filter((p) => p !== "socket")) {
			if (!(c[prop] instanceof Function)) params.Item.data[prop] = c[prop];
		}

		try {
			const putResult = await docClient.put(params).promise();
			ConsumedCapacity += putResult.ConsumedCapacity.CapacityUnits;
		} catch (err) {
			console.log("error: ", err);
		}
	}

	for (const sessionID in Sessions) {
		const s = Sessions[sessionID];
		const params = {
			TableName: "mtga-draft-sessions",
			ReturnConsumedCapacity: "TOTAL",
			Item: {
				id: sessionID,
				timestamp: Date.now(),
				data: {},
			},
		};

		for (let prop of Object.getOwnPropertyNames(s).filter(
			(p) => !["users", "countdownInterval", "botsInstances"].includes(p)
		)) {
			if (!(s[prop] instanceof Function)) params.Item.data[prop] = s[prop];
		}

		if (s.drafting) {
			// Flag every user as disconnected so they can reconnect later
			for (let userID of s.users) {
				params.Item.data.disconnectedUsers[userID] = s.getDisconnectedUserData(userID);
			}

			if (s.botsInstances) {
				params.Item.data.botsInstances = [];
				for (let bot of s.botsInstances) {
					let podbot = {};
					for (let prop of Object.getOwnPropertyNames(bot)) {
						if (!(bot[prop] instanceof Function)) podbot[prop] = bot[prop];
					}
					params.Item.data.botsInstances.push(podbot);
				}
			}
		}

		try {
			const putResult = await docClient.put(params).promise();
			ConsumedCapacity += putResult.ConsumedCapacity.CapacityUnits;
		} catch (err) {
			console.log("error: ", err);
		}
	}

	console.log(`dumpToDynamoDB: done. Total ConsumedCapacity: ${ConsumedCapacity}`);
	if (exitOnCompletion) process.exit(0);
}

// Can make asynchronous calls, is not called on process.exit() or uncaught exceptions.
// See https://nodejs.org/api/process.html#process_event_beforeexit
process.on("beforeExit", (code) => {
	console.log("beforeExit callback.");
});

// Only synchronous calls, called on process.exit()
// See https://nodejs.org/api/process.html#process_event_exit
process.on("exit", (code) => {
	console.log(`exit callback: Process exited with code: ${code}`);
});

/* SIGTERM will be called on new deploy, changes to config vars/add-ons, manual restarts and automatic cycling of dynos (~ every 24h)
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

module.exports.InactiveSessions = InactiveSessions;
module.exports.InactiveConnections = InactiveConnections;

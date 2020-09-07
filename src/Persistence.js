"use strict";

import dotenv from "dotenv";
if (process.env.NODE_ENV !== "production") {
	dotenv.config();
}
import AWS from "aws-sdk";

import { Connection, Connections } from "./Connection.js";
import { Session, Sessions, WinstonDraftState, GridDraftState, RochesterDraftState } from "./Session.js";
import Bot from "./Bot.js";
import Mixpanel from "mixpanel";
const MixPanelToken = process.env.MIXPANEL_TOKEN ? process.env.MIXPANEL_TOKEN : null;
const MixInstance = MixPanelToken
	? Mixpanel.init(MixPanelToken, {
			//debug: process.env.NODE_ENV !== "production",
			protocol: "https",
	  })
	: null;

//                         Testing in mocha                   Explicitly disabled
const DisablePersistence = typeof global.it === "function" || process.env.DISABLE_PERSISTENCE === "TRUE";

const TableNames = {
	Connections: process.env.TABLENAME_CONNECTIONS ? process.env.TABLENAME_CONNECTIONS : "mtga-draft-connections",
	Sessions: process.env.TABLENAME_SESSIONS ? process.env.TABLENAME_SESSIONS : "mtga-draft-sessions",
	DraftLogs: process.env.TABLENAME_SESSIONLOGS ? process.env.TABLENAME_SESSIONLOGS : "mtga-draft-session-logs",
};

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
	if (Array.isArray(obj)) {
		let r = [];
		for (let i of obj) {
			r.push(restoreEmptyStr(i));
		}
		return r;
	}
	return obj;
}

// Connections and Session are obsolete after two days
function isObsolete(item) {
	return Math.floor((Date.now() - item.timestamp) / 1000 / 60 / 60 / 24) > 2;
}

async function requestSavedConnections() {
	var connectionsRequestParams = {
		TableName: TableNames["Connections"],
		ConsistentRead: true,
		ReturnConsumedCapacity: "TOTAL",
	};
	let InactiveConnections = {};

	try {
		const data = await docClient.scan(connectionsRequestParams).promise();

		for (let c of data.Items) {
			const restoredID = restoreEmptyStr(c.userID);
			InactiveConnections[restoredID] = new Connection(null, restoredID, restoreEmptyStr(c.data.userName));
			for (let prop of Object.getOwnPropertyNames(c.data)) {
				InactiveConnections[restoredID][prop] = restoreEmptyStr(c.data[prop]);
			}

			if (isObsolete(c))
				docClient.delete({ TableName: TableNames["Connections"], Key: { userID: c.userID } }, err => {
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
		TableName: TableNames["Sessions"],
		ConsistentRead: true,
		ReturnConsumedCapacity: "TOTAL",
	};

	let InactiveSessions = {};
	try {
		const data = await docClient.scan(connections).promise();

		for (let s of data.Items) {
			const fixedID = restoreEmptyStr(s.id);
			if (s.data.bracket) s.data.bracket.players = s.data.bracket.players.map(n => restoreEmptyStr(n));

			InactiveSessions[fixedID] = new Session(fixedID, null);
			for (let prop of Object.getOwnPropertyNames(s.data).filter(
				p => !["botsInstances", "winstonDraftState", "gridDraftState", "rochesterDraftState"].includes(p)
			)) {
				InactiveSessions[fixedID][prop] = restoreEmptyStr(s.data[prop]);
			}

			const copyProps = (obj, target) => {
				for (let prop of Object.getOwnPropertyNames(obj)) target[prop] = obj[prop];
			};

			if (s.data.botsInstances) {
				InactiveSessions[fixedID].botsInstances = [];
				for (let bot of s.data.botsInstances) {
					const newBot = new Bot(bot.name, bot.id);
					copyProps(bot, newBot);
					InactiveSessions[fixedID].botsInstances.push(newBot);
				}
			}

			if (s.data.winstonDraftState) {
				InactiveSessions[fixedID].winstonDraftState = new WinstonDraftState();
				copyProps(s.data.winstonDraftState, InactiveSessions[fixedID].winstonDraftState);
			}

			if (s.data.gridDraftState) {
				InactiveSessions[fixedID].gridDraftState = new GridDraftState();
				copyProps(s.data.gridDraftState, InactiveSessions[fixedID].gridDraftState);
			}

			if (s.data.rochesterDraftState) {
				InactiveSessions[fixedID].rochesterDraftState = new RochesterDraftState();
				copyProps(s.data.rochesterDraftState, InactiveSessions[fixedID].rochesterDraftState);
			}

			if (isObsolete(s))
				docClient.delete({ TableName: TableNames["Sessions"], Key: { id: s.id } }, err => {
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

	const batchWrite = async function(table, Items) {
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

	let Promises = [];

	let ConnectionsRequests = [];
	for (const userID in Connections) {
		const c = Connections[userID];
		const Item = {
			userID: filterEmptyStr(userID),
			timestamp: Date.now(),
			data: {},
		};

		for (let prop of Object.getOwnPropertyNames(c).filter(p => p !== "socket")) {
			if (!(c[prop] instanceof Function)) Item.data[prop] = c[prop];
		}

		ConnectionsRequests.push({ PutRequest: { Item: Item } });

		if (ConnectionsRequests.length === 25) {
			Promises.push(batchWrite(TableNames["Connections"], ConnectionsRequests));
			ConnectionsRequests = [];
		}
	}
	if (ConnectionsRequests.length > 0) {
		Promises.push(batchWrite(TableNames["Connections"], ConnectionsRequests));
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
			p => !["users", "countdownInterval", "botsInstances", "winstonDraftState", "gridDraftState"].includes(p)
		)) {
			if (!(s[prop] instanceof Function)) Item.data[prop] = s[prop];
		}

		if (s.drafting) {
			// Flag every user as disconnected so they can reconnect later
			for (let userID of s.users) {
				Item.data.disconnectedUsers[userID] = s.getDisconnectedUserData(userID);
			}

			const copyProps = (obj, target) => {
				for (let prop of Object.getOwnPropertyNames(obj))
					if (!(obj[prop] instanceof Function)) target[prop] = obj[prop];
			};

			if (s.botsInstances) {
				Item.data.botsInstances = [];
				for (let bot of s.botsInstances) {
					let podbot = {};
					copyProps(bot, podbot);
					Item.data.botsInstances.push(podbot);
				}
			}

			if (s.winstonDraftState) {
				Item.data.winstonDraftState = {};
				copyProps(s.winstonDraftState, Item.data.winstonDraftState);
			}

			if (s.gridDraftState) {
				Item.data.gridDraftState = {};
				copyProps(s.gridDraftState, Item.data.gridDraftState);
			}

			if (s.rochesterDraftState) {
				Item.data.rochesterDraftState = {};
				copyProps(s.rochesterDraftState, Item.data.rochesterDraftState);
			}
		}

		SessionsRequests.push({ PutRequest: { Item: Item } });
		if (SessionsRequests.length === 25) {
			Promises.push(batchWrite(TableNames["Sessions"], SessionsRequests));
			SessionsRequests = [];
		}
	}

	if (SessionsRequests.length > 0) {
		Promises.push(batchWrite(TableNames["Sessions"], SessionsRequests));
		SessionsRequests = [];
	}

	console.log("Waiting for all promises to return...");
	await Promise.all(Promises).then(vals => {
		console.log("All batchWrites returned.");
		for (let v of vals) ConsumedCapacity += v;
	});

	console.log(`dumpToDynamoDB: done. Total ConsumedCapacity: ${ConsumedCapacity}`);
	if (exitOnCompletion) process.exit(0);
}

async function logSessionToDynamoDB(type, localSess) {
	if (DisablePersistence) return;
	const params = {
		TableName: TableNames.DraftLogs,
		ReturnConsumedCapacity: "TOTAL",
		Item: {
			id: filterEmptyStr(localSess.id),
			time: new Date().getTime(),
			type: type === "" ? null : type,
			session: localSess,
		},
	};

	try {
		const putResult = await docClient.put(params).promise();
		console.log(
			`Saved session log '${type}' '${localSess.id}' (ConsumedCapacity : ${putResult.ConsumedCapacity.CapacityUnits})`
		);
	} catch (err) {
		console.error("saveDraftlog error: ", err);
		console.error(params);
	}
}

export function logSession(type, session) {
	if (!MixInstance) return;

	let localSess = JSON.parse(JSON.stringify(session));
	localSess.users = [...session.users]; // Stringifying doesn't support Sets
	// Anonymize Draft Log
	localSess.id = new Date().toISOString();
	if (localSess.draftLog) {
		localSess.draftLog.sessionID = localSess.id;
		let idx = 0;
		if (localSess.draftLog.users)
			for (let uid in localSess.draftLog.users)
				if (!localSess.draftLog.users[uid].userName.startsWith("Bot #"))
					localSess.draftLog.users[uid].userName = `Anonymous Player #${++idx}`;
	}

	//logSessionToDynamoDB(type, localSess);

	let mixdata = {
		distinct_id: process.env.NODE_ENV || "development",
		playerCount: localSess.users.length,
	};
	for (let prop of [
		"boostersPerPlayer",
		"teamDraft",
		"ignoreCollections",
		"mythicPromotion",
		"maxDuplicates",
		"customBoosters",
		"isPublic",
		"foil",
		"draftLogRecipients",
		"distributionMode",
		"ownerIsPlayer",
		"bots",
		"maxPlayers",
		"setRestriction",
		"useCustomCardList",
		"maxTimer",
		"colorBalance",
		"boosterContent",
		"burnedCardsPerRound",
		"bracketLocked",
	])
		mixdata[prop] = localSess[prop];
	if (localSess.customCardList && localSess.customCardList.name)
		mixdata.customCardListName = localSess.customCardList.name;
	MixInstance.track(type === "" ? "DefaultEvent" : type, mixdata);
}

export let InactiveSessions = {};
export let InactiveConnections = {};
if (!DisablePersistence) {
	// Can make asynchronous calls, is not called on process.exit() or uncaught
	// exceptions.
	// See https://nodejs.org/api/process.html#process_event_beforeexit
	process.on("beforeExit", () => {
		console.log("beforeExit callback.");
	});

	// Only synchronous calls, called on process.exit()
	// See https://nodejs.org/api/process.html#process_event_exit
	process.on("exit", code => {
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
		setTimeout(() => {
			process.exit(0);
		}, 20000);
	});

	process.on("SIGINT", () => {
		console.log("Received SIGINT.");
		dumpToDynamoDB(true);
		// Gives dumpToDynamoDB 20sec. to finish saving everything.
		setTimeout(() => {
			process.exit(0);
		}, 20000);
	});

	process.on("uncaughtException", err => {
		console.error("Uncaught Exception thrown: ");
		console.error(err);
		dumpToDynamoDB(true);
		// Gives dumpToDynamoDB 20sec. to finish saving everything.
		setTimeout(() => {
			process.exit(1);
		}, 20000);
	});

	InactiveSessions = requestSavedSessions();
	InactiveConnections = requestSavedConnections();
}

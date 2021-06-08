"use strict";

import dotenv from "dotenv";
if (process.env.NODE_ENV !== "production") {
	dotenv.config();
}

import { Connection, Connections } from "./Connection.js";
import {
	Session,
	Sessions,
	DraftState,
	WinstonDraftState,
	GridDraftState,
	RochesterDraftState,
	IIndexable,
} from "./Session.js";
import Bot from "./Bot.js";
import Mixpanel from "mixpanel";
const MixPanelToken = process.env.MIXPANEL_TOKEN ? process.env.MIXPANEL_TOKEN : null;
const MixInstance = MixPanelToken
	? Mixpanel.init(MixPanelToken, {
			//debug: process.env.NODE_ENV !== "production",
			protocol: "https",
	  })
	: null;

//                         Testing in mocha                            Explicitly disabled
const DisablePersistence = typeof (global as any).it === "function" || process.env.DISABLE_PERSISTENCE === "TRUE";
const SaveLogs = false; // Disabled for now.

import axios from "axios";
import { UserID } from "./IDTypes.js";

const PersistenceStoreURL = process.env.PERSISTENCE_STORE_URL ?? "http://localhost:3008";
const PersistenceKey = process.env.PERSISTENCE_KEY ?? "1234";

async function requestSavedConnections() {
	let InactiveConnections: { [uid: string]: any } = {};

	try {
		const response = await axios.get(`${PersistenceStoreURL}/temp/connections`, {
			headers: {
				"access-key": PersistenceKey,
				"Accept-Encoding": "gzip, deflate",
			},
		});
		if (response.status !== 200) {
			console.error(`requestSavedConnections::Error ${response.status}: ${response.statusText}`);
			console.error(`	Data: `, response.data);
		} else {
			const connections = response.data;
			if (connections && connections.length > 0) {
				for (let c of connections) {
					InactiveConnections[c.userID] = c;
				}
				console.log(`Restored ${connections.length} saved connections.`);
			}
		}
	} catch (err) {
		console.error(
			"requestSavedConnections::",
			err.message,
			err.response?.statusText ?? "",
			err.response?.data ?? ""
		);
	}

	return InactiveConnections;
}

function copyProps(obj: any, target: any) {
	for (let prop of Object.getOwnPropertyNames(obj)) if (!(obj[prop] instanceof Function)) target[prop] = obj[prop];
}

export function restoreSession(s: any, owner: UserID) {
	const r = new Session(s.id, owner);
	for (let prop of Object.getOwnPropertyNames(s).filter(p => !["botsInstances", "draftState", "owner"].includes(p))) {
		(r as IIndexable)[prop] = s[prop];
	}

	if (s.botsInstances) {
		r.botsInstances = [];
		for (let bot of s.botsInstances) {
			const newBot = new Bot(bot.name, bot.id);
			copyProps(bot, newBot);
			r.botsInstances.push(newBot);
		}
	}

	if (s.draftState) {
		switch (s.draftState.type) {
			case "draft": {
				r.draftState = new DraftState([]);
				break;
			}
			case "winston": {
				r.draftState = new WinstonDraftState([], []);
				break;
			}
			case "grid": {
				r.draftState = new GridDraftState([], []);
				break;
			}
			case "rochester": {
				r.draftState = new RochesterDraftState([], []);
				break;
			}
		}
		copyProps(s.draftState, r.draftState);
	}

	return r;
}

export function getPoDSession(s: Session) {
	const PoDSession: any = {};

	for (let prop of Object.getOwnPropertyNames(s).filter(
		p => !["users", "countdownInterval", "botsInstances", "draftState"].includes(p)
	)) {
		if (!((s as IIndexable)[prop] instanceof Function)) PoDSession[prop] = (s as IIndexable)[prop];
	}

	if (s.drafting) {
		// Flag every user as disconnected so they can reconnect later
		for (let userID of s.users) {
			PoDSession.disconnectedUsers[userID] = s.getDisconnectedUserData(userID);
		}

		if (s.botsInstances) {
			PoDSession.botsInstances = [];
			for (let bot of s.botsInstances) {
				let podbot = {};
				copyProps(bot, podbot);
				PoDSession.botsInstances.push(podbot);
			}
		}

		if (s.draftState) {
			PoDSession.draftState = {};
			copyProps(s.draftState, PoDSession.draftState);
		}
	}
	return PoDSession;
}

async function requestSavedSessions() {
	let InactiveSessions: { [sid: string]: Session } = {};
	try {
		const response = await axios.get(`${PersistenceStoreURL}/temp/sessions`, {
			headers: {
				"access-key": PersistenceKey,
				"Accept-Encoding": "gzip, deflate",
			},
		});
		if (response.status !== 200) {
			console.error(`requestSavedSessions::Error ${response.status}: ${response.statusText}`);
			console.error(`	Data: `, response.data);
		} else {
			if (response.data && response.data.length > 0) {
				for (let s of response.data) {
					InactiveSessions[s.id] = s;
				}
				console.log(`Restored ${response.data.length} saved sessions.`);
			}
		}
	} catch (err) {
		console.error("requestSavedSessions::", err.message, err.response?.statusText ?? "", err.response?.data ?? "");
	}

	return InactiveSessions;
}

async function tempDump(exitOnCompletion = false) {
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

	let Promises = [];

	let PoDConnections = [];
	for (const userID in Connections) {
		const c = Connections[userID];
		const PoDConnection: any = {};

		for (let prop of Object.getOwnPropertyNames(c).filter(p => p !== "socket")) {
			if (!((c as IIndexable)[prop] instanceof Function)) PoDConnection[prop] = (c as IIndexable)[prop];
		}

		PoDConnections.push(PoDConnection);
	}

	try {
		Promises.push(
			axios
				.post(`${PersistenceStoreURL}/temp/connections`, PoDConnections, {
					maxContentLength: Infinity,
					maxBodyLength: Infinity,
					headers: {
						"access-key": PersistenceKey,
					},
				})
				.catch(err => console.error("Error storing connections: ", err.message))
		);
	} catch (err) {
		console.log("Error: ", err);
	}

	const PoDSessions = [];
	for (const sessionID in Sessions) PoDSessions.push(getPoDSession(Sessions[sessionID]));

	try {
		Promises.push(
			axios
				.post(`${PersistenceStoreURL}/temp/sessions`, PoDSessions, {
					maxContentLength: Infinity,
					maxBodyLength: Infinity,
					headers: {
						"access-key": PersistenceKey,
					},
				})
				.catch(err => console.error("Error storing sessions: ", err.message))
		);
	} catch (err) {
		console.log("Error: ", err);
	}

	console.log("Waiting for all promises to return...");
	await Promise.all(Promises).then(() => {
		console.log("All temp store returned.");
	});

	if (exitOnCompletion) process.exit(0);
}

function saveLog(type: string, session: Session) {
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

	if (type === "Draft" && !DisablePersistence) {
		axios
			.post(`${PersistenceStoreURL}/store/${localSess.draftLog.sessionID}`, localSess.draftLog, {
				headers: {
					"access-key": PersistenceKey,
				},
			})
			.catch(err => console.error("Error storing logs: ", err.message));
	}
}

export function dumpError(name: string, data: any) {
	axios
		.post(`${PersistenceStoreURL}/store/${name}`, data, {
			headers: {
				"access-key": PersistenceKey,
			},
		})
		.catch(err => console.error("Error dumping error(wup): ", err.message));
}

export function logSession(type: string, session: Session) {
	if (SaveLogs) saveLog(type, session);

	if (!MixInstance) return;
	let mixdata: any = {
		distinct_id: process.env.NODE_ENV || "development",
		playerCount: session.users.size,
	};
	for (let prop of [
		"boostersPerPlayer",
		"teamDraft",
		"cardsPerBooster",
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
		mixdata[prop] = (session as IIndexable)[prop];
	if (session.customCardList && session.customCardList.name) mixdata.customCardListName = session.customCardList.name;
	MixInstance.track(type === "" ? "DefaultEvent" : type, mixdata);
}

export let InactiveSessions: { [sid: string]: any } = {};
export let InactiveConnections: { [sid: string]: any } = {};
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
		tempDump(true);
		// Gives tempDump 20sec. to finish saving everything.
		setTimeout(() => {
			process.exit(0);
		}, 20000);
	});

	process.on("SIGINT", () => {
		console.log("Received SIGINT.");
		tempDump(true);
		// Gives tempDump 20sec. to finish saving everything.
		setTimeout(() => {
			process.exit(0);
		}, 20000);
	});

	process.on("uncaughtException", err => {
		console.error("Uncaught Exception thrown: ");
		console.error(err);
		tempDump(true);
		// Gives tempDump 20sec. to finish saving everything.
		setTimeout(() => {
			process.exit(1);
		}, 20000);
	});

	InactiveConnections = requestSavedConnections();
	InactiveSessions = requestSavedSessions();
	Promise.all([InactiveConnections, InactiveSessions]).then(values => {
		InactiveConnections = values[0];
		InactiveSessions = values[1];
	});
}

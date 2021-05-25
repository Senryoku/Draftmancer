"use strict";

import dotenv from "dotenv";
if (process.env.NODE_ENV !== "production") {
	dotenv.config();
}

import { Connection, Connections } from "./Connection.js";
import { Session, Sessions, DraftState, WinstonDraftState, GridDraftState, RochesterDraftState } from "./Session.js";
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
const SaveLogs = false; // Disabled for now.

import axios from "axios";

const PersistenceStoreURL = process.env.PERSISTENCE_STORE_URL
	? process.env.PERSISTENCE_STORE_URL
	: "http://localhost:3008";
const PersistenceKey = process.env.PERSISTENCE_KEY ? process.env.PERSISTENCE_KEY : "1234";

async function requestSavedConnections() {
	let InactiveConnections = {};

	try {
		const response = await axios.get(`${PersistenceStoreURL}/temp/connections`, {
			headers: {
				"access-key": PersistenceKey,
				"Accept-Encoding": "gzip, deflate",
			},
		});
		if (response.status !== 200) {
			console.error(`Error ${response.status}: ${response.statusText}`);
			console.error(`Data: `, response.data);
		} else {
			const connections = response.data;
			if (connections && connections.length > 0) {
				for (let c of connections) {
					InactiveConnections[c.userID] = new Connection(null, c.userID, c.userName);
					for (let prop of Object.getOwnPropertyNames(c)) {
						InactiveConnections[c.userID][prop] = c[prop];
					}
				}
				console.log(`Restored ${connections.length} saved connections.`);
			}
		}
	} catch (err) {
		console.log("Error (requestSavedConnections): ", err);
	}

	return InactiveConnections;
}

async function requestSavedSessions() {
	let InactiveSessions = {};
	try {
		const response = await axios.get(`${PersistenceStoreURL}/temp/sessions`, {
			headers: {
				"access-key": PersistenceKey,
				"Accept-Encoding": "gzip, deflate",
			},
		});
		if (response.status !== 200) {
			console.error(`Error ${response.status}: ${response.statusText}`);
			console.error(`Data: `, response.data);
		} else {
			if (response.data && response.data.length > 0) {
				for (let s of response.data) {
					InactiveSessions[s.id] = new Session(s.id, null);
					for (let prop of Object.getOwnPropertyNames(s).filter(
						p => !["botsInstances", "draftState"].includes(p)
					)) {
						InactiveSessions[s.id][prop] = s[prop];
					}

					const copyProps = (obj, target) => {
						for (let prop of Object.getOwnPropertyNames(obj)) target[prop] = obj[prop];
					};

					if (s.botsInstances) {
						InactiveSessions[s.id].botsInstances = [];
						for (let bot of s.botsInstances) {
							const newBot = new Bot(bot.name, bot.id);
							copyProps(bot, newBot);
							InactiveSessions[s.id].botsInstances.push(newBot);
						}
					}

					if (s.draftState) {
						switch (s.draftState.type) {
							case "draft": {
								InactiveSessions[s.id].draftState = new DraftState();
								break;
							}
							case "winston": {
								InactiveSessions[s.id].draftState = new WinstonDraftState();
								break;
							}
							case "grid": {
								InactiveSessions[s.id].draftState = new GridDraftState();
								break;
							}
							case "rochester": {
								InactiveSessions[s.id].draftState = new RochesterDraftState();
								break;
							}
						}
						copyProps(s.draftState, InactiveSessions[s.id].draftState);
					}
				}
				console.log(`Restored ${response.data.length} saved sessions.`);
			}
		}
	} catch (err) {
		console.log("error: ", err);
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
		const PoDConnection = {};

		for (let prop of Object.getOwnPropertyNames(c).filter(p => p !== "socket")) {
			if (!(c[prop] instanceof Function)) PoDConnection[prop] = c[prop];
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

	let PoDSessions = [];
	for (const sessionID in Sessions) {
		const s = Sessions[sessionID];
		const PoDSession = {};

		for (let prop of Object.getOwnPropertyNames(s).filter(
			p => !["users", "countdownInterval", "botsInstances", "draftState"].includes(p)
		)) {
			if (!(s[prop] instanceof Function)) PoDSession[prop] = s[prop];
		}

		if (s.drafting) {
			// Flag every user as disconnected so they can reconnect later
			for (let userID of s.users) {
				PoDSession.disconnectedUsers[userID] = s.getDisconnectedUserData(userID);
			}

			const copyProps = (obj, target) => {
				for (let prop of Object.getOwnPropertyNames(obj))
					if (!(obj[prop] instanceof Function)) target[prop] = obj[prop];
			};

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

		PoDSessions.push(PoDSession);
	}

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

function saveLog(type, session) {
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

export function dumpError(name, data) {
	axios
		.post(`${PersistenceStoreURL}/store/${name}`, data, {
			headers: {
				"access-key": PersistenceKey,
			},
		})
		.catch(err => console.error("Error dumping error(wup): ", err.message));
}

export function logSession(type, session) {
	if (SaveLogs) saveLog(type, session);

	if (!MixInstance) return;
	let mixdata = {
		distinct_id: process.env.NODE_ENV || "development",
		playerCount: session.users.size,
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
		mixdata[prop] = session[prop];
	if (session.customCardList && session.customCardList.name) mixdata.customCardListName = session.customCardList.name;
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

"use strict";

import dotenv from "dotenv";
if (process.env.NODE_ENV !== "production") {
	dotenv.config();
}

import { Connections } from "./Connection.js";
import {
	Session,
	Sessions,
	DraftState,
	WinstonDraftState,
	GridDraftState,
	RochesterDraftState,
	IIndexable,
} from "./Session.js";
import { MinesweeperDraftState } from "./MinesweeperDraft.js";
import { Bot, IBot, SimpleBot } from "./Bot.js";
import Mixpanel from "mixpanel";
const MixPanelToken = process.env.MIXPANEL_TOKEN ? process.env.MIXPANEL_TOKEN : null;
const MixInstance = MixPanelToken
	? Mixpanel.init(MixPanelToken, {
			//debug: process.env.NODE_ENV !== "production",
			protocol: "https",
	  })
	: null;

const InTesting = typeof (global as any).it === "function"; // Testing in mocha
//                                      Explicitly disabled
const DisablePersistence = InTesting || process.env.DISABLE_PERSISTENCE === "TRUE";
const SaveLogs = false; // Disabled for now.

import axios from "axios";
import { UserID } from "./IDTypes.js";
import { Cards } from "./Cards.js";

const PersistenceStoreURL = process.env.PERSISTENCE_STORE_URL ?? "http://localhost:3008";
const PersistenceKey = process.env.PERSISTENCE_KEY ?? "1234";

const MTGDraftbotsLogEndpoint =
	process.env.MTGDRAFTBOTS_ENDPOINT ?? "https://staging.cubeartisan.net/integrations/draftlog";
const MTGDraftbotsAPIKey = process.env.MTGDRAFTBOTS_APIKEY;

function copyProps(obj: any, target: any) {
	for (let prop of Object.getOwnPropertyNames(obj)) if (!(obj[prop] instanceof Function)) target[prop] = obj[prop];
	return target;
}

function restoreBot(bot: any): IBot | undefined {
	if (!bot) return undefined;

	if (bot.type == "SimpleBot") {
		const newBot = new SimpleBot(bot.name, bot.id);
		copyProps(bot, newBot);
		return newBot;
	} else if (bot.type == "mtgdraftbots") {
		const newBot = new Bot(bot.name, bot.id);
		copyProps(bot, newBot);
		return newBot;
	}
	console.error(`Error: Invalid bot type '${bot.type}'.`);
	return undefined;
}

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
					if (InactiveConnections[c.userID].bot)
						InactiveConnections[c.userID].bot = restoreBot(InactiveConnections[c.userID].bot);
				}
				console.log(`Restored ${connections.length} saved connections.`);
			}
		}
	} catch (err: any) {
		console.error(
			"requestSavedConnections::",
			err.message,
			err.response?.statusText ?? "",
			err.response?.data ?? ""
		);
	}

	return InactiveConnections;
}

export function restoreSession(s: any, owner: UserID) {
	const r = new Session(s.id, owner);
	for (let prop of Object.getOwnPropertyNames(s).filter((p) => !["draftState", "owner"].includes(p))) {
		(r as IIndexable)[prop] = s[prop];
	}

	if (s.draftState) {
		switch (s.draftState.type) {
			case "draft": {
				r.draftState = new DraftState();
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
			case "minesweeper": {
				r.draftState = new MinesweeperDraftState([], [], 0, 0, 0);
				break;
			}
		}
		copyProps(s.draftState, r.draftState);
		// TODO: Deal with draft players object properly
		//       And especially properly restoring bots : restoreBot(bot);
		if (r.draftState instanceof DraftState) {
			for (let userID in r.draftState.players)
				r.draftState.players[userID].botInstance = restoreBot(r.draftState.players[userID].botInstance) as IBot;
		}
	}

	return r;
}

export function getPoDSession(s: Session) {
	const PoDSession: any = {};

	for (let prop of Object.getOwnPropertyNames(s).filter(
		(p) => !["users", "countdownInterval", "draftState"].includes(p)
	)) {
		if (!((s as IIndexable)[prop] instanceof Function)) PoDSession[prop] = (s as IIndexable)[prop];
	}

	if (s.drafting) {
		// Flag every user as disconnected so they can reconnect later
		for (let userID of s.users) {
			if (Connections[userID]) PoDSession.disconnectedUsers[userID] = s.getDisconnectedUserData(userID);
		}

		if (s.draftState) {
			PoDSession.draftState = {};
			copyProps(s.draftState, PoDSession.draftState);

			// TODO: Properly deal with bots in the players object in draft state
			if (s.draftState instanceof DraftState) {
				let players = {};
				copyProps(s.draftState.players, players);
				PoDSession.draftState.players = players;

				for (let userID in s.draftState.players) {
					let podBot = {};
					copyProps(s.draftState.players[userID].botInstance, podBot);
					PoDSession.draftState.players[userID].botInstance = podBot;
				}
			}
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
	} catch (err: any) {
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

		for (let prop of Object.getOwnPropertyNames(c).filter((p) => !["socket", "bot"].includes(p))) {
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
				.catch((err) => console.error("Error storing connections: ", err.message))
		);
	} catch (err) {
		console.log("Error: ", err);
	}

	const PoDSessions = [];
	for (const sessionID in Sessions) {
		try {
			PoDSessions.push(getPoDSession(Sessions[sessionID]));
		} catch (e) {
			console.error(`Error while saving session '${sessionID}'.`);
		}
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
				.catch((err) => console.error("Error storing sessions: ", err.message))
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

type MTGDraftbotsLogEntry = {
	pack: String[];
	picks: Number[];
	trash: Number[];
	packNum: Number;
	numPacks: Number;
	pickNum: Number;
	numPicks: Number;
};

type MTGDraftbotsLog = {
	players: MTGDraftbotsLogEntry[][];
	apiKey: String;
};

function saveLog(type: string, session: Session) {
	if (session.draftLog) {
		let localLog = JSON.parse(JSON.stringify(session.draftLog));
		// Anonymize Draft Log
		localLog.sessionID = new Date().toISOString();
		let idx = 0;
		if (localLog.users)
			for (let uid in localLog.users)
				if (!localLog.users[uid].userName.startsWith("Bot #"))
					localLog.users[uid].userName = `Anonymous Player #${++idx}`;

		if (type === "Draft" && !DisablePersistence && SaveLogs) {
			axios
				.post(`${PersistenceStoreURL}/store/${localLog.sessionID}`, localLog, {
					headers: {
						"access-key": PersistenceKey,
					},
				})
				.catch((err) => console.error("Error storing logs: ", err.message));
		}

		// Send log to MTGDraftbots endpoint
		if (MTGDraftbotsAPIKey && type === "Draft") {
			const data: MTGDraftbotsLog = {
				players: [],
				apiKey: MTGDraftbotsAPIKey,
			};
			for (let uid in localLog.users) {
				const u = localLog.users[uid];
				if (!u.isBot && u.picks.length > 0) {
					const player: MTGDraftbotsLogEntry[] = [];
					let packNum = 0;
					let pickNum = 0;
					let lastPackSize = u.picks[0].booster.length + 1;
					let lastPackPicks = 0;
					for (let p of u.picks) {
						if (p.booster.length >= lastPackSize) {
							// Patch last pack picks with the correct numPicks
							for (let i = player.length - lastPackPicks; i < player.length; ++i)
								player[i].numPicks = pickNum;
							packNum += 1;
							pickNum = 0;
							lastPackPicks = 0;
						}
						lastPackSize = p.booster.length;
						player.push({
							pack: p.booster.map((cid: string) => Cards[cid].oracle_id),
							picks: p.pick,
							trash: p.burn,
							packNum: packNum,
							numPacks: -1,
							pickNum: pickNum,
							numPicks: -1,
						});
						pickNum += p.pick.length;
						++lastPackPicks;
					}
					// Patch each pick with the correct numPacks and the last pack with the correct numPicks
					for (let p of player) {
						p.numPacks = packNum + 1;
						if (p.numPicks === -1) p.numPicks = pickNum;
					}
					if (player.length > 0) data.players.push(player);
				}
			}
			if (!InTesting && process.env.NODE_ENV === "production" && data.players.length > 0)
				axios
					.post(MTGDraftbotsLogEndpoint, data)
					.then((response) => {
						// We expect a 201 (Created) response
						if (response.status !== 201) {
							console.warn("Unexpected response after sending draft logs to MTGDraftbots: ");
							console.warn(response);
						}
					})
					.catch((err) => console.error("Error sending logs to cubeartisan: ", err.message));
		}
	}
}

export function dumpError(name: string, data: any) {
	axios
		.post(`${PersistenceStoreURL}/store/${name}`, data, {
			headers: {
				"access-key": PersistenceKey,
			},
		})
		.catch((err) => console.error("Error dumping error(wup): ", err.message));
}

export function logSession(type: string, session: Session) {
	try {
		saveLog(type, session);
	} catch (err) {
		console.error("Error saving logs: ", err);
	}

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

	process.on("uncaughtException", (err) => {
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
	Promise.all([InactiveConnections, InactiveSessions]).then((values) => {
		InactiveConnections = values[0];
		InactiveSessions = values[1];
	});
}

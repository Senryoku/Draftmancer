"use strict";

import { InTesting, TestingOnly } from "./Context.js";
import dotenv from "dotenv";
if (process.env.NODE_ENV !== "production") {
	dotenv.config();
}
import crypto from "crypto";
import axios from "axios";
import fs from "fs";
import path from "path";
import { Connections, clearConnections, getPODConnection } from "./Connection.js";
import { Session, Sessions, clearSessions } from "./Session.js";
import { TeamSealedState } from "./TeamSealed.js";
import { MinesweeperDraftState } from "./MinesweeperDraft.js";
import { Bot, IBot, SimpleBot } from "./Bot.js";
import mixpanel from "mixpanel";
const MixPanelToken = process.env.MIXPANEL_TOKEN ? process.env.MIXPANEL_TOKEN : null;
const MixInstance = MixPanelToken
	? mixpanel.init(MixPanelToken, {
			//debug: process.env.NODE_ENV !== "production",
			protocol: "https",
	  })
	: null;

//                                      Explicitly disabled
const DisablePersistence = InTesting || process.env.DISABLE_PERSISTENCE === "TRUE";

import { SessionID, UserID } from "./IDTypes.js";
import { GridDraftState } from "./GridDraft.js";
import { DraftState } from "./DraftState.js";
import { RochesterDraftState } from "./RochesterDraft.js";
import { WinstonDraftState } from "./WinstonDraft.js";
import { Message } from "./Message.js";
import { IIndexable } from "./Types.js";
import { RotisserieDraftState } from "./RotisserieDraft.js";
import { DraftLog } from "./DraftLog";
import { WinchesterDraftState } from "./WinchesterDraft.js";
import { HousmanDraftState } from "./HousmanDraft.js";
import { SolomonDraftState } from "./SolomonDraft.js";
import { sendLog } from "./BotTrainingAPI.js";

const PersistenceLocalPath = process.env.PERSISTENCE_LOCAL_PATH;
const LocalPersitenceDirectory = "tmp";
const LocalConnectionsFile = path.join(PersistenceLocalPath ?? ".", LocalPersitenceDirectory, "/connections.json");
const LocalSessionsFile = path.join(PersistenceLocalPath ?? ".", LocalPersitenceDirectory, "/sessions.json");

const PersistenceStoreURL = process.env.PERSISTENCE_STORE_URL ?? (InTesting ? undefined : "http://localhost:3008");
const PersistenceKey = process.env.PERSISTENCE_KEY ?? "1234";

export let InactiveSessions: Record<SessionID, any> = {};
export let InactiveConnections: Record<UserID, ReturnType<typeof getPODConnection>> = {};

// Copy properties from source to target object, ignoring functions.
export function copyPODProps<T>(source: Partial<T>, target: T): T {
	for (const prop in source)
		if (source[prop] !== undefined && !(source[prop] instanceof Function)) target[prop] = source[prop]!;
	return target;
}

function restoreBot(bot: any): IBot | undefined {
	if (!bot) return undefined;

	if (bot.type == "SimpleBot") {
		const newBot = new SimpleBot(bot.name, bot.id);
		copyPODProps(bot, newBot);
		return newBot;
	} else if (bot.type == "mtgdraftbots") {
		const newBot = new Bot(bot.name, bot.id);
		copyPODProps(bot, newBot);
		return newBot;
	}
	console.error(`Error: Invalid bot type '${bot.type}'.`);
	return undefined;
}

async function requestSavedConnections() {
	const InactiveConnections: Record<UserID, ReturnType<typeof getPODConnection>> = {};

	const handleConnections = (connections: ReturnType<typeof getPODConnection>[]) => {
		if (connections && connections.length > 0) {
			for (const c of connections) InactiveConnections[c.userID] = c;
			console.log(`[+] Restored ${connections.length} saved connections.`);
		}
	};

	if (PersistenceLocalPath && fs.existsSync(LocalConnectionsFile)) {
		handleConnections(JSON.parse(fs.readFileSync(LocalConnectionsFile, "utf8")));
	}

	if (PersistenceStoreURL && Object.keys(InactiveConnections).length === 0) {
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
				handleConnections(response.data);
			}
		} catch (err: any) {
			console.error(
				"requestSavedConnections::",
				err.message,
				err.response?.statusText ?? "",
				err.response?.data ?? ""
			);
		}
	}

	return InactiveConnections;
}

async function requestSavedSessions() {
	const InactiveSessions: Record<SessionID, any> = {};

	const handleSessions = (sessions: any[]) => {
		if (sessions && sessions.length > 0) {
			for (const s of sessions) InactiveSessions[s.id] = s;
			console.log(`[+] Restored ${sessions.length} saved sessions.`);
		}
	};

	if (PersistenceLocalPath && fs.existsSync(path.join(PersistenceLocalPath, LocalSessionsFile))) {
		handleSessions(JSON.parse(fs.readFileSync(path.join(PersistenceLocalPath, LocalSessionsFile), "utf8")));
	}

	if (PersistenceStoreURL && Object.keys(InactiveSessions).length === 0) {
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
				handleSessions(response.data);
			}
		} catch (err: any) {
			console.error(
				"requestSavedSessions::",
				err.message,
				err.response?.statusText ?? "",
				err.response?.data ?? ""
			);
		}
	}

	return InactiveSessions;
}

export function restoreSession(s: any, owner: UserID) {
	const r = new Session(s.id, owner);
	for (const prop of Object.getOwnPropertyNames(s).filter((p) => !["draftState", "owner"].includes(p))) {
		(r as IIndexable)[prop] = s[prop];
	}

	if (s.draftState) {
		switch (s.draftState.type) {
			case "draft": {
				const draftState = new DraftState([], [], {
					pickedCardsPerRound: s.draftState.pickedCardsPerRound,
					burnedCardsPerRound: s.draftState.burnedCardsPerRound,
					doubleMastersMode: s.draftState.doubleMastersMode,
					botCount: 0,
					simpleBots: false,
				});
				copyPODProps(s.draftState, draftState);
				for (const userID in s.draftState.players) {
					const bot = restoreBot(s.draftState.players[userID].botInstance);
					if (!bot) {
						console.error(
							"restoreSession Error: Could not restore bot.",
							s.draftState.players[userID].botInstance
						);
						r.drafting = false;
						return r;
					}
					draftState.players[userID].botInstance = bot;
				}
				r.draftState = draftState;
				return r;
			}
			case "housman": {
				r.draftState = new HousmanDraftState([], []);
				copyPODProps(s.draftState, r.draftState);
				return r;
			}
			case "winston": {
				r.draftState = new WinstonDraftState([], []);
				copyPODProps(s.draftState, r.draftState);
				return r;
			}
			case "winchester": {
				r.draftState = new WinchesterDraftState([], []);
				copyPODProps(s.draftState, r.draftState);
				return r;
			}
			case "grid": {
				r.draftState = new GridDraftState([], []);
				copyPODProps(s.draftState, r.draftState);
				return r;
			}
			case "rochester": {
				r.draftState = new RochesterDraftState([], []);
				copyPODProps(s.draftState, r.draftState);
				return r;
			}
			case "rotisserie": {
				r.draftState = new RotisserieDraftState([], [], 0);
				copyPODProps(s.draftState, r.draftState);
				return r;
			}
			case "minesweeper": {
				r.draftState = MinesweeperDraftState.deserialize(s.draftState);
				if (!r.draftState) {
					console.error(
						`[Persistence::restoreSession] Error: Invalid minesweeper draft state.`,
						s.draftState
					);
					r.drafting = false;
				}
				return r;
			}
			case "teamSealed": {
				r.draftState = new TeamSealedState();
				copyPODProps(s.draftState, r.draftState);
				return r;
			}
			case "solomon": {
				r.draftState = SolomonDraftState.deserialize(s.draftState);
				if (!r.draftState) {
					console.error(`[Persistence::restoreSession] Error: Invalid solomon draft state.`, s.draftState);
					r.drafting = false;
				}
				return r;
			}
			default: {
				console.error(
					`[Persistence::restoreSession] Error: Unsupported draft state type "${s.draftState.type}".`
				);
				r.drafting = false;
			}
		}
	}

	return r;
}

export function getPoDSession(s: Session) {
	const PoDSession: Record<string, any> = {};

	for (const prop of Object.getOwnPropertyNames(s).filter(
		(p) => !["users", "draftState", "sendDecklogTimeout"].includes(p)
	)) {
		if (!((s as IIndexable)[prop] instanceof Function)) PoDSession[prop] = (s as IIndexable)[prop];
	}

	if (s.drafting) {
		// Flag every user as disconnected so they can reconnect later
		for (const userID of s.users) {
			if (Connections[userID]) PoDSession.disconnectedUsers[userID] = s.getDisconnectedUserData(userID);
		}

		if (s.draftState) {
			PoDSession.draftState = {};
			copyPODProps(s.draftState, PoDSession.draftState);

			if (s.draftState instanceof DraftState) {
				const players = {};
				copyPODProps(s.draftState.players, players);
				PoDSession.draftState.players = players;

				for (const userID in s.draftState.players) {
					const podBot: any = {};
					copyPODProps(s.draftState.players[userID].botInstance, podBot);
					if (podBot.fallbackBot) podBot.fallbackBot = undefined;
					PoDSession.draftState.players[userID].botInstance = podBot;
					PoDSession.draftState.players[userID].botPickInFlight = false;
					PoDSession.draftState.players[userID].countdownInterval = null;
				}
			}
		}
	}
	return PoDSession;
}

async function tempDump(exitOnCompletion = false) {
	// Avoid user interaction during saving
	// (Disconnecting the socket would be better, but explicitly
	// disconnecting socket prevents their automatic reconnection)
	if (exitOnCompletion) {
		for (const userID in Connections) {
			const msg = new Message("Server Restarting", "Please wait...");
			msg.showConfirmButton = false;
			msg.allowOutsideClick = false;
			msg.timer = 0;
			Connections[userID].socket.emit("message", msg);
		}
	}

	const Promises: Promise<unknown>[] = [];

	const PoDConnections: ReturnType<typeof getPODConnection>[] = [];
	for (const userID in Connections) PoDConnections.push(getPODConnection(Connections[userID]));

	const PoDSessions = [];
	for (const sessionID in InactiveSessions) {
		try {
			// Keep inactive Rotisserie Draft sessions across runs.
			if (InactiveSessions[sessionID].draftState?.type === "rotisserie")
				PoDSessions.push(InactiveSessions[sessionID]);
		} catch (e) {
			console.error(`Error while saving inactive session '${sessionID}'.`);
		}
	}

	for (const sessionID in Sessions) {
		try {
			PoDSessions.push(getPoDSession(Sessions[sessionID]));
		} catch (e) {
			console.error(`Error while saving session '${sessionID}'.`);
		}
	}

	if (PersistenceLocalPath) {
		try {
			console.log("Saving Connections and Sessions to disk...");
			if (!fs.existsSync(path.join(PersistenceLocalPath, LocalPersitenceDirectory)))
				fs.mkdirSync(path.join(PersistenceLocalPath, LocalPersitenceDirectory));
			Promises.push(
				fs.promises
					.writeFile(LocalConnectionsFile, JSON.stringify(PoDConnections))
					.catch((err) => console.log(err))
			);
			Promises.push(
				fs.promises.writeFile(LocalSessionsFile, JSON.stringify(PoDSessions)).catch((err) => console.log(err))
			);
		} catch (err) {
			console.log("Error: ", err);
		}
	}

	if (PersistenceStoreURL) {
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
	}

	console.log("  Waiting for all promises to return...");
	await Promise.all(Promises);
	console.log("  Connections and Sessions dumped.");

	if (exitOnCompletion) process.exit(0);
}

export function anonymizeDraftLog(log: DraftLog): DraftLog {
	const localLog = JSON.parse(JSON.stringify(log)) as DraftLog;
	const sha1 = crypto.createHash("sha1");
	const hash = sha1
		.update(
			Object.keys(localLog.users)
				.filter((uid) => !localLog.users[uid].isBot)
				.join("_")
				.toString()
		)
		.digest("hex");
	localLog.sessionID = parseInt(hash.slice(0, 10), 16).toString(32);
	let idx = 0;
	if (localLog.users)
		for (const uid in localLog.users)
			if (!localLog.users[uid].isBot) localLog.users[uid].userName = `Anonymous Player #${++idx}`;
	return localLog;
}

export function logSession(type: string, session: Session) {
	try {
		sendLog(type, session);
	} catch (err) {
		console.error("Error saving logs: ", err);
	}

	if (!MixInstance) return;
	const mixdata: Record<string, any> = {
		distinct_id: process.env.NODE_ENV || "development",
		playerCount: session.users.size,
		playersWithCollection: [...session.users].filter((uid) => Connections[uid]?.collection.size > 0).length,
		playersUsingCollection: [...session.users].filter(
			(uid) => Connections[uid]?.useCollection && Connections[uid]?.collection.size > 0
		).length,
	};
	for (const prop of [
		"managed",
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

// Dumps and reloads inactive sessions, ONLY for testing purposes.
export const simulateRestart = TestingOnly(async () => {
	await tempDump();
	clearConnections();
	clearSessions();
	await Promise.all([requestSavedConnections(), requestSavedSessions()]).then((values) => {
		InactiveConnections = values[0];
		InactiveSessions = values[1];
	});
});

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

	await Promise.all([requestSavedConnections(), requestSavedSessions()]).then((values) => {
		InactiveConnections = values[0];
		InactiveSessions = values[1];
	});
}

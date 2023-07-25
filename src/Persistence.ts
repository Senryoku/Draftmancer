"use strict";

import { InTesting, TestingOnly } from "./Context.js";
import { config as dotenvConfig } from "dotenv";
if (process.env.NODE_ENV !== "production") dotenvConfig();

import crypto from "crypto";
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

const PersistenceLocalPath = process.env.PERSISTENCE_LOCAL_PATH ?? ".";
const LocalPersitenceDirectory = "tmp";
const LocalConnectionsFile = path.join(PersistenceLocalPath, LocalPersitenceDirectory, "/connections.json");
const LocalSessionsFile = path.join(PersistenceLocalPath, LocalPersitenceDirectory, "/sessions.json");

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

function loadSavedConnections() {
	const InactiveConnections: Record<UserID, ReturnType<typeof getPODConnection>> = {};

	if (fs.existsSync(LocalConnectionsFile)) {
		const connections = JSON.parse(fs.readFileSync(LocalConnectionsFile, "utf8"));
		if (connections && connections.length > 0) {
			for (const c of connections) InactiveConnections[c.userID] = c;
			console.log(`[+] Restored ${connections.length} saved connections.`);
		}
	}

	return InactiveConnections;
}

function loadSavedSessions() {
	const InactiveSessions: Record<SessionID, any> = {};

	if (fs.existsSync(LocalSessionsFile)) {
		const sessions = JSON.parse(fs.readFileSync(LocalSessionsFile, "utf8"));
		if (sessions && sessions.length > 0) {
			for (const s of sessions) InactiveSessions[s.id] = s;
			console.log(`[+] Restored ${sessions.length} saved sessions.`);
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
		PoDSession.disconnectedUsers = structuredClone(s.disconnectedUsers); // Avoid modifying the original
		// Flag every user as disconnected so they can reconnect later
		for (const userID of s.users)
			if (Connections[userID]) PoDSession.disconnectedUsers[userID] = s.getDisconnectedUserData(userID);

		if (s.draftState) {
			PoDSession.draftState = {};
			copyPODProps(s.draftState, PoDSession.draftState);

			if (s.draftState instanceof DraftState) {
				PoDSession.draftState.pendingTimeout = null;
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

function dumpToDisk(exitOnCompletion = false) {
	// Avoid user interaction during saving
	// (Disconnecting the socket would be better, but explicitly
	// disconnecting socket prevents their automatic reconnection)
	if (exitOnCompletion) {
		const msg = new Message("Server Restarting", "Please wait...");
		msg.showConfirmButton = false;
		msg.allowOutsideClick = false;
		msg.timer = 0;
		for (const userID in Connections) Connections[userID].socket.emit("message", msg);
	}

	if (!fs.existsSync(path.join(PersistenceLocalPath, LocalPersitenceDirectory)))
		fs.mkdirSync(path.join(PersistenceLocalPath, LocalPersitenceDirectory), { recursive: true });

	{
		console.log(`Saving ${Object.keys(Connections).length} Connections to disk (${LocalConnectionsFile})...`);
		const connectionsFile = fs.openSync(LocalConnectionsFile, "w");
		fs.writeSync(connectionsFile, "[\n");
		let firstConnection = true;
		for (const userID in Connections) {
			if (!firstConnection) fs.writeSync(connectionsFile, ",\n");
			else firstConnection = false;
			fs.writeSync(connectionsFile, JSON.stringify(getPODConnection(Connections[userID])));
		}
		fs.writeSync(connectionsFile, "\n]\n");
		fs.closeSync(connectionsFile);
		console.log("  [+] Connections successfully saved to disk.");
	}
	{
		console.log(`Saving ${Object.keys(Sessions).length} Sessions to disk (${LocalSessionsFile})...`);
		const sessionsFile = fs.openSync(LocalSessionsFile, "w");
		fs.writeSync(sessionsFile, "[\n");
		let firstSession = true;
		// Keep inactive Rotisserie sessions alive, as they can be ran asynchronously over a longer period
		for (const sessionID in InactiveSessions) {
			if (InactiveSessions[sessionID].draftState?.type === "rotisserie") {
				if (!firstSession) fs.writeSync(sessionsFile, ",\n");
				else firstSession = false;
				fs.writeSync(sessionsFile, JSON.stringify(InactiveSessions[sessionID]));
			}
		}
		for (const sessionID in Sessions) {
			try {
				const serialized = JSON.stringify(getPoDSession(Sessions[sessionID]));
				if (!firstSession) fs.writeSync(sessionsFile, ",\n");
				else firstSession = false;
				fs.writeSync(sessionsFile, serialized);
			} catch (e) {
				console.error(`Error while saving session '${sessionID}': `, e);
			}
		}
		fs.writeSync(sessionsFile, "\n]\n");
		fs.closeSync(sessionsFile);
		console.log("  [+] Sessions successfully saved to disk.");
	}
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
export const simulateRestart = TestingOnly(() => {
	dumpToDisk();
	clearConnections();
	clearSessions();
	InactiveConnections = loadSavedConnections();
	InactiveSessions = loadSavedSessions();
});

if (!DisablePersistence) {
	// Can make asynchronous calls, is not called on process.exit() or uncaught exceptions.
	// See https://nodejs.org/api/process.html#process_event_beforeexit
	process.on("beforeExit", () => {
		console.log("beforeExit callback.");
	});

	// Only synchronous calls, called on process.exit()
	// See https://nodejs.org/api/process.html#process_event_exit
	process.on("exit", (code) => {
		console.log(`exit callback: Process exited with code: ${code}`);
	});

	process.on("SIGTERM", () => {
		console.log("Received SIGTERM.");
		// Gives dumpToDisk 30sec. to finish saving everything.
		setTimeout(() => {
			console.error("[-] dumpToDisk did not finish in time after SIGTERM, force quitting...");
			process.exit(0);
		}, 30000);
		dumpToDisk(true);
	});

	process.on("SIGINT", () => {
		console.log("Received SIGINT.");
		// Gives dumpToDisk 30sec. to finish saving everything.
		setTimeout(() => {
			console.error("[-] dumpToDisk did not finish in time after SIGINT, force quitting...");
			process.exit(0);
		}, 30000);
		dumpToDisk(true);
	});

	process.on("uncaughtException", (err) => {
		console.error("Uncaught Exception thrown: ");
		console.error(err);
		// Gives dumpToDisk 30sec. to finish saving everything.
		setTimeout(() => {
			console.error("[-] dumpToDisk did not finish in time after Uncaught Exception, force quitting...");
			process.exit(1);
		}, 30000);
		dumpToDisk(true);
	});

	InactiveConnections = loadSavedConnections();
	InactiveSessions = loadSavedSessions();
}

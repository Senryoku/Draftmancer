"use strict";

import dotenv from "dotenv";
if (process.env.NODE_ENV !== "production") {
	dotenv.config();
}
import crypto from "crypto";
import axios from "axios";
import fs from "fs";
import path from "path";
import { Connections } from "./Connection.js";
import { Session, Sessions } from "./Session.js";
import { TeamSealedState } from "./TeamSealed.js";
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

import { SessionID, UserID } from "./IDTypes.js";
import { getCard } from "./Cards.js";
import { GridDraftState } from "./GridDraft.js";
import { DraftState } from "./DraftState.js";
import { RochesterDraftState } from "./RochesterDraft.js";
import { WinstonDraftState } from "./WinstonDraft.js";
import { Message } from "./Message.js";
import { IIndexable } from "./Types.js";
import { RotisserieDraftState } from "./RotisserieDraft.js";
import { DraftLog, DraftPick } from "./DraftLog";
import { WinchesterDraftState } from "./WinchesterDraft.js";
import { HousmanDraftState } from "./HousmanDraft.js";
import { SolomonDraftState } from "./SolomonDraft.js";

const PersistenceLocalPath = process.env.PERSISTENCE_LOCAL_PATH;
const LocalPersitenceDirectory = "tmp";
const LocalConnectionsFile = path.join(PersistenceLocalPath ?? ".", LocalPersitenceDirectory, "/connections.json");
const LocalSessionsFile = path.join(PersistenceLocalPath ?? ".", LocalPersitenceDirectory, "/sessions.json");

const PersistenceStoreURL = process.env.PERSISTENCE_STORE_URL ?? "http://localhost:3008";
const PersistenceKey = process.env.PERSISTENCE_KEY ?? "1234";

const MTGDraftbotsLogEndpoint =
	process.env.MTGDRAFTBOTS_ENDPOINT ?? "https://staging.cubeartisan.net/integrations/draftlog";
const MTGDraftbotsAPIKey = process.env.MTGDRAFTBOTS_APIKEY;

export let InactiveSessions: Record<SessionID, any> = {};
export let InactiveConnections: Record<SessionID, Record<string, any>> = {};

function copyProps(obj: any, target: any) {
	for (const prop of Object.getOwnPropertyNames(obj)) if (!(obj[prop] instanceof Function)) target[prop] = obj[prop];
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
	const InactiveConnections: Record<SessionID, Record<string, any>> = {};

	const handleConnections = (connections: any[]) => {
		if (connections && connections.length > 0) {
			for (const c of connections) {
				InactiveConnections[c.userID] = c;
				if (InactiveConnections[c.userID].bot)
					InactiveConnections[c.userID].bot = restoreBot(InactiveConnections[c.userID].bot);
			}
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
				const draftState = new DraftState([], [], { botCount: 0, simpleBots: false });
				copyProps(s.draftState, draftState);
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
				copyProps(s.draftState, r.draftState);
				return r;
			}
			case "winston": {
				r.draftState = new WinstonDraftState([], []);
				copyProps(s.draftState, r.draftState);
				return r;
			}
			case "winchester": {
				r.draftState = new WinchesterDraftState([], []);
				copyProps(s.draftState, r.draftState);
				return r;
			}
			case "grid": {
				r.draftState = new GridDraftState([], []);
				copyProps(s.draftState, r.draftState);
				return r;
			}
			case "rochester": {
				r.draftState = new RochesterDraftState([], []);
				copyProps(s.draftState, r.draftState);
				return r;
			}
			case "rotisserie": {
				r.draftState = new RotisserieDraftState([], [], 0);
				copyProps(s.draftState, r.draftState);
				return r;
			}
			case "minesweeper": {
				r.draftState = new MinesweeperDraftState([], [], 0, 0, 0);
				copyProps(s.draftState, r.draftState);
				return r;
			}
			case "teamSealed": {
				r.draftState = new TeamSealedState();
				copyProps(s.draftState, r.draftState);
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
		(p) => !["users", "countdownInterval", "draftState"].includes(p)
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
			copyProps(s.draftState, PoDSession.draftState);

			if (s.draftState instanceof DraftState) {
				const players = {};
				copyProps(s.draftState.players, players);
				PoDSession.draftState.players = players;

				for (const userID in s.draftState.players) {
					const podBot = {};
					copyProps(s.draftState.players[userID].botInstance, podBot);
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

	const Promises: Promise<any>[] = [];

	const PoDConnections = [];
	for (const userID in Connections) {
		const c = Connections[userID];
		const PoDConnection: any = {};

		for (const prop of Object.getOwnPropertyNames(c).filter((p) => !["socket", "bot"].includes(p))) {
			if (!((c as IIndexable)[prop] instanceof Function)) PoDConnection[prop] = (c as IIndexable)[prop];
		}
		PoDConnections.push(PoDConnection);
	}

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

type MTGDraftbotsLogEntry = {
	pack: string[];
	picks: number[];
	trash: number[];
	packNum: number;
	numPacks: number;
	pickNum: number;
	numPicks: number;
};

type MTGDraftbotsLog = {
	players: MTGDraftbotsLogEntry[][];
	apiKey: string;
};

function anonymizeDraftLog(log: DraftLog): DraftLog {
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

function saveLog(type: string, session: Session) {
	if (session.draftLog) {
		const localLog = anonymizeDraftLog(session.draftLog);

		// Send log to MTGDraftbots endpoint
		if (MTGDraftbotsAPIKey && type === "Draft" && !session.customCardList?.customCards) {
			const data: MTGDraftbotsLog = {
				players: [],
				apiKey: MTGDraftbotsAPIKey,
			};
			for (const uid in localLog.users) {
				const u = localLog.users[uid];
				if (!u.isBot && u.picks.length > 0) {
					const player: MTGDraftbotsLogEntry[] = [];
					let packNum = 0;
					let pickNum = 0;
					let lastPackSize = (u.picks[0] as DraftPick).booster.length + 1;
					let lastPackPicks = 0;
					for (const pick of u.picks) {
						const p = pick as DraftPick;
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
							pack: p.booster.map((cid: string) => getCard(cid).oracle_id),
							picks: p.pick,
							trash: p.burn ?? [],
							packNum: packNum,
							numPacks: -1,
							pickNum: pickNum,
							numPicks: -1,
						});
						pickNum += p.pick.length;
						++lastPackPicks;
					}
					// Patch each pick with the correct numPacks and the last pack with the correct numPicks
					for (const p of player) {
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
	const mixdata: Record<string, any> = {
		distinct_id: process.env.NODE_ENV || "development",
		playerCount: session.users.size,
		playersWithCollection: [...session.users].filter((uid) => Connections[uid]?.collection.size > 0).length,
		playersUsingCollection: [...session.users].filter(
			(uid) => Connections[uid]?.useCollection && Connections[uid]?.collection.size > 0
		).length,
	};
	for (const prop of [
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

	Promise.all([requestSavedConnections(), requestSavedSessions()]).then((values) => {
		InactiveConnections = values[0];
		InactiveSessions = values[1];
	});
}

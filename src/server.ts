"use strict";

import dotenv from "dotenv";
if (process.env.NODE_ENV !== "production") {
	dotenv.config();
}

const port = process.env.PORT || 3000;
import fs from "fs";
import request from "request";
import compression from "compression";
import express from "express";
import http from "http";
import { Server, Socket } from "socket.io";
import cookieParser from "cookie-parser";
import uuid from "uuid";

import { Options, shuffleArray } from "./utils.js";
import { ackError, MessageWarning, SocketAck, SocketError } from "./Message.js";
import constants from "./data/constants.json";
import { InactiveConnections, InactiveSessions, dumpError, restoreSession, getPoDSession } from "./Persistence.js";
import { Connection, Connections } from "./Connection.js";
import {
	Session,
	Sessions,
	SessionsSettingsProps,
	DistributionMode,
	DraftLogRecipients,
	IIndexable,
} from "./Session.js";
import { Cards, MTGACards, getUnique, CardPool, DeckList, CardID, Card, UniqueCardID } from "./Cards.js";
import { parseLine, parseCardList, XMageToArena } from "./parseCardList.js";
import { SessionID, UserID } from "./IDTypes.js";
import { CustomCardList } from "./CustomCardList.js";
import { DraftLog } from "./DraftLog.js";
import { isBoolean, isNumber, isObject, isString } from "./TypeChecks.js";
import { instanceOfTurnBased, TurnBased } from "./IDraftState.js";

const app = express();
const httpServer = new http.Server(app);
const io = new Server(httpServer);

app.use(compression());
app.use(cookieParser());
app.use(express.json());
app.use(express.text({ type: "text/*" }));

function shortguid() {
	function s4() {
		return Math.floor((1 + Math.random()) * 0x10000)
			.toString(16)
			.substring(1);
	}
	return s4() + s4() + s4();
}

function getPublicSessionData(s: Session) {
	return {
		id: s.id,
		description: s.description,
		players: s.users.size,
		maxPlayers: s.maxPlayers,
		cube: s.useCustomCardList,
		sets: s.setRestriction,
	};
}

function getPublicSessions() {
	return Object.values(Sessions)
		.filter((s) => s.isPublic && !s.drafting)
		.map((s) => getPublicSessionData(s));
}

function updatePublicSession(sid: SessionID) {
	const s = Sessions[sid];
	if (!s || !s.isPublic || s.drafting) {
		io.emit("updatePublicSession", { id: sid, isPrivate: true });
	} else {
		io.emit("updatePublicSession", getPublicSessionData(s));
	}
}

// Set session to private once a draft is started and broadcast the new status.
function startPublicSession(s: Session) {
	if (s.isPublic) {
		s.isPublic = false;
		updatePublicSession(s.id);
	}
}

// Prepare local custom card lists
const ParsedCubeLists: { [name: string]: any } = {};
for (let cube of constants.CubeLists) {
	if (cube.filename) {
		ParsedCubeLists[cube.name] = parseCardList(fs.readFileSync(`./data/cubes/${cube.filename}`, "utf8"), {
			name: cube.name,
		});
		if (ParsedCubeLists[cube.name].error) {
			console.error("An error occured while parsing local cube ", cube);
			console.error(ParsedCubeLists[cube.name].error);
		}
	}
}

/////////////////////////////////////////////////////////////////
// Setup all websocket responses on client connection

const useCustomCardList = function (session: Session, list: CustomCardList) {
	session.setCustomCardList(list);
	if (session.isPublic) updatePublicSession(session.id);
};

const parseCustomCardList = function (
	session: Session,
	txtlist: string,
	options: Options,
	ack: (result: SocketAck) => void
) {
	let parsedList = null;
	try {
		parsedList = parseCardList(txtlist, options);
	} catch (e) {
		console.error(e);
		ack?.(new SocketError("Internal server error"));
		return;
	}

	if (parsedList.error) {
		ack?.(parsedList);
		return;
	}

	useCustomCardList(session, parsedList);

	ack?.(new SocketAck());
};

const checkDraftAction = function (userID: UserID, sess: Session, type: string, ack?: (result: SocketAck) => void) {
	if (!sess.drafting || sess.draftState?.type !== type) {
		ack?.(new SocketError("Not drafting."));
		return false;
	}
	if (instanceOfTurnBased(sess.draftState) && userID !== (sess.draftState as TurnBased).currentPlayer()) {
		ack?.(new SocketError("Not your turn."));
		return false;
	}
	return true;
};

type SocketSessionCallback = (userID: UserID, sessionID: SessionID, ...args: any) => void;

const socketCallbacks: { [name: string]: SocketSessionCallback } = {
	// Personnal options
	setUserName(userID: UserID, sessionID: SessionID, userName: string) {
		Connections[userID].userName = userName;
		Sessions[sessionID].forUsers((uid: UserID) =>
			Connections[uid]?.socket.emit("updateUser", {
				userID: userID,
				updatedProperties: {
					userName: userName,
				},
			})
		);
	},
	setCollection(
		userID: UserID,
		sessionID: SessionID,
		collection: { [aid: string]: number },
		ack?: (response: SocketAck | { collection: CardPool }) => void
	) {
		if (!isObject(collection) || collection === null) return;

		let processedCollection: CardPool = new Map();
		// Remove unknown cards immediatly.
		for (let aid in collection) {
			if (aid in MTGACards) {
				processedCollection.set(MTGACards[aid].id, collection[aid]);
			}
		}

		Connections[userID].collection = processedCollection;

		ack?.({ collection: processedCollection });

		const hasCollection = processedCollection.size > 0;
		Sessions[sessionID].forUsers((user) =>
			Connections[user]?.socket.emit("updateUser", {
				userID: userID,
				updatedProperties: {
					collection: hasCollection,
				},
			})
		);
	},
	// Parse a card list and uses it as collection
	parseCollection(userID: UserID, sessionID: SessionID, txtcollection: string, ack: Function) {
		let cardList = parseCardList(txtcollection, { fallbackToCardName: true });
		if (cardList.error) {
			ack?.(cardList);
			return;
		}

		let collection: CardPool = new Map();
		let ret: any = new SocketAck();
		for (let cardID of cardList.cards as Array<CardID>) {
			let aid = Cards[cardID].arena_id;
			if (!aid) {
				if (ret.warning?.ignoredCards > 0) {
					++ret.ignoredCards;
				} else {
					ret.warning = new MessageWarning(
						"Non-MTGA card(s) ignored.",
						`${Cards[cardID].name} (${Cards[cardID].set}) is not a valid MTGA card and has been ignored.`
					);
					ret.ignoredCards = 1;
				}
				continue;
			}
			if (collection.has(aid)) collection.set(aid, (collection.get(aid) as number) + 1);
			else collection.set(aid, 1);
		}
		if (ret.ignoredCards > 1) {
			ret.text += ` (${ret.ignoredCards} cards ignored in total.)`;
		}

		ret.collection = Object.fromEntries(collection);
		ack?.(ret);
	},
	useCollection(userID: UserID, sessionID: SessionID, useCollection: boolean) {
		if (!isBoolean(useCollection) || useCollection === Connections[userID].useCollection) return;

		Connections[userID].useCollection = useCollection;
		Sessions[sessionID].forUsers((user) =>
			Connections[user]?.socket.emit("updateUser", {
				userID: userID,
				updatedProperties: {
					useCollection: useCollection,
				},
			})
		);
	},
	chatMessage(userID: UserID, sessionID: SessionID, message: { author: string; text: string; timestamp: number }) {
		if (!isObject(message) || !isString(message.author) || !isString(message.text) || !isNumber(message.timestamp))
			return;
		message.text = message.text.substring(0, Math.min(255, message.text.length)); // Limits chat message length
		Sessions[sessionID].forUsers((user) => Connections[user]?.socket.emit("chatMessage", message));
	},
	setReady(userID: UserID, sessionID: SessionID, readyState: boolean) {
		if (!isString(readyState)) return;
		Sessions[sessionID].forUsers((user) => Connections[user]?.socket.emit("setReady", userID, readyState));
	},
	async pickCard(
		userID: UserID,
		sessionID: SessionID,
		data: { pickedCards: Array<number>; burnedCards: Array<number> },
		ack: (result: SocketAck) => void
	) {
		// Removes picked card from corresponding booster and notify other players.
		// Moves to next round when each player have picked a card.
		try {
			const r = await Sessions[sessionID].pickCard(userID, data.pickedCards, data.burnedCards);
			ack?.(r);
		} catch (err) {
			ack?.(new SocketError("Internal server error."));
			console.error("Error in pickCard:", err);
			const data: any = {
				draftState: Sessions[sessionID].draftState,
				sessionProps: {},
			};
			for (let p of Object.keys(SessionsSettingsProps))
				data.sessionProps[p] = (Sessions[sessionID] as IIndexable)[p];
			dumpError(`Error_PickCard_${sessionID}_${new Date().toISOString()}`, data);
		}
	},
	gridDraftPick(userID: UserID, sessionID: SessionID, choice: number, ack: (result: SocketAck) => void) {
		if (!checkDraftAction(userID, Sessions[sessionID], "grid", ack)) return;

		const r = Sessions[sessionID].gridDraftPick(choice);

		if (!r) ack?.(new SocketError("Internal error."));
		else ack?.(new SocketAck());
	},
	rochesterDraftPick(userID: UserID, sessionID: SessionID, choices: Array<number>, ack: (result: SocketAck) => void) {
		if (!checkDraftAction(userID, Sessions[sessionID], "rochester", ack)) return;

		const r = Sessions[sessionID].rochesterDraftPick(choices[0]);

		if (!r) ack?.(new SocketError("Internal error."));
		else ack?.(new SocketAck());
	},
	// Winston Draft
	winstonDraftTakePile(userID: UserID, sessionID: SessionID, ack: (result: SocketAck) => void) {
		if (!checkDraftAction(userID, Sessions[sessionID], "winston", ack)) return;

		const r = Sessions[sessionID].winstonTakePile();

		if (!r) ack?.(new SocketError("Internal error."));
		else ack?.(new SocketAck());
	},
	winstonDraftSkipPile(userID: UserID, sessionID: SessionID, ack: (result: SocketAck) => void) {
		if (!checkDraftAction(userID, Sessions[sessionID], "winston", ack)) return;

		const r = Sessions[sessionID].winstonSkipPile();
		ack?.(r);
	},
	minesweeperDraftPick(
		userID: UserID,
		sessionID: SessionID,
		row: number,
		col: number,
		ack: (result: SocketAck) => void
	) {
		if (!checkDraftAction(userID, Sessions[sessionID], "minesweeper", ack)) return;

		const r = Sessions[sessionID].minesweeperDraftPick(userID, row, col);

		ack?.(r);
	},
	shareDecklist(userID: UserID, sessionID: SessionID, decklist: DeckList) {
		Sessions[sessionID].shareDecklist(userID, decklist);
	},
	updateBracket(userID: UserID, sessionID: SessionID, results: Array<[number, number]>) {
		if (Sessions[sessionID].owner !== userID && Sessions[sessionID].bracketLocked) return;
		Sessions[sessionID].updateBracket(results);
	},
	moveCard(userID: UserID, sessionID: SessionID, uniqueID: UniqueCardID, destStr: string) {
		if (!["main", "side"].includes(destStr)) return;
		if (!Connections[userID]?.pickedCards) return;

		let dest, source;
		if (destStr === "main") {
			dest = Connections[userID].pickedCards.main;
			source = Connections[userID].pickedCards.side;
		} else if (destStr === "side") {
			dest = Connections[userID].pickedCards.side;
			source = Connections[userID].pickedCards.main;
		} else return;

		const index = source.findIndex((c) => c.uniqueID === uniqueID);
		if (index !== -1) {
			const card = source.splice(index, 1)[0];
			dest.push(card);
			Sessions[sessionID].onCardMoved(userID, uniqueID, destStr);
		}
	},
};

// Socket callback available only to session owners
const ownerSocketCallbacks: { [key: string]: SocketSessionCallback } = {
	setOwnerIsPlayer(userID: UserID, sessionID: SessionID, val: boolean) {
		if (!SessionsSettingsProps.ownerIsPlayer(val)) return;
		const sess = Sessions[sessionID];
		if (sess.drafting) return;

		if (val) {
			sess.ownerIsPlayer = true;
			sess.addUser(userID);
		} else {
			sess.ownerIsPlayer = false;
			sess.users.delete(userID);
			sess.notifyUserChange();
		}
		for (let user of sess.users)
			if (user != userID) Connections[user]?.socket.emit("sessionOptions", { ownerIsPlayer: sess.ownerIsPlayer });
	},
	readyCheck(userID: UserID, sessionID: SessionID, ack: (result: SocketAck) => void) {
		const sess = Sessions[sessionID];
		if (sess.drafting) {
			ack?.(new SocketError("Already drafting."));
			return;
		}

		for (let user of sess.users) if (user !== userID) Connections[user]?.socket.emit("readyCheck");
		ack?.(new SocketAck());
	},
	startDraft(userID: UserID, sessionID: SessionID) {
		const sess = Sessions[sessionID];
		if (sess.drafting) return;

		if (sess.teamDraft && sess.users.size !== 6) {
			const verb = sess.users.size < 6 ? "add" : "remove";
			Connections[userID].socket.emit("message", {
				title: `Wrong player count`,
				text: `Team draft requires exactly 6 players. Please ${verb} players or disable Team Draft under Settings. Bots are not supported!`,
			});
		} else if (sess.users.size === 0 || sess.users.size + sess.bots < 2) {
			Connections[userID].socket.emit("message", {
				title: `Not enough players`,
				text: `Can't start draft: Not enough players (min. 2 including bots).`,
			});
		} else {
			sess.startDraft();
			startPublicSession(sess);
		}
	},
	stopDraft(userID: UserID, sessionID: SessionID) {
		Sessions[sessionID].stopDraft();
	},
	pauseDraft(userID: UserID, sessionID: SessionID) {
		Sessions[sessionID].pauseDraft();
	},
	resumeDraft(userID: UserID, sessionID: SessionID) {
		Sessions[sessionID].resumeDraft();
	},
	startGridDraft(userID: UserID, sessionID: SessionID, boosterCount: number) {
		const sess = Sessions[sessionID];
		if (sess.drafting) return;
		if (sess.users.size == 2) {
			if (typeof boosterCount !== "number") boosterCount = parseInt(boosterCount);
			sess.startGridDraft(boosterCount && !isNaN(boosterCount) ? boosterCount : 18);
			startPublicSession(sess);
		} else {
			Connections[userID].socket.emit("message", {
				title: `2 Players Only`,
				text: `Grid Draft can only be played with exactly 2 players. Bots are not supported!`,
			});
		}
	},
	startRochesterDraft(userID: UserID, sessionID: SessionID) {
		const sess = Sessions[sessionID];
		if (!sess || sess.owner != userID || sess.drafting) return;

		if (sess.users.size < 2) {
			Connections[userID].socket.emit("message", {
				title: `Not enough players`,
				text: `Rochester Draft can only be played with at least 2 players. Bots are not supported!`,
			});
		} else {
			sess.startRochesterDraft();
			startPublicSession(sess);
		}
	},
	startWinstonDraft(userID: UserID, sessionID: SessionID, boosterCount: number) {
		const sess = Sessions[sessionID];
		if (!sess || sess.owner != userID || sess.drafting) return;
		if (sess.users.size == 2) {
			if (typeof boosterCount !== "number") boosterCount = parseInt(boosterCount);
			sess.startWinstonDraft(boosterCount ? boosterCount : 6);
			startPublicSession(sess);
		} else {
			Connections[userID].socket.emit("message", {
				title: `2 Players Only`,
				text: `Winston Draft can only be played with exactly 2 players. Bots are not supported!`,
			});
		}
	},
	startMinesweeperDraft(
		userID: UserID,
		sessionID: SessionID,
		gridCount: number,
		gridWidth: number,
		gridHeight: number,
		picksPerGrid: number,
		revealBorders: boolean,
		ack: (result: SocketAck) => void
	) {
		const sess = Sessions[sessionID];
		if (typeof gridCount !== "number") gridCount = parseInt(gridCount);
		if (typeof gridWidth !== "number") gridWidth = parseInt(gridWidth);
		if (typeof gridHeight !== "number") gridHeight = parseInt(gridHeight);
		if (typeof picksPerGrid !== "number") picksPerGrid = parseInt(picksPerGrid);
		if (
			typeof gridCount !== "number" ||
			gridCount <= 0 ||
			typeof gridWidth !== "number" ||
			gridWidth <= 0 ||
			typeof gridHeight !== "number" ||
			gridHeight <= 0 ||
			typeof picksPerGrid !== "number" ||
			picksPerGrid <= 0 ||
			picksPerGrid > gridWidth * gridHeight
		) {
			ack?.(
				new SocketError(
					`Invalid parameters`,
					`Grid parameters are invalid. Please check your settings.`,
					`Values: gridCount: ${gridCount}, gridWidth: ${gridWidth}, gridHeight: ${gridHeight}, picksPerGrid: ${picksPerGrid}`
				)
			);
			return;
		}
		const ret = sess.startMinesweeperDraft(gridCount, gridWidth, gridHeight, picksPerGrid, {
			revealBorders: revealBorders,
		});
		if (ret?.error) {
			ack?.(ret);
			return;
		}
		startPublicSession(sess);
		ack?.(new SocketAck());
	},
	// Session Settings
	setSessionOwner(userID: UserID, sessionID: SessionID, newOwnerID: UserID) {
		const sess = Sessions[sessionID];
		if (newOwnerID === sess.owner || !sess.users.has(newOwnerID)) return;

		if (!sess.ownerIsPlayer) {
			// Prevent changing owner during drafting if owner is not playing
			if (sess.drafting) return;

			sess.users.delete(newOwnerID);
			sess.owner = newOwnerID;
			sess.addUser(userID);
		} else {
			sess.owner = newOwnerID;
		}
		sess.forUsers((user) =>
			Connections[user]?.socket.emit(
				"sessionOwner",
				sess.owner,
				sess.owner in Connections ? Connections[sess.owner].userName : null
			)
		);
	},
	removePlayer(userID: UserID, sessionID: SessionID, userToRemove: UserID) {
		if (userToRemove === Sessions[sessionID].owner || !Sessions[sessionID].users.has(userToRemove)) return;

		removeUserFromSession(userToRemove);
		Sessions[sessionID].replaceDisconnectedPlayers();
		Sessions[sessionID].notifyUserChange();

		const newSession = shortguid();
		joinSession(newSession, userToRemove);
		Connections[userToRemove].socket.emit("setSession", newSession);
		Connections[userToRemove].socket.emit("message", {
			title: "Removed from session",
			text: `You've been removed from session '${sessionID}' by its owner.`,
		});
	},
	setSeating(userID: UserID, sessionID: SessionID, seating: Array<UserID>) {
		if (!Sessions[sessionID].setSeating(seating)) Sessions[sessionID].notifyUserChange(); // Something unexpected happened, notify to avoid any potential de-sync.
	},
	boostersPerPlayer(userID: UserID, sessionID: SessionID, boostersPerPlayer: number) {
		if (!SessionsSettingsProps.boostersPerPlayer(boostersPerPlayer)) return;

		if (boostersPerPlayer === Sessions[sessionID].boostersPerPlayer) return;

		Sessions[sessionID].setBoostersPerPlayer(boostersPerPlayer, userID);
	},
	cardsPerBooster(userID: UserID, sessionID: SessionID, cardsPerBooster: number) {
		if (!SessionsSettingsProps.cardsPerBooster(cardsPerBooster)) return;

		if (cardsPerBooster === Sessions[sessionID].cardsPerBooster) return;

		Sessions[sessionID].setCardsPerBooster(cardsPerBooster, userID);
	},
	teamDraft(userID: UserID, sessionID: SessionID, teamDraft: boolean) {
		if (!(typeof teamDraft === "boolean")) teamDraft = teamDraft === "true" || !!teamDraft;
		if (!SessionsSettingsProps.teamDraft(teamDraft)) return;

		if (teamDraft === Sessions[sessionID].teamDraft) return;

		Sessions[sessionID].setTeamDraft(teamDraft);
	},
	setRandomizeSeatingOrder(userID: UserID, sessionID: SessionID, randomizeSeatingOrder: boolean) {
		if (!(typeof randomizeSeatingOrder === "boolean"))
			randomizeSeatingOrder = randomizeSeatingOrder === "true" || !!randomizeSeatingOrder;
		if (!SessionsSettingsProps.randomizeSeatingOrder(randomizeSeatingOrder)) return;

		if (randomizeSeatingOrder === Sessions[sessionID].randomizeSeatingOrder) return;

		Sessions[sessionID].setRandomizeSeatingOrder(randomizeSeatingOrder);
	},
	setDisableBotSuggestions(userID: UserID, sessionID: SessionID, disableBotSuggestions: boolean) {
		if (!(typeof disableBotSuggestions === "boolean"))
			disableBotSuggestions = disableBotSuggestions === "true" || !!disableBotSuggestions;
		if (!SessionsSettingsProps.disableBotSuggestions(disableBotSuggestions)) return;

		if (disableBotSuggestions === Sessions[sessionID].disableBotSuggestions) return;

		Sessions[sessionID].setDisableBotSuggestions(disableBotSuggestions);
	},
	setDistributionMode(userID: UserID, sessionID: SessionID, distributionMode: DistributionMode) {
		if (!SessionsSettingsProps.distributionMode(distributionMode)) return;

		Sessions[sessionID].distributionMode = distributionMode;
		for (let user of Sessions[sessionID].users) {
			if (user !== userID)
				Connections[user].socket.emit("sessionOptions", { distributionMode: distributionMode });
		}
	},
	setCustomBoosters(userID: UserID, sessionID: SessionID, customBoosters: Array<string>) {
		if (!SessionsSettingsProps.customBoosters(customBoosters)) return;

		Sessions[sessionID].customBoosters = customBoosters;
		for (let user of Sessions[sessionID].users) {
			if (user !== userID) Connections[user].socket.emit("sessionOptions", { customBoosters: customBoosters });
		}
	},
	bots(userID: UserID, sessionID: SessionID, bots: number) {
		if (!SessionsSettingsProps.bots(bots)) return;

		if (bots == Sessions[sessionID].bots) return;

		Sessions[sessionID].bots = bots;
		for (let user of Sessions[sessionID].users) {
			if (user !== userID) Connections[user].socket.emit("bots", bots);
		}
	},
	setRestriction(userID: UserID, sessionID: SessionID, setRestriction: Array<string>) {
		if (!SessionsSettingsProps.setRestriction(setRestriction)) return;

		Sessions[sessionID].setRestriction = setRestriction;
		for (let user of Sessions[sessionID].users) {
			if (user !== userID) Connections[user].socket.emit("setRestriction", setRestriction);
		}
		if (Sessions[sessionID].isPublic) updatePublicSession(sessionID);
	},
	parseCustomCardList(
		userID: UserID,
		sessionID: SessionID,
		customCardList: string,
		ack: (result: SocketAck) => void
	) {
		if (!customCardList) {
			ack?.(new SocketError("No list supplied."));
			return;
		}
		parseCustomCardList(Sessions[sessionID], customCardList, {}, ack);
	},
	importCube(userID: UserID, sessionID: SessionID, data: any, ack: (result: SocketAck) => void) {
		if (!["Cube Cobra", "CubeArtisan"].includes(data.service)) {
			ack?.(new SocketError(`Invalid cube service ('${data.service}').`));
			return;
		}
		// Cube Infos from Cube Cobra: https://cubecobra.com/cube/api/cubeJSON/${data.cubeID} ; Cards are listed in the cards array and hold a scryfall id (cardID property), but this endpoint is extremely rate limited.
		// Plain text card list
		const fromTextList = (userID: UserID, sessionID: SessionID, data: any, ack: (result: SocketAck) => void) => {
			let url = null;
			if (data.service === "Cube Cobra") url = `https://cubecobra.com/cube/api/cubelist/${data.cubeID}`;
			if (data.service === "CubeArtisan") url = `https://cubeartisan.net/cube/${data.cubeID}/export/plaintext`;
			if (!url) {
				ack?.(new SocketError(`Invalid cube service ('${data.service}').`));
				return;
			}
			request({ url: url, timeout: 3000 }, (err, res, body) => {
				try {
					if (err) {
						ack?.(
							new SocketError(
								"Error retrieving cube.",
								`Couldn't retrieve the card list from ${data.service}.`,
								`Full error: ${err}`
							)
						);
						return;
					} else if (res.statusCode !== 200) {
						ack?.(
							new SocketError(
								"Error retrieving cube.",
								`${data.service} responded '${res.statusCode}: ${body}'`
							)
						);
						return;
					} else if (
						(data.service === "Cube Cobra" && body === "Cube not found.") ||
						(data.service === "CubeArtisan" && res.request.path.endsWith("/404"))
					) {
						ack?.(
							new SocketError("Cube not found.", `Cube '${data.cubeID}' not found on ${data.service}.`)
						);
						return;
					} else if (!body) {
						ack?.(new SocketError("Empty Cube.", `Cube '${data.cubeID}' on ${data.service} seems empty.`));
						return;
					} else {
						parseCustomCardList(Sessions[sessionID], body, data, ack);
					}
				} catch (e) {
					ack?.(new SocketError("Internal server error."));
				}
			});
		};
		if (data.matchVersions) {
			// Xmage (.dck) format
			let url = null;
			if (data.service === "Cube Cobra") url = `https://cubecobra.com/cube/download/xmage/${data.cubeID}`;
			if (data.service === "CubeArtisan") url = `https://cubeartisan.net/cube/${data.cubeID}/export/xmage`;
			if (!url) {
				ack?.(new SocketError(`Invalid cube service ('${data.service}').`));
				return;
			}
			request({ url: url, timeout: 3000 }, (err, res, body) => {
				try {
					if (err) {
						new SocketError(
							"Error retrieving cube",
							`Couldn't retrieve the card list from ${data.service}.`,
							`Full error: ${err}`
						);
						return;
					} else if (res.statusCode !== 200) {
						ack?.(
							new SocketError(
								"Error retrieving cube.",
								`${data.service} responded '${res.statusCode}: ${body}'`
							)
						);
						return;
					} else if (res.request.path.endsWith("/404")) {
						// Missing cube redirects to /404
						ack?.(
							new SocketError("Cube not found.", `Cube '${data.cubeID}' not found on ${data.service}.`)
						);
						return;
					} else if (!body) {
						ack?.(new SocketError("Empty Cube.", `Cube '${data.cubeID}' on ${data.service} seems empty.`));
						return;
					} else {
						let converted = XMageToArena(body);
						if (!converted) fromTextList(userID, sessionID, data, ack);
						// Fallback to plain text list
						else
							parseCustomCardList(
								Sessions[sessionID],
								converted,
								Object.assign({ fallbackToCardName: true }, data),
								ack
							);
					}
				} catch (e) {
					ack?.(new SocketError("Internal server error."));
				}
			});
		} else {
			fromTextList(userID, sessionID, data, ack);
		}
	},
	loadLocalCustomCardList(userID: UserID, sessionID: SessionID, cubeName: string, ack: (result: SocketAck) => void) {
		if (!(cubeName in ParsedCubeLists)) {
			ack?.(new SocketError(`Unknown cube '${cubeName}'`));
			return;
		}

		useCustomCardList(Sessions[sessionID], ParsedCubeLists[cubeName]);

		ack?.(new SocketAck());
	},
	ignoreCollections(userID: UserID, sessionID: SessionID, ignoreCollections: boolean) {
		if (!SessionsSettingsProps.ignoreCollections(ignoreCollections)) return;
		Sessions[sessionID].ignoreCollections = ignoreCollections;
		for (let user of Sessions[sessionID].users) {
			if (user != userID)
				Connections[user].socket.emit("ignoreCollections", Sessions[sessionID].ignoreCollections);
		}
	},
	setPickTimer(userID: UserID, sessionID: SessionID, maxTimer: number) {
		if (!SessionsSettingsProps.maxTimer(maxTimer)) return;

		Sessions[sessionID].maxTimer = maxTimer;
		for (let user of Sessions[sessionID].users) {
			if (user != userID) Connections[user].socket.emit("setPickTimer", maxTimer);
		}
	},
	setMaxPlayers(userID: UserID, sessionID: SessionID, maxPlayers: number) {
		if (!SessionsSettingsProps.maxPlayers(maxPlayers)) return;

		Sessions[sessionID].maxPlayers = maxPlayers;
		for (let user of Sessions[sessionID].users) {
			if (user !== userID) Connections[user].socket.emit("setMaxPlayers", maxPlayers);
		}
	},
	setMythicPromotion(userID: UserID, sessionID: SessionID, mythicPromotion: boolean) {
		if (!SessionsSettingsProps.mythicPromotion(mythicPromotion)) return;

		Sessions[sessionID].mythicPromotion = mythicPromotion;
		for (let user of Sessions[sessionID].users) {
			if (user !== userID) Connections[user].socket.emit("sessionOptions", { mythicPromotion: mythicPromotion });
		}
	},
	setUseBoosterContent(userID: UserID, sessionID: SessionID, useBoosterContent: boolean) {
		if (!SessionsSettingsProps.useBoosterContent(useBoosterContent)) return;

		Sessions[sessionID].useBoosterContent = useBoosterContent;
		for (let user of Sessions[sessionID].users) {
			if (user !== userID)
				Connections[user].socket.emit("sessionOptions", { useBoosterContent: useBoosterContent });
		}
	},
	setBoosterContent(
		userID: UserID,
		sessionID: SessionID,
		boosterContent: { common: number; uncommon: number; rare: number }
	) {
		if (!SessionsSettingsProps.boosterContent(boosterContent)) return;
		if (
			Object.keys(boosterContent).every(
				(r) => (boosterContent as any)[r] === Sessions[sessionID].boosterContent[r]
			)
		)
			return;

		Sessions[sessionID].boosterContent = boosterContent;
		for (let user of Sessions[sessionID].users) {
			if (user !== userID) Connections[user].socket.emit("sessionOptions", { boosterContent: boosterContent });
		}
	},
	setUsePredeterminedBoosters(
		userID: UserID,
		sessionID: SessionID,
		value: boolean,
		ack: (result: SocketAck) => void
	) {
		if (!SessionsSettingsProps.usePredeterminedBoosters(value)) return;

		Sessions[sessionID].usePredeterminedBoosters = value;
		Sessions[sessionID].forNonOwners((uid) =>
			Connections[uid].socket.emit("sessionOptions", { usePredeterminedBoosters: value })
		);
		ack?.(new SocketAck());
	},
	setBoosters(userID: UserID, sessionID: SessionID, text: string, ack: (result: SocketAck) => void) {
		try {
			let boosters = [];
			let booster = [];
			for (let line of text.split("\n")) {
				if (!line || line === "") {
					if (booster.length === 0) continue;
					boosters.push(booster);
					booster = [];
				} else {
					let [count, cardID, foil] = parseLine(line);
					if (typeof cardID !== "undefined") {
						for (let i = 0; i < count; ++i) {
							let card = getUnique(cardID, { foil });
							booster.push(card);
						}
					} else {
						ack?.(count);
						return;
					}
				}
			}
			if (booster.length > 0) boosters.push(booster);

			if (boosters.length === 0) {
				ack?.(new SocketError("Empty list"));
				return;
			}
			for (let i = 1; i < boosters.length; ++i) {
				if (boosters[i].length !== boosters[0].length) {
					ack?.(
						new SocketError(
							"Inconsistent booster sizes",
							`All boosters must be of the same size. Booster #${i + 1} has ${
								boosters[i].length
							} cards, expected ${boosters[0].length}.`
						)
					);
					return;
				}
			}

			Sessions[sessionID].boosters = boosters;
			Sessions[sessionID].usePredeterminedBoosters = true;
			Sessions[sessionID].forUsers((uid) =>
				Connections[uid]?.socket.emit("sessionOptions", { usePredeterminedBoosters: true })
			);
			ack?.(new SocketAck());
		} catch (e) {
			ack?.(new SocketError("Internal error."));
			console.error("Error in setBoosters:", e);
		}
	},
	shuffleBoosters(userID: UserID, sessionID: SessionID, ack: (result: SocketAck) => void) {
		if (!Sessions[sessionID].boosters || Sessions[sessionID].boosters.length === 0) {
			ack?.(new SocketError("No boosters to shuffle."));
		} else {
			shuffleArray(Sessions[sessionID].boosters);
			ack?.(new SocketAck());
		}
	},
	setPersonalLogs(userID: UserID, sessionID: SessionID, value: boolean) {
		if (!SessionsSettingsProps.personalLogs(value)) return;

		Sessions[sessionID].personalLogs = value;
		Sessions[sessionID].forNonOwners((uid) =>
			Connections[uid].socket.emit("sessionOptions", { personalLogs: value })
		);
	},
	setDraftLogRecipients(userID: UserID, sessionID: SessionID, draftLogRecipients: DraftLogRecipients) {
		if (!SessionsSettingsProps.draftLogRecipients(draftLogRecipients)) return;

		Sessions[sessionID].draftLogRecipients = draftLogRecipients;
		for (let user of Sessions[sessionID].users) {
			if (user !== userID)
				Connections[user].socket.emit("sessionOptions", {
					draftLogRecipients: draftLogRecipients,
				});
		}
	},
	setMaxDuplicates(
		userID: UserID,
		sessionID: SessionID,
		maxDuplicates: { common: number; uncommon: number; rare: number }
	) {
		if (!SessionsSettingsProps.maxDuplicates(maxDuplicates)) return;

		Sessions[sessionID].maxDuplicates = maxDuplicates;
		for (let user of Sessions[sessionID].users) {
			if (user !== userID)
				Connections[user].socket.emit("sessionOptions", {
					maxDuplicates: maxDuplicates,
				});
		}
	},
	setColorBalance(userID: UserID, sessionID: SessionID, colorBalance: boolean) {
		if (!SessionsSettingsProps.colorBalance(colorBalance)) return;
		if (colorBalance === Sessions[sessionID].colorBalance) return;

		Sessions[sessionID].colorBalance = colorBalance;
		for (let user of Sessions[sessionID].users) {
			if (user !== userID && user in Connections)
				Connections[user].socket.emit("sessionOptions", {
					colorBalance: Sessions[sessionID].colorBalance,
				});
		}
	},
	setFoil(userID: UserID, sessionID: SessionID, foil: boolean) {
		if (!SessionsSettingsProps.foil(foil)) return;
		if (foil === Sessions[sessionID].foil) return;

		Sessions[sessionID].foil = foil;
		for (let user of Sessions[sessionID].users) {
			if (user !== userID && user in Connections)
				Connections[user].socket.emit("sessionOptions", {
					foil: Sessions[sessionID].foil,
				});
		}
	},
	setCollationType(userID: UserID, sessionID: SessionID, preferedCollation: string) {
		if (!SessionsSettingsProps.preferedCollation(preferedCollation)) return;
		if (preferedCollation === Sessions[sessionID].preferedCollation) return;

		Sessions[sessionID].preferedCollation = preferedCollation;
		for (let user of Sessions[sessionID].users) {
			if (user !== userID && user in Connections)
				Connections[user].socket.emit("sessionOptions", {
					preferedCollation: Sessions[sessionID].preferedCollation,
				});
		}
	},
	setUseCustomCardList(userID: UserID, sessionID: SessionID, useCustomCardList: boolean) {
		if (!SessionsSettingsProps.useCustomCardList(useCustomCardList)) return;
		if (useCustomCardList == Sessions[sessionID].useCustomCardList) return;

		Sessions[sessionID].useCustomCardList = useCustomCardList;
		for (let user of Sessions[sessionID].users) {
			if (user !== userID && user in Connections)
				Connections[user].socket.emit("sessionOptions", {
					useCustomCardList: Sessions[sessionID].useCustomCardList,
				});
		}
		if (Sessions[sessionID].isPublic) updatePublicSession(sessionID);
	},
	setDoubleMastersMode(userID: UserID, sessionID: SessionID, doubleMastersMode: boolean) {
		if (!SessionsSettingsProps.doubleMastersMode(doubleMastersMode)) return;
		if (doubleMastersMode === Sessions[sessionID].doubleMastersMode) return;

		Sessions[sessionID].doubleMastersMode = doubleMastersMode;
		for (let user of Sessions[sessionID].users) {
			if (user !== userID && user in Connections)
				Connections[user].socket.emit("sessionOptions", {
					doubleMastersMode: Sessions[sessionID].doubleMastersMode,
				});
		}
		if (Sessions[sessionID].isPublic) updatePublicSession(sessionID);
	},
	setPickedCardsPerRound(userID: UserID, sessionID: SessionID, pickedCardsPerRound: number) {
		if (!SessionsSettingsProps.pickedCardsPerRound(pickedCardsPerRound)) return;
		if (pickedCardsPerRound === Sessions[sessionID].pickedCardsPerRound) return;

		Sessions[sessionID].pickedCardsPerRound = pickedCardsPerRound;
		for (let user of Sessions[sessionID].users) {
			if (user !== userID && user in Connections)
				Connections[user].socket.emit("sessionOptions", { pickedCardsPerRound: pickedCardsPerRound });
		}
	},
	setBurnedCardsPerRound(userID: UserID, sessionID: SessionID, burnedCardsPerRound: number) {
		if (!SessionsSettingsProps.burnedCardsPerRound(burnedCardsPerRound)) return;
		if (burnedCardsPerRound === Sessions[sessionID].burnedCardsPerRound) return;

		Sessions[sessionID].burnedCardsPerRound = burnedCardsPerRound;
		for (let user of Sessions[sessionID].users) {
			if (user !== userID && user in Connections)
				Connections[user].socket.emit("sessionOptions", { burnedCardsPerRound: burnedCardsPerRound });
		}
	},
	setDiscardRemainingCardsAt(userID: UserID, sessionID: SessionID, discardRemainingCardsAt: number) {
		if (!SessionsSettingsProps.discardRemainingCardsAt(discardRemainingCardsAt)) return;
		if (discardRemainingCardsAt === Sessions[sessionID].discardRemainingCardsAt) return;

		Sessions[sessionID].discardRemainingCardsAt = discardRemainingCardsAt;
		for (let user of Sessions[sessionID].users) {
			if (user !== userID && user in Connections)
				Connections[user].socket.emit("sessionOptions", { discardRemainingCardsAt: discardRemainingCardsAt });
		}
	},
	setPublic(userID: UserID, sessionID: SessionID, isPublic: boolean) {
		if (!SessionsSettingsProps.isPublic(isPublic)) return;
		if (isPublic === Sessions[sessionID].isPublic) return;

		Sessions[sessionID].isPublic = isPublic;
		for (let user of Sessions[sessionID].users) {
			if (user !== userID) Connections[user].socket.emit("isPublic", Sessions[sessionID].isPublic);
		}
		updatePublicSession(sessionID);
	},
	setDescription(userID: UserID, sessionID: SessionID, description: string) {
		if (!SessionsSettingsProps.description(description)) return;
		if (description === Sessions[sessionID].description) return;

		Sessions[sessionID].description = description.substring(0, 70);
		for (let user of Sessions[sessionID].users) {
			if (user !== userID) Connections[user].socket.emit("description", Sessions[sessionID].description);
		}
		updatePublicSession(sessionID);
	},
	replaceDisconnectedPlayers(userID: UserID, sessionID: SessionID) {
		Sessions[sessionID].replaceDisconnectedPlayers();
	},
	distributeSealed(userID: UserID, sessionID: SessionID, boostersPerPlayer: number, customBoosters: Array<string>) {
		if (isNaN(boostersPerPlayer)) return;
		Sessions[sessionID].distributeSealed(boostersPerPlayer, customBoosters);
	},
	distributeJumpstart(userID: UserID, sessionID: SessionID, set: string) {
		Sessions[sessionID].distributeJumpstart(set);
	},
	generateBracket(userID: UserID, sessionID: SessionID, players: Array<UserID>, ack: (result: SocketAck) => void) {
		if (
			!(
				(players.length === 8 && !Sessions[sessionID].teamDraft) ||
				(players.length === 6 && Sessions[sessionID].teamDraft)
			)
		)
			return;
		Sessions[sessionID].generateBracket(players);
		ack?.(new SocketAck());
	},
	generateSwissBracket(
		userID: UserID,
		sessionID: SessionID,
		players: Array<UserID>,
		ack: (result: SocketAck) => void
	) {
		if (players.length !== 8 && players.length !== 6) return;
		Sessions[sessionID].generateSwissBracket(players);
		ack?.(new SocketAck());
	},
	generateDoubleBracket(
		userID: UserID,
		sessionID: SessionID,
		players: Array<UserID>,
		ack: (result: SocketAck) => void
	) {
		if (players.length !== 8) return;
		Sessions[sessionID].generateDoubleBracket(players);
		ack?.(new SocketAck());
	},
	lockBracket(userID: UserID, sessionID: SessionID, bracketLocked: boolean) {
		if (!SessionsSettingsProps.bracketLocked(bracketLocked)) return;
		if (bracketLocked === Sessions[sessionID].bracketLocked) return;

		Sessions[sessionID].bracketLocked = bracketLocked;
		for (let user of Sessions[sessionID].users) {
			if (user !== userID) Connections[user]?.socket.emit("sessionOptions", { bracketLocked: bracketLocked });
		}
	},
	shareDraftLog(userID: UserID, sessionID: SessionID, draftLog: DraftLog) {
		const sess = Sessions[sessionID];
		if (!draftLog) return;

		// Update local copy to be public
		if (!sess.draftLog && sess.id === draftLog.sessionID) sess.draftLog = draftLog;
		else if (sess.draftLog?.sessionID === draftLog.sessionID && sess.draftLog.time === draftLog.time)
			sess.draftLog.delayed = false;

		// Send the full copy to everyone
		draftLog.delayed = false;
		for (let user of sess.users) if (user !== userID) Connections[user]?.socket.emit("draftLog", draftLog);
	},
};

function prepareSocketCallback(callback: Function, ownerOnly = false) {
	return async function (this: Socket) {
		// Last argument is assumed to be an acknowledgement function if it is a function.
		const ack =
			arguments.length > 0 && arguments[arguments.length - 1] instanceof Function
				? arguments[arguments.length - 1]
				: null;
		const userID = (this.handshake.query as any).userID;
		if (!(userID in Connections)) {
			ack?.({ code: 1, error: "Internal error. User does not exist." });
			return;
		}
		const sessionID = Connections[userID].sessionID;
		if (!sessionID || !(sessionID in Sessions)) {
			ack?.(ackError({ code: 1, title: "Internal error", text: "Session does not exist." }));
			return;
		}
		if (ownerOnly && Sessions[sessionID].owner !== userID) {
			ack?.(ackError({ code: 401, title: "Unautorized", text: "Must be session owner." }));
			return;
		}
		try {
			await callback(userID, sessionID, ...arguments);
		} catch (e) {
			ack?.(ackError({ code: 500, title: "Internal server error." }));
			console.error(e);
		}
	};
}

io.on("connection", async function (socket) {
	const query = socket.handshake.query;
	console.log(
		`${query.userName} [${query.userID}] connected. (${Object.keys(Connections).length + 1} players online)`
	);

	if (query.userID in Connections) {
		console.log(`${query.userName} [${query.userID}] already connected.`);
		// For some reason sockets doesn't always cleanly disconnects.
		// Give 3sec. for the original socket to respond or we'll close it.
		// Ask the user to wait while we test the previous connection...
		socket.emit("message", {
			title: "Connecting...",
			allowOutsideClick: false,
		});
		await new Promise<void>((resolve) => {
			((targetSocket) => {
				const timeout = setTimeout(() => {
					// Previous connection did not respond in time, close it and continue as normal.
					targetSocket.disconnect();
					// Wait for the socket to be properly disconnected and the previous Connection deleted.
					process.nextTick(() => {
						resolve();
					});
				}, 3000);
				targetSocket.emit("stillAlive", () => {
					// Previous connection is still alive, generate a new userID.
					clearTimeout(timeout);
					query.userID = uuid.v1();
					socket.emit("alreadyConnected", query.userID);
					resolve();
				});
			})(Connections[query.userID].socket);
		});
	}

	if (query.userID in InactiveConnections) {
		// Restore previously saved connection
		// TODO: Front and Back end may be out of sync after this!
		InactiveConnections[query.userID].socket = socket;
		let connection = new Connection(socket, query.userID, query.userName);
		for (let prop of Object.getOwnPropertyNames(InactiveConnections[query.userID])) {
			(connection as IIndexable)[prop] = InactiveConnections[query.userID][prop];
		}
		Connections[query.userID] = connection;
		delete InactiveConnections[query.userID];
	} else {
		Connections[query.userID] = new Connection(socket, query.userID, query.userName);
	}

	// Messages

	socket.on("disconnect", function (this: Socket) {
		const userID = (this.handshake.query as any).userID;
		if (userID in Connections && Connections[userID].socket === this) {
			console.log(
				`${Connections[userID].userName} [${userID}] disconnected. (${
					Object.keys(Connections).length - 1
				} players online)`
			);
			removeUserFromSession(userID);
			process.nextTick(() => {
				if (Connections[userID]?.socket === this) delete Connections[userID];
			});
		}
	});

	socket.on("error", function (err: any) {
		console.error("Socket.io error: ");
		console.error(err);
	});

	socket.on("setSession", function (this: Socket, sessionID: SessionID, sessionSettings: Options) {
		const userID = (this.handshake.query as any).userID;
		if (sessionID === Connections[userID].sessionID) return;

		const filteredSettings: Options = {};
		if (sessionSettings)
			for (let prop of Object.keys(SessionsSettingsProps))
				if (prop in sessionSettings) filteredSettings[prop] = sessionSettings[prop];
		joinSession(sessionID, userID, filteredSettings);
	});

	for (let key in socketCallbacks) socket.on(key, prepareSocketCallback(socketCallbacks[key]));

	for (let key in ownerSocketCallbacks) socket.on(key, prepareSocketCallback(ownerSocketCallbacks[key], true));

	// Apply prefered session settings in case we're creating a new one, filtering out invalid ones.
	let filteredSettings: Options = {};
	try {
		if (query.sessionSettings) {
			const sessionSettings: Options = JSON.parse(query.sessionSettings);
			for (let prop of Object.keys(SessionsSettingsProps))
				if (prop in sessionSettings && SessionsSettingsProps[prop](sessionSettings[prop]))
					filteredSettings[prop] = sessionSettings[prop];
		}
	} catch (e) {
		console.error("Error parsing default session setting on user connection: ", e);
		console.error("query.sessionSettings: ", query.sessionSettings);
	}

	joinSession(query.sessionID, query.userID, filteredSettings);
	socket.emit("publicSessions", getPublicSessions());
});

///////////////////////////////////////////////////////////////////////////////

function joinSession(sessionID: SessionID, userID: UserID, defaultSessionSettings: Options = {}) {
	// Fallback to previous session if possible, or generate a new one
	const refuse = (msg: string) => {
		Connections[userID].socket.emit("message", {
			title: "Cannot join session",
			html: msg,
		});
		if (!Connections[userID].sessionID) sessionID = shortguid();
		else sessionID = Connections[userID].sessionID as SessionID;
		Connections[userID].socket.emit("setSession", sessionID);
	};

	if (sessionID in InactiveSessions) {
		if (InactiveSessions[sessionID].drafting && !(userID in InactiveSessions[sessionID].disconnectedUsers)) {
			refuse(`Session '${sessionID}' is currently drafting.`);
			return;
		}

		console.log(`Restoring inactive session '${sessionID}'...`);
		// Always having a valid owner is more important than preserving the old one - probably.
		Sessions[sessionID] = restoreSession(
			InactiveSessions[sessionID],
			InactiveSessions[sessionID].ownerIsPlayer ? userID : InactiveSessions[sessionID].owner
		);
		if (InactiveSessions[sessionID].deleteTimeout) clearTimeout(InactiveSessions[sessionID].deleteTimeout);
		delete InactiveSessions[sessionID];
	}

	if (sessionID in Sessions) {
		let sess = Sessions[sessionID];
		// User was the owner, but not playing
		if (userID === sess.owner && !sess.ownerIsPlayer) {
			Connections[userID].socket.emit("message", {
				title: "Reconnected as Organizer",
			});
			sess.reconnectOwner(userID);
			return;
		}

		const bracketLink = sess.bracket
			? `<br />Bracket is available <a href="/bracket?session=${encodeURI(
					sessionID
			  )}" target="_blank" rel="noopener nofollow">here</a>.`
			: "";
		// Session exists and is drafting
		if (sess.drafting) {
			console.log(
				`${userID} wants to join drafting session '${sessionID}'... userID in sess.disconnectedUsers: ${
					userID in sess.disconnectedUsers
				}`
			);

			if (userID in sess.disconnectedUsers) {
				sess.reconnectUser(userID);
			} else {
				refuse(
					`This session (${sessionID}) is currently drafting. Please wait for them to finish.${bracketLink}`
				);
			}
		} else if (sess.getHumanPlayerCount() >= sess.maxPlayers) {
			// Session exists and is full
			refuse(
				`This session (${sessionID}) is full (${sess.users.size}/${sess.maxPlayers} players).${bracketLink}`
			);
		} else {
			addUserToSession(userID, sessionID);
		}
	} else {
		addUserToSession(userID, sessionID, defaultSessionSettings);
	}
}

function addUserToSession(userID: UserID, sessionID: SessionID, defaultSessionSettings: Options = {}) {
	const currentSession = Connections[userID].sessionID;
	if (currentSession && currentSession in Sessions) removeUserFromSession(userID);

	if (!(sessionID in Sessions)) {
		if (currentSession && currentSession in Sessions)
			if (userID === Sessions[currentSession].owner)
				// Transfer session settings to the new one if applicable
				for (let p of Object.keys(SessionsSettingsProps))
					defaultSessionSettings[p] = (Sessions[currentSession] as IIndexable)[p];

		Sessions[sessionID] = new Session(sessionID, userID, defaultSessionSettings);
	}

	Sessions[sessionID].addUser(userID);
	if (Sessions[sessionID].isPublic) updatePublicSession(sessionID);
}

function deleteSession(sessionID: SessionID) {
	const wasPublic = Sessions[sessionID].isPublic;
	process.nextTick(() => {
		delete Sessions[sessionID];
		if (wasPublic) updatePublicSession(sessionID);
	});
}

// Remove user from previous session and cleanup if empty
function removeUserFromSession(userID: UserID) {
	const sessionID = Connections[userID].sessionID;
	if (sessionID && sessionID in Sessions) {
		let sess = Sessions[sessionID];
		if (sess.users.has(userID)) {
			sess.remUser(userID);
			if (sess.isPublic) updatePublicSession(sessionID);

			Connections[userID].sessionID = undefined;

			//                           Keep session alive if the owner wasn't a player and is still connected.
			if (sess.users.size === 0 && (sess.ownerIsPlayer || !(sess.owner in Connections))) {
				// If a game was going, we'll keep the session around for a while in case a player reconnects
				// (mostly useful in case of disconnection during a single player game)
				if (sess.drafting) {
					InactiveSessions[sessionID] = getPoDSession(sess);
					InactiveSessions[sessionID].deleteTimeout = setTimeout(() => {
						process.nextTick(() => {
							if (InactiveSessions[sessionID]) delete InactiveSessions[sessionID];
						});
					}, 10 * 60 * 1000); // 10min should be plenty enough.
				}
				deleteSession(sessionID);
			} else sess.notifyUserChange();
		} else if (userID === sess.owner && !sess.ownerIsPlayer && sess.users.size === 0) {
			// User was a non-playing owner and alone in this session
			deleteSession(sessionID);
		}
	}
}

///////////////////////////////////////////////////////////////////////////////
// Express server setup

// Serve files in the public directory
app.use(express.static("./client/public/"));
app.use("/bracket", express.static("client/public/bracket.html"));

///////////////////////////////////////////////////////////////////////////////
// Endpoints
// (TODO: Should be cleaned up)

// Not actually in use right, remove?
function getCollection(res: express.Response, sessionID: SessionID) {
	try {
		if (!sessionID) {
			res.sendStatus(400);
		} else if (sessionID in Sessions) {
			res.json([...Sessions[sessionID].collection(false).entries()]);
		} else {
			res.sendStatus(404);
		}
	} catch (e) {
		res.sendStatus(500);
	}
}

app.get("/getCollection", (req, res) => {
	getCollection(res, req.cookies.sessionID);
});

app.get("/getCollection/:sessionID", (req, res) => {
	getCollection(res, req.params.sessionID);
});

function returnCollectionPlainText(res: any, sid: SessionID) {
	if (!sid) {
		res.sendStatus(400);
	} else if (sid in Sessions) {
		const coll = Sessions[sid].collection(false);
		let r = "";
		for (let cid in coll) r += `${coll.get(cid)} ${Cards[cid].name}\n`;
		res.set("Content-disposition", `attachment; filename=collection_${sid}.txt`);
		res.set("Content-Type", "text/plain");
		res.send(r);
	} else {
		res.sendStatus(404);
	}
}

app.get("/getCollectionPlainText/", (req, res) => {
	returnCollectionPlainText(res, req.cookies.sessionID);
});

app.get("/getCollectionPlainText/:sessionID", (req, res) => {
	returnCollectionPlainText(res, req.params.sessionID);
});

app.get("/getUsers/:sessionID", (req, res) => {
	if (!req.params.sessionID) {
		res.sendStatus(400);
	} else if (req.params.sessionID in Sessions) {
		res.json([...Sessions[req.params.sessionID].users]);
	} else {
		res.sendStatus(404);
	}
});

// Returns card data from a list of card ids
app.post("/getCards", (req, res) => {
	if (!req.body) {
		res.sendStatus(400);
	} else {
		try {
			if (Array.isArray(req.body)) {
				res.json(req.body.map((cid) => Cards[cid]));
			} else if (typeof req.body === "object") {
				const r: { [key: string]: Card[] } = {};
				for (let slot in req.body) r[slot] = req.body[slot].map((cid: CardID) => Cards[cid]);
				res.json(r);
			} else {
				res.sendStatus(400);
			}
		} catch (e) {
			console.error(e);
			res.sendStatus(500);
		}
	}
});

app.post("/getDeck", (req, res) => {
	if (!req.body) {
		res.status(400).send({ error: { message: `Bad request.` } });
	} else {
		try {
			let r = { deck: [] as Card[], sideboard: [] as Card[] };
			const lines = req.body.split(/\r?\n/);
			let target: Card[] = r.deck;
			for (let line of lines) {
				line = line.trim();
				if (line === "Deck") target = r.deck;
				if (line === "Sideboard" || (line === "" && r.deck.length > 0)) target = r.sideboard;
				if (["", "Deck", "Sideboard"].includes(line)) continue;
				let [count, cardID] = parseLine(line);
				if (typeof cardID !== "undefined") {
					for (let i = 0; i < count; ++i) target.push(getUnique(cardID));
				} else {
					res.status(400).send({ error: { message: `Error on line '${line}'` } });
					return;
				}
			}
			res.json(r);
		} catch (e) {
			console.error(e);
			res.sendStatus(500);
		}
	}
});

app.get("/getBracket/:sessionID", (req, res) => {
	const sid = req.params.sessionID;
	if (!sid) {
		res.sendStatus(400);
	} else if (sid in Sessions && Sessions[sid].bracket) {
		res.json(Sessions[sid].bracket);
	} else {
		res.sendStatus(404);
	}
});

app.get("/getDraftLog/:sessionID", (req, res) => {
	if (!req.params.sessionID) {
		res.sendStatus(400);
	} else if (req.params.sessionID in Sessions && Sessions[req.params.sessionID].draftLog) {
		if (Sessions[req.params.sessionID].draftLog?.delayed) res.json(Sessions[req.params.sessionID].getStrippedLog());
		else res.json(Sessions[req.params.sessionID].draftLog);
	} else {
		res.sendStatus(404);
	}
});

// Debug endpoints

const secretKey = process.env.SECRET_KEY || "1234";

function requireAPIKey(req: express.Request, res: express.Response, next: express.NextFunction) {
	if (req.params.key === secretKey) next();
	else res.sendStatus(401).end();
}

const getCircularReplacer = () => {
	const seen = new WeakSet();
	return (key: string, value: any) => {
		if (typeof value === "object" && value !== null) {
			if (seen.has(value)) return;
			seen.add(value);
		}
		return value;
	};
};

// Ignore circular references in data when converting to JSON
function returnCircularJSON(res: express.Response, data: any) {
	res.setHeader("Content-Type", "application/json");
	return res.send(JSON.stringify(data, getCircularReplacer()));
}

app.get("/getSessionsDebug/:key", requireAPIKey, (req, res) => {
	return returnCircularJSON(res, Sessions);
});

app.get("/getConnections/:key", requireAPIKey, (req, res) => {
	return returnCircularJSON(res, Connections);
});

app.get("/getStatus/:key", requireAPIKey, (req, res) => {
	let draftingSessions = 0;
	let draftingPlayers = 0;
	for (let sID in Sessions) {
		if (Sessions[sID].drafting) {
			++draftingSessions;
			draftingPlayers += Sessions[sID].users.size;
		}
	}
	let uptime = process.uptime();
	return returnCircularJSON(res, {
		uptime: uptime,
		sessionCount: Object.keys(Sessions).length,
		playerCount: Object.keys(Connections).length,
		draftingSessions: draftingSessions,
		draftingPlayers: draftingPlayers,
		canRestart: draftingSessions === 0,
	});
});

// Used by Discord Bot
app.get("/getSessions/:key", requireAPIKey, (req, res) => {
	let localSess: { [sid: string]: any } = {};
	for (let sid in Sessions)
		localSess[sid] = {
			id: sid,
			drafting: Sessions[sid].drafting,
			users: Sessions[sid].users,
			maxPlayers: Sessions[sid].maxPlayers,
			useCustomCardList: Sessions[sid].useCustomCardList,
			customCardList: Sessions[sid].customCardList
				? {
						name: Sessions[sid].customCardList.name,
						length: Sessions[sid].customCardList.length,
				  }
				: null,
			setRestriction: Sessions[sid].setRestriction,
		};
	return returnCircularJSON(res, localSess);
});

Promise.all([InactiveConnections, InactiveSessions]).then(() => {
	httpServer.listen(port, () => {
		console.log(`Listening on port ${port} (ready in ${process.uptime().toFixed(2)}s)`);
	});
});

export default {};

import "source-map-support/register.js";

export const DraftmancerPort = process.env.PORT || 3000;

import fs from "fs";
import axios, { AxiosError, AxiosResponse } from "axios";
import compression from "compression";
import express, { json as ExpressJSON, text as ExpressText, static as ExpressStatic } from "express";
import http from "http";
import { Server, Socket } from "socket.io";
import cookieParser from "cookie-parser";
import { v1 as uuidv1 } from "uuid";

import { Options, shuffleArray } from "./utils.js";
import {
	ackError,
	isSocketError,
	isMessageError,
	Message,
	MessageWarning,
	SocketAck,
	SocketError,
	ToastMessage,
	MessageError,
} from "./Message.js";
import { Constants } from "./Constants.js";
import { InactiveConnections, InactiveSessions, restoreSession, getPoDSession, copyPODProps } from "./Persistence.js";
import { Connection, Connections } from "./Connection.js";
import { DistributionMode, DraftLogRecipients, ReadyState } from "./Session/SessionTypes";
import { Session, Sessions, getPublicSessionData } from "./Session.js";
import {
	CardID,
	Card,
	UniqueCardID,
	DeckBasicLands,
	PlainCollection,
	ArenaID,
	UsableDraftEffect,
	OptionalOnPickDraftEffect,
	CardColor,
} from "./CardTypes.js";
import { MTGACards, getUnique, getCard, CardsByName } from "./Cards.js";
import { parseLine, parseCardList, XMageToArena, matchCardVersion } from "./parseCardList.js";
import { SessionID, UserID } from "./IDTypes.js";
import { CustomCardList, Sheet } from "./CustomCardList.js";
import { checkCCLSettingType, isKeyOfCCLSettings } from "./CustomCardListUtils.js";
import { DraftLog } from "./DraftLog.js";
import {
	hasOptionalProperty,
	hasProperty,
	isArrayOf,
	isBoolean,
	isInteger,
	isNumber,
	isObject,
	isSomeEnum,
	isString,
} from "./TypeChecks.js";
import { instanceOfTurnBased } from "./IDraftState.js";
import { ClientToServerEvents, ServerToClientEvents, InterServerEvents, SocketData } from "./SocketType.js";
import { IIndexable, SetCode } from "./Types.js";
import { SessionsSettingsProps } from "./Session/SessionProps.js";
import { isRotisserieDraftState, RotisserieDraftStartOptions } from "./RotisserieDraft.js";
import { BracketType } from "./Brackets.js";
import { setDraftQueueSettings, getQueueStatus, registerPlayer, unregisterPlayer } from "./draftQueue/DraftQueue.js";

import expressStaticGzip from "express-static-gzip";
import { parseMTGOLog } from "./parseMTGOLog.js";

import { init as MTGOAPIInit } from "./MTGOAPI.js";
import { isTiebreaker } from "./SilentAuctionDraft.js";
import { CardPool } from "./CardPool.js";
import parseCSV from "./parseCSV.js";

if (process.env.NODE_ENV === "production") MTGOAPIInit();

const app = express();
const httpServer = new http.Server(app);
const io = new Server<ClientToServerEvents, ServerToClientEvents, InterServerEvents, SocketData>(httpServer, {
	maxHttpBufferSize: 1e7, // Increase max. message size to 10MB to accomodate larger custom card lists.
	httpCompression: true,
	perMessageDeflate: true,
});

// Redirect www to non-www.
app.use((req, res, next) => {
	if (req.headers.host?.slice(0, 4) === "www.") {
		const newHost = req.headers.host.slice(4);
		return res.redirect(301, req.protocol + "://" + newHost + req.originalUrl);
	}
	next();
});

// Serve pre-compressed files from the dist directory in production
if (process.env.NODE_ENV === "production")
	app.use("/", expressStaticGzip("./client/dist/", { enableBrotli: true, orderPreference: ["br", "gz"] }));
else app.use("/", ExpressStatic("./client/dist/")); // Otherwise serve them directly (avoid issue with caching compressed assets, and speedup webpack dev build)

app.use(compression());

app.use("/bracket", ExpressStatic("./client/dist/bracket.html"));
app.use("/draftqueue", ExpressStatic("./client/dist/index.html"));

app.use(cookieParser());
app.use(ExpressJSON());
app.use(ExpressText({ type: "text/*" }));

function shortguid() {
	function s4() {
		return Math.floor((1 + Math.random()) * 0x10000)
			.toString(16)
			.substring(1);
	}
	return s4() + s4() + s4();
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
const ParsedCubeLists: { [name: string]: CustomCardList } = {};
for (const cube of Constants.CubeLists) {
	if (cube.filename) {
		const r = parseCardList(fs.readFileSync(`./data/cubes/${cube.filename}`, "utf8"), {
			name: cube.name,
		});
		if (isSocketError(r)) {
			console.error("An error occured while parsing local cube ", cube);
			console.error(r.error);
		} else ParsedCubeLists[cube.name] = r;
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
	options: {
		name?: string;
		cubeCobraID?: string;
		fallbackToCardName?: boolean;
		ignoreUnknownCards?: boolean;
	},
	ack: (result: SocketAck) => void
) {
	let parsedList = null;
	try {
		parsedList = parseCardList(txtlist, options);
	} catch (e) {
		console.error(e);
		return ack?.(new SocketError("Internal server error"));
	}

	if (isSocketError(parsedList)) return ack?.(parsedList);

	useCustomCardList(session, parsedList);

	ack?.(new SocketAck());
};

const checkDraftAction = function (userID: UserID, sess: Session, type: string, ack?: (result: SocketAck) => void) {
	if (!sess.drafting || sess.draftState?.type !== type) {
		ack?.(new SocketError("Not drafting."));
		return false;
	}
	if (instanceOfTurnBased(sess.draftState)) {
		if (userID !== sess.draftState.currentPlayer()) {
			ack?.(new SocketError("Not your turn."));
			return false;
		}
	}
	return true;
};

// Personnal options
function setUserName(userID: UserID, sessionID: SessionID, userName: string) {
	Connections[userID].userName = userName;
	Sessions[sessionID].forUsers((uid: UserID) =>
		Connections[uid]?.socket.emit("updateUser", {
			userID: userID,
			updatedProperties: {
				userName: userName,
			},
		})
	);
}

function setCollection(
	userID: UserID,
	sessionID: SessionID,
	collection: PlainCollection,
	ack?: (response: SocketAck) => void
) {
	if (!isObject(collection) || collection === null) {
		ack?.(new SocketError("Invalid parameter."));
		return;
	}

	const processedCollection: CardPool = new CardPool();
	// Remove unknown cards immediatly.
	for (const aid in collection) {
		if (aid in MTGACards) {
			processedCollection.set(MTGACards[parseInt(aid)].id, collection[aid]);
		}
	}

	Connections[userID].collection = processedCollection;

	ack?.(new SocketAck());

	const hasCollection = processedCollection.size > 0;
	Sessions[sessionID].forUsers((user) =>
		Connections[user]?.socket.emit("updateUser", {
			userID: userID,
			updatedProperties: {
				collection: hasCollection,
			},
		})
	);
}

// Parse a card list and uses it as collection
function parseCollection(
	userID: UserID,
	sessionID: SessionID,
	txtcollection: string,
	ack: (ret: SocketAck & { collection?: PlainCollection }) => void
) {
	const unknownCards: string[] = [];
	const cardList = parseCardList(txtcollection, { fallbackToCardName: true, ignoreUnknownCards: true }, unknownCards);
	if (isSocketError(cardList)) {
		ack?.(cardList);
		return;
	}
	if (!cardList.sheets["default"] || cardList.sheets["default"].collation !== "random") {
		ack?.(new SocketError("Unexpected collection."));
		return;
	}

	const ret: SocketAck & { collection?: PlainCollection } = new SocketAck();

	const warningMessages = [];

	if (unknownCards.length > 0)
		warningMessages.push(
			`The following cards could not be found and were ignored:<br />${unknownCards.join("<br />")}`
		);

	const ignoredCards = [];

	const collection = new Map<ArenaID, number>();
	for (const [cardID, count] of Object.entries(cardList.sheets["default"].cards)) {
		const aid = getCard(cardID).arena_id;
		if (!aid) {
			ignoredCards.push(`${getCard(cardID).name} (${getCard(cardID).set})`);
			continue;
		}
		if (collection.has(aid)) collection.set(aid, (collection.get(aid) as number) + count);
		else collection.set(aid, count);
	}
	if (ignoredCards.length > 1)
		warningMessages.push(
			`The following cards are not valid MTGA cards and were ignored:<br/>${ignoredCards.join("<br />")}`
		);

	if (warningMessages.length > 0)
		ret.warning = new MessageWarning(
			"Cards Ignored.",
			"",
			"",
			"Collection was imported with the following warnings:<br /><br />" + warningMessages.join("<br /><br />")
		);

	ret.collection = Object.fromEntries(collection);
	ack?.(ret);
}

function useCollection(userID: UserID, sessionID: SessionID, useCollection: boolean) {
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
}

function chatMessage(
	userID: UserID,
	sessionID: SessionID,
	message: { author: string; text: string; timestamp: number }
) {
	if (!isObject(message) || !isString(message.author) || !isString(message.text) || !isNumber(message.timestamp))
		return;
	message.text = message.text.substring(0, Math.min(255, message.text.length)); // Limits chat message length
	Sessions[sessionID].forUsers((user) => Connections[user]?.socket.emit("chatMessage", message));
}

function setReady(userID: UserID, sessionID: SessionID, readyState: ReadyState) {
	if (!isString(readyState)) return;
	Sessions[sessionID].forUsers((user) => Connections[user]?.socket.emit("setReady", userID, readyState));
}

async function passBooster(userID: UserID, sessionID: SessionID) {
	await Sessions[sessionID].skipPick(userID);
}

async function pickCard(
	userID: UserID,
	sessionID: SessionID,
	data: {
		pickedCards: Array<number>;
		burnedCards: Array<number>;
		draftEffect?: unknown;
		optionalOnPickDraftEffect?: unknown;
	},
	ack: (result: SocketAck) => void
) {
	let draftEffect: { effect: UsableDraftEffect; cardID: UniqueCardID } | undefined;
	if (data.draftEffect) {
		if (!isObject(data.draftEffect)) return ack?.(new SocketError("draftEffect must be an object."));
		if (!hasProperty("effect", isSomeEnum(UsableDraftEffect))(data.draftEffect))
			return ack?.(new SocketError("draftEffect.effect must be a valid UsableDraftEffect."));
		if (!hasProperty("cardID", isNumber)(data.draftEffect))
			return ack?.(new SocketError("draftEffect.cardID must be a valid UniqueCardID."));
		draftEffect = data.draftEffect;
	}
	let optionalOnPickDraftEffect: { effect: OptionalOnPickDraftEffect; cardID: UniqueCardID } | undefined;
	if (data.optionalOnPickDraftEffect) {
		if (!isObject(data.optionalOnPickDraftEffect))
			return ack?.(new SocketError("optionalOnPickDraftEffect must be an object."));
		if (!hasProperty("effect", isSomeEnum(OptionalOnPickDraftEffect))(data.optionalOnPickDraftEffect))
			return ack?.(
				new SocketError("optionalOnPickDraftEffect.effect must be a valid OptionalOnPickDraftEffect.")
			);
		if (!hasProperty("cardID", isNumber)(data.optionalOnPickDraftEffect))
			return ack?.(new SocketError("optionalOnPickDraftEffect.cardID must be a valid UniqueCardID."));
		optionalOnPickDraftEffect = data.optionalOnPickDraftEffect;
	}
	// Removes picked card from corresponding booster and notify other players.
	// Moves to next round when each player have picked a card.
	const r = await Sessions[sessionID].pickCard(
		userID,
		data.pickedCards,
		data.burnedCards,
		draftEffect,
		optionalOnPickDraftEffect
	);
	ack?.(r);
}

function gridDraftPick(userID: UserID, sessionID: SessionID, choice: number, ack: (result: SocketAck) => void) {
	if (!checkDraftAction(userID, Sessions[sessionID], "grid", ack)) return;

	const r = Sessions[sessionID].gridDraftPick(choice);
	ack?.(r);
}

function rochesterDraftPick(
	userID: UserID,
	sessionID: SessionID,
	choices: Array<number>,
	ack: (result: SocketAck) => void
) {
	if (!checkDraftAction(userID, Sessions[sessionID], "rochester", ack)) return;

	const r = Sessions[sessionID].rochesterDraftPick(choices[0]);

	if (!r) ack?.(new SocketError("Internal error."));
	else ack?.(new SocketAck());
}

function rotisserieDraftPick(
	userID: UserID,
	sessionID: SessionID,
	uniqueCardID: UniqueCardID,
	ack: (result: SocketAck) => void
) {
	if (!checkDraftAction(userID, Sessions[sessionID], "rotisserie", ack)) return;

	ack(Sessions[sessionID].rotisserieDraftPick(uniqueCardID));
}

// Winston Draft
function winstonDraftTakePile(userID: UserID, sessionID: SessionID, num: number, ack: (result: SocketAck) => void) {
	if (!checkDraftAction(userID, Sessions[sessionID], "winston", ack)) return;

	const r = Sessions[sessionID].winstonTakePile(num);
	ack?.(r);
}

function winstonDraftSkipPile(userID: UserID, sessionID: SessionID, num: number, ack: (result: SocketAck) => void) {
	if (!checkDraftAction(userID, Sessions[sessionID], "winston", ack)) return;

	const r = Sessions[sessionID].winstonSkipPile(num);
	ack?.(r);
}

function winchesterDraftPick(
	userID: UserID,
	sessionID: SessionID,
	pickedColumn: number,
	ack: (result: SocketAck) => void
) {
	if (!checkDraftAction(userID, Sessions[sessionID], "winchester", ack)) return;

	const r = Sessions[sessionID].winchesterDraftPick(pickedColumn);
	ack?.(r);
}

function housmanDraftPick(
	userID: UserID,
	sessionID: SessionID,
	handIndex: number,
	revealedCardsIndex: number,
	ack: (result: SocketAck) => void
) {
	if (!checkDraftAction(userID, Sessions[sessionID], "housman", ack)) return;

	const r = Sessions[sessionID].housmanDraftPick(handIndex, revealedCardsIndex);
	ack?.(r);
}

function minesweeperDraftPick(
	userID: UserID,
	sessionID: SessionID,
	row: number,
	col: number,
	ack: (result: SocketAck) => void
) {
	if (!checkDraftAction(userID, Sessions[sessionID], "minesweeper", ack)) return;

	const r = Sessions[sessionID].minesweeperDraftPick(userID, row, col);

	ack?.(r);
}

function solomonDraftOrganize(userID: UserID, sessionID: SessionID, piles: unknown, ack: (result: SocketAck) => void) {
	if (!checkDraftAction(userID, Sessions[sessionID], "solomon", ack)) return;
	if (!((x): x is [UniqueCardID[], UniqueCardID[]] => isArrayOf(isArrayOf(isNumber))(x) && x.length === 2)(piles))
		return ack?.(new SocketError("Invalid piles."));
	ack?.(Sessions[sessionID].solomonDraftOrganize(piles));
}

function solomonDraftConfirmPiles(userID: UserID, sessionID: SessionID, ack: (result: SocketAck) => void) {
	if (!checkDraftAction(userID, Sessions[sessionID], "solomon", ack)) return;
	ack?.(Sessions[sessionID].solomonDraftConfirmPiles());
}

function solomonDraftPick(userID: UserID, sessionID: SessionID, pileIdx: unknown, ack: (result: SocketAck) => void) {
	if (!checkDraftAction(userID, Sessions[sessionID], "solomon", ack)) return;
	if (!isNumber(pileIdx) || (pileIdx !== 0 && pileIdx !== 1)) return ack?.(new SocketError("Invalid pile index."));
	ack?.(Sessions[sessionID].solomonDraftPick(pileIdx));
}

function teamSealedPick(
	userID: UserID,
	sessionID: SessionID,
	uniqueCardID: UniqueCardID,
	ack: (result: SocketAck) => void
) {
	if (!checkDraftAction(userID, Sessions[sessionID], "teamSealed", ack)) return;
	const r = Sessions[sessionID].teamSealedPick(userID, uniqueCardID);
	ack?.(r);
}

function updateBracket(userID: UserID, sessionID: SessionID, matchIndex: number, playerIndex: number, value: number) {
	if (Sessions[sessionID].owner !== userID && Sessions[sessionID].bracketLocked) return;
	Sessions[sessionID].updateBracket(matchIndex, playerIndex, value);
}

function updateDeckLands(userID: UserID, sessionID: SessionID, lands: DeckBasicLands) {
	Sessions[sessionID].updateDeckLands(userID, lands);
}

function moveCard(userID: UserID, sessionID: SessionID, uniqueID: UniqueCardID, destStr: string) {
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
		Sessions[sessionID].updateDecklist(userID);
	}
}

function swapDeckAndSideboard(userID: UserID, sessionID: SessionID) {
	if (!Connections[userID]?.pickedCards) return;
	const tmp = Connections[userID].pickedCards.main;
	Connections[userID].pickedCards.main = Connections[userID].pickedCards.side;
	Connections[userID].pickedCards.side = tmp;
	Sessions[sessionID].updateDecklist(userID);
}

function moveAllToDeck(userID: UserID, sessionID: SessionID) {
	if (!Connections[userID]?.pickedCards) return;
	Connections[userID].pickedCards.main.push(...Connections[userID].pickedCards.side);
	Connections[userID].pickedCards.side = [];
	Sessions[sessionID].updateDecklist(userID);
}

function moveAllToSideboard(userID: UserID, sessionID: SessionID) {
	if (!Connections[userID]?.pickedCards) return;
	Connections[userID].pickedCards.side.push(...Connections[userID].pickedCards.main);
	Connections[userID].pickedCards.main = [];
	Sessions[sessionID].updateDecklist(userID);
}

function removeBasicsFromDeck(userID: UserID, sessionID: SessionID) {
	Sessions[sessionID].removeBasicsFromDeck(userID);
}

function setOwnerIsPlayer(userID: UserID, sessionID: SessionID, val: boolean) {
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
	sess.emitToConnectedNonOwners("sessionOptions", { ownerIsPlayer: sess.ownerIsPlayer });
}

function readyCheck(userID: UserID, sessionID: SessionID, ack: (result: SocketAck) => void) {
	const sess = Sessions[sessionID];
	if (sess.drafting) {
		ack?.(new SocketError("Already drafting."));
		return;
	}

	for (const user of sess.users) if (user !== userID) Connections[user]?.socket.emit("readyCheck");
	ack?.(new SocketAck());
}

async function startDraft(userID: UserID, sessionID: SessionID, ack: (result: SocketAck) => void) {
	const sess = Sessions[sessionID];
	if (sess.users.size === 0 || sess.users.size + sess.bots < 2)
		return ack?.(
			new SocketError(`Not enough players`, `Can't start draft: Not enough players (min. 2 including bots).`)
		);
	const r = await Sessions[sessionID].startDraft();
	if (!isSocketError(r)) startPublicSession(sess);
	ack?.(r);
}

async function startGlimpseDraft(
	userID: UserID,
	sessionID: SessionID,
	uncheckedBoosterCount: unknown,
	uncheckedBurnedCardsPerRound: unknown,
	ack: (result: SocketAck) => void
) {
	if (
		!isNumber(uncheckedBoosterCount) ||
		!isNumber(uncheckedBurnedCardsPerRound) ||
		uncheckedBoosterCount < 1 ||
		uncheckedBurnedCardsPerRound < 1
	)
		return ack?.(new SocketError("Invalid parameters."));
	const boosterCount = uncheckedBoosterCount;
	const burnedCardsPerRound = uncheckedBurnedCardsPerRound;

	const sess = Sessions[sessionID];
	if (sess.users.size === 0 || sess.users.size + sess.bots < 2)
		return ack?.(
			new SocketError(`Not enough players`, `Can't start draft: Not enough players (min. 2 including bots).`)
		);

	const r = await sess.startDraft({
		boostersPerPlayer: boosterCount,
		burnedCardsPerRound: burnedCardsPerRound,
	});
	if (!isSocketError(r)) startPublicSession(sess);
	ack?.(r);
}

async function startSupremeDraft(
	userID: UserID,
	sessionID: SessionID,
	uncheckedBoosterCount: unknown,
	uncheckedPickedCardsPerRound: unknown,
	ack: (result: SocketAck) => void
) {
	if (
		!isNumber(uncheckedBoosterCount) ||
		!isNumber(uncheckedPickedCardsPerRound) ||
		uncheckedBoosterCount < 1 ||
		uncheckedPickedCardsPerRound < 1
	)
		return ack?.(new SocketError("Invalid parameters."));
	const boosterCount = uncheckedBoosterCount;
	const pickedCardsPerRound = uncheckedPickedCardsPerRound;

	const sess = Sessions[sessionID];
	if (sess.users.size !== 1 || sess.bots != 0)
		return ack?.(new SocketError(`Invalid number of players`, `Supreme draft requires exactly 1 player.`));

	const r = await sess.startDraft({
		boostersPerPlayer: boosterCount,
		discardRemainingCardsAt: Number.POSITIVE_INFINITY,
		pickedCardsPerRound,
		burnedCardsPerRound: 0,
	});
	if (!isSocketError(r)) startPublicSession(sess);
	ack?.(r);
}

function stopDraft(userID: UserID, sessionID: SessionID) {
	Sessions[sessionID].stopDraft();
}

function pauseDraft(userID: UserID, sessionID: SessionID) {
	Sessions[sessionID].pauseDraft();
}

function resumeDraft(userID: UserID, sessionID: SessionID) {
	Sessions[sessionID].resumeDraft();
}

function startSilentAuctionDraft(
	userID: UserID,
	sessionID: SessionID,
	boosterCount: unknown,
	startingFunds: unknown,
	pricePaid: unknown,
	reservePrice: unknown,
	tiebreakers: unknown,
	ack: (result: SocketAck) => void
) {
	const sess = Sessions[sessionID];
	const localBoosterCount = !isNumber(boosterCount) ? parseInt(boosterCount as string) : boosterCount;
	const localStartingFunds = !isNumber(startingFunds) ? parseInt(startingFunds as string) : startingFunds;
	const localReservePrice = !isNumber(reservePrice) ? parseInt(reservePrice as string) : reservePrice;

	if (pricePaid !== "first" && pricePaid !== "second")
		return ack?.(new SocketError("Invalid parameter 'pricePaid'."));

	if (!isArrayOf(isTiebreaker)(tiebreakers)) return ack?.(new SocketError("Invalid parameter 'tiebreakers'."));
	if (new Set(tiebreakers.map((t) => t.property)).size !== tiebreakers.length)
		return ack?.(new SocketError("Duplicate properties in parameter 'tiebreakers'."));

	if (!isInteger(localBoosterCount) || localBoosterCount <= 0)
		return ack?.(new SocketError("Invalid parameter 'boosterCount'."));
	if (!isInteger(localStartingFunds) || localStartingFunds <= 0)
		return ack?.(new SocketError("Invalid parameter 'startingFunds'."));
	if (!isInteger(localReservePrice) || localReservePrice < 0)
		return ack?.(new SocketError("Invalid parameter 'reservePrice'."));

	const r = sess.startSilentAuctionDraft(localBoosterCount, {
		startingFunds: localStartingFunds,
		pricePaid,
		reservePrice: localReservePrice,
		tiebreakers,
	});
	if (isSocketError(r)) return ack(r);
	startPublicSession(sess);
	ack?.(new SocketAck());
}

function silentAuctionDraftBid(userID: UserID, sessionID: SessionID, bids: unknown, ack: (result: SocketAck) => void) {
	const sess = Sessions[sessionID];
	if (!isArrayOf(isInteger)(bids)) return ack?.(new SocketError("Invalid parameter 'bids'."));
	const r = sess.silentAuctionDraftBid(userID, bids);
	ack?.(r);
}

function startGridDraft(
	userID: UserID,
	sessionID: SessionID,
	boosterCount: unknown,
	twoPicksPerGrid: unknown,
	regularBoosters: unknown,
	ack: (result: SocketAck) => void
) {
	const sess = Sessions[sessionID];
	const localBoosterCount = !isNumber(boosterCount) ? parseInt(boosterCount as string) : boosterCount;
	const localTwoPicksPerGrid = isBoolean(twoPicksPerGrid) ? twoPicksPerGrid : false;
	const localRegularBoosters = isBoolean(regularBoosters) ? regularBoosters : true;
	const r = sess.startGridDraft(
		localBoosterCount && !isNaN(localBoosterCount) ? localBoosterCount : 18,
		localTwoPicksPerGrid,
		localRegularBoosters
	);
	if (isSocketError(r)) return ack(r);
	startPublicSession(sess);
	ack?.(new SocketAck());
}

function startRochesterDraft(userID: UserID, sessionID: SessionID, ack: (s: SocketAck) => void) {
	const sess = Sessions[sessionID];
	const r = sess.startRochesterDraft();
	if (!isSocketError(r)) startPublicSession(sess);
	ack(r);
}

function startRotisserieDraft(
	userID: UserID,
	sessionID: SessionID,
	options: RotisserieDraftStartOptions,
	ack: (s: SocketAck) => void
) {
	const sess = Sessions[sessionID];
	const ret = sess.startRotisserieDraft(options);
	if (!isMessageError(ret)) startPublicSession(sess);
	ack(ret);
}

function startWinstonDraft(
	userID: UserID,
	sessionID: SessionID,
	boosterCount: unknown,
	pileCount: unknown,
	removeBasicLands: unknown,
	ack: (s: SocketAck) => void
) {
	const sess = Sessions[sessionID];
	const localBoosterCount = !isNumber(boosterCount) ? parseInt(boosterCount as string) : boosterCount;
	const localPileCount = Math.min(8, Math.max(2, !isNumber(pileCount) ? parseInt(pileCount as string) : pileCount));
	const localRemoveBasicLands = isBoolean(removeBasicLands) ? removeBasicLands : true;
	const r = sess.startWinstonDraft(localBoosterCount ?? 6, localPileCount ?? 3, localRemoveBasicLands);
	if (!isSocketError(r)) startPublicSession(sess);
	ack(r);
}

function startWinchesterDraft(
	userID: UserID,
	sessionID: SessionID,
	boosterPerPlayer: unknown,
	removeBasicLands: unknown,
	ack: (s: SocketAck) => void
) {
	const sess = Sessions[sessionID];
	const localBoosterPerPlayer = !isNumber(boosterPerPlayer) ? parseInt(boosterPerPlayer as string) : boosterPerPlayer;
	const localRemoveBasicLands = isBoolean(removeBasicLands) ? removeBasicLands : true;
	const r = sess.startWinchesterDraft(localBoosterPerPlayer ?? 6, localRemoveBasicLands);
	if (!isSocketError(r)) startPublicSession(sess);
	ack(r);
}

function startHousmanDraft(
	userID: UserID,
	sessionID: SessionID,
	handSize: unknown,
	revealedCardsCount: unknown,
	exchangeCount: unknown,
	roundCount: unknown,
	removeBasicLands: unknown,
	turnOrder: unknown,
	ack: (s: SocketAck) => void
) {
	const sess = Sessions[sessionID];
	const _handSize = !isNumber(handSize) ? parseInt(handSize as string) : handSize;
	const _revealedCardsCount = !isNumber(revealedCardsCount)
		? parseInt(revealedCardsCount as string)
		: revealedCardsCount;
	const _exchangeCount = !isNumber(exchangeCount) ? parseInt(exchangeCount as string) : exchangeCount;
	const _roundCount = !isNumber(roundCount) ? parseInt(roundCount as string) : roundCount;
	const _removeBasicLands = isBoolean(removeBasicLands) ? removeBasicLands : true;
	const _turnOrder = turnOrder === "classic" || turnOrder === "snake" ? turnOrder : "classic";
	const r = sess.startHousmanDraft(
		_handSize,
		_revealedCardsCount,
		_exchangeCount,
		_roundCount,
		_removeBasicLands,
		_turnOrder
	);
	if (!isSocketError(r)) startPublicSession(sess);
	ack(r);
}

function startMinesweeperDraft(
	userID: UserID,
	sessionID: SessionID,
	unsafeGridCount: unknown,
	unsafeGridWidth: unknown,
	unsafeGridHeight: unknown,
	unsafePicksPerGrid: unknown,
	unsafeRevealCenter: unknown,
	unsafeRevealCorners: unknown,
	unsafeRevealBorders: unknown,
	ack: (result: SocketAck) => void
) {
	const sess = Sessions[sessionID];
	const gridCount = !isNumber(unsafeGridCount) ? parseInt(unsafeGridCount as string) : unsafeGridCount;
	const gridWidth = !isNumber(unsafeGridWidth) ? parseInt(unsafeGridWidth as string) : unsafeGridWidth;
	const gridHeight = !isNumber(unsafeGridHeight) ? parseInt(unsafeGridHeight as string) : unsafeGridHeight;
	const picksPerGrid = !isNumber(unsafePicksPerGrid) ? parseInt(unsafePicksPerGrid as string) : unsafePicksPerGrid;
	const revealCenter = !isBoolean(unsafeRevealCenter) ? false : unsafeRevealCenter;
	const revealCorners = !isBoolean(unsafeRevealCorners) ? false : unsafeRevealCorners;
	const revealBorders = !isBoolean(unsafeRevealBorders) ? false : unsafeRevealBorders;
	if (
		!isNumber(gridCount) ||
		gridCount <= 0 ||
		!isNumber(gridWidth) ||
		gridWidth <= 0 ||
		!isNumber(gridHeight) ||
		gridHeight <= 0 ||
		!isNumber(picksPerGrid) ||
		picksPerGrid <= 0 ||
		picksPerGrid > gridWidth * gridHeight ||
		!isBoolean(revealCenter) ||
		!isBoolean(revealCorners) ||
		!isBoolean(revealBorders)
	) {
		return ack?.(
			new SocketError(
				`Invalid parameters`,
				`Grid parameters are invalid. Please check your settings.`,
				`Values: gridCount: ${gridCount}, gridWidth: ${gridWidth}, gridHeight: ${gridHeight}, picksPerGrid: ${picksPerGrid}, revealCenter: ${revealCenter}, revealCorners: ${revealCorners}, revealBorders: ${revealBorders}`
			)
		);
	}
	if (!revealCenter && !revealCorners && !revealBorders)
		return ack?.(
			new SocketError(
				`Invalid parameters`,
				`At least one of revealCenter, revealCorners, or revealBorders must be true.`,
				`Values: gridCount: ${gridCount}, gridWidth: ${gridWidth}, gridHeight: ${gridHeight}, picksPerGrid: ${picksPerGrid}, revealCenter: ${revealCenter}, revealCorners: ${revealCorners}, revealBorders: ${revealBorders}`
			)
		);
	const ret = sess.startMinesweeperDraft(
		gridCount,
		gridWidth,
		gridHeight,
		picksPerGrid,
		revealCenter,
		revealCorners,
		revealBorders
	);
	if (isSocketError(ret)) return ack?.(ret);

	startPublicSession(sess);
	ack?.(new SocketAck());
}

function startSolomonDraft(
	userID: UserID,
	sessionID: SessionID,
	cardCount: unknown,
	roundCount: unknown,
	removeBasicLands: unknown,
	ack: (s: SocketAck) => void
) {
	const _cardCount = !isNumber(cardCount) ? parseInt(cardCount as string) : cardCount;
	const _roundCount = !isNumber(roundCount) ? parseInt(roundCount as string) : roundCount;
	const _removeBasicLands = isBoolean(removeBasicLands) ? removeBasicLands : true;
	const r = Sessions[sessionID].startSolomonDraft(_cardCount, _roundCount, _removeBasicLands);
	if (!isSocketError(r)) startPublicSession(Sessions[sessionID]);
	ack(r);
}

function startTeamSealed(
	userID: UserID,
	sessionID: SessionID,
	boostersPerTeam: number,
	customBoosters: Array<string>,
	teams: UserID[][],
	ack: (result: SocketAck) => void
) {
	if (!Number.isInteger(boostersPerTeam) || boostersPerTeam <= 0) {
		ack?.(new SocketError("Error", "Invalid 'boostersPerTeam' parameter."));
		return;
	}
	const r = Sessions[sessionID].startTeamSealed(boostersPerTeam, customBoosters, teams);
	ack?.(r);
}

// Session Settings
function setSessionOwner(userID: UserID, sessionID: SessionID, newOwnerID: UserID) {
	Sessions[sessionID]?.setSessionOwner(newOwnerID);
}

function removePlayer(userID: UserID, sessionID: SessionID, userToRemove: UserID) {
	if (
		!Sessions[sessionID] ||
		userToRemove === Sessions[sessionID].owner ||
		!Sessions[sessionID].users.has(userToRemove)
	)
		return;

	removeUserFromSession(sessionID, userToRemove);
	Sessions[sessionID].replaceDisconnectedPlayers();
	Sessions[sessionID].notifyUserChange();

	if (!Connections[userToRemove])
		return console.error(`removePlayer: No connection found for userID ${userToRemove}`);

	const newSession = newSessionID();
	joinSession(newSession, userToRemove);
	Connections[userToRemove].socket.emit("setSession", newSession);
	Connections[userToRemove].socket.emit(
		"message",
		new Message("Removed from session", `You've been removed from session '${sessionID}' by its owner.`)
	);
}
function setSeating(userID: UserID, sessionID: SessionID, seating: Array<UserID>) {
	if (!Sessions[sessionID].setSeating(seating)) Sessions[sessionID].notifyUserChange(); // Something unexpected happened, notify to avoid any potential de-sync.
}
function boostersPerPlayer(userID: UserID, sessionID: SessionID, boostersPerPlayer: number) {
	if (!SessionsSettingsProps.boostersPerPlayer(boostersPerPlayer)) return;

	if (boostersPerPlayer === Sessions[sessionID].boostersPerPlayer) return;

	Sessions[sessionID].setBoostersPerPlayer(boostersPerPlayer, userID);
}

function cardsPerBooster(userID: UserID, sessionID: SessionID, cardsPerBooster: number) {
	if (!SessionsSettingsProps.cardsPerBooster(cardsPerBooster)) return;

	if (cardsPerBooster === Sessions[sessionID].cardsPerBooster) return;

	Sessions[sessionID].setCardsPerBooster(cardsPerBooster, userID);
}

function teamDraft(userID: UserID, sessionID: SessionID, unsafeTeamDraft: unknown) {
	const teamDraft = isBoolean(unsafeTeamDraft) ? unsafeTeamDraft : unsafeTeamDraft === "true" || !!unsafeTeamDraft;
	if (!SessionsSettingsProps.teamDraft(teamDraft)) return;
	Sessions[sessionID].setTeamDraft(teamDraft);
}

function setRandomizeSeatingOrder(userID: UserID, sessionID: SessionID, unsafeRandomizeSeatingOrder: unknown) {
	const randomizeSeatingOrder = isBoolean(unsafeRandomizeSeatingOrder)
		? unsafeRandomizeSeatingOrder
		: unsafeRandomizeSeatingOrder === "true" || !!unsafeRandomizeSeatingOrder;
	if (!SessionsSettingsProps.randomizeSeatingOrder(randomizeSeatingOrder)) return;
	Sessions[sessionID].setRandomizeSeatingOrder(randomizeSeatingOrder);
}

function setDisableBotSuggestions(userID: UserID, sessionID: SessionID, unsafeDisableBotSuggestions: unknown) {
	const disableBotSuggestions = isBoolean(unsafeDisableBotSuggestions)
		? unsafeDisableBotSuggestions
		: unsafeDisableBotSuggestions === "true" || !!unsafeDisableBotSuggestions;
	if (!SessionsSettingsProps.disableBotSuggestions(disableBotSuggestions)) return;
	Sessions[sessionID].setDisableBotSuggestions(disableBotSuggestions);
}

function setDistributionMode(userID: UserID, sessionID: SessionID, distributionMode: DistributionMode) {
	if (!SessionsSettingsProps.distributionMode(distributionMode)) return;

	Sessions[sessionID].distributionMode = distributionMode;
	Sessions[sessionID].emitToConnectedNonOwners("sessionOptions", { distributionMode: distributionMode });
}

function setCustomBoosters(userID: UserID, sessionID: SessionID, customBoosters: Array<string>) {
	if (!SessionsSettingsProps.customBoosters(customBoosters)) return;

	Sessions[sessionID].customBoosters = customBoosters;
	Sessions[sessionID].emitToConnectedNonOwners("sessionOptions", { customBoosters: customBoosters });
}

function setBots(userID: UserID, sessionID: SessionID, bots: number) {
	if (!SessionsSettingsProps.bots(bots)) return;

	if (bots === Sessions[sessionID].bots) return;

	Sessions[sessionID].bots = bots;
	Sessions[sessionID].emitToConnectedNonOwners("sessionOptions", { bots: bots });
}

function setRestriction(userID: UserID, sessionID: SessionID, setRestriction: Array<SetCode>) {
	if (!SessionsSettingsProps.setRestriction(setRestriction)) return;

	Sessions[sessionID].setRestriction = setRestriction;
	Sessions[sessionID].emitToConnectedNonOwners("setRestriction", setRestriction);
	if (Sessions[sessionID].isPublic) updatePublicSession(sessionID);
}

function parseCustomCardListEvent(
	userID: UserID,
	sessionID: SessionID,
	customCardList: unknown,
	ack: (result: SocketAck) => void
) {
	if (!isString(customCardList) || customCardList === "") return ack?.(new SocketError("No list supplied."));
	parseCustomCardList(Sessions[sessionID], customCardList, {}, ack);
}

function importCube(userID: UserID, sessionID: SessionID, data: unknown, ack: (result: SocketAck) => void) {
	if (!isObject(data)) return ack?.(new SocketError("Invalid data"));
	if (!hasProperty("service", isString)(data)) return ack?.(new SocketError("Invalid data: Missing service."));
	if (!hasOptionalProperty("name", isString)(data))
		return ack?.(new SocketError("Invalid data: name should be a string."));
	if (!hasOptionalProperty("matchVersions", isBoolean)(data))
		return ack?.(new SocketError("Invalid data: matchVersions should be a boolean."));
	if (!hasOptionalProperty("retrieveCustomProperties", isBoolean)(data))
		return ack?.(new SocketError("Invalid data: retrieveCustomProperties should be a boolean."));
	if (!hasOptionalProperty("sendResultsToCubeCobra", isBoolean)(data))
		return ack?.(new SocketError("Invalid data: sendResultsToCubeCobra should be a boolean."));
	if (!["Cube Cobra", "CubeArtisan"].includes(data.service))
		return ack?.(new SocketError(`Invalid cube service ('${data.service}').`));
	if (!hasProperty("cubeID", isString)(data)) return ack?.(new SocketError("Invalid data: Missing cubeID."));
	// Cube Infos from Cube Cobra: https://cubecobra.com/cube/api/cubeJSON/${data.cubeID} ; Cards are listed in the cards array and hold a scryfall id (cardID property), but this endpoint is extremely rate limited.
	const validateResponse = (
		response: AxiosResponse<unknown, unknown>,
		data: { service: string; cubeID: string },
		ack: (result: SocketAck) => void
	): response is AxiosResponse<unknown, unknown> & { data: string } => {
		if (response.status !== 200) {
			ack?.(
				new SocketError(
					"Error retrieving cube.",
					`${data.service} responded '${response.statusText} (${response.status}): ${response.data}'.`
				)
			);
			return false;
		} else if (
			(data.service === "Cube Cobra" && response.data === "Cube not found.") ||
			(data.service === "CubeArtisan" && response.request.path.endsWith("/404"))
		) {
			ack?.(new SocketError("Cube not found.", `Cube '${data.cubeID}' not found on ${data.service}.`));
			return false;
		} else if (!response.data) {
			ack?.(new SocketError("Empty Cube.", `Cube '${data.cubeID}' on ${data.service} seems empty.`));
			return false;
		} else if (!isString(response.data)) {
			ack?.(new SocketError("Invalid Cube.", `Cube '${data.cubeID}' on ${data.service} is invalid.`));
			return false;
		}
		return true;
	};

	const parseCustomCardListOptions: Options = { name: data.name };
	if (data.service === "Cube Cobra" && data.cubeID) {
		parseCustomCardListOptions.cubeCobraID = data.cubeID;
		if (isBoolean(data.sendResultsToCubeCobra))
			Sessions[sessionID].sendResultsToCubeCobra = data.sendResultsToCubeCobra;
	}

	const errorHandler = (err: AxiosError) =>
		ack?.(
			new SocketError(
				"Error retrieving cube.",
				`Couldn't retrieve the card list from ${data.service}.`,
				`Full error: ${err}`
			)
		);

	// Plain text card list
	const fromTextList = (
		sessionID: SessionID,
		data: { name?: string; service: string; cubeID: string },
		ack: (result: SocketAck) => void
	) => {
		let url = null;
		if (data.service === "Cube Cobra") url = `https://cubecobra.com/cube/api/cubelist/${data.cubeID}`;
		if (data.service === "CubeArtisan") url = `https://cubeartisan.net/cube/${data.cubeID}/export/plaintext`;
		if (!url) return ack?.(new SocketError(`Invalid cube service ('${data.service}').`));
		axios
			.get(url, { timeout: 3000 })
			.then((response) => {
				if (validateResponse(response, data, ack))
					parseCustomCardList(Sessions[sessionID], response.data, parseCustomCardListOptions, ack);
			})
			.catch(errorHandler);
	};

	if (data.retrieveCustomProperties) {
		// CSV format
		if (data.service !== "Cube Cobra") return ack?.(new SocketError(`Invalid cube service ('${data.service}').`));
		const url = `https://cubecobra.com/cube/download/csv/${data.cubeID}`;
		axios
			.get(url, { timeout: 3000 })
			.then((response) => {
				if (validateResponse(response, data, ack)) {
					const csv = parseCSV(response.data);
					if (csv.length < 2) return ack?.(new SocketError(`Empty cube ('${data.cubeID}').`));
					const header = csv[0];
					const columns = {
						name: header.indexOf("name"),
						cmc: header.indexOf("CMC"),
						color: header.indexOf("Color"),
						type: header.indexOf("Type"),
						set: header.indexOf("Set"),
						collector_number: header.indexOf("Collector Number"),
						rarity: header.indexOf("Rarity"),
						image: header.indexOf("image URL"),
						image_back: header.indexOf("image Back URL"),
						finish: header.indexOf("Finish"),
						maybeboard: header.indexOf("maybeboard"),
					};
					if (Object.values(columns).some((x) => x === -1))
						return ack?.(new SocketError(`Invalid CSV header ('${data.cubeID}').`));
					const cards = csv.slice(1).map((row) => {
						return {
							name: row[columns.name],
							cmc: row[columns.cmc],
							color: row[columns.color],
							type: row[columns.type],
							set: row[columns.set],
							collector_number: row[columns.collector_number],
							rarity: row[columns.rarity],
							image: row[columns.image],
							image_back: row[columns.image_back],
							foil: row[columns.finish] === "Foil",
							maybeboard: row[columns.maybeboard] === "true",
						};
					});
					const defaultSheet: Sheet = { collation: "random", cards: {} };
					const customCards: Record<string, Card> = {};
					let customCardID = 0;
					const cardList: CustomCardList = {
						customCards: customCards,
						layouts: false,
						sheets: { default: defaultSheet },
					};
					if (parseCustomCardListOptions.name) cardList.name = parseCustomCardListOptions.name;
					for (const card of cards) {
						if (card.maybeboard) continue;

						const cardID = data.matchVersions
							? matchCardVersion(card.name, card.set.toLowerCase(), card.collector_number, true)
							: CardsByName[card.name];
						if (!cardID)
							return ack?.(
								new SocketError(
									`Could not find card '${card.name}' (${card.set}, ${card.collector_number}).`
								)
							);
						if (card.image !== "") {
							const cardData: Card = { ...getCard(cardID), related_cards: [cardID], is_custom: true };
							const customID = `Custom_${customCardID}`;
							customCardID += 1;
							cardData.id = customID;
							if (!data.matchVersions) {
								cardData.set = card.set;
								cardData.collector_number = card.collector_number;
							}
							cardData.image_uris = { en: card.image };
							cardData.type = card.type;
							cardData.cmc = parseInt(card.cmc);
							cardData.mana_cost = `{${card.cmc}}`; // NOTE: Cube Cobra currently only exposes the CMC, not the full mana cost. We could try to guess using the color(s), but it would still be an approximation.
							cardData.colors = card.color.split("") as CardColor[];
							cardData.foil = card.foil;
							if (card.image_back !== "") {
								if (!cardData.back) {
									cardData.back = {
										name: card.name,
										printed_names: {},
										type: card.type,
										subtypes: [],
										image_uris: { en: card.image_back },
									};
								} else {
									cardData.back = { ...cardData.back, image_uris: { en: card.image_back } };
								}
							}
							customCards[customID] = cardData;
							defaultSheet.cards[customID] = 1;
						} else {
							if (Object.prototype.hasOwnProperty.call(defaultSheet.cards, cardID))
								defaultSheet.cards[cardID] += 1;
							else defaultSheet.cards[cardID] = 1;
						}
					}
					useCustomCardList(Sessions[sessionID], cardList);
					ack?.(new SocketAck());
				}
			})
			.catch(errorHandler);
	} else if (!data.matchVersions) {
		fromTextList(sessionID, data, ack);
	} else {
		// Xmage (.dck) format
		let url = null;
		if (data.service === "Cube Cobra") url = `https://cubecobra.com/cube/download/xmage/${data.cubeID}`;
		if (data.service === "CubeArtisan") url = `https://cubeartisan.net/cube/${data.cubeID}/export/xmage`;
		if (!url) return ack?.(new SocketError(`Invalid cube service ('${data.service}').`));

		axios
			.get(url, { timeout: 3000 })
			.then((response) => {
				if (validateResponse(response, data, ack)) {
					const converted = XMageToArena(response.data);
					// Fallback to plain text list
					if (!converted) fromTextList(sessionID, data, ack);
					else
						parseCustomCardList(
							Sessions[sessionID],
							converted,
							{ ...parseCustomCardListOptions, fallbackToCardName: true },
							ack
						);
				}
			})
			.catch(errorHandler);
	}
}

function loadLocalCustomCardList(
	userID: UserID,
	sessionID: SessionID,
	cubeName: string,
	ack: (result: SocketAck) => void
) {
	if (!(cubeName in ParsedCubeLists)) {
		ack?.(new SocketError(`Unknown cube '${cubeName}'`));
		return;
	}

	useCustomCardList(Sessions[sessionID], ParsedCubeLists[cubeName]);

	ack?.(new SocketAck());
}

function ignoreCollections(userID: UserID, sessionID: SessionID, ignoreCollections: boolean) {
	if (!SessionsSettingsProps.ignoreCollections(ignoreCollections)) return;
	Sessions[sessionID].ignoreCollections = ignoreCollections;
	Sessions[sessionID].emitToConnectedNonOwners("ignoreCollections", Sessions[sessionID].ignoreCollections);
}

function setPickTimer(userID: UserID, sessionID: SessionID, maxTimer: number) {
	if (!SessionsSettingsProps.maxTimer(maxTimer)) return;
	Sessions[sessionID].maxTimer = maxTimer;
	Sessions[sessionID].emitToConnectedNonOwners("setPickTimer", maxTimer);
}

function setTournamentTimer(userID: UserID, sessionID: SessionID, tournamentTimer: unknown) {
	if (!isBoolean(tournamentTimer)) return;
	Sessions[sessionID].tournamentTimer = tournamentTimer;
	Sessions[sessionID].emitToConnectedNonOwners("sessionOptions", { tournamentTimer });
}

function setReviewTimer(userID: UserID, sessionID: SessionID, reviewTimer: unknown) {
	if (!isInteger(reviewTimer) || reviewTimer < 0) return;
	Sessions[sessionID].reviewTimer = reviewTimer;
	Sessions[sessionID].emitToConnectedNonOwners("sessionOptions", { reviewTimer });
}

function setHidePicks(userID: UserID, sessionID: SessionID, hidePicks: unknown) {
	if (!isBoolean(hidePicks)) return;
	Sessions[sessionID].hidePicks = hidePicks;
	Sessions[sessionID].emitToConnectedNonOwners("sessionOptions", { hidePicks });
}

function setMaxPlayers(userID: UserID, sessionID: SessionID, maxPlayers: number) {
	if (!SessionsSettingsProps.maxPlayers(maxPlayers)) return;
	Sessions[sessionID].maxPlayers = maxPlayers;
	Sessions[sessionID].emitToConnectedNonOwners("setMaxPlayers", maxPlayers);
}

function setMythicPromotion(userID: UserID, sessionID: SessionID, mythicPromotion: boolean) {
	if (!SessionsSettingsProps.mythicPromotion(mythicPromotion)) return;
	Sessions[sessionID].mythicPromotion = mythicPromotion;
	Sessions[sessionID].emitToConnectedNonOwners("sessionOptions", { mythicPromotion: mythicPromotion });
}

function setUseBoosterContent(userID: UserID, sessionID: SessionID, useBoosterContent: boolean) {
	if (!SessionsSettingsProps.useBoosterContent(useBoosterContent)) return;
	Sessions[sessionID].useBoosterContent = useBoosterContent;
	Sessions[sessionID].emitToConnectedNonOwners("sessionOptions", { useBoosterContent: useBoosterContent });
}

function setBoosterContent(
	userID: UserID,
	sessionID: SessionID,
	boosterContent: { common: number; uncommon: number; rare: number }
) {
	if (!SessionsSettingsProps.boosterContent(boosterContent)) return;
	if (
		Object.keys(boosterContent).every(
			(r) => (boosterContent as { [r: string]: number })[r] === Sessions[sessionID].boosterContent[r]
		)
	)
		return;

	Sessions[sessionID].boosterContent = boosterContent;
	Sessions[sessionID].emitToConnectedNonOwners("sessionOptions", { boosterContent: boosterContent });
}

function setUsePredeterminedBoosters(userID: UserID, sessionID: SessionID, value: boolean) {
	if (!SessionsSettingsProps.usePredeterminedBoosters(value)) return;
	Sessions[sessionID].setUsePredeterminedBoosters(value);
}

function setBoosters(userID: UserID, sessionID: SessionID, text: string, ack: (result: SocketAck) => void) {
	if (!isString(text)) return ack?.(new SocketError("Invalid Parameter 'text'."));

	const r = Sessions[sessionID].setPredeterminedBoosters(text);
	ack?.(r);
}

function shuffleBoosters(userID: UserID, sessionID: SessionID, ack: (result: SocketAck) => void) {
	if (!Sessions[sessionID].predeterminedBoosters || Sessions[sessionID].predeterminedBoosters.length === 0) {
		ack?.(new SocketError("No boosters to shuffle."));
	} else {
		shuffleArray(Sessions[sessionID].predeterminedBoosters);
		ack?.(new SocketAck());
	}
}

function setPersonalLogs(userID: UserID, sessionID: SessionID, value: boolean) {
	if (!SessionsSettingsProps.personalLogs(value)) return;
	Sessions[sessionID].personalLogs = value;
	Sessions[sessionID].emitToConnectedNonOwners("sessionOptions", { personalLogs: value });
}

function setDraftLogRecipients(userID: UserID, sessionID: SessionID, draftLogRecipients: DraftLogRecipients) {
	if (!SessionsSettingsProps.draftLogRecipients(draftLogRecipients)) return;
	Sessions[sessionID].draftLogRecipients = draftLogRecipients;
	Sessions[sessionID].emitToConnectedNonOwners("sessionOptions", { draftLogRecipients });
}

function setDraftLogUnlockTimer(userID: UserID, sessionID: SessionID, draftLogUnlockTimer: unknown /* minutes */) {
	if (!isInteger(draftLogUnlockTimer) || draftLogUnlockTimer < 0) return;
	Sessions[sessionID].draftLogUnlockTimer = draftLogUnlockTimer;
	Sessions[sessionID].emitToConnectedNonOwners("sessionOptions", { draftLogUnlockTimer: draftLogUnlockTimer });
}

function setMaxDuplicates(
	userID: UserID,
	sessionID: SessionID,
	maxDuplicates: { common: number; uncommon: number; rare: number; mythic: number } | null
) {
	if (!SessionsSettingsProps.maxDuplicates(maxDuplicates)) return;
	Sessions[sessionID].maxDuplicates = maxDuplicates;
	Sessions[sessionID].emitToConnectedNonOwners("sessionOptions", { maxDuplicates });
}

function setColorBalance(userID: UserID, sessionID: SessionID, colorBalance: boolean) {
	if (!SessionsSettingsProps.colorBalance(colorBalance)) return;
	if (colorBalance === Sessions[sessionID].colorBalance) return;

	Sessions[sessionID].colorBalance = colorBalance;
	Sessions[sessionID].emitToConnectedNonOwners("sessionOptions", { colorBalance });
}

function setFoil(userID: UserID, sessionID: SessionID, foil: boolean) {
	if (!SessionsSettingsProps.foil(foil)) return;
	if (foil === Sessions[sessionID].foil) return;

	Sessions[sessionID].foil = foil;
	Sessions[sessionID].emitToConnectedNonOwners("sessionOptions", { foil });
}

function setUseCustomCardList(userID: UserID, sessionID: SessionID, useCustomCardList: boolean) {
	if (!SessionsSettingsProps.useCustomCardList(useCustomCardList)) return;
	if (useCustomCardList == Sessions[sessionID].useCustomCardList) return;

	Sessions[sessionID].useCustomCardList = useCustomCardList;
	Sessions[sessionID].emitToConnectedNonOwners("sessionOptions", { useCustomCardList });
	if (Sessions[sessionID].isPublic) updatePublicSession(sessionID);
}

function setCustomCardListWithReplacement(
	userID: UserID,
	sessionID: SessionID,
	customCardListWithReplacement: unknown
) {
	if (!isBoolean(customCardListWithReplacement)) return;
	if (customCardListWithReplacement === Sessions[sessionID].customCardListWithReplacement) return;

	Sessions[sessionID].customCardListWithReplacement = customCardListWithReplacement;
	Sessions[sessionID].emitToConnectedNonOwners("sessionOptions", { customCardListWithReplacement });
}

function setCustomCardListDuplicateProtection(
	userID: UserID,
	sessionID: SessionID,
	customCardListDuplicateProtection: unknown
) {
	if (!isBoolean(customCardListDuplicateProtection)) return;
	if (customCardListDuplicateProtection === Sessions[sessionID].customCardListDuplicateProtection) return;

	Sessions[sessionID].customCardListDuplicateProtection = customCardListDuplicateProtection;
	Sessions[sessionID].emitToConnectedNonOwners("sessionOptions", { customCardListDuplicateProtection });
}

function setCustomCardListSetting(userID: UserID, sessionID: SessionID, key: unknown, value: unknown) {
	if (!isString(key)) return console.error(`setCustomCardListSetting: Invalid key type '${typeof key}': '${key}'`);
	if (!isKeyOfCCLSettings(key)) return console.error(`setCustomCardListSetting: Invalid key '${key}'`);
	if (!checkCCLSettingType(key, value))
		return console.error(
			`setCustomCardListSetting: Invalid value type '${typeof value}': '${value}' for key '${key}'`
		);

	if (!Sessions[sessionID].customCardList) return;
	if (!Sessions[sessionID].customCardList.settings)
		Sessions[sessionID].customCardList.settings = { refillWhenEmpty: false };

	if (Sessions[sessionID].customCardList.settings[key] === value) return;

	(Sessions[sessionID].customCardList.settings as IIndexable)[key] = value;
	console.log(Sessions[sessionID].customCardList.settings);
	Sessions[sessionID].emitToConnectedUsers("updateCustomCardListSetting", key, value);
}

function setDoubleMastersMode(userID: UserID, sessionID: SessionID, doubleMastersMode: boolean) {
	if (!SessionsSettingsProps.doubleMastersMode(doubleMastersMode)) return;
	if (doubleMastersMode === Sessions[sessionID].doubleMastersMode) return;

	Sessions[sessionID].doubleMastersMode = doubleMastersMode;
	Sessions[sessionID].emitToConnectedNonOwners("sessionOptions", { doubleMastersMode });
	if (Sessions[sessionID].isPublic) updatePublicSession(sessionID);
}

function setPickedCardsPerRound(userID: UserID, sessionID: SessionID, pickedCardsPerRound: number) {
	if (!SessionsSettingsProps.pickedCardsPerRound(pickedCardsPerRound)) return;
	if (pickedCardsPerRound === Sessions[sessionID].pickedCardsPerRound) return;

	Sessions[sessionID].pickedCardsPerRound = pickedCardsPerRound;
	Sessions[sessionID].emitToConnectedNonOwners("sessionOptions", { pickedCardsPerRound });
}

function setBurnedCardsPerRound(userID: UserID, sessionID: SessionID, burnedCardsPerRound: number) {
	if (!SessionsSettingsProps.burnedCardsPerRound(burnedCardsPerRound)) return;
	if (burnedCardsPerRound === Sessions[sessionID].burnedCardsPerRound) return;

	Sessions[sessionID].burnedCardsPerRound = burnedCardsPerRound;
	Sessions[sessionID].emitToConnectedNonOwners("sessionOptions", { burnedCardsPerRound });
}

function setDiscardRemainingCardsAt(userID: UserID, sessionID: SessionID, discardRemainingCardsAt: number) {
	if (!SessionsSettingsProps.discardRemainingCardsAt(discardRemainingCardsAt)) return;
	if (discardRemainingCardsAt === Sessions[sessionID].discardRemainingCardsAt) return;

	Sessions[sessionID].discardRemainingCardsAt = discardRemainingCardsAt;
	Sessions[sessionID].emitToConnectedNonOwners("sessionOptions", { discardRemainingCardsAt });
}

function setPublic(userID: UserID, sessionID: SessionID, isPublic: boolean) {
	if (!SessionsSettingsProps.isPublic(isPublic)) return;
	if (isPublic === Sessions[sessionID].isPublic) return;

	Sessions[sessionID].isPublic = isPublic;
	Sessions[sessionID].emitToConnectedNonOwners("isPublic", isPublic);
	updatePublicSession(sessionID);
}

function setDescription(userID: UserID, sessionID: SessionID, description: string) {
	if (!SessionsSettingsProps.description(description)) return;
	if (description === Sessions[sessionID].description) return;

	Sessions[sessionID].description = description.substring(0, 70);
	Sessions[sessionID].emitToConnectedNonOwners("description", Sessions[sessionID].description);
	updatePublicSession(sessionID);
}

function replaceDisconnectedPlayers(userID: UserID, sessionID: SessionID) {
	Sessions[sessionID].replaceDisconnectedPlayers();
}

function distributeJumpstart(userID: UserID, sessionID: SessionID, set: unknown, ack: (result: SocketAck) => void) {
	if (!isString(set) && !isArrayOf(isString)(set)) return ack?.(new SocketError("Invalid parameter 'set'."));
	ack?.(Sessions[sessionID].distributeJumpstart(set));
}

function generateBracket(userID: UserID, sessionID: SessionID, type: unknown, ack: (result: SocketAck) => void) {
	if (!isSomeEnum(BracketType)(type)) return ack?.(new SocketError("Invalid parameter 'type'."));
	const r = Sessions[sessionID].generateBracket(type);
	if (isMessageError(r)) ack?.(new SocketAck(r));
	else ack?.(new SocketAck());
}

function lockBracket(userID: UserID, sessionID: SessionID, bracketLocked: boolean) {
	if (!SessionsSettingsProps.bracketLocked(bracketLocked)) return;
	if (bracketLocked === Sessions[sessionID].bracketLocked) return;

	Sessions[sessionID].bracketLocked = bracketLocked;
	Sessions[sessionID].emitToConnectedNonOwners("sessionOptions", { bracketLocked });
}

function syncBracketMTGO(userID: UserID, sessionID: SessionID, value: unknown) {
	if (!isBoolean(value)) return;

	Sessions[sessionID].syncBracketMTGO(value);
}

function shareDraftLog(userID: UserID, sessionID: SessionID, draftLog: DraftLog) {
	const sess = Sessions[sessionID];
	if (!draftLog) return;

	// If the draft log doesn't come for this session, or we currently hold a newer draft log, don't overwrite it. Instead simply manually send it to everyone and they'll decide what they want to do with it.
	if (draftLog.sessionID !== sessionID || (sess.draftLog && sess.draftLog.time !== draftLog.time)) {
		draftLog.delayed = false;
		draftLog.lastUpdated = Date.now();
		sess.emitToConnectedUsers("draftLog", draftLog);
		return;
	}

	// Restore logs from sent copy if we don't have it anymore.
	if (!sess.draftLog && sess.id === draftLog.sessionID) sess.draftLog = draftLog;

	sess.unlockLogs(draftLog.time);
}

// Used on reconnection to ask for an updated version of the draft log
function retrieveUpdatedDraftLogs(
	userID: UserID,
	sessionID: SessionID,
	logSessionID: SessionID,
	timestamp: unknown,
	lastUpdate: unknown | undefined | null
) {
	if (!isNumber(timestamp)) return;
	if (!isNumber(lastUpdate) && lastUpdate !== undefined && lastUpdate !== null) return;
	const sess = Sessions[sessionID];
	if (
		sess.draftLog &&
		sess.draftLog.sessionID === logSessionID &&
		sess.draftLog.time === timestamp && // Current draft log corresponds to the requested game
		(lastUpdate === undefined ||
			lastUpdate === null ||
			(sess.draftLog.lastUpdated && sess.draftLog.lastUpdated > lastUpdate)) // And is newer
	)
		sess.sendLogsTo(userID);
}

function distributeSealed(
	userID: UserID,
	sessionID: SessionID,
	boostersPerPlayer: number,
	customBoosters: Array<string>,
	ack: (result: SocketAck) => void
) {
	if (!Number.isInteger(boostersPerPlayer) || boostersPerPlayer <= 0)
		return ack?.(new SocketError("Error", "Invalid 'boostersPerPlayer' parameter."));

	const r = Sessions[sessionID].distributeSealed(boostersPerPlayer, customBoosters);
	ack?.(r);
}

async function requestTakeover(userID: UserID, sessionID: SessionID, ack: (result: SocketAck) => void) {
	const previousOwner = Sessions[sessionID].owner;
	if (!previousOwner) return ack?.(new SocketError("Invalid request."));
	const r = await Sessions[sessionID].voteForTakeover(userID);
	// Session might have been deleted while we were awaiting, double check.
	if (!isSocketError(r) && sessionID in Sessions) {
		removePlayer(userID, sessionID, previousOwner);
	}
	ack?.(r);
}

async function convertMTGOLog(
	userID: UserID,
	sessionID: SessionID,
	str: string,
	ack: (result: SocketError | DraftLog) => void
) {
	ack(parseMTGOLog(userID, str));
}

const prepareSocketCallback = <T extends Array<unknown>>(
	callback: (userID: UserID, sessionID: SessionID, ...args: T) => void,
	ownerOnly = false
) => {
	return async function (
		this: Socket<ClientToServerEvents, ServerToClientEvents, InterServerEvents, SocketData>,
		...args: T
	): Promise<void> {
		// Last argument is assumed to be an acknowledgement function if it is a function.
		const lastArg = args.length > 0 ? args[args.length - 1] : null;
		const ack = lastArg instanceof Function ? lastArg : null;
		const userID = this.data.userID;
		if (!userID) {
			ack?.({ code: 1, error: "Internal error. UserID is undefined." });
			return;
		}
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
			await callback(userID, sessionID, ...args);
		} catch (e) {
			ack?.(ackError({ code: 500, title: "Internal server error." }));
			console.error(e);
		}
	};
};

io.on("connection", async function (socket) {
	const query = socket.handshake.query;
	if (!isString(query.userID) || !isString(query.userName)) {
		socket.disconnect(true);
		return;
	}

	if (process.env.NODE_ENV !== "production")
		console.log(
			`${query.userName} [${query.userID}] connected. (${Object.keys(Connections).length + 1} players online)`
		);

	if (query.userID in Connections) {
		console.log(`${query.userName} [${query.userID}] already connected.`);
		// For some reason sockets doesn't always cleanly disconnects.
		// Give 3sec. for the original socket to respond or we'll close it.
		// Ask the user to wait while we test the previous connection...
		const msg = new Message("Connecting...");
		msg.allowOutsideClick = false;
		socket.emit("message", msg);
		const acceptConnection = await new Promise<boolean>((resolve) => {
			((previousSocket) => {
				const timeout = setTimeout(() => {
					// Previous connection did not respond in time, close it and continue as normal.
					previousSocket.disconnect();
					// Wait for the socket to be properly disconnected and the previous Connection deleted.
					process.nextTick(() => {
						socket.emit("message", new ToastMessage("Connected"));
						resolve(true);
					});
				}, 3000);
				previousSocket.emit("stillAlive", () => {
					// Previous connection is still alive
					clearTimeout(timeout);
					const sessionID = Connections[query.userID as string].sessionID;
					if (sessionID && Sessions[sessionID] && Sessions[sessionID].drafting) {
						// The previous connection is in a game. If this was not intentional, assigning a new userID will prevent the user from reconnecting.
						// I don't know what's the best way to handle this, and it seems like there's no good way to simulate a accidental lost websocket connection to properly test this.
						// For now I'll reject this connection, hoping that the previous connection will close eventually if the reconnection was indeed not intentional.
						//   FIXME: If the previous connection anwsered this message, I don't think I should rely on it magically closing...
						// We could also force close the previous connection and proceed with this one. This might be a better choice in some cases, but we could end up accepting
						// multiple connections from the same user (because we're asynchronously checking for the previous connection first) which will leave us in another type of broken mess.
						console.log(
							`${query.userName} [${query.userID}] previous connection still alive and in a game. Rejecting connection.`
						);
						socket.emit(
							"message",
							new MessageError(
								"Already Connected",
								`You appear to already be connected and in a game. 
								Check if Draftmancer is open in another tab. 
								If it isn't, wait a few seconds for the previous connection to close, or restart your browser, and try joining again.`
							)
						);
						resolve(false);
						return;
					}
					// Here we'll assume the user simply opened a new tab. Accept the connection and generate a new userID for the tab.
					query.userID = uuidv1();
					socket.emit("alreadyConnected", query.userID);
					resolve(true);
				});
			})(Connections[query.userID as string].socket);
		});
		if (!acceptConnection) {
			socket.disconnect(true);
			return;
		}
	}

	const userID = query.userID;
	socket.data.userID = userID;

	if (userID in InactiveConnections) {
		// Restore previously saved connection
		// TODO: Front and Back end may be out of sync after this!
		const connection = new Connection(socket, userID, query.userName);
		copyPODProps(connection, InactiveConnections[userID]);
		Connections[userID] = connection;
		delete InactiveConnections[userID];
	} else {
		Connections[userID] = new Connection(socket, userID, query.userName);
	}

	// Messages

	socket.on("disconnect", function (this: typeof socket, reason: string) {
		const userID = this.data.userID;
		if (!userID) {
			console.error("disconnect Error: Missing userID on socket.");
			return;
		}
		if (Connections[userID] && Connections[userID].socket === this) {
			if (process.env.NODE_ENV !== "production")
				console.log(
					`${Connections[userID].userName} [${userID}] disconnected (${reason}). (${
						Object.keys(Connections).length - 1
					} players online)`
				);
			if (Connections[userID].sessionID) removeUserFromSession(Connections[userID].sessionID, userID);
			process.nextTick(() => {
				if (Connections[userID]?.socket === this) delete Connections[userID];
			});
		}
	});

	socket.on("error", function (err) {
		console.error("Socket.io error: ");
		console.error(err);
	});

	if (process.env.NODE_ENV === undefined) {
		socket.use((event, next) => {
			console.log(event);
			next();
		});
	}

	// Personal events
	socket.on("setUserName", prepareSocketCallback(setUserName));
	socket.on("setCollection", prepareSocketCallback(setCollection));
	socket.on("parseCollection", prepareSocketCallback(parseCollection));
	socket.on("useCollection", prepareSocketCallback(useCollection));
	socket.on("chatMessage", prepareSocketCallback(chatMessage));
	socket.on("setReady", prepareSocketCallback(setReady));
	socket.on("pickCard", prepareSocketCallback(pickCard));
	socket.on("passBooster", prepareSocketCallback(passBooster));
	socket.on("gridDraftPick", prepareSocketCallback(gridDraftPick));
	socket.on("rochesterDraftPick", prepareSocketCallback(rochesterDraftPick));
	socket.on("rotisserieDraftPick", prepareSocketCallback(rotisserieDraftPick));
	socket.on("winstonDraftTakePile", prepareSocketCallback(winstonDraftTakePile));
	socket.on("winstonDraftSkipPile", prepareSocketCallback(winstonDraftSkipPile));
	socket.on("winchesterDraftPick", prepareSocketCallback(winchesterDraftPick));
	socket.on("housmanDraftPick", prepareSocketCallback(housmanDraftPick));
	socket.on("minesweeperDraftPick", prepareSocketCallback(minesweeperDraftPick));
	socket.on("solomonDraftOrganize", prepareSocketCallback(solomonDraftOrganize));
	socket.on("solomonDraftConfirmPiles", prepareSocketCallback(solomonDraftConfirmPiles));
	socket.on("solomonDraftPick", prepareSocketCallback(solomonDraftPick));
	socket.on("silentAuctionDraftBid", prepareSocketCallback(silentAuctionDraftBid));
	socket.on("teamSealedPick", prepareSocketCallback(teamSealedPick));
	socket.on("updateBracket", prepareSocketCallback(updateBracket));
	socket.on("updateDeckLands", prepareSocketCallback(updateDeckLands));
	socket.on("moveCard", prepareSocketCallback(moveCard));
	socket.on("swapDeckAndSideboard", prepareSocketCallback(swapDeckAndSideboard));
	socket.on("moveAllToDeck", prepareSocketCallback(moveAllToDeck));
	socket.on("moveAllToSideboard", prepareSocketCallback(moveAllToSideboard));
	socket.on("removeBasicsFromDeck", prepareSocketCallback(removeBasicsFromDeck));
	socket.on("retrieveUpdatedDraftLogs", prepareSocketCallback(retrieveUpdatedDraftLogs));
	socket.on("requestTakeover", prepareSocketCallback(requestTakeover));
	socket.on("convertMTGOLog", prepareSocketCallback(convertMTGOLog));

	if (isString(query.sessionID)) {
		socket.on("setSession", function (this: typeof socket, sessionID: SessionID, sessionSettings: Options) {
			try {
				const userID = this.data.userID;
				if (!userID) {
					console.error("setSession Error: Missing userID on socket.");
					return;
				}
				if (sessionID === Connections[userID].sessionID) return;

				const filteredSettings: Options = {};
				if (sessionSettings)
					for (const prop of Object.keys(SessionsSettingsProps))
						if (prop in sessionSettings) filteredSettings[prop] = sessionSettings[prop];
				joinSession(sessionID, userID, filteredSettings);
			} catch (e) {
				console.error("Error in socket event setSession: ", e);
			}
		});

		// Owner Only
		socket.on("readyCheck", prepareSocketCallback(readyCheck, true));
		socket.on("startDraft", prepareSocketCallback(startDraft, true));
		socket.on("stopDraft", prepareSocketCallback(stopDraft, true));
		socket.on("pauseDraft", prepareSocketCallback(pauseDraft, true));
		socket.on("resumeDraft", prepareSocketCallback(resumeDraft, true));
		socket.on("startSilentAuctionDraft", prepareSocketCallback(startSilentAuctionDraft, true));
		socket.on("startGlimpseDraft", prepareSocketCallback(startGlimpseDraft, true));
		socket.on("startSupremeDraft", prepareSocketCallback(startSupremeDraft, true));
		socket.on("startGridDraft", prepareSocketCallback(startGridDraft, true));
		socket.on("startRochesterDraft", prepareSocketCallback(startRochesterDraft, true));
		socket.on("startRotisserieDraft", prepareSocketCallback(startRotisserieDraft, true));
		socket.on("startWinstonDraft", prepareSocketCallback(startWinstonDraft, true));
		socket.on("startWinchesterDraft", prepareSocketCallback(startWinchesterDraft, true));
		socket.on("startHousmanDraft", prepareSocketCallback(startHousmanDraft, true));
		socket.on("startMinesweeperDraft", prepareSocketCallback(startMinesweeperDraft, true));
		socket.on("startSolomonDraft", prepareSocketCallback(startSolomonDraft, true));
		socket.on("startTeamSealed", prepareSocketCallback(startTeamSealed, true));
		socket.on("distributeJumpstart", prepareSocketCallback(distributeJumpstart, true));
		socket.on("distributeSealed", prepareSocketCallback(distributeSealed, true));
		socket.on("setSessionOwner", prepareSocketCallback(setSessionOwner, true));
		socket.on("setOwnerIsPlayer", prepareSocketCallback(setOwnerIsPlayer, true));
		socket.on("removePlayer", prepareSocketCallback(removePlayer, true));
		socket.on("setSeating", prepareSocketCallback(setSeating, true));
		socket.on("boostersPerPlayer", prepareSocketCallback(boostersPerPlayer, true));
		socket.on("cardsPerBooster", prepareSocketCallback(cardsPerBooster, true));
		socket.on("teamDraft", prepareSocketCallback(teamDraft, true));
		socket.on("setRandomizeSeatingOrder", prepareSocketCallback(setRandomizeSeatingOrder, true));
		socket.on("setDisableBotSuggestions", prepareSocketCallback(setDisableBotSuggestions, true));
		socket.on("setDistributionMode", prepareSocketCallback(setDistributionMode, true));
		socket.on("setCustomBoosters", prepareSocketCallback(setCustomBoosters, true));
		socket.on("setBots", prepareSocketCallback(setBots, true));
		socket.on("setRestriction", prepareSocketCallback(setRestriction, true));
		socket.on("parseCustomCardList", prepareSocketCallback(parseCustomCardListEvent, true));
		socket.on("importCube", prepareSocketCallback(importCube, true));
		socket.on("loadLocalCustomCardList", prepareSocketCallback(loadLocalCustomCardList, true));
		socket.on("ignoreCollections", prepareSocketCallback(ignoreCollections, true));
		socket.on("setPickTimer", prepareSocketCallback(setPickTimer, true));
		socket.on("setTournamentTimer", prepareSocketCallback(setTournamentTimer, true));
		socket.on("setReviewTimer", prepareSocketCallback(setReviewTimer, true));
		socket.on("setHidePicks", prepareSocketCallback(setHidePicks, true));
		socket.on("setMaxPlayers", prepareSocketCallback(setMaxPlayers, true));
		socket.on("setMythicPromotion", prepareSocketCallback(setMythicPromotion, true));
		socket.on("setUseBoosterContent", prepareSocketCallback(setUseBoosterContent, true));
		socket.on("setBoosterContent", prepareSocketCallback(setBoosterContent, true));
		socket.on("setUsePredeterminedBoosters", prepareSocketCallback(setUsePredeterminedBoosters, true));
		socket.on("setBoosters", prepareSocketCallback(setBoosters, true));
		socket.on("shuffleBoosters", prepareSocketCallback(shuffleBoosters, true));
		socket.on("setPersonalLogs", prepareSocketCallback(setPersonalLogs, true));
		socket.on("setDraftLogRecipients", prepareSocketCallback(setDraftLogRecipients, true));
		socket.on("setDraftLogUnlockTimer", prepareSocketCallback(setDraftLogUnlockTimer, true));
		socket.on("setMaxDuplicates", prepareSocketCallback(setMaxDuplicates, true));
		socket.on("setColorBalance", prepareSocketCallback(setColorBalance, true));
		socket.on("setFoil", prepareSocketCallback(setFoil, true));
		socket.on("setUseCustomCardList", prepareSocketCallback(setUseCustomCardList, true));
		socket.on("setCustomCardListWithReplacement", prepareSocketCallback(setCustomCardListWithReplacement, true));
		socket.on(
			"setCustomCardListDuplicateProtection",
			prepareSocketCallback(setCustomCardListDuplicateProtection, true)
		);
		socket.on("setCustomCardListSetting", prepareSocketCallback(setCustomCardListSetting, true));
		socket.on("setDoubleMastersMode", prepareSocketCallback(setDoubleMastersMode, true));
		socket.on("setPickedCardsPerRound", prepareSocketCallback(setPickedCardsPerRound, true));
		socket.on("setBurnedCardsPerRound", prepareSocketCallback(setBurnedCardsPerRound, true));
		socket.on("setDiscardRemainingCardsAt", prepareSocketCallback(setDiscardRemainingCardsAt, true));
		socket.on("setPublic", prepareSocketCallback(setPublic, true));
		socket.on("setDescription", prepareSocketCallback(setDescription, true));
		socket.on("replaceDisconnectedPlayers", prepareSocketCallback(replaceDisconnectedPlayers, true));
		socket.on("generateBracket", prepareSocketCallback(generateBracket, true));
		socket.on("lockBracket", prepareSocketCallback(lockBracket, true));
		socket.on("syncBracketMTGO", prepareSocketCallback(syncBracketMTGO, true));
		socket.on("shareDraftLog", prepareSocketCallback(shareDraftLog, true));

		// Apply preferred session settings in case we're creating a new one, filtering out invalid ones.
		const filteredSettings: Options = {};
		let sessionSettings: Options = {};
		try {
			if (query.sessionSettings) {
				sessionSettings = JSON.parse(query.sessionSettings as string);
				for (const prop of Object.keys(SessionsSettingsProps))
					if (prop in sessionSettings && SessionsSettingsProps[prop](sessionSettings[prop]))
						filteredSettings[prop] = sessionSettings[prop];
			}
		} catch (e) {
			console.error("Error parsing default session setting on user connection: ", e);
			console.error("query.sessionSettings: ", query.sessionSettings);
		}

		let sessionID: string = query.sessionID;
		if (sessionSettings.cubeCobraID) {
			// Make sure the session ID isn't in use for redirections from Cube Cobra.
			if (sessionIDInUse(sessionID)) sessionID = newSessionID("CC_");
		}

		joinSession(sessionID, userID, filteredSettings);

		if (sessionSettings.cubeCobraID) {
			if (sessionID !== query.sessionID) Connections[userID].socket.emit("setSession", sessionID);

			const cubeName = sessionSettings.cubeCobraName ?? sessionSettings.cubeCobraID;
			importCube(
				userID,
				sessionID,
				{
					service: "Cube Cobra",
					name: cubeName,
					cubeID: sessionSettings.cubeCobraID,
					matchVersions: true,
					sendResultsToCubeCobra: true,
				},
				(err) => {
					if (isSocketError(err)) {
						console.error("Error importing Cube Cobra cube: ", err);
						if (err.error) Connections[userID]?.socket.emit("message", err.error);
					}
				}
			);
		}
	} else {
		// Not in a session, allow registering to draft queues.
		socket.on(
			"draftQueueRegister",
			function (this: typeof socket, setCode: unknown, ack: (result: SocketAck) => void) {
				const userID = this.data.userID;
				if (!userID) return ack?.(new SocketError("Internal Error."));
				if (!isString(setCode)) return ack?.(new SocketError("Invalid setCode parameter."));
				const r = registerPlayer(userID, setCode);
				ack(r);
			}
		);
		socket.on("draftQueueUnregister", function (this: typeof socket, ack: (result: SocketAck) => void) {
			const userID = this.data.userID;
			if (!userID) return ack?.(new SocketError("Internal Error."));
			const r = unregisterPlayer(userID);
			ack(r);
		});
	}

	socket.emit("publicSessions", getPublicSessions());
});

///////////////////////////////////////////////////////////////////////////////

function sessionIDInUse(sid: SessionID) {
	return sid in Sessions || sid in InactiveSessions;
}

function newSessionID(prefix: string = ""): SessionID {
	let sid = prefix + shortguid();
	while (sessionIDInUse(sid)) sid = prefix + shortguid();
	return sid;
}

function joinSession(sessionID: SessionID, userID: UserID, defaultSessionSettings: Options = {}) {
	if (!Connections[userID]) return console.error(`joinSession: No connection found for userID ${userID}`);

	// Fallback to previous session if possible, or generate a new one
	const refuse = (msg: string) => {
		Connections[userID].socket.emit("message", new Message("Cannot join session", "", "", msg));
		const newSID = Connections[userID].sessionID ? Connections[userID].sessionID! : newSessionID();
		Connections[userID].socket.emit("setSession", newSID);
	};

	if (sessionID in InactiveSessions) {
		if (InactiveSessions[sessionID].drafting && !(userID in InactiveSessions[sessionID].disconnectedUsers))
			return refuse(`Session '${sessionID}' is currently drafting.`);

		console.log(`Restoring inactive session '${sessionID}'...`);
		if (InactiveSessions[sessionID].deleteTimeout) {
			clearTimeout(InactiveSessions[sessionID].deleteTimeout);
			delete InactiveSessions[sessionID].deleteTimeout;
		}
		// Always having a valid owner is more important than preserving the old one - probably.
		Sessions[sessionID] = restoreSession(
			InactiveSessions[sessionID],
			InactiveSessions[sessionID].ownerIsPlayer ? userID : InactiveSessions[sessionID].owner
		);
		delete InactiveSessions[sessionID];
	}

	if (sessionID in Sessions) {
		const sess = Sessions[sessionID];
		// User was the owner, but not playing
		if (userID === sess.owner && !sess.ownerIsPlayer) {
			sess.reconnectOwner(userID);
			Connections[userID].socket.emit("message", new ToastMessage("Reconnected as Organizer"));
			return;
		}

		const bracketLink = sess.bracket
			? `<br />Bracket is available <a href="/bracket?session=${encodeURIComponent(
					sessionID
				)}" target="_blank" rel="noopener nofollow">here</a>.`
			: "";
		// Session exists and is drafting
		if (sess.drafting) {
			console.log(
				`Session ${sessionID}: ${userID} wants to rejoin draft: ${
					userID in sess.disconnectedUsers ? "Ok!" : "Not allowed."
				}`
			);

			if (userID in sess.disconnectedUsers) sess.reconnectUser(userID);
			else
				return refuse(
					`This session (${sessionID}) is currently drafting. Please wait for them to finish.${bracketLink}`
				);
		} else if (sess.managed) {
			// Session exists and is managed but not drafting, it cannot be joined anymore.
			return refuse(`This session (${sessionID}) is closed.`);
		} else if (sess.getHumanPlayerCount() >= sess.maxPlayers) {
			// Session exists and is full
			return refuse(
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
	if (!Connections[userID]) return console.error(`addUserToSession: No connection found for userID ${userID}`);

	const currentSessionID = Connections[userID].sessionID;

	// Transfer session settings to the new one if applicable
	if (currentSessionID && currentSessionID in Sessions && userID === Sessions[currentSessionID].owner)
		for (const p of Object.keys(SessionsSettingsProps))
			defaultSessionSettings[p] = (Sessions[currentSessionID] as IIndexable)[p];

	if (currentSessionID && currentSessionID in Sessions) removeUserFromSession(currentSessionID, userID);

	if (!(sessionID in Sessions)) Sessions[sessionID] = new Session(sessionID, userID, defaultSessionSettings);

	if (userID === Sessions[sessionID].owner && !Sessions[sessionID].ownerIsPlayer) {
		Connections[userID].sessionID = sessionID;
		Sessions[sessionID].syncSessionOptions(userID);
	} else Sessions[sessionID].addUser(userID);

	if (Sessions[sessionID].isPublic) updatePublicSession(sessionID);
}

function deleteSession(sessionID: SessionID) {
	const wasPublic = Sessions[sessionID].isPublic;
	Sessions[sessionID].beforeDelete();
	process.nextTick(() => {
		delete Sessions[sessionID];
		if (wasPublic) updatePublicSession(sessionID);
	});
}

// Remove user from previous session and cleanup if empty
function removeUserFromSession(sessionID: SessionID, userID: UserID) {
	if (sessionID in Sessions) {
		const sess = Sessions[sessionID];
		if (sess.users.has(userID)) {
			sess.remUser(userID);
			if (sess.isPublic) updatePublicSession(sessionID);

			if (Connections[userID]) Connections[userID].sessionID = undefined;

			//                           Keep session alive if the owner wasn't a player and is still connected.
			if (sess.users.size === 0 && (sess.ownerIsPlayer || !(sess.owner && sess.owner in Connections))) {
				// If a game was going, we'll keep the session around for a while in case a player reconnects
				// (mostly useful in case of disconnection during a single player game)
				// Also keep it around if draft logs weren't unlocked, and scheduled to be automatically unlocked.
				if ((sess.drafting || (sess.draftLog?.delayed && sess.draftLogUnlockTimer > 0)) && !sess.managed) {
					InactiveSessions[sessionID] = getPoDSession(sess);
					// Keep Rotisserie Draft around since they're typically played over long period of time.
					if (!isRotisserieDraftState(sess.draftState)) {
						let delay = 10 * 60 * 1000; // 10min should be plenty enough as a base.
						// Increase it if we're keeping it for draft log sharing reasons.
						if (sess.draftLog?.delayed && sess.draftLogUnlockTimer > 0)
							delay += sess.draftLogUnlockTimer * 60 * 100;
						InactiveSessions[sessionID].deleteTimeout = setTimeout(() => {
							process.nextTick(() => {
								if (InactiveSessions[sessionID]) delete InactiveSessions[sessionID];
							});
						}, delay);
					}
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

// Endpoints (TODO: Should be cleaned up)

app.get("/healthCheck", (req, res) => {
	res.sendStatus(200);
});

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
		console.error("Error in getCollection: ", e);
		res.sendStatus(500);
	}
}

app.get("/getCollection", (req, res) => {
	getCollection(res, req.cookies.sessionID);
});

app.get("/getCollection/:sessionID", (req, res) => {
	getCollection(res, req.params.sessionID);
});

function returnCollectionPlainText(res: express.Response, sid: SessionID) {
	if (!sid) {
		res.sendStatus(400);
	} else if (sid in Sessions) {
		const coll = Sessions[sid].collection(false);
		let r = "";
		for (const [cid, count] of coll) {
			const card = getCard(cid);
			if (card) {
				if (!["Plains", "Island", "Swamp", "Mountain", "Forest"].includes(card.name))
					r += `${count} ${card.name}\n`;
			} else console.error("Error in getCollectionPlainText: Unknown cardID: ", cid);
		}
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
				res.json(req.body.map((cid) => getCard(cid)));
			} else if (typeof req.body === "object") {
				const r: { [key: string]: Card[] } = {};
				for (const slot in req.body) r[slot] = req.body[slot].map((cid: CardID) => getCard(cid));
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
			const r = { deck: [] as Card[], sideboard: [] as Card[] };
			const lines = req.body.split(/\r?\n/);
			let target: Card[] = r.deck;
			for (let line of lines) {
				line = line.trim();
				if (line === "Deck") target = r.deck;
				if (line === "Sideboard" || (line === "" && r.deck.length > 0)) target = r.sideboard;
				if (["", "Deck", "Sideboard"].includes(line)) continue;
				const result = parseLine(line);
				if (isSocketError(result)) {
					res.status(400).send({ error: { message: `Error on line '${line}'` } });
					return;
				}
				const { count, cardID, foil } = result;
				for (let i = 0; i < count; ++i) target.push(getUnique(cardID, { foil }));
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

app.get(["/getDraftLog/:sessionID", "/api/getDraftLog/:sessionID"], (req, res) => {
	const sessionID = req.params.sessionID;
	if (!sessionID) {
		res.sendStatus(400);
	} else {
		const sess = Sessions[sessionID];
		if (!sess) {
			res.sendStatus(404);
		} else if (sess.drafting) {
			res.sendStatus(403);
		} else if (!sess.draftLog) {
			res.sendStatus(404);
		} else {
			// NOTE: Session draftLogRecipients can be changed after the fact. The restriction should be saved within the log on creation to be perfectly accurate.
			if (sess.draftLogRecipients === "none" || sess.draftLogRecipients === "owner") {
				res.sendStatus(403);
			} else if (sess.draftLog.delayed) {
				res.json(sess.getStrippedLog());
			} else {
				res.json(sess.draftLog);
			}
		}
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
	return (key: string, value: unknown) => {
		// Handle Sets (Notably Session.users)
		if (typeof value === "object" && value instanceof Set) return [...value];
		if (typeof value === "object" && value !== null) {
			if (seen.has(value)) return;
			seen.add(value);
		}
		return value;
	};
};

// Ignore circular references in data when converting to JSON
function returnCircularJSON(res: express.Response, data: unknown) {
	res.setHeader("Content-Type", "application/json");
	return res.send(JSON.stringify(data, getCircularReplacer()));
}

app.get("/getSessionsDebug/:key", requireAPIKey, (req, res) => {
	returnCircularJSON(res, Sessions);
});

app.get("/getConnections/:key", requireAPIKey, (req, res) => {
	returnCircularJSON(res, Connections);
});

app.get("/getStatus/:key", requireAPIKey, (req, res) => {
	let draftingSessions = 0;
	let draftingPlayers = 0;
	for (const sID in Sessions) {
		if (Sessions[sID].drafting) {
			++draftingSessions;
			draftingPlayers += Sessions[sID].users.size;
		}
	}
	const uptime = process.uptime();
	returnCircularJSON(res, {
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
	const localSess: { [sid: string]: unknown } = {};
	for (const sid in Sessions)
		localSess[sid] = {
			id: sid,
			drafting: Sessions[sid].drafting,
			users: Sessions[sid].users,
			maxPlayers: Sessions[sid].maxPlayers,
			useCustomCardList: Sessions[sid].useCustomCardList,
			customCardList: Sessions[sid].customCardList
				? {
						name: Sessions[sid].customCardList.name,
					}
				: null,
			setRestriction: Sessions[sid].setRestriction,
		};
	returnCircularJSON(res, localSess);
});

app.post("/setDraftQueueSettings/:key", requireAPIKey, (req, res) => {
	try {
		if (req.body) {
			setDraftQueueSettings({
				AddBotCheckInterval: isNumber(req.body.AddBotCheckInterval) ? req.body.AddBotCheckInterval : undefined,
				AddBotPauseAfterBotAddition: isNumber(req.body.AddBotPauseAfterBotAddition)
					? req.body.AddBotPauseAfterBotAddition
					: undefined,
				AddBotPauseAfterPlayerJoin: isNumber(req.body.AddBotPauseAfterPlayerJoin)
					? req.body.AddBotPauseAfterPlayerJoin
					: undefined,
				AddBotPauseAfterDraftStart: isNumber(req.body.AddBotPauseAfterDraftStart)
					? req.body.AddBotPauseAfterDraftStart
					: undefined,
			});
			res.sendStatus(200);
		} else res.sendStatus(400);
	} catch (e) {
		console.error("Error in setDraftQueueSettings: ", e);
		res.sendStatus(500);
	}
});

app.get("/api/getDraftQueueStatus", (req, res) => {
	res.json(getQueueStatus());
});

Promise.all([InactiveConnections, InactiveSessions]).then(() => {
	httpServer.listen(DraftmancerPort, () => {
		console.log(`Listening on port ${DraftmancerPort} (ready in ${process.uptime().toFixed(2)}s)`);
	});
});

export default {};

"use strict";

import { v1 as uuidv1 } from "uuid";
import constants from "./data/constants.json";
import { UserID, SessionID } from "./IDTypes.js";
import { countCards } from "./cardUtils.js";
import { negMod, shuffleArray, getRandom, arrayIntersect, Options, getNDisctinctRandom, pickRandom } from "./utils.js";
import { Connections, getPickedCardIds } from "./Connection.js";
import {
	CardID,
	Card,
	Cards,
	DeckList,
	getUnique,
	BoosterCardsBySet,
	CardsBySet,
	MTGACardIDs,
	CardPool,
	SlotedCardPool,
	UniqueCard,
	getCard,
} from "./Cards.js";
import { IBot, Bot, SimpleBot, fallbackToSimpleBots, isBot } from "./Bot.js";
import { computeHashes } from "./DeckHashes.js";
import { BasicLandSlot, BasicLandSlots, SpecialLandSlots } from "./LandSlot.js";
import {
	BoosterFactory,
	ColorBalancedSlot,
	SetSpecificFactories,
	PaperBoosterFactories,
	DefaultBoosterTargets,
	IBoosterFactory,
	getSetFoilRate,
	PaperBoosterSizes,
} from "./BoosterFactory.js";
import JumpstartBoosters from "./data/JumpstartBoosters.json";
import JumpstartHHBoosters from "./data/JumpstartHHBoosters.json";
import SuperJumpBoosters from "./data/SuperJumpBoosters.json";
Object.freeze(JumpstartBoosters);
Object.freeze(SuperJumpBoosters);
import { MessageError, SocketAck, SocketError } from "./Message.js";
import { logSession } from "./Persistence.js";
import { Bracket, TeamBracket, SwissBracket, DoubleBracket } from "./Brackets.js";
import { CustomCardList, generateBoosterFromCustomCardList, generateCustomGetCardFunction } from "./CustomCardList.js";
import { DraftLog } from "./DraftLog.js";
import { generateJHHBooster, JHHBoosterPattern } from "./JumpstartHistoricHorizons.js";
import { isBoolean, isObject, isString } from "./TypeChecks.js";
import { IDraftState, TurnBased } from "./IDraftState.js";
import { MinesweeperCellState, MinesweeperDraftState } from "./MinesweeperDraft.js";
import { assert } from "console";

// Validate session settings types and values.
export const SessionsSettingsProps: { [propName: string]: (val: any) => boolean } = {
	ownerIsPlayer: isBoolean,
	setRestriction(val: any) {
		if (!Array.isArray(val)) return false;
		for (let s of val)
			if (constants.PrimarySets.indexOf(s) === -1) {
				console.error(`Error: Set ${s} in not marked as primary.`);
				return false;
			}
		return true;
	},
	isPublic: isBoolean,
	description: isString,
	ignoreCollections: isBoolean,
	boostersPerPlayer(val: any) {
		if (!Number.isInteger(val)) return false;
		return val >= 1;
	},
	cardsPerBooster(val: any) {
		if (!Number.isInteger(val)) return false;
		return val >= 1;
	},
	teamDraft: isBoolean,
	randomizeSeatingOrder: isBoolean,
	disableBotSuggestions: isBoolean,
	bots(val: any) {
		if (!Number.isInteger(val)) return false;
		return val >= 0;
	},
	maxTimer(val: any) {
		if (!Number.isInteger(val)) return false;
		return val >= 0;
	},
	maxPlayers(val: any) {
		if (!Number.isInteger(val)) return false;
		return val >= 1;
	},
	mythicPromotion: isBoolean,
	useBoosterContent: isBoolean,
	boosterContent(val: any) {
		// Validate input (a value for each rarity and at least one card)
		if (!isObject(val)) return false;
		if (!["common", "uncommon", "rare"].every((r) => r in val)) return false;
		if (Object.values(val).some((i: any) => !Number.isInteger(i) || i < 0)) return false;
		if (Object.values(val).reduce((acc, val) => acc + val) <= 0) return false;
		return true;
	},
	usePredeterminedBoosters: isBoolean,
	colorBalance: isBoolean,
	maxDuplicates(val: any) {
		if (!isObject(val)) return false;
		if (Object.values(val).some((i) => !Number.isInteger(i))) return false;
		return true;
	},
	foil: isBoolean,
	preferedCollation(val: any) {
		return ["Paper", "MTGA"].includes(val);
	},
	useCustomCardList: isBoolean,
	customCardList: isObject,
	distributionMode(val: any) {
		return ["regular", "shufflePlayerBoosters", "shuffleBoosterPool"].includes(val);
	},
	customBoosters: Array.isArray,
	doubleMastersMode: isBoolean,
	pickedCardsPerRound(val: any) {
		if (!Number.isInteger(val)) return false;
		return val >= 1;
	},
	burnedCardsPerRound(val: any) {
		if (!Number.isInteger(val)) return false;
		return val >= 0;
	},
	discardRemainingCardsAt(val: any) {
		if (!Number.isInteger(val)) return false;
		return val >= 0;
	},
	personalLogs: isBoolean,
	draftLogRecipients(val: any) {
		return ["everyone", "delayed", "owner", "none"].includes(val);
	},
	bracketLocked: isBoolean,
	draftPaused: isBoolean,
};

export type UserData = {
	[uid: UserID]: {
		userID: UserID;
		userName: string;
		isBot: boolean;
		isDisconnected: boolean;
		boosterCount: undefined | number;
	};
};

export class DraftState extends IDraftState {
	boosters: Array<Array<UniqueCard>>;
	boosterNumber = 0;
	numPicks = 0;
	players: {
		[userID: UserID]: {
			isBot: boolean;
			botPickInFlight: boolean; // Set to true if a call to doBotPick is already scheduled.
			botInstance: IBot; // If a human player, this will be used for pick recommendations.
			boosters: UniqueCard[][];
			pickNumber: 0;
			countdownInterval: NodeJS.Timeout | null;
			timer: number;
		};
	} = {};

	constructor(boosters: UniqueCard[][] = [], players: UserID[] = [], options: Options = {}) {
		super("draft");
		this.boosters = boosters;
		let botIndex = 0;

		const playersToCreate = players.map((uid) => {
			return {
				isBot: false,
				userID: uid,
			};
		});

		// Distribute bots evenly around the table
		let idx = 0;
		for (let i = 0; i < options.botCount; ++i) {
			// Search next human player
			while (playersToCreate[idx].isBot) idx = (idx + 1) % playersToCreate.length;
			++idx;
			// Insert a bot right after
			playersToCreate.splice(idx, 0, { isBot: true, userID: uuidv1() });
		}

		for (let user of playersToCreate) {
			const userName = user.isBot ? `Bot #${++botIndex}` : Connections[user.userID].userName;
			const botInstance = options.simpleBots
				? new SimpleBot(userName, user.userID)
				: new Bot(userName, user.userID);

			this.players[user.userID] = {
				isBot: user.isBot,
				botPickInFlight: false,
				botInstance: botInstance,
				boosters: [],
				pickNumber: 0,
				countdownInterval: null,
				timer: 0,
			};
		}
	}
}

export class WinstonDraftState extends IDraftState implements TurnBased {
	players: Array<UserID>;
	round = -1; // Will be immedialty incremented
	cardPool: Array<UniqueCard> = [];
	piles: [Array<UniqueCard>, Array<UniqueCard>, Array<UniqueCard>] = [[], [], []];
	currentPile: number = 0;
	constructor(players: Array<UserID>, boosters: Array<Array<UniqueCard>>) {
		super("winston");
		this.players = players;
		if (boosters) {
			for (let booster of boosters) this.cardPool.push(...booster);
			shuffleArray(this.cardPool);
		}
		if (this.cardPool.length >= 3)
			this.piles = [
				[this.cardPool.pop() as UniqueCard],
				[this.cardPool.pop() as UniqueCard],
				[this.cardPool.pop() as UniqueCard],
			];
	}

	currentPlayer() {
		return this.players[this.round % 2];
	}

	syncData() {
		return {
			round: this.round,
			currentPlayer: this.currentPlayer(),
			piles: this.piles,
			currentPile: this.currentPile,
			remainingCards: this.cardPool.length,
		};
	}
}

export class GridDraftState extends IDraftState implements TurnBased {
	round = 0;
	boosters: Array<Array<UniqueCard | null>> = []; // Array of [3x3 Grid, Row-Major order]
	players: Array<UserID>;
	error: any;
	boosterCount: number;
	lastPicks: { userName: string; round: number; cards: (UniqueCard | null)[] }[] = [];
	constructor(players: Array<UserID>, boosters: Array<Array<UniqueCard>>) {
		super("grid");
		this.players = players;
		if (boosters) {
			for (let booster of boosters) {
				if (booster.length > 9) booster.length = 9;
				if (booster.length < 9)
					this.error = {
						title: "Not enough cards in boosters.",
						text: "At least one booster has less than 9 cards.",
					};
				shuffleArray(booster);
				this.boosters.push(booster);
			}
		}
		this.boosterCount = this.boosters.length;
	}

	currentPlayer() {
		return this.players[[0, 1, 1, 0][this.round % 4]];
	}

	syncData() {
		return {
			round: this.round,
			currentPlayer: this.currentPlayer(),
			booster: this.boosters[0],
			boosterCount: this.boosterCount,
			lastPicks: this.lastPicks,
		};
	}
}

export class RochesterDraftState extends IDraftState implements TurnBased {
	players: Array<UserID>;
	pickNumber = 0;
	boosterNumber = 0;
	boosters: Array<Array<UniqueCard>> = [];
	boosterCount: number;
	lastPicks: { userName: string; round: number; cards: UniqueCard[] }[] = [];
	constructor(players: Array<UserID>, boosters: Array<Array<UniqueCard>>) {
		super("rochester");
		this.players = players;
		this.boosters = boosters;
		this.boosterCount = this.boosters.length;
	}

	currentPlayer() {
		const startingDirection = Math.floor(this.boosterNumber / this.players.length) % 2;
		const direction = Math.floor(this.pickNumber / this.players.length) % 2;
		const offset = direction
			? this.players.length - 1 - (this.pickNumber % this.players.length)
			: this.pickNumber % this.players.length;
		return this.players[negMod(this.boosterNumber + (startingDirection ? 1 : -1) * offset, this.players.length)];
	}

	syncData() {
		return {
			pickNumber: this.pickNumber,
			boosterNumber: this.boosterNumber,
			currentPlayer: this.currentPlayer(),
			booster: this.boosters[0],
			boosterCount: this.boosterCount,
			lastPicks: this.lastPicks,
		};
	}
}

export type DistributionMode = "regular" | "shufflePlayerBoosters" | "shuffleBoosterPool";
export type DraftLogRecipients = "none" | "owner" | "delayed" | "everyone";

export interface IIndexable {
	[key: string]: any;
}

type DisconnectedUser = {
	userName: string;
	pickedCards: { main: UniqueCard[]; side: UniqueCard[] };
};

export class Session implements IIndexable {
	id: SessionID;
	owner: UserID;
	userOrder: Array<string> = [];
	users: Set<UserID> = new Set();

	// Options
	ownerIsPlayer: boolean = true;
	setRestriction: Array<string> = [constants.MTGASets[constants.MTGASets.length - 1]];
	isPublic: boolean = false;
	description: string = "";
	ignoreCollections: boolean = true;
	boostersPerPlayer: number = 3;
	cardsPerBooster: number = 15; // Used for cubes (instead of boosterContent)
	teamDraft: boolean = false;
	disableBotSuggestions: boolean = false;
	randomizeSeatingOrder: boolean = false;
	bots: number = 0;
	maxTimer: number = 75;
	maxPlayers: number = 8;
	mythicPromotion: boolean = true;
	useBoosterContent: boolean = false; // Use the specified booster content if true, DefaultBoosterTargets otherwise
	boosterContent: { [slot: string]: number } = DefaultBoosterTargets;
	usePredeterminedBoosters: boolean = false;
	colorBalance: boolean = true;
	maxDuplicates?: { [slot: string]: number } = undefined;
	foil: boolean = false;
	preferedCollation: string = "MTGA"; // Unused! (And thus not exposed client-side)
	useCustomCardList: boolean = false;
	customCardList: CustomCardList = {
		slots: {},
		layouts: false,
		customCards: null,
	};
	distributionMode: DistributionMode = "regular"; // Specifies how boosters are distributed when using boosters from different sets (see customBoosters)
	customBoosters: Array<string> = ["", "", ""]; // Specify a set for an individual booster (Draft Only)
	doubleMastersMode: boolean = false; // Apply the pickedCardsPerRound rule only for the first pick then revert to one.
	pickedCardsPerRound: number = 1;
	burnedCardsPerRound: number = 0;
	discardRemainingCardsAt: number = 0;
	personalLogs: boolean = true;
	draftLogRecipients: DraftLogRecipients = "everyone";
	bracketLocked: boolean = false; // If set, only the owner can edit the results.
	bracket?: Bracket = undefined;

	boosters: Array<Array<UniqueCard>> = [];

	// Draft state
	drafting: boolean = false;
	draftState?: IDraftState = undefined;
	draftLog?: DraftLog;
	disconnectedUsers: { [uid: UserID]: DisconnectedUser } = {};
	draftPaused: boolean = false;
	countdown: number = 75;

	constructor(id: SessionID, owner: UserID, options: Options = {}) {
		this.id = id;
		this.owner = owner;

		// Validate and set session settings
		for (let p in options)
			if (p in SessionsSettingsProps && SessionsSettingsProps[p](options[p]))
				(this as IIndexable)[p] = options[p];
	}

	addUser(userID: UserID) {
		if (this.users.has(userID)) {
			console.error(`Session::addUser: this.users.has(${userID})`);
		}

		Connections[userID].sessionID = this.id;
		this.users.add(userID);
		if (this.userOrder.indexOf(userID) < 0)
			this.userOrder.splice(Math.floor(Math.random() * (this.userOrder.length + 1)), 0, userID);
		this.notifyUserChange();
		this.syncSessionOptions(userID);
	}

	getDisconnectedUserData(userID: UserID) {
		return {
			userName: Connections[userID].userName,
			pickedCards: Connections[userID].pickedCards,
		};
	}

	broadcastDisconnectedUsers() {
		const disconnectedUsersData: { [uid: string]: any } = {};
		for (let uid in this.disconnectedUsers)
			disconnectedUsersData[uid] = { userName: this.disconnectedUsers[uid].userName };
		this.forUsers((u) =>
			Connections[u]?.socket.emit("userDisconnected", {
				owner: this.owner,
				disconnectedUsers: disconnectedUsersData,
			})
		);
	}

	remUser(userID: UserID) {
		// Nothing to do if the user wasn't playing
		if (userID === this.owner && !this.ownerIsPlayer) return;

		this.users.delete(userID);

		// User was the owner of the session, transfer ownership to the first available users.
		if (this.owner == userID) this.owner = this.users.values().next().value;

		if (this.drafting) {
			if (this.draftState instanceof DraftState) this.stopCountdowns();
			this.disconnectedUsers[userID] = this.getDisconnectedUserData(userID);
			this.broadcastDisconnectedUsers();
		} else {
			this.userOrder.splice(this.userOrder.indexOf(userID), 1);
		}
	}

	setBoostersPerPlayer(boostersPerPlayer: number, userID: UserID | null = null) {
		if (this.boostersPerPlayer !== boostersPerPlayer && boostersPerPlayer > 0) {
			this.boostersPerPlayer = boostersPerPlayer;
			while (this.customBoosters.length < boostersPerPlayer) this.customBoosters.push("");
			while (this.customBoosters.length > boostersPerPlayer) this.customBoosters.pop();

			this.forUsers((uid: UserID) =>
				Connections[uid]?.socket.emit(
					"sessionOptions",
					userID === uid // Don't send boostersPerPlayer back to the user who changed the setting, avoiding possible loops
						? { customBoosters: this.customBoosters }
						: {
								boostersPerPlayer: this.boostersPerPlayer,
								customBoosters: this.customBoosters,
						  }
				)
			);
		}
	}

	setCardsPerBooster(cardsPerBooster: number, userID: UserID | null = null) {
		if (this.cardsPerBooster !== cardsPerBooster && cardsPerBooster > 0) {
			this.cardsPerBooster = cardsPerBooster;

			this.forUsers((uid: UserID) => {
				if (userID !== uid)
					Connections[uid]?.socket.emit("sessionOptions", {
						cardsPerBooster: this.cardsPerBooster,
					});
			});
		}
	}

	setCustomCardList(cardList: CustomCardList) {
		this.useCustomCardList = true;
		this.customCardList = cardList;
		this.forUsers((uid: UserID) =>
			Connections[uid]?.socket.emit("sessionOptions", {
				useCustomCardList: this.useCustomCardList,
				customCardList: this.customCardList,
			})
		);
	}

	setTeamDraft(teamDraft: boolean) {
		if (this.teamDraft != teamDraft) {
			this.teamDraft = teamDraft;
			if (teamDraft) {
				this.maxPlayers = 6;
				this.bots = 0;
			} else {
				this.maxPlayers = 8;
			}

			this.forUsers((u) =>
				Connections[u]?.socket.emit("sessionOptions", {
					teamDraft: this.teamDraft,
					maxPlayers: this.maxPlayers,
					bots: this.bots,
				})
			);
		}
	}

	setDisableBotSuggestions(disableBotSuggestions: boolean) {
		if (this.disableBotSuggestions != disableBotSuggestions) {
			this.disableBotSuggestions = disableBotSuggestions;
			this.forUsers((u) =>
				Connections[u]?.socket.emit("sessionOptions", {
					disableBotSuggestions: this.disableBotSuggestions,
				})
			);
		}
	}

	setRandomizeSeatingOrder(randomizeSeatingOrder: boolean) {
		if (this.randomizeSeatingOrder != randomizeSeatingOrder) {
			this.randomizeSeatingOrder = randomizeSeatingOrder;
			this.forUsers((u) =>
				Connections[u]?.socket.emit("sessionOptions", {
					randomizeSeatingOrder: this.randomizeSeatingOrder,
				})
			);
		}
	}

	setSeating(seating: Array<UserID>) {
		if (this.drafting) return false;
		if (!Array.isArray(seating) || [...this.users].some((u) => !seating.includes(u))) {
			console.error(`Session.setSeating: invalid seating.`);
			console.error("Submitted seating:", seating);
			console.error("Session.users:", this.users);
			return false;
		}
		this.userOrder = seating;
		this.notifyUserChange();
		return true;
	}

	getBoosterContent() {
		if (this.useBoosterContent) return this.boosterContent;
		return DefaultBoosterTargets;
	}

	randomizeSeating() {
		if (this.drafting) return false;
		shuffleArray(this.userOrder);
		this.notifyUserChange();
		return true;
	}

	syncSessionOptions(userID: UserID) {
		const options: Options = {
			sessionOwner: this.owner,
			bracket: this.bracket,
		};
		for (let p of Object.keys(SessionsSettingsProps)) options[p] = (this as IIndexable)[p];
		Connections[userID]?.socket.emit("sessionOptions", options);
	}

	// Returns a getCard function using the custom card data, if any are present in the custom card list.
	getCustomGetCardFunction() {
		return generateCustomGetCardFunction(this.customCardList);
	}

	// Returns true if the card pool is not restricted by players collections (and ignoreCollections is true or no-one is using their collection)
	unrestrictedCardPool() {
		if (this.ignoreCollections) return true;

		for (let userID of this.users) {
			if (Connections[userID].useCollection && Connections[userID].collection.size > 0) return false;
		}

		return true;
	}

	// Returns current card pool according to all session options (Collections, setRestrictions...)
	cardPool() {
		if (this.unrestrictedCardPool()) {
			let cardPool: CardPool = new Map();
			// Returns all cards if there's no set restriction
			if (this.setRestriction.length === 0) {
				for (let [cid, card] of Cards)
					if (card.in_booster) cardPool.set(cid, this.maxDuplicates?.[card.rarity] ?? 99);
			} else {
				// Use cache otherwise
				for (let set of this.setRestriction)
					for (let cid of BoosterCardsBySet[set])
						cardPool.set(cid, this.maxDuplicates?.[getCard(cid).rarity] ?? 99);
			}
			return cardPool;
		}

		// Restricts collection according to this.setRestriction
		return this.restrictedCollection(this.setRestriction);
	}

	restrictedCollection(sets: Array<string>) {
		const cardPool = this.collection();

		const restricted: CardPool = new Map();
		if (sets && sets.length > 0) {
			for (let s of sets)
				for (let cid of CardsBySet[s].filter((cid) => cardPool.has(cid)))
					restricted.set(cid, cardPool.get(cid) as number);
			return restricted;
		} else return cardPool;
	}

	// Compute user collections intersection (taking into account each user preferences)
	collection(inBoosterOnly = true): CardPool {
		const user_list = [...this.users];
		let intersection = [];
		let collection: CardPool = new Map();

		let useCollection = [];
		for (let i = 0; i < user_list.length; ++i)
			useCollection[i] = Connections[user_list[i]].useCollection && Connections[user_list[i]].collection.size > 0;

		let arrays = [];
		// Start from the first user's collection, or the list of all cards if not available/used
		if (!useCollection[0])
			if (inBoosterOnly) arrays.push(MTGACardIDs.filter((cid) => getCard(cid).in_booster));
			else arrays.push(MTGACardIDs);
		else if (inBoosterOnly)
			arrays.push([...Connections[user_list[0]].collection.keys()].filter((cid) => getCard(cid).in_booster));
		else arrays.push([...Connections[user_list[0]].collection.keys()]);
		for (let i = 1; i < user_list.length; ++i)
			if (useCollection[i]) arrays.push([...Connections[user_list[i]].collection.keys()]);
		intersection = arrayIntersect(arrays);

		// Compute the minimum count of each remaining card
		for (let c of intersection) {
			collection.set(c, useCollection[0] ? (Connections[user_list[0]].collection.get(c) as number) : 4);
			for (let i = 1; i < user_list.length; ++i)
				if (useCollection[i])
					collection.set(
						c,
						Math.min(collection.get(c) as number, Connections[user_list[i]].collection.get(c) as number)
					);
		}
		return collection;
	}

	// Categorize card pool by rarity
	cardPoolByRarity(): SlotedCardPool {
		const cardPoolByRarity: SlotedCardPool = {
			common: new Map(),
			uncommon: new Map(),
			rare: new Map(),
			mythic: new Map(),
		};
		const cardPool = this.cardPool();
		for (let cid of cardPool.keys()) {
			const rarity = getCard(cid).rarity;
			if (!(rarity in cardPoolByRarity)) cardPoolByRarity[rarity] = new Map();
			cardPoolByRarity[rarity].set(cid, cardPool.get(cid) as number);
		}
		return cardPoolByRarity;
	}

	// Returns all cards from specified set categorized by rarity and set to maxDuplicates
	setByRarity(set: string) {
		let local: SlotedCardPool = {
			common: new Map(),
			uncommon: new Map(),
			rare: new Map(),
			mythic: new Map(),
		};
		for (let cid of BoosterCardsBySet[set]) {
			const rarity = getCard(cid).rarity;
			if (!(rarity in local)) local[rarity] = new Map();
			local[rarity].set(cid, this.maxDuplicates?.[rarity] ?? 99);
		}
		return local;
	}

	// Populates this.boosters following session options
	// Options object properties:
	//  - useCustomBoosters: Explicitly enables the use of the CustomBooster option (ignored otherwise)
	//      WARNING (FIXME?): boosterQuantity will be ignored if useCustomBoosters is set and we're not using a customCardList
	//  - targets: Overrides session boosterContent setting
	//  - cardsPerBooster: Overrides session setting for cards per booster using custom card lists without custom slots
	//  - customBoosters & cardsPerPlayer: Overrides corresponding session settings (used for sealed)
	generateBoosters(boosterQuantity: number, options: Options = {}) {
		// Use pre-determined boosters; Make sure supplied booster are correct.
		if (this.usePredeterminedBoosters) {
			if (!this.boosters) {
				this.emitError(
					"No Provided Boosters",
					`Please upload your boosters in the session settings to use Pre-determined boosters.`
				);
				return false;
			}
			if (this.boosters.length !== boosterQuantity) {
				this.emitError(
					"Incorrect Provided Boosters",
					`Incorrect number of booster: Expected ${boosterQuantity}, got ${this.boosters.length}.`
				);
				return false;
			}
			if (this.boosters.some((b) => b.length !== this.boosters[0].length)) {
				this.emitError("Incorrect Provided Boosters", `Inconsistent booster sizes.`);
				return false;
			}
			return true;
		}

		if (this.useCustomCardList) {
			let cclOptions = Object.assign({ colorBalance: this.colorBalance }, options);
			let ret = generateBoosterFromCustomCardList(this.customCardList, boosterQuantity, cclOptions);
			if (ret instanceof MessageError) {
				this.emitError(ret.title, ret.text);
				return false;
			} else {
				this.boosters = ret as UniqueCard[][];
				return true;
			}
		} else {
			// Standard draft boosters
			const targets = options?.targets ?? this.getBoosterContent();

			const BoosterFactoryOptions = {
				foil: this.foil,
				colorBalance: this.colorBalance,
				mythicPromotion: this.mythicPromotion,
				maxDuplicates: this.maxDuplicates,
				onError: (...args: any[]) => {
					this.emitError(...args);
				},
				session: this,
			};

			let defaultFactory = null;

			const getBoosterFactory = function (
				set: string | null,
				cardPool: SlotedCardPool,
				landSlot: BasicLandSlot | null,
				options: Options
			) {
				options = Object.assign({ foilRate: getSetFoilRate(set) }, options);
				// Check for a special booster factory
				if (set && set in SetSpecificFactories)
					return new SetSpecificFactories[set](cardPool, landSlot, options);
				return new BoosterFactory(cardPool, landSlot, options);
			};

			const customBoosters = options?.customBoosters ?? this.customBoosters; // Use override value if provided via options
			const boosterSpecificRules = options.useCustomBoosters && customBoosters.some((v: string) => v !== "");
			const acceptPaperBoosterFactories =
				!this.useBoosterContent &&
				BoosterFactoryOptions.mythicPromotion &&
				!this.maxDuplicates &&
				this.unrestrictedCardPool();
			const isPaperBoosterFactoryAvailable = (set: string) => {
				const excludedSets = ["mh2"]; // Workaround for sets failing our tests (we already have a working implementation anyway, and I don't want to debug it honestly.)
				return (
					(set in PaperBoosterFactories || `${set}-arena` in PaperBoosterFactories) &&
					!excludedSets.includes(set)
				);
			};
			const getPaperBoosterFactory = (set: string) => {
				// FIXME: Collation data has arena/paper variants, but isn't perfect right now, for example:
				//   - Paper IKO has promo versions of the cards that are not available on Arena (as separate cards at least, and with proper collector number), preventing to always rely on the paper collation by default.
				//   - Arena ZNR doesn't have the MDFC requirement properly implemented, preventing to systematically switch to arena collation when available.
				// Hacking this in for now by forcing arena collation for affected sets.
				if (["iko", "klr", "akr"].includes(set))
					return PaperBoosterFactories[`${set}-arena`](BoosterFactoryOptions);
				else return PaperBoosterFactories[set](BoosterFactoryOptions);

				// Proper-ish implementation:
				/*
				// Is Arena Collation available?              Is it the prefered choice, or our only one?                           MTGA collations don't have foil sheets.
				if(`${set}-arena` in PaperBoosterFactories && (this.preferedCollation === 'MTGA' || !(set in PaperBoosterFactories) && !this.foil))
					return PaperBoosterFactories[`${set}-arena`](BoosterFactoryOptions);
				return PaperBoosterFactories[set](BoosterFactoryOptions);
				*/
			};

			// If the default rule will be used, initialize it
			if (!options?.useCustomBoosters || customBoosters.some((v: string) => v === "")) {
				// Use PaperBoosterFactory if possible (avoid computing cardPoolByRarity in this case)
				if (
					acceptPaperBoosterFactories &&
					this.setRestriction.length === 1 &&
					isPaperBoosterFactoryAvailable(this.setRestriction[0])
				) {
					defaultFactory = getPaperBoosterFactory(this.setRestriction[0]);
				} else {
					let localCollection = this.cardPoolByRarity();
					let defaultLandSlot = null;
					if (this.setRestriction.length === 1 && this.setRestriction[0] in SpecialLandSlots)
						defaultLandSlot = SpecialLandSlots[this.setRestriction[0]];
					defaultFactory = getBoosterFactory(
						this.setRestriction.length === 1 ? this.setRestriction[0] : null,
						localCollection,
						defaultLandSlot,
						BoosterFactoryOptions
					);
					// Make sure we have enough cards
					for (let slot of ["common", "uncommon", "rare"]) {
						const card_count = countCards(defaultFactory.cardPool[slot]);
						const card_target = targets[slot] * boosterQuantity;
						if (card_count < card_target) {
							const msg = `Not enough cards (${card_count}/${card_target} ${slot}s) in collection.`;
							this.emitError("Error generating boosters", msg);
							console.warn(msg);
							return false;
						}
					}
				}
			}

			// Simple case, generate all boosters using the default rule
			if (!boosterSpecificRules) {
				this.boosters = [];
				for (let i = 0; i < boosterQuantity; ++i) {
					let booster = defaultFactory?.generateBooster(targets);
					if (booster) this.boosters.push(booster);
					else return false;
				}
			} else {
				// Booster specific rules
				// (boosterQuantity is ignored in this case and boostersPerPlayer * this.getVirtualPlayersCount() is used directly instead)
				const boostersPerPlayer = options?.boostersPerPlayer ?? this.boostersPerPlayer; // Allow overriding via options
				const boosterFactories = [];
				const usedSets: { [set: string]: IBoosterFactory } = {};
				const defaultBasics = BasicLandSlots["znr"]; // Arbitrary set of default basic lands if a specific set doesn't have them.

				// Exceptions for inclusion of basic land slot: Commander Legends as the booster size will be wrong anyway, and TSR/STX/MH2/DBL/BRO that already have 15 cards.
				const irregularSets = ["cmr", "tsr", "stx", "mh2", "dbl", "bro"];
				// If randomized, we'll have to make sure all boosters are of the same size: Adding a land slot to the default rule.
				const addLandSlot =
					this.distributionMode !== "regular" || customBoosters.some((v: string) => v === "random");
				if (
					addLandSlot &&
					defaultFactory &&
					!defaultFactory.landSlot &&
					!(this.setRestriction.length === 1 && irregularSets.includes(this.setRestriction[0]))
				)
					defaultFactory.landSlot =
						this.setRestriction.length === 0 || !BasicLandSlots[this.setRestriction[0]]
							? defaultBasics
							: BasicLandSlots[this.setRestriction[0]];

				let randomSetsPool: string[] = []; // 'Bag' to pick a random set from, avoiding duplicates until necessary

				for (let i = 0; i < this.getVirtualPlayersCount(); ++i) {
					const playerBoosterFactories = [];
					for (let boosterSet of customBoosters) {
						// No specific rules
						if (boosterSet === "") {
							playerBoosterFactories.push(defaultFactory);
						} else {
							// "Random Set from Card Pool" in Chaos Draft
							if (boosterSet === "random") {
								// Refill the bag with all possible sets
								if (randomSetsPool.length === 0)
									randomSetsPool = [
										...(this.setRestriction.length === 0
											? constants.PrimarySets
											: this.setRestriction),
									];
								boosterSet = pickRandom(randomSetsPool);
							}
							// Compile necessary data for this set (Multiple boosters of the same set will share it)
							if (!usedSets[boosterSet]) {
								// Use the corresponding PaperBoosterFactories if possible (is available and of the excepted size when addLandSlot is needed)
								if (
									acceptPaperBoosterFactories &&
									isPaperBoosterFactoryAvailable(boosterSet) &&
									(!addLandSlot || PaperBoosterSizes[boosterSet] === 15)
								) {
									usedSets[boosterSet] = getPaperBoosterFactory(boosterSet);
								} else {
									// As booster distribution and sets can be randomized, we have to make sure that every booster are of the same size: We'll use basic land slot if we have to.
									const landSlot =
										boosterSet in SpecialLandSlots
											? SpecialLandSlots[boosterSet]
											: addLandSlot && !irregularSets.includes(boosterSet)
											? BasicLandSlots[boosterSet]
												? BasicLandSlots[boosterSet]
												: defaultBasics
											: null;
									usedSets[boosterSet] = getBoosterFactory(
										boosterSet,
										this.setByRarity(boosterSet),
										landSlot,
										BoosterFactoryOptions
									);
									// Check if we have enough card, considering maxDuplicate is a limiting factor
									const multiplier = customBoosters.reduce(
										(a: number, v: string) => (v == boosterSet ? a + 1 : a),
										0
									);
									for (let slot of ["common", "uncommon", "rare"]) {
										if (
											countCards((usedSets[boosterSet] as BoosterFactory).cardPool[slot]) <
											multiplier * this.getVirtualPlayersCount() * targets[slot]
										) {
											const msg = `Not enough (${slot}) cards in card pool for individual booster restriction '${boosterSet}'. Please check the Max. Duplicates setting.`;
											this.emitError("Error generating boosters", msg, true, 0);
											console.warn(msg);
											return false;
										}
									}
								}
							}
							playerBoosterFactories.push(usedSets[boosterSet]);
						}
					}
					boosterFactories.push(playerBoosterFactories);
				}

				// Implements distribution mode 'shufflePlayerBoosters'
				if (this.distributionMode === "shufflePlayerBoosters")
					for (let rules of boosterFactories) shuffleArray(rules);

				// Generate Boosters
				this.boosters = [];
				for (let b = 0; b < boostersPerPlayer; ++b) {
					for (let p = 0; p < this.getVirtualPlayersCount(); ++p) {
						const rule = boosterFactories[p][b];
						const booster = rule?.generateBooster(targets);
						if (booster) this.boosters.push(booster);
						else return false;
					}
				}

				if (this.distributionMode === "shuffleBoosterPool") shuffleArray(this.boosters);

				// Boosters within a round much be of the same length.
				// For example CMR packs have a default length of 20 cards and may cause problems if boosters are shuffled.
				if (this.distributionMode !== "regular" || customBoosters.some((v: string) => v === "random")) {
					if (this.boosters.some((b) => b.length !== this.boosters[0].length)) {
						const msg = `Inconsistent booster sizes`;
						this.emitError("Error generating boosters", msg);
						console.error(msg);
						console.error(
							this.boosters.map((b) => `Length: ${b.length}, First Card: (${b[0].set}) ${b[0].name}`)
						);
						return false;
					}
				}
			}
		}
		return true;
	}

	notifyUserChange() {
		// Send only necessary data
		let user_info: Array<any> = [];
		for (let userID of this.getSortedHumanPlayersIDs()) {
			let u = Connections[userID];
			if (u) {
				user_info.push({
					userID: u.userID,
					userName: u.userName,
					collection: u.collection.size > 0,
					useCollection: u.useCollection,
				});
			}
		}

		// Send to all session users
		this.forUsers((user) => {
			if (Connections[user]) {
				Connections[user].socket.emit(
					"sessionOwner",
					this.owner,
					this.owner in Connections ? Connections[this.owner].userName : null
				);
				Connections[user].socket.emit("sessionUsers", user_info);
			}
		});
	}

	cleanDraftState() {
		this.stopCountdowns();
		this.draftState = undefined;
		this.drafting = false;
		this.draftPaused = false;
		this.disconnectedUsers = {};
	}

	///////////////////// Winston Draft //////////////////////
	startWinstonDraft(boosterCount: number) {
		if (this.users.size !== 2) return false;
		this.drafting = true;
		this.emitMessage("Preparing Winston draft!", "Your draft will start soon...", false, 0);
		if (!this.generateBoosters(boosterCount)) {
			this.drafting = false;
			this.broadcastPreparationCancelation();
			return false;
		}
		this.disconnectedUsers = {};
		this.draftState = new WinstonDraftState(this.getSortedHumanPlayersIDs(), this.boosters);
		for (let user of this.users) {
			Connections[user].pickedCards = { main: [], side: [] };
			Connections[user].socket.emit("sessionOptions", {
				virtualPlayersData: this.getSortedHumanPlayerData(),
			});
			Connections[user].socket.emit("startWinstonDraft", this.draftState);
		}

		this.initLogs("Winston Draft");
		if (this.draftLog) for (let userID in this.draftLog.users) this.draftLog.users[userID].picks = [];

		this.boosters = [];
		this.winstonNextRound();
		return true;
	}

	endWinstonDraft() {
		logSession("WinstonDraft", this);
		if (this.draftLog)
			for (let uid of this.users) this.draftLog.users[uid].cards = getPickedCardIds(Connections[uid].pickedCards);
		this.sendLogs();
		for (let user of this.users) Connections[user].socket.emit("winstonDraftEnd");
		this.cleanDraftState();
	}

	winstonNextRound() {
		const s = this.draftState as WinstonDraftState;
		++s.round;
		s.currentPile = 0;
		while (s.currentPile < 3 && !s.piles[s.currentPile].length) ++s.currentPile;
		if (s.currentPile >= 3) {
			this.endWinstonDraft();
		} else {
			for (let user of this.users) {
				Connections[user].socket.emit("winstonDraftSync", s.syncData());
				Connections[user].socket.emit("winstonDraftNextRound", s.currentPlayer());
			}
		}
	}

	winstonSkipPile(): SocketAck {
		const s = this.draftState;
		if (!this.drafting || !s || !(s instanceof WinstonDraftState))
			return new SocketError("This session is not drafting.");
		// If the card pool is empty, make sure there is another pile to pick
		if (
			!s.cardPool.length &&
			((s.currentPile === 0 && !s.piles[1].length && !s.piles[2].length) ||
				(s.currentPile === 1 && !s.piles[2].length) ||
				s.currentPile === 2)
		) {
			return new SocketError("This is your only choice!");
		}

		// Add a new card to skipped pile. (Make sure there's enough cards for the player to draw if this is the last pile)
		if (s.cardPool.length > 1 || (s.currentPile < 2 && s.cardPool.length > 0))
			s.piles[s.currentPile].push(s.cardPool.pop() as UniqueCard);
		// Give a random card from the card pool if this was the last pile
		if (s.currentPile === 2) {
			const card = s.cardPool.pop() as Card;
			Connections[s.currentPlayer()].socket.emit("winstonDraftRandomCard", card);
			this.draftLog?.users[s.currentPlayer()].picks.push({
				randomCard: card.id,
				piles: [...s.piles],
			});
			this.winstonNextRound();
		} else {
			++s.currentPile;
			if (s.piles[s.currentPile].length === 0) this.winstonSkipPile();
			else for (let user of this.users) Connections[user].socket.emit("winstonDraftSync", s.syncData());
		}

		return new SocketAck();
	}

	winstonTakePile() {
		const s = this.draftState as WinstonDraftState;
		if (!this.drafting || !s || !(s instanceof WinstonDraftState)) return false;
		this.draftLog?.users[s.currentPlayer()].picks.push({
			pickedPile: s.currentPile,
			piles: [...s.piles],
		});
		Connections[s.currentPlayer()].pickedCards.main = Connections[s.currentPlayer()].pickedCards.main.concat(
			s.piles[s.currentPile]
		);
		if (s.cardPool.length > 0) s.piles[s.currentPile] = [s.cardPool.pop() as UniqueCard];
		else s.piles[s.currentPile] = [];
		this.winstonNextRound();
		return true;
	}
	///////////////////// Winston Draft End //////////////////////

	///////////////////// Grid Draft //////////////////////
	startGridDraft(boosterCount: number) {
		if (this.users.size != 2) return false;
		this.drafting = true;
		this.emitMessage("Preparing Grid draft!", "Your draft will start soon...", false, 0);
		// When using a custom card list with custom slots, boosters will be truncated to 9 cards by GridDraftState
		// Use boosterContent setting only if it is valid (adds up to 9 cards)
		const cardsPerBooster = Object.values(this.getBoosterContent()).reduce((val, acc) => val + acc, 0);

		if (
			!this.generateBoosters(boosterCount, {
				targets: cardsPerBooster === 9 ? this.getBoosterContent() : { rare: 1, uncommon: 3, common: 5 },
				cardsPerBooster: 9,
			})
		) {
			this.drafting = false;
			this.broadcastPreparationCancelation();
			return false;
		}

		this.disconnectedUsers = {};
		this.draftState = new GridDraftState(this.getSortedHumanPlayersIDs(), this.boosters);
		const s = this.draftState as GridDraftState;
		if (s.error) {
			this.emitError(s.error.title, s.error.text);
			this.broadcastPreparationCancelation();
			this.cleanDraftState();
			return false;
		}

		for (let user of this.users) {
			Connections[user].pickedCards = { main: [], side: [] };
			Connections[user].socket.emit("sessionOptions", {
				virtualPlayersData: this.getSortedHumanPlayerData(),
			});
			Connections[user].socket.emit("startGridDraft", s.syncData());
		}

		const log = this.initLogs("Grid Draft");
		for (let userID in log.users) log.users[userID].picks = [];

		this.boosters = [];
		return true;
	}

	endGridDraft() {
		logSession("GridDraft", this);
		if (this.draftLog) {
			for (let uid of this.users) this.draftLog.users[uid].cards = getPickedCardIds(Connections[uid].pickedCards);
			this.sendLogs();
		}
		for (let user of this.users) Connections[user].socket.emit("gridDraftEnd");
		this.cleanDraftState();
	}

	gridDraftNextRound() {
		const s = this.draftState as GridDraftState;
		if (!this.drafting || !s || !(s instanceof GridDraftState)) return;

		++s.round;
		if (s.round % 2 === 0) {
			// Share the last pick before advancing to the next booster.
			const syncData: any = s.syncData();
			syncData.currentPlayer = null; // Set current player to null as a flag to delay the display update
			for (let user of this.users) Connections[user].socket.emit("gridDraftNextRound", syncData);
			s.boosters.shift();
			if (s.boosters.length === 0) {
				this.endGridDraft();
				return;
			}
		}
		for (let user of this.users) Connections[user].socket.emit("gridDraftNextRound", s.syncData());
	}

	gridDraftPick(choice: number) {
		const s = this.draftState as GridDraftState;
		if (!this.drafting || !s || !(s instanceof GridDraftState)) return false;

		const log: any = { pick: [], booster: s.boosters[0].map((c) => (c ? c.id : null)) };

		let pickedCards = [];
		for (let i = 0; i < 3; ++i) {
			//                     Column           Row
			let idx = choice < 3 ? 3 * i + choice : 3 * (choice - 3) + i;
			if (s.boosters[0][idx] !== null) {
				Connections[s.currentPlayer()].pickedCards.main.push(s.boosters[0][idx] as UniqueCard);
				pickedCards.push(s.boosters[0][idx]);
				log.pick.push(idx);
				s.boosters[0][idx] = null;
			}
		}

		this.draftLog?.users[s.currentPlayer()].picks.push(log);
		s.lastPicks.unshift({
			userName: Connections[s.currentPlayer()].userName,
			round: s.round,
			cards: pickedCards,
		});
		if (s.lastPicks.length > 2) s.lastPicks.pop();

		if (pickedCards.length === 0) return false;

		this.gridDraftNextRound();
		return true;
	}
	///////////////////// Grid Draft End //////////////////////

	///////////////////// Rochester Draft //////////////////////
	startRochesterDraft() {
		if (this.users.size <= 1) return false;
		if (this.randomizeSeatingOrder) this.randomizeSeating();
		this.drafting = true;
		this.emitMessage("Preparing Rochester draft!", "Your draft will start soon...", false, 0);
		if (!this.generateBoosters(this.boostersPerPlayer * this.users.size, { useCustomBoosters: true })) {
			this.drafting = false;
			this.broadcastPreparationCancelation();
			return;
		}

		this.disconnectedUsers = {};
		this.draftState = new RochesterDraftState(this.getSortedHumanPlayersIDs(), this.boosters);
		for (let user of this.users) {
			Connections[user].pickedCards = { main: [], side: [] };
			Connections[user].socket.emit("sessionOptions", {
				virtualPlayersData: this.getSortedHumanPlayerData(),
			});
			Connections[user].socket.emit("startRochesterDraft", (this.draftState as RochesterDraftState).syncData());
		}

		const log = this.initLogs("Rochester Draft");
		for (let userID in log.users) log.users[userID].picks = [];

		this.boosters = [];
		return true;
	}

	endRochesterDraft() {
		const s = this.draftState;
		if (!this.drafting || !s || !(s instanceof RochesterDraftState)) return false;
		logSession("RochesterDraft", this);
		for (let uid of this.users) {
			if (this.draftLog) this.draftLog.users[uid].cards = getPickedCardIds(Connections[uid].pickedCards);
			Connections[uid].socket.emit("rochesterDraftEnd");
		}
		this.sendLogs();
		this.cleanDraftState();
	}

	rochesterDraftNextRound() {
		const s = this.draftState;
		if (!this.drafting || !s || !(s instanceof RochesterDraftState)) return false;
		// Empty booster, open the next one
		if (s.boosters[0].length === 0) {
			s.boosters.shift();
			// No more boosters; End draft.
			if (s.boosters.length === 0) {
				this.endRochesterDraft();
				return;
			}
			s.pickNumber = 0;
			++s.boosterNumber;
		} else {
			++s.pickNumber;
		}
		const syncData = s.syncData();
		for (let user of this.users) Connections[user].socket.emit("rochesterDraftNextRound", syncData);
	}

	rochesterDraftPick(idx: number) {
		const s = this.draftState as RochesterDraftState;
		if (!this.drafting || !s || !(s instanceof RochesterDraftState)) return false;

		Connections[s.currentPlayer()].pickedCards.main.push(s.boosters[0][idx]);

		this.draftLog?.users[s.currentPlayer()].picks.push({
			pick: [idx],
			booster: s.boosters[0].map((c) => c.id),
		});

		s.lastPicks.unshift({
			userName: Connections[s.currentPlayer()].userName,
			round: s.lastPicks.length === 0 ? 0 : s.lastPicks[0].round + 1,
			cards: [s.boosters[0][idx]],
		});
		if (s.lastPicks.length > 2) s.lastPicks.pop();

		s.boosters[0].splice(idx, 1);

		this.rochesterDraftNextRound();
		return true;
	}
	///////////////////// Rochester Draft End //////////////////////

	startMinesweeperDraft(
		gridCount: number,
		gridWidth: number,
		gridHeight: number,
		picksPerGrid: number,
		options: Options = {}
	): SocketAck {
		if (this.users.size <= 1)
			return new SocketError(
				"Unsufficient number of players",
				"Minesweeper draft necessitates at least two players. Bots are not supported."
			);
		if (this.randomizeSeatingOrder) this.randomizeSeating();
		if (!this.useCustomCardList) {
			return new SocketError(
				"Error",
				"Minesweeper draft is only available for cube drafting. Please select a custom card list."
			);
		}
		this.drafting = true;
		this.emitMessage("Preparing Minesweeper draft!", "Your draft will start soon...", false, 0);
		if (!this.generateBoosters(gridCount, { cardsPerBooster: gridWidth * gridHeight })) {
			this.drafting = false;
			this.broadcastPreparationCancelation();
			return new SocketAck(); // generateBoosters already emits errors.
		}

		if (this.boosters.some((b) => b.length !== gridWidth * gridHeight)) {
			this.drafting = false;
			this.broadcastPreparationCancelation();
			return new SocketError(
				"Erroneous Pack Size",
				"An error occured while generating the packs for your Minesweeper draft, please check your settings."
			);
		}

		this.initLogs("Minesweeper Draft");

		this.disconnectedUsers = {};
		this.draftState = new MinesweeperDraftState(
			this.getSortedHumanPlayersIDs(),
			this.boosters,
			gridWidth,
			gridHeight,
			picksPerGrid,
			options
		);
		for (let user of this.users) {
			Connections[user].pickedCards = { main: [], side: [] };
			Connections[user].socket.emit("sessionOptions", {
				virtualPlayersData: this.getSortedHumanPlayerData(),
			});
			Connections[user].socket.emit(
				"startMinesweeperDraft",
				(this.draftState as MinesweeperDraftState).syncData()
			);
		}

		this.boosters = [];
		return new SocketAck();
	}

	minesweeperDraftPick(userID: UserID, row: number, col: number): SocketAck {
		const s = this.draftState as MinesweeperDraftState;
		if (!this.drafting || !s || !(s instanceof MinesweeperDraftState))
			return new SocketError("Not Playing", "There's no Minesweeper Draft running on this session.");
		if (s.grid().get(row, col)?.state !== MinesweeperCellState.Revealed)
			return new SocketError("Invalid Coordinates", "Cards can only be picked after being revealed.");

		const currentUserID = s.currentPlayer();
		if (currentUserID !== userID) return new SocketError("Not your turn", "It's not your turn to pick.");
		s.pick(row, col);
		const currentGridState = s.syncData();

		const pickedCard = s.grid().get(row, col)?.card as UniqueCard;
		Connections[userID].pickedCards.main.push(pickedCard);

		s.lastPicks.unshift({
			userName: Connections[userID].userName,
			round: s.lastPicks.length === 0 ? 0 : s.lastPicks[0].round + 1,
			cards: [pickedCard],
		});
		if (s.lastPicks.length > 2) s.lastPicks.pop();

		if (s.advance()) {
			// Send the state without current player for animation purposes.
			this.forUsers((userID) => {
				currentGridState.currentPlayer = "";
				Connections[userID].socket.emit("minesweeperDraftState", currentGridState);
			});

			if (s.done()) {
				this.endMinesweeperDraft();
			} else {
				// Send the next grid immediately, front-end will handle the animation
				const nextGridState = s.syncData();
				this.forUsers((userID) => {
					Connections[userID].socket.emit("minesweeperDraftState", nextGridState);
				});
			}
		} else {
			this.forUsers((userID) => {
				Connections[userID].socket.emit("minesweeperDraftState", currentGridState);
			});
		}

		return new SocketAck();
	}

	endMinesweeperDraft(options: Options = {}) {
		const s = this.draftState as MinesweeperDraftState;
		if (!this.drafting || !s || !(s instanceof MinesweeperDraftState)) return false;
		logSession("MinesweeperDraft", this);
		for (let uid of this.users) {
			if (this.draftLog) this.draftLog.users[uid].cards = getPickedCardIds(Connections[uid].pickedCards);
			Connections[uid].socket.emit("minesweeperDraftEnd", options);
		}
		this.sendLogs();
		this.cleanDraftState();
	}

	///////////////////// Traditional Draft Methods //////////////////////
	async startDraft() {
		if (this.drafting) return;
		if (this.randomizeSeatingOrder) this.randomizeSeating();

		this.emitMessage("Preparing draft!", "Your draft will start soon...", false, 0);

		let boosterQuantity = (this.users.size + this.bots) * this.boostersPerPlayer;
		console.log(`Session ${this.id}: Starting draft! (${this.users.size} players)`);

		if (
			!this.generateBoosters(boosterQuantity, { useCustomBoosters: true, cardsPerBooster: this.cardsPerBooster })
		) {
			this.broadcastPreparationCancelation();
			return;
		}

		// Determine bot type
		const oracleIds = this.boosters.flat().map((card) => card.oracle_id);
		const simpleBots = await fallbackToSimpleBots([...new Set(oracleIds)]);

		// There is a very slim possibility that everyone disconnects during the asynchronous call to fallbackToSimpleBots,
		// raising an exception and leaving the session in an invalid state. I hope this will catch all possible failure cases.
		try {
			this.draftState = new DraftState(this.boosters, this.getSortedHumanPlayersIDs(), {
				simpleBots: simpleBots,
				botCount: this.bots,
			});
			this.disconnectedUsers = {};
			this.drafting = true;
		} catch (e) {
			console.error("Exception raised while constructing the DraftState: ", e);
			this.cleanDraftState();
			return;
		}

		// Draft Log initialization
		const log = this.initLogs("Draft");
		for (let userID in log.users) log.users[userID].picks = [];

		let virtualPlayerData = this.getSortedVirtualPlayerData();
		for (let uid of this.users) {
			Connections[uid].pickedCards = { main: [], side: [] };
			Connections[uid].socket.emit("startDraft", virtualPlayerData);
		}

		if (!this.ownerIsPlayer && this.owner in Connections) {
			Connections[this.owner].socket.emit("startDraft", virtualPlayerData);
			// Update draft log for live display if owner in not playing
			if (this.shouldSendLiveUpdates()) {
				Connections[this.owner].socket.emit("draftLogLive", {
					log: this.draftLog,
				});
			}
		}

		this.boosters = [];
		this.distributeBoosters();
	}

	// Pass a booster to the next player at the table
	passBooster(booster: Array<UniqueCard>, userID: UserID) {
		const s = this.draftState as DraftState;
		if (!s) return;

		// Booster is empty or the remaining cards have to be burned
		if (booster.length <= Math.max(0, this.discardRemainingCardsAt)) {
			// Don't re-insert it, and check for end of round
			this.checkDraftRoundEnd();
		} else {
			// Re-insert the booster back for the next player
			const playerIds = Object.keys(s.players);
			let idx = playerIds.indexOf(userID);
			idx += s.boosterNumber % 2 ? -1 : 1;
			idx = negMod(idx, playerIds.length);
			const nextUserID = playerIds[idx];
			s.players[nextUserID].boosters.push(booster);

			// Synchronize concerned users
			if (s.players[nextUserID].isBot || this.isDisconnected(nextUserID)) {
				this.startBotPickChain(nextUserID);
			} else {
				this.sendDraftState(nextUserID);
				// This user was waiting for a booster
				if (s.players[nextUserID].boosters.length === 1) {
					this.startCountdown(nextUserID);
					this.requestBotRecommendation(nextUserID);
				}
			}
		}

		// Update player states
		const virtualPlayersData = this.getSortedVirtualPlayerData();
		this.forUsers((uid) =>
			Connections[uid]?.socket.emit("sessionOptions", {
				virtualPlayersData: virtualPlayersData,
			})
		);
	}

	async pickCard(userID: UserID, pickedCards: Array<number>, burnedCards: Array<number>) {
		if (!this.drafting || this.draftState?.type !== "draft")
			return new SocketError("This session is not drafting.");

		const s = this.draftState as DraftState;

		const reportError = (err: string) => {
			console.error(err);
			return new SocketError(err);
		};

		// Checks

		if (s.players[userID].boosters.length === 0)
			return reportError(`You already picked! Wait for the other players.`);

		let booster = s.players[userID].boosters[0];

		const picksThisRound = Math.min(
			this.doubleMastersMode && s.players[userID].pickNumber > 0 ? 1 : this.pickedCardsPerRound,
			booster.length
		);

		if (!pickedCards || pickedCards.length !== picksThisRound)
			return reportError(
				`Invalid picked cards (pickedCards: ${pickedCards}, booster length: ${booster.length}).`
			);
		if (pickedCards.some((idx) => idx >= booster.length))
			return reportError(
				`Invalid card index [${pickedCards.join(", ")}] for booster #${booster} (${booster.length}).`
			);

		if (
			burnedCards &&
			(burnedCards.length > this.burnedCardsPerRound ||
				burnedCards.length !== Math.min(this.burnedCardsPerRound, booster.length - pickedCards.length) ||
				burnedCards.some((idx) => idx >= booster.length))
		)
			return reportError(
				`Invalid burned cards (expected length: ${this.burnedCardsPerRound}, burnedCards: ${burnedCards.length}, booster: ${booster.length}).`
			);

		console.log(
			`Session ${this.id}: ${Connections[userID].userName} [${userID}] picked card '${pickedCards.map(
				(idx) => booster[idx].name
			)}', burning ${burnedCards && burnedCards.length > 0 ? burnedCards.length : "nothing"}.`
		);

		// Request is valid, actually extract the booster and proceed
		this.stopCountdown(userID);
		booster = s.players[userID].boosters.splice(0, 1)[0];

		for (let idx of pickedCards) {
			Connections[userID].pickedCards.main.push(booster[idx]);
			s.players[userID].botInstance?.addCard(booster[idx]);
		}

		const pickData = {
			pick: pickedCards,
			burn: burnedCards,
			booster: booster.map((c) => c.id),
		};
		this.draftLog?.users[userID].picks.push(pickData);

		let cardsToRemove = pickedCards;
		if (burnedCards) cardsToRemove = cardsToRemove.concat(burnedCards);
		cardsToRemove.sort((a, b) => b - a); // Remove last index first to avoid shifting indices

		// Update draft log for live display if owner in not playing (Do this before removing the cards, damnit!)
		if (this.shouldSendLiveUpdates()) {
			Connections[this.owner].socket.emit("draftLogLive", { userID: userID, pick: pickData });
			Connections[this.owner].socket.emit("pickAlert", {
				userName: Connections[userID].userName,
				cards: pickedCards.map((idx) => booster[idx]),
			});
		}

		for (let idx of cardsToRemove) booster.splice(idx, 1);

		++s.players[userID].pickNumber;

		this.passBooster(booster, userID);

		this.sendDraftState(userID);
		if (s.players[userID].boosters.length > 0) {
			this.startCountdown(userID);
			this.requestBotRecommendation(userID);
		}

		return new SocketAck();
	}

	// Restart a pick chain if necessary
	startBotPickChain(userID: UserID) {
		const s = this.draftState as DraftState;
		if (s && !s.players[userID].botPickInFlight && s.players[userID].boosters.length > 0) {
			s.players[userID].botPickInFlight = true;
			this.doBotPick(userID).catch((error) => {
				console.error(
					`Session.startBotPickChain (sessionID: ${this.id}, nextUserID: ${userID}): doBotPick errored:`
				);
				console.error(error);
				console.error("Associated Player:", s.players[userID]);
			});
		} // else: This bot is already picking, do nothing.
	}

	// To ensure a single call to doBotPick is in flight at any time,
	// doBotPick should always recursively call itself, or set isBotWaiting to true.
	async doBotPick(userID: UserID): Promise<void> {
		const s = this.draftState as DraftState;

		assert(s.players[userID].botPickInFlight, "Error: Call to doBotPick with botPickInFlight not set to true.");
		assert(s.players[userID].boosters.length > 0, "Error: Call to doBotPick with no boosters.");

		// Since this runs asynchronously, there's multiple points were we should make sure the session state is still valid (mostly that the draft has not been prematurely stopped) before continuing.
		const shouldStop = () => {
			const state = this.draftState as DraftState;
			// Draft may have been manually terminated by the owner.
			if (!state?.players) {
				s.players[userID].botPickInFlight = false;
				return true;
			}
			// An attempt at avoiding promises outliving the session (this all players disconnect for example).
			if (!state?.players[userID]?.botPickInFlight) return true;
			// Player may have reconnected
			if (!state?.players[userID].isBot && !this.isDisconnected(userID)) {
				s.players[userID].botPickInFlight = false;
				return true;
			}

			// Session has been automatically stashed away
			if (!isBot(s.players[userID].botInstance)) {
				s.players[userID].botPickInFlight = false;
				return true;
			}

			return false;
		};

		// Since startBotPickChain can be deplayed by multiple seconds to stagger the API calls, the session may be
		// stashed away when we reach this point (if the user left the application right after launching a draft for example),
		// in this case the session is turned into a PoD structure ('isBot' test will fail) and we should stop there.
		if (shouldStop()) return;

		// Choose cards
		const pickedIndices = [];
		const burnedIndices = [];
		{
			const boosterNumber = s.boosterNumber;
			const pickNumber = s.players[userID].pickNumber;
			const numPicks = s.numPicks;

			const picksThisRound = this.doubleMastersMode && pickNumber > 0 ? 1 : this.pickedCardsPerRound;

			const booster = s.players[userID].boosters[0];
			// Avoid using bots if it is not necessary: We're picking the whole pack.
			if (picksThisRound >= booster.length) {
				for (let i = 0; i < booster.length; i++) {
					pickedIndices.push(i);
				}
			} else {
				const boosterCopy = [...booster]; // Working copy for multiple picks
				for (let i = 0; i < picksThisRound && boosterCopy.length > 0; ++i) {
					const pickedIdx = await s.players[userID].botInstance.pick(
						boosterCopy,
						boosterNumber,
						this.boostersPerPlayer,
						pickNumber,
						numPicks
					);
					if (shouldStop()) return;
					const originalIdx = booster.indexOf(boosterCopy[pickedIdx]);
					// Original booster was modified, most probable is that a player reconnected
					if (originalIdx === -1) return;
					pickedIndices.push(originalIdx);
					boosterCopy.splice(pickedIdx, 1);
				}
				for (let i = 0; i < this.burnedCardsPerRound && boosterCopy.length > 0; ++i) {
					const burnedIdx = await s.players[userID].botInstance.burn(
						boosterCopy,
						boosterNumber,
						this.boostersPerPlayer,
						pickNumber,
						numPicks
					);
					if (shouldStop()) return;
					const originalIdx = booster.indexOf(boosterCopy[burnedIdx]);
					if (originalIdx === -1) return;
					burnedIndices.push(originalIdx);
					boosterCopy.splice(burnedIdx, 1);
				}
			}
		}

		const booster = s.players[userID].boosters.splice(0, 1)[0];
		++s.players[userID].pickNumber;

		const pickedCards = pickedIndices.map((idx) => booster[idx]);

		// We're actually picking on behalf of a disconnected player
		if (!s.players[userID].isBot && this.isDisconnected(userID))
			this.disconnectedUsers[userID].pickedCards.main.push(...pickedCards);

		const pickData = {
			pick: pickedIndices,
			burn: burnedIndices,
			booster: booster.map((c) => c.id),
		};
		this.draftLog?.users[userID].picks.push(pickData);

		if (this.shouldSendLiveUpdates())
			Connections[this.owner]?.socket.emit("draftLogLive", { userID: userID, pick: pickData });

		let cardsToRemove = pickedIndices.concat(burnedIndices);
		cardsToRemove.sort((a, b) => b - a); // Remove last index first to avoid shifting indices
		for (let idx of cardsToRemove) booster.splice(idx, 1);

		this.passBooster(booster, userID);

		// Chain calls as long as we have boosters left
		if (s.players[userID].boosters.length > 0) {
			this.doBotPick(userID).catch((error) => {
				console.error(`Session.doBotPick (sessionID: ${this.id}, userID: ${userID}): doBotPick errored:`);
				console.error(error);
			});
		} else s.players[userID].botPickInFlight = false;
	}

	sendDraftState(userID: UserID) {
		const s = this.draftState as DraftState;
		if (userID in Connections)
			Connections[userID].socket.emit("draftState", {
				booster: s.players[userID].boosters[0],
				boosterCount: s.players[userID].boosters.length,
				boosterNumber: s.boosterNumber,
				pickNumber: s.players[userID].pickNumber,
			});
	}

	requestBotRecommendation(userID: UserID) {
		const s = this.draftState as DraftState;
		const p = s.players[userID];
		// Asyncronously ask for bot recommendations, and send then when available
		if (!this.disableBotSuggestions && p.botInstance && p.boosters.length > 0) {
			(() => {
				const localData = {
					booster: p.boosters[0],
					boosterNumber: s.boosterNumber,
					boostersPerPlayer: this.boostersPerPlayer,
					pickNumber: p.pickNumber,
					numPicks: s.numPicks,
				};
				return p.botInstance
					?.getScores(
						localData.booster,
						localData.boosterNumber,
						localData.boostersPerPlayer,
						localData.pickNumber,
						localData.numPicks
					)
					.then((value) => {
						Connections[userID]?.socket.emit("botRecommandations", {
							pickNumber: localData.pickNumber,
							scores: value,
						});
					})
					.catch((error) => {
						console.error("Error in bot recommendation promise:");
						console.error(error);
					});
			})();
		}
	}

	distributeBoosters() {
		if (this.draftState?.type !== "draft") return;
		const s = this.draftState as DraftState;

		const totalVirtualPlayers = this.getVirtualPlayersCount();

		// End draft if there is no more booster to distribute
		if (s.boosters.length == 0) {
			this.endDraft();
			return;
		}

		const boosters = s.boosters.splice(0, totalVirtualPlayers);
		s.numPicks = boosters[0].length;

		const staggerDelay = 200; // Will delay successive calls to the mtgdraftbots API
		let inFlightBots = 0;
		const delayRequest = (botType: string) => {
			if (botType !== "mtgdraftbots") return Promise.resolve();
			let r = new Promise((resolve) => setTimeout(resolve, staggerDelay * inFlightBots));
			inFlightBots++;
			return r;
		};

		let index = 0;
		for (let userID in s.players) {
			const p = s.players[userID];
			assert(p.boosters.length === 0, `distributeBoosters: ${userID} boosters.length ${p.boosters.length}`);
			const boosterIndex = negMod(index, totalVirtualPlayers);
			p.boosters.push(boosters[boosterIndex]);
			p.pickNumber = 0;
			if (p.isBot) {
				delayRequest((p.botInstance as IBot).type)
					.then(() => this.startBotPickChain(userID))
					.catch((error) => {
						console.error(
							`Session ${this.id}: Error in initial startBotPickChain call (Bot ID: ${userID}):`
						);
						console.error(error);
					});
			} else {
				if (userID in this.disconnectedUsers) {
					this.startBotPickChain(userID);
				} else {
					this.sendDraftState(userID);
					this.requestBotRecommendation(userID);
				}
			}
			++index;
		}

		if (!this.ownerIsPlayer) {
			Connections[this.owner]?.socket.emit("draftState", {
				boosterNumber: s.boosterNumber,
			});
		}

		this.startCountdowns(); // Starts countdown now that everyone has their booster
	}

	checkDraftRoundEnd() {
		if (!(this.draftState instanceof DraftState)) return false;
		const s = this.draftState as DraftState;
		if ([...Object.values(s.players)].every((p) => p.boosters.length === 0)) {
			++s.boosterNumber;
			this.distributeBoosters();
			return true;
		}
		return false;
	}

	resumeOnReconnection(msg: { title: string; text: string }) {
		if (!this.drafting) return;

		console.warn(`resumeOnReconnection(): Restarting draft for session ${this.id}.`);

		this.forUsers((user) =>
			Connections[user]?.socket.emit("sessionOptions", {
				virtualPlayersData: this.getSortedVirtualPlayerData(),
			})
		);

		if (this.draftState instanceof DraftState) {
			if (!this.draftPaused) this.resumeCountdowns();
			// Restart bot pick chains
			for (let uid in this.draftState.players)
				if (this.draftState.players[uid].isBot) this.startBotPickChain(uid);
		}

		this.forUsers((u) =>
			Connections[u]?.socket.emit("resumeOnReconnection", {
				msg,
			})
		);
	}

	endDraft() {
		if (!this.drafting) return;
		const s = this.draftState as DraftState;

		// Allow other callbacks (like distributeBoosters) to finish before proceeding (actually an issue in tests).
		process.nextTick(() => {
			if (this.draftLog) {
				for (let userID in s.players) {
					if (s.players[userID].isBot) {
						this.draftLog.users[userID].cards = s.players[userID].botInstance.cards.map((c: Card) => c.id);
					} else {
						this.draftLog.users[userID].cards = getPickedCardIds(
							// Has this user been replaced by a bot?
							(this.isDisconnected(userID) ? this.disconnectedUsers[userID] : Connections[userID])
								.pickedCards
						);
					}
				}

				this.sendLogs();
			}
			logSession("Draft", this);
			this.cleanDraftState();

			this.forUsers((u) => Connections[u].socket.emit("endDraft"));
			console.log(`Session ${this.id} draft ended.`);
		});
	}

	stopDraft() {
		if (!this.drafting || !this.draftState) return;
		switch (this.draftState.type) {
			case "winston":
				this.endWinstonDraft();
				break;
			case "grid":
				this.endGridDraft();
				break;
			case "rochester":
				this.endRochesterDraft();
				break;
			case "minesweeper":
				this.endMinesweeperDraft({ immediate: true });
				break;
			case "draft": {
				this.endDraft();
				break;
			}
		}
	}

	pauseDraft() {
		if (!this.drafting) return;

		this.draftPaused = true;

		if (this.draftState instanceof DraftState) this.stopCountdowns();
		this.forUsers((u) => Connections[u]?.socket.emit("pauseDraft"));
	}

	resumeDraft() {
		if (!this.drafting || !this.draftPaused) return;
		if (this.draftState instanceof DraftState) this.resumeCountdowns();
		this.draftPaused = false;
		this.forUsers((u) => Connections[u]?.socket.emit("resumeDraft"));
	}

	///////////////////// Traditional Draft End  //////////////////////

	initLogs(type: string = "Draft"): DraftLog {
		const carddata: { [cid: string]: Card } = {};
		const customGetCard = this.getCustomGetCardFunction();
		if (this.boosters) for (let c of this.boosters.flat()) carddata[c.id] = customGetCard(c.id);
		this.draftLog = new DraftLog(type, this, carddata, this.getSortedVirtualPlayerData());
		return this.draftLog;
	}

	// Returns a copy of the current draft log without the pick details, except for an optional recipient.
	getStrippedLog(recipientUID: UserID | undefined = undefined) {
		if (!this.draftLog) return;
		const strippedLog: DraftLog = {
			version: this.draftLog.version,
			type: this.draftLog.type,
			users: {},
			sessionID: this.draftLog.sessionID,
			time: this.draftLog.time,
			setRestriction: this.draftLog.setRestriction,
			useCustomBoosters: this.draftLog.useCustomBoosters,
			customBoosters: this.draftLog.customBoosters,
			boosters: [], // Omited
			carddata: {} as { [cid: string]: Card },

			delayed: this.draftLog.delayed,
			personalLogs: this.draftLog.personalLogs,
			teamDraft: this.draftLog.teamDraft,
		};

		const getCardFunc = this.getCustomGetCardFunction();

		for (let uid in this.draftLog.users) {
			if (uid === recipientUID) {
				strippedLog.users[uid] = this.draftLog.users[uid];
				// We also have to supply card data for all cards seen by the player.
				if (this.draftLog.type === "Draft" && this.draftLog.users[uid].picks)
					for (let pick of this.draftLog.users[uid].picks)
						for (let cid of pick.booster) strippedLog.carddata[cid] = getCardFunc(cid);
				else for (let cid of this.draftLog.users[uid].cards) strippedLog.carddata[cid] = getCardFunc(cid);
			} else {
				strippedLog.users[uid] = {
					userID: this.draftLog.users[uid].userID,
					userName: this.draftLog.users[uid].userName,
				};
				if (this.draftLog.users[uid].decklist)
					strippedLog.users[uid].decklist = { hashes: this.draftLog.users[uid].decklist.hashes };
			}
		}
		return strippedLog;
	}

	// Sends the current draft log to all users according to the specified recipient(s).
	sendLogs() {
		if (!this.draftLog) return;
		switch (this.draftLogRecipients) {
			case "none":
				if (this.personalLogs)
					this.forUsers((uid) => Connections[uid]?.socket.emit("draftLog", this.getStrippedLog(uid)));
				else {
					const strippedLog = this.getStrippedLog();
					this.forUsers((uid) => Connections[uid]?.socket.emit("draftLog", strippedLog));
				}
				break;
			default:
			case "delayed":
				this.draftLog.delayed = true;
			// Fallthrough
			case "owner":
				Connections[this.owner].socket.emit("draftLog", this.draftLog);
				if (this.personalLogs)
					this.forNonOwners((uid) => Connections[uid]?.socket.emit("draftLog", this.getStrippedLog(uid)));
				else {
					const strippedLog = this.getStrippedLog();
					this.forNonOwners((uid) => Connections[uid]?.socket.emit("draftLog", strippedLog));
				}
				break;
			case "everyone":
				this.forUsers((uid) => Connections[uid]?.socket.emit("draftLog", this.draftLog));
				break;
		}
	}

	distributeSealed(boostersPerPlayer: number, customBoosters: Array<string>) {
		this.emitMessage("Distributing sealed boosters...", "", false, 0);

		const useCustomBoosters = customBoosters && customBoosters.some((s) => s !== "");
		if (
			!this.generateBoosters(this.users.size * boostersPerPlayer, {
				boostersPerPlayer: boostersPerPlayer,
				useCustomBoosters: useCustomBoosters,
				customBoosters: useCustomBoosters ? customBoosters : null,
			})
		) {
			this.broadcastPreparationCancelation();
			return;
		}
		const log = this.initLogs("Sealed");
		log.customBoosters = customBoosters; // Override the session setting by the boosters provided to this function.

		let idx = 0;
		for (let userID of this.users) {
			const playersBoosters = [];
			let currIdx = idx;
			while (currIdx < this.boosters.length) {
				playersBoosters.push(this.boosters[currIdx]);
				currIdx += this.users.size;
			}
			Connections[userID].socket.emit("setCardSelection", playersBoosters);
			log.users[userID].cards = playersBoosters.flat().map((c) => c.id);
			++idx;
		}

		this.sendLogs();

		// If owner is not playing, let them know everything went ok.
		if (!this.ownerIsPlayer && this.owner in Connections) {
			Connections[this.owner].socket.emit("message", {
				title: "Sealed pools successfly distributed!",
				showConfirmButton: false,
			});
		}

		logSession("Sealed", this);

		this.boosters = [];
	}

	distributeJumpstart(set: string | null) {
		this.emitMessage("Distributing jumpstart boosters...", "", false, 0);

		const log = this.initLogs("Jumpstart");
		log.carddata = {};

		// Jumpstart: Historic Horizons
		if (set === "j21" || set === "super") {
			for (let user of this.users) {
				// Randomly get 2*3 packs and let the user choose among them.
				let choices: any = [];
				if (set === "j21") {
					choices.push(getNDisctinctRandom(JumpstartHHBoosters, 3).map(generateJHHBooster));
					// The choices are based on the first pick colors (we send all possibilties rather than waiting for user action).
					let secondchoice = [];
					for (let i = 0; i < 3; ++i) {
						const candidates: JHHBoosterPattern[] = JumpstartHHBoosters.filter((p) => {
							if (p.name === choices[0][i].name) return false; // Prevent duplicates
							if (p.colors.length === 5) return true; // WUBRG can always be picked
							// If first pack is mono-colored: Mono colored, Dual colored than contains the first pack's color, or WUBRG
							if (choices[0][i].colors.length === 1) return p.colors.includes(choices[0][i].colors[0]);
							// If first pack is dual-colored: Mono colored of one of these colors, Dual colored of the same colors, or WUBRG
							return (
								p.colors === choices[0][i].colors ||
								(p.colors.length === 1 && choices[0][i].colors.includes(p.colors[0]))
							);
						});
						secondchoice.push(getNDisctinctRandom(candidates, 3).map(generateJHHBooster));
					}
					choices.push(secondchoice);
				} else {
					choices.push(getNDisctinctRandom(SuperJumpBoosters, 3).map(generateJHHBooster));
					// Second choice does not depend on the first one in this case, but we'll keep the same interface for simplicity.
					choices.push([]);
					const secondChoice = getNDisctinctRandom(SuperJumpBoosters, 3).map(generateJHHBooster);
					for (let i = 0; i < 3; ++i) choices[1].push(secondChoice);
				}
				Connections[user].socket.emit("selectJumpstartPacks", choices, (user: UserID, cards: CardID[]) => {
					if (!this.draftLog) return;
					this.draftLog.users[user].cards = cards;
					for (let cid of this.draftLog.users[user].cards) this.draftLog.carddata[cid] = getCard(cid);
					if (
						Object.keys(this.draftLog.users).every(
							(uid: UserID) => this.draftLog?.users[uid].cards !== null
						)
					) {
						this.sendLogs();
						logSession("Jumpstart", this);
					}
				});
			}
		} else {
			// Original Jumpstart
			for (let user of this.users) {
				let boosters = [getRandom(JumpstartBoosters), getRandom(JumpstartBoosters)];
				const cards = boosters.map((b) => b.cards.map((cid: CardID) => getUnique(cid)));

				log.users[user].cards = cards.flat().map((c: Card) => c.id);
				for (let cid of log.users[user].cards) log.carddata[cid] = getCard(cid);

				Connections[user].socket.emit("setCardSelection", cards);
				Connections[user].socket.emit("message", {
					icon: "success",
					imageUrl: "/img/2JumpstartBoosters.webp",
					title: "Here are your Jumpstart boosters!",
					text: `You got '${boosters[0].name}' and '${boosters[1].name}'.`,
					showConfirmButton: false,
					timer: 2000,
				});
			}
			this.sendLogs();
			logSession("Jumpstart", this);
		}

		// If owner is not playing, let them know everything went ok.
		if (!this.ownerIsPlayer && this.owner in Connections) {
			Connections[this.owner].socket.emit("message", {
				title: "Jumpstart boosters successfully distributed!",
				showConfirmButton: false,
			});
		}
	}

	reconnectUser(userID: UserID) {
		if (!this.draftState) return;

		if (!(this.draftState instanceof DraftState)) {
			Connections[userID].pickedCards = this.disconnectedUsers[userID].pickedCards;
			this.addUser(userID);

			let msgData: any = {};
			switch (this.draftState.type) {
				case "winston":
					msgData = { name: "rejoinWinstonDraft", state: this.draftState };
					break;
				case "grid":
					msgData = { name: "rejoinGridDraft", state: this.draftState };
					break;
				case "rochester":
					msgData = { name: "rejoinRochesterDraft", state: this.draftState };
					break;
				case "minesweeper":
					msgData = { name: "rejoinMinesweeperDraft", state: this.draftState };
					break;
			}
			Connections[userID].socket.emit(msgData.name, {
				pickedCards: this.disconnectedUsers[userID].pickedCards,
				state: msgData.state.syncData(),
			});

			delete this.disconnectedUsers[userID];
		} else {
			Connections[userID].pickedCards = this.disconnectedUsers[userID].pickedCards;

			this.addUser(userID);
			Connections[userID].socket.emit("rejoinDraft", {
				pickedCards: this.disconnectedUsers[userID].pickedCards,
				booster:
					this.draftState.players[userID].boosters.length > 0
						? this.draftState.players[userID].boosters[0]
						: null,
				boosterNumber: this.draftState.boosterNumber,
				pickNumber: this.draftState.players[userID].pickNumber,
				botScores: this.draftState.players[userID].botInstance.lastScores,
			});
			delete this.disconnectedUsers[userID];
		}

		// Resume draft if everyone is here or broacast the new state.
		if (Object.keys(this.disconnectedUsers).length == 0)
			this.resumeOnReconnection({ title: "Player reconnected", text: "Resuming draft..." });
		else this.broadcastDisconnectedUsers();
	}

	// Non-playing owner (organizer) is trying to reconnect, we just need to send them the current state
	reconnectOwner(userID: UserID) {
		if (userID !== this.owner || this.ownerIsPlayer) return;
		Connections[userID].sessionID = this.id;
		this.syncSessionOptions(userID);
		this.notifyUserChange();
		if (this.drafting && this.draftState && this.draftState instanceof DraftState) {
			Connections[userID].socket.emit("startDraft", this.getSortedVirtualPlayerData());
			Connections[userID].socket.emit("draftState", {
				boosterNumber: this.draftState.boosterNumber,
			});
			// Update draft log for live display if owner in not playing
			if (["owner", "everyone"].includes(this.draftLogRecipients))
				Connections[userID].socket.emit("draftLogLive", {
					log: this.draftLog,
					pickedCards: [...this.users].map((uid: UserID) => {
						return {
							userID: uid,
							pickedCards: {
								main: Connections[uid]?.pickedCards.main.map((c) => c.id),
								side: Connections[uid]?.pickedCards.side.map((c) => c.id),
							},
						};
					}),
				});
		} else {
			Connections[userID].socket.emit("sessionOptions", {
				virtualPlayersData: this.getSortedVirtualPlayerData(),
			});
		}
	}

	async replaceDisconnectedPlayers() {
		if (!this.drafting || !(this.draftState instanceof DraftState)) return;

		console.warn(`Session ${this.id}: Replacing disconnected players with bots!`);

		for (let uid in this.disconnectedUsers) this.startBotPickChain(uid);

		const virtualPlayers = this.getSortedVirtualPlayerData();
		this.forUsers((uid) =>
			Connections[uid]?.socket.emit("sessionOptions", {
				virtualPlayersData: virtualPlayers,
			})
		);
		this.resumeOnReconnection({
			title: "Resuming draft",
			text: `Disconnected player(s) has been replaced by bot(s).`,
		});
	}

	startCountdowns() {
		if (!(this.draftState instanceof DraftState)) return;
		const s = this.draftState as DraftState;
		for (let userID in s.players)
			if (!s.players[userID].isBot && !this.isDisconnected(userID) && s.players[userID].boosters.length > 0)
				this.startCountdown(userID);
	}

	resumeCountdowns() {
		if (!(this.draftState instanceof DraftState)) return;
		const s = this.draftState as DraftState;
		for (let userID in s.players)
			if (!s.players[userID].isBot && !this.isDisconnected(userID) && s.players[userID].boosters.length > 0)
				this.resumeCountdown(userID);
	}

	stopCountdowns() {
		if (!(this.draftState instanceof DraftState)) return;
		for (let userID in (this.draftState as DraftState).players) this.stopCountdown(userID);
	}

	startCountdown(userID: UserID) {
		if (!(this.draftState instanceof DraftState)) return;
		if (this.maxTimer === 0) {
			Connections[userID]?.socket.emit("disableTimer");
			return;
		}

		const s = this.draftState as DraftState;
		this.stopCountdown(userID);

		let dec = Math.floor((0.9 * this.maxTimer) / s.numPicks);
		s.players[userID].timer = this.maxTimer - s.players[userID].pickNumber * dec;

		// Immediatly share the new value.
		this.syncCountdown(userID);
		this.resumeCountdown(userID);
	}

	resumeCountdown(userID: UserID) {
		if (!(this.draftState instanceof DraftState)) return;
		const countdownInterval = ((this.draftState as DraftState).players[userID].countdownInterval = setInterval(
			() => {
				const s = this.draftState as DraftState;
				if (!s?.players?.[userID]) {
					clearInterval(countdownInterval);
					return;
				}

				s.players[userID].timer -= 1;
				this.syncCountdown(userID);
				// TODO: Force server side pick if client did not respond after 5 more seconds
				if (s.players[userID].timer <= -5) {
					// TODO
					this.stopCountdown(userID);
				}
			},
			1000
		));
		(this.draftState as DraftState).players[userID].countdownInterval = countdownInterval;
	}

	stopCountdown(userID: UserID) {
		if (!(this.draftState instanceof DraftState)) return;
		const s = this.draftState as DraftState;
		if (s?.players?.[userID]?.countdownInterval) {
			clearInterval(s.players[userID].countdownInterval as NodeJS.Timeout);
			s.players[userID].countdownInterval = null;
		}
	}

	syncCountdown(userID: UserID) {
		if (!(this.draftState instanceof DraftState)) return;
		Connections[userID]?.socket.emit("timer", {
			countdown: this.draftState.players[userID]?.timer,
		});
	}

	// Includes disconnected players!
	getHumanPlayerCount() {
		return this.users.size + Object.keys(this.disconnectedUsers).length;
	}

	// Includes disconnected players!
	// Distribute order has to be deterministic (especially for the reconnect feature), uses this.userOrder
	getSortedHumanPlayersIDs() {
		let players = Array.from(this.users).concat(Object.keys(this.disconnectedUsers));
		return this.userOrder.filter((e) => players.includes(e));
	}

	getVirtualPlayersCount() {
		return this.users.size + Object.keys(this.disconnectedUsers).length + this.bots;
	}

	isDisconnected(userID: UserID): boolean {
		return userID in this.disconnectedUsers;
	}

	getSortedHumanPlayerData() {
		let tmp: UserData = {};
		for (let userID of this.getSortedHumanPlayersIDs()) {
			tmp[userID] = {
				userID: userID,
				userName: this.isDisconnected(userID)
					? this.disconnectedUsers[userID].userName
					: Connections[userID].userName,
				isBot: false,
				isDisconnected: this.isDisconnected(userID),
				boosterCount: undefined,
			};
		}
		return tmp;
	}

	getSortedVirtualPlayerData() {
		const r: UserData = {};
		if (this.draftState instanceof DraftState) {
			for (let userID in this.draftState.players) {
				r[userID] = {
					userID: userID,
					userName: this.draftState.players[userID].isBot
						? this.draftState.players[userID].botInstance.name
						: this.isDisconnected(userID)
						? this.disconnectedUsers[userID].userName
						: Connections[userID].userName,
					isBot: this.draftState.players[userID].isBot,
					isDisconnected: this.isDisconnected(userID),
					boosterCount: this.draftState.players[userID].boosters.length,
				};
			}
		} else {
			return this.getSortedHumanPlayerData();
		}
		return r;
	}

	emitMessage(title: string, text: string = "", showConfirmButton = true, timer = 1500) {
		this.forUsers((uid) =>
			Connections[uid]?.socket.emit("message", {
				title: title,
				text: text,
				showConfirmButton: showConfirmButton,
				timer: timer,
			})
		);
	}

	broadcastPreparationCancelation() {
		this.forNonOwners((uid) =>
			Connections[uid]?.socket.emit("message", {
				icon: "warning",
				toast: true,
				title: "Game canceled",
			})
		);
	}

	emitError(title = "Error", text = "Unspecified Error", showConfirmButton = true, timer = 0) {
		Connections[this.owner]?.socket.emit("message", {
			icon: "error",
			title: title,
			text: text,
			showConfirmButton: showConfirmButton,
			timer: timer,
		});
	}

	generateBracket(players: Array<UserID>) {
		if (this.teamDraft) {
			this.bracket = new TeamBracket(players);
		} else {
			this.bracket = new Bracket(players);
		}
		this.forUsers((u) => Connections[u]?.socket.emit("sessionOptions", { bracket: this.bracket }));
	}

	generateSwissBracket(players: Array<UserID>) {
		this.bracket = new SwissBracket(players);
		this.forUsers((u) => Connections[u]?.socket.emit("sessionOptions", { bracket: this.bracket }));
	}

	generateDoubleBracket(players: Array<UserID>) {
		this.bracket = new DoubleBracket(players);
		this.forUsers((u) => Connections[u]?.socket.emit("sessionOptions", { bracket: this.bracket }));
	}

	updateBracket(results: Array<[number, number]>) {
		if (!this.bracket) return false;
		this.bracket.results = results;
		this.forUsers((u) => Connections[u]?.socket.emit("sessionOptions", { bracket: this.bracket }));
	}

	shareDecklist(userID: UserID, decklist: DeckList) {
		if (this.draftLog === undefined || this.draftLog.users[userID] === undefined) {
			console.log("Cannot find log for shared decklist.");
			return;
		}
		decklist = computeHashes(decklist, { getCard: this.getCustomGetCardFunction() });
		this.draftLog.users[userID].decklist = decklist;
		// Update clients
		const shareData = {
			sessionID: this.id,
			time: this.draftLog?.time,
			userID: userID,
			decklist: decklist,
		};
		const hashesOnly = {
			sessionID: this.id,
			time: this.draftLog?.time,
			userID: userID,
			decklist: { hashes: decklist.hashes },
		};
		// Note: The session setting draftLogRecipients may have change since the game ended.
		switch (this.draftLogRecipients) {
			default:
			case "delayed":
				if (this.draftLog.delayed) {
					// Complete log has not been shared yet, send only hashes to non-owners.
					Connections[this.owner]?.socket.emit("shareDecklist", shareData);
					this.forNonOwners((uid) => Connections[uid]?.socket.emit("shareDecklist", hashesOnly));
					break;
				}
			// Else, fall through to "everyone"
			case "everyone":
				// Also send the update to the organiser separately if they're not playing
				if (!this.ownerIsPlayer) Connections[this.owner]?.socket.emit("shareDecklist", shareData);
				this.forUsers((uid) => Connections[uid]?.socket.emit("shareDecklist", shareData));
				break;
			case "owner":
				Connections[this.owner]?.socket.emit("shareDecklist", shareData);
				this.forNonOwners((uid) => Connections[uid]?.socket.emit("shareDecklist", hashesOnly));
				break;
			case "none":
				Connections[this.owner]?.socket.emit("shareDecklist", hashesOnly);
				this.forNonOwners((uid) => Connections[uid]?.socket.emit("shareDecklist", hashesOnly));
				break;
		}
	}

	// Indicates if the DraftLogLive feature is in use
	shouldSendLiveUpdates() {
		return (
			!this.ownerIsPlayer && ["owner", "everyone"].includes(this.draftLogRecipients) && this.owner in Connections
		);
	}

	onCardMoved(userID: string, uniqueID: number, destStr: string) {
		if (this.shouldSendLiveUpdates()) {
			Connections[this.owner]?.socket.emit("draftLogLive", {
				pickedCards: [
					{
						userID: userID,
						pickedCards: {
							main: Connections[userID]?.pickedCards.main.map((c) => c.id),
							side: Connections[userID]?.pickedCards.side.map((c) => c.id),
						},
					},
				],
			});
		}
	}

	// Execute fn for each user. Owner included even if they're not playing.
	forUsers(fn: (uid: UserID) => void) {
		if (!this.ownerIsPlayer && this.owner in Connections) fn(this.owner);
		for (let user of this.users) fn(user);
	}
	forNonOwners(fn: (uid: UserID) => void) {
		for (let uid of this.users) if (uid !== this.owner) fn(uid);
	}
}

export let Sessions: { [sid: string]: Session } = {};

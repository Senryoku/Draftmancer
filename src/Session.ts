"use strict";

import uuid from "uuid";
const uuidv1 = uuid.v1;
import constants from "./data/constants.json";
import { UserID, SessionID } from "./IDTypes.js";
import { pickCard, countCards } from "./cardUtils.js";
import { negMod, isEmpty, shuffleArray, getRandom, arrayIntersect, Options, getNDisctinctRandom } from "./utils.js";
import { Connections } from "./Connection.js";
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
} from "./Cards.js";
import { IBot, Bot, SimpleBot, fallbackToSimpleBots } from "./Bot.js";
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
Object.freeze(JumpstartBoosters);
import { logSession } from "./Persistence.js";
import { Bracket, TeamBracket, SwissBracket, DoubleBracket } from "./Brackets.js";
import { CustomCardList } from "./CustomCardList";
import { DraftLog } from "./DraftLog.js";
import { generateJHHBooster, JHHBoosterPattern } from "./JumpstartHistoricHorizons.js";

export const optionProps = [
	"ownerIsPlayer",
	"setRestriction",
	"isPublic",
	"description",
	"ignoreCollections",
	"boostersPerPlayer",
	"cardsPerBooster",
	"teamDraft",
	"bots",
	"maxTimer",
	"maxPlayers",
	"mythicPromotion",
	"useBoosterContent",
	"boosterContent",
	"usePredeterminedBoosters",
	"colorBalance",
	"maxDuplicates",
	"foil",
	"preferedCollation",
	"useCustomCardList",
	"customCardList",
	"distributionMode",
	"customBoosters",
	"pickedCardsPerRound",
	"burnedCardsPerRound",
	"draftLogRecipients",
	"bracketLocked",
	"draftPaused",
];

export class IDraftState {
	type: string;
	constructor(type: string) {
		this.type = type;
	}
}

export class DraftState extends IDraftState {
	boosters: Array<Array<Card>>;
	pickNumber = 0;
	boosterNumber = 1;
	pickedCardsThisRound = 0;
	constructor(boosters: Array<Array<Card>>) {
		super("draft");
		this.boosters = boosters;
	}
}

export interface TurnBased extends IDraftState {
	currentPlayer(): UserID;
}

export function instanceOfTurnBased(object: any): object is TurnBased {
	return "currentPlayer" in object;
}

export class WinstonDraftState extends IDraftState implements TurnBased {
	players: Array<UserID>;
	round = -1; // Will be immedialty incremented
	cardPool: Array<Card> = [];
	piles: [Array<Card>, Array<Card>, Array<Card>] = [[], [], []];
	currentPile: number = 0;
	constructor(players: Array<UserID>, boosters: Array<Array<Card>>) {
		super("winston");
		this.players = players;
		if (boosters) {
			for (let booster of boosters) this.cardPool.push(...booster);
			shuffleArray(this.cardPool);
		}
		if (this.cardPool.length >= 3)
			this.piles = [[this.cardPool.pop() as Card], [this.cardPool.pop() as Card], [this.cardPool.pop() as Card]];
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
	boosters: Array<Array<Card | null>> = []; // Array of [3x3 Grid, Row-Major order]
	players: Array<UserID>;
	error: any;
	boosterCount: number;
	lastPicks: { userName: string; round: number; cards: (Card | null)[] }[] = [];
	constructor(players: Array<UserID>, boosters: Array<Array<Card>>) {
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
	boosters: Array<Array<Card>> = [];
	boosterCount: number;
	lastPicks: { userName: string; round: number; cards: Card[] }[] = [];
	constructor(players: Array<UserID>, boosters: Array<Array<Card>>) {
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

export type UserInfo = { [uid: string]: { isBot: boolean; disconnected?: boolean; instance?: IBot } };

export interface IIndexable {
	[key: string]: any;
}

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
	cardsPerBooster: number = 15;
	teamDraft: boolean = false;
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
	customCardList: CustomCardList = { cards: null, cardsPerBooster: {}, customSheets: null, length: 0 };
	distributionMode: DistributionMode = "regular"; // Specifies how boosters are distributed when using boosters from different sets (see customBoosters)
	customBoosters: Array<string> = ["", "", ""]; // Specify a set for an individual booster (Draft Only)
	pickedCardsPerRound: number = 1;
	burnedCardsPerRound: number = 0;
	draftLogRecipients: DraftLogRecipients = "everyone";
	bracketLocked: boolean = false; // If set, only the owner can edit the results.
	bracket?: Bracket = undefined;

	boosters: Array<Array<Card>> = [];

	// Draft state
	drafting: boolean = false;
	draftState?: IDraftState = undefined;
	draftLog?: DraftLog;
	// Additional state properties (Only used by DraftState rn, but could be extented to other gamemodes)
	botsInstances: Array<IBot> = [];
	disconnectedUsers: { [uid: string]: any } = {};
	draftPaused: boolean = false;
	countdown: number = 75;
	countdownInterval: NodeJS.Timeout | null = null;

	constructor(id: SessionID, owner: UserID, options: Options = {}) {
		this.id = id;
		this.owner = owner;

		for (let p in options) (this as IIndexable)[p] = options[p];
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
			pickedThisRound: Connections[userID].pickedThisRound,
			pickedCards: Connections[userID].pickedCards,
			boosterIndex: Connections[userID].boosterIndex,
			bot: Connections[userID].bot,
		};
	}

	broadcastDisconnectedUsers() {
		const disconnectedUsersData: { [uid: string]: any } = {};
		for (let uid in this.disconnectedUsers)
			disconnectedUsersData[uid] = { userName: this.disconnectedUsers[uid].userName };
		this.forUsers(u =>
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
			this.stopCountdown();
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

	setCardsPerBooster(cardsPerBooster: number) {
		if (this.cardsPerBooster !== cardsPerBooster && cardsPerBooster > 0) {
			this.cardsPerBooster = cardsPerBooster;

			this.forUsers((uid: UserID) =>
				Connections[uid]?.socket.emit("sessionOptions", {
					cardsPerBooster: this.cardsPerBooster,
				})
			);
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

			this.forUsers(u =>
				Connections[u]?.socket.emit("sessionOptions", {
					teamDraft: this.teamDraft,
					maxPlayers: this.maxPlayers,
					bots: this.bots,
				})
			);
		}
	}

	setSeating(seating: Array<UserID>) {
		if (this.drafting) return false;
		if (!Array.isArray(seating) || [...this.users].some(u => !seating.includes(u))) {
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
		for (let p of optionProps) options[p] = (this as IIndexable)[p];
		Connections[userID]?.socket.emit("sessionOptions", options);
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
				for (let cid in Cards)
					if (Cards[cid].in_booster) cardPool.set(cid, this.maxDuplicates?.[Cards[cid].rarity] ?? 99);
			} else {
				// Use cache otherwise
				for (let set of this.setRestriction)
					for (let cid of BoosterCardsBySet[set])
						cardPool.set(cid, this.maxDuplicates?.[Cards[cid].rarity] ?? 99);
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
				for (let cid of CardsBySet[s].filter(cid => cardPool.has(cid)))
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
			if (inBoosterOnly) arrays.push(MTGACardIDs.filter(c => Cards[c].in_booster));
			else arrays.push(MTGACardIDs);
		else if (inBoosterOnly)
			arrays.push([...Connections[user_list[0]].collection.keys()].filter(c => Cards[c].in_booster));
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
			if (!(Cards[cid].rarity in cardPoolByRarity)) cardPoolByRarity[Cards[cid].rarity] = new Map();
			cardPoolByRarity[Cards[cid].rarity].set(cid, cardPool.get(cid) as number);
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
			if (!(Cards[cid].rarity in local)) local[Cards[cid].rarity] = new Map();
			local[Cards[cid].rarity].set(cid, this.maxDuplicates?.[Cards[cid].rarity] ?? 99);
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
			if (this.boosters.some(b => b.length !== this.boosters[0].length)) {
				this.emitError("Incorrect Provided Boosters", `Inconsistent booster sizes.`);
				return false;
			}
			return true;
		}

		if (this.useCustomCardList) {
			if (!this.customCardList.cards) {
				this.emitError("Error generating boosters", "No custom card list provided.");
				return false;
			}
			// List is using custom booster slots
			if (this.customCardList.customSheets) {
				let cardsByRarity: SlotedCardPool = {};
				for (let r in this.customCardList.cardsPerBooster) {
					cardsByRarity[r] = new Map();
					for (let cardId of (this.customCardList.cards as { [slot: string]: Array<CardID> })[r])
						if (cardsByRarity[r].has(cardId))
							// Duplicates adds one copy of the card
							cardsByRarity[r].set(cardId, (cardsByRarity[r].get(cardId) as number) + 1);
						else cardsByRarity[r].set(cardId, 1);

					const card_count = countCards(cardsByRarity[r]);
					const card_target = this.customCardList.cardsPerBooster[r] * boosterQuantity;
					if (card_count < card_target) {
						const msg = `Not enough cards (${card_count}/${card_target} ${r}) in custom card list.`;
						this.emitError("Error generating boosters", msg);
						console.warn(msg);
						return false;
					}
				}

				// Color balance the largest slot
				const colorBalancedSlot = Object.keys(this.customCardList.cardsPerBooster).reduce((max, curr) =>
					this.customCardList.cardsPerBooster[curr] > this.customCardList.cardsPerBooster[max] ? curr : max
				);
				// Do not color balance if we don't have at least a 5 cards slot
				const useColorBalance =
					this.colorBalance && this.customCardList.cardsPerBooster[colorBalancedSlot] >= 5;

				// Generate Boosters
				this.boosters = [];
				const colorBalancedSlotGenerator = useColorBalance
					? new ColorBalancedSlot(cardsByRarity[colorBalancedSlot])
					: null;
				for (let i = 0; i < boosterQuantity; ++i) {
					let booster: Array<Card> = [];

					for (let r in this.customCardList.cardsPerBooster) {
						if (useColorBalance && colorBalancedSlotGenerator && r === colorBalancedSlot) {
							booster = booster.concat(
								colorBalancedSlotGenerator.generate(this.customCardList.cardsPerBooster[r])
							);
						} else {
							for (let i = 0; i < this.customCardList.cardsPerBooster[r]; ++i) {
								const pickedCard = pickCard(cardsByRarity[r], booster);
								booster.push(pickedCard);
							}
						}
					}

					this.boosters.push(booster);
				}
			} else {
				// Generate fully random 15-cards booster for cube (not considering rarity)
				// Getting custom card list
				let localCollection: CardPool = new Map();

				for (let cardId of this.customCardList.cards as Array<CardID>) {
					// Duplicates adds one copy of the card
					if (localCollection.has(cardId))
						localCollection.set(cardId, (localCollection.get(cardId) as number) + 1);
					else localCollection.set(cardId, 1);
				}

				const cardsPerBooster = options.cardsPerBooster ?? 15;

				let card_count = this.customCardList.cards.length;
				let card_target = cardsPerBooster * boosterQuantity;
				if (card_count < card_target) {
					const msg = `Not enough cards (${card_count}/${card_target}) in custom list.`;
					this.emitError("Error generating boosters", msg);
					console.warn(msg);
					return false;
				}

				this.boosters = [];

				if (this.colorBalance) {
					const colorBalancedSlotGenerator = new ColorBalancedSlot(localCollection);
					for (let i = 0; i < boosterQuantity; ++i)
						this.boosters.push(colorBalancedSlotGenerator.generate(cardsPerBooster));
				} else {
					for (let i = 0; i < boosterQuantity; ++i) {
						let booster: Array<Card> = [];
						for (let j = 0; j < cardsPerBooster; ++j) booster.push(pickCard(localCollection, booster));
						this.boosters.push(booster);
					}
				}
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

			const getBoosterFactory = function(
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

				// Exceptions for inclusion of basic land slot: Commander Legends as the booster size will be wrong anyway, and TSR/STX/MH2/DBL that already have 15 cards.
				const irregularSets = ["cmr", "tsr", "stx", "mh2", "dbl"];
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

				for (let i = 0; i < this.getVirtualPlayersCount(); ++i) {
					const playerBoosterFactories = [];
					for (let boosterSet of customBoosters) {
						// No specific rules
						if (boosterSet === "") {
							playerBoosterFactories.push(defaultFactory);
						} else {
							if (boosterSet === "random") {
								// Random booster from one of the sets in Card Pool
								boosterSet =
									this.setRestriction.length === 0
										? getRandom(constants.PrimarySets)
										: getRandom(this.setRestriction);
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
					if (this.boosters.some(b => b.length !== this.boosters[0].length)) {
						const msg = `Inconsistent booster sizes`;
						this.emitError("Error generating boosters", msg);
						console.error(msg);
						//console.error(this.boosters.map((b) => [b[0].name, b[0].set, b.length]))
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
					pickedThisRound: u.pickedThisRound,
				});
			}
		}

		// Send to all session users
		this.forUsers(user => {
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
		this.draftState = undefined;
		this.drafting = false;
		this.draftPaused = false;
		this.stopCountdown();
		this.disconnectedUsers = {};
	}

	///////////////////// Winston Draft //////////////////////
	startWinstonDraft(boosterCount: number) {
		if (this.users.size !== 2) return false;
		this.drafting = true;
		this.emitMessage("Preparing Winston draft!", "Your draft will start soon...", false, 0);
		if (!this.generateBoosters(boosterCount)) {
			this.drafting = false;
			return false;
		}
		this.disconnectedUsers = {};
		this.draftState = new WinstonDraftState(this.getSortedHumanPlayersIDs(), this.boosters);
		for (let user of this.users) {
			Connections[user].pickedCards = [];
			Connections[user].socket.emit("sessionOptions", {
				virtualPlayersData: this.getSortedHumanPlayers(),
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
			for (let uid of this.users) this.draftLog.users[uid].cards = Connections[uid].pickedCards.map(c => c.id);
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

	winstonSkipPile() {
		const s = this.draftState;
		if (!this.drafting || !s || !(s instanceof WinstonDraftState)) return false;
		// If the card pool is empty, make sure there is another pile to pick
		if (
			!s.cardPool.length &&
			((s.currentPile === 0 && !s.piles[1].length && !s.piles[2].length) ||
				(s.currentPile === 1 && !s.piles[2].length) ||
				s.currentPile === 2)
		) {
			console.error("Session.winstonSkipPile: No other choice, you have to take that pile!");
			return false;
		}

		// Add a new card to skipped pile. (Make sure there's enough cards for the player to draw if this is the last pile)
		if (s.cardPool.length > 1 || (s.currentPile < 2 && s.cardPool.length > 0))
			s.piles[s.currentPile].push(s.cardPool.pop() as Card);
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

		return true;
	}

	winstonTakePile() {
		const s = this.draftState as WinstonDraftState;
		if (!this.drafting || !s || !(s instanceof WinstonDraftState)) return false;
		this.draftLog?.users[s.currentPlayer()].picks.push({
			pickedPile: s.currentPile,
			piles: [...s.piles],
		});
		Connections[s.currentPlayer()].pickedCards = Connections[s.currentPlayer()].pickedCards.concat(
			s.piles[s.currentPile]
		);
		if (s.cardPool.length > 0) s.piles[s.currentPile] = [s.cardPool.pop() as Card];
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
			return false;
		}

		this.disconnectedUsers = {};
		this.draftState = new GridDraftState(this.getSortedHumanPlayersIDs(), this.boosters);
		const s = this.draftState as GridDraftState;
		if (s.error) {
			this.emitError(s.error.title, s.error.text);
			this.cleanDraftState();
			return false;
		}

		for (let user of this.users) {
			Connections[user].pickedCards = [];
			Connections[user].socket.emit("sessionOptions", {
				virtualPlayersData: this.getSortedHumanPlayers(),
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
			for (let uid of this.users) this.draftLog.users[uid].cards = Connections[uid].pickedCards.map(c => c.id);
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

		const log: any = { pick: [], booster: s.boosters[0].map(c => (c ? c.id : null)) };

		let pickedCards = [];
		for (let i = 0; i < 3; ++i) {
			//                     Column           Row
			let idx = choice < 3 ? 3 * i + choice : 3 * (choice - 3) + i;
			if (s.boosters[0][idx] !== null) {
				Connections[s.currentPlayer()].pickedCards.push(s.boosters[0][idx] as Card);
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
		this.drafting = true;
		this.emitMessage("Preparing Rochester draft!", "Your draft will start soon...", false, 0);
		if (!this.generateBoosters(this.boostersPerPlayer * this.users.size, { useCustomBoosters: true })) {
			this.drafting = false;
			return;
		}

		this.disconnectedUsers = {};
		this.draftState = new RochesterDraftState(this.getSortedHumanPlayersIDs(), this.boosters);
		for (let user of this.users) {
			Connections[user].pickedCards = [];
			Connections[user].socket.emit("sessionOptions", {
				virtualPlayersData: this.getSortedHumanPlayers(),
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
			if (this.draftLog) this.draftLog.users[uid].cards = Connections[uid].pickedCards.map(c => c.id);
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

		Connections[s.currentPlayer()].pickedCards.push(s.boosters[0][idx]);

		this.draftLog?.users[s.currentPlayer()].picks.push({
			pick: [idx],
			booster: s.boosters[0].map(c => c.id),
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

	///////////////////// Traditional Draft Methods //////////////////////
	async startDraft() {
		this.drafting = true;
		this.emitMessage("Preparing draft!", "Your draft will start soon...", false, 0);

		let boosterQuantity = (this.users.size + this.bots) * this.boostersPerPlayer;
		console.log(`Session ${this.id}: Starting draft! (${this.users.size} players)`);

		this.disconnectedUsers = {};

		if (
			!this.generateBoosters(boosterQuantity, { useCustomBoosters: true, cardsPerBooster: this.cardsPerBooster })
		) {
			this.drafting = false;
			return;
		}

		// Generate bots
		this.botsInstances = [];
		const oracleIds = this.boosters.flat().map(card => card.oracle_id);
		const fallback = await fallbackToSimpleBots([...new Set(oracleIds)]);
		if (fallback) {
			for (let i = 0; i < this.bots; ++i) this.botsInstances.push(new SimpleBot(`Bot #${i + 1}`, uuidv1()));
		} else {
			for (let i = 0; i < this.bots; ++i) this.botsInstances.push(new Bot(`Bot #${i + 1}`, uuidv1()));
		}

		// Draft Log initialization
		const log = this.initLogs("Draft");
		log.teamDraft = this.teamDraft;
		for (let userID in log.users) log.users[userID].picks = [];

		let virtualPlayers = this.getSortedVirtualPlayers();
		for (let uid of this.users) {
			Connections[uid].pickedCards = [];
			Connections[uid].bot = fallback
				? new SimpleBot(Connections[uid].userName, uid)
				: new Bot(Connections[uid].userName, uid);
			Connections[uid].socket.emit("sessionOptions", {
				virtualPlayersData: virtualPlayers,
			});
			Connections[uid].socket.emit("startDraft");
		}

		if (!this.ownerIsPlayer && this.owner in Connections) {
			Connections[this.owner].socket.emit("sessionOptions", {
				virtualPlayersData: virtualPlayers,
			});
			Connections[this.owner].socket.emit("startDraft");
			// Update draft log for live display if owner in not playing
			if (this.shouldSendLiveUpdates()) {
				Connections[this.owner].socket.emit("draftLogLive", { log: this.draftLog });
			}
		}

		this.draftState = new DraftState(this.boosters);
		this.boosters = [];
		this.nextBooster();
	}

	pickCard(userID: UserID, pickedCards: Array<number>, burnedCards: Array<number>) {
		if (!this.drafting || this.draftState?.type !== "draft" || !this.users.has(userID)) return;
		const s = this.draftState as DraftState;

		const reportError = (code: number, err: string) => {
			console.error(err);
			return { code: code, error: err };
		};

		const boosterIndex = Connections[userID].boosterIndex;
		if (typeof boosterIndex === "undefined" || boosterIndex < 0 || boosterIndex >= s.boosters.length)
			return reportError(2, `Session.pickCard: boosterIndex ('${boosterIndex}') out of bounds.`);
		if (!pickedCards || pickedCards.length !== Math.min(this.pickedCardsPerRound, s.boosters[boosterIndex].length))
			return reportError(
				1,
				`Session.pickCard: Invalid picked cards (pickedCards: ${pickedCards}, booster length: ${s.boosters[boosterIndex].length}).`
			);
		if (pickedCards.some(idx => idx >= s.boosters[boosterIndex].length))
			return reportError(
				3,
				`Session.pickCard: Invalid card index [${pickedCards.join(", ")}] for booster #${boosterIndex} (${
					s.boosters[boosterIndex].length
				}).`
			);
		if (Connections[userID].pickedThisRound)
			return reportError(4, `Session.pickCard: User '${userID}' already picked a card this round.`);
		if (
			burnedCards &&
			(burnedCards.length > this.burnedCardsPerRound ||
				burnedCards.length !==
					Math.min(this.burnedCardsPerRound, s.boosters[boosterIndex].length - pickedCards.length) ||
				burnedCards.some(idx => idx >= s.boosters[boosterIndex].length))
		)
			return reportError(
				5,
				`Session.pickCard: Invalid burned cards (expected length: ${this.burnedCardsPerRound}, burnedCards: ${burnedCards.length}, booster: ${s.boosters[boosterIndex].length}).`
			);

		console.log(
			`Session ${this.id}: ${Connections[userID].userName} [${userID}] picked card '${pickedCards.map(
				idx => s.boosters[boosterIndex][idx].name
			)}' from booster #${boosterIndex}, burning ${
				burnedCards && burnedCards.length > 0 ? burnedCards.length : "nothing"
			}.`
		);

		for (let idx of pickedCards) {
			Connections[userID].pickedCards.push(s.boosters[boosterIndex][idx]);
			Connections[userID].bot?.addCard(s.boosters[boosterIndex][idx]);
		}
		Connections[userID].pickedThisRound = true;

		const pickData = {
			pick: pickedCards,
			burn: burnedCards,
			booster: s.boosters[boosterIndex].map(c => c.id),
		};
		this.draftLog?.users[userID].picks.push(pickData);

		let cardsToRemove = pickedCards;
		if (burnedCards) cardsToRemove = cardsToRemove.concat(burnedCards);
		cardsToRemove.sort((a, b) => b - a); // Remove last index first to avoid shifting indices

		// Signal users
		this.forUsers(u => {
			Connections[u]?.socket.emit("updateUser", {
				userID: userID,
				updatedProperties: {
					pickedThisRound: true,
				},
			});
		});

		// Update draft log for live display if owner in not playing (Do this before removing the cards, damnit!)
		if (this.shouldSendLiveUpdates()) {
			Connections[this.owner].socket.emit("draftLogLive", { userID: userID, pick: pickData });
			Connections[this.owner].socket.emit("pickAlert", {
				userName: Connections[userID].userName,
				cards: pickedCards.map(idx => s.boosters[boosterIndex][idx]),
			});
		}

		for (let idx of cardsToRemove) s.boosters[boosterIndex].splice(idx, 1);

		++s.pickedCardsThisRound;
		if (s.pickedCardsThisRound === this.getVirtualPlayersCount()) {
			this.nextBooster();
		}
		return { code: 0 };
	}

	async doBotPick(instance: IBot, boosterIndex: number) {
		const s = this.draftState as DraftState;
		const startingBooster = s.boosters[boosterIndex].map(c => c.id);
		const pickedIndices = [];
		const pickedCards = [];
		for (let i = 0; i < this.pickedCardsPerRound && s.boosters[boosterIndex].length > 0; ++i) {
			const pickedIdx = await instance.pick(
				s.boosters[boosterIndex],
				s.boosterNumber,
				this.boostersPerPlayer,
				s.pickNumber,
				s.pickNumber + s.boosters[boosterIndex].length
			);
			pickedIndices.push(pickedIdx);
			pickedCards.push(s.boosters[boosterIndex][pickedIdx]);
			s.boosters[boosterIndex].splice(pickedIdx, 1);
		}
		const burned = [];
		for (let i = 0; i < this.burnedCardsPerRound && s.boosters[boosterIndex].length > 0; ++i) {
			const burnedIdx = await instance.burn(
				s.boosters[boosterIndex],
				s.boosterNumber,
				this.boostersPerPlayer,
				s.pickNumber,
				s.pickNumber + s.boosters[boosterIndex].length
			);
			burned.push(burnedIdx);
			s.boosters[boosterIndex].splice(burnedIdx, 1);
		}

		const pickData = {
			pick: pickedIndices,
			burn: burned,
			booster: startingBooster,
		};
		this.draftLog?.users[instance.id].picks.push(pickData);
		if (this.shouldSendLiveUpdates())
			Connections[this.owner].socket.emit("draftLogLive", { userID: instance.id, pick: pickData });

		++s.pickedCardsThisRound;
		return pickedCards;
	}

	async nextBooster() {
		if (this.draftState?.type !== "draft") return;
		const s = this.draftState as DraftState;

		this.stopCountdown();
		const totalVirtualPlayers = this.getVirtualPlayersCount();

		// Boosters are empty
		if (s.boosters[0].length === 0) {
			s.pickNumber = 0;
			// Remove empty boosters
			s.boosters.splice(0, totalVirtualPlayers);
			++s.boosterNumber;
		}

		// End draft if there is no more booster to distribute
		if (s.boosters.length == 0) {
			this.endDraft();
			return;
		}

		s.pickedCardsThisRound = 0; // Tracks how many cards have been picked this round to determine when to start the next booster

		let index = 0;
		const boosterOffset = s.boosterNumber % 2 == 0 ? -s.pickNumber : s.pickNumber;

		let virtualPlayers = this.getSortedVirtualPlayers();
		let botPromises: Promise<Card[] | void>[] = []; // Keep track of bot picks to be able to advance the draft state if they finish after the human players (very possible at least during tests and as doBotPick calls may rely on an external API)
		for (let userID in virtualPlayers) {
			const boosterIndex = negMod(boosterOffset + index, totalVirtualPlayers);
			if (virtualPlayers[userID].isBot) {
				botPromises.push(this.doBotPick(virtualPlayers[userID].instance as IBot, boosterIndex));
			} else {
				if (virtualPlayers[userID].disconnected) {
					this.disconnectedUsers[userID].pickedThisRound = true;
					this.disconnectedUsers[userID].boosterIndex = boosterIndex;
					botPromises.push(
						this.doBotPick(this.disconnectedUsers[userID].bot, boosterIndex).then(pickedCards => {
							this.disconnectedUsers[userID].pickedCards.push(...pickedCards);
						})
					);
				} else {
					Connections[userID].pickedThisRound = false;
					Connections[userID].boosterIndex = boosterIndex;
					Connections[userID].socket.emit("nextBooster", {
						booster: s.boosters[boosterIndex],
						boosterNumber: s.boosterNumber,
						pickNumber: s.pickNumber + 1,
						botScores: await Connections[userID].bot?.getScores(
							s.boosters[boosterIndex],
							s.boosterNumber,
							this.boostersPerPlayer,
							s.pickNumber,
							s.pickNumber + s.boosters[boosterIndex].length
						),
					});
				}
			}
			++index;
		}

		if (!this.ownerIsPlayer && this.owner in Connections) {
			Connections[this.owner].socket.emit("nextBooster", {
				boosterNumber: s.boosterNumber,
				pickNumber: s.pickNumber + 1,
			});
		}

		this.startCountdown(); // Starts countdown now that everyone has their booster
		++s.pickNumber;

		Promise.all(botPromises).then(() => {
			// Everyone is disconnected... Or human players picked before the bots :)
			if (s.pickedCardsThisRound === totalVirtualPlayers) this.nextBooster();
		});
	}

	resumeOnReconnection(msg: { title: string; text: string }) {
		if (!this.drafting) return;

		console.warn(`resumeOnReconnection(): Restarting draft for session ${this.id}.`);

		this.forUsers(user =>
			Connections[user]?.socket.emit("sessionOptions", {
				virtualPlayersData: this.getSortedVirtualPlayers(),
			})
		);

		if (!this.draftPaused && this.draftState instanceof DraftState) this.resumeCountdown();

		this.forUsers(u =>
			Connections[u]?.socket.emit("resumeOnReconnection", {
				msg,
			})
		);
	}

	endDraft() {
		if (!this.drafting || this.draftState?.type !== "draft") return;

		// Allow other callbacks (like nextBooster) to finish before proceeding (actually an issue in tests).
		process.nextTick(() => {
			if (this.draftLog) {
				const virtualPlayers = this.getSortedVirtualPlayers();
				for (let userID in virtualPlayers) {
					if (virtualPlayers[userID].isBot) {
						this.draftLog.users[userID].cards = virtualPlayers[userID].instance?.cards.map(
							(c: Card) => c.id
						);
					} else {
						// Has this user been replaced by a bot?
						this.draftLog.users[userID].cards = (virtualPlayers[userID].disconnected
							? this.disconnectedUsers[userID]
							: Connections[userID]
						).pickedCards.map((c: Card) => c.id);
					}
				}

				this.sendLogs();
			}
			logSession("Draft", this);

			this.forUsers(u => Connections[u].socket.emit("endDraft"));

			console.log(`Session ${this.id} draft ended.`);
			this.cleanDraftState();
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
			case "draft": {
				this.endDraft();
				break;
			}
		}
	}

	pauseDraft() {
		if (!this.drafting || !this.countdownInterval) return;

		this.draftPaused = true;

		this.stopCountdown();
		this.forUsers(u => Connections[u]?.socket.emit("pauseDraft"));
	}

	resumeDraft() {
		if (!this.drafting || !this.draftPaused) return;
		if (this.draftState instanceof DraftState) this.resumeCountdown();
		this.draftPaused = false;
		this.forUsers(u => Connections[u]?.socket.emit("resumeDraft"));
	}

	///////////////////// Traditional Draft End  //////////////////////

	initLogs(type = "Draft"): DraftLog {
		const carddata: { [cid: string]: Card } = {};
		if (this.boosters) for (let c of this.boosters.flat()) carddata[c.id] = Cards[c.id];
		this.draftLog = new DraftLog(
			type,
			this,
			carddata,
			type === "Draft" ? this.getSortedVirtualPlayers() : this.getSortedHumanPlayers()
		);
		return this.draftLog;
	}

	getStrippedLog() {
		if (!this.draftLog) return;
		const strippedLog: any = {
			version: this.draftLog.version,
			sessionID: this.draftLog.sessionID,
			time: this.draftLog.time,
			delayed: true,
			teamDraft: this.draftLog.teamDraft,
			users: {},
		};
		for (let u in this.draftLog.users) {
			strippedLog.users[u] = {
				userID: this.draftLog.users[u].userID,
				userName: this.draftLog.users[u].userName,
			};
			if (this.draftLog.users[u].decklist)
				strippedLog.users[u].decklist = { hashes: this.draftLog.users[u].decklist.hashes };
		}
		return strippedLog;
	}

	sendLogs() {
		if (!this.draftLog) return;
		switch (this.draftLogRecipients) {
			case "none":
				break;
			case "owner":
				Connections[this.owner].socket.emit("draftLog", this.draftLog);
				break;
			default:
			case "delayed": {
				this.draftLog.delayed = true;
				Connections[this.owner].socket.emit("draftLog", this.draftLog);
				const strippedLog = this.getStrippedLog();
				for (let u of this.users) if (u !== this.owner) Connections[u].socket.emit("draftLog", strippedLog);
				break;
			}
			case "everyone":
				this.forUsers(u => Connections[u]?.socket.emit("draftLog", this.draftLog));
				break;
		}
	}

	distributeSealed(boostersPerPlayer: number, customBoosters: Array<string>) {
		this.emitMessage("Distributing sealed boosters...", "", false, 0);

		const useCustomBoosters = customBoosters && customBoosters.some(s => s !== "");
		if (
			!this.generateBoosters(this.users.size * boostersPerPlayer, {
				boostersPerPlayer: boostersPerPlayer,
				useCustomBoosters: useCustomBoosters,
				customBoosters: useCustomBoosters ? customBoosters : null,
			})
		)
			return;

		const log = this.initLogs("Sealed");
		log.customBoosters = customBoosters;

		let idx = 0;
		for (let userID of this.users) {
			const playersBoosters = [];
			let currIdx = idx;
			while (currIdx < this.boosters.length) {
				playersBoosters.push(this.boosters[currIdx]);
				currIdx += this.users.size;
			}
			Connections[userID].socket.emit("setCardSelection", playersBoosters);
			log.users[userID].cards = playersBoosters.flat().map(c => c.id);
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
		if (set == "j21") {
			for (let user of this.users) {
				// Randomly get 2*3 packs and let the user choose among them.
				let choices: any = [];
				choices.push(getNDisctinctRandom(JumpstartHHBoosters, 3).map(generateJHHBooster));
				// The choices are based on the first pick colors (we send all possibilties rather than waiting for user action).
				let secondchoice = [];
				for (let i = 0; i < 3; ++i) {
					const candidates: JHHBoosterPattern[] = JumpstartHHBoosters.filter(p => {
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

				Connections[user].socket.emit("selectJumpstartPacks", choices, (user: UserID, cards: CardID[]) => {
					if (!this.draftLog) return;
					this.draftLog.users[user].cards = cards;
					for (let cid of this.draftLog.users[user].cards) this.draftLog.carddata[cid] = Cards[cid];
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
				// TODO: Handle variations of packs in Jumpstart: Historic Horizons
				const cards = boosters.map(b => b.cards.map((cid: CardID) => getUnique(cid)));

				log.users[user].cards = cards.flat().map((c: Card) => c.id);
				for (let cid of log.users[user].cards) log.carddata[cid] = Cards[cid];

				Connections[user].socket.emit("setCardSelection", cards);
				Connections[user].socket.emit("message", {
					icon: "success",
					imageUrl: "/img/2JumpstartBoosters-min.png",
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
			}
			Connections[userID].socket.emit(msgData.name, {
				pickedCards: this.disconnectedUsers[userID].pickedCards,
				state: msgData.state.syncData(),
			});

			delete this.disconnectedUsers[userID];
		} else {
			Connections[userID].pickedThisRound = this.disconnectedUsers[userID].pickedThisRound;
			Connections[userID].pickedCards = this.disconnectedUsers[userID].pickedCards;
			Connections[userID].boosterIndex = this.disconnectedUsers[userID].boosterIndex;
			Connections[userID].bot = this.disconnectedUsers[userID].bot;

			this.addUser(userID);
			Connections[userID].socket.emit("rejoinDraft", {
				pickedThisRound: this.disconnectedUsers[userID].pickedThisRound,
				pickedCards: this.disconnectedUsers[userID].pickedCards,
				booster: this.draftState.boosters[Connections[userID].boosterIndex],
				boosterNumber: this.draftState.boosterNumber,
				pickNumber: this.draftState.pickNumber,
				botScores: this.disconnectedUsers[userID].bot?.lastScores,
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
		Connections[userID].socket.emit("sessionOptions", {
			virtualPlayersData: this.getSortedVirtualPlayers(),
		});
		if (this.drafting && this.draftState && this.draftState instanceof DraftState) {
			Connections[userID].socket.emit("startDraft");
			Connections[userID].socket.emit("nextBooster", {
				boosterNumber: this.draftState.boosterNumber,
				pickNumber: this.draftState.pickNumber,
			});
			// Update draft log for live display if owner in not playing
			if (["owner", "everyone"].includes(this.draftLogRecipients))
				Connections[userID].socket.emit("draftLogLive", { log: this.draftLog });
		}
	}

	async replaceDisconnectedPlayers() {
		if (!this.drafting || !(this.draftState instanceof DraftState)) return;

		console.warn("Replacing disconnected players with bots!");

		for (let uid in this.disconnectedUsers) {
			// Immediately pick cards
			if (!this.disconnectedUsers[uid].pickedThisRound) {
				const pickedCards = await this.doBotPick(
					this.disconnectedUsers[uid].bot,
					this.disconnectedUsers[uid].boosterIndex
				);
				this.disconnectedUsers[uid].pickedCards.push(...pickedCards);
				this.disconnectedUsers[uid].pickedThisRound = true;
			}
		}

		const virtualPlayers = this.getSortedVirtualPlayers();
		this.forUsers(u =>
			Connections[u]?.socket.emit("sessionOptions", {
				virtualPlayersData: virtualPlayers,
			})
		);
		this.resumeOnReconnection({
			title: "Resuming draft",
			text: `Disconnected player(s) has been replaced by bot(s).`,
		});

		if (this.draftState.pickedCardsThisRound === this.getVirtualPlayersCount()) this.nextBooster();
	}

	// Countdown Methods
	startCountdown() {
		if (!this.draftState) return;
		let cardsPerBooster: number = this.cardsPerBooster ?? 15;
		if (this.useCustomCardList && this.customCardList.customSheets)
			cardsPerBooster = Object.values(this.customCardList.cardsPerBooster).reduce(
				(acc: number, c: number) => acc + c
			);
		let dec = Math.floor(this.maxTimer / cardsPerBooster);
		this.countdown = this.maxTimer - (this.draftState as DraftState).pickNumber * dec;
		this.resumeCountdown();
	}
	resumeCountdown() {
		this.stopCountdown(); // Cleanup if one is still running
		if (this.maxTimer <= 0) {
			// maxTimer <= 0 means no timer
			this.forUsers(u => Connections[u]?.socket.emit("disableTimer"));
		} else {
			// Immediately propagate current state
			this.forUsers(u =>
				Connections[u]?.socket.emit("timer", {
					countdown: this.countdown,
				})
			);
			// Connections[user].socket.emit('timer', { countdown: 0 }); // Easy Debug
			this.countdownInterval = setInterval(
				(sess => {
					return () => {
						sess.countdown--;
						this.forUsers(u =>
							Connections[u]?.socket.emit("timer", {
								countdown: sess.countdown,
							})
						);
					};
				})(this),
				1000
			);
		}
	}
	stopCountdown() {
		if (this.countdownInterval != null) {
			clearInterval(this.countdownInterval);
			this.countdownInterval = null;
		}
	}

	// Includes disconnected players!
	getHumanPlayerCount() {
		return this.users.size + Object.keys(this.disconnectedUsers).length;
	}

	// Includes disconnected players!
	// Distribute order has to be deterministic (especially for the reconnect feature), uses this.userOrder
	getSortedHumanPlayersIDs() {
		let players = Array.from(this.users).concat(Object.keys(this.disconnectedUsers));
		return this.userOrder.filter(e => players.includes(e));
	}

	getVirtualPlayersCount() {
		return this.users.size + Object.keys(this.disconnectedUsers).length + this.bots;
	}

	getSortedHumanPlayers() {
		let tmp: UserInfo = {};
		for (let userID of this.getSortedHumanPlayersIDs()) {
			tmp[userID] = {
				isBot: false,
				disconnected: userID in this.disconnectedUsers,
			};
		}
		return tmp;
	}

	getSortedVirtualPlayers() {
		if (this.botsInstances && this.botsInstances.length > 0) {
			let humanPlayers = this.getSortedHumanPlayersIDs();
			// Distribute bots evenly around the table
			const order = Array(humanPlayers.length).fill(true);
			let idx = 0;
			for (let i = 0; i < this.botsInstances.length; ++i) {
				// Search next human player
				while (!order[idx]) idx = (idx + 1) % order.length;
				++idx;
				// Insert a bot right after
				order.splice(idx, 0, false);
			}
			let humanIdx = 0;
			let botIdx = 0;
			let tmp: UserInfo = {}; // We rely on the order of addition to this object. I know.
			for (let human of order) {
				if (human) {
					let userID = humanPlayers[humanIdx];
					tmp[userID] = {
						isBot: false,
						disconnected: userID in this.disconnectedUsers,
					};
					++humanIdx;
				} else {
					let bot = this.botsInstances[botIdx];
					tmp[bot.id] = { isBot: true, instance: bot };
					++botIdx;
				}
			}
			return tmp;
		} else return this.getSortedHumanPlayers();
	}

	emitMessage(title: string, text: string = "", showConfirmButton = true, timer = 1500) {
		this.forUsers(u =>
			Connections[u]?.socket.emit("message", {
				title: title,
				text: text,
				showConfirmButton: showConfirmButton,
				timer: timer,
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
		this.forUsers(u => Connections[u]?.socket.emit("sessionOptions", { bracket: this.bracket }));
	}

	generateSwissBracket(players: Array<UserID>) {
		this.bracket = new SwissBracket(players);
		this.forUsers(u => Connections[u]?.socket.emit("sessionOptions", { bracket: this.bracket }));
	}

	generateDoubleBracket(players: Array<UserID>) {
		this.bracket = new DoubleBracket(players);
		this.forUsers(u => Connections[u]?.socket.emit("sessionOptions", { bracket: this.bracket }));
	}

	updateBracket(results: Array<[number, number]>) {
		if (!this.bracket) return false;
		this.bracket.results = results;
		this.forUsers(u => Connections[u]?.socket.emit("sessionOptions", { bracket: this.bracket }));
	}

	shareDecklist(userID: UserID, decklist: DeckList) {
		if (this.draftLog === undefined || this.draftLog.users[userID] === undefined) {
			console.log("Cannot find log for shared decklist.");
			return;
		}
		decklist = computeHashes(decklist);
		this.draftLog.users[userID].decklist = decklist;
		this.forUsers(uid => {
			Connections[uid]?.socket.emit("shareDecklist", {
				sessionID: this.id,
				time: this.draftLog?.time,
				userID: userID,
				decklist: decklist,
			});
		});
	}

	// Indicates if the DraftLogLive feature is in use
	shouldSendLiveUpdates() {
		return (
			!this.ownerIsPlayer && ["owner", "everyone"].includes(this.draftLogRecipients) && this.owner in Connections
		);
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

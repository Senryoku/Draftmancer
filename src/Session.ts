"use strict";
import { UserID, SessionID } from "./IDTypes.js";
import { countCards } from "./cardUtils.js";
import { negMod, shuffleArray, getRandom, arrayIntersect, Options, getNDisctinctRandom, pickRandom } from "./utils.js";
import { Connections, getPickedCardIds } from "./Connection.js";
import {
	CardID,
	Card,
	CardPool,
	SlotedCardPool,
	UniqueCard,
	UniqueCardID,
	DeckBasicLands,
	DeckList,
} from "./CardTypes.js";
import { Cards, getUnique, BoosterCardsBySet, CardsBySet, MTGACardIDs, getCard } from "./Cards.js";
import { IBot, fallbackToSimpleBots, isBot, MTGDraftBotParameters, MTGDraftBotsSetSpecializedModels } from "./Bot.js";
import { computeHashes } from "./DeckHashes.js";
import { BasicLandSlot, BasicLandSlots, SpecialLandSlots } from "./LandSlot.js";
import {
	BoosterFactory,
	SetSpecificFactories,
	PaperBoosterFactories,
	DefaultBoosterTargets,
	IBoosterFactory,
	getSetFoilRate,
	PaperBoosterSizes,
} from "./BoosterFactory.js";
import JumpstartBoosters from "./data/JumpstartBoosters.json" assert { type: "json" };
import JumpstartHHBoosters from "./data/JumpstartHHBoosters.json" assert { type: "json" };
import SuperJumpBoosters from "./data/SuperJumpBoosters.json" assert { type: "json" };
Object.freeze(JumpstartBoosters);
Object.freeze(SuperJumpBoosters);
import { isMessageError, isSocketError, Message, MessageError, SocketAck, SocketError } from "./Message.js";
import { logSession } from "./Persistence.js";
import { Bracket, TeamBracket, SwissBracket, DoubleBracket, BracketPlayer } from "./Brackets.js";
import { CustomCardList, generateBoosterFromCustomCardList, generateCustomGetCardFunction } from "./CustomCardList.js";
import { DraftLog, DraftPick, GridDraftPick } from "./DraftLog.js";
import { generateJHHBooster, JHHBooster, JHHBoosterPattern } from "./JumpstartHistoricHorizons.js";
import { IDraftState } from "./IDraftState.js";
import { MinesweeperCellState } from "./MinesweeperDraftTypes.js";
import { MinesweeperDraftState } from "./MinesweeperDraft.js";
import { assert } from "console";
import { TeamSealedState } from "./TeamSealed.js";
import { GridDraftState, isGridDraftState } from "./GridDraft.js";
import { DraftState } from "./DraftState.js";
import { RochesterDraftState } from "./RochesterDraft.js";
import { WinstonDraftState } from "./WinstonDraft.js";
import { ServerToClientEvents } from "./SocketType";
import Constants from "./Constants.js";
import { SessionsSettingsProps } from "./Session/SessionProps.js";
import { DistributionMode, DraftLogRecipients, DisconnectedUser, UsersData } from "./Session/SessionTypes.js";
import { IIndexable, SetCode } from "./Types.js";
import { isRotisserieDraftState, RotisserieDraftStartOptions, RotisserieDraftState } from "./RotisserieDraft.js";
import { parseLine } from "./parseCardList.js";
import { WinchesterDraftState, isWinchesterDraftState } from "./WinchesterDraft.js";

export class Session implements IIndexable {
	id: SessionID;
	owner: UserID;
	userOrder: Array<string> = [];
	users: Set<UserID> = new Set();

	// Options
	ownerIsPlayer: boolean = true;
	setRestriction: Array<string> = [Constants.MTGASets[Constants.MTGASets.length - 1]];
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
	predeterminedBoosters: Array<Array<UniqueCard>> = [];
	colorBalance: boolean = true;
	maxDuplicates: { [rarity: string]: number } | null = null;
	foil: boolean = false;
	preferredCollation: string = "MTGA"; // Unused! (And thus not exposed client-side)
	useCustomCardList: boolean = false;
	customCardList: CustomCardList = {
		slots: {},
		layouts: false,
		customCards: null,
	};
	customCardListWithReplacement: boolean = false;
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
		for (const p in options)
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
		const disconnectedUsersData: { [uid: string]: any } = {}; // FIXME
		for (const uid in this.disconnectedUsers)
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

	setUsePredeterminedBoosters(value: boolean) {
		if (this.usePredeterminedBoosters === value) return;
		this.usePredeterminedBoosters = value;
		this.forUsers((uid) => Connections[uid]?.socket.emit("sessionOptions", { usePredeterminedBoosters: value }));
	}

	setPredeterminedBoosters(text: string): SocketAck {
		const getCardFunc = this.getCustomGetCardFunction();
		const boosters: UniqueCard[][] = [];
		let booster: UniqueCard[] = [];
		for (let line of text.split("\n")) {
			line = line.trim();
			if (!line || line === "") {
				// Booster boundary, or just an empty line.
				if (booster.length > 0) {
					boosters.push(booster);
					booster = [];
				}
			} else {
				const result = parseLine(line, {
					fallbackToCardName: false,
					customCards: this.customCardList?.customCards,
				});
				if (isSocketError(result)) return result;
				for (let i = 0; i < result.count; ++i) {
					const card = getUnique(result.cardID, {
						foil: result.foil,
						getCard: getCardFunc,
					});
					booster.push(card);
				}
			}
		}
		if (booster.length > 0) boosters.push(booster);

		if (boosters.length === 0) return new SocketError("Empty list");

		// Check booster size consistency.
		for (let i = 1; i < boosters.length; ++i)
			if (boosters[i].length !== boosters[0].length)
				return new SocketError(
					"Inconsistent booster sizes",
					`All boosters must be of the same size. Booster #${i + 1} has ${
						boosters[i].length
					} cards, expected ${boosters[0].length}.`
				);

		this.predeterminedBoosters = boosters;
		this.setUsePredeterminedBoosters(true);
		return new SocketAck();
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
		for (const p of Object.keys(SessionsSettingsProps)) options[p] = (this as IIndexable)[p];
		Connections[userID]?.socket.emit("sessionOptions", options);
	}

	// Returns a getCard function using the custom card data, if any are present in the custom card list.
	getCustomGetCardFunction() {
		return generateCustomGetCardFunction(this.customCardList);
	}

	// Returns true if the card pool is not restricted by players collections (and ignoreCollections is true or no-one is using their collection)
	unrestrictedCardPool() {
		if (this.ignoreCollections) return true;

		for (const userID of this.users) {
			if (Connections[userID].useCollection && Connections[userID].collection.size > 0) return false;
		}

		return true;
	}

	// Returns current card pool according to all session options (Collections, setRestrictions...)
	cardPool() {
		if (this.unrestrictedCardPool()) {
			const cardPool: CardPool = new Map();
			// Returns all cards if there's no set restriction
			if (this.setRestriction.length === 0) {
				for (const [cid, card] of Cards)
					if (card.in_booster) cardPool.set(cid, this.maxDuplicates?.[card.rarity] ?? 99);
			} else {
				// Use cache otherwise
				for (const set of this.setRestriction)
					for (const cid of BoosterCardsBySet[set])
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
			for (const s of sets)
				for (const cid of CardsBySet[s].filter((cid) => cardPool.has(cid)))
					restricted.set(cid, cardPool.get(cid) as number);
			return restricted;
		} else return cardPool;
	}

	// Compute user collections intersection (taking into account each user preferences)
	collection(inBoosterOnly = true): CardPool {
		const user_list = [...this.users];
		let intersection = [];
		const collection: CardPool = new Map();

		const useCollection = [];
		for (let i = 0; i < user_list.length; ++i)
			useCollection[i] = Connections[user_list[i]].useCollection && Connections[user_list[i]].collection.size > 0;

		const arrays = [];
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
		for (const c of intersection) {
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
		for (const cid of cardPool.keys()) {
			const rarity = getCard(cid).rarity;
			if (!(rarity in cardPoolByRarity)) cardPoolByRarity[rarity] = new Map();
			cardPoolByRarity[rarity].set(cid, cardPool.get(cid) as number);
		}
		return cardPoolByRarity;
	}

	// Returns all cards from specified set categorized by rarity and set to maxDuplicates
	setByRarity(set: string) {
		const local: SlotedCardPool = {
			common: new Map(),
			uncommon: new Map(),
			rare: new Map(),
			mythic: new Map(),
		};
		for (const cid of BoosterCardsBySet[set]) {
			const rarity = getCard(cid).rarity;
			if (!(rarity in local)) local[rarity] = new Map();
			local[rarity].set(cid, this.maxDuplicates?.[rarity] ?? 99);
		}
		return local;
	}

	// @return Boosters generated following the session options, or MessageError on error.
	// Options object properties:
	//  - useCustomBoosters: Explicitly enables the use of the CustomBooster option (ignored otherwise)
	//      WARNING (FIXME?): boosterQuantity will be ignored if useCustomBoosters is set and we're not using a customCardList
	//  - playerCount: For use with useCustomBoosters: override getVirtualPlayersCount() as the number of players in the session (allow ignoring bots).
	//  - boostersPerPlayer: For use with useCustomBoosters
	//  - targets: Overrides session boosterContent setting
	//  - cardsPerBooster: Overrides session setting for cards per booster using custom card lists without custom slots
	//  - customBoosters & cardsPerPlayer: Overrides corresponding session settings (used for sealed)
	generateBoosters(
		boosterQuantity: number,
		options: {
			useCustomBoosters?: boolean;
			playerCount?: number;
			boostersPerPlayer?: number;
			targets?: { [rarity: string]: number };
			cardsPerBooster?: number;
			customBoosters?: SetCode[];
			cardsPerPlayer?: number;
		} = {}
	): UniqueCard[][] | MessageError {
		if (!options.cardsPerBooster) options.cardsPerBooster = this.cardsPerBooster;

		// Use pre-determined boosters; Make sure supplied booster are correct.
		if (this.usePredeterminedBoosters) {
			if (!this.predeterminedBoosters) {
				return new MessageError(
					"No Provided Boosters",
					`Please upload your boosters in the session settings to use Pre-determined boosters.`
				);
			}
			if (this.predeterminedBoosters.length !== boosterQuantity) {
				return new MessageError(
					"Incorrect Provided Boosters",
					`Incorrect number of booster: Expected ${boosterQuantity}, got ${this.predeterminedBoosters.length}.`
				);
			}
			if (this.predeterminedBoosters.some((b) => b.length !== this.predeterminedBoosters[0].length)) {
				return new MessageError("Incorrect Provided Boosters", `Inconsistent booster sizes.`);
			}
			return this.predeterminedBoosters;
		}

		if (this.useCustomCardList) {
			const cclOptions = Object.assign(
				{ colorBalance: this.colorBalance, withReplacement: this.customCardListWithReplacement },
				options
			);
			return generateBoosterFromCustomCardList(this.customCardList, boosterQuantity, cclOptions);
		} else {
			// Standard draft boosters
			const targets = options?.targets ?? this.getBoosterContent();

			const BoosterFactoryOptions = {
				foil: this.foil,
				colorBalance: this.colorBalance,
				mythicPromotion: this.mythicPromotion,
				maxDuplicates: this.maxDuplicates,
				session: this,
			};

			let defaultFactory = null;

			const getBoosterFactory = function (
				set: string | null,
				cardPool: SlotedCardPool,
				landSlot: BasicLandSlot | null,
				options: Options
			) {
				const localOptions = Object.assign({ foilRate: getSetFoilRate(set) }, options);
				// Check for a special booster factory
				if (set && set in SetSpecificFactories)
					return new SetSpecificFactories[set](cardPool, landSlot, localOptions);
				return new BoosterFactory(cardPool, landSlot, localOptions);
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
				// Is Arena Collation available?              Is it the preferred choice, or our only one?                           MTGA collations don't have foil sheets.
				if(`${set}-arena` in PaperBoosterFactories && (this.preferredCollation === 'MTGA' || !(set in PaperBoosterFactories) && !this.foil))
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
					const localCollection = this.cardPoolByRarity();
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
					for (const slot of ["common", "uncommon", "rare"]) {
						const card_count = countCards(defaultFactory.cardPool[slot]);
						const card_target = targets[slot] * boosterQuantity;
						if (card_count < card_target) {
							const msg = `Not enough cards (${card_count}/${card_target} ${slot}s) in collection.`;
							console.warn(msg);
							return new MessageError(
								"Error generating boosters",
								`Not enough cards (${card_count}/${card_target} ${slot}s) in collection.`
							);
						}
					}
				}
			}

			const boosters: UniqueCard[][] = [];

			// Simple case, generate all boosters using the default rule
			if (!boosterSpecificRules) {
				if (!defaultFactory) return new MessageError("Internal Error", "No default booster factory.");
				for (let i = 0; i < boosterQuantity; ++i) {
					const booster = defaultFactory.generateBooster(targets);
					if (isMessageError(booster)) return booster;
					boosters.push(booster);
				}
				return boosters;
			} else {
				// Booster specific rules
				// (boosterQuantity is ignored in this case and boostersPerPlayer * this.getVirtualPlayersCount() is used directly instead)
				const boostersPerPlayer = options?.boostersPerPlayer ?? this.boostersPerPlayer; // Allow overriding via options
				const playerCount = options?.playerCount ?? this.getVirtualPlayersCount(); // Allow overriding via options
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

				for (let i = 0; i < playerCount; ++i) {
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
											? Constants.PrimarySets
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
									for (const slot of ["common", "uncommon", "rare"]) {
										if (
											countCards((usedSets[boosterSet] as BoosterFactory).cardPool[slot]) <
											multiplier * playerCount * targets[slot]
										) {
											const msg = `Not enough (${slot}) cards in card pool for individual booster restriction '${boosterSet}'. Please check the Max. Duplicates setting.`;
											console.warn(msg);
											return new MessageError("Error generating boosters", msg);
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
					for (const rules of boosterFactories) shuffleArray(rules);

				// Generate Boosters
				for (let b = 0; b < boostersPerPlayer; ++b) {
					for (let p = 0; p < playerCount; ++p) {
						const rule = boosterFactories[p][b];
						if (!rule) return new MessageError("Internal Error");
						const booster = rule?.generateBooster(targets);
						if (isMessageError(booster)) return booster;
						boosters.push(booster);
					}
				}

				if (this.distributionMode === "shuffleBoosterPool") shuffleArray(boosters);

				// Boosters within a round much be of the same length.
				// For example CMR packs have a default length of 20 cards and may cause problems if boosters are shuffled.
				if (this.distributionMode !== "regular" || customBoosters.some((v: string) => v === "random")) {
					if (boosters.some((b) => b.length !== boosters[0].length)) {
						const msg = `Inconsistent booster sizes`;
						console.error(msg);
						console.error(
							boosters.map((b) => `Length: ${b.length}, First Card: (${b[0].set}) ${b[0].name}`)
						);
						return new MessageError("Error generating boosters", msg);
					}
				}
				return boosters;
			}
		}
		return new MessageError("Internal Error");
	}

	notifyUserChange() {
		// Send only necessary data
		const userInfo: Array<{
			userID: UserID;
			userName: string;
			collection: boolean;
			useCollection: boolean;
		}> = [];
		for (const userID of this.getSortedHumanPlayersIDs()) {
			const u = Connections[userID];
			if (u) {
				userInfo.push({
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
				Connections[user].socket.emit("sessionUsers", userInfo);
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
	startWinstonDraft(boosterCount: number): SocketAck {
		if (this.drafting) return new SocketError("Already drafting.");
		if (this.users.size !== 2)
			return new SocketError(
				"Invalid number of players",
				`Winston Draft can only be played with exactly 2 players. Bots are not supported!`
			);

		const boosters = this.generateBoosters(boosterCount);
		if (isMessageError(boosters)) return new SocketAck(boosters);

		this.drafting = true;
		this.disconnectedUsers = {};
		this.draftState = new WinstonDraftState(this.getSortedHumanPlayersIDs(), boosters);
		for (const user of this.users) {
			Connections[user].pickedCards = { main: [], side: [] };
			Connections[user].socket.emit("sessionOptions", {
				virtualPlayersData: this.getSortedHumanPlayerData(),
			});
			Connections[user].socket.emit("startWinstonDraft", (this.draftState as WinstonDraftState).syncData());
		}

		this.initLogs("Winston Draft", boosters);
		this.winstonNextRound();
		return new SocketAck();
	}

	endWinstonDraft() {
		logSession("WinstonDraft", this);
		if (this.draftLog)
			for (const uid of this.users)
				this.draftLog.users[uid].cards = getPickedCardIds(Connections[uid].pickedCards);
		this.sendLogs();
		for (const user of this.users) Connections[user].socket.emit("winstonDraftEnd");
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
			for (const user of this.users) {
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
			const card = s.cardPool.pop() as UniqueCard;
			Connections[s.currentPlayer()].socket.emit("winstonDraftRandomCard", card);
			this.draftLog?.users[s.currentPlayer()].picks.push({
				randomCard: card.id,
				piles: [...s.piles],
			});
			this.winstonNextRound();
		} else {
			++s.currentPile;
			if (s.piles[s.currentPile].length === 0) this.winstonSkipPile();
			else for (const user of this.users) Connections[user].socket.emit("winstonDraftSync", s.syncData());
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

	startWinchesterDraft(boosterCount: number): SocketAck {
		if (this.drafting) return new SocketError("Already drafting.");
		if (this.users.size !== 2)
			return new SocketError(
				"Invalid number of players",
				`Winchester Draft can only be played with exactly 2 players. Bots are not supported!`
			);

		const boosters = this.generateBoosters(boosterCount);
		if (isMessageError(boosters)) return new SocketAck(boosters);

		this.drafting = true;
		this.disconnectedUsers = {};
		this.draftState = new WinchesterDraftState(this.getSortedHumanPlayersIDs(), boosters);
		const syncData = (this.draftState as WinchesterDraftState).syncData();
		const playerData = this.getSortedHumanPlayerData();
		for (const user of this.users) {
			Connections[user].pickedCards = { main: [], side: [] };
			Connections[user].socket.emit("sessionOptions", {
				virtualPlayersData: playerData,
			});
			Connections[user].socket.emit("startWinchesterDraft", syncData);
		}

		this.initLogs("Winchester Draft", boosters);
		return new SocketAck();
	}

	endWinchesterDraft() {
		logSession("WinchesterDraft", this);
		if (this.draftLog)
			for (const uid of this.users)
				this.draftLog.users[uid].cards = getPickedCardIds(Connections[uid].pickedCards);
		this.sendLogs();
		for (const user of this.users) Connections[user].socket.emit("winchesterDraftEnd");
		this.cleanDraftState();
	}

	winchesterDraftPick(pickedColumn: number): SocketAck {
		const s = this.draftState;
		if (!this.drafting || !s || !isWinchesterDraftState(s)) return new SocketError("Not drafting.");
		if (pickedColumn < 0 || pickedColumn >= s.piles.length || s.piles[pickedColumn].length === 0)
			return new SocketError("Invalid column.");

		this.draftLog?.users[s.currentPlayer()].picks.push({
			pickedPile: pickedColumn,
			piles: [...s.piles],
		});
		Connections[s.currentPlayer()].pickedCards.main = Connections[s.currentPlayer()].pickedCards.main.concat(
			s.piles[pickedColumn]
		);
		s.piles[pickedColumn] = [];
		s.refill();
		++s.round;

		if (s.done()) this.endWinchesterDraft();
		else {
			const syncData = s.syncData();
			for (const uid of this.users) Connections[uid]?.socket.emit("winchesterDraftSync", syncData);
		}

		return new SocketAck();
	}

	///////////////////// Grid Draft //////////////////////
	startGridDraft(boosterCount: number): SocketAck {
		if (this.drafting) return new SocketError("Already drafting.");
		if (this.users.size !== 2 && this.users.size !== 3)
			return new SocketError("Invalid Number of Players", "Grid draft is only available for 2 or 3 players.");
		this.drafting = true;
		// When using a custom card list with custom slots, boosters will be truncated to 9 cards by GridDraftState
		// Use boosterContent setting only if it is valid (adds up to 9 cards)
		const targetCardsPerBooster = Object.values(this.getBoosterContent()).reduce((val, acc) => val + acc, 0);

		// Add 3 cards to each boosters when there are 3 players: Booster will be refilled to 9 cards after the first pick.
		const cardsPerBooster = this.users.size === 3 ? 12 : 9;
		const defaultTargets =
			this.users.size === 3 ? { rare: 1, uncommon: 3, common: 8 } : { rare: 1, uncommon: 3, common: 5 };

		const boosters = this.generateBoosters(boosterCount, {
			targets: targetCardsPerBooster === cardsPerBooster ? this.getBoosterContent() : defaultTargets,
			cardsPerBooster: cardsPerBooster,
		});
		if (isMessageError(boosters)) {
			this.drafting = false;
			return new SocketAck(boosters);
		}

		this.disconnectedUsers = {};
		this.draftState = new GridDraftState(this.getSortedHumanPlayersIDs(), boosters);
		const s = this.draftState as GridDraftState;
		if (isMessageError(s.error)) {
			this.cleanDraftState();
			return new SocketAck(s.error);
		}

		for (const user of this.users) {
			Connections[user].pickedCards = { main: [], side: [] };
			Connections[user].socket.emit("sessionOptions", {
				virtualPlayersData: this.getSortedHumanPlayerData(),
			});
			Connections[user].socket.emit("startGridDraft", s.syncData());
		}

		this.initLogs("Grid Draft", boosters);
		return new SocketAck();
	}

	endGridDraft() {
		logSession("GridDraft", this);
		if (this.draftLog) {
			for (const uid of this.users)
				this.draftLog.users[uid].cards = getPickedCardIds(Connections[uid].pickedCards);
			this.sendLogs();
		}
		for (const user of this.users) Connections[user].socket.emit("gridDraftEnd");
		this.cleanDraftState();
	}

	gridDraftNextRound() {
		const s = this.draftState;
		if (!this.drafting || !s || !isGridDraftState(s)) return;

		++s.round;
		// Refill Booster after the first pick at 3 players
		if (s.players.length === 3 && s.round % 3 === 1) {
			// Send the current state before re-filling for animation purposes.
			const syncData: any = s.syncData();
			syncData.currentPlayer = null; // Set current player to null as a flag to delay the display update
			for (const user of this.users) Connections[user].socket.emit("gridDraftNextRound", syncData);

			const additionalCards = s.boosters[0].slice(9);
			s.boosters[0] = s.boosters[0].slice(0, 9);
			for (let idx = 0; idx < s.boosters[0].length; ++idx)
				if (s.boosters[0][idx] === null) s.boosters[0][idx] = additionalCards.pop()!;
		}
		if (s.round % s.players.length === 0) {
			// Share the last pick before advancing to the next booster.
			const syncData: any = s.syncData();
			syncData.currentPlayer = null; // Set current player to null as a flag to delay the display update
			for (const user of this.users) Connections[user].socket.emit("gridDraftNextRound", syncData);

			s.boosters.shift();
			if (s.boosters.length === 0) {
				this.endGridDraft();
				return;
			}
		}
		for (const user of this.users) Connections[user].socket.emit("gridDraftNextRound", s.syncData());
	}

	gridDraftPick(choice: number): SocketAck {
		const s = this.draftState;
		if (!this.drafting || !s || !isGridDraftState(s)) return new SocketError("Not drafting");

		const log: GridDraftPick = { pick: [], booster: s.boosters[0].map((c) => (c ? c.id : null)) };

		const pickedCards: UniqueCard[] = [];
		for (let i = 0; i < 3; ++i) {
			//                       Column           Row
			const idx = choice < 3 ? 3 * i + choice : 3 * (choice - 3) + i;
			if (s.boosters[0][idx] !== null) {
				Connections[s.currentPlayer()].pickedCards.main.push(s.boosters[0][idx] as UniqueCard);
				pickedCards.push(s.boosters[0][idx] as UniqueCard);
				log.pick.push(idx);
				s.boosters[0][idx] = null;
			}
		}

		if (pickedCards.length === 0) return new SocketError("Invalid choice");

		this.draftLog?.users[s.currentPlayer()].picks.push(log);
		s.lastPicks.unshift({
			userName: Connections[s.currentPlayer()].userName,
			round: s.round,
			cards: pickedCards,
		});
		if (s.lastPicks.length > 2) s.lastPicks.pop();

		this.gridDraftNextRound();
		return new SocketAck();
	}
	///////////////////// Grid Draft End //////////////////////

	///////////////////// Rochester Draft //////////////////////
	startRochesterDraft(): SocketAck {
		if (this.drafting) return new SocketError("Already drafting.");
		if (this.users.size <= 1)
			return new SocketError(
				"Not Enough Players",
				`Rochester Draft can only be played with at least 2 players. Bots are not supported!`
			);
		if (this.randomizeSeatingOrder) this.randomizeSeating();

		const boosters = this.generateBoosters(this.boostersPerPlayer * this.users.size, {
			useCustomBoosters: true,
			boostersPerPlayer: this.boostersPerPlayer,
			playerCount: this.users.size,
		});
		if (isMessageError(boosters)) return new SocketAck(boosters);

		this.drafting = true;
		this.disconnectedUsers = {};
		this.draftState = new RochesterDraftState(this.getSortedHumanPlayersIDs(), boosters);
		for (const user of this.users) {
			Connections[user].pickedCards = { main: [], side: [] };
			Connections[user].socket.emit("sessionOptions", {
				virtualPlayersData: this.getSortedHumanPlayerData(),
			});
			Connections[user].socket.emit("startRochesterDraft", (this.draftState as RochesterDraftState).syncData());
		}

		this.initLogs("Rochester Draft", boosters);
		return new SocketAck();
	}

	endRochesterDraft(): void {
		const s = this.draftState;
		if (!this.drafting || !s || !(s instanceof RochesterDraftState)) return;
		logSession("RochesterDraft", this);
		for (const uid of this.users) {
			if (this.draftLog) this.draftLog.users[uid].cards = getPickedCardIds(Connections[uid].pickedCards);
			Connections[uid].socket.emit("rochesterDraftEnd");
		}
		this.sendLogs();
		this.cleanDraftState();
	}

	rochesterDraftNextRound(): void {
		const s = this.draftState;
		if (!this.drafting || !s || !(s instanceof RochesterDraftState)) return;
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
		for (const user of this.users) Connections[user].socket.emit("rochesterDraftNextRound", syncData);
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

	///////////////////// Rotisserie Draft //////////////////////
	startRotisserieDraft(options: RotisserieDraftStartOptions): SocketAck {
		if (this.drafting) return new SocketError("Already drafting.");
		if (this.users.size <= 1)
			return new SocketError(
				"Not enough players",
				"At least two players are needed to launch a Rotisserie Draft. Bots are not supported."
			);
		if (this.randomizeSeatingOrder) this.randomizeSeating();

		let cards: UniqueCard[] = [];
		let cardsPerPlayer: number;
		if (options.singleton) {
			let cardPool: CardID[] = [];
			if (this.useCustomCardList) {
				for (const slot in this.customCardList.slots)
					cardPool.push(...Object.keys(this.customCardList.slots[slot]));
				cardPool = [...new Set(cardPool)];
			} else {
				cardPool = [...this.cardPool().keys()];
			}
			const cardCount = this.users.size * options.singleton.cardsPerPlayer;
			if (cardPool.length < cardCount)
				return new SocketError(
					"Not enough cards",
					`Not enough cards in card pool: ${cardPool.length}/${cardCount}.`
				);
			if (options.singleton.exactCardCount) {
				shuffleArray(cardPool);
				cardPool = cardPool.slice(0, cardCount);
			}
			cards = cardPool.map((cid) => getUnique(cid, { getCard: this.getCustomGetCardFunction() }));
			cardsPerPlayer = options.singleton.cardsPerPlayer;
		} else if (options.standard) {
			const boosters = this.generateBoosters(options.standard.boostersPerPlayer * this.users.size, {
				useCustomBoosters: true,
				boostersPerPlayer: options.standard.boostersPerPlayer,
				playerCount: this.users.size,
			});
			if (isMessageError(boosters)) return new SocketAck(boosters);
			cards = boosters.flat();
			cardsPerPlayer = cards.length / this.users.size;
		} else {
			return new SocketError("Invalid parameters");
		}

		this.disconnectedUsers = {};
		this.draftState = new RotisserieDraftState(this.getSortedHumanPlayersIDs(), cards, cardsPerPlayer);
		if (!isRotisserieDraftState(this.draftState)) return new SocketError("Internal Error");
		this.drafting = true;
		for (const user of this.users) {
			Connections[user].pickedCards = { main: [], side: [] };
			Connections[user].socket.emit("sessionOptions", {
				virtualPlayersData: this.getSortedHumanPlayerData(),
			});
			Connections[user].socket.emit("startRotisserieDraft", this.draftState.syncData(user));
		}

		this.initLogs("Rotisserie Draft", []);

		return new SocketAck();
	}

	endRotisserieDraft(): SocketAck {
		const s = this.draftState;
		if (!this.drafting || !s || !isRotisserieDraftState(s))
			return new SocketError("No active Rotisserie Draft in this session.");

		logSession("RotisserieDraft", this);
		for (const uid of this.users) {
			if (this.draftLog) this.draftLog.users[uid].cards = getPickedCardIds(Connections[uid].pickedCards);
			Connections[uid].socket.emit("rotisserieDraftEnd");
		}
		this.sendLogs();
		this.cleanDraftState();
		return new SocketAck();
	}

	rotisserieDraftPick(uniqueID: UniqueCardID): SocketAck {
		const s = this.draftState;
		if (!this.drafting || !s || !isRotisserieDraftState(s))
			return new SocketError("No Rotisserie Draft in progress in this session.");

		const card = s.cards.find((c) => c.uniqueID === uniqueID);
		if (!card) return new SocketError("Invalid Card", "Card not found.");
		if (card.owner !== null) return new SocketError("Invalid Card", "Card already picked.");
		card.owner = s.currentPlayer();
		Connections[s.currentPlayer()].pickedCards.main.push(card);

		this.draftLog?.users[card.owner].picks.push({
			pick: [0],
			booster: [card.id],
		});

		if (s.advance()) {
			this.endRotisserieDraft();
		} else {
			for (const user of this.users)
				Connections[user]?.socket.emit(
					"rotisserieDraftUpdateState",
					card.uniqueID,
					card.owner,
					s.currentPlayer()
				);
		}
		return new SocketAck();
	}
	///////////////////// Rotisserie Draft End //////////////////////

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
		const boosters = this.generateBoosters(gridCount, { cardsPerBooster: gridWidth * gridHeight });
		if (isMessageError(boosters)) {
			// FIXME: We should propagate to ack.
			this.emitError(boosters.title, boosters.text);
			this.drafting = false;
			this.broadcastPreparationCancelation();
			return new SocketAck(); // Error already emitted above.
		}

		if (boosters.some((b) => b.length !== gridWidth * gridHeight)) {
			this.drafting = false;
			this.broadcastPreparationCancelation();
			return new SocketError(
				"Erroneous Pack Size",
				"An error occured while generating the packs for your Minesweeper draft, please check your settings."
			);
		}

		this.initLogs("Minesweeper Draft", boosters);

		this.disconnectedUsers = {};
		this.draftState = new MinesweeperDraftState(
			this.getSortedHumanPlayersIDs(),
			boosters,
			gridWidth,
			gridHeight,
			picksPerGrid,
			options
		);
		for (const user of this.users) {
			Connections[user].pickedCards = { main: [], side: [] };
			Connections[user].socket.emit("sessionOptions", {
				virtualPlayersData: this.getSortedHumanPlayerData(),
			});
			Connections[user].socket.emit(
				"startMinesweeperDraft",
				(this.draftState as MinesweeperDraftState).syncData()
			);
		}

		return new SocketAck();
	}

	minesweeperDraftPick(userID: UserID, row: number, col: number): SocketAck {
		const s = this.draftState as MinesweeperDraftState;
		if (!this.drafting || !s || !(s instanceof MinesweeperDraftState))
			return new SocketError("Not Playing", "There's no Minesweeper Draft running on this session.");
		const cell = s.grid().get(row, col);
		if (!cell)
			return new SocketError(
				"Invalid Coordinates",
				`Coordinates (${row}, ${col}) are invalid for grid of size (${s.grid().height()}, ${s.grid().width()}).`
			);
		if (cell.state !== MinesweeperCellState.Revealed)
			return new SocketError("Invalid Coordinates", "Cards can only be picked after being revealed.");

		const currentUserID = s.currentPlayer();
		if (currentUserID !== userID) return new SocketError("Not your turn", "It's not your turn to pick.");

		const currentGridState = s.pick(row, col, Connections[userID].userName);

		const pickedCard = cell.card;
		Connections[userID].pickedCards.main.push(pickedCard);

		if (s.advance()) {
			// Send the state without current player for animation purposes.
			this.forUsers((userID) => {
				currentGridState.currentPlayer = "";
				Connections[userID].socket.emit("minesweeperDraftUpdateState", currentGridState);
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
				Connections[userID].socket.emit("minesweeperDraftUpdateState", currentGridState);
			});
		}

		return new SocketAck();
	}

	endMinesweeperDraft(options: { immediate?: boolean } = {}): void {
		const s = this.draftState as MinesweeperDraftState;
		if (!this.drafting || !s || !(s instanceof MinesweeperDraftState)) return;
		logSession("MinesweeperDraft", this);
		for (const uid of this.users) {
			if (this.draftLog) this.draftLog.users[uid].cards = getPickedCardIds(Connections[uid].pickedCards);
			Connections[uid].socket.emit("minesweeperDraftEnd", options);
		}
		this.sendLogs();
		this.cleanDraftState();
	}

	///////////////////// Traditional Draft Methods //////////////////////
	async startDraft(): Promise<void> {
		if (this.drafting) return;
		if (this.randomizeSeatingOrder) this.randomizeSeating();

		this.emitMessage("Preparing draft!", "Your draft will start soon...", false, 0);

		const boosterQuantity = (this.users.size + this.bots) * this.boostersPerPlayer;
		console.log(`Session ${this.id}: Starting draft! (${this.users.size} players)`);

		const boosters = this.generateBoosters(boosterQuantity, { useCustomBoosters: true });
		if (isMessageError(boosters)) {
			// FIXME: We should propagate to ack.
			this.emitError(boosters.title, boosters.text);
			this.broadcastPreparationCancelation();
			return;
		}

		// Determine bot type
		const oracleIds = boosters.flat().map((card) => card.oracle_id);
		const simpleBots = await fallbackToSimpleBots([...new Set(oracleIds)]);
		const botParameters: MTGDraftBotParameters = {
			model_type: "prod",
		};
		// If we're only drafting an official set, check if we have a available specialized bot model of it.
		if (
			!simpleBots &&
			!this.usePredeterminedBoosters &&
			!this.useCustomCardList &&
			this.setRestriction.length === 1 &&
			this.customBoosters.every((s) => s === "" || s === this.setRestriction[0])
		) {
			if (
				Object.values(MTGDraftBotsSetSpecializedModels).includes(
					this.setRestriction[0] as unknown as MTGDraftBotsSetSpecializedModels
				)
			)
				botParameters.model_type = this.setRestriction[0] as MTGDraftBotsSetSpecializedModels;
		}

		// There is a very slim possibility that everyone disconnects during the asynchronous call to fallbackToSimpleBots,
		// raising an exception and leaving the session in an invalid state. I hope this will catch all possible failure cases.
		try {
			this.draftState = new DraftState(boosters, this.getSortedHumanPlayersIDs(), {
				simpleBots: simpleBots,
				botCount: this.bots,
				botParameters,
			});
			this.disconnectedUsers = {};
			this.drafting = true;
		} catch (e) {
			console.error("Exception raised while constructing the DraftState: ", e);
			this.cleanDraftState();
			return;
		}

		const log = this.initLogs("Draft", boosters);

		const virtualPlayerData = this.getSortedVirtualPlayerData();
		for (const uid of this.users) {
			Connections[uid].pickedCards = { main: [], side: [] };
			Connections[uid].socket.emit("startDraft", virtualPlayerData);
		}

		if (!this.ownerIsPlayer && this.owner in Connections) {
			Connections[this.owner].socket.emit("startDraft", virtualPlayerData);
			// Update draft log for live display if owner is not playing
			if (this.shouldSendLiveUpdates())
				Connections[this.owner].socket.emit("draftLogLive", {
					log: this.draftLog,
				});
		}

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

		if (process.env.NODE_ENV !== "production")
			console.log(
				`Session ${this.id}: ${Connections[userID].userName} [${userID}] picked card '${pickedCards.map(
					(idx) => booster[idx].name
				)}', burning ${burnedCards && burnedCards.length > 0 ? burnedCards.length : "nothing"}.`
			);

		// Request is valid, actually extract the booster and proceed
		this.stopCountdown(userID);
		booster = s.players[userID].boosters.splice(0, 1)[0];

		for (const idx of pickedCards) {
			Connections[userID].pickedCards.main.push(booster[idx]);
			s.players[userID].botInstance?.addCard(booster[idx]);
		}

		const pickData: DraftPick = {
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
			Connections[this.owner].socket.emit("draftLogLive", {
				userID: userID,
				pick: pickData,
			});
			this.updateDecklist(userID);
			Connections[this.owner].socket.emit("pickAlert", {
				userID: userID,
				userName: Connections[userID].userName,
				cards: pickedCards.map((idx) => booster[idx]),
			});
		}

		for (const idx of cardsToRemove) booster.splice(idx, 1);

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
					s.players[userID].botInstance.addCard(booster[i]);
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

		const pickData: DraftPick = {
			pick: pickedIndices,
			burn: burnedIndices,
			booster: booster.map((c) => c.id),
		};
		this.draftLog?.users[userID].picks.push(pickData);

		if (this.shouldSendLiveUpdates())
			Connections[this.owner]?.socket.emit("draftLogLive", { userID: userID, pick: pickData });

		const cardsToRemove = pickedIndices.concat(burnedIndices);
		cardsToRemove.sort((a, b) => b - a); // Remove last index first to avoid shifting indices
		for (const idx of cardsToRemove) booster.splice(idx, 1);

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
		if (userID in Connections) Connections[userID].socket.emit("draftState", s.syncData(userID));
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

		const staggerDelay = 100; // Will delay successive calls to the mtgdraftbots API
		let inFlightBots = 0;
		const delayRequest = (botType: string) => {
			if (botType !== "mtgdraftbots") return Promise.resolve();
			const r = new Promise((resolve) => setTimeout(resolve, staggerDelay * inFlightBots));
			inFlightBots++;
			return r;
		};

		let index = 0;
		for (const userID in s.players) {
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
			for (const uid in this.draftState.players)
				if (this.draftState.players[uid].isBot) this.startBotPickChain(uid);
		}

		this.forUsers((u) => Connections[u]?.socket.emit("resumeOnReconnection", new Message(msg.title, msg.text)));
	}

	endDraft() {
		if (!this.drafting) return;
		const s = this.draftState as DraftState;

		// Allow other callbacks (like distributeBoosters) to finish before proceeding (actually an issue in tests).
		process.nextTick(() => {
			if (this.draftLog) {
				for (const userID in s.players) {
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
			case "winchester":
				this.endWinchesterDraft();
				break;
			case "grid":
				this.endGridDraft();
				break;
			case "rochester":
				this.endRochesterDraft();
				break;
			case "rotisserie":
				this.endRotisserieDraft();
				break;
			case "minesweeper":
				this.endMinesweeperDraft({ immediate: true });
				break;
			case "draft": {
				this.endDraft();
				break;
			}
			case "teamSealed": {
				this.endTeamSealed();
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

	initLogs(type: string = "Draft", boosters: UniqueCard[][]): DraftLog {
		const carddata: { [cid: string]: Card } = {};
		const customGetCard = this.getCustomGetCardFunction();
		for (const c of boosters.flat()) carddata[c.id] = customGetCard(c.id);
		this.draftLog = new DraftLog(
			type,
			this,
			carddata,
			boosters.map((booster) => booster.map((card) => card.id)),
			this.getSortedVirtualPlayerData()
		);
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

		for (const uid in this.draftLog.users) {
			if (uid === recipientUID) {
				strippedLog.users[uid] = this.draftLog.users[uid];
				// We also have to supply card data for all cards seen by the player.
				if (this.draftLog.type === "Draft" && this.draftLog.users[uid].picks)
					for (const pick of this.draftLog.users[uid].picks)
						for (const cid of (pick as DraftPick).booster) strippedLog.carddata[cid] = getCardFunc(cid);
				else for (const cid of this.draftLog.users[uid].cards) strippedLog.carddata[cid] = getCardFunc(cid);
			} else {
				strippedLog.users[uid] = {
					userID: this.draftLog.users[uid].userID,
					userName: this.draftLog.users[uid].userName,
					picks: [],
					cards: [],
					isBot: this.draftLog.users[uid].isBot,
				};
				if (this.draftLog.users[uid].decklist)
					strippedLog.users[uid].decklist = {
						main: [],
						side: [],
						hashes: this.draftLog.users[uid].decklist?.hashes,
					};
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
					this.forUsers((uid) => Connections[uid]?.socket.emit("draftLog", this.getStrippedLog(uid)!));
				else {
					const strippedLog = this.getStrippedLog();
					this.forUsers((uid) => Connections[uid]?.socket.emit("draftLog", strippedLog!));
				}
				break;
			default:
			case "delayed":
				this.draftLog.delayed = true;
			// Fallthrough
			case "owner":
				Connections[this.owner].socket.emit("draftLog", this.draftLog);
				if (this.personalLogs)
					this.forNonOwners((uid) => Connections[uid]?.socket.emit("draftLog", this.getStrippedLog(uid)!));
				else {
					const strippedLog = this.getStrippedLog();
					this.forNonOwners((uid) => Connections[uid]?.socket.emit("draftLog", strippedLog!));
				}
				break;
			case "everyone":
				this.forUsers((uid) => Connections[uid]?.socket.emit("draftLog", this.draftLog!));
				break;
		}
	}

	distributeSealed(boostersPerPlayer: number, customBoosters: Array<string>): void {
		this.emitMessage("Distributing sealed boosters...", "", false, 0);

		const useCustomBoosters = customBoosters && customBoosters.some((s) => s !== "");
		if (useCustomBoosters && customBoosters.length !== boostersPerPlayer) {
			// FIXME: We should propagate to ack.
			this.emitError("Error", "Invalid 'customBoosters' parameter.");
			this.broadcastPreparationCancelation();
			return;
		}
		const boosters = this.generateBoosters(this.users.size * boostersPerPlayer, {
			useCustomBoosters: useCustomBoosters,
			boostersPerPlayer: boostersPerPlayer,
			playerCount: this.users.size, // Ignore bots when using customBoosters (FIXME: It's janky...)
			customBoosters: useCustomBoosters ? customBoosters : undefined,
		});
		if (isMessageError(boosters)) {
			// FIXME: We should propagate to ack.
			this.emitError(boosters.title, boosters.text);
			this.broadcastPreparationCancelation();
			return;
		}
		const log = this.initLogs("Sealed", boosters);
		log.customBoosters = customBoosters; // Override the session setting by the boosters provided to this function.

		let idx = 0;
		for (const userID of this.users) {
			const playersBoosters = [];
			let currIdx = idx;
			while (currIdx < boosters.length) {
				playersBoosters.push(boosters[currIdx]);
				currIdx += this.users.size;
			}
			Connections[userID].socket.emit("setCardSelection", playersBoosters);
			Connections[userID].pickedCards.main = playersBoosters.flat();
			Connections[userID].pickedCards.side = [];
			log.users[userID].cards = playersBoosters.flat().map((c) => c.id);
			++idx;
		}

		this.sendLogs();

		// If owner is not playing, let them know everything went ok.
		if (!this.ownerIsPlayer && this.owner in Connections) {
			const msg = new Message("Sealed pools successfly distributed!");
			msg.showConfirmButton = false;
			Connections[this.owner].socket.emit("message", msg);
		}

		logSession("Sealed", this);
	}

	startTeamSealed(boostersPerTeam: number, customBoosters: Array<string>, rawTeams: UserID[][]): SocketAck {
		if (this.drafting) return new SocketError("Game already in progress.");

		this.drafting = true;

		// Filter out empty teams (we don't have to generate boosters for them).
		const teams = rawTeams.filter((t) => t.length > 0);

		// Validate 'teams' parameters
		const seenIds: UserID[] = []; // Reject duplicates UserIDs
		for (const team of teams)
			for (const uid of team) {
				if (seenIds.includes(uid)) new SocketError("Invalid team parameter.", `Duplicate UserID '${uid}'.`);
				seenIds.push(uid);
				if (!this.users.has(uid))
					return new SocketError("Invalid team parameter.", `UserID '${uid}' not in session.`);
				if (!Connections[uid]) return new SocketError("Invalid user.", `UserID '${uid}' not connected.`);
			}

		const useCustomBoosters = customBoosters && customBoosters.some((s) => s !== "");
		if (useCustomBoosters && customBoosters.length !== boostersPerTeam) {
			this.drafting = false;
			return new SocketError("Error", "Invalid 'customBoosters' parameter.");
		}
		const boosters = this.generateBoosters(teams.length * boostersPerTeam, {
			boostersPerPlayer: boostersPerTeam,
			playerCount: teams.length, // Ignore bots when using customBoosters (FIXME)
			useCustomBoosters: useCustomBoosters,
			customBoosters: useCustomBoosters ? customBoosters : undefined,
		});
		if (isMessageError(boosters)) {
			this.drafting = false;
			return new SocketAck(boosters);
		}

		const log = this.initLogs("TeamSealed", boosters);
		log.customBoosters = customBoosters; // Override the session setting by the boosters provided to this function.

		let idx = 0;
		const state = new TeamSealedState();
		for (const team of teams) {
			const teamBoosters = [];
			let currIdx = idx;
			while (currIdx < boosters.length) {
				teamBoosters.push(boosters[currIdx]);
				currIdx += teams.length;
			}
			const teamPool = {
				cards: teamBoosters.flat().map((card) => Object.assign(card, { owner: null })),
				team: team,
			};
			state.teamPools.push(teamPool);
			for (const userID of team) {
				Connections[userID].socket.emit("startTeamSealed", { state: teamPool });
				Connections[userID].pickedCards.main = [];
				Connections[userID].pickedCards.side = [];
				log.users[userID].cards = teamPool.cards.map((c) => c.id);
			}
			++idx;
		}
		this.draftState = state;

		this.sendLogs();

		// If owner is not playing, let them know everything went ok.
		if (!this.ownerIsPlayer && this.owner in Connections) {
			const msg = new Message("Sealed pools successfly distributed!");
			msg.showConfirmButton = false;
			Connections[this.owner].socket.emit("message", msg);
			Connections[this.owner].socket.emit("startTeamSealedSpectator");
		}

		logSession("TeamSealed", this);
		return new SocketAck();
	}

	endTeamSealed() {
		if (!this.drafting || this.draftState?.type !== "teamSealed") return;
		logSession("TeamSealed", this);
		this.cleanDraftState();

		this.forUsers((uid) => {
			this.updateDecklist(uid);
			Connections[uid].socket.emit("endTeamSealed");
		});
		console.log(`Session ${this.id} Team Sealed stopped.`);
	}

	teamSealedPick(userID: UserID, cardUniqueID: UniqueCardID): SocketAck {
		const state = this.draftState as TeamSealedState;
		if (!state) return new SocketError("Not playing", "No Team Sealed active in this session.");
		for (const teamPool of state.teamPools) {
			if (teamPool.team.includes(userID)) {
				const card = teamPool.cards.find((c) => c.uniqueID === cardUniqueID);
				if (!card)
					return new SocketError("Unknown Card", "Could not find specified card in your team sealed pool.");
				if (card.owner && card.owner !== userID)
					return new SocketError("Card Unavailable", "Another player already took this card.");
				// Release the card
				if (card.owner === userID) {
					card.owner = null;
					Connections[userID].pickedCards.main = Connections[userID].pickedCards.main.filter(
						(c) => c.uniqueID !== cardUniqueID
					);
					Connections[userID].pickedCards.side = Connections[userID].pickedCards.side.filter(
						(c) => c.uniqueID !== cardUniqueID
					);
				} else {
					card.owner = userID;
					Connections[userID].pickedCards.main.push(card);
				}
				for (const uid of teamPool.team)
					Connections[uid]?.socket.emit("teamSealedUpdateCard", cardUniqueID, card.owner);
				this.updateDecklist(userID);
				return new SocketAck();
			}
		}
		return new SocketError("Not playing", "You're not playing in this team sealed?!");
	}

	distributeJumpstart(set?: string) {
		this.emitMessage("Distributing jumpstart boosters...", "", false, 0);

		const log = this.initLogs("Jumpstart", []);
		log.carddata = {};

		// Jumpstart: Historic Horizons
		if (set === "j21" || set === "super") {
			for (const user of this.users) {
				// Randomly get 2*3 packs and let the user choose among them.
				const choices: [JHHBooster[], JHHBooster[][]] = [[], []];
				if (set === "j21") {
					choices[0] = getNDisctinctRandom(JumpstartHHBoosters, 3).map(generateJHHBooster);
					// The choices are based on the first pick colors (we send all possibilties rather than waiting for user action).
					const secondchoice: JHHBooster[][] = [];
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
					choices[1] = secondchoice;
				} else {
					choices[0] = getNDisctinctRandom(SuperJumpBoosters, 3).map(generateJHHBooster);
					// Second choice does not depend on the first one in this case, but we'll keep the same interface for simplicity.
					choices[1] = [];
					const secondChoice = getNDisctinctRandom(SuperJumpBoosters, 3).map(generateJHHBooster);
					for (let i = 0; i < 3; ++i) choices[1].push(secondChoice);
				}
				Connections[user].socket.emit("selectJumpstartPacks", choices, (user: UserID, cards: CardID[]) => {
					if (!this.draftLog) return;
					this.draftLog.users[user].cards = cards;
					for (const cid of this.draftLog.users[user].cards) this.draftLog.carddata[cid] = getCard(cid);
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
			for (const user of this.users) {
				const boosters = [getRandom(JumpstartBoosters), getRandom(JumpstartBoosters)];
				const cards = boosters.map((b) => b.cards.map((cid: CardID) => getUnique(cid)));

				log.users[user].cards = cards.flat().map((c: Card) => c.id);
				for (const cid of log.users[user].cards) log.carddata[cid] = getCard(cid);

				Connections[user].socket.emit("setCardSelection", cards);
				Connections[user].socket.emit("message", {
					icon: "success",
					imageUrl: "/img/2JumpstartBoosters.webp",
					title: "Here are your Jumpstart boosters!",
					text: `You got '${boosters[0].name}' and '${boosters[1].name}'.`,
					showConfirmButton: false,
					timer: 2000,
				} as Message);
			}
			this.sendLogs();
			logSession("Jumpstart", this);
		}

		// If owner is not playing, let them know everything went ok.
		if (!this.ownerIsPlayer && this.owner in Connections) {
			const msg = new Message("Jumpstart boosters successfully distributed!");
			msg.showConfirmButton = false;
			Connections[this.owner].socket.emit("message", msg);
		}
	}

	reconnectUser(userID: UserID) {
		if (!this.draftState) return;

		if (!(this.draftState instanceof DraftState)) {
			Connections[userID].pickedCards = this.disconnectedUsers[userID].pickedCards;
			this.addUser(userID);

			let msgData: { name?: keyof ServerToClientEvents; state: IDraftState } = { state: this.draftState };
			switch (this.draftState.type) {
				case "winston":
					msgData.name = "rejoinWinstonDraft";
					break;
				case "winchester":
					msgData.name = "rejoinWinchesterDraft";
					break;
				case "grid":
					msgData.name = "rejoinGridDraft";
					break;
				case "rochester":
					msgData.name = "rejoinRochesterDraft";
					break;
				case "rotisserie":
					msgData.name = "rejoinRotisserieDraft";
					break;
				case "minesweeper":
					msgData.name = "rejoinMinesweeperDraft";
					break;
				case "teamSealed": {
					msgData.name = "rejoinTeamSealed";
					break;
				}
			}
			// FIXME: Refactor to get full type checking
			Connections[userID].socket.emit(msgData.name!, {
				pickedCards: this.disconnectedUsers[userID].pickedCards,
				state: msgData.state.syncData(userID),
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
				boosterCount: this.draftState.players[userID].boosters.length,
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
			if (this.shouldSendLiveUpdates())
				Connections[userID].socket.emit("draftLogLive", {
					log: this.draftLog,
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

		for (const uid in this.disconnectedUsers) this.startBotPickChain(uid);

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
		for (const userID in s.players)
			if (!s.players[userID].isBot && !this.isDisconnected(userID) && s.players[userID].boosters.length > 0)
				this.startCountdown(userID);
	}

	resumeCountdowns() {
		if (!(this.draftState instanceof DraftState)) return;
		const s = this.draftState as DraftState;
		for (const userID in s.players)
			if (!s.players[userID].isBot && !this.isDisconnected(userID) && s.players[userID].boosters.length > 0)
				this.resumeCountdown(userID);
	}

	stopCountdowns() {
		if (!(this.draftState instanceof DraftState)) return;
		for (const userID in (this.draftState as DraftState).players) this.stopCountdown(userID);
	}

	startCountdown(userID: UserID) {
		if (!(this.draftState instanceof DraftState)) return;
		if (this.maxTimer === 0) {
			Connections[userID]?.socket.emit("disableTimer");
			return;
		}

		const s = this.draftState as DraftState;
		this.stopCountdown(userID);

		const dec = Math.floor((0.9 * this.maxTimer) / s.numPicks);
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
		const players = Array.from(this.users).concat(Object.keys(this.disconnectedUsers));
		return this.userOrder.filter((e) => players.includes(e));
	}

	getVirtualPlayersCount() {
		return this.users.size + Object.keys(this.disconnectedUsers).length + this.bots;
	}

	isDisconnected(userID: UserID): boolean {
		return userID in this.disconnectedUsers;
	}

	getSortedHumanPlayerData() {
		const tmp: UsersData = {};
		for (const userID of this.getSortedHumanPlayersIDs()) {
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
		const r: UsersData = {};
		if (this.draftState instanceof DraftState) {
			for (const userID in this.draftState.players) {
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
			} as Message)
		);
	}

	broadcastPreparationCancelation() {
		this.forNonOwners((uid) =>
			Connections[uid]?.socket.emit("message", {
				icon: "warning",
				toast: true,
				title: "Game canceled",
			} as Message)
		);
	}

	emitError(title: string = "Error", text: string | null = "Unspecified Error", showConfirmButton = true, timer = 0) {
		Connections[this.owner]?.socket.emit("message", {
			icon: "error",
			title: title,
			text: text,
			showConfirmButton: showConfirmButton,
			timer: timer,
		} as Message);
	}

	generateBracket(players: BracketPlayer[]) {
		if (this.teamDraft) {
			this.bracket = new TeamBracket(players);
		} else {
			this.bracket = new Bracket(players);
		}
		this.forUsers((u) => Connections[u]?.socket.emit("sessionOptions", { bracket: this.bracket }));
	}

	generateSwissBracket(players: BracketPlayer[]) {
		this.bracket = new SwissBracket(players);
		this.forUsers((u) => Connections[u]?.socket.emit("sessionOptions", { bracket: this.bracket }));
	}

	generateDoubleBracket(players: BracketPlayer[]) {
		this.bracket = new DoubleBracket(players);
		this.forUsers((u) => Connections[u]?.socket.emit("sessionOptions", { bracket: this.bracket }));
	}

	updateBracket(results: Array<[number, number]>): void {
		if (!this.bracket) return;
		this.bracket.results = results;
		this.forUsers((u) => Connections[u]?.socket.emit("sessionOptions", { bracket: this.bracket }));
	}

	updateDeckLands(userID: UserID, lands: DeckBasicLands) {
		if (!this.draftLog?.users[userID]) return;
		if (!this.draftLog.users[userID].decklist) this.draftLog.users[userID].decklist = { main: [], side: [] };
		(this.draftLog.users[userID].decklist as DeckList).lands = lands;
		this.updateDecklist(userID);
	}

	updateDecklist(userID: UserID) {
		if (!this.draftLog?.users[userID]) return;
		if (!this.draftLog.users[userID].decklist) this.draftLog.users[userID].decklist = { main: [], side: [] };
		(this.draftLog.users[userID].decklist as DeckList).main = Connections[userID].pickedCards.main.map((c) => c.id);
		(this.draftLog.users[userID].decklist as DeckList).side = Connections[userID].pickedCards.side.map((c) => c.id);
		this.draftLog.users[userID].decklist = computeHashes(this.draftLog.users[userID].decklist as DeckList, {
			getCard: this.getCustomGetCardFunction(),
		});
		// Update clients
		const shareData = {
			sessionID: this.id,
			time: this.draftLog?.time,
			userID: userID,
			decklist: this.draftLog.users[userID].decklist,
		};
		const hashesOnly = {
			sessionID: this.id,
			time: this.draftLog?.time,
			userID: userID,
			decklist: { hashes: this.draftLog.users[userID].decklist?.hashes },
		};

		if (this.shouldSendLiveUpdates()) Connections[this.owner]?.socket.emit("draftLogLive", shareData);

		if (!this.drafting) {
			// Note: The session setting draftLogRecipients may have changed since the game ended.
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
	}

	// Indicates if the DraftLogLive feature is in use
	shouldSendLiveUpdates() {
		return (
			!this.ownerIsPlayer &&
			["owner", "delayed", "everyone"].includes(this.draftLogRecipients) &&
			this.owner in Connections
		);
	}

	// Execute fn for each user. Owner included even if they're not playing.
	forUsers(fn: (uid: UserID) => void) {
		if (!this.ownerIsPlayer && this.owner in Connections) fn(this.owner);
		for (const user of this.users) fn(user);
	}
	forNonOwners(fn: (uid: UserID) => void) {
		for (const uid of this.users) if (uid !== this.owner) fn(uid);
	}

	emitToConnectedNonOwners<T extends keyof ServerToClientEvents>(
		eventKey: T,
		...args: Parameters<ServerToClientEvents[T]>
	) {
		for (const uid of this.users)
			if (uid in Connections && uid !== this.owner) Connections[uid].socket.emit(eventKey, ...args);
	}
}

export function getPublicSessionData(s: Session) {
	return {
		id: s.id,
		isPrivate: false,
		description: s.description,
		players: s.users.size,
		maxPlayers: s.maxPlayers,
		cube: s.useCustomCardList,
		sets: s.setRestriction,
	};
}

export const Sessions: { [sid: string]: Session } = {};

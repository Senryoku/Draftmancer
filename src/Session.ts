import { assert } from "console";
import { UserID, SessionID } from "./IDTypes.js";
import { shuffleArray, getRandom, arrayIntersect, Options, pickRandom, random, sum, sumValues } from "./utils.js";
import { Connections, getPickedCardIds } from "./Connection.js";
import {
	CardID,
	Card,
	UniqueCard,
	UniqueCardID,
	DeckBasicLands,
	OnPickDraftEffect,
	UsableDraftEffect,
	OptionalOnPickDraftEffect,
	UniqueCardState,
	hasEffect,
	ParameterizedDraftEffectType,
} from "./CardTypes.js";
import {
	Cards,
	getUnique,
	BoosterCardsBySet,
	CardsBySet,
	MTGACardIDs,
	getCard,
	DefaultMaxDuplicates,
	hasMythics,
} from "./Cards.js";
import { fallbackToSimpleBots, isBot } from "./Bot.js";
import { MTGDraftBotParameters } from "./bots/ExternalBotInterface.js";
import { computeHashes } from "./DeckHashes.js";
import { SpecialLandSlots } from "./LandSlot.js";
import {
	BoosterFactory,
	SetSpecificFactories,
	DefaultBoosterTargets,
	IBoosterFactory,
	getBoosterFactory,
} from "./BoosterFactory.js";
import { isPaperBoosterFactoryAvailable, getPaperBoosterFactory } from "./PaperBoosterFactory.js";

import {
	isMessageError,
	isSocketError,
	Message,
	MessageError,
	SocketAck,
	SocketError,
	ToastMessage,
} from "./Message.js";
import { InactiveSessions, logSession } from "./Persistence.js";
import { sendDecksToCubeArtisan } from "./BotTrainingAPI.js";
import { IBracket, SingleBracket, TeamBracket, SwissBracket, DoubleBracket, BracketType } from "./Brackets.js";
import { CustomCardList, getSheetCardIDs } from "./CustomCardList.js";
import { generateBoosterFromCustomCardList, generateCustomGetCardFunction } from "./CustomCardListUtils.js";
import { DraftLog, DraftPick, GridDraftPick } from "./DraftLog.js";
import {
	genJHHPackChoices,
	genJumpInPackChoices,
	genSuperJumpPackChoices,
	JumpInSets,
	Jumpstart2022Boosters,
	Jumpstart2025Boosters,
	JumpstartBoosters,
} from "./Jumpstart.js";
import { IDraftState } from "./IDraftState.js";
import { MinesweeperCellState } from "./MinesweeperDraftTypes.js";
import { MinesweeperDraftState, isMinesweeperDraftState } from "./MinesweeperDraft.js";
import { TeamSealedState, isTeamSealedState } from "./TeamSealed.js";
import { GridDraftState, isGridDraftState } from "./GridDraft.js";
import { DraftState, isDraftState } from "./DraftState.js";
import { RochesterDraftState, isRochesterDraftState } from "./RochesterDraft.js";
import { WinstonDraftState, isWinstonDraftState } from "./WinstonDraft.js";
import { ServerToClientEvents } from "./SocketType";
import { Constants, EnglishBasicLandNames } from "./Constants.js";
import { SessionsSettingsProps } from "./Session/SessionProps.js";
import { DistributionMode, DraftLogRecipients, DisconnectedUser, UserData } from "./Session/SessionTypes.js";
import { IIndexable, SetCode } from "./Types.js";
import { isRotisserieDraftState, RotisserieDraftStartOptions, RotisserieDraftState } from "./RotisserieDraft.js";
import { parseLine } from "./parseCardList.js";
import { WinchesterDraftState, isWinchesterDraftState } from "./WinchesterDraft.js";
import { HousmanDraftState, isHousmanDraftState } from "./HousmanDraft.js";
import { SolomonDraftState, isSolomonDraftState } from "./SolomonDraft.js";
import { isSomeEnum } from "./TypeChecks.js";
import { askColors, choosePlayer } from "./Conspiracy.js";
import { InProduction, InTesting, TestingOnly } from "./Context.js";

import { MatchResults, EventCompleted, Result } from "./MTGOAPI.js";
import { sendDraftLogToCubeCobra } from "./cubeCobraIntegration.js";
import { isSilentAuctionDraftState, SilentAuctionDraftState } from "./SilentAuctionDraft.js";
import { Tiebreaker } from "./SilentAuctionDraftTiebreakers.js";
import { CardPool, SlotedCardPool } from "./CardPool.js";

// Tournament timer depending on the number of remaining cards in a pack.
const TournamentTimer = [
	0,
	5, // 1 card remaining. Should be immediate per the rules, but give it some time for a better user experience.
	5,
	5,
	5,
	10, // 5 cards remaining
	10,
	15,
	20,
	20,
	25,
	25,
	30,
	35,
	40, // 14 cards remaining, and more
];

// @return array of cards with the 5 original basic lands removed (does not remove Wastes, Basic Snow Lands, etc)
function removeBasics(cards: UniqueCard[]): UniqueCard[] {
	return cards.filter((card) => !EnglishBasicLandNames.includes(card.name));
}

const StableLogTimeout = 5 * 60 * 1000; // ms

export class Session implements IIndexable {
	id: SessionID;
	owner?: UserID;
	readonly managed: boolean = false;
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
	tournamentTimer: boolean = false; // Stricter timer used for tournaments, see https://blogs.magicjudges.org/rules/mtr-appendix-b/.
	reviewTimer: number = 0; // A value of 0 will deactivate the review phase.
	hidePicks: boolean = false; // Hide picks while drafting (outside of the review phase between packs). See https://blogs.magicjudges.org/rules/mtr7-7/
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
		sheets: {},
		layouts: false,
		customCards: null,
	};
	customCardListWithReplacement: boolean = false;
	customCardListDuplicateProtection: boolean = true;
	sendResultsToCubeCobra: boolean = true; // Allow opting-out of sending results to Cube Cobra when importing a cube via Draftmancer UI.
	distributionMode: DistributionMode = "regular"; // Specifies how boosters are distributed when using boosters from different sets (see customBoosters)
	customBoosters: Array<string> = ["", "", ""]; // Specify a set for an individual booster (Draft Only)
	doubleMastersMode: boolean = false; // Apply the pickedCardsPerRound rule only for the first pick then revert to one.
	pickedCardsPerRound: number = 1;
	burnedCardsPerRound: number = 0;
	discardRemainingCardsAt: number = 0;
	personalLogs: boolean = true;
	draftLogRecipients: DraftLogRecipients = "everyone";
	draftLogUnlockTimer: number = 0; // In minutes; Zero to disable.
	bracketLocked: boolean = false; // If set, only the owner can edit the results.
	bracket?: IBracket = undefined;

	// Draft state
	drafting: boolean = false;
	draftState?: IDraftState = undefined;
	draftLog?: DraftLog;
	disconnectedUsers: { [uid: UserID]: DisconnectedUser } = {};
	draftPaused: boolean = false;

	stableLogTimeout?: NodeJS.Timeout = undefined; // Timeout for sending final logs to Cube Cobra/CubeArtisan.

	lastTakeOverRequest: number = 0;

	constructor(
		id: SessionID,
		owner: UserID | undefined,
		options: { managed?: boolean } & Record<keyof typeof SessionsSettingsProps, unknown> = {}
	) {
		this.id = id;
		this.owner = owner;
		if (options.managed) this.managed = options.managed;

		// Validate and set session settings
		for (const p in options)
			if (p in SessionsSettingsProps && SessionsSettingsProps[p](options[p]))
				(this as IIndexable)[p] = options[p];
	}

	// Expected to be called before disposing of a Session.
	beforeDelete() {
		// If we had a pending onStableLog, cancel the timeout and execute it immediately.
		if (this.stableLogTimeout) {
			clearTimeout(this.stableLogTimeout);
			this.onStableLog();
		}
		if (isDraftState(this.draftState) && this.draftState.pendingTimeout)
			clearTimeout(this.draftState.pendingTimeout);
		if (this.bracket?.MTGOSynced)
			this.bracket.players.forEach((p) => {
				if (p) MatchResults.unsubscribe(p!.userName);
			});
	}

	addUser(userID: UserID) {
		if (this.users.has(userID)) console.error(`Session::addUser: this.users.has(${userID})`);

		Connections[userID].sessionID = this.id;
		this.users.add(userID);
		if (this.userOrder.indexOf(userID) < 0)
			this.userOrder.splice(Math.floor(Math.random() * (this.userOrder.length + 1)), 0, userID);
		this.notifyUserChange();
		this.syncSessionOptions(userID);
	}

	setSessionOwner(newOwnerID: UserID) {
		if (newOwnerID === this.owner || !this.users.has(newOwnerID)) return;

		if (!this.ownerIsPlayer) {
			// Prevent changing owner during drafting if owner is not playing
			if (this.drafting) return;

			const previousOwnerID = this.owner;
			if (!previousOwnerID) return;
			this.users.delete(newOwnerID);
			this.owner = newOwnerID;
			this.addUser(previousOwnerID);
		} else {
			this.owner = newOwnerID;
		}
		this.emitToConnectedUsers(
			"sessionOwner",
			this.owner,
			this.owner && this.owner in Connections ? Connections[this.owner].userName : null
		);
	}

	async voteForTakeover(userID: UserID): Promise<SocketAck> {
		if (this.managed || !this.owner) return new SocketError("Unavailable for managed sessions.");
		if (this.drafting) return new SocketError("Can't request a takeover during drafting.");
		if (userID === this.owner) return new SocketError("Invalid UserID", "You're already the owner.");
		if (this.users.size < 5)
			return new SocketError("Not enough players", "Takeover request are only available for 5 players and more.");
		if (!this.users.has(userID)) return new SocketError("Invalid UserID.");
		const cooldownInMinutes = 2;
		if (Date.now() - this.lastTakeOverRequest < cooldownInMinutes * 60 * 1000)
			return new SocketError(
				"Not available",
				`You can request a takeover at most every ${cooldownInMinutes} minutes. Please wait ${Math.round(
					cooldownInMinutes * 60 - (Date.now() - this.lastTakeOverRequest) / 1000
				)} seconds.`
			);
		this.lastTakeOverRequest = Date.now();
		const userName = Connections[userID].userName;
		const users = [...this.users].filter((uid) => uid !== userID && uid !== this.owner);
		const promises: Promise<boolean | null>[] = [];
		for (const uid of users)
			promises.push(
				new Promise((resolve) =>
					Connections[uid].socket.timeout(30 * 1000).emit("takeoverVote", userName, (err, r) => {
						if (err) resolve(null);
						else resolve(r);
					})
				)
			);
		const responses = await Promise.all(promises);
		if (responses.some((r) => r === false))
			return new SocketError(
				`Takeover request refused (${responses.reduce((acc, curr) => acc + (curr === false ? 0 : 1), 0)}/${
					responses.length
				}).`
			);

		this.setSessionOwner(userID);

		return new SocketAck();
	}

	getDisconnectedUserData(userID: UserID) {
		return {
			userName: Connections[userID].userName,
			pickedCards: Connections[userID].pickedCards,
		};
	}

	broadcastDisconnectedUsers() {
		const disconnectedUsersData: { [uid: string]: { userName: string } } = {};
		for (const uid in this.disconnectedUsers)
			disconnectedUsersData[uid] = { userName: this.disconnectedUsers[uid].userName };
		this.emitToConnectedUsers("userDisconnected", {
			owner: this.owner,
			disconnectedUsers: disconnectedUsersData,
		});
	}

	remUser(userID: UserID) {
		// Nothing to do if the user wasn't playing
		if (userID === this.owner && !this.ownerIsPlayer) return;

		this.users.delete(userID);

		// User was the owner of the session, transfer ownership to the first available users.
		if (this.owner === userID) this.owner = this.users.values().next().value;

		if (this.drafting) {
			if (this.draftState instanceof DraftState && !this.managed) this.stopCountdowns();
			if (this.managed) {
				this.stopCountdown(userID);
				// If user is still disconnected in 10sec, replace them by a bot.
				setTimeout(() => {
					if (
						!this.managed ||
						!(this.draftState instanceof DraftState) ||
						!this.isDisconnected(userID) ||
						this.disconnectedUsers[userID].replaced
					)
						return;
					this.disconnectedUsers[userID].replaced = true;
					this.startBotPickChain(userID);
				}, 10000);
			}
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

		if (cardList.settings?.withReplacement !== undefined)
			this.customCardListWithReplacement = cardList.settings.withReplacement;
		if (cardList.settings?.duplicateProtection !== undefined)
			this.customCardListDuplicateProtection = cardList.settings.duplicateProtection;
		if (cardList.settings?.boostersPerPlayer !== undefined)
			this.boostersPerPlayer = cardList.settings.boostersPerPlayer;
		if (cardList.settings?.colorBalance !== undefined) this.colorBalance = cardList.settings.colorBalance;

		this.emitToConnectedUsers("sessionOptions", {
			useCustomCardList: this.useCustomCardList,
			customCardList: this.customCardList,
			customCardListWithReplacement: this.customCardListWithReplacement,
			customCardListDuplicateProtection: this.customCardListDuplicateProtection,
			boostersPerPlayer: this.boostersPerPlayer,
			colorBalance: this.colorBalance,
		});
	}

	setTeamDraft(teamDraft: boolean) {
		if (this.teamDraft !== teamDraft) {
			this.teamDraft = teamDraft;
			if (teamDraft) {
				this.bots = 0;
			}

			this.emitToConnectedUsers("sessionOptions", {
				teamDraft: this.teamDraft,
				bots: this.bots,
			});
		}
	}

	setDisableBotSuggestions(disableBotSuggestions: boolean) {
		if (this.disableBotSuggestions !== disableBotSuggestions) {
			this.disableBotSuggestions = disableBotSuggestions;
			this.emitToConnectedUsers("sessionOptions", { disableBotSuggestions: this.disableBotSuggestions });
		}
	}

	setRandomizeSeatingOrder(randomizeSeatingOrder: boolean) {
		if (this.randomizeSeatingOrder !== randomizeSeatingOrder) {
			this.randomizeSeatingOrder = randomizeSeatingOrder;
			this.emitToConnectedUsers("sessionOptions", { randomizeSeatingOrder: this.randomizeSeatingOrder });
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
		this.emitToConnectedUsers("sessionOptions", { usePredeterminedBoosters: value });
	}

	setPredeterminedBoosters(text: string): SocketAck {
		const getCardFunc = this.getCustomGetCardFunction();
		const boosters: UniqueCard[][] = [];
		let booster: UniqueCard[] = [];
		const parseOptions: {
			fallbackToCardName: boolean;
			customCards?: { cards: Record<CardID, Card>; nameCache: Map<string, Card> };
		} = {
			fallbackToCardName: false,
		};
		if (this.customCardList?.customCards) {
			parseOptions.customCards = { cards: this.customCardList.customCards, nameCache: new Map() };
			for (const cid in this.customCardList.customCards)
				parseOptions.customCards.nameCache.set(
					this.customCardList.customCards[cid].name,
					this.customCardList.customCards[cid]
				);
		}
		for (let line of text.split("\n")) {
			line = line.trim();
			if (!line || line === "") {
				// Booster boundary, or just an empty line.
				if (booster.length > 0) {
					boosters.push(booster);
					booster = [];
				}
			} else {
				const result = parseLine(line, parseOptions);
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
			managed: this.managed,
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
		for (const userID of this.users)
			if (Connections[userID].useCollection && Connections[userID].collection.size > 0) return false;
		return true;
	}

	// Returns current card pool according to all session options (Collections, setRestrictions...)
	cardPool() {
		if (this.unrestrictedCardPool()) {
			const cardPool: CardPool = new CardPool();
			// Returns all cards if there's no set restriction
			if (this.setRestriction.length === 0) {
				for (const [cid, card] of Cards)
					if (card.in_booster) cardPool.set(cid, this.maxDuplicates?.[card.rarity] ?? DefaultMaxDuplicates);
			} else {
				// Use cache otherwise
				for (const set of this.setRestriction) {
					if (BoosterCardsBySet[set]) {
						for (const cid of BoosterCardsBySet[set])
							cardPool.set(cid, this.maxDuplicates?.[getCard(cid).rarity] ?? DefaultMaxDuplicates);
					} else console.error(`Session.cardPool error: '${set}' not in BoosterCardsBySet.`);
				}
			}
			return cardPool;
		}

		// Restricts collection according to this.setRestriction
		return this.restrictedCollection(this.setRestriction);
	}

	restrictedCollection(sets: Array<string>) {
		const cardPool = this.collection();

		const restricted: CardPool = new CardPool();
		if (sets && sets.length > 0) {
			for (const s of sets)
				if (s in CardsBySet)
					for (const cid of CardsBySet[s].filter((cid) => cardPool.has(cid)))
						restricted.set(cid, cardPool.get(cid)!);
				else console.error(`Session.restrictedCollection Error: '${s}' not in CardsBySet.`);
			return restricted;
		} else return cardPool;
	}

	// Compute user collections intersection (taking into account each user preferences)
	collection(inBoosterOnly = true): CardPool {
		const user_list = [...this.users];
		const collection: CardPool = new CardPool();

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
		const intersection = arrayIntersect(arrays);

		// Compute the minimum count of each remaining card
		for (const c of intersection) {
			collection.set(c, useCollection[0] ? Connections[user_list[0]].collection.get(c)! : 4);
			for (let i = 1; i < user_list.length; ++i)
				if (useCollection[i])
					collection.set(c, Math.min(collection.get(c)!, Connections[user_list[i]].collection.get(c)!));
		}
		return collection;
	}

	// Categorize card pool by rarity
	cardPoolByRarity(): SlotedCardPool {
		const cardPoolByRarity: SlotedCardPool = {
			common: new CardPool(),
			uncommon: new CardPool(),
			rare: new CardPool(),
			mythic: new CardPool(),
		};
		const cardPool = this.cardPool();
		for (const [cid, count] of cardPool) {
			const rarity = getCard(cid).rarity;
			if (!(rarity in cardPoolByRarity)) cardPoolByRarity[rarity] = new CardPool();
			cardPoolByRarity[rarity].set(cid, Math.min(count, this.maxDuplicates?.[rarity] ?? DefaultMaxDuplicates));
		}
		return cardPoolByRarity;
	}

	// Returns all cards from specified set categorized by rarity and set to maxDuplicates
	setByRarity(set: string) {
		const local: SlotedCardPool = {
			common: new CardPool(),
			uncommon: new CardPool(),
			rare: new CardPool(),
			mythic: new CardPool(),
		};
		for (const cid of BoosterCardsBySet[set]) {
			const rarity = getCard(cid).rarity;
			if (!(rarity in local)) local[rarity] = new CardPool();
			local[rarity].set(cid, this.maxDuplicates?.[rarity] ?? DefaultMaxDuplicates);
		}
		return local;
	}

	// @return Boosters generated following the session options, or MessageError on error.
	// Options object properties:
	//  - useCustomBoosters: Explicitly enables the use of the CustomBooster option (ignored otherwise)
	//      WARNING (FIXME?): boosterQuantity will be ignored if useCustomBoosters is set and we're not using a customCardList
	//  - playerCount: For use with useCustomBoosters or custom card list with predetermined layouts: Used to properly order boosters when they can be generated from different factories or layouts.
	//  - targets: Overrides session boosterContent setting
	//  - cardsPerBooster: Overrides session setting for cards per booster using custom card lists without custom slots
	//  - customBoosters & cardsPerPlayer: Overrides corresponding session settings (used for sealed)
	generateBoosters(
		boosterQuantity: number,
		options: {
			useCustomBoosters?: boolean;
			playerCount?: number;
			targets?: { [rarity: string]: number };
			cardsPerBooster?: number;
			customBoosters?: SetCode[];
			cardsPerPlayer?: number;
			removeFromCardPool?: CardID[]; // Use by LoreSeeker draft effect
		} = {}
	): UniqueCard[][] | MessageError {
		if (!options.cardsPerBooster) options.cardsPerBooster = this.cardsPerBooster;

		// Use pre-determined boosters; Make sure supplied booster are correct.
		if (this.usePredeterminedBoosters) {
			if (!this.predeterminedBoosters)
				return new MessageError(
					"No Provided Boosters",
					`Please upload your boosters in the session settings to use Pre-determined boosters.`
				);
			if (this.predeterminedBoosters.length !== boosterQuantity)
				return new MessageError(
					"Incorrect Provided Boosters",
					`Incorrect number of booster: Expected ${boosterQuantity}, got ${this.predeterminedBoosters.length}.`
				);
			return this.predeterminedBoosters;
		}
		const playerCount = options?.playerCount ?? 1; // This is only used for booster ordering, using 1 when it doesn't matter should be fine.

		if (this.useCustomCardList) {
			const cclOptions = Object.assign(
				{
					colorBalance: this.colorBalance,
					withReplacement: this.customCardListWithReplacement,
					duplicateProtection: this.customCardListDuplicateProtection,
					playerCount,
					removeFromCardPool: options?.removeFromCardPool,
				},
				options
			);
			return generateBoosterFromCustomCardList(this.customCardList, boosterQuantity, cclOptions);
		}
		// Standard draft boosters
		const targets = options?.targets ?? this.getBoosterContent();

		const boosterFactoryOptions = {
			foil: this.foil,
			colorBalance: this.colorBalance,
			mythicPromotion: this.mythicPromotion,
			maxDuplicates: this.maxDuplicates ?? undefined,
			session: this,
		};

		let defaultFactory: IBoosterFactory | null = null;

		const customBoosters = structuredClone(options?.customBoosters ?? this.customBoosters); // Use override value if provided via options
		const boosterSpecificRules = options.useCustomBoosters && customBoosters.some((v: string) => v !== "");
		const acceptPaperBoosterFactories =
			!this.useBoosterContent && !this.maxDuplicates && this.unrestrictedCardPool();
		// Prefer collation from taw/magic-sealed-data for these sets when possible
		const setsWithPreferredPaperFactory = [
			"dbl", // Our implementation uses cards from mid and vow, not dbl (which might be desirable... but it's less accurate)
		];
		const usePaperBoosterFactory = (set: string) => {
			return (
				acceptPaperBoosterFactories &&
				!(set in SetSpecificFactories && !setsWithPreferredPaperFactory.includes(set)) && // Prefer our implementation if available, barring some exceptions.
				(this.mythicPromotion || !hasMythics(set)) &&
				isPaperBoosterFactoryAvailable(set)
			);
		};

		// If the default rule will be used, initialize it
		if (!options?.useCustomBoosters || customBoosters.some((v: string) => v === "")) {
			// Use PaperBoosterFactory if possible (avoid computing cardPoolByRarity in this case)
			if (this.setRestriction.length === 1 && usePaperBoosterFactory(this.setRestriction[0])) {
				const paperBoosterFactory = getPaperBoosterFactory(this.setRestriction[0], boosterFactoryOptions);
				if (!paperBoosterFactory)
					return new MessageError(
						"Error generating boosters",
						`Could not find paper booster factory for ${this.setRestriction[0]}`
					);
				defaultFactory = paperBoosterFactory;
			} else {
				defaultFactory = getBoosterFactory(
					this.setRestriction.length === 1 ? this.setRestriction[0] : null,
					this.cardPoolByRarity(),
					this.setRestriction.length === 1 && this.setRestriction[0] in SpecialLandSlots
						? SpecialLandSlots[this.setRestriction[0]]
						: null,
					boosterFactoryOptions
				);
				// Make sure we have enough cards
				const defaultFactoryBoosterCount = boosterSpecificRules
					? customBoosters.filter((s) => s === "").length
					: boosterQuantity;
				for (const slot of ["common", "uncommon", "rare"]) {
					const cardCount = (defaultFactory as BoosterFactory).cardPool[slot].count();
					const cardTarget = targets[slot] * defaultFactoryBoosterCount;
					if (cardCount < cardTarget)
						return new MessageError(
							"Error generating boosters",
							`Not enough cards (${cardCount}/${cardTarget} ${slot}s) in collection.`
						);
				}
			}
		}

		const boosters: UniqueCard[][] = [];

		// Simple case, generate all boosters using the default rule
		if (!boosterSpecificRules) {
			for (let i = 0; i < boosterQuantity; ++i) {
				const booster = defaultFactory!.generateBooster(targets);
				if (isMessageError(booster)) return booster;
				boosters.push(booster);
			}
			return boosters;
		}

		// Booster specific rules
		const boosterFactories: IBoosterFactory[] = [];
		const usedSets: { [set: string]: IBoosterFactory } = {};

		let randomSetsPool: string[] = []; // 'Bag' to pick a random set from, avoiding duplicates until necessary
		const pickSet = () => {
			// Refill the bag with all possible sets
			if (randomSetsPool.length === 0)
				randomSetsPool = [...(this.setRestriction.length === 0 ? Constants.PrimarySets : this.setRestriction)];
			return pickRandom(randomSetsPool);
		};

		// "Random Set from Card Pool (Shared)", Pick random sets common accross all players
		for (let i = 0; i < customBoosters.length; ++i)
			if (customBoosters[i] === "randomShared") customBoosters[i] = pickSet();

		for (let i = 0; i < boosterQuantity; ++i) {
			let boosterSet = customBoosters[Math.floor(i / playerCount) % customBoosters.length];
			// No specific rules
			if (boosterSet === "") {
				boosterFactories.push(defaultFactory!);
				continue;
			}
			// "Random Set from Card Pool" in Chaos Draft
			if (boosterSet === "random") boosterSet = pickSet();

			// Compile necessary data for this set (Multiple boosters of the same set will share it)
			if (!usedSets[boosterSet]) {
				// Use the corresponding PaperBoosterFactories if possible (is available and of the excepted size when addLandSlot is needed)
				if (usePaperBoosterFactory(boosterSet)) {
					const paperBoosterFactory = getPaperBoosterFactory(boosterSet, boosterFactoryOptions);
					if (!paperBoosterFactory)
						return new MessageError(
							"Error generating boosters",
							`Could not find paper booster factory for ${this.setRestriction[0]}`
						);
					usedSets[boosterSet] = paperBoosterFactory;
				} else {
					usedSets[boosterSet] = getBoosterFactory(
						boosterSet,
						this.setByRarity(boosterSet),
						boosterSet in SpecialLandSlots ? SpecialLandSlots[boosterSet] : null,
						boosterFactoryOptions
					);
					// Check if we have enough card, considering maxDuplicate is a limiting factor
					const multiplier = customBoosters.reduce((a, v) => (v === boosterSet ? a + 1 : a), 0); // Note: This won't be accurate in the case of 'random' sets.
					for (const slot of ["common", "uncommon", "rare"]) {
						if (
							(usedSets[boosterSet] as BoosterFactory).cardPool[slot].count() <
							multiplier * playerCount * targets[slot]
						)
							return new MessageError(
								"Error generating boosters",
								`Not enough (${slot}) cards in card pool for individual booster restriction '${boosterSet}'. Please check the Max. Duplicates setting.`
							);
					}
				}
			}
			boosterFactories.push(usedSets[boosterSet]);
		}

		// Implements distribution mode 'shufflePlayerBoosters'
		if (this.distributionMode === "shufflePlayerBoosters") {
			const boosterPerPlayer = Math.floor(boosterFactories.length / playerCount);
			for (let offset = 0; offset < playerCount; ++offset) {
				const tmp = [];
				for (let i = 0; i < boosterPerPlayer; ++i) tmp.push(boosterFactories[offset + i * playerCount]);
				shuffleArray(tmp);
				for (let i = 0; i < boosterPerPlayer; ++i) boosterFactories[offset + i * playerCount] = tmp[i];
			}
		}

		// Generate Boosters
		for (const factory of boosterFactories) {
			const booster = factory.generateBooster(targets);
			if (isMessageError(booster)) return booster;
			boosters.push(booster);
		}

		if (this.distributionMode === "shuffleBoosterPool") shuffleArray(boosters);

		return boosters;
	}

	// Attempts to generate boosters until N cards are available in total.
	generateNCards(n: number, removeBasicLands: boolean = false): MessageError | UniqueCard[][] {
		// This is only an approximation, generateBoosters is quite complicated.
		const expectedCardsPerBooster = this.useCustomCardList
			? this.customCardList.layouts
				? Math.min(
						...Object.values(this.customCardList.layouts).map((layout) =>
							sum(layout.slots.map((s) => s.count))
						)
					)
				: this.cardsPerBooster
			: sumValues(this.getBoosterContent());

		let boosters = this.generateBoosters(Math.ceil(n / expectedCardsPerBooster), {
			useCustomBoosters: true,
			playerCount: this.users.size,
		});
		if (isMessageError(boosters)) return boosters;
		if (removeBasicLands) boosters = boosters.map(removeBasics);

		// generateBoosters has a lot of rules, boosters might not be all of the same size, ...etc
		// This means the number of cards actually generated by generateBoosters isn't trivially predictable.
		// Make sure we have enough cards by generating additional boosters as needed.
		// This might introduce duplicates, and won't perfectly follow the initial specifications
		// (restarting the generateBoosters algorithm), but this is a last resort.
		// We don't want to overshoot the initial number of generated boosters because it could prevent some cubes with
		// exactly the right number of cards (and no replacement) from being used.
		let cardCount = sum(boosters.map((b) => b.length));
		while (cardCount < n) {
			const boosterOrError = this.generateBoosters(1);
			if (isMessageError(boosterOrError)) return boosterOrError;
			// Avoid potential infinite loop. Shouldn't happen in pratice.
			if (boosterOrError.length === 0 || boosterOrError[0].length === 0)
				return new MessageError("Internal Error", "Couldn't generate enough boosters.");
			const booster = removeBasicLands ? removeBasics(boosterOrError[0]) : boosterOrError[0];
			boosters.push(booster);
			cardCount += booster.length;
		}
		return boosters;
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
		this.forUsers((uid) => {
			Connections[uid]?.socket.emit(
				"sessionOwner",
				this.owner,
				this.owner && this.owner in Connections ? Connections[this.owner].userName : null
			);
			Connections[uid]?.socket.emit("sessionUsers", userInfo);
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
	startWinstonDraft(boosterCount: number, pileCount: number, removeBasicLands: boolean): SocketAck {
		if (this.drafting) return new SocketError("Already drafting.");
		if (this.users.size < 2)
			return new SocketError(
				"Invalid number of players",
				`Winston Draft can only be played with 2 or more players. Bots are not supported!`
			);

		let boosters = this.generateBoosters(boosterCount, { useCustomBoosters: true });
		if (isMessageError(boosters)) return new SocketAck(boosters);
		if (removeBasicLands) boosters = boosters.map(removeBasics);

		this.drafting = true;
		this.disconnectedUsers = {};
		this.draftState = new WinstonDraftState(this.getSortedHumanPlayersIDs(), boosters, pileCount);
		const virtualPlayersData = this.getSortedHumanPlayerData();
		for (const uid of this.users) {
			Connections[uid].pickedCards = { main: [], side: [] };
			Connections[uid].socket.emit("sessionOptions", { virtualPlayersData });
			Connections[uid].socket.emit("startWinstonDraft", (this.draftState as WinstonDraftState).syncData(uid));
		}

		this.initLogs("Winston Draft", boosters);
		this.winstonNextRound();
		return new SocketAck();
	}

	endWinstonDraft() {
		if (!this.drafting || !isWinstonDraftState(this.draftState)) return;
		logSession("WinstonDraft", this);
		this.finalizeLogs();
		this.sendLogs();
		this.emitToConnectedUsers("winstonDraftEnd");
		this.cleanDraftState();
	}

	winstonNextRound() {
		const s = this.draftState;
		if (!this.drafting || !isWinstonDraftState(s)) return;
		++s.round;
		s.currentPile = 0;
		while (s.currentPile < s.piles.length && !s.piles[s.currentPile].length) ++s.currentPile;
		if (s.currentPile >= s.piles.length) {
			this.endWinstonDraft();
		} else {
			for (const uid of this.users) {
				Connections[uid].socket.emit("winstonDraftSync", s.syncData(uid));
				Connections[uid].socket.emit("winstonDraftNextRound", s.currentPlayer());
			}
		}
	}

	winstonSkipPile(num: number): SocketAck {
		const s = this.draftState;
		if (!this.drafting || !isWinstonDraftState(s)) return new SocketError("This session is not drafting.");
		if (s.currentPile !== num) return new SocketError("Invalid pile number.");

		// If the card pool is empty, make sure there is another pile to pick
		if (
			s.cardPool.length == 0 &&
			s.piles
				.map((p) => p.length)
				.slice(s.currentPile + 1)
				.every((c) => c === 0)
		)
			return new SocketError("This is your only choice!");

		// Add a new card to skipped pile. (Make sure there's enough cards for the player to draw if this is the last pile)
		if (s.cardPool.length > 1 || (s.currentPile < s.piles.length - 1 && s.cardPool.length > 0))
			s.piles[s.currentPile].push(s.cardPool.pop()!);
		// Give a random card from the card pool if this was the last pile
		if (s.currentPile === s.piles.length - 1) {
			const card = s.cardPool.pop()!;
			Connections[s.currentPlayer()].pickedCards.main.push(card);
			Connections[s.currentPlayer()].socket.emit("winstonDraftRandomCard", card);
			this.draftLog?.users[s.currentPlayer()].picks.push({
				randomCard: card.id,
				piles: [...s.piles.map((p) => p.slice(0, -1).map((c) => c.id))],
			});
			this.winstonNextRound();
		} else {
			++s.currentPile;
			if (s.piles[s.currentPile].length === 0) this.winstonSkipPile(s.currentPile);
			else for (const uid of this.users) Connections[uid].socket.emit("winstonDraftSync", s.syncData(uid));
		}

		return new SocketAck();
	}

	winstonTakePile(num: number): SocketAck {
		const s = this.draftState;
		if (!this.drafting || !isWinstonDraftState(s)) return new SocketError("This session is not drafting.");
		if (s.currentPile !== num) return new SocketError("Invalid pile number.");

		this.draftLog?.users[s.currentPlayer()].picks.push({
			pickedPile: s.currentPile,
			piles: [...s.piles.map((p, idx) => p.slice(0, idx < s.currentPile ? -1 : undefined).map((c) => c.id))],
		});
		Connections[s.currentPlayer()].pickedCards.main.push(...s.piles[s.currentPile]);
		if (s.cardPool.length > 0) s.piles[s.currentPile] = [s.cardPool.pop()!];
		else s.piles[s.currentPile] = [];
		this.winstonNextRound();

		return new SocketAck();
	}
	///////////////////// Winston Draft End //////////////////////

	startWinchesterDraft(boosterPerPlayer: number, removeBasicLands: boolean): SocketAck {
		if (this.drafting) return new SocketError("Already drafting.");
		if (this.users.size < 2)
			return new SocketError(
				"Invalid number of players",
				`Winchester Draft can only be played with at least 2 players. Bots are not supported!`
			);

		let boosters = this.generateBoosters(boosterPerPlayer * this.users.size, {
			useCustomBoosters: true,
			playerCount: this.users.size,
		});
		if (isMessageError(boosters)) return new SocketAck(boosters);
		if (removeBasicLands) boosters = boosters.map(removeBasics);

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
		if (!this.drafting || !isWinchesterDraftState(this.draftState)) return;
		logSession("WinchesterDraft", this);
		this.finalizeLogs();
		this.sendLogs();
		this.emitToConnectedUsers("winchesterDraftEnd");
		this.cleanDraftState();
	}

	winchesterDraftPick(pickedColumn: number): SocketAck {
		const s = this.draftState;
		if (!this.drafting || !isWinchesterDraftState(s)) return new SocketError("Not drafting.");
		if (pickedColumn < 0 || pickedColumn >= s.piles.length || s.piles[pickedColumn].length === 0)
			return new SocketError("Invalid column.");

		this.draftLog?.users[s.currentPlayer()].picks.push({
			pickedPile: pickedColumn,
			piles: [...s.piles.map((p) => p.map((c) => c.id))],
		});
		Connections[s.currentPlayer()].pickedCards.main = Connections[s.currentPlayer()].pickedCards.main.concat(
			s.piles[pickedColumn]
		);
		s.piles[pickedColumn] = [];
		s.refill();
		++s.round;

		if (s.done()) this.endWinchesterDraft();
		else this.emitToConnectedUsers("winchesterDraftSync", s.syncData());

		return new SocketAck();
	}

	startHousmanDraft(
		handSize: number = 5,
		revealedCardsCount: number = 9,
		exchangeCount: number = 3,
		roundCount: number = 9,
		removeBasicLands: boolean = true,
		turnOrder: "classic" | "snake" = "classic"
	): SocketAck {
		if (this.drafting) return new SocketError("Already drafting.");
		if (this.users.size < 2)
			return new SocketError(
				"Invalid number of players",
				`Housman Draft can only be played with at least 2 players. Bots are not supported!`
			);
		if (!this.ownerIsPlayer)
			return new SocketError(
				"Spectator mode isn't supported",
				`Spectator mode is not support for Housman Draft. 'Spectate as Session Owner' must be disabled.`
			);

		const cardsPerRound = handSize * this.users.size + revealedCardsCount;
		const boosters = this.generateNCards(cardsPerRound * roundCount, removeBasicLands);
		if (isMessageError(boosters)) return new SocketAck(boosters);

		const cardPool = boosters.flat();

		this.drafting = true;
		this.disconnectedUsers = {};
		this.draftState = new HousmanDraftState(
			this.getSortedHumanPlayersIDs(),
			cardPool,
			handSize,
			revealedCardsCount,
			exchangeCount,
			roundCount,
			turnOrder
		);
		const virtualPlayersData = this.getSortedHumanPlayerData();
		for (const uid of this.users) {
			Connections[uid].pickedCards = { main: [], side: [] };
			Connections[uid].socket.emit("sessionOptions", { virtualPlayersData });
			const syncData = (this.draftState as HousmanDraftState).syncData(uid);
			Connections[uid].socket.emit("startHousmanDraft", syncData);
		}

		this.initLogs("Housman Draft", boosters);
		return new SocketAck();
	}

	endHousmanDraft() {
		if (!this.drafting || !isHousmanDraftState(this.draftState)) return;
		logSession("HousmanDraft", this);
		this.sendLogs();
		this.emitToConnectedUsers("housmanDraftEnd");
		this.cleanDraftState();
	}

	housmanDraftPick(handIndex: number, revealedCardsIndex: number): SocketAck {
		const s = this.draftState;
		if (!this.drafting || !isHousmanDraftState(s)) return new SocketError("Not drafting.");
		if (
			handIndex < 0 ||
			handIndex >= s.handSize ||
			revealedCardsIndex < 0 ||
			revealedCardsIndex >= s.revealedCardsCount
		)
			return new SocketError(
				"Invalid parameters.",
				`handIndex (${handIndex}) should be between 0 and ${
					s.handSize - 1
				}, revealedCardsIndex (${revealedCardsIndex}) should be between 0 and ${s.revealedCardsCount - 1}`
			);

		const currentPlayer = s.currentPlayer();
		this.draftLog?.users[currentPlayer].picks.push({
			round: s.roundNum,
			exchange: s.exchangeNum,
			revealedCards: s.revealedCards.map((c) => c.id),
			hand: s.playerHands[currentPlayer].map((c) => c.id),
			picked: revealedCardsIndex,
			replaced: handIndex,
		});

		const nextRound = s.exchange(handIndex, revealedCardsIndex);

		this.emitToConnectedUsers(
			"housmanDraftExchange",
			revealedCardsIndex,
			s.revealedCards[revealedCardsIndex],
			s.currentPlayer(),
			s.exchangeNum
		);

		if (nextRound) {
			for (const uid of s.players) {
				this.draftLog?.users[uid].cards.push(...s.playerHands[uid].map((c) => c.id));
				Connections[uid].pickedCards.main = Connections[uid].pickedCards.main.concat(s.playerHands[uid]);
				Connections[uid].socket.emit("housmanDraftRoundEnd", s.playerHands[uid]);
			}

			if (s.nextRound()) this.endHousmanDraft();
			else this.forUsers((uid) => Connections[uid]?.socket.emit("housmanDraftSync", s.syncData(uid)));
		}

		return new SocketAck();
	}

	///////////////////// Grid Draft //////////////////////
	startGridDraft(gridCount: number, twoPicksPerGrid: boolean, regularBoosters: boolean): SocketAck {
		if (this.drafting) return new SocketError("Already drafting.");
		if (this.users.size < 2 || this.users.size > 4)
			return new SocketError("Invalid Number of Players", "Grid draft is only available for 2 to 4 players.");
		if (twoPicksPerGrid && this.users.size !== 2)
			return new SocketError("Invalid Setting", "'Two picks per grid' is only available for 2 players.");

		// Add 3 cards to each boosters when there are more than 2 players, or two picks per players: Booster will be refilled to 9 cards after the first pick.
		const cardsPerGrid = this.users.size > 2 || twoPicksPerGrid ? 12 : 9;

		const grids: UniqueCard[][] = [];

		if (regularBoosters) {
			const boosters = this.generateNCards(gridCount * cardsPerGrid, false);
			if (isMessageError(boosters)) return new SocketAck(boosters);

			// Turn the generated boosters into gridCount grids of cardsPerGrid cards.
			const cardPool = boosters.flat();
			shuffleArray(cardPool);
			for (let i = 0; i < gridCount; ++i) grids.push(cardPool.splice(0, cardsPerGrid));
		} else {
			// When using a custom card list with custom slots, boosters will be truncated to 9 cards by GridDraftState
			// Use boosterContent setting only if it is valid (adds up to 9 cards)
			const targetCardsPerBooster = Object.values(this.getBoosterContent()).reduce((val, acc) => val + acc, 0);

			const defaultTargets =
				cardsPerGrid === 12 ? { rare: 1, uncommon: 3, common: 8 } : { rare: 1, uncommon: 3, common: 5 };

			const boosters = this.generateBoosters(gridCount, {
				targets: targetCardsPerBooster === cardsPerGrid ? this.getBoosterContent() : defaultTargets,
				cardsPerBooster: cardsPerGrid,
				useCustomBoosters: true,
				playerCount: this.users.size,
			});
			if (isMessageError(boosters)) return new SocketAck(boosters);
			grids.push(...boosters);
		}

		this.drafting = true;
		this.disconnectedUsers = {};
		this.draftState = new GridDraftState(this.getSortedHumanPlayersIDs(), grids, twoPicksPerGrid);
		const s = this.draftState as GridDraftState;
		if (isMessageError(s.error)) {
			this.cleanDraftState();
			return new SocketAck(s.error);
		}

		const virtualPlayersData = this.getSortedHumanPlayerData();
		for (const user of this.users) {
			Connections[user].pickedCards = { main: [], side: [] };
			Connections[user].socket.emit("sessionOptions", { virtualPlayersData });
			Connections[user].socket.emit("startGridDraft", s.syncData());
		}

		this.initLogs("Grid Draft", grids);
		return new SocketAck();
	}

	endGridDraft() {
		if (!this.drafting || !isGridDraftState(this.draftState)) return;
		logSession("GridDraft", this);
		this.finalizeLogs();
		this.sendLogs();
		for (const user of this.users) Connections[user].socket.emit("gridDraftEnd");
		this.cleanDraftState();
	}

	gridDraftNextRound() {
		const s = this.draftState;
		if (!this.drafting || !isGridDraftState(s)) return;

		++s.round;
		const gridPick = s.round % (s.twoPicksPerGrid ? 2 * s.players.length : s.players.length);
		// Refill Booster after the first pick at 3-4 players, or if two picks per grid is enabled.
		if (s.boosters[0].length === 12 && gridPick === 1) {
			// Send the current state before re-filling for animation purposes.
			const syncData = s.syncData();
			syncData.currentPlayer = null; // Set current player to null as a flag to delay the display update
			this.emitToConnectedUsers("gridDraftNextRound", syncData);

			const additionalCards = s.boosters[0].slice(9);
			s.boosters[0] = s.boosters[0].slice(0, 9);
			for (let idx = 0; idx < s.boosters[0].length; ++idx)
				if (s.boosters[0][idx] === null) s.boosters[0][idx] = additionalCards.pop()!;
		}
		if (gridPick === 0) {
			// Share the last pick before advancing to the next booster.
			const syncData = s.syncData();
			syncData.currentPlayer = null; // Set current player to null as a flag to delay the display update
			this.emitToConnectedUsers("gridDraftNextRound", syncData);

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
		if (!this.drafting || !isGridDraftState(s)) return new SocketError("Not drafting");

		const log: GridDraftPick = { pick: [], booster: s.boosters[0].map((c) => (c ? c.id : null)) };

		const pickedCards: UniqueCard[] = [];
		for (let i = 0; i < 3; ++i) {
			//                       Column           Row
			const idx = choice < 3 ? 3 * i + choice : 3 * (choice - 3) + i;
			if (s.boosters[0][idx] !== null) {
				Connections[s.currentPlayer()].pickedCards.main.push(s.boosters[0][idx]!);
				pickedCards.push(s.boosters[0][idx]!);
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
			playerCount: this.users.size,
		});
		if (isMessageError(boosters)) return new SocketAck(boosters);

		this.drafting = true;
		this.disconnectedUsers = {};
		this.draftState = new RochesterDraftState(this.getSortedHumanPlayersIDs(), boosters);
		const virtualPlayersData = this.getSortedHumanPlayerData();
		const syncData = (this.draftState as RochesterDraftState).syncData();
		for (const user of this.users) {
			Connections[user].pickedCards = { main: [], side: [] };
			Connections[user].socket.emit("sessionOptions", { virtualPlayersData });
			Connections[user].socket.emit("startRochesterDraft", syncData);
		}

		this.initLogs("Rochester Draft", boosters);
		return new SocketAck();
	}

	endRochesterDraft(): void {
		const s = this.draftState;
		if (!this.drafting || !isRochesterDraftState(s)) return;
		logSession("RochesterDraft", this);
		for (const uid of this.users) Connections[uid].socket.emit("rochesterDraftEnd");
		this.finalizeLogs();
		this.sendLogs();
		this.cleanDraftState();
	}

	rochesterDraftNextRound(): void {
		const s = this.draftState;
		if (!this.drafting || !isRochesterDraftState(s)) return;
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
		const s = this.draftState;
		if (!this.drafting || !isRochesterDraftState(s)) return false;

		Connections[s.currentPlayer()].pickedCards.main.push(s.boosters[0][idx]);

		this.draftLog?.users[s.currentPlayer()].picks.push({
			packNum: s.boosterNumber,
			pickNum: s.pickNumber,
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
				for (const slot of Object.values(this.customCardList.sheets)) {
					cardPool.push(...getSheetCardIDs(slot));
				}
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
		const virtualPlayersData = this.getSortedHumanPlayerData();
		for (const user of this.users) {
			Connections[user].pickedCards = { main: [], side: [] };
			Connections[user].socket.emit("sessionOptions", { virtualPlayersData });
			Connections[user].socket.emit("startRotisserieDraft", this.draftState.syncData(user));
		}

		const log = this.initLogs("Rotisserie Draft", []);
		const getCardFunc = this.getCustomGetCardFunction();
		for (const card of cards) log.carddata[card.id] = getCardFunc(card.id);

		return new SocketAck();
	}

	endRotisserieDraft(): SocketAck {
		const s = this.draftState;
		if (!this.drafting || !isRotisserieDraftState(s))
			return new SocketError("No active Rotisserie Draft in this session.");

		logSession("RotisserieDraft", this);
		for (const uid of this.users) Connections[uid].socket.emit("rotisserieDraftEnd");
		this.finalizeLogs();
		this.sendLogs();
		this.cleanDraftState();
		return new SocketAck();
	}

	rotisserieDraftPick(uniqueID: UniqueCardID): SocketAck {
		const s = this.draftState;
		if (!this.drafting || !isRotisserieDraftState(s))
			return new SocketError("No Rotisserie Draft in progress in this session.");

		const card = s.pick(uniqueID);
		if (isSocketError(card)) return card;

		Connections[card.owner].pickedCards.main.push(card);

		this.draftLog?.users[card.owner].picks.push({
			pick: [0],
			booster: [card.id],
		});

		if (s.done()) {
			this.endRotisserieDraft();
		} else {
			this.emitToConnectedUsers("rotisserieDraftUpdateState", card.uniqueID, card.owner, s.currentPlayer());
		}
		return new SocketAck();
	}
	///////////////////// Rotisserie Draft End //////////////////////

	startMinesweeperDraft(
		gridCount: number,
		gridWidth: number,
		gridHeight: number,
		picksPerGrid: number,
		revealCenter: boolean,
		revealCorners: boolean,
		revealBorders: boolean
	): SocketAck {
		if (this.users.size <= 1)
			return new SocketError(
				"Unsufficient number of players",
				"Minesweeper draft necessitates at least two players. Bots are not supported."
			);
		if (this.randomizeSeatingOrder) this.randomizeSeating();

		const boosters = this.generateNCards(gridCount * gridWidth * gridHeight, true);
		if (isMessageError(boosters)) return new SocketAck(boosters);

		const cardPool = boosters.flat();
		const grids: UniqueCard[][] = [];
		for (let i = 0; i < gridCount; i++) {
			grids.push(cardPool.splice(0, gridWidth * gridHeight));
			shuffleArray(grids[i]);
		}

		this.drafting = true;
		this.initLogs("Minesweeper Draft", boosters);

		this.disconnectedUsers = {};
		this.draftState = new MinesweeperDraftState(
			this.getSortedHumanPlayersIDs(),
			grids,
			gridWidth,
			gridHeight,
			picksPerGrid,
			revealCenter,
			revealCorners,
			revealBorders
		);
		const virtualPlayersData = this.getSortedHumanPlayerData();
		const syncData = (this.draftState as MinesweeperDraftState).syncData();
		for (const user of this.users) {
			Connections[user].pickedCards = { main: [], side: [] };
			Connections[user].socket.emit("sessionOptions", { virtualPlayersData });
			Connections[user].socket.emit("startMinesweeperDraft", syncData);
		}

		return new SocketAck();
	}

	minesweeperDraftPick(userID: UserID, row: number, col: number): SocketAck {
		const s = this.draftState;
		if (!this.drafting || !isMinesweeperDraftState(s))
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
			currentGridState.currentPlayer = "";
			this.emitToConnectedUsers("minesweeperDraftUpdateState", currentGridState);

			if (s.done()) {
				this.endMinesweeperDraft();
			} else {
				// Send the next grid immediately, front-end will handle the animation
				const nextGridState = s.syncData();
				this.emitToConnectedUsers("minesweeperDraftState", nextGridState);
			}
		} else {
			this.emitToConnectedUsers("minesweeperDraftUpdateState", currentGridState);
		}

		return new SocketAck();
	}

	endMinesweeperDraft(options: { immediate?: boolean } = {}): void {
		const s = this.draftState;
		if (!this.drafting || !isMinesweeperDraftState(s)) return;
		logSession("MinesweeperDraft", this);
		for (const uid of this.users) Connections[uid].socket.emit("minesweeperDraftEnd", options);
		this.finalizeLogs();
		this.sendLogs();
		this.cleanDraftState();
	}

	startSolomonDraft(cardCount: number = 8, roundCount: number = 10, removeBasicLands: boolean = true): SocketAck {
		if (this.drafting) return new SocketError("Already drafting.");
		if (this.users.size !== 2)
			return new SocketError(
				"Invalid number of players",
				`Solomon Draft can only be played with exactly 2 players. Bots are not supported!`
			);
		if (!this.ownerIsPlayer)
			return new SocketError(
				"Spectator mode isn't supported",
				`Spectator mode is not support for Solomon Draft. 'Spectate as Session Owner' must be disabled.`
			);
		if (this.randomizeSeatingOrder) this.randomizeSeating();

		const boosters = this.generateNCards(cardCount * roundCount, removeBasicLands);
		if (isMessageError(boosters)) return new SocketAck(boosters);

		const cardPool = boosters.flat();

		this.drafting = true;
		this.disconnectedUsers = {};
		const playerIds = this.getSortedHumanPlayersIDs();
		const s = (this.draftState = new SolomonDraftState([playerIds[0], playerIds[1]], cardCount, roundCount));
		s.init(cardPool);
		//const playerData = this.getSortedHumanPlayerData();
		const syncData = s.syncData();
		for (const uid of this.users) {
			Connections[uid].pickedCards = { main: [], side: [] };
			/*
			Connections[uid].socket.emit("sessionOptions", {
				virtualPlayersData: playerData,
			});
			*/
			Connections[uid].socket.emit("startSolomonDraft", syncData);
		}

		this.initLogs("Solomon Draft", boosters);
		return new SocketAck();
	}

	solomonDraftOrganize(piles: [UniqueCardID[], UniqueCardID[]]): SocketAck {
		const s = this.draftState;
		if (!this.drafting || !isSolomonDraftState(s))
			return new SocketError("Not Playing", "There's no Solomon Draft running on this session.");

		const r = s.reorganize(piles);
		if (isMessageError(r)) return new SocketAck(r);

		for (const uid of s.players) Connections[uid]?.socket.emit("solomonDraftUpdatePiles", piles);

		return new SocketAck();
	}

	solomonDraftConfirmPiles(): SocketAck {
		const s = this.draftState;
		if (!this.drafting || !isSolomonDraftState(s))
			return new SocketError("Not Playing", "There's no Solomon Draft running on this session.");

		const r = s.confirmPiles();
		if (isMessageError(r)) return new SocketAck(r);

		const syncData = s.syncData();
		for (const uid of s.players) Connections[uid]?.socket.emit("solomonDraftState", syncData);

		return new SocketAck();
	}

	solomonDraftPick(pileIdx: 0 | 1): SocketAck {
		const s = this.draftState;
		if (!this.drafting || !isSolomonDraftState(s))
			return new SocketError("Not Playing", "There's no Solomon Draft running on this session.");

		const r = s.pick(pileIdx);
		if (isMessageError(r)) return new SocketAck(r);

		if (this.draftLog) {
			let pickedPile = 0;
			const piles = Object.values(r).map((p) => p.map((c) => c.id));
			for (const uid in r) {
				this.draftLog.users[uid].picks.push({
					pickedPile,
					piles,
				});
				++pickedPile;
			}
		}

		for (const uid of s.players) {
			Connections[uid]?.pickedCards.main.push(...r[uid]);
			Connections[uid]?.socket.emit("solomonDraftPicked", pileIdx);
		}

		if (s.done()) return this.endSolomonDraft();

		const syncData = s.syncData();
		for (const uid of s.players) Connections[uid]?.socket.emit("solomonDraftState", syncData);

		return new SocketAck();
	}

	endSolomonDraft(immediate?: boolean): SocketAck {
		const s = this.draftState;
		if (!this.drafting || !isSolomonDraftState(s))
			return new SocketError("Not Playing", "There's no Solomon Draft running on this session.");

		logSession("SolomonDraft", this);
		for (const uid of s.players) Connections[uid]?.socket.emit("solomonDraftEnd", immediate);
		this.finalizeLogs();
		this.sendLogs();
		this.cleanDraftState();

		return new SocketAck();
	}

	startSilentAuctionDraft(
		boosterCount: number,
		options: {
			startingFunds: number;
			pricePaid: "first" | "second";
			reservePrice: number;
			tiebreakers: Tiebreaker[];
		}
	): SocketAck {
		this.drafting = true;
		this.disconnectedUsers = {};
		const playerIds = this.getSortedHumanPlayersIDs();
		const boosters = this.generateBoosters(boosterCount, {
			useCustomBoosters: true,
		});
		if (isMessageError(boosters)) return new SocketAck(boosters);
		const s = (this.draftState = new SilentAuctionDraftState(playerIds, structuredClone(boosters), options));
		const syncData = s.syncData();
		for (const uid of this.users) {
			Connections[uid].pickedCards = { main: [], side: [] };
			Connections[uid].socket.emit("startSilentAuctionDraft", syncData);
		}
		this.initLogs("Silent Auction Draft", boosters);
		return new SocketAck();
	}

	silentAuctionDraftBid(userID: UserID, bids: number[]): SocketAck {
		if (!this.drafting || !isSilentAuctionDraftState(this.draftState))
			return new SocketError("Not Playing", "There's no Silent Auction Draft running on this session.");
		const roundEnd = this.draftState.bid(userID, bids);
		if (isMessageError(roundEnd)) return new SocketAck(roundEnd);
		for (const p of this.draftState.players)
			Connections[p.userID]?.socket.emit("silentAuctionDraftNotifyBid", userID);
		if (roundEnd) {
			const prevState = structuredClone(this.draftState.syncData());
			const results = this.draftState.solveBids();

			if (this.draftLog) {
				if (!this.draftLog.silentAuction) this.draftLog.silentAuction = [];
				this.draftLog.silentAuction.push({ state: prevState, results });
			}

			const cardsToSend: Record<UserID, UniqueCard[]> = {};
			for (let i = 0; i < results.length; i++) {
				if (results[i].winner) {
					const card = this.draftState.currentPack![i];
					if (!cardsToSend[results[i].winner!]) cardsToSend[results[i].winner!] = [card];
					else cardsToSend[results[i].winner!].push(card);
				}
			}
			for (const p of this.draftState.players) {
				if (cardsToSend[p.userID] && cardsToSend[p.userID].length > 0) {
					Connections[p.userID]?.pickedCards.main.push(...cardsToSend[p.userID]!);
					Connections[p.userID]?.socket.emit("addCards", "You won: ", cardsToSend[p.userID]);
				}
			}

			for (const p of this.draftState.players)
				Connections[p.userID]?.socket.emit("silentAuctionDraftResults", results);
			if (this.draftState.nextRound()) {
				this.endSilentAuctionDraft();
			} else {
				const syncState = this.draftState.syncData();
				for (const p of this.draftState.players)
					Connections[p.userID]?.socket.emit("silentAuctionDraftSync", syncState);
			}
		}
		return new SocketAck();
	}

	endSilentAuctionDraft(): SocketAck {
		if (!this.drafting || !isSilentAuctionDraftState(this.draftState))
			return new SocketError("Not Playing", "There's no Silent Auction Draft running on this session.");
		logSession("SilentAuctionDraft", this);
		for (const p of this.draftState.players) Connections[p.userID]?.socket.emit("silentAuctionDraftEnd");
		this.finalizeLogs();
		this.sendLogs();
		this.cleanDraftState();
		return new SocketAck();
	}

	///////////////////// Traditional Draft Methods //////////////////////
	startDraft(overrides?: {
		boostersPerPlayer?: number;
		discardRemainingCardsAt?: number;
		doubleMastersMode?: boolean;
		pickedCardsPerRound?: number;
		burnedCardsPerRound?: number;
	}): SocketAck {
		if (this.drafting) return new SocketError("Already drafting.");

		if (this.randomizeSeatingOrder) this.randomizeSeating();

		const boosterPerPlayer = overrides?.boostersPerPlayer ?? this.boostersPerPlayer;
		const discardRemainingCardsAt = overrides?.discardRemainingCardsAt ?? this.discardRemainingCardsAt;
		const doubleMastersMode = overrides?.doubleMastersMode ?? this.doubleMastersMode;
		const pickedCardsPerRound = overrides?.pickedCardsPerRound ?? this.pickedCardsPerRound;
		const burnedCardsPerRound = overrides?.burnedCardsPerRound ?? this.burnedCardsPerRound;

		const boosterQuantity = (this.users.size + this.bots) * boosterPerPlayer;
		console.log(`Session ${this.id}: Starting draft! (${this.users.size} players)`);

		const boosters = this.generateBoosters(boosterQuantity, {
			useCustomBoosters: true,
			playerCount: this.getVirtualPlayersCount(),
		});
		if (isMessageError(boosters)) return new SocketAck(boosters);

		// Determine bot type

		const botParameters: MTGDraftBotParameters = {
			wantedModel: "prod",
		};
		// If we're only drafting an official set, check if we have a available specialized bot model of it.
		if (
			!this.usePredeterminedBoosters &&
			!this.useCustomCardList &&
			this.setRestriction.length === 1 &&
			boosterPerPlayer === 3 &&
			this.customBoosters.every((s) => s === "" || s === this.setRestriction[0])
		)
			botParameters.wantedModel = this.setRestriction[0];
		if (this.useCustomCardList && this.customCardList.settings?.botModel) {
			botParameters.wantedModel = this.customCardList.settings.botModel;
		}

		const customCards = this.useCustomCardList && this.customCardList.customCards !== null;
		const oracleIds = boosters.flat().map((card) => card.oracle_id);
		const simpleBots = fallbackToSimpleBots(customCards, [...new Set(oracleIds)], botParameters.wantedModel);

		const boosterSettings =
			this.useCustomCardList && this.customCardList.settings?.boosterSettings
				? this.customCardList.settings.boosterSettings.map((s) => ({
						discardRemainingCardsAt,
						...s,
					}))
				: [
						{
							discardRemainingCardsAt,
							picks: doubleMastersMode ? [pickedCardsPerRound, 1] : [pickedCardsPerRound],
							burns: [burnedCardsPerRound],
						},
					];

		this.draftState = new DraftState(boosters, this.getSortedHumanPlayersIDs(), {
			boosterSettings,
			simpleBots: simpleBots,
			botCount: this.bots,
			botParameters,
		});
		this.disconnectedUsers = {};
		this.drafting = true;

		this.initLogs("Draft", boosters);

		const virtualPlayerData = this.getSortedVirtualPlayerData();
		for (const uid of this.users) {
			Connections[uid].pickedCards = { main: [], side: [] };
			Connections[uid].socket.emit("startDraft", virtualPlayerData);
		}

		if (!this.ownerIsPlayer && this.owner && this.owner in Connections) {
			Connections[this.owner].socket.emit("startDraft", virtualPlayerData);
			// Update draft log for live display if owner is not playing
			if (this.shouldSendLiveUpdates())
				Connections[this.owner].socket.emit("draftLogLive", {
					log: this.draftLog,
				});
		}

		this.distributeBoosters();
		return new SocketAck();
	}

	// Pass a booster to the next player at the table
	passBooster(booster: Array<UniqueCard>, from: UserID | null, to: UserID) {
		const s = this.draftState;
		if (!isDraftState(s)) return;

		const canDiscard = from !== null;
		const statesToUpdate = from !== null ? [from] : [];

		// Booster is empty or the remaining cards have to be burned
		if (
			booster.length === 0 ||
			(canDiscard && booster.length <= Math.max(0, s.getBoosterSettings().discardRemainingCardsAt))
		) {
			// Don't re-insert it, and check for end of round
			this.checkDraftRoundEnd();
		} else {
			// Re-insert the booster back for the next player
			s.players[to].boosters.push(booster);
			statesToUpdate.push(to);

			// Player is currently randomly picking (Archdemon of Paliano effect), immediately pick at random.
			if (s.players[to].effect?.randomPicks !== undefined && s.players[to].effect!.randomPicks! > 0) {
				assert(
					s.players[to].boosters.length === 1,
					"Error: Randomly picking player shouldn't have boosters in waiting."
				);
				this.randomPick(to).then((picks) =>
					Connections[to]?.socket.emit("addCards", "You randomly picked:", picks)
				);
			} else {
				// Synchronize concerned users
				if (s.players[to].isBot || (this.isDisconnected(to) && this.disconnectedUsers[to].replaced)) {
					this.startBotPickChain(to);
				} else if (!this.isDisconnected(to)) {
					// This user was waiting for a booster
					if (s.players[to].boosters.length === 1) {
						this.sendDraftState(to);
						this.startCountdown(to);
						this.requestBotRecommendation(to);
					} else {
						// Only send the updated boosterCount (Nothing else should have changed.)
						Connections[to]?.socket.emit("draftState:boosterCount", s.syncData(to).boosterCount);
					}
				}
			}
		}

		// Send updated player states to all users
		const virtualPlayerDataUpdate: Record<UserID, Partial<UserData>> = {};
		for (const uid of statesToUpdate)
			virtualPlayerDataUpdate[uid] = { boosterCount: s.players[uid].boosters.length };
		this.emitToConnectedUsers("virtualPlayersDataUpdate", virtualPlayerDataUpdate);
	}

	// Pass the current booster without picking (Agent of Acquisitions; Leovold's Operative)
	async skipPick(userID: UserID) {
		const s = this.draftState;
		if (!this.drafting || !isDraftState(s)) return new SocketError("This session is not drafting.");
		if (!s.syncData(userID).skipPick) return new SocketError(`Why would you skip this pick?`);
		if (s.players[userID].boosters.length === 0) return new SocketError(`No booster to pass.`);

		let nextPlayer: UserID = s.nextPlayer(userID);
		// "Each player passes the last card from each booster pack to a player who drafted a card named Canal Dredger."
		if (s.players[userID].boosters[0].length === 1) {
			let playersWithCanalDredger = s.getPlayersWithCanalDredger();

			if (s.players[userID].effect?.skipUntilNextRound) {
				// Prevent passing the booster back to ourself, or we'd be stuck in an infinite loop :)
				// This is technically allowed by Canal Dredger rullings, so I don't know if preventing it completely is the best way to handle the situation, but it's better than a soft lock!
				playersWithCanalDredger = playersWithCanalDredger.filter((p) => p !== userID);
			}

			// NOTE: This await comes with the possibly of a re-entry before the state is updated.
			//       This is a problem, but I don't think it's worth preventing. It should not be possible in legitimate circumstances.
			if (playersWithCanalDredger.length > 0)
				nextPlayer = await choosePlayer(
					userID,
					`Choose a player with a Canal Dredger to pass '${s.players[userID].boosters[0][0].name}' to:`,
					playersWithCanalDredger
				);
		}

		++s.players[userID].pickNumber;
		if (s.players[userID].effect?.skipNPicks ?? 0 > 0) s.players[userID].effect!.skipNPicks!--;

		this.stopCountdown(userID);
		const booster = s.players[userID].boosters.splice(0, 1)[0];

		this.passBooster(booster, userID, nextPlayer);

		this.sendDraftState(userID);
		if (s.players[userID].boosters.length > 0) {
			this.startCountdown(userID);
			this.requestBotRecommendation(userID);
		}

		return new SocketAck();
	}

	// Used by the Archdemon of Paliano effect.
	async randomPick(userID: UserID): Promise<UniqueCard[]> {
		const s = this.draftState;
		if (!isDraftState(s)) return [];

		const booster = s.players[userID].boosters[0];
		const { picksThisRound, burnsThisRound } = s.picksAndBurnsThisRound(userID);

		const randomIndices = [...Array(booster.length).keys()];
		shuffleArray(randomIndices);
		const pickIndices: number[] = randomIndices.splice(0, picksThisRound);
		const burnIndices: number[] = randomIndices.splice(0, burnsThisRound);

		const picks = pickIndices.map((idx) => booster[idx]);

		s.players[userID].effect!.randomPicks = Math.max(
			0,
			s.players[userID].effect!.randomPicks! - pickIndices.length
		);
		await this.pickCard(userID, pickIndices, burnIndices);

		return picks;
	}

	async pickCard(
		userID: UserID,
		_pickedCards: Array<number>,
		_burnedCards: Array<number>,
		draftEffect?: { effect: UsableDraftEffect; cardID: UniqueCardID },
		optionalOnPickDraftEffect?: { effect: OptionalOnPickDraftEffect; cardID: UniqueCardID }
	) {
		const s = this.draftState;
		if (!this.drafting || !isDraftState(s)) return new SocketError("This session is not drafting.");

		let pickedCards = _pickedCards;
		let burnedCards = _burnedCards;

		const reportError = (err: string) => {
			//console.error(err);
			return new SocketError(err);
		};

		if (s.players[userID].boosters.length === 0)
			return reportError(`You already picked! Wait for the other players.`);
		if (s.syncData(userID).skipPick) return reportError(`You must skip this pick!`);

		const booster = s.players[userID].boosters[0];
		let { picksThisRound, burnsThisRound } = s.picksAndBurnsThisRound(userID);

		const updatedCardStates: { cardID: UniqueCardID; state: UniqueCardState }[] = [];
		// Conspiracy draft matter cards
		const applyDraftEffects: (() => void)[] = []; // Delay effects after we're sure the pick is valid.
		if (draftEffect) {
			let cardInMain = true;
			let cardOrNull = Connections[userID].pickedCards.main.find((c) => c.uniqueID === draftEffect.cardID);
			if (!cardOrNull) {
				cardInMain = false;
				cardOrNull = Connections[userID].pickedCards.side.find((c) => c.uniqueID === draftEffect.cardID);
			}
			if (!cardOrNull) return reportError("Invalid UniqueCardID.");
			const card = cardOrNull;
			if (!hasEffect(card, draftEffect.effect))
				return reportError(`Invalid request: '${card.name}' do not have effect '${draftEffect.effect}'.`);
			if (hasEffect(card, OnPickDraftEffect.FaceUp) && !card.state?.faceUp)
				return reportError("Already used this effect (Card is face down).");

			const notifyDraftEffectUse = () => {
				try {
					if (hasEffect(card, OnPickDraftEffect.FaceUp)) {
						const str = `${Connections[userID].userName} used the effect of '${card.name}'.`;
						const msg = new ToastMessage(str);
						this.forUsers((uid) => {
							if (uid !== userID) Connections[uid]?.socket.emit("message", msg, true);
						});
					}
				} catch (e) {
					console.error("Error notifying of draft effect use: ", e);
				}
			};

			switch (draftEffect.effect) {
				// Draft Cogwork Librarian face up.
				// As you draft a card, you may draft an additional card from that booster pack. If you do, put Cogwork Librarian into that booster pack.
				case UsableDraftEffect.CogworkLibrarian: {
					if (picksThisRound >= booster.length)
						return reportError("You can't use a Cogwork Librarian on this booster: Not enough cards.");
					if (pickedCards.length !== picksThisRound + 1)
						return reportError("Missing Cogwork Librarian pick.");
					applyDraftEffects.push(() => {
						// We know we have a valid Cogwork Librarian, but we also have to know where it is, and its index, to be able to replace it in the booster.
						const list = cardInMain ? "main" : "side";
						const index = Connections[userID].pickedCards[list].findIndex(
							(c) => c.uniqueID === draftEffect.cardID
						);
						const cogworkLibrarian = Connections[userID].pickedCards[list].splice(index, 1)[0];
						cogworkLibrarian.state = undefined;
						booster.push(cogworkLibrarian); // Pushing the cogwork librarian at the end right away should be safe as it won't change indices of other cards.
						notifyDraftEffectUse();
					});
					picksThisRound++; // Allow an additional pick.
					break;
				}
				case UsableDraftEffect.AgentOfAcquisitions: {
					picksThisRound = booster.length;
					pickedCards = [...Array(booster.length).keys()];
					burnsThisRound = 0;
					burnedCards = [];
					applyDraftEffects.push(() => {
						if (!card.state) card.state = {};
						card.state.faceUp = false;
						notifyDraftEffectUse();
						updatedCardStates.push({ cardID: card.uniqueID, state: card.state });
						if (!s.players[userID].effect) s.players[userID].effect = {};
						s.players[userID].effect!.skipUntilNextRound = true;
					});
					break;
				}
				case UsableDraftEffect.LeovoldsOperative: {
					if (picksThisRound >= booster.length)
						return reportError("You can't use a Leovold's Operative on this booster: Not enough cards.");
					if (pickedCards.length !== picksThisRound + 1)
						return reportError("Missing Leovold's Operative pick.");
					picksThisRound++;
					applyDraftEffects.push(() => {
						if (!card.state) card.state = {};
						card.state.faceUp = false;
						notifyDraftEffectUse();
						updatedCardStates.push({ cardID: card.uniqueID, state: card.state });
						if (!s.players[userID].effect) s.players[userID].effect = {};
						s.players[userID].effect!.skipNPicks = 1;
					});
					break;
				}
				case UsableDraftEffect.RemoveDraftCard: {
					const removedCards = pickedCards.map((index) => booster[index]);
					burnsThisRound += pickedCards.length;
					picksThisRound -= pickedCards.length;
					burnedCards = burnedCards.concat(pickedCards);
					pickedCards = [];
					applyDraftEffects.push(() => {
						if (!card.state) card.state = {};
						if (!card.state?.removedCards) card.state.removedCards = [];
						// Associate the removed cards with the effect origin
						card.state.removedCards.push(...removedCards);
						updatedCardStates.push({ cardID: card.uniqueID, state: card.state });
					});
					break;
				}
				case UsableDraftEffect.NoteCardName: {
					const cardName = booster[pickedCards[0]].name;
					applyDraftEffects.push(() => {
						if (!card.state) card.state = {};
						card.state.faceUp = false;
						notifyDraftEffectUse();
						card.state.cardName = cardName;
						updatedCardStates.push({ cardID: card.uniqueID, state: card.state });
					});
					break;
				}
				case UsableDraftEffect.NoteCreatureName: {
					if (!booster[pickedCards[0]].type.includes("Creature"))
						return reportError("Pick should be a creature.");
					const creatureName = booster[pickedCards[0]].name;
					applyDraftEffects.push(() => {
						if (!card.state) card.state = {};
						card.state.faceUp = false;
						notifyDraftEffectUse();
						card.state.creatureName = creatureName;
						updatedCardStates.push({ cardID: card.uniqueID, state: card.state });
					});
					break;
				}
				case UsableDraftEffect.NoteCreatureTypes: {
					if (!booster[pickedCards[0]].type.includes("Creature"))
						return reportError("Pick should be a creature.");
					const creatureTypes = booster[pickedCards[0]].subtypes;

					applyDraftEffects.push(() => {
						if (!card.state) card.state = {};
						card.state.faceUp = false;
						notifyDraftEffectUse();
						card.state.creatureTypes = creatureTypes;
						updatedCardStates.push({ cardID: card.uniqueID, state: card.state });
					});
					break;
				}
				default:
					return reportError(`Unimplemented draft effect: ${draftEffect.effect}.`);
			}
		}
		if (optionalOnPickDraftEffect) {
			const notify = (str: string) => {
				try {
					this.forUsers((uid) => {
						if (uid !== userID) Connections[uid]?.socket.emit("message", new ToastMessage(str), true);
					});
				} catch (e) {
					console.error("Error notifying of draft effect use: ", e);
				}
			};

			switch (optionalOnPickDraftEffect.effect) {
				case OptionalOnPickDraftEffect.LoreSeeker: {
					const index = booster.findIndex((c) => c.uniqueID === optionalOnPickDraftEffect.cardID);
					if (index < 0 || !hasEffect(booster[index], OptionalOnPickDraftEffect.LoreSeeker))
						return reportError("Invalid draft effect card.");
					if (!pickedCards.includes(index))
						return reportError("You must pick Lore Seeker to use its effect.");
					const additionalBooster = this.generateBoosters(1, {
						useCustomBoosters: true,
						removeFromCardPool: this.draftLog?.boosters.flat(),
					});
					if (isMessageError(additionalBooster))
						Connections[userID].socket?.emit(
							"message",
							new MessageError(
								"Could not generate additional booster, Lore Seeker effect ignored.",
								`Original Error: ${additionalBooster.title} - ${additionalBooster.text}`
							)
						);
					else {
						applyDraftEffects.push(() => {
							if (this.draftLog) {
								this.draftLog.boosters.push(additionalBooster[0].map((c) => c.id));
								const getCard = this.getCustomGetCardFunction();
								for (const card of additionalBooster[0])
									this.draftLog.carddata[card.id] = getCard(card.id);
							}
							s.players[userID].boosters.unshift(additionalBooster[0]);
							notify(`${Connections[userID].userName} used the effect of 'Lore Seeker'.`);
						});
					}
					break;
				}
			}
		}

		let nextPlayer: UserID = s.nextPlayer(userID);
		// "Each player passes the last card from each booster pack to a player who drafted a card named Canal Dredger."
		if (booster.length - pickedCards.length - burnedCards.length === 1) {
			const playersWithCanalDedger = s.getPlayersWithCanalDredger();
			// Note: This await comes with the possibly of a re-entry before the state is updated.
			//       This is a problem, but I don't think it's worth preventing. It should not be possible in legitimate circumstances.
			if (playersWithCanalDedger.length > 0)
				nextPlayer = await choosePlayer(
					userID,
					`Choose a player with a Canal Dredger to pass '${booster[0].name}' to:`,
					playersWithCanalDedger
				);
		}

		if (
			!pickedCards ||
			pickedCards.length !== picksThisRound ||
			pickedCards.some((idx) => idx < 0 || idx >= booster.length)
		)
			return reportError(`Invalid picked cards ([${pickedCards.join(", ")}], booster length: ${booster.length})`);

		if (
			burnedCards &&
			(burnedCards.length > burnsThisRound ||
				burnedCards.length !== Math.min(burnsThisRound, booster.length - pickedCards.length) ||
				burnedCards.some((idx) => idx < 0 || idx >= booster.length))
		)
			return reportError(
				`Invalid burned cards (expected length: ${burnsThisRound}, burnedCards: ${burnedCards.length}, booster: ${booster.length}).`
			);

		if (!InProduction)
			console.log(
				`Session ${this.id}: ${Connections[userID].userName} [${userID}] picked card '${pickedCards.map(
					(idx) => booster[idx].name
				)}', burning ${burnedCards && burnedCards.length > 0 ? burnedCards.length : "nothing"}.`
			);

		// Request is valid, actually extract the booster and proceed

		this.stopCountdown(userID);
		s.players[userID].boosters.splice(0, 1); // Remove booster from queue

		for (const effect of applyDraftEffects) effect();

		for (const idx of pickedCards) {
			Connections[userID].pickedCards.main.push(booster[idx]);
			s.players[userID].botInstance.forcePick(
				idx,
				booster,
				s.boosterNumber,
				this.boostersPerPlayer,
				s.players[userID].pickNumber,
				s.numPicks
			);
		}

		const pickData: DraftPick = {
			packNum: s.boosterNumber,
			pickNum: s.players[userID].pickNumber,
			pick: pickedCards,
			burn: burnedCards,
			booster: booster.map((c) => c.id),
		};
		this.draftLog?.users[userID].picks.push(pickData);

		let cardsToRemove = pickedCards;
		if (burnedCards) cardsToRemove = cardsToRemove.concat(burnedCards);
		cardsToRemove.sort((a, b) => b - a); // Remove last index first to avoid shifting indices

		// Update draft log for live display if owner in not playing (Do this before removing the cards, damnit!)
		if (this.owner && this.shouldSendLiveUpdates()) {
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

		if (s.players[userID].effect?.aetherSearcher) {
			const target = s.players[userID].effect!.aetherSearcher!.card;
			if (!target.state) target.state = {};
			target.state.cardName = booster[pickedCards[0]].name;
			updatedCardStates.push({ cardID: target.uniqueID, state: target.state });
			const msg = new ToastMessage(
				`${Connections[userID].userName} picked '${target.state.cardName}' and noted its name on their '${target.name}'!`
			);
			this.emitToConnectedUsers("message", msg);
			s.players[userID].effect!.aetherSearcher = undefined;
		}

		for (const card of pickedCards.map((idx) => booster[idx])) {
			if (card.draft_effects) {
				let notify = false;
				for (const effect of card.draft_effects) {
					switch (effect.type) {
						case OnPickDraftEffect.FaceUp:
							if (!card.state) card.state = {};
							card.state.faceUp = true;
							updatedCardStates.push({ cardID: card.uniqueID, state: card.state });
						// Intended fallthrough
						case OnPickDraftEffect.Reveal:
							notify = true;
							break;
						case OnPickDraftEffect.NotePassingPlayer:
							if (!card.state) card.state = {};
							// There's no "passing player" for the first pick.
							if (s.players[userID].pickNumber > 0) {
								const pid = s.previousPlayer(userID);
								card.state.passingPlayer = s.players[pid].isBot
									? s.players[pid].botInstance.name
									: (Connections[pid]?.userName ?? pid);
								updatedCardStates.push({ cardID: card.uniqueID, state: card.state });
							}
							break;
						case OnPickDraftEffect.NoteDraftedCards:
							if (!card.state) card.state = {};
							card.state.cardsDraftedThisRound = s.players[userID].pickNumber + 1;
							updatedCardStates.push({ cardID: card.uniqueID, state: card.state });
							break;
						case OnPickDraftEffect.ChooseColors: {
							const leftPlayer = s.leftPlayer(userID);
							const rightPlayer = s.rightPlayer(userID);
							askColors(card, userID, leftPlayer, rightPlayer);
							break;
						}
						case OnPickDraftEffect.CanalDredger: {
							if (!s.players[userID].effect) s.players[userID].effect = {};
							s.players[userID].effect!.canalDredger = true;
							break;
						}
						case OnPickDraftEffect.AetherSearcher: {
							if (!s.players[userID].effect) s.players[userID].effect = {};
							s.players[userID].effect!.aetherSearcher = { card: card };
							break;
						}
						case OnPickDraftEffect.ArchdemonOfPaliano: {
							if (!s.players[userID].effect) s.players[userID].effect = {};
							s.players[userID].effect!.randomPicks = Math.max(
								3,
								s.players[userID].effect!.randomPicks ?? 0
							);
							// Immediately randomly pick as much as possible. The rest will be handled in passBooster when new boosters become available.
							const picks: UniqueCard[] = [];
							while (
								s.players[userID].boosters.length > 0 &&
								s.players[userID].effect?.randomPicks !== undefined &&
								s.players[userID].effect!.randomPicks! > 0
							)
								picks.push(...(await this.randomPick(userID)));
							if (picks.length > 0)
								Connections[userID]?.socket.emit("addCards", "You randomly picked:", picks);
							break;
						}
						case ParameterizedDraftEffectType.AddCards: {
							const additionalPicksCIDs: CardID[] = [];
							if (effect.count === effect.cards.length) {
								// Assume the user doesn't expect any randomness in this case.
								additionalPicksCIDs.push(...effect.cards);
							} else {
								let availableCards: CardID[] = [];
								for (let i = 0; i < effect.count; i++) {
									if (availableCards.length === 0) {
										availableCards = structuredClone(effect.cards);
										random.shuffle(availableCards);
									}
									const picked = availableCards.splice(0, 1)[0];
									// A card can be specified multiple times to increase its probability of being picked.
									// Protect from duplicates by default, except when explicitely disabled.
									if (effect.duplicateProtection)
										availableCards = availableCards.filter((cid) => cid !== picked);
									additionalPicksCIDs.push(picked);
								}
							}
							const additionalPicks = additionalPicksCIDs.map((cid) =>
								getUnique(cid, { getCard: this.getCustomGetCardFunction() })
							);
							// Mark cards with a usable effect as face-up, allowing their use from the card pool. Other on-pick effects are not supported.
							for (const card of additionalPicks) {
								if (card.draft_effects?.find((e) => e.type === OnPickDraftEffect.FaceUp)) {
									if (!card.state) card.state = {};
									card.state.faceUp = true;
								}
							}
							Connections[userID]?.pickedCards.main.push(...additionalPicks);
							Connections[userID]?.socket.emit(
								"addCards",
								`Picking '${card.name}' also added:`,
								additionalPicks
							);
							break;
						}
						default:
							if (isSomeEnum(OnPickDraftEffect)(effect))
								console.info("Unimplemented on pick draft effect: " + effect);
					}
				}
				if (notify) {
					let str = `${Connections[userID].userName} picked ${card.name}!`;
					if (card.state) {
						if (card.state.passingPlayer) str += ` (Passing Player: ${card.state.passingPlayer})`;
						if (card.state.cardsDraftedThisRound) str += ` (X=${card.state.cardsDraftedThisRound})`;
					}
					const msg = new ToastMessage(str);
					this.forUsers((uid) => {
						if (uid !== userID) Connections[uid]?.socket.emit("message", msg, true);
					});
				}
			}
		}

		for (const idx of cardsToRemove) booster.splice(idx, 1);

		++s.players[userID].pickNumber;

		this.passBooster(booster, userID, nextPlayer);

		this.sendDraftState(userID);
		if (updatedCardStates.length > 0) Connections[userID]?.socket?.emit("updateCardState", updatedCardStates);
		if (s.players[userID].boosters.length > 0) {
			this.startCountdown(userID);
			this.requestBotRecommendation(userID);
		}

		return new SocketAck();
	}

	// Restart a pick chain if necessary
	startBotPickChain(userID: UserID) {
		const s = this.draftState;
		if (!isDraftState(s)) return;
		if (!s.players[userID]) {
			console.error(`Session.startBotPickChain Error: Invalid userID '${userID}'. Valid players:`, s.players);
			console.error(`Session owner: ${this.owner}, users: `, this.users);
			console.trace();
			return;
		}
		if (!s.players[userID].botPickInFlight && s.players[userID].boosters.length > 0) {
			s.players[userID].botPickInFlight = true;
			// Delayed to the end of the event loop to avoid a very fringe scenario where the bot picks before others boosters
			// are distributed (but already removed from the pool), ending the draft early. This has the added benefit of prioritizing
			// sending packs to actual players.
			process.nextTick(() => {
				this.doBotPick(userID).catch((error) => {
					console.error(
						`Session.startBotPickChain (sessionID: ${this.id}, userID: ${userID}): doBotPick errored:`
					);
					console.error(error);
					console.error("Associated Player:", s.players[userID]);
				});
			});
		} // else: This bot is already picking, do nothing.
	}

	// To ensure a single call to doBotPick is in flight at any time, they are guarded by the botPickInFlight flag.
	// doBotPick will recursively call itself until there's no booster available. Chain can be restarted by neighbouring calls (see passBooster).
	async doBotPick(userID: UserID): Promise<void> {
		const s = this.draftState;
		if (!isDraftState(s)) return;

		assert(s.players[userID].botPickInFlight, "Error: Call to doBotPick with botPickInFlight not set to true.");
		assert(s.players[userID].boosters.length > 0, "Error: Call to doBotPick with no boosters.");

		// Since this runs asynchronously, there's multiple points were we should make sure the session state is still valid (mostly that the draft has not been prematurely stopped) before continuing.
		const shouldStop = () => {
			const state = this.draftState;
			if (!state || !isDraftState(state)) {
				s.players[userID].botPickInFlight = false;
				return true;
			}
			// Draft may have been manually terminated by the owner.
			if (!state?.players) {
				s.players[userID].botPickInFlight = false;
				return true;
			}
			// An attempt at avoiding promises outliving the session (all players disconnect for example).
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

		// Since startBotPickChain can be delayed by multiple seconds to stagger the API calls, the session may be
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

			const { picksThisRound, burnsThisRound } = s.picksAndBurnsThisRound(userID);

			const booster = s.players[userID].boosters[0];
			// Avoid using bots if it is not necessary: We're picking the whole pack.
			if (picksThisRound >= booster.length) {
				for (let i = 0; i < booster.length; i++) {
					pickedIndices.push(i);
					s.players[userID].botInstance.forcePick(
						i,
						booster,
						boosterNumber,
						this.boostersPerPlayer,
						pickNumber,
						numPicks
					);
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
				for (let i = 0; i < burnsThisRound && boosterCopy.length > 0; ++i) {
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

		// We're actually picking on behalf of a disconnected player
		if (!s.players[userID].isBot && this.isDisconnected(userID))
			this.disconnectedUsers[userID].pickedCards.main.push(...pickedIndices.map((idx) => booster[idx]));

		const pickData: DraftPick = {
			packNum: s.boosterNumber,
			pickNum: s.players[userID].pickNumber,
			pick: pickedIndices,
			burn: burnedIndices,
			booster: booster.map((c) => c.id),
		};
		this.draftLog?.users[userID].picks.push(pickData);

		if (this.owner && this.shouldSendLiveUpdates())
			Connections[this.owner]?.socket.emit("draftLogLive", { userID: userID, pick: pickData });

		const cardsToRemove = pickedIndices.concat(burnedIndices);
		cardsToRemove.sort((a, b) => b - a); // Remove last index first to avoid shifting indices
		for (const idx of cardsToRemove) booster.splice(idx, 1);

		let nextPlayer = s.nextPlayer(userID);
		if (booster.length === 1) {
			const playersWithCanalDedger = s.getPlayersWithCanalDredger();
			if (playersWithCanalDedger.length > 0) nextPlayer = getRandom(playersWithCanalDedger);
		}
		this.passBooster(booster, userID, nextPlayer);

		// Chain calls as long as we have boosters left
		if (s.players[userID].boosters.length > 0) {
			this.doBotPick(userID).catch((error) => {
				console.error(`Session.doBotPick (sessionID: ${this.id}, userID: ${userID}): doBotPick errored:`);
				console.error(error);
			});
		} else s.players[userID].botPickInFlight = false;
	}

	sendDraftState(userID: UserID) {
		const s = this.draftState;
		if (!isDraftState(s)) return;
		Connections[userID]?.socket.emit("draftState", s.syncData(userID));
	}

	requestBotRecommendation(userID: UserID) {
		const s = this.draftState;
		if (!isDraftState(s)) return;
		const p = s.players[userID];
		// Asyncronously ask for bot recommendations, and send then when available
		if (!this.disableBotSuggestions && p.botInstance && p.boosters.length > 0 && !p.botPickInFlight) {
			(() => {
				const localData = {
					booster: p.boosters[0],
					boosterNumber: s.boosterNumber,
					boostersPerPlayer: this.boostersPerPlayer,
					pickNumber: p.pickNumber,
					numPicks: s.numPicks,
				};
				p.botPickInFlight = true;
				return p.botInstance
					.getScores(
						localData.booster,
						localData.boosterNumber,
						localData.boostersPerPlayer,
						localData.pickNumber,
						localData.numPicks
					)
					.then((value) => {
						p.botPickInFlight = false;
						Connections[userID]?.socket.emit("botRecommandations", {
							pickNumber: localData.pickNumber,
							scores: value,
						});
					})
					.catch((error) => {
						p.botPickInFlight = false;
						console.error("Error in bot recommendation promise:");
						console.error(error);
					});
			})();
		}
	}

	distributeBoosters() {
		const s = this.draftState;
		if (!isDraftState(s)) return;

		// End draft if there are no more boosters to distribute
		if (s.boosters.length === 0) return this.endDraft();

		const doDistributeBoosters = () => {
			if (s.pendingTimeout) s.pendingTimeout = null;
			const boosters = s.boosters.splice(0, Object.keys(s.players).length);
			s.numPicks = boosters[0].length;

			let boosterIndex = 0;
			for (const userID in s.players) {
				const p = s.players[userID];
				if (p.effect?.skipUntilNextRound) p.effect.skipUntilNextRound = false;
				assert(p.boosters.length === 0, `distributeBoosters: ${userID} boosters.length ${p.boosters.length}`);

				p.pickNumber = 0;
				this.passBooster(boosters[boosterIndex], null, userID);
				++boosterIndex;
			}

			if (this.owner && !this.ownerIsPlayer)
				Connections[this.owner]?.socket.emit("draftState", {
					booster: [],
					boosterCount: 0,
					pickNumber: 0,
					picksThisRound: 0,
					burnsThisRound: 0,
					skipPick: true,

					boosterNumber: s.boosterNumber,
				});
		};

		if (this.reviewTimer > 0 && s.boosterNumber > 0) {
			const roundReviewTimer = Math.round(
				(1 + 0.5 * Math.max(0, Math.min(s.boosterNumber - 1, 2))) * this.reviewTimer
			);
			this.emitToConnectedUsers("startReviewPhase", roundReviewTimer);
			// FIXME: Using this method, if everyone disconnects during the review phase (not impossible, especially with a single player), the draft will be completely stuck.
			//        This is currently handled by a workaround in resumeOnReconnection, but we can probably do better.
			s.pendingTimeout = setTimeout(doDistributeBoosters, roundReviewTimer * 1000);
		} else doDistributeBoosters();
	}

	checkDraftRoundEnd() {
		const s = this.draftState;
		if (!isDraftState(s)) return false;
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

		this.emitToConnectedUsers("sessionOptions", { virtualPlayersData: this.getSortedVirtualPlayerData() });

		if (isDraftState(this.draftState)) {
			if (!this.draftPaused) this.resumeCountdowns();
			// Restart bot pick chains
			for (const uid in this.draftState.players)
				if (this.draftState.players[uid].isBot) this.startBotPickChain(uid);
			// Disconnect happened during the review phase
			if (Object.values(this.draftState.players).every((p) => p.boosters.length === 0)) {
				// Workaround for a very specific case where everyone disconnects during a review phase, leaving everyone waiting for the next round to start.
				if (!this.draftState.pendingTimeout) setImmediate(this.distributeBoosters.bind(this));
				else {
					// FIXME: This is clearly non-standard, but it should work in Node 18, 20 and 22.
					const remainingTime =
						((this.draftState.pendingTimeout as unknown as { _idleStart: number })._idleStart +
							(this.draftState.pendingTimeout as unknown as { _idleTimeout: number })._idleTimeout) /
							1000 -
						process.uptime();
					this.emitToConnectedUsers("startReviewPhase", remainingTime);
				}
			}
		}

		this.emitToConnectedUsers("resumeOnReconnection", new Message(msg.title, msg.text));
	}

	endDraft() {
		const s = this.draftState;
		if (!isDraftState(s)) return;

		if (s.pendingTimeout) {
			clearTimeout(s.pendingTimeout);
			s.pendingTimeout = null;
		}

		// Allow other callbacks (like distributeBoosters) to finish before proceeding (actually an issue in tests).
		process.nextTick(() => {
			if (this.draftLog) {
				try {
					// Bots are not handled by finalizeLogs()
					for (const userID in s.players)
						if (s.players[userID].isBot)
							this.draftLog.users[userID].cards = s.players[userID].botInstance.cards.map(
								(c: Card) => c.id
							);
					this.finalizeLogs();
					this.sendLogs();
					// Avoid making the logs public elsewhere when they're not sent to players.
					if (this.draftLogRecipients !== "none") this.initStableLogTimeout();
				} catch (e) {
					console.error(`Error handling log in endDraft for session ${this.id}:`, e);
				}
			}
			logSession("Draft", this);
			this.cleanDraftState();

			this.emitToConnectedUsers("endDraft");
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
			case "housman":
				this.endHousmanDraft();
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
			case "draft":
				this.endDraft();
				break;
			case "teamSealed":
				this.endTeamSealed();
				break;
			case "solomon":
				this.endSolomonDraft(true);
				break;
			case "silentAuction":
				this.endSilentAuctionDraft();
				break;
			default:
				console.error("Session.stopDraft: Unhandled draft type: " + this.draftState.type);
		}
	}

	pauseDraft() {
		if (!this.drafting) return;

		this.draftPaused = true;

		this.stopCountdowns();
		this.emitToConnectedUsers("pauseDraft");
	}

	resumeDraft() {
		if (!this.drafting || !this.draftPaused) return;
		this.resumeCountdowns();
		this.draftPaused = false;
		this.emitToConnectedUsers("resumeDraft");
	}

	///////////////////// Traditional Draft End  //////////////////////

	initLogs(type: string = "Draft", boosters: UniqueCard[][]): DraftLog {
		if (this.draftLog && this.stableLogTimeout) this.onStableLogTimeout(); // Immediately send pending decklog, if any, before overwriting the logs.

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

	// Makes sure DraftLog's cards and decklists are up-to-date for each player
	finalizeLogs() {
		if (this.draftLog) {
			for (const uid in this.draftLog.users) {
				if (!this.draftLog.users[uid].isBot) {
					const p = this.isDisconnected(uid) ? this.disconnectedUsers[uid] : Connections[uid]; // FIXME: This should not be necessary, I don't know why Connections[uid] can be undefined here (if the user isn't disconnected).
					if (p) {
						this.draftLog.users[uid].cards = getPickedCardIds(p.pickedCards);
						// Ensure all the necessary card data is available (relevant for effects like AddCards).
						for (const cid of this.draftLog.users[uid].cards)
							if (!(cid in this.draftLog.carddata))
								this.draftLog.carddata[cid] = this.getCustomGetCardFunction()(cid);
						this.updateDecklistInLog(uid);
					}
				}
			}
			this.draftLog.lastUpdated = Date.now();
		}
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
					this.emitToConnectedUsers("draftLog", strippedLog!);
				}
				break;
			default:
			case "delayed":
				this.draftLog.delayed = true;
				if (this.draftLogUnlockTimer > 0) {
					const sessionID = this.id;
					const logTimestamp = this.draftLog.time;
					setTimeout(
						() => {
							if (Sessions[sessionID]) {
								Sessions[sessionID]?.unlockLogs(logTimestamp);
							} else if (
								InactiveSessions[sessionID] &&
								InactiveSessions[sessionID].draftLog?.time === logTimestamp
							) {
								InactiveSessions[sessionID].draftLog.delayed = false;
								InactiveSessions[sessionID].draftLog.lastUpdated = Date.now();
							}
						},
						InTesting ? 1 : this.draftLogUnlockTimer * 60 * 1000
					);
				}
			// Fallthrough
			case "owner":
				if (this.owner) Connections[this.owner]?.socket.emit("draftLog", this.draftLog);
				if (this.personalLogs)
					this.forNonOwners((uid) => Connections[uid]?.socket.emit("draftLog", this.getStrippedLog(uid)!));
				else {
					const strippedLog = this.getStrippedLog();
					this.emitToConnectedNonOwners("draftLog", strippedLog!);
				}
				break;
			case "everyone":
				this.emitToConnectedUsers("draftLog", this.draftLog!);
				break;
		}
	}

	sendLogsTo(uid: UserID) {
		if (!this.draftLog) return;
		// Note: this.draftLogRecipients might have changed...
		const logs =
			this.draftLogRecipients === "everyone" ||
			(this.draftLogRecipients === "delayed" && !this.draftLog.delayed) || // Log was unlocked
			(this.draftLogRecipients !== "none" && uid === this.owner)
				? this.draftLog
				: this.getStrippedLog(this.personalLogs ? uid : undefined);
		Connections[uid]?.socket.emit("draftLog", logs!);
	}

	unlockLogs(logTimestamp: number) {
		if (!this.draftLog || !this.draftLog.delayed || this.draftLog.time !== logTimestamp) return;
		this.draftLog.delayed = false;
		this.draftLog.lastUpdated = Date.now();
		// If there's no scheduled log upload (for example if the session was closed before the logs were unlocked),
		// send them to Cube Cobra now.
		if (!this.stableLogTimeout) sendDraftLogToCubeCobra(this);
		this.emitToConnectedUsers("draftLog", this.draftLog);
	}

	updateDeckLands(userID: UserID, lands: DeckBasicLands) {
		if (!this.draftLog?.users[userID]) return;
		if (!this.draftLog.users[userID].decklist) this.draftLog.users[userID].decklist = { main: [], side: [] };
		this.draftLog.users[userID].decklist!.lands = lands;
		this.updateDecklist(userID);
	}

	removeBasicsFromDeck(userID: UserID) {
		if (!this.draftLog?.users[userID]?.decklist) return;
		Connections[userID].pickedCards.main = Connections[userID].pickedCards.main.filter(
			(c) => !EnglishBasicLandNames.includes(c.name)
		);
		Connections[userID].pickedCards.side = Connections[userID].pickedCards.side.filter(
			(c) => !EnglishBasicLandNames.includes(c.name)
		);
		this.updateDecklistInLog(userID);
	}

	updateDecklistInLog(userID: UserID) {
		if (!this.draftLog?.users[userID] || !Connections[userID]) return;
		if (Connections[userID].pickedCards.main.length === 0 && Connections[userID].pickedCards.side.length === 0)
			return;
		if (!this.draftLog.users[userID].decklist) this.draftLog.users[userID].decklist = { main: [], side: [] };
		this.draftLog.users[userID].decklist!.main = Connections[userID].pickedCards.main.map((c) => c.id);
		this.draftLog.users[userID].decklist!.side = Connections[userID].pickedCards.side.map((c) => c.id);
		this.draftLog.users[userID].decklist = computeHashes(this.draftLog.users[userID].decklist!, {
			getCard: this.getCustomGetCardFunction(),
		});
		this.rescheduleStableLogTimeout();
		this.draftLog.lastUpdated = Date.now();
	}

	updateDecklist(userID: UserID) {
		if (!this.draftLog?.users[userID]) return;
		this.updateDecklistInLog(userID);

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

		if (this.owner && this.shouldSendLiveUpdates()) Connections[this.owner]?.socket.emit("draftLogLive", shareData);

		if (!this.drafting) {
			// Note: The session setting draftLogRecipients may have changed since the game ended.
			switch (this.draftLogRecipients) {
				default:
				case "delayed":
					if (this.draftLog.delayed) {
						// Complete log has not been shared yet, send only hashes to non-owners, unless its their own and personalLogs is enabled.
						if (this.owner) Connections[this.owner]?.socket.emit("shareDecklist", shareData);
						this.forNonOwners((uid) =>
							Connections[uid]?.socket.emit(
								"shareDecklist",
								this.personalLogs && userID === uid ? shareData : hashesOnly
							)
						);
						break;
					}
				// Else, fall through to "everyone"
				case "everyone":
					// Also send the update to the organizer separately if they're not playing
					if (this.owner && !this.ownerIsPlayer)
						Connections[this.owner]?.socket.emit("shareDecklist", shareData);
					this.forUsers((uid) => Connections[uid]?.socket.emit("shareDecklist", shareData));
					break;
				case "owner":
					if (this.owner) Connections[this.owner]?.socket.emit("shareDecklist", shareData);
					this.forNonOwners((uid) =>
						Connections[uid]?.socket.emit(
							"shareDecklist",
							this.personalLogs && userID === uid ? shareData : hashesOnly
						)
					);
					break;
				case "none":
					if (this.owner) Connections[this.owner]?.socket.emit("shareDecklist", hashesOnly);
					this.forNonOwners((uid) =>
						Connections[uid]?.socket.emit(
							"shareDecklist",
							this.personalLogs && userID === uid ? shareData : hashesOnly
						)
					);
					break;
			}
		}
	}

	// Indicates if the DraftLogLive feature is in use
	shouldSendLiveUpdates() {
		return (
			!this.ownerIsPlayer &&
			["owner", "delayed", "everyone"].includes(this.draftLogRecipients) &&
			this.owner &&
			this.owner in Connections
		);
	}

	// Send decklogs to CubeArtisan after 5min of inactivity (or when the session is closed).
	initStableLogTimeout() {
		if (this.stableLogTimeout) return;
		this.stableLogTimeout = setTimeout(this.onStableLogTimeout.bind(this), StableLogTimeout);
	}

	// Delay sending deck logs to CubeArtisan. Intended to be called repeatedly while users are still tweaking their decks.
	rescheduleStableLogTimeout() {
		// Not scheduled, ignore (we don't want to send the same log twice).
		if (!this.stableLogTimeout) return;

		clearTimeout(this.stableLogTimeout);
		this.stableLogTimeout = setTimeout(this.onStableLogTimeout.bind(this), StableLogTimeout);
	}

	// Executed when logs (decks) have not been updated for a while.
	onStableLogTimeout() {
		// Not scheduled, ignore (we don't want to send the same log twice).
		if (!this.stableLogTimeout) return;

		// Logs are not public yet, reschedule.
		if (this.draftLog?.delayed) {
			this.rescheduleStableLogTimeout();
			return;
		}

		clearTimeout(this.stableLogTimeout);
		this.stableLogTimeout = undefined;
		this.onStableLog();
	}

	// Called when logs are stable (i.e. players haven't changed their decks in a while) or when disposing of the session.
	//   Sends decks to CubeArtisan for bot training.
	//   Sends logs to Cube Cobra for storing.
	onStableLog() {
		if (this.draftLog) {
			sendDecksToCubeArtisan(this.draftLog);
			sendDraftLogToCubeCobra(this);
		}
	}

	distributeSealed(boostersPerPlayer: number, customBoosters: Array<string>): SocketAck {
		const useCustomBoosters = customBoosters && customBoosters.some((s) => s !== "");
		if (useCustomBoosters && customBoosters.length !== boostersPerPlayer)
			return new SocketError("Error", "Invalid 'customBoosters' parameter.");
		const boosters = this.generateBoosters(this.users.size * boostersPerPlayer, {
			useCustomBoosters: useCustomBoosters,
			playerCount: this.users.size,
			customBoosters: useCustomBoosters ? customBoosters : undefined,
		});
		if (isMessageError(boosters)) return new SocketAck(boosters);
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
			Connections[userID].pickedCards.main = playersBoosters.flat();
			Connections[userID].pickedCards.side = [];
			log.users[userID].cards = Connections[userID].pickedCards.main.flat().map((c) => c.id);
			Connections[userID].socket.emit("sealedBoosters", playersBoosters);
			++idx;
		}

		this.sendLogs();

		// If owner is not playing, let them know everything went ok.
		if (this.owner && !this.ownerIsPlayer && this.owner in Connections) {
			const msg = new Message("Sealed pools successfly distributed!");
			msg.showConfirmButton = false;
			Connections[this.owner].socket.emit("message", msg);
		}

		logSession("Sealed", this);
		return new SocketAck();
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
		if (this.owner && !this.ownerIsPlayer && this.owner in Connections) {
			const msg = new Message("Sealed pools successfly distributed!");
			msg.showConfirmButton = false;
			Connections[this.owner].socket.emit("message", msg);
			Connections[this.owner].socket.emit("startTeamSealedSpectator");
		}

		logSession("TeamSealed", this);
		return new SocketAck();
	}

	endTeamSealed() {
		if (!this.drafting || !isTeamSealedState(this.draftState)) return;
		logSession("TeamSealed", this);
		this.cleanDraftState();

		this.forUsers((uid) => {
			this.updateDecklist(uid);
			Connections[uid].socket.emit("endTeamSealed");
		});
		console.log(`Session ${this.id} Team Sealed stopped.`);
	}

	teamSealedPick(userID: UserID, cardUniqueID: UniqueCardID): SocketAck {
		const state = this.draftState;
		if (!isTeamSealedState(state)) return new SocketError("Not playing", "No Team Sealed active in this session.");
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

	distributeJumpstart(set: string | string[]): SocketAck {
		this.initLogs("Jumpstart", []);
		this.draftLog!.carddata = {};

		const updateLog = (uid: UserID, cardIDs: CardID[]) => {
			if (!this.draftLog || !this.draftLog.users[uid]) return;
			this.draftLog.users[uid].cards = cardIDs;
			this.draftLog.users[uid].decklist = computeHashes(
				{ main: cardIDs, side: [] },
				{ getCard: this.getCustomGetCardFunction() }
			);
			for (const cid of cardIDs) if (!(cid in this.draftLog.carddata)) this.draftLog.carddata[cid] = getCard(cid);
		};

		if (set === "j21" || set === "super" || Array.isArray(set)) {
			if (Array.isArray(set) && set.some((s) => !JumpInSets.includes(s)))
				return new SocketError("Invalid Set", "Invalid Jump In set specified.");

			for (const user of this.users) {
				// Randomly get 2*3 packs and let the user choose among them.
				// The choices are based on the first pick colors (we send all possibilties rather than waiting for user action).
				const choices = Array.isArray(set)
					? genJumpInPackChoices(set)
					: set === "j21"
						? genJHHPackChoices()
						: genSuperJumpPackChoices();
				if (isSocketError(choices)) return choices;
				Connections[user].socket.emit("selectJumpstartPacks", choices, (user: UserID, cardIDs: CardID[]) => {
					if (!this.draftLog) return;
					updateLog(user, cardIDs);
					if (Object.values(this.draftLog.users).every((u) => u.cards?.length > 0)) {
						this.sendLogs();
						logSession("Jumpstart", this);
					}
				});
			}
		} else if (set === "jmp" || set === "j22") {
			// Original Jumpstart and Jumpstart 2022
			const JMPBoosters = { jmp: JumpstartBoosters, j22: Jumpstart2022Boosters }[set];
			const BoosterImage = { jmp: "/img/2JumpstartBoosters.webp", j22: "/img/2Jumpstart2022Boosters.webp" }[set];
			for (const user of this.users) {
				const boosters = [getRandom(JMPBoosters), getRandom(JMPBoosters)];
				const cards = boosters.map((b) => b.cards.map((cid: CardID) => getUnique(cid))).flat();
				updateLog(
					user,
					cards.map((c) => c.id)
				);
				Connections[user].socket.emit("setCardPool", cards);
				Connections[user].socket.emit("message", {
					icon: "success",
					imageUrl: BoosterImage,
					title: "Opened two Jumpstart boosters!",
					text: `You got '${boosters[0].name}' and '${boosters[1].name}'.`,
					showConfirmButton: true,
				} as Message);
			}
			this.sendLogs();
			logSession("Jumpstart", this);
		} else if (set === "j25") {
			for (const user of this.users) {
				const boosters = [getRandom(Jumpstart2025Boosters), getRandom(Jumpstart2025Boosters)];
				const cards = boosters.map((b) => b.cards.map((cid: CardID) => getUnique(cid))).flat();
				updateLog(
					user,
					cards.map((c) => c.id)
				);
				Connections[user].socket.emit("setCardPool", cards);
				Connections[user].socket.emit("message", {
					icon: "success",
					title: "Your Jumpstart packs!",
					html: `<div style="display:flex; justify-content: space-evenly;"><img src="/img/J25/${boosters[0].image}.webp" height="300px"><img src="/img/J25/${boosters[1].image}.webp" height="300px"></div>`,
					showConfirmButton: true,
				} as Message);
			}
			this.sendLogs();
			logSession("Jumpstart", this);
		} else return new SocketError("Invalid Set", "Invalid Jumpstart set.");

		// If owner is not playing, let them know everything went ok.
		if (!this.ownerIsPlayer && this.owner) {
			const msg = new ToastMessage("Jumpstart boosters successfully distributed!");
			msg.icon = "success";
			Connections[this.owner]?.socket.emit("message", msg);
		}

		return new SocketAck();
	}

	reconnectUser(userID: UserID) {
		if (!this.draftState) return;

		Connections[userID].pickedCards = this.disconnectedUsers[userID].pickedCards;
		this.addUser(userID);

		if (!isDraftState(this.draftState)) {
			type RejoinEventNames =
				| "rejoinWinstonDraft"
				| "rejoinWinchesterDraft"
				| "rejoinHousmanDraft"
				| "rejoinGridDraft"
				| "rejoinRochesterDraft"
				| "rejoinRotisserieDraft"
				| "rejoinMinesweeperDraft"
				| "rejoinTeamSealed"
				| "rejoinSolomonDraft"
				| "rejoinSilentAuctionDraft";
			const EventNames: Record<string, RejoinEventNames> = {
				winston: "rejoinWinstonDraft",
				winchester: "rejoinWinchesterDraft",
				housman: "rejoinHousmanDraft",
				grid: "rejoinGridDraft",
				rochester: "rejoinRochesterDraft",
				rotisserie: "rejoinRotisserieDraft",
				minesweeper: "rejoinMinesweeperDraft",
				teamSealed: "rejoinTeamSealed",
				solomon: "rejoinSolomonDraft",
				silentAuction: "rejoinSilentAuctionDraft",
			} as const;
			if (!(this.draftState.type in EventNames))
				return console.error(`Unknown draft state type: ${this.draftState.type}`);

			// FIXME: Refactor to get full type checking
			Connections[userID].socket.emit(EventNames[this.draftState.type], {
				pickedCards: this.disconnectedUsers[userID].pickedCards,
				// eslint-disable-next-line @typescript-eslint/no-explicit-any
				state: this.draftState.syncData(userID) as any,
			});
		} else {
			Connections[userID].socket.emit("rejoinDraft", {
				pickedCards: this.disconnectedUsers[userID].pickedCards,
				botScores: this.draftState.players[userID].botInstance.lastScores,
				state: this.draftState.syncData(userID),
			});
		}
		delete this.disconnectedUsers[userID];

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
		if (this.drafting && isDraftState(this.draftState)) {
			Connections[userID].socket.emit("startDraft", this.getSortedVirtualPlayerData());
			Connections[userID].socket.emit("draftState", {
				booster: [],
				boosterCount: 0,
				pickNumber: 0,
				picksThisRound: 0,
				burnsThisRound: 0,
				skipPick: true,

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

	replaceDisconnectedPlayers() {
		if (!this.drafting || !isDraftState(this.draftState)) return;

		console.warn(`Session ${this.id}: Replacing disconnected players with bots!`);

		for (const uid in this.disconnectedUsers) {
			this.disconnectedUsers[uid].replaced = true;
			this.startBotPickChain(uid);
		}
		const virtualPlayers = this.getSortedVirtualPlayerData();
		this.emitToConnectedUsers("sessionOptions", { virtualPlayersData: virtualPlayers });
		this.resumeOnReconnection({
			title: "Resuming draft",
			text: `Disconnected player(s) has been replaced by bot(s).`,
		});
	}

	startCountdowns() {
		if (!this.drafting || !isDraftState(this.draftState)) return;
		const s = this.draftState as DraftState;
		for (const userID in s.players)
			if (
				!s.players[userID].isBot &&
				!(this.isDisconnected(userID) && this.disconnectedUsers[userID].replaced) &&
				s.players[userID].boosters.length > 0
			)
				this.startCountdown(userID);
	}

	resumeCountdowns() {
		const s = this.draftState;
		if (!this.drafting || !isDraftState(s)) return;
		for (const userID in s.players)
			if (
				!s.players[userID].isBot &&
				!(this.isDisconnected(userID) && this.disconnectedUsers[userID].replaced) &&
				s.players[userID].boosters.length > 0
			)
				this.resumeCountdown(userID);
	}

	stopCountdowns() {
		if (!this.drafting || !isDraftState(this.draftState)) return;
		for (const userID in this.draftState.players) this.stopCountdown(userID);
	}

	startCountdown(userID: UserID) {
		const s = this.draftState;
		if (!isDraftState(s)) return;

		if (this.maxTimer === 0) {
			Connections[userID]?.socket.emit("disableTimer");
			return;
		}

		this.stopCountdown(userID);

		if (this.tournamentTimer) {
			const remainingCards = s.players[userID].boosters[0].length;
			s.players[userID].timer = TournamentTimer[Math.min(TournamentTimer.length - 1, remainingCards)];
		} else {
			const dec = (0.9 * this.maxTimer) / Math.max(1, s.numPicks - 1);
			// Note: pickNumber can actually be greater or equal to numPicks in some cases (e.g. Lore Seeker)
			const pickNumber = Math.min(s.players[userID].pickNumber, s.numPicks - 1);
			s.players[userID].timer = Math.max(1, Math.floor(this.maxTimer - pickNumber * dec));
		}

		// Immediatly share the new value.
		this.syncCountdown(userID);
		this.resumeCountdown(userID);
	}

	resumeCountdown(userID: UserID) {
		if (!isDraftState(this.draftState)) return;
		if (this.maxTimer === 0) {
			Connections[userID]?.socket.emit("disableTimer");
			return;
		}

		this.stopCountdown(userID);
		const countdownInterval = (this.draftState.players[userID].countdownInterval = setInterval(() => {
			const s = this.draftState;
			if (!isDraftState(s) || !s.players?.[userID]) {
				clearInterval(countdownInterval);
				return;
			}

			s.players[userID].timer -= 1;
			this.syncCountdown(userID);
			// If the client did not respond after 10 more seconds, force a disconnection.
			if (s.players[userID].timer <= -10) {
				s.players[userID].timer = 1;
				Connections[userID]?.socket?.disconnect();
				this.stopCountdown(userID);
			}
		}, 1000));
	}

	stopCountdown(userID: UserID) {
		const s = this.draftState;
		if (!isDraftState(s)) return;
		if (s?.players?.[userID]?.countdownInterval) {
			clearInterval(s.players[userID].countdownInterval as NodeJS.Timeout);
			s.players[userID].countdownInterval = null;
		}
	}

	syncCountdown(userID: UserID) {
		if (!isDraftState(this.draftState)) return;
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
		const tmp: Record<UserID, UserData> = {};
		for (const userID of this.getSortedHumanPlayersIDs()) {
			tmp[userID] = {
				userID: userID,
				userName: this.isDisconnected(userID)
					? this.disconnectedUsers[userID].userName
					: (Connections[userID]?.userName ?? "(Unknown)"),
				isBot: false,
				isReplaced: this.isDisconnected(userID) && this.disconnectedUsers[userID].replaced === true,
				isDisconnected: this.isDisconnected(userID),
				boosterCount: undefined,
			};
		}
		return tmp;
	}

	getSortedVirtualPlayerData() {
		if (isDraftState(this.draftState)) {
			const r: Record<UserID, UserData> = {};
			for (const userID in this.draftState.players) {
				r[userID] = {
					userID: userID,
					userName: this.draftState.players[userID].isBot
						? this.draftState.players[userID].botInstance.name
						: this.isDisconnected(userID)
							? this.disconnectedUsers[userID].userName
							: (Connections[userID]?.userName ?? "(Unknown)"),
					isBot: this.draftState.players[userID].isBot,
					isReplaced: this.isDisconnected(userID) && this.disconnectedUsers[userID].replaced === true,
					isDisconnected: this.isDisconnected(userID),
					boosterCount: this.draftState.players[userID].boosters.length,
				};
			}
			return r;
		} else return this.getSortedHumanPlayerData();
	}

	emitMessage(title: string, text: string = "", showConfirmButton = true, timer = 1500) {
		this.emitToConnectedUsers("message", {
			title: title,
			text: text,
			showConfirmButton: showConfirmButton,
			timer: timer,
		} as Message);
	}

	generateBracket(type: BracketType): void | MessageError {
		const previousBracket = this.bracket;

		const playerData = this.userOrder
			.filter((uid) => this.users.has(uid) && (this.ownerIsPlayer || uid !== this.owner))
			.map((uid) => {
				const u = Connections[uid];
				return { userID: u.userID, userName: u.userName };
			});
		switch (type) {
			case BracketType.Single: {
				this.bracket = new SingleBracket(playerData);
				break;
			}
			case BracketType.Team: {
				if (playerData.length % 2 !== 0)
					return new MessageError(
						"Invalid player count",
						"Team Draft tournaments require an even number of players."
					);
				this.bracket = new TeamBracket(playerData);
				break;
			}
			case BracketType.Swiss: {
				if ([6, 8, 10].indexOf(playerData.length) === -1)
					return new MessageError(
						"Invalid player count",
						"Swiss tournaments require exactly 6, 8 or 10 players."
					);
				this.bracket = new SwissBracket(playerData);
				break;
			}
			case BracketType.Double: {
				this.bracket = new DoubleBracket(playerData);
				break;
			}
		}

		if (previousBracket?.MTGOSynced)
			previousBracket.players.forEach((p) => {
				if (p) MatchResults.unsubscribe(p!.userName);
			});

		this.emitToConnectedUsers("sessionOptions", { bracket: this.bracket });
	}

	updateBracket(matchIndex: number, playerIndex: number, value: number): void {
		if (!this.bracket) return;
		this.bracket.matches[matchIndex].results[playerIndex] = value;
		this.bracket.updatePairings();
		this.emitToConnectedUsers("sessionOptions", { bracket: this.bracket });
	}

	handleMTGOEvent(e: EventCompleted) {
		if (!this.bracket || !this.bracket.MTGOSynced) return;

		if (e.finalMatchResults) {
			let mID: number | null = null;
			for (const m of this.bracket.matches) {
				if (
					((this.bracket.players[m.players[0]]?.userName === e.finalMatchResults[0].userInfo.screenName &&
						this.bracket.players[m.players[1]]?.userName === e.finalMatchResults[1].userInfo.screenName) ||
						(this.bracket.players[m.players[1]]?.userName === e.finalMatchResults[0].userInfo.screenName &&
							this.bracket.players[m.players[0]]?.userName ===
								e.finalMatchResults[1].userInfo.screenName)) &&
					m.results[0] === 0 &&
					m.results[1] === 0
				) {
					mID = m.id;
					break;
				}
			}

			if (mID) {
				const playerNameToIndex = {
					[this.bracket.players[this.bracket.matches[mID].players[0]]!.userName]: 0,
					[this.bracket.players[this.bracket.matches[mID].players[1]]!.userName]: 1,
				};

				const results: [number, number] = [0, 0];
				for (const game of e.games) {
					for (const playerRanking of game.playerRankings) {
						if (playerRanking.ranking === Result.Win) {
							const idx = playerNameToIndex[playerRanking.userInfo.screenName];
							results[idx] += 1;
						}
					}
				}

				this.bracket.matches[mID].results = results;
				this.bracket.updatePairings();
				this.emitToConnectedUsers("sessionOptions", { bracket: this.bracket });

				const winnerIdx = results[0] > results[1] ? 0 : 1;
				const loserIdx = (winnerIdx + 1) % 2;
				const msg = new ToastMessage(
					`${this.bracket.players[this.bracket.matches[mID].players[winnerIdx]]?.userName} won their match against ${this.bracket.players[this.bracket.matches[mID].players[loserIdx]]?.userName} ${results[winnerIdx]}-${results[loserIdx]}`
				);
				this.emitToConnectedUsers("message", msg);
			}
		}
	}

	syncBracketMTGO(value: boolean) {
		if (!this.bracket || value === this.bracket.MTGOSynced) return;

		this.bracket.MTGOSynced = value;

		if (this.bracket.MTGOSynced) {
			this.bracket.players.forEach((p) => {
				if (p) {
					MatchResults.subscribe(
						p.userName,
						((sessionID, userName) => {
							return (e: EventCompleted) => {
								const sess = Sessions[sessionID];
								if (!sess || !sess.bracket || !sess.bracket.MTGOSynced) {
									MatchResults.unsubscribe(userName);
								} else {
									sess.handleMTGOEvent(e);
								}
							};
						})(this.id, p.userName)
					);
				}
			});
		} else {
			this.bracket.players.forEach((p) => {
				if (p) MatchResults.unsubscribe(p.userName);
			});
		}
		this.emitToConnectedUsers("sessionOptions", { bracket: this.bracket });
	}

	// Execute fn for each user. Owner included even if they're not playing.
	forUsers(fn: (uid: UserID) => void) {
		if (!this.ownerIsPlayer && this.owner && this.owner in Connections) fn(this.owner);
		for (const user of this.users) fn(user);
	}
	forNonOwners(fn: (uid: UserID) => void) {
		for (const uid of this.users) if (uid !== this.owner) fn(uid);
	}

	emitToConnectedUsers<T extends keyof ServerToClientEvents>(
		eventKey: T,
		...args: Parameters<ServerToClientEvents[T]>
	) {
		this.forUsers((uid) => Connections[uid]?.socket.emit(eventKey, ...args));
	}

	emitToConnectedNonOwners<T extends keyof ServerToClientEvents>(
		eventKey: T,
		...args: Parameters<ServerToClientEvents[T]>
	) {
		for (const uid of this.users) if (uid !== this.owner) Connections[uid]?.socket.emit(eventKey, ...args);
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

export const clearSessions = TestingOnly(() => {
	for (const sid in Sessions) delete Sessions[sid];
});

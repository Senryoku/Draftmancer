"use strict";

import uuidv1 from "uuid/v1.js";
import constants from "../client/src/data/constants.json";
import { pickCard, countCards } from "./cardUtils.js";
import { negMod, isEmpty, shuffleArray, getRandom, arrayIntersect } from "./utils.js";
import { Connections } from "./Connection.js";
import { Cards, getUnique, BoosterCardsBySet, CardsBySet, MTGACardIDs } from "./Cards.js";
import Bot from "./Bot.js";
import { computeHashes } from "./DeckHashes.js";
import { BasicLandSlots, SpecialLandSlots } from "./LandSlot.js";
import {
	BoosterFactory,
	ColorBalancedSlot,
	SetSpecificFactories,
	PaperBoosterFactories,
	DefaultBoosterTargets,
} from "./BoosterFactory.js";
import JumpstartBoosters from "../data/JumpstartBoosters.json";
Object.freeze(JumpstartBoosters);
import { logSession } from "./Persistence.js";
import { Bracket, TeamBracket, SwissBracket, DoubleBracket } from "./Brackets.js";

export const optionProps = [
	"ownerIsPlayer",
	"setRestriction",
	"isPublic",
	"description",
	"ignoreCollections",
	"boostersPerPlayer",
	"teamDraft",
	"bots",
	"maxTimer",
	"maxPlayers",
	"mythicPromotion",
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
];

export class WinstonDraftState {
	constructor(players, boosters) {
		this.players = players;
		this.round = -1; // Will be immedialty incremented
		this.cardPool = [];
		if (boosters) {
			for (let booster of boosters) this.cardPool.push(...booster);
			shuffleArray(this.cardPool);
		}
		if (this.cardPool.length >= 3)
			this.piles = [[this.cardPool.pop()], [this.cardPool.pop()], [this.cardPool.pop()]];
		this.currentPile = 0;
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

export class GridDraftState {
	constructor(players, boosters) {
		this.players = players;
		this.round = 0;
		this.boosters = []; // 3x3 Grid, Row-Major order
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
		this.lastPicks = [];
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

export class RochesterDraftState {
	constructor(players, boosters) {
		this.players = players;
		this.pickNumber = 0;
		this.boosterNumber = 0;
		this.boosters = [];
		if (boosters) {
			for (let booster of boosters) {
				this.boosters.push(booster);
			}
		}
		this.boosterCount = this.boosters.length;
		this.lastPicks = [];
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

export class Session {
	constructor(id, owner, options) {
		this.id = id;
		this.owner = owner;
		this.users = new Set();
		this.userOrder = [];

		// Options
		this.ownerIsPlayer = true;
		this.setRestriction = [constants.MTGASets[constants.MTGASets.length - 1]];
		this.isPublic = false;
		this.description = "";
		this.ignoreCollections = false;
		this.boostersPerPlayer = 3;
		this.teamDraft = false;
		this.bots = 0;
		this.maxTimer = 75;
		this.maxPlayers = 8;
		this.mythicPromotion = true;
		this.boosterContent = DefaultBoosterTargets;
		this.usePredeterminedBoosters = false;
		this.colorBalance = true;
		this.maxDuplicates = null;
		this.foil = false;
		this.preferedCollation = "MTGA"; // Unused! (And thus not exposed client-side)
		this.useCustomCardList = false;
		this.customCardList = {};
		this.distributionMode = "regular"; // Specifies how boosters are distributed when using boosters from different sets (see customBoosters)
		this.customBoosters = ["", "", ""]; // Specify a set for an individual booster (Draft Only)
		this.pickedCardsPerRound = 1;
		this.burnedCardsPerRound = 0;
		this.draftLogRecipients = "everyone";
		this.bracketLocked = false; // If set, only the owner can edit the results.
		this.bracket = undefined;

		if (options) for (let p in options) this[p] = options[p];

		// Draft state
		this.drafting = false;
		this.boosters = [];
		this.round = 0;
		this.pickedCardsThisRound = 0;
		this.countdown = 75;
		this.countdownInterval = null;
		this.disconnectedUsers = {};

		this.winstonDraftState = null;
		this.gridDraftState = null;
		this.rochesterDraftState = null;
	}

	addUser(userID) {
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

	getDisconnectedUserData(userID) {
		return {
			userName: Connections[userID].userName,
			pickedThisRound: Connections[userID].pickedThisRound,
			pickedCards: Connections[userID].pickedCards,
			boosterIndex: Connections[userID].boosterIndex,
		};
	}

	broadcastDisconnectedUsers() {
		const disconnectedUserNames = Object.keys(this.disconnectedUsers).map(u => this.disconnectedUsers[u].userName);
		this.forUsers(u =>
			Connections[u].socket.emit("userDisconnected", {
				owner: this.owner,
				disconnectedUserNames: disconnectedUserNames,
			})
		);
	}

	remUser(userID) {
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

	setBoostersPerPlayer(boostersPerPlayer) {
		if (this.boostersPerPlayer != boostersPerPlayer && boostersPerPlayer > 0) {
			this.boostersPerPlayer = boostersPerPlayer;
			while (this.customBoosters.length < boostersPerPlayer) this.customBoosters.push("");
			while (this.customBoosters.length > boostersPerPlayer) this.customBoosters.pop();

			this.forUsers(u =>
				Connections[u].socket.emit("sessionOptions", {
					boostersPerPlayer: this.boostersPerPlayer,
					customBoosters: this.customBoosters,
				})
			);
		}
	}

	setCustomCardList(cardList) {
		this.useCustomCardList = true;
		this.customCardList = cardList;
		this.forUsers(u =>
			Connections[u].socket.emit("sessionOptions", {
				useCustomCardList: this.useCustomCardList,
				customCardList: this.customCardList,
			})
		);
	}

	setTeamDraft(teamDraft) {
		if (this.teamDraft != teamDraft) {
			this.teamDraft = teamDraft;
			if (teamDraft) {
				this.maxPlayers = 6;
				this.bots = 0;
			} else {
				this.maxPlayers = 8;
			}

			this.forUsers(u =>
				Connections[u].socket.emit("sessionOptions", {
					teamDraft: this.teamDraft,
					maxPlayers: this.maxPlayers,
					bots: this.bots,
				})
			);
		}
	}

	setSeating(seating) {
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

	randomizeSeating() {
		if (this.drafting) return false;
		shuffleArray(this.userOrder);
		this.notifyUserChange();
		return true;
	}

	syncSessionOptions(userID) {
		const options = {
			sessionOwner: this.owner,
			bracket: this.bracket,
		};
		for (let p of optionProps) options[p] = this[p];
		Connections[userID].socket.emit("sessionOptions", options);
	}

	// Returns true if the card pool is not restricted by players collections (and ignoreCollections is true or no-one is using their collection)
	unrestrictedCardPool() {
		if (this.ignoreCollections) return true;

		for (let userID of this.users) {
			if (Connections[userID].useCollection && !isEmpty(Connections[userID].collection)) return false;
		}

		return true;
	}

	// Returns current card pool according to all session options (Collections, setRestrictions...)
	cardPool() {
		let cardPool = {};

		if (this.unrestrictedCardPool()) {
			// Returns all cards if there's no set restriction
			if (this.setRestriction.length === 0) {
				for (let c in Cards)
					if (Cards[c].in_booster)
						cardPool[c] = this.maxDuplicates ? this.maxDuplicates[Cards[c].rarity] : 99;
			} else {
				// Use cache otherwise
				for (let set of this.setRestriction)
					for (let c of BoosterCardsBySet[set])
						cardPool[c] = this.maxDuplicates ? this.maxDuplicates[Cards[c].rarity] : 99;
			}
			return cardPool;
		}

		// Restricts collection according to this.setRestriction
		return this.restrictedCollection(this.setRestriction);
	}

	restrictedCollection(sets) {
		const cardPool = this.collection();

		const restricted = {};
		if (sets && sets.length > 0) {
			for (let s of sets)
				for (let cid of CardsBySet[s].filter(cid => cid in cardPool)) restricted[cid] = cardPool[cid];
			return restricted;
		} else return cardPool;
	}

	// Compute user collections intersection (taking into account each user preferences)
	collection(inBoosterOnly = true) {
		const user_list = [...this.users];
		let intersection = [];
		let collection = {};

		let useCollection = [];
		for (let i = 0; i < user_list.length; ++i)
			useCollection[i] =
				Connections[user_list[i]].useCollection && !isEmpty(Connections[user_list[i]].collection);

		let arrays = [];
		// Start from the first user's collection, or the list of all cards if not available/used
		if (!useCollection[0])
			if (inBoosterOnly) arrays.push(MTGACardIDs.filter(c => Cards[c].in_booster));
			else arrays.push(MTGACardIDs);
		else if (inBoosterOnly)
			arrays.push(Object.keys(Connections[user_list[0]].collection).filter(c => Cards[c].in_booster));
		else arrays.push(Object.keys(Connections[user_list[0]].collection));
		for (let i = 1; i < user_list.length; ++i)
			if (useCollection[i]) arrays.push(Object.keys(Connections[user_list[i]].collection));
		intersection = arrayIntersect(arrays);

		// Compute the minimum count of each remaining card
		for (let c of intersection) {
			collection[c] = useCollection[0] ? Connections[user_list[0]].collection[c] : 4;
			for (let i = 1; i < user_list.length; ++i)
				if (useCollection[i]) collection[c] = Math.min(collection[c], Connections[user_list[i]].collection[c]);
		}
		return collection;
	}

	// Categorize card pool by rarity
	cardPoolByRarity() {
		const cardPoolByRarity = {
			common: {},
			uncommon: {},
			rare: {},
			mythic: {},
		};
		const cardPool = this.cardPool();
		for (let cid in cardPool) {
			if (!(Cards[cid].rarity in cardPoolByRarity)) cardPoolByRarity[Cards[cid].rarity] = {};
			cardPoolByRarity[Cards[cid].rarity][cid] = cardPool[cid];
		}
		return cardPoolByRarity;
	}

	// Returns all cards from specified set categorized by rarity and set to maxDuplicates
	setByRarity(set) {
		let local = {
			common: {},
			uncommon: {},
			rare: {},
			mythic: {},
		};
		for (let cid of BoosterCardsBySet[set]) {
			if (!(Cards[cid].rarity in local)) local[Cards[cid].rarity] = {};
			local[Cards[cid].rarity][cid] = this.maxDuplicates ? this.maxDuplicates[Cards[cid].rarity] : 99;
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
	generateBoosters(boosterQuantity, options = {}) {
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
				let cardsByRarity = {};
				for (let r in this.customCardList.cardsPerBooster) {
					cardsByRarity[r] = {};
					for (let cardId of this.customCardList.cards[r])
						if (cardId in cardsByRarity[r])
							// Duplicates adds one copy of the card
							cardsByRarity[r][cardId] += 1;
						else cardsByRarity[r][cardId] = 1;

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
					let booster = [];

					for (let r in this.customCardList.cardsPerBooster) {
						if (useColorBalance && r === colorBalancedSlot) {
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
				let localCollection = {};

				for (let cardId of this.customCardList.cards) {
					// Duplicates adds one copy of the card
					if (cardId in localCollection) localCollection[cardId] += 1;
					else localCollection[cardId] = 1;
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
						let booster = [];
						for (let j = 0; j < cardsPerBooster; ++j) booster.push(pickCard(localCollection, booster));
						this.boosters.push(booster);
					}
				}
			}
		} else {
			// Standard draft boosters
			const targets = options?.targets ?? this.boosterContent;

			const BoosterFactoryOptions = {
				foil: this.foil,
				colorBalance: this.colorBalance,
				mythicPromotion: this.mythicPromotion,
				maxDuplicates: this.maxDuplicates,
				onError: (...args) => {
					this.emitError(...args);
				},
				session: this,
			};

			let defaultFactory = null;

			const getBoosterFactory = function(set, cardPool, landSlot, options) {
				// Check for a special booster factory
				if (set && set in SetSpecificFactories) return SetSpecificFactories[set](cardPool, landSlot, options);
				return new BoosterFactory(cardPool, landSlot, options);
			};

			const customBoosters = options?.customBoosters ?? this.customBoosters; // Use override value if provided via options
			const boosterSpecificRules = options.useCustomBoosters && customBoosters.some(v => v !== "");
			const acceptPaperBoosterFactories =
				targets === DefaultBoosterTargets &&
				BoosterFactoryOptions.mythicPromotion &&
				this.maxDuplicates === null &&
				this.unrestrictedCardPool();
			const isPaperBoosterFactoryAvailable = set => {
				return set in PaperBoosterFactories || `${set}-arena` in PaperBoosterFactories;
			};
			const getPaperBoosterFactory = set => {
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
			if (!options?.useCustomBoosters || customBoosters.some(v => v === "")) {
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
					let booster = defaultFactory.generateBooster(targets);
					if (booster) this.boosters.push(booster);
					else return false;
				}
			} else {
				// Booster specific rules
				// (boosterQuantity is ignored in this case and boostersPerPlayer * this.getVirtualPlayersCount() is used directly instead)
				const boostersPerPlayer = options?.boostersPerPlayer ?? this.boostersPerPlayer; // Allow overriding via options
				const boosterFactories = [];
				const usedSets = {};
				const defaultBasics = BasicLandSlots["znr"]; // Arbitrary set of default basic lands if a specific set doesn't have them.

				// Exceptions for inclusion of basic land slot: Commander Legends as the booster size will be wrong anyway, and TSR/STX that already have 15 cards.
				const irregularSets = ["cmr", "tsr", "stx"];
				// If randomized, we'll have to make sure all boosters are of the same size: Adding a land slot to the default rule.
				const addLandSlot = this.distributionMode !== "regular" || customBoosters.some(v => v === "random");
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
								// Use the corresponding PaperBoosterFactories if possible
								if (acceptPaperBoosterFactories && isPaperBoosterFactoryAvailable(boosterSet)) {
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
										(a, v) => (v == boosterSet ? a + 1 : a),
										0
									);
									for (let slot of ["common", "uncommon", "rare"]) {
										if (
											countCards(usedSets[boosterSet].cardPool[slot]) <
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
						const booster = rule.generateBooster(targets);
						if (booster) this.boosters.push(booster);
						else return false;
					}
				}

				if (this.distributionMode === "shuffleBoosterPool") shuffleArray(this.boosters);

				// Boosters within a round much be of the same length.
				// For example CMR packs have a default length of 20 cards and may cause problems if boosters are shuffled.
				if (this.distributionMode !== "regular" || customBoosters.some(v => v === "random")) {
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
		let user_info = [];
		for (let userID of this.getSortedHumanPlayersIDs()) {
			let u = Connections[userID];
			if (u) {
				user_info.push({
					userID: u.userID,
					userName: u.userName,
					collection: !isEmpty(u.collection),
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

	///////////////////// Winston Draft //////////////////////
	startWinstonDraft(boosterCount) {
		if (this.users.size !== 2) return false;
		this.drafting = true;
		this.emitMessage("Preparing Winston draft!", "Your draft will start soon...", false, 0);
		if (!this.generateBoosters(boosterCount)) {
			this.drafting = false;
			return false;
		}
		this.disconnectedUsers = {};
		this.winstonDraftState = new WinstonDraftState(this.getSortedHumanPlayersIDs(), this.boosters);
		for (let user of this.users) {
			Connections[user].pickedCards = [];
			Connections[user].socket.emit("sessionOptions", {
				virtualPlayersData: this.getSortedHumanPlayers(),
			});
			Connections[user].socket.emit("startWinstonDraft", this.winstonDraftState);
		}

		this.initLogs("Winston Draft");
		for (let userID in this.draftLog.users) this.draftLog.users[userID].picks = [];

		this.winstonNextRound();
		return true;
	}

	endWinstonDraft() {
		logSession("WinstonDraft", this);
		for (let uid of this.users) this.draftLog.users[uid].cards = Connections[uid].pickedCards.map(c => c.id);
		this.sendLogs();
		for (let user of this.users) Connections[user].socket.emit("winstonDraftEnd");
		this.winstonDraftState = null;
		this.drafting = false;
		this.disconnectedUsers = {};
	}

	winstonNextRound() {
		const s = this.winstonDraftState;
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
		const s = this.winstonDraftState;
		if (!this.drafting || !s) return false;
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
			s.piles[s.currentPile].push(s.cardPool.pop());
		// Give a random card from the card pool if this was the last pile
		if (s.currentPile === 2) {
			const card = s.cardPool.pop();
			Connections[s.currentPlayer()].socket.emit("winstonDraftRandomCard", card);
			this.draftLog.users[s.currentPlayer()].picks.push({
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
		const s = this.winstonDraftState;
		if (!this.drafting || !s) return false;
		this.draftLog.users[s.currentPlayer()].picks.push({
			pickedPile: s.currentPile,
			piles: [...s.piles],
		});
		Connections[s.currentPlayer()].pickedCards = Connections[s.currentPlayer()].pickedCards.concat(
			s.piles[s.currentPile]
		);
		if (s.cardPool.length > 0) s.piles[s.currentPile] = [s.cardPool.pop()];
		else s.piles[s.currentPile] = [];
		this.winstonNextRound();
		return true;
	}
	///////////////////// Winston Draft End //////////////////////

	///////////////////// Grid Draft //////////////////////
	startGridDraft(boosterCount) {
		if (this.users.size != 2) return false;
		this.drafting = true;
		this.emitMessage("Preparing Grid draft!", "Your draft will start soon...", false, 0);
		// When using a custom card list with custom slots, boosters will be truncated to 9 cards by GridDraftState
		// Use boosterContent setting only if it is valid (adds up to 9 cards)
		const cardsPerBooster = Object.values(this.boosterContent).reduce((val, acc) => val + acc, 0);

		if (
			!this.generateBoosters(boosterCount, {
				targets: cardsPerBooster === 9 ? this.boosterContent : { rare: 1, uncommon: 3, common: 5 },
				cardsPerBooster: 9,
			})
		) {
			this.drafting = false;
			return false;
		}

		this.disconnectedUsers = {};
		this.gridDraftState = new GridDraftState(this.getSortedHumanPlayersIDs(), this.boosters);
		if (this.gridDraftState.error) {
			this.emitError(this.gridDraftState.error.title, this.gridDraftState.error.text);
			this.gridDraftState = null;
			this.drafting = false;
			return false;
		}

		for (let user of this.users) {
			Connections[user].pickedCards = [];
			Connections[user].socket.emit("sessionOptions", {
				virtualPlayersData: this.getSortedHumanPlayers(),
			});
			Connections[user].socket.emit("startGridDraft", this.gridDraftState.syncData());
		}

		this.initLogs("Grid Draft");
		for (let userID in this.draftLog.users) this.draftLog.users[userID].picks = [];

		return true;
	}

	endGridDraft() {
		logSession("GridDraft", this);
		for (let uid of this.users) this.draftLog.users[uid].cards = Connections[uid].pickedCards.map(c => c.id);
		this.sendLogs();
		for (let user of this.users) Connections[user].socket.emit("gridDraftEnd");
		this.gridDraftState = null;
		this.drafting = false;
		this.disconnectedUsers = {};
	}

	gridDraftNextRound() {
		const s = this.gridDraftState;
		++s.round;

		if (s.round % 2 === 0) {
			// Share the last pick before advancing to the next booster.
			const syncData = s.syncData();
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

	gridDraftPick(choice) {
		const s = this.gridDraftState;
		if (!this.drafting || !s) return false;

		const log = { pick: [], booster: s.boosters[0].map(c => (c ? c.id : null)) };

		let pickedCards = [];
		for (let i = 0; i < 3; ++i) {
			//                     Column           Row
			let idx = choice < 3 ? 3 * i + choice : 3 * (choice - 3) + i;
			if (s.boosters[0][idx] !== null) {
				Connections[s.currentPlayer()].pickedCards.push(s.boosters[0][idx]);
				pickedCards.push(s.boosters[0][idx]);
				log.pick.push(idx);
				s.boosters[0][idx] = null;
			}
		}

		this.draftLog.users[s.currentPlayer()].picks.push(log);
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
		this.rochesterDraftState = new RochesterDraftState(this.getSortedHumanPlayersIDs(), this.boosters);
		for (let user of this.users) {
			Connections[user].pickedCards = [];
			Connections[user].socket.emit("sessionOptions", {
				virtualPlayersData: this.getSortedHumanPlayers(),
			});
			Connections[user].socket.emit("startRochesterDraft", this.rochesterDraftState.syncData());
		}

		this.initLogs("Rochester Draft");
		for (let userID in this.draftLog.users) this.draftLog.users[userID].picks = [];

		return true;
	}

	endRochesterDraft() {
		logSession("RochesterDraft", this);
		for (let uid of this.users) {
			this.draftLog.users[uid].cards = Connections[uid].pickedCards.map(c => c.id);
			Connections[uid].socket.emit("rochesterDraftEnd");
		}
		this.sendLogs();
		this.rochesterDraftState = null;
		this.drafting = false;
		this.disconnectedUsers = {};
	}

	rochesterDraftNextRound() {
		const s = this.rochesterDraftState;
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

	rochesterDraftPick(idx) {
		const s = this.rochesterDraftState;
		if (!this.drafting || !s) return false;

		Connections[s.currentPlayer()].pickedCards.push(s.boosters[0][idx]);

		this.draftLog.users[s.currentPlayer()].picks.push({
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
	startDraft() {
		this.drafting = true;
		this.emitMessage("Preparing draft!", "Your draft will start soon...", false, 0);

		let boosterQuantity = (this.users.size + this.bots) * this.boostersPerPlayer;
		console.log(`Session ${this.id}: Starting draft! (${this.users.size} players)`);

		this.disconnectedUsers = {};
		// Generate bots
		this.botsInstances = [];
		for (let i = 0; i < this.bots; ++i) this.botsInstances.push(new Bot(`Bot #${i + 1}`, uuidv1()));

		if (!this.generateBoosters(boosterQuantity, { useCustomBoosters: true })) {
			this.drafting = false;
			return;
		}

		// Draft Log initialization
		this.initLogs("Draft");
		this.draftLog.teamDraft = this.teamDraft;
		for (let userID in this.draftLog.users) this.draftLog.users[userID].picks = [];

		let virtualPlayers = this.getSortedVirtualPlayers();
		for (let user of this.users) {
			Connections[user].pickedCards = [];
			Connections[user].socket.emit("sessionOptions", {
				virtualPlayersData: virtualPlayers,
			});
			Connections[user].socket.emit("startDraft");
		}

		if (!this.ownerIsPlayer && this.owner in Connections) {
			Connections[this.owner].socket.emit("sessionOptions", {
				virtualPlayersData: virtualPlayers,
			});
			Connections[this.owner].socket.emit("startDraft");
			// Update draft log for live display if owner in not playing
			if (["owner", "everyone"].includes(this.draftLogRecipients)) {
				Connections[this.owner].socket.emit("draftLogLive", { log: this.draftLog });
			}
		}

		this.round = 0;
		this.boosterNumber = 1;
		this.nextBooster();
	}

	pickCard(userID, pickedCards, burnedCards) {
		if (!this.drafting || !this.users.has(userID)) return;

		const reportError = (code, err) => {
			console.error(err);
			return { code: code, error: err };
		};

		const boosterIndex = Connections[userID].boosterIndex;
		if (typeof boosterIndex === "undefined" || boosterIndex < 0 || boosterIndex >= this.boosters.length)
			return reportError(2, `Session.pickCard: boosterIndex ('${boosterIndex}') out of bounds.`);
		if (
			!pickedCards ||
			pickedCards.length !== Math.min(this.pickedCardsPerRound, this.boosters[boosterIndex].length)
		)
			return reportError(
				1,
				`Session.pickCard: Invalid picked cards (pickedCards: ${pickedCards}, booster length: ${this.boosters[boosterIndex].length}).`
			);
		if (pickedCards.some(idx => idx >= this.boosters[boosterIndex].length))
			return reportError(
				3,
				`Session.pickCard: Invalid card index [${pickedCards.join(", ")}] for booster #${boosterIndex} (${
					this.boosters[boosterIndex].length
				}).`
			);
		if (Connections[userID].pickedThisRound)
			return reportError(4, `Session.pickCard: User '${userID}' already picked a card this round.`);
		if (
			burnedCards &&
			(burnedCards.length > this.burnedCardsPerRound ||
				burnedCards.length !==
					Math.min(this.burnedCardsPerRound, this.boosters[boosterIndex].length - pickedCards.length) ||
				burnedCards.some(idx => idx >= this.boosters[boosterIndex].length))
		)
			return reportError(
				5,
				`Session.pickCard: Invalid burned cards (expected length: ${this.burnedCardsPerRound}, burnedCards: ${burnedCards.length}, booster: ${this.boosters[boosterIndex].length}).`
			);

		console.log(
			`Session ${this.id}: ${Connections[userID].userName} [${userID}] picked card '${pickedCards.map(
				idx => this.boosters[boosterIndex][idx].name
			)}' from booster #${boosterIndex}, burning ${
				burnedCards && burnedCards.length > 0 ? burnedCards.length : "nothing"
			}.`
		);

		for (let idx of pickedCards) Connections[userID].pickedCards.push(this.boosters[boosterIndex][idx]);
		Connections[userID].pickedThisRound = true;

		const pickData = {
			pick: pickedCards,
			burn: burnedCards,
			booster: this.boosters[boosterIndex].map(c => c.id),
		};
		this.draftLog.users[userID].picks.push(pickData);

		let cardsToRemove = pickedCards;
		if (burnedCards) cardsToRemove = cardsToRemove.concat(burnedCards);
		cardsToRemove.sort((a, b) => b - a); // Remove last index first to avoid shifting indices

		// Signal users
		this.forUsers(u => {
			Connections[u].socket.emit("updateUser", {
				userID: userID,
				updatedProperties: {
					pickedThisRound: true,
				},
			});
		});

		// Update draft log for live display if owner in not playing (Do this before removing the cards, damnit!)
		if (
			!this.ownerIsPlayer &&
			["owner", "everyone"].includes(this.draftLogRecipients) &&
			this.owner in Connections
		) {
			Connections[this.owner].socket.emit("draftLogLive", { userID: userID, pick: pickData });
			Connections[this.owner].socket.emit("pickAlert", {
				userName: Connections[userID].userName,
				cards: pickedCards.map(idx => this.boosters[boosterIndex][idx]),
			});
		}

		for (let idx of cardsToRemove) this.boosters[boosterIndex].splice(idx, 1);

		++this.pickedCardsThisRound;
		if (this.pickedCardsThisRound === this.getHumanPlayerCount()) {
			this.nextBooster();
		}
		return { code: 0 };
	}

	doBotPick(instance, boosterIndex) {
		const startingBooster = this.boosters[boosterIndex].map(c => c.id);
		const pickedIndices = [];
		const pickedCards = [];
		for (let i = 0; i < this.pickedCardsPerRound && this.boosters[boosterIndex].length > 0; ++i) {
			const pickedIdx = instance.pick(this.boosters[boosterIndex]);
			pickedIndices.push(pickedIdx);
			pickedCards.push(this.boosters[boosterIndex][pickedIdx]);
			this.boosters[boosterIndex].splice(pickedIdx, 1);
		}
		const burned = [];
		for (let i = 0; i < this.burnedCardsPerRound && this.boosters[boosterIndex].length > 0; ++i) {
			const burnedIdx = instance.burn(this.boosters[boosterIndex]);
			burned.push(burnedIdx);
			this.boosters[boosterIndex].splice(burnedIdx, 1);
		}
		this.draftLog.users[instance.id].picks.push({
			pick: pickedIndices,
			burn: burned,
			booster: startingBooster,
		});
		return pickedCards;
	}

	nextBooster() {
		this.stopCountdown();

		const totalVirtualPlayers = this.getVirtualPlayersCount();

		// Boosters are empty
		if (this.boosters[0].length === 0) {
			this.round = 0;
			// Remove empty boosters
			this.boosters.splice(0, totalVirtualPlayers);
			++this.boosterNumber;
		}

		// End draft if there is no more booster to distribute
		if (this.boosters.length == 0) {
			this.endDraft();
			return;
		}

		this.pickedCardsThisRound = 0; // Only counting cards picked by human players (including disconnected ones)

		let index = 0;
		const boosterOffset = this.boosterNumber % 2 == 0 ? -this.round : this.round;

		let virtualPlayers = this.getSortedVirtualPlayers();
		for (let userID in virtualPlayers) {
			const boosterIndex = negMod(boosterOffset + index, totalVirtualPlayers);
			if (virtualPlayers[userID].isBot) {
				this.doBotPick(virtualPlayers[userID].instance, boosterIndex);
			} else {
				if (virtualPlayers[userID].disconnected) {
					// This user has been replaced by a bot, pick immediately
					if (!this.disconnectedUsers[userID].bot) {
						console.error("Trying to use bot that doesn't exist... That should not be possible!");
						console.error(this.disconnectedUsers[userID]);
						this.disconnectedUsers[userID].bot = new Bot("Bot", userID);
					}
					const pickedCards = this.doBotPick(this.disconnectedUsers[userID].bot, boosterIndex);
					this.disconnectedUsers[userID].pickedThisRound = true;
					this.disconnectedUsers[userID].pickedCards.push(...pickedCards);
					this.disconnectedUsers[userID].boosterIndex = boosterIndex;
					++this.pickedCardsThisRound;
				} else {
					Connections[userID].pickedThisRound = false;
					Connections[userID].boosterIndex = boosterIndex;
					Connections[userID].socket.emit("nextBooster", {
						booster: this.boosters[boosterIndex],
						boosterNumber: this.boosterNumber,
						pickNumber: this.round + 1,
					});
				}
			}
			++index;
		}

		if (!this.ownerIsPlayer && this.owner in Connections) {
			Connections[this.owner].socket.emit("nextBooster", {
				boosterNumber: this.boosterNumber,
				pickNumber: this.round + 1,
			});
		}

		this.startCountdown(); // Starts countdown now that everyone has their booster
		++this.round;

		// Everyone is disconnected...
		if (this.pickedCardsThisRound === this.getHumanPlayerCount()) this.nextBooster();
	}

	resumeDraft(msg) {
		if (!this.drafting) return;

		console.warn(`Restarting draft for session ${this.id}.`);

		this.forUsers(user =>
			Connections[user].socket.emit("sessionOptions", {
				virtualPlayersData: this.getSortedVirtualPlayers(),
			})
		);

		if (!this.winstonDraftState && !this.gridDraftState && !this.rochesterDraftState) {
			this.resumeCountdown();
		}
		this.emitMessage(msg.title, msg.text);
	}

	endDraft() {
		this.drafting = false;
		this.stopCountdown();

		let virtualPlayers = this.getSortedVirtualPlayers();
		for (let userID in virtualPlayers) {
			if (virtualPlayers[userID].isBot) {
				this.draftLog.users[userID].cards = virtualPlayers[userID].instance.cards.map(c => c.id);
			} else {
				// Has this user been replaced by a bot?
				this.draftLog.users[userID].cards = (virtualPlayers[userID].disconnected
					? this.disconnectedUsers[userID]
					: Connections[userID]
				).pickedCards.map(c => c.id);
			}
		}

		this.sendLogs();

		logSession("Draft", this);
		this.boosters = [];
		this.disconnectedUsers = {};

		this.forUsers(u => Connections[u].socket.emit("endDraft"));

		console.log(`Session ${this.id} draft ended.`);
	}

	pauseDraft() {
		if (!this.drafting || !this.countdownInterval) return;

		this.stopCountdown();
		this.forUsers(u => Connections[u].socket.emit("pauseDraft"));
	}
	///////////////////// Traditional Draft End  //////////////////////

	initLogs(type = "Draft") {
		const carddata = {};
		if (this.boosters) for (let c of this.boosters.flat()) carddata[c.id] = Cards[c.id];
		this.draftLog = {
			version: "2.0",
			type: type,
			sessionID: this.id,
			time: Date.now(),
			setRestriction: this.setRestriction,
			useCustomBoosters: this.useCustomBoosters,
			boosters: this.boosters.map(b => b.map(c => c.id)),
			carddata: carddata,
			users: {},
		};
		let virtualPlayers = type === "Draft" ? this.getSortedVirtualPlayers() : this.getSortedHumanPlayers();
		for (let userID in virtualPlayers) {
			if (virtualPlayers[userID].isBot) {
				this.draftLog.users[userID] = {
					isBot: true,
					userName: virtualPlayers[userID].instance.name,
					userID: virtualPlayers[userID].instance.id,
				};
			} else {
				this.draftLog.users[userID] = {
					userName: Connections[userID].userName,
					userID: userID,
				};
			}
		}
	}

	getStrippedLog() {
		const strippedLog = {
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
				this.forUsers(u => Connections[u].socket.emit("draftLog", this.draftLog));
				break;
		}
	}

	distributeSealed(boostersPerPlayer, customBoosters) {
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

		this.initLogs("Sealed");
		this.draftLog.customBoosters = customBoosters;

		let idx = 0;
		for (let userID of this.users) {
			const playersBoosters = [];
			let currIdx = idx;
			while (currIdx < this.boosters.length) {
				playersBoosters.push(this.boosters[currIdx]);
				currIdx += this.users.size;
			}
			Connections[userID].socket.emit("setCardSelection", playersBoosters);
			this.draftLog.users[userID].cards = playersBoosters.flat().map(c => c.id);
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

	distributeJumpstart() {
		this.emitMessage("Distributing jumpstart boosters...", "", false, 0);

		this.initLogs("Jumpstart");
		this.draftLog.carddata = {};

		for (let user of this.users) {
			let boosters = [getRandom(JumpstartBoosters), getRandom(JumpstartBoosters)];
			const cards = boosters
				.map(b => b.cards.map(cid => getUnique(cid)))
				.reduce((arr, val) => {
					arr.push(val);
					return arr;
				}, []);

			this.draftLog.users[user].cards = cards.flat().map(c => c.id);
			for (let cid of this.draftLog.users[user].cards) this.draftLog.carddata[cid] = Cards[cid];

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

		// If owner is not playing, let them know everything went ok.
		if (!this.ownerIsPlayer && this.owner in Connections) {
			Connections[this.owner].socket.emit("message", {
				title: "Jumpstart boosters successfly distributed!",
				showConfirmButton: false,
			});
		}

		logSession("Jumpstart", this);

		this.boosters = [];
	}

	reconnectUser(userID) {
		if (this.winstonDraftState || this.gridDraftState || this.rochesterDraftState) {
			Connections[userID].pickedCards = this.disconnectedUsers[userID].pickedCards;
			this.addUser(userID);

			let msgData = {};
			if (this.winstonDraftState) msgData = { name: "rejoinWinstonDraft", state: this.winstonDraftState };
			else if (this.gridDraftState) msgData = { name: "rejoinGridDraft", state: this.gridDraftState };
			else if (this.rochesterDraftState)
				msgData = { name: "rejoinRochesterDraft", state: this.rochesterDraftState };
			Connections[userID].socket.emit(msgData.name, {
				pickedCards: this.disconnectedUsers[userID].pickedCards,
				state: msgData.state.syncData(),
			});

			delete this.disconnectedUsers[userID];
		} else {
			Connections[userID].pickedThisRound = this.disconnectedUsers[userID].pickedThisRound;
			Connections[userID].pickedCards = this.disconnectedUsers[userID].pickedCards;
			Connections[userID].boosterIndex = this.disconnectedUsers[userID].boosterIndex;

			this.addUser(userID);
			Connections[userID].socket.emit("rejoinDraft", {
				pickedThisRound: this.disconnectedUsers[userID].pickedThisRound,
				pickedCards: this.disconnectedUsers[userID].pickedCards,
				booster: this.boosters[Connections[userID].boosterIndex],
				boosterNumber: this.boosterNumber,
				pickNumber: this.round,
			});
			delete this.disconnectedUsers[userID];
		}

		// Resume draft if everyone is here or broacast the new state.
		if (Object.keys(this.disconnectedUsers).length == 0)
			this.resumeDraft({ title: "Player reconnected", text: "Resuming draft..." });
		else this.broadcastDisconnectedUsers();
	}

	// Non-playing owner (organizer) is trying to reconnect, we just need to send them the current state
	reconnectOwner(userID) {
		if (userID !== this.owner || this.ownerIsPlayer) return;
		Connections[userID].sessionID = this.id;
		this.syncSessionOptions(userID);
		this.notifyUserChange();
		Connections[userID].socket.emit("sessionOptions", {
			virtualPlayersData: this.getSortedVirtualPlayers(),
		});
		if (this.drafting) {
			Connections[userID].socket.emit("startDraft");
			Connections[userID].socket.emit("nextBooster", {
				boosterNumber: this.boosterNumber,
				pickNumber: this.round,
			});
			// Update draft log for live display if owner in not playing
			if (["owner", "everyone"].includes(this.draftLogRecipients))
				Connections[userID].socket.emit("draftLogLive", { log: this.draftLog });
		}
	}

	replaceDisconnectedPlayers() {
		if (!this.drafting || this.winstonDraftState || this.gridDraftState) return;

		console.warn("Replacing disconnected players with bots!");

		for (let uid in this.disconnectedUsers) {
			this.disconnectedUsers[uid].bot = new Bot(`${this.disconnectedUsers[uid].userName} (Bot)`, uid);
			for (let c of this.disconnectedUsers[uid].pickedCards) {
				this.disconnectedUsers[uid].bot.pick([c]);
			}

			// Immediately pick cards
			if (!this.disconnectedUsers[uid].pickedThisRound) {
				const pickedCards = this.doBotPick(
					this.disconnectedUsers[uid].bot,
					this.disconnectedUsers[uid].boosterIndex
				);
				this.disconnectedUsers[uid].pickedCards.push(...pickedCards);
				this.disconnectedUsers[uid].pickedThisRound = true;
				++this.pickedCardsThisRound;
			}
		}

		this.forUsers(u =>
			Connections[u].socket.emit("sessionOptions", {
				virtualPlayersData: this.getSortedVirtualPlayers(),
			})
		);
		this.notifyUserChange();
		this.resumeCountdown();
		this.emitMessage("Resuming draft", `Disconnected player(s) has been replaced by bot(s).`);

		if (this.pickedCardsThisRound == this.getHumanPlayerCount()) this.nextBooster();
	}

	// Countdown Methods
	startCountdown() {
		let cardsPerBooster = 15;
		if (this.useCustomCardList && this.customCardList.customSheets)
			cardsPerBooster = Object.values(this.customCardList.cardsPerBooster).reduce((acc, c) => acc + c);
		let dec = Math.floor(this.maxTimer / cardsPerBooster);
		this.countdown = this.maxTimer - this.round * dec;
		this.resumeCountdown();
	}
	resumeCountdown() {
		this.stopCountdown(); // Cleanup if one is still running
		if (this.maxTimer <= 0) {
			// maxTimer <= 0 means no timer
			this.forUsers(u => Connections[u].socket.emit("disableTimer"));
		} else {
			// Immediately propagate current state
			this.forUsers(u =>
				Connections[u].socket.emit("timer", {
					countdown: this.countdown,
				})
			);
			// Connections[user].socket.emit('timer', { countdown: 0 }); // Easy Debug
			this.countdownInterval = setInterval(
				(sess => {
					return () => {
						sess.countdown--;
						this.forUsers(u =>
							Connections[u].socket.emit("timer", {
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
		let tmp = {};
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
			let tmp = {}; // We rely on the order of addition to this object. I know.
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

	emitMessage(title, text, showConfirmButton = true, timer = 1500) {
		this.forUsers(u =>
			Connections[u].socket.emit("message", {
				title: title,
				text: text,
				showConfirmButton: showConfirmButton,
				timer: timer,
			})
		);
	}

	emitError(title, text, showConfirmButton = true, timer = 0) {
		Connections[this.owner].socket.emit("message", {
			icon: "error",
			title: title,
			text: text,
			showConfirmButton: showConfirmButton,
			timer: timer,
		});
	}

	generateBracket(players) {
		if (this.teamDraft) {
			this.bracket = new TeamBracket(players);
		} else {
			this.bracket = new Bracket(players);
		}
		this.forUsers(u => Connections[u].socket.emit("sessionOptions", { bracket: this.bracket }));
	}

	generateSwissBracket(players) {
		this.bracket = new SwissBracket(players);
		this.forUsers(u => Connections[u].socket.emit("sessionOptions", { bracket: this.bracket }));
	}

	generateDoubleBracket(players) {
		this.bracket = new DoubleBracket(players);
		this.forUsers(u => Connections[u].socket.emit("sessionOptions", { bracket: this.bracket }));
	}

	updateBracket(results) {
		if (!this.bracket) return false;
		this.bracket.results = results;
		this.forUsers(u => Connections[u].socket.emit("sessionOptions", { bracket: this.bracket }));
	}

	shareDecklist(userID, decklist) {
		if (this.draftLog === undefined || this.draftLog.users[userID] === undefined) {
			console.log("Cannot find log for shared decklist.");
			return;
		}
		decklist = computeHashes(decklist);
		this.draftLog.users[userID].decklist = decklist;
		this.forUsers(uid => {
			Connections[uid].socket.emit("shareDecklist", {
				sessionID: this.id,
				time: this.draftLog.time,
				userID: userID,
				decklist: decklist,
			});
		});
	}

	// Execute fn for each user. Owner included even if they're not playing.
	forUsers(fn) {
		if (!this.ownerIsPlayer && this.owner in Connections) fn(this.owner);
		for (let user of this.users) fn(user);
	}
	forNonOwners(fn) {
		for (let uid of this.users) if (uid !== this.owner) fn(uid);
	}
}

export let Sessions = {};

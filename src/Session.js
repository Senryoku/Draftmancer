"use strict";

import uuidv1 from "uuid/v1.js";
import constants from "../client/src/data/constants.json";
import { pickCard, countCards } from "./cardUtils.js";
import { negMod, isEmpty, shuffleArray, getRandom, arrayIntersect } from "./utils.js";
import { Connections } from "./Connection.js";
import Cards from "./Cards.js";
import Bot from "./Bot.js";
import { BasicLandSlots, SpecialLandSlots } from "./LandSlot.js";
import { BoosterFactory, generateColorBalancedSlot, SetSpecificFactories } from "./BoosterFactory.js";
import JumpstartBoosters from "../data/JumpstartBoosters.json";
Object.freeze(JumpstartBoosters);
import { logSession } from "./Persistence.js";

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
	"colorBalance",
	"maxDuplicates",
	"foil",
	"useCustomCardList",
	"customCardList",
	"distributionMode",
	"customBoosters",
	"burnedCardsPerRound",
	"draftLogRecipients",
	"bracketLocked",
];

function Bracket(players) {
	this.players = players;
	this.results = [
		[0, 0],
		[0, 0],
		[0, 0],
		[0, 0],
		[0, 0],
		[0, 0],
		[0, 0],
	];
}

function TeamBracket(players) {
	this.players = players;
	this.results = [
		[0, 0],
		[0, 0],
		[0, 0],
		[0, 0],
		[0, 0],
		[0, 0],
		[0, 0],
		[0, 0],
		[0, 0],
	];
	this.teamDraft = true;
}

function SwissBracket(players) {
	this.players = players;
	this.results = [
		[0, 0],
		[0, 0],
		[0, 0],
		[0, 0],
		[0, 0],
		[0, 0],
		[0, 0],
		[0, 0],
		[0, 0],
		[0, 0],
		[0, 0],
		[0, 0],
	];
	this.swiss = true;
}

// Cache for cards organized by set.
const BoosterCardsBySet = {};
for (let cid in Cards) {
	if (Cards[cid].in_booster) {
		if (!(Cards[cid].set in BoosterCardsBySet)) BoosterCardsBySet[Cards[cid].set] = [];
		BoosterCardsBySet[Cards[cid].set].push(cid);
	}
}

export function WinstonDraftState(players, boosters) {
	this.players = players;
	this.round = -1; // Will be immedialty incremented
	this.cardPool = [];
	if (boosters) {
		for (let booster of boosters) this.cardPool.push(...booster);
		shuffleArray(this.cardPool);
	}
	if (this.cardPool.length >= 3) this.piles = [[this.cardPool.pop()], [this.cardPool.pop()], [this.cardPool.pop()]];
	this.currentPile = 0;

	this.currentPlayer = function() {
		return this.players[this.round % 2];
	};
	this.syncData = function() {
		return {
			round: this.round,
			currentPlayer: this.currentPlayer(),
			piles: this.piles,
			currentPile: this.currentPile,
			remainingCards: this.cardPool.length,
		};
	};
}

export function GridDraftState(players, boosters) {
	this.players = players;
	this.round = 0;
	this.boosters = []; // 3x3 Grid, Row-Major order
	if (boosters) {
		for (let booster of boosters) {
			if (booster.length > 9) booster.length = 9;
			if (booster.length < 9) this.error = true;
			shuffleArray(booster);
			this.boosters.push(booster);
		}
	}
	this.boosterCount = this.boosters.length;

	this.currentPlayer = function() {
		return this.players[[0, 1, 1, 0][this.round % 4]];
	};
	this.syncData = function() {
		return {
			round: this.round,
			currentPlayer: this.currentPlayer(),
			booster: this.boosters[0],
			boosterCount: this.boosterCount,
		};
	};
}

export function RochesterDraftState(players, boosters) {
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

	this.currentPlayer = function() {
		const startingDirection = Math.floor(this.boosterNumber / this.players.length) % 2;
		const direction = Math.floor(this.pickNumber / this.players.length) % 2;
		const offset = direction
			? this.players.length - 1 - (this.pickNumber % this.players.length)
			: this.pickNumber % this.players.length;
		return this.players[negMod(this.boosterNumber + (startingDirection ? 1 : -1) * offset, this.players.length)];
	};
	this.syncData = function() {
		return {
			pickNumber: this.pickNumber,
			boosterNumber: this.boosterNumber,
			currentPlayer: this.currentPlayer(),
			booster: this.boosters[0],
			boosterCount: this.boosterCount,
		};
	};
}

export function Session(id, owner, options) {
	this.id = id;
	this.owner = owner;
	this.users = new Set();
	this.userOrder = [];

	// Options
	this.ownerIsPlayer = true;
	this.setRestriction = [constants.MTGSets[constants.MTGSets.length - 1]];
	this.isPublic = false;
	this.description = "";
	this.ignoreCollections = false;
	this.boostersPerPlayer = 3;
	this.teamDraft = false;
	this.bots = 0;
	this.maxTimer = 75;
	this.maxPlayers = 8;
	this.mythicPromotion = true;
	this.boosterContent = {
		common: 10,
		uncommon: 3,
		rare: 1,
	};
	this.colorBalance = true;
	this.maxDuplicates = {
		common: 16,
		uncommon: 8,
		rare: 4,
		mythic: 2,
	};
	this.foil = false;
	this.useCustomCardList = false;
	this.customCardList = {};
	this.distributionMode = "regular"; // Specifies how boosters are distributed when using boosters from different sets (see customBoosters)
	this.customBoosters = ["", "", ""]; // Specify a set for an individual booster (Draft Only)
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

	this.addUser = function(userID) {
		if (this.users.has(userID)) {
			console.error(`Session::addUser: this.users.has(${userID})`);
		}

		Connections[userID].sessionID = this.id;
		this.users.add(userID);
		if (this.userOrder.indexOf(userID) < 0)
			this.userOrder.splice(Math.floor(Math.random() * (this.userOrder.length + 1)), 0, userID);
		this.notifyUserChange();
		this.syncSessionOptions(userID);
	};

	this.getDisconnectedUserData = function(userID) {
		return {
			userName: Connections[userID].userName,
			pickedThisRound: Connections[userID].pickedThisRound,
			pickedCards: Connections[userID].pickedCards,
			boosterIndex: Connections[userID].boosterIndex,
		};
	};

	this.broadcastDisconnectedUsers = function() {
		const disconnectedUserNames = Object.keys(this.disconnectedUsers).map(u => this.disconnectedUsers[u].userName);
		this.forUsers(u =>
			Connections[u].socket.emit("userDisconnected", {
				owner: this.owner,
				disconnectedUserNames: disconnectedUserNames,
			})
		);
	};

	this.remUser = function(userID) {
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
	};

	this.setBoostersPerPlayer = function(boostersPerPlayer) {
		if (this.boostersPerPlayer != boostersPerPlayer) {
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
	};

	this.setTeamDraft = function(teamDraft) {
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
	};

	this.setSeating = function(seating) {
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
	};

	this.randomizeSeating = function() {
		if (this.drafting) return false;
		shuffleArray(this.userOrder);
		this.notifyUserChange();
		return true;
	};

	this.syncSessionOptions = function(userID) {
		const options = {
			sessionOwner: this.owner,
			bracket: this.bracket,
		};
		for (let p of optionProps) options[p] = this[p];
		Connections[userID].socket.emit("sessionOptions", options);
	};

	// Returns current card pool according to all session options (Collections, setRestrictions...)
	this.cardPool = function() {
		const user_list = [...this.users];
		let cardPool = {};

		// If none of the user has uploaded their collection/doesn't want to use it, or the ignoreCollections flag is set, return all cards.
		let all_cards = true;
		for (let i = 0; i < user_list.length; ++i) {
			all_cards =
				all_cards &&
				(!Connections[user_list[i]].useCollection || isEmpty(Connections[user_list[i]].collection));
		}

		if (this.ignoreCollections || all_cards) {
			// Returns all cards if there's no set restriction
			if (this.setRestriction.length === 0) {
				for (let c in Cards) if (Cards[c].in_booster) cardPool[c] = this.maxDuplicates[Cards[c].rarity];
			} else {
				// Use cache otherwise
				for (let set of this.setRestriction)
					for (let c of BoosterCardsBySet[set]) cardPool[c] = this.maxDuplicates[Cards[c].rarity];
			}
			return cardPool;
		}

		// Restricts collection according to this.setRestriction
		cardPool = this.collection();
		if (this.setRestriction.length > 0) {
			for (let c in cardPool) {
				if (!this.setRestriction.includes(Cards[c].set)) delete cardPool[c];
			}
		}
		return cardPool;
	};

	// Compute user collections intersection (taking into account each user preferences)
	this.collection = function() {
		const user_list = [...this.users];
		let intersection = [];
		let collection = {};

		let useCollection = [];
		for (let i = 0; i < user_list.length; ++i)
			useCollection[i] =
				Connections[user_list[i]].useCollection && !isEmpty(Connections[user_list[i]].collection);

		let arrays = [];
		// Start from the first user's collection, or the list of all cards if not available/used
		if (!useCollection[0]) arrays.push(Object.keys(Cards).filter(c => Cards[c].in_booster));
		else arrays.push(Object.keys(Connections[user_list[0]].collection).filter(c => Cards[c].in_booster));
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
	};

	// Categorize card pool by rarity
	this.cardPoolByRarity = function() {
		const cardPoolByRarity = {
			common: {},
			uncommon: {},
			rare: {},
			mythic: {},
		};
		const cardPool = this.cardPool();
		for (let c in cardPool) cardPoolByRarity[Cards[c].rarity][c] = cardPool[c];
		return cardPoolByRarity;
	};

	// Returns all cards from specified set categorized by rarity and set to maxDuplicates
	this.setByRarity = function(set) {
		let local = {
			common: {},
			uncommon: {},
			rare: {},
			mythic: {},
		};
		for (let id of BoosterCardsBySet[set]) local[Cards[id].rarity][id] = this.maxDuplicates[Cards[id].rarity];
		return local;
	};

	// Populates this.boosters following session options
	// Options object properties:
	//  - useCustomBoosters: Explicitly enables the use of the CustomBooster option (ignored otherwise)
	//      WARNING (FIXME?): boosterQuantity will be ignored if useCustomBoosters is set and we're not using a customCardList
	//  - targets: Overrides session boosterContent setting
	//  - cardsPerBooster: Overrides session setting for cards per booster using custom card lists whitout custom slots
	this.generateBoosters = function(boosterQuantity, options = {}) {
		if (this.useCustomCardList) {
			if (!this.customCardList.cards) {
				this.emitMessage("Error generating boosters", "No custom card list provided.");
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
						this.emitMessage("Error generating boosters", msg);
						console.warn(msg);
						return false;
					}
				}

				const cardsByColor = {};
				// Color balance the largest slot
				const colorBalancedSlot = Object.keys(this.customCardList.cardsPerBooster).reduce((max, curr) =>
					this.customCardList.cardsPerBooster[curr] > this.customCardList.cardsPerBooster[max] ? curr : max
				);
				// Do not color balance if we don't have at least a 5 cards slot
				const useColorBalance =
					this.colorBalance && this.customCardList.cardsPerBooster[colorBalancedSlot] >= 5;
				if (useColorBalance) {
					for (let card in cardsByRarity[colorBalancedSlot]) {
						if (!(Cards[card].colors in cardsByColor)) cardsByColor[Cards[card].colors] = {};
						cardsByColor[Cards[card].colors][card] = cardsByRarity[colorBalancedSlot][card];
					}
				}

				// Generate Boosters
				this.boosters = [];
				for (let i = 0; i < boosterQuantity; ++i) {
					let booster = [];

					for (let r in this.customCardList.cardsPerBooster) {
						if (useColorBalance && r === colorBalancedSlot) {
							const slot = generateColorBalancedSlot(
								this.customCardList.cardsPerBooster[r],
								cardsByRarity[colorBalancedSlot],
								cardsByColor
							);
							booster = booster.concat(slot);
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

				const cardsPerBooster = options.cardsPerBooster || 15;
				let cardsByColor = {};
				if (this.colorBalance) {
					for (let card in localCollection) {
						if (!(Cards[card].colors in cardsByColor)) cardsByColor[Cards[card].colors] = {};
						cardsByColor[Cards[card].colors][card] = localCollection[card];
					}
				}

				let card_count = countCards(localCollection);
				let card_target = cardsPerBooster * boosterQuantity;
				if (card_count < card_target) {
					const msg = `Not enough cards (${card_count}/${card_target}) in custom list.`;
					this.emitMessage("Error generating boosters", msg);
					console.warn(msg);
					return false;
				}

				this.boosters = [];
				for (let i = 0; i < boosterQuantity; ++i) {
					let booster = [];

					if (this.colorBalance) {
						booster = generateColorBalancedSlot(cardsPerBooster, localCollection, cardsByColor);
					} else {
						for (let i = 0; i < cardsPerBooster; ++i) {
							const pickedCard = pickCard(localCollection, booster);
							booster.push(pickedCard);
						}
					}

					this.boosters.push(booster);
				}
			}
		} else {
			// Standard draft boosters
			const targets = options.targets || this.boosterContent;

			const BoosterFactoryOptions = {
				foil: this.foil,
				colorBalance: this.colorBalance,
				mythicPromotion: this.mythicPromotion,
				onError: (...args) => {
					this.emitMessage(...args);
				},
			};

			let defaultFactory = null;

			const getBoosterFactory = function(set, cardPool, landSlot, options) {
				// Check for a special booster factory
				return set && set in SetSpecificFactories
					? SetSpecificFactories[set](cardPool, landSlot, options)
					: new BoosterFactory(cardPool, landSlot, options);
			};

			// If the default rule will be used, initialize it
			if (!options.useCustomBoosters || !this.customBoosters.every(v => v !== "")) {
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
						this.emitMessage("Error generating boosters", msg);
						console.warn(msg);
						return false;
					}
				}
			}

			// Do we have some booster specific rules? (total boosterQuantity is ignored in this case)
			if (options.useCustomBoosters && this.customBoosters.some(v => v !== "")) {
				const boosterFactories = [];
				const usedSets = {};

				// If randomized, we'll have to make sure all boosters are of the same size: Adding a land slot to the default rule.
				const addLandSlot =
					this.distributionMode !== "regular" || this.customBoosters.some(v => v === "random");
				if (addLandSlot && defaultFactory && !defaultFactory.landSlot)
					defaultFactory.landSlot =
						this.setRestriction.length === 0
							? BasicLandSlots["m20"] // Totally arbitrary
							: BasicLandSlots[this.setRestriction[0]];

				for (let i = 0; i < this.getVirtualPlayersCount(); ++i) {
					const playerBoosterFactories = [];
					for (let boosterSet of this.customBoosters) {
						// No specific rules
						if (boosterSet === "") {
							playerBoosterFactories.push(defaultFactory);
						} else {
							if (boosterSet === "random") {
								// Random booster from one of the sets in Card Pool
								boosterSet =
									this.setRestriction.length === 0
										? getRandom(constants.MTGSets)
										: getRandom(this.setRestriction);
							}
							// Compile necessary data for this set (Multiple boosters of the same set will share it)
							if (!usedSets[boosterSet]) {
								// As booster distribution and sets can be randomized, we have to make sure that every booster are of the same size: We'll use basic land slot if we have to.
								const landSlot =
									boosterSet in SpecialLandSlots
										? SpecialLandSlots[boosterSet]
										: addLandSlot
										? BasicLandSlots[boosterSet]
										: null;
								usedSets[boosterSet] = getBoosterFactory(
									boosterSet,
									this.setByRarity(boosterSet),
									landSlot,
									BoosterFactoryOptions
								);
								// Check if we have enough card, considering maxDuplicate is a limiting factor
								const multiplier = this.customBoosters.reduce(
									(a, v) => (v == boosterSet ? a + 1 : a),
									0
								);
								if (
									countCards(usedSets[boosterSet].cardPool["common"]) <
										multiplier * this.getVirtualPlayersCount() * targets["common"] ||
									countCards(usedSets[boosterSet].cardPool["uncommon"]) <
										multiplier * this.getVirtualPlayersCount() * targets["uncommon"] ||
									countCards(usedSets[boosterSet].cardPool["rare"]) +
										countCards(usedSets[boosterSet].cardPool["mythic"]) <
										multiplier * this.getVirtualPlayersCount() * targets["rare"]
								) {
									const msg = `Not enough cards in card pool for individual booster restriction '${boosterSet}'. Please check you Max. Duplicates setting.`;
									this.emitMessage("Error generating boosters", msg, true, 0);
									console.warn(msg);
									return false;
								}
							}
							playerBoosterFactories.push(usedSets[boosterSet]);
						}
					}
					boosterFactories.push(playerBoosterFactories);
				}

				// Generate Boosters
				this.boosters = [];
				// Implements distribution mode 'shufflePlayerBoosters'
				if (this.distributionMode === "shufflePlayerBoosters")
					for (let rules of boosterFactories) shuffleArray(rules);

				for (let b = 0; b < this.boostersPerPlayer; ++b) {
					for (let p = 0; p < this.getVirtualPlayersCount(); ++p) {
						const rule = boosterFactories[p][b];
						const booster = rule.generateBooster(targets);
						if (booster) this.boosters.push(booster);
						else return false;
					}
				}

				if (this.distributionMode === "shuffleBoosterPool") shuffleArray(this.boosters);
			} else {
				this.boosters = [];
				for (let i = 0; i < boosterQuantity; ++i) {
					let booster = defaultFactory.generateBooster(targets);
					if (booster) this.boosters.push(booster);
					else return false;
				}
			}
		}
		return true;
	};

	this.notifyUserChange = function() {
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
	};

	///////////////////// Winston Draft //////////////////////

	this.startWinstonDraft = function(boosterCount) {
		if (this.users.size != 2) return false;
		this.drafting = true;
		this.emitMessage("Preparing Winston draft!", "Your draft will start soon...", false, 0);
		if (!this.generateBoosters(boosterCount)) {
			this.drafting = false;
			return;
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
		this.winstonNextRound();
		return true;
	};

	this.endWinstonDraft = function() {
		logSession("WinstonDraft", this);
		for (let user of this.users) Connections[user].socket.emit("winstonDraftEnd");
		this.winstonDraftState = null;
		this.drafting = false;
		this.disconnectedUsers = {};
	};

	this.winstonNextRound = function() {
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
	};

	this.winstonSkipPile = function() {
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
			Connections[s.currentPlayer()].socket.emit("winstonDraftRandomCard", s.cardPool.pop());
			this.winstonNextRound();
		} else {
			++s.currentPile;
			if (s.piles[s.currentPile].length === 0) this.winstonSkipPile();
			else for (let user of this.users) Connections[user].socket.emit("winstonDraftSync", s.syncData());
		}
		return true;
	};

	this.winstonTakePile = function() {
		const s = this.winstonDraftState;
		if (!this.drafting || !s) return false;
		Connections[s.currentPlayer()].pickedCards = Connections[s.currentPlayer()].pickedCards.concat(
			s.piles[s.currentPile]
		);
		if (s.cardPool.length > 0) s.piles[s.currentPile] = [s.cardPool.pop()];
		else s.piles[s.currentPile] = [];
		this.winstonNextRound();
		return true;
	};

	///////////////////// Winston Draft End //////////////////////

	///////////////////// Grid Draft //////////////////////

	this.startGridDraft = function(boosterCount) {
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
			return;
		}

		this.disconnectedUsers = {};
		this.gridDraftState = new GridDraftState(this.getSortedHumanPlayersIDs(), this.boosters);
		for (let user of this.users) {
			Connections[user].pickedCards = [];
			Connections[user].socket.emit("sessionOptions", {
				virtualPlayersData: this.getSortedHumanPlayers(),
			});
			Connections[user].socket.emit("startGridDraft", this.gridDraftState.syncData());
		}

		return true;
	};

	this.endGridDraft = function() {
		logSession("GridDraft", this);
		for (let user of this.users) Connections[user].socket.emit("gridDraftEnd");
		this.gridDraftState = null;
		this.drafting = false;
		this.disconnectedUsers = {};
	};

	this.gridDraftNextRound = function() {
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
	};

	this.gridDraftPick = function(choice) {
		const s = this.gridDraftState;
		if (!this.drafting || !s) return false;

		let pickedCards = 0;
		for (let i = 0; i < 3; ++i) {
			//                     Column           Row
			let idx = choice < 3 ? 3 * i + choice : 3 * (choice - 3) + i;
			if (s.boosters[0][idx] > 0) {
				Connections[s.currentPlayer()].pickedCards.push(s.boosters[0][idx]);
				s.boosters[0][idx] = -1;
				++pickedCards;
			}
		}

		if (pickedCards === 0) return false;

		this.gridDraftNextRound();
		return true;
	};

	///////////////////// Grid Draft End //////////////////////

	///////////////////// Rochester Draft //////////////////////

	this.startRochesterDraft = function() {
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

		return true;
	};

	this.endRochesterDraft = function() {
		logSession("RochesterDraft", this);
		for (let user of this.users) Connections[user].socket.emit("rochesterDraftEnd");
		this.rochesterDraftState = null;
		this.drafting = false;
		this.disconnectedUsers = {};
	};

	this.rochesterDraftNextRound = function() {
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
	};

	this.rochesterDraftPick = function(idx) {
		const s = this.rochesterDraftState;
		if (!this.drafting || !s) return false;

		const cid = s.boosters[0][idx];
		Connections[s.currentPlayer()].pickedCards.push(cid);
		s.boosters[0].splice(idx, 1);
		/*
		const msg = {
			author: s.currentPlayer(),
			timestamp: Date.now(),
			text: `I picked ${Cards[cid].name}!`,
		};
		this.forUsers(user => Connections[user].socket.emit("chatMessage", msg));
		*/
		this.rochesterDraftNextRound();
		return true;
	};

	///////////////////// Rochester Draft End //////////////////////

	///////////////////// Traditional Draft Methods //////////////////////

	this.startDraft = function() {
		this.drafting = true;
		this.emitMessage("Preparing draft!", "Your draft will start soon...", false, 0);

		// boostersPerPlayer works fine, what's the problem here?...
		if (typeof this.bots != "number") {
			this.bots = parseInt(this.bots);
		}

		let boosterQuantity = (this.users.size + this.bots) * this.boostersPerPlayer;
		console.log(`Session ${this.id}: Starting draft! (${this.users.size} players)`);

		this.disconnectedUsers = {};
		// Generate bots
		this.botsInstances = [];
		for (let i = 0; i < this.bots; ++i) this.botsInstances.push(new Bot(`Bot #${i}`, uuidv1()));

		if (!this.generateBoosters(boosterQuantity, { useCustomBoosters: true })) {
			this.drafting = false;
			return;
		}

		// Draft Log initialization
		this.draftLog = {
			sessionID: this.id,
			time: Date.now(),
			setRestriction: this.setRestriction,
			boosters: JSON.parse(JSON.stringify(this.boosters)),
			users: {},
			teamDraft: this.teamDraft,
		};
		let virtualPlayers = this.getSortedVirtualPlayers();
		for (let userID in virtualPlayers) {
			if (virtualPlayers[userID].isBot) {
				this.draftLog.users[userID] = {
					isBot: true,
					userName: virtualPlayers[userID].instance.name,
					userID: virtualPlayers[userID].instance.id,
					picks: [],
				};
			} else {
				this.draftLog.users[userID] = {
					userName: Connections[userID].userName,
					userID: userID,
					picks: [],
				};
			}
		}

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
				Connections[this.owner].socket.emit("draftLogLive", this.draftLog);
			}
		}

		this.round = 0;
		this.boosterNumber = 1;
		this.nextBooster();
	};

	this.pickCard = function(userID, cardID, burnedCards) {
		if (!this.drafting || !this.users.has(userID)) return;

		const boosterIndex = Connections[userID].boosterIndex;
		if (typeof boosterIndex === "undefined" || boosterIndex < 0 || boosterIndex >= this.boosters.length) {
			const err = `Session.pickCard: boosterIndex ('${boosterIndex}') out of bounds.`;
			console.error(err);
			return { code: 2, error: err };
		}
		if (!this.boosters[boosterIndex].includes(cardID)) {
			const err = `Session.pickCard: cardID ('${cardID}') not found in booster #${boosterIndex}.`;
			console.error(err);
			return { code: 3, error: err };
		}
		if (Connections[userID].pickedThisRound) {
			const err = `Session.pickCard: User '${userID}' already picked a card this round.`;
			console.error(err);
			return { code: 4, error: err };
		}

		if (
			burnedCards &&
			(burnedCards.length > this.burnedCardsPerRound ||
			(burnedCards.length !== this.burnedCardsPerRound &&
				this.boosters[boosterIndex].length !== 1 + burnedCards.length) || // If there's enough cards left, the proper amount of burned card should be supplied
				burnedCards.some(c => !this.boosters[boosterIndex].includes(c)))
		) {
			const err = `Session.pickCard: Invalid burned cards.`;
			console.error(err);
			return { code: 1, error: err };
		}

		console.log(
			`Session ${this.id}: ${
				Connections[userID].userName
			} [${userID}] picked card ${cardID} from booster #${boosterIndex}, burning ${
				burnedCards && burnedCards.length > 0 ? burnedCards : "nothing"
			}.`
		);

		this.draftLog.users[userID].picks.push({
			pick: cardID,
			burn: burnedCards,
			booster: JSON.parse(JSON.stringify(this.boosters[boosterIndex])),
		});

		Connections[userID].pickedCards.push(cardID);
		Connections[userID].pickedThisRound = true;
		// Removes the first occurence of cardID
		this.boosters[boosterIndex].splice(
			this.boosters[boosterIndex].findIndex(c => c === cardID),
			1
		);

		// Removes burned cards
		if (burnedCards) {
			for (let burnID of burnedCards) {
				this.boosters[boosterIndex].splice(
					this.boosters[boosterIndex].findIndex(c => c === burnID),
					1
				);
			}
		}

		// Signal users
		this.forUsers(u => {
			Connections[u].socket.emit("updateUser", {
				userID: userID,
				updatedProperties: {
					pickedThisRound: true,
				},
			});
		});

		// Update draft log for live display if owner in not playing
		if (
			!this.ownerIsPlayer &&
			["owner", "everyone"].includes(this.draftLogRecipients) &&
			this.owner in Connections
		) {
			Connections[this.owner].socket.emit("draftLogLive", this.draftLog);
			Connections[this.owner].socket.emit("pickAlert", {
				userName: Connections[userID].userName,
				cardID: cardID,
			});
		}

		++this.pickedCardsThisRound;
		if (this.pickedCardsThisRound == this.getHumanPlayerCount()) {
			this.nextBooster();
		}
		return { code: 0 };
	};

	this.doBotPick = function(instance, boosterIndex) {
		const removedIdx = instance.pick(this.boosters[boosterIndex]);
		const startingBooster = JSON.parse(JSON.stringify(this.boosters[boosterIndex]));
		const picked = this.boosters[boosterIndex][removedIdx];
		this.boosters[boosterIndex].splice(removedIdx, 1);
		const burned = [];
		for (let i = 0; i < this.burnedCardsPerRound; ++i) {
			const burnedIdx = instance.burn(this.boosters[boosterIndex]);
			burned.push(this.boosters[boosterIndex][burnedIdx]);
			this.boosters[boosterIndex].splice(burnedIdx, 1);
		}
		this.draftLog.users[instance.id].picks.push({
			pick: picked,
			burn: burned,
			booster: startingBooster,
		});
		return picked;
	};

	this.nextBooster = function() {
		this.stopCountdown();

		const totalVirtualPlayers = this.getVirtualPlayersCount();

		// Boosters are empty
		if (this.boosters[0].length == 0) {
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
		const evenRound = (this.boosters.length / totalVirtualPlayers) % 2 == 0;
		const boosterOffset = evenRound ? -this.round : this.round;

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
					const pickedCard = this.doBotPick(this.disconnectedUsers[userID].bot, boosterIndex);
					this.disconnectedUsers[userID].pickedThisRound = true;
					this.disconnectedUsers[userID].pickedCards.push(pickedCard);
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
	};

	this.resumeDraft = function(msg) {
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
	};

	this.endDraft = function() {
		this.drafting = false;
		this.stopCountdown();

		let virtualPlayers = this.getSortedVirtualPlayers();
		for (let userID in virtualPlayers) {
			if (virtualPlayers[userID].isBot) {
				this.draftLog.users[userID].cards = virtualPlayers[userID].instance.cards;
			} else {
				if (virtualPlayers[userID].disconnected) {
					// This user has been replaced by a bot
					this.draftLog.users[userID].cards = this.disconnectedUsers[userID].pickedCards;
				} else {
					this.draftLog.users[userID].cards = Connections[userID].pickedCards;
				}
			}
		}

		switch (this.draftLogRecipients) {
			case "none":
				break;
			case "owner":
				Connections[this.owner].socket.emit("draftLog", this.draftLog);
				break;
			default:
			case "delayed":
				this.draftLog.delayed = true;
				Connections[this.owner].socket.emit("draftLog", this.draftLog);
				break;
			case "everyone":
				this.forUsers(u => Connections[u].socket.emit("draftLog", this.draftLog));
				break;
		}

		logSession("Draft", this);
		this.boosters = [];
		this.disconnectedUsers = {};

		this.forUsers(u => Connections[u].socket.emit("endDraft"));

		console.log(`Session ${this.id} draft ended.`);
	};

	this.pauseDraft = function() {
		if (!this.drafting || !this.countdownInterval) return;

		this.stopCountdown();
		this.forUsers(u => Connections[u].socket.emit("pauseDraft"));
	};

	///////////////////// Traditional Draft End  //////////////////////

	this.distributeSealed = function(boostersPerPlayer) {
		this.emitMessage("Distributing sealed boosters...", "", false, 0);

		if (!this.generateBoosters(this.users.size * boostersPerPlayer)) return;

		let idx = 0;
		for (let user of this.users) {
			Connections[user].socket.emit(
				"setCardSelection",
				this.boosters.slice(idx * boostersPerPlayer, (idx + 1) * boostersPerPlayer)
			);
			++idx;
		}

		// If owner is not playing, let them know everything went ok.
		if (!this.ownerIsPlayer && this.owner in Connections) {
			Connections[this.owner].socket.emit("message", {
				title: "Sealed pools successfly distributed!",
				showConfirmButton: false,
			});
		}

		logSession("Sealed", this);

		this.boosters = [];
	};

	this.distributeJumpstart = function() {
		this.emitMessage("Distributing jumpstart boosters...", "", false, 0);

		for (let user of this.users) {
			let boosters = [getRandom(JumpstartBoosters), getRandom(JumpstartBoosters)];
			Connections[user].socket.emit(
				"setCardSelection",
				boosters
					.map(b => b.cards)
					.reduce((arr, val) => {
						arr.push(val);
						return arr;
					}, [])
			);
			Connections[user].socket.emit("message", {
				icon: "success",
				imageUrl: "/img/2JumpstartBoosters-min.png",
				title: "Here are your Jumpstart boosters!",
				text: `You got '${boosters[0].name}' and '${boosters[1].name}'.`,
				showConfirmButton: false,
				timer: 2000,
			});
		}

		// If owner is not playing, let them know everything went ok.
		if (!this.ownerIsPlayer && this.owner in Connections) {
			Connections[this.owner].socket.emit("message", {
				title: "Jumpstart boosters successfly distributed!",
				showConfirmButton: false,
			});
		}

		logSession("Jumpstart", this);

		this.boosters = [];
	};

	this.reconnectUser = function(userID) {
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
	};

	// Non-playing owner (organizer) is trying to reconnect, we just need to send them the current state
	this.reconnectOwner = function(userID) {
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
				Connections[userID].socket.emit("draftLogLive", this.draftLog);
		}
	};

	this.replaceDisconnectedPlayers = function() {
		if (!this.drafting || this.winstonDraftState || this.gridDraftState) return;

		console.warn("Replacing disconnected players with bots!");

		for (let uid in this.disconnectedUsers) {
			this.disconnectedUsers[uid].bot = new Bot(`${this.disconnectedUsers[uid].userName} (Bot)`, uid);
			for (let c of this.disconnectedUsers[uid].pickedCards) {
				this.disconnectedUsers[uid].bot.pick([c]);
			}

			// Immediately pick cards
			if (!this.disconnectedUsers[uid].pickedThisRound) {
				const pickedCard = this.doBotPick(
					this.disconnectedUsers[uid].bot,
					this.disconnectedUsers[uid].boosterIndex
				);
				this.disconnectedUsers[uid].pickedCards.push(pickedCard);
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
	};

	// Countdown Methods

	this.startCountdown = function() {
		let dec = Math.floor(this.maxTimer / 15);
		this.countdown = this.maxTimer - this.round * dec;
		this.resumeCountdown();
	};
	this.resumeCountdown = function() {
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
	};
	this.stopCountdown = function() {
		if (this.countdownInterval != null) {
			clearInterval(this.countdownInterval);
			this.countdownInterval = null;
		}
	};

	// Includes disconnected players!
	this.getHumanPlayerCount = function() {
		return this.users.size + Object.keys(this.disconnectedUsers).length;
	};

	// Includes disconnected players!
	// Distribute order has to be deterministic (especially for the reconnect feature), sorting by ID is an easy solution...
	this.getSortedHumanPlayersIDs = function() {
		let players = Array.from(this.users).concat(Object.keys(this.disconnectedUsers));
		return this.userOrder.filter(e => players.includes(e));
	};

	this.getVirtualPlayersCount = function() {
		return this.users.size + Object.keys(this.disconnectedUsers).length + this.bots;
	};

	this.getSortedHumanPlayers = function() {
		let tmp = {};
		for (let userID of this.getSortedHumanPlayersIDs()) {
			tmp[userID] = {
				isBot: false,
				disconnected: userID in this.disconnectedUsers,
			};
		}
		return tmp;
	};

	this.getSortedVirtualPlayers = function() {
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
	};

	this.emitMessage = function(title, text, showConfirmButton = true, timer = 1500) {
		this.forUsers(u =>
			Connections[u].socket.emit("message", {
				title: title,
				text: text,
				showConfirmButton: showConfirmButton,
				timer: timer,
			})
		);
	};

	this.generateBracket = function(players) {
		if (this.teamDraft) {
			this.bracket = new TeamBracket(players);
		} else {
			this.bracket = new Bracket(players);
		}
		console.log(this.bracket);
		this.forUsers(u => Connections[u].socket.emit("sessionOptions", { bracket: this.bracket }));
	};

	this.generateSwissBracket = function(players) {
		this.bracket = new SwissBracket(players);
		this.forUsers(u => Connections[u].socket.emit("sessionOptions", { bracket: this.bracket }));
	};

	this.updateBracket = function(results) {
		if (!this.bracket) return false;
		this.bracket.results = results;
		this.forUsers(u => Connections[u].socket.emit("sessionOptions", { bracket: this.bracket }));
	};

	// Execute fn for each user. Owner included even if they're not playing.
	this.forUsers = function(fn) {
		if (!this.ownerIsPlayer && this.owner in Connections) fn(this.owner);
		for (let user of this.users) fn(user);
	};
}

export let Sessions = {};

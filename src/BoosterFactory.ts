"use strict";

import { CardID, Card, CardPool, SlotedCardPool, UniqueCard } from "./CardTypes.js";
import { Cards, getUnique, BoosterCardsBySet, CardsBySet, getCard } from "./Cards.js";
import { shuffleArray, randomInt, Options, random, getRandom, weightedRandomIdx } from "./utils.js";
import { removeCardFromCardPool, pickCard, countCards } from "./cardUtils.js";
import { BasicLandSlot } from "./LandSlot.js";
import Constants from "./Constants.js";

// Generates booster for regular MtG Sets

const mythicRate = 1.0 / 8.0;
const foilRate = 15.0 / 67.0;
// 1/16 chances of a foil basic land added to the common slot. Mythic to common
const foilRarityRates: { [slot: string]: number } = {
	mythic: 1.0 / 128,
	rare: 1.0 / 128 + 7.0 / 128,
	uncommon: 1.0 / 16 + 3.0 / 16,
	common: 1.0,
};

export function getSetFoilRate(set: string | null) {
	if (set === null) return foilRate;
	if (
		["eld", "thb", "iko", "znr", "khm", "stx", "afr", "mid", "vow", "neo", "snc", "dmu", "bro", "dmr"].includes(set)
	)
		return 1.0 / 3.0;
	return foilRate;
}

type Targets = { [slot: string]: number };

export const DefaultBoosterTargets: { [rarity: string]: number } = {
	common: 10,
	uncommon: 3,
	rare: 1,
};

function isEmpty(slotedCardPool: SlotedCardPool): boolean {
	return Object.values(slotedCardPool).every((value: CardPool) => value.size === 0);
}

class ColorBalancedSlotCache {
	byColor: { [color: string]: CardPool } = {};
	monocolored: CardPool;
	monocoloredCount: number;
	others: CardPool;
	othersCount: number;

	constructor(cardPool: CardPool, options: Options = {}) {
		const localGetCard = options.getCard ?? getCard;
		for (const cid of cardPool.keys()) {
			if (!(localGetCard(cid).colors.join() in this.byColor))
				this.byColor[localGetCard(cid).colors.join()] = new Map();
			this.byColor[localGetCard(cid).colors.join()].set(cid, cardPool.get(cid) as number);
		}

		this.monocolored = new Map();
		for (const cardPool of Object.keys(this.byColor)
			.filter((k) => k.length === 1)
			.map((k) => this.byColor[k]))
			for (const [cid, val] of cardPool.entries()) this.monocolored.set(cid, val);

		this.monocoloredCount = countCards(this.monocolored);
		this.others = new Map();
		for (const cardPool of Object.keys(this.byColor)
			.filter((k) => k.length !== 1)
			.map((k) => this.byColor[k]))
			for (const [cid, val] of cardPool.entries()) this.others.set(cid, val);

		this.othersCount = countCards(this.others);
	}
}

/*
 Provides color balancing for the supplied cardPool
*/
export class ColorBalancedSlot {
	cardPool: CardPool;
	cache: ColorBalancedSlotCache;

	constructor(_cardPool: CardPool, options: Options = {}) {
		this.cardPool = _cardPool;
		this.cache = new ColorBalancedSlotCache(_cardPool, options);
	}

	syncCache(pickedCard: Card) {
		removeCardFromCardPool(pickedCard.id, this.cache.byColor[pickedCard.colors.join()]);
		if (pickedCard.colors.length === 1) {
			removeCardFromCardPool(pickedCard.id, this.cache.monocolored);
			--this.cache.monocoloredCount;
		} else {
			removeCardFromCardPool(pickedCard.id, this.cache.others);
			--this.cache.othersCount;
		}
	}

	// Returns cardCount color balanced cards picked from cardPool.
	// pickedCards can contain pre-selected cards for this slot.
	generate(cardCount: number, pickedCards: Array<UniqueCard> = [], options: Options = {}) {
		for (const c of "WUBRG") {
			if (this.cache.byColor[c] && this.cache.byColor[c].size > 0) {
				const pickedCard = pickCard(this.cache.byColor[c], pickedCards, options);
				pickedCards.push(pickedCard);

				if (options?.withReplacement !== true) {
					removeCardFromCardPool(pickedCard.id, this.cardPool);
					if (pickedCard.colors.length === 1) {
						removeCardFromCardPool(pickedCard.id, this.cache.monocolored);
						--this.cache.monocoloredCount;
					} else {
						removeCardFromCardPool(pickedCard.id, this.cache.others);
						--this.cache.othersCount;
					}
				}
			}
		}
		// a is the number of non-monocolor commons (often artifacts)
		// c is the number of monocolored commons including the ones seeded already
		// s is the number of commons seeded by color balancing
		// r is the remaining commons to pick
		// We want to maintain normal expected number of monocolored cards from not color balanciing:
		// (r+s) * c / (c+a)
		// We have s already and will take the remaining r with p(monocolored) = x
		// s + r * x = (r+s) * c / (c + a)
		// x = (cr - as) / (r * (c + a))
		// If cr < as, x = 0 is the best we can do.
		// If c or a are small, we need to ignore x and use remaning cards. Negative x acts like 0.
		const seededMonocolors = pickedCards.length; // s
		const c = this.cache.monocoloredCount + seededMonocolors;
		const a = this.cache.othersCount;
		const remainingCards = cardCount - seededMonocolors; // r
		const x = (c * remainingCards - a * seededMonocolors) / (remainingCards * (c + a));
		for (let i = pickedCards.length; i < cardCount; ++i) {
			const type = (random.bool(x) && this.cache.monocoloredCount !== 0) || this.cache.othersCount === 0;
			const pickedCard = pickCard(type ? this.cache.monocolored : this.cache.others, pickedCards, options);
			pickedCards.push(pickedCard);

			if (options?.withReplacement !== true) {
				removeCardFromCardPool(pickedCard.id, this.cardPool);
				removeCardFromCardPool(pickedCard.id, this.cache.byColor[pickedCard.colors.join()]);
				if (type) --this.cache.monocoloredCount;
				else --this.cache.othersCount;
			}
		}
		// Shuffle to avoid obvious signals to other players
		shuffleArray(pickedCards);
		return pickedCards;
	}
}

export interface IBoosterFactory {
	generateBooster(targets: Targets): UniqueCard[] | MessageError;
}

export class BoosterFactory implements IBoosterFactory {
	cardPool: SlotedCardPool;
	landSlot: BasicLandSlot | null;
	options: Options;
	colorBalancedSlot?: ColorBalancedSlot;

	constructor(cardPool: SlotedCardPool, landSlot: BasicLandSlot | null, options: Options) {
		this.cardPool = cardPool;
		this.landSlot = landSlot;
		if (this.landSlot && this.landSlot.setup) this.landSlot.setup(this.cardPool["common"]);
		this.options = options;
		if (this.options.colorBalance) this.colorBalancedSlot = new ColorBalancedSlot(this.cardPool["common"]);
	}

	/* Returns a standard draft booster
	 *   targets: Card count for each slot (e.g. {common:10, uncommon:3, rare:1})
	 */
	generateBooster(targets: Targets): UniqueCard[] | MessageError {
		let booster: Array<UniqueCard> = [];

		let addedFoils = 0;
		const localFoilRate = this.options.foilRate ?? foilRate;
		if (this.options.foil && random.bool(localFoilRate)) {
			const rarityCheck = random.real(0, 1);
			const foilCardPool: SlotedCardPool = this.options.foilCardPool ?? this.cardPool;
			for (const r in foilRarityRates)
				if (rarityCheck <= foilRarityRates[r] && foilCardPool[r].size > 0) {
					const pickedCard = pickCard(foilCardPool[r]);
					// Synchronize color balancing dictionary
					if (this.options.colorBalance && this.colorBalancedSlot && pickedCard.rarity == "common")
						this.colorBalancedSlot.syncCache(pickedCard);
					pickedCard.foil = true;
					booster.push(pickedCard);
					addedFoils += 1;
					break;
				}
		}

		for (let i = 0; i < targets["rare"]; ++i) {
			// 1 Rare/Mythic
			if (this.cardPool["mythic"].size === 0 && this.cardPool["rare"].size === 0) {
				return new MessageError("Error generating boosters", `Not enough rare or mythic cards in collection.`);
			} else if (this.cardPool["mythic"].size === 0) {
				booster.push(pickCard(this.cardPool["rare"]));
			} else if (this.options.mythicPromotion && this.cardPool["rare"].size === 0) {
				booster.push(pickCard(this.cardPool["mythic"]));
			} else {
				if (this.options.mythicPromotion && random.bool(mythicRate))
					booster.push(pickCard(this.cardPool["mythic"]));
				else booster.push(pickCard(this.cardPool["rare"]));
			}
		}

		for (let i = 0; i < targets["uncommon"]; ++i) booster.push(pickCard(this.cardPool["uncommon"], booster));

		// Color balance the booster by adding one common of each color if possible
		let pickedCommons = [];
		if (this.options.colorBalance && this.colorBalancedSlot && targets["common"] - addedFoils >= 5) {
			pickedCommons = this.colorBalancedSlot.generate(targets["common"] - addedFoils);
		} else {
			for (let i = pickedCommons.length; i < targets["common"] - addedFoils; ++i) {
				const pickedCard = pickCard(this.cardPool["common"], pickedCommons);
				pickedCommons.push(pickedCard);
			}
		}
		booster = booster.concat(pickedCommons);

		if (this.landSlot) booster.push(this.landSlot.pick());

		// Last resort safety check
		if (booster.some((v) => typeof v === "undefined" || v === null))
			return new MessageError("Unspecified error", `Error generating boosters.`);

		return booster;
	}
}

function filterCardPool(slotedCardPool: SlotedCardPool, predicate: (cid: CardID) => boolean) {
	const specialCards: SlotedCardPool = {};
	const filteredCardPool: SlotedCardPool = {};
	for (const slot in slotedCardPool) {
		specialCards[slot] = new Map();
		filteredCardPool[slot] = new Map();
		for (const cid of slotedCardPool[slot].keys()) {
			if (predicate(cid)) specialCards[slot].set(cid, slotedCardPool[slot].get(cid) as number);
			else filteredCardPool[slot].set(cid, slotedCardPool[slot].get(cid) as number);
		}
	}
	return [specialCards, filteredCardPool];
}

function rollSpecialCardRarity(
	cardCounts: { [slot: string]: number },
	targets: { [slot: string]: number },
	options: Options
) {
	let pickedRarity = options.minRarity ?? "uncommon";

	let total = targets.rare;
	if (pickedRarity === "common") total += targets.common;
	if (pickedRarity === "common" || pickedRarity === "uncommon") total += targets.uncommon;

	const rand = random.real(0, total);
	if (rand < targets.rare) pickedRarity = "rare";
	else if (rand < targets.rare + targets.uncommon) pickedRarity = "uncommon";

	if (pickedRarity === "rare") {
		if (
			cardCounts["rare"] === 0 ||
			(cardCounts["mythic"] > 0 && options.mythicPromotion && random.bool(mythicRate))
		)
			pickedRarity = "mythic";
	}

	if (cardCounts[pickedRarity] === 0) pickedRarity = Object.keys(cardCounts).find((v) => cardCounts[v] > 0);

	return pickedRarity;
}

function countMap<T>(map: Map<T, number>): number {
	let acc = 0;
	for (const v of map.values()) acc += v;
	return acc;
}

function countBySlot(cardPool: SlotedCardPool) {
	const counts: { [slot: string]: number } = {};
	for (const slot in cardPool)
		counts[slot] = [...cardPool[slot].values()].reduce((acc: number, c: number): number => acc + c, 0);
	return counts;
}

function insertInBooster(card: UniqueCard, booster: Array<UniqueCard>) {
	const boosterByRarity: { [slot: string]: Array<UniqueCard> } = { mythic: [], rare: [], uncommon: [], common: [] };
	for (const card of booster) boosterByRarity[card.rarity].push(card);
	boosterByRarity[card.rarity].push(card);
	shuffleArray(boosterByRarity[card.rarity]);
	return Object.values(boosterByRarity).flat();
}

// Exactly one Planeswalker per booster
class WARBoosterFactory extends BoosterFactory {
	planeswalkers: SlotedCardPool;

	constructor(cardPool: SlotedCardPool, landSlot: BasicLandSlot | null, options: Options) {
		const [planeswalkers, filteredCardPool] = filterCardPool(cardPool, (cid: CardID) =>
			getCard(cid).type.includes("Planeswalker")
		);
		super(filteredCardPool, landSlot, options);
		this.planeswalkers = planeswalkers;
	}

	// Not using the suplied cardpool here
	generateBooster(targets: Targets) {
		const plwCounts = countBySlot(this.planeswalkers);
		// Ignore the rule if suitable rarities are ignored, or there's no planeswalker left
		if (
			((!("uncommon" in targets) || targets["uncommon"] <= 0) &&
				(!("rare" in targets) || targets["rare"] <= 0)) ||
			Object.values(plwCounts).every((c) => c === 0)
		) {
			return super.generateBooster(targets);
		} else {
			const pickedRarity = rollSpecialCardRarity(plwCounts, targets, this.options);
			const pickedPL = pickCard(this.planeswalkers[pickedRarity], []);

			const updatedTargets = Object.assign({}, targets);
			if (pickedRarity === "mythic") --updatedTargets["rare"];
			else --updatedTargets[pickedRarity];

			let booster = super.generateBooster(updatedTargets);
			if (isMessageError(booster)) return booster;
			booster = insertInBooster(pickedPL, booster);
			return booster;
		}
	}
}

// At least one Legendary Creature per booster
// https://www.lethe.xyz/mtg/collation/dom.html
class DOMBoosterFactory extends BoosterFactory {
	static regex = /Legendary.*Creature/;
	legendaryCreatures: SlotedCardPool;

	constructor(cardPool: SlotedCardPool, landSlot: BasicLandSlot | null, options: Options) {
		const [legendaryCreatures, filteredCardPool] = filterCardPool(
			cardPool,
			(cid: CardID) => getCard(cid).type.match(DOMBoosterFactory.regex) !== null
		);
		super(filteredCardPool, landSlot, options);
		this.legendaryCreatures = legendaryCreatures;
	}

	// Not using the suplied cardpool here
	generateBooster(targets: Targets) {
		const legendaryCounts = countBySlot(this.legendaryCreatures);
		// Ignore the rule if there's no legendary creatures left
		if (Object.values(legendaryCounts).every((c) => c === 0)) {
			return super.generateBooster(targets);
		} else {
			// Roll for legendary rarity
			const pickedRarity = rollSpecialCardRarity(legendaryCounts, targets, this.options);
			const pickedCard = pickCard(this.legendaryCreatures[pickedRarity], []);

			const updatedTargets = Object.assign({}, targets);
			if (pickedRarity === "mythic") --updatedTargets["rare"];
			else --updatedTargets[pickedRarity];

			const booster = super.generateBooster(updatedTargets);
			if (isMessageError(booster)) return booster;
			// Insert the card in the appropriate slot, for Dominaria, the added Legendary is always the last card
			booster.unshift(pickedCard);
			return booster;
		}
	}
}

// Exactly one MDFC per booster
// FIXME: Modal Double Faced rares appear 50% more often than Single Faced rares
class ZNRBoosterFactory extends BoosterFactory {
	mdfcByRarity: SlotedCardPool;

	constructor(cardPool: SlotedCardPool, landSlot: BasicLandSlot | null, options: Options) {
		const [mdfcByRarity, filteredCardPool] = filterCardPool(cardPool, (cid: CardID) =>
			getCard(cid).name.includes("//")
		);
		super(filteredCardPool, landSlot, options);
		this.mdfcByRarity = mdfcByRarity;
	}
	generateBooster(targets: Targets) {
		const mdfcCounts = countBySlot(this.mdfcByRarity);
		// Ignore the rule if suitable rarities are ignored, or there's no mdfc left
		if (
			((!("uncommon" in targets) || targets["uncommon"] <= 0) &&
				(!("rare" in targets) || targets["rare"] <= 0)) ||
			Object.values(mdfcCounts).every((c) => c === 0)
		) {
			return super.generateBooster(targets);
		} else {
			// Roll for MDFC rarity
			const pickedRarity = rollSpecialCardRarity(mdfcCounts, targets, this.options);
			const pickedMDFC = pickCard(this.mdfcByRarity[pickedRarity], []);

			const updatedTargets = Object.assign({}, targets);
			if (pickedRarity === "mythic") --updatedTargets["rare"];
			else --updatedTargets[pickedRarity];

			let booster = super.generateBooster(updatedTargets);
			if (isMessageError(booster)) return booster;
			booster = insertInBooster(pickedMDFC, booster);
			return booster;
		}
	}
}

// TODO Add the "Foil Etched" commanders to the foil slot.
// They shouldn't be in the card pool at all for now, Probable algorithm:
// If foilRarity === 'mythic', roll to select the card pool between "Foil Etched" (32 cards) or Regular Mythic (completeCardPool['mythic'])
// (rate unknown atm; probably the ratio between the size of both pools) then pick a card normaly in the selected pool.
// List here: https://mtg.gamepedia.com/Commander_Legends#Notable_cards
/*
	Every Commander Legends Draft Booster Pack contains two legendary cards. [...]
	Commander Legends also debuts a special kind of foil—foil-etched cards with beautiful metallic frames. In some Commander Legends Draft Boosters, you can find a foil-etched showcase legend or regular foil borderless planeswalker.
	Each Commander Legends Draft Booster contains 20 Magic cards + one ad/token, with two legends, at least one rare, and one foil.
*/
class CMRBoosterFactory extends BoosterFactory {
	static regex = /Legendary.*Creature/;
	completeCardPool: SlotedCardPool;
	legendaryCreatures: SlotedCardPool;

	constructor(cardPool: SlotedCardPool, landSlot: BasicLandSlot | null, options: Options) {
		const [legendaryCreatures, filteredCardPool] = filterCardPool(
			cardPool,
			(cid: CardID) => getCard(cid).type.match(CMRBoosterFactory.regex) !== null
		);
		filteredCardPool["common"].delete("a69e6d8f-f742-4508-a83a-38ae84be228c"); // Remove Prismatic Piper from the common pool (can still be found in the foil pool completeCardPool)
		super(filteredCardPool, landSlot, options);
		this.completeCardPool = cardPool;
		this.legendaryCreatures = legendaryCreatures;
	}

	// Not using the suplied cardpool here
	generateBooster(targets: Targets) {
		let updatedTargets = Object.assign({}, targets);
		// 20 Cards: *13 Commons (Higher chance of a Prismatic Piper); *3 Uncommons; 2 Legendary Creatures; *1 Non-"Legendary Creature" Rare/Mythic; 1 Foil
		// * These slots are handled by the originalGenBooster function; Others are special slots with custom logic.
		if (targets === DefaultBoosterTargets)
			updatedTargets = {
				common: 13,
				uncommon: 3,
				rare: 1,
			};
		const legendaryCounts = countBySlot(this.legendaryCreatures);
		// Ignore the rule if there's no legendary creatures left
		if (Object.values(legendaryCounts).every((c) => c === 0)) {
			return super.generateBooster(updatedTargets);
		} else {
			let booster: Array<UniqueCard> | MessageError = [];
			// Prismatic Piper instead of a common in about 1 of every 6 packs
			if (random.bool(1 / 6)) {
				--updatedTargets.common;
				booster = super.generateBooster(updatedTargets);
				if (isMessageError(booster)) return booster;
				booster.push(getUnique("a69e6d8f-f742-4508-a83a-38ae84be228c"));
			} else {
				booster = super.generateBooster(updatedTargets);
				if (isMessageError(booster)) return booster;
			}

			// 2 Legends: any combination of Uncommon/Rare/Mythic, except two Mythics
			const pickedRarities = [
				rollSpecialCardRarity(legendaryCounts, targets, this.options),
				rollSpecialCardRarity(legendaryCounts, targets, this.options),
			];
			while (
				pickedRarities[0] === "mythic" &&
				pickedRarities[1] === "mythic" &&
				(legendaryCounts["uncommon"] > 0 || legendaryCounts["rare"] > 0)
			)
				pickedRarities[1] = rollSpecialCardRarity(legendaryCounts, targets, this.options);
			for (const pickedRarity of pickedRarities) {
				const pickedCard = pickCard(this.legendaryCreatures[pickedRarity], booster);
				removeCardFromCardPool(pickedCard.id, this.completeCardPool[pickedCard.rarity]);
				booster.unshift(pickedCard);
			}

			// One random foil
			let foilRarity = "common";
			const rarityCheck = random.real(0, 1);
			for (const r in foilRarityRates)
				if (rarityCheck <= foilRarityRates[r] && this.completeCardPool[r].size > 0) {
					foilRarity = r;
					break;
				}
			const pickedFoil = pickCard(this.completeCardPool[foilRarity], []);
			if (this.cardPool[pickedFoil.rarity].has(pickedFoil.id))
				removeCardFromCardPool(pickedFoil.id, this.cardPool[pickedFoil.rarity]);
			if (this.legendaryCreatures[pickedFoil.rarity].has(pickedFoil.id))
				removeCardFromCardPool(pickedFoil.id, this.legendaryCreatures[pickedFoil.rarity]);
			booster.unshift(Object.assign({ foil: true }, pickedFoil));

			return booster;
		}
	}
}

// One Timeshifted Card ("special" rarity) per booster.
// Foil rarity should be higher for this set, but we'll probably just rely on the other collation method.
class TSRBoosterFactory extends BoosterFactory {
	constructor(cardPool: SlotedCardPool, landSlot: BasicLandSlot | null, options: Options) {
		super(cardPool, landSlot, options);
	}
	generateBooster(targets: Targets) {
		const booster = super.generateBooster(targets);
		if (isMessageError(booster)) return booster;
		const timeshifted = pickCard(this.cardPool["special"], []);
		booster.push(timeshifted);
		return booster;
	}
}

// Strixhaven: One card from the Mystical Archive (sta)
class STXBoosterFactory extends BoosterFactory {
	lessonsByRarity: SlotedCardPool;
	mysticalArchiveByRarity: SlotedCardPool;

	constructor(cardPool: SlotedCardPool, landSlot: BasicLandSlot | null, options: Options) {
		const [lessons, filteredCardPool] = filterCardPool(
			cardPool,
			(cid: CardID) => getCard(cid).subtypes.includes("Lesson") && getCard(cid).rarity !== "uncommon"
		);
		super(filteredCardPool, landSlot, options);
		this.lessonsByRarity = lessons;

		// Filter STA cards according to session collections
		if (options.session && !options.session.unrestrictedCardPool()) {
			const STACards: CardPool = options.session.restrictedCollection(["sta"]);
			this.mysticalArchiveByRarity = { uncommon: new Map(), rare: new Map(), mythic: new Map() };
			for (const cid of STACards.keys())
				this.mysticalArchiveByRarity[getCard(cid).rarity].set(
					cid,
					Math.min(options.maxDuplicates?.[getCard(cid).rarity] ?? 99, STACards.get(cid) as number)
				);
		} else {
			this.mysticalArchiveByRarity = { uncommon: new Map(), rare: new Map(), mythic: new Map() };
			for (const cid of BoosterCardsBySet["sta"])
				this.mysticalArchiveByRarity[getCard(cid).rarity].set(
					cid,
					options.maxDuplicates?.[getCard(cid).rarity] ?? 99
				);
		}
	}

	generateBooster(targets: Targets) {
		const mythicPromotion = this.options?.mythicPromotion ?? true;
		const allowRares = targets["rare"] > 0; // Avoid rare & mythic lessons/mystical archives

		// Lesson
		const rarityRoll = random.real(0, 1);
		const pickedRarity = allowRares
			? mythicPromotion && rarityRoll < 0.006 && this.lessonsByRarity["mythic"].size > 0
				? "mythic"
				: rarityRoll < 0.08 && this.lessonsByRarity["rare"].size > 0
				? "rare"
				: "common"
			: "common";

		if (this.lessonsByRarity[pickedRarity].size <= 0)
			return new MessageError("Error generating boosters", `Not enough Lessons available.`);

		const pickedLesson = pickCard(this.lessonsByRarity[pickedRarity], []);

		const updatedTargets = Object.assign({}, targets);
		if (updatedTargets["common"] > 0) --updatedTargets["common"];

		let booster = super.generateBooster(updatedTargets);
		if (isMessageError(booster)) return booster;
		booster.push(pickedLesson);

		// Mystical Archive
		const archiveCounts = countBySlot(this.mysticalArchiveByRarity);
		const archiveRarityRoll = random.real(0, 1);
		const archiveRarity = allowRares
			? mythicPromotion && archiveCounts["mythic"] > 0 && archiveRarityRoll < 0.066
				? "mythic"
				: archiveCounts["rare"] > 0 && archiveRarityRoll < 0.066 + 0.264
				? "rare"
				: "uncommon"
			: "uncommon";

		if (archiveCounts[archiveRarity] <= 0)
			return new MessageError("Error generating boosters", `Not enough Mystical Archive cards.`);

		const archive = pickCard(this.mysticalArchiveByRarity[archiveRarity], []);
		booster.push(archive);

		return booster;
	}
}

// Modern Horizons 2
// 1 New-to-Modern reprint card (uncommon, rare, or mythic rare) [numbered #261-#303]
class MH2BoosterFactory extends BoosterFactory {
	newToModern: SlotedCardPool;
	constructor(cardPool: SlotedCardPool, landSlot: BasicLandSlot | null, options: Options) {
		const [newToModern, filteredCardPool] = filterCardPool(
			cardPool,
			(cid: CardID) =>
				parseInt(getCard(cid).collector_number) >= 261 && parseInt(getCard(cid).collector_number) <= 303
		);
		if (options.foil) {
			options.foilRate = 1.0 / 3.0;
			options.foilCardPool = cardPool; // New-to-Modern can also appear in as foil
		}
		super(filteredCardPool, landSlot, options);
		this.newToModern = newToModern;
	}
	generateBooster(targets: Targets) {
		const newToModernCounts = countBySlot(this.newToModern);
		// Ignore the rule if there's no New-to-Modern reprint left
		if (Object.values(newToModernCounts).every((c) => c === 0)) {
			return super.generateBooster(targets);
		} else {
			// Roll for New-to-Modern rarity
			const pickedRarity = rollSpecialCardRarity(newToModernCounts, targets, this.options);
			const pickedCard = pickCard(this.newToModern[pickedRarity], []);

			const booster = super.generateBooster(targets);
			if (isMessageError(booster)) return booster;
			// Insert the New-to-Modern card in the appropriate slot. FIXME: Currently unknown
			booster.unshift(pickedCard);
			return booster;
		}
	}
}

// Innistrad: Midnight Hunt
//  - Exactly one common double-faced card
//  - Exactly one uncommon or rare/mythic DFC
class MIDBoosterFactory extends BoosterFactory {
	doubleFacedCards: SlotedCardPool;
	constructor(cardPool: SlotedCardPool, landSlot: BasicLandSlot | null, options: Options) {
		const [doubleFacedCards, filteredCardPool] = filterCardPool(cardPool, (cid: CardID) =>
			getCard(cid).name.includes("//")
		);
		super(filteredCardPool, landSlot, options);
		this.doubleFacedCards = doubleFacedCards;
	}
	generateBooster(targets: Targets) {
		const doubleFacedCommonsCounts = this.doubleFacedCards["common"].size;
		// Ignore the rule if there's no common double-faced card left
		if (doubleFacedCommonsCounts <= 0) {
			return super.generateBooster(targets);
		} else {
			let pickedDoubleFacedCommon: UniqueCard | null = null;
			let pickedDoubleFacedRareOrUncommon: UniqueCard | null = null;
			const updatedTargets = Object.assign({}, targets);
			if (targets["common"] > 0) {
				pickedDoubleFacedCommon = pickCard(this.doubleFacedCards["common"], []);
				--updatedTargets["common"];
			}
			// TODO: Actual rate of rare/uncommon dfc is unknown
			const pickedRarity = rollSpecialCardRarity(
				countBySlot(this.doubleFacedCards),
				updatedTargets,
				this.options
			);
			if (pickedRarity === "uncommon") {
				pickedDoubleFacedRareOrUncommon = pickCard(this.doubleFacedCards["uncommon"], []);
				--updatedTargets["uncommon"];
			} else if (pickedRarity === "rare" || pickedRarity === "mythic") {
				pickedDoubleFacedRareOrUncommon = pickCard(this.doubleFacedCards[pickedRarity], []);
				--updatedTargets["rare"];
			}
			const booster = super.generateBooster(updatedTargets);
			if (isMessageError(booster)) return booster;
			const hasFoil = booster[0].foil ? 1 : 0;
			// Insert the Double-Faced common as the first common in the pack
			if (pickedDoubleFacedCommon)
				booster.splice(
					updatedTargets["rare"] + updatedTargets["uncommon"] + hasFoil,
					0,
					pickedDoubleFacedCommon
				);
			// Insert the Double-Faced uncommon randomly among the other uncommons in the pack, or the rare/mythic on top
			if (pickedDoubleFacedRareOrUncommon) {
				booster.splice(
					pickedDoubleFacedRareOrUncommon.rarity === "uncommon"
						? randomInt(
								updatedTargets["rare"] + hasFoil,
								updatedTargets["rare"] + updatedTargets["uncommon"] + hasFoil
						  )
						: 0,
					0,
					pickedDoubleFacedRareOrUncommon
				);
			}
			return booster;
		}
	}
}

// Innistrad: Double Feature (DBL) - Uses cards from MID and VOW
// Note: Since we're completely skipping super.generateBooster(), there's no color balancing going on here.
//       It is pretty tricky to implement with the added constraint of having to pick exactly 4 commons from each set.
class DBLBoosterFactory extends BoosterFactory {
	midCardPool: SlotedCardPool;
	vowCardPool: SlotedCardPool;
	constructor(cardPool: SlotedCardPool, landSlot: BasicLandSlot | null, options: Options) {
		// We won't use the default booster generator, or the land slot
		super(cardPool, landSlot, options);
		[this.midCardPool, this.vowCardPool] = filterCardPool(cardPool, (cid: CardID) => getCard(cid).set === "mid");
	}

	generateBooster(targets: Targets) {
		let updatedTargets = Object.assign({}, targets);
		if (targets !== DefaultBoosterTargets) {
			updatedTargets = {
				rare: Math.ceil(targets["rare"] / 2),
				uncommon: Math.ceil(targets["uncommon"] / 2),
				common: Math.ceil(targets["common"] / 2),
			};
		} else {
			updatedTargets = {
				rare: 1,
				uncommon: 2,
				common: 4,
			};
		}

		const booster: Array<UniqueCard> | false = [];
		const mythicPromotion = this.options?.mythicPromotion ?? true;

		// Silver screen foil card (Note: We could eventually use actual DBL cards for this, to get the proper image)
		const pickedPool = random.pick([this.midCardPool, this.vowCardPool]);
		const pickedRarity = rollSpecialCardRarity(countBySlot(pickedPool), updatedTargets, {
			minRarity: "common",
			mythicPromotion,
		});
		booster.push(pickCard(pickedPool[pickedRarity], [])); // Allow duplicates here

		for (const rarity in updatedTargets) {
			const pickedCards: Array<UniqueCard> = [];
			for (const pool of [this.midCardPool, this.vowCardPool])
				for (let i = 0; i < updatedTargets[rarity]; i++) {
					const promotion =
						rarity === "rare" && mythicPromotion && pool["mythic"].size > 0 && random.bool(mythicRate);
					pickedCards.push(pickCard(pool[promotion ? "mythic" : rarity], pickedCards));
				}
			booster.push(...pickedCards);
		}

		return booster;
	}
}

// Kamigawa: Neon Dynasty
// https://media.wizards.com/2022/images/daily/en_uV6TSNyNy6.jpg
//   1 Rare or mythic rare card
//   1 Double-faced common or uncommon card
//   3 Uncommon cards
//   9 Common cards (in 33% of Kamigawa: Neon Dynasty packs, a traditional foil of any rarity replaces a common.)
//   1 Land card, featuring an ukiyo-e land in 33% of Draft Boosters
class NEOBoosterFactory extends BoosterFactory {
	doubleFacedUCs: SlotedCardPool;
	constructor(cardPool: SlotedCardPool, landSlot: BasicLandSlot | null, options: Options) {
		const [doubleFacedUCs, filteredCardPool] = filterCardPool(
			cardPool,
			(cid: CardID) =>
				getCard(cid).name.includes("//") &&
				(getCard(cid).rarity === "uncommon" || getCard(cid).rarity === "common")
		);
		super(filteredCardPool, landSlot, options);
		this.doubleFacedUCs = doubleFacedUCs;
	}
	generateBooster(targets: Targets) {
		const doubleFacedUCsCount = this.doubleFacedUCs["common"].size + this.doubleFacedUCs["uncommon"].size;
		// Ignore the rule if there's no UCs double-faced card left
		if (doubleFacedUCsCount <= 0) {
			return super.generateBooster(targets);
		} else {
			let pickedDoubleFacedUC: UniqueCard | null = null;
			const updatedTargets = Object.assign({}, targets);
			if (targets["common"] > 0) {
				// The Double-Faced Uncommon/Common takes a common slot
				--updatedTargets["common"];
			}
			const booster = super.generateBooster(updatedTargets);
			if (isMessageError(booster)) return booster;
			const hasFoil = booster[0].foil ? 1 : 0;
			const pickedRarity = rollSpecialCardRarity(
				countBySlot(this.doubleFacedUCs),
				{ rare: 0, uncommon: updatedTargets.uncommon, common: updatedTargets.common },
				{
					minRarity: "common",
				}
			);
			pickedDoubleFacedUC = pickCard(this.doubleFacedUCs[pickedRarity], []);
			// Insert the Double-Faced common or uncommon as the first uncommon in the pack
			if (pickedDoubleFacedUC) booster.splice(updatedTargets["rare"] + hasFoil, 0, pickedDoubleFacedUC);
			return booster;
		}
	}
}

/* Commander Legends: Battle for Baldur's Gate
 * 1 Legendary creature or planeswalker (rare or mythic rare in 31% of boosters)
 * 1 Legendary Background (rare in 1 of 12 boosters)
 * 1 Non-legendary rare or mythic rare card
 * 3 Uncommons
 * 13 Commons
 * 1 Traditional foil card of any rarity
 */
class CLBBoosterFactory extends BoosterFactory {
	completeCardPool: SlotedCardPool; // Will be used for foils
	legendaryCreaturesAndPlaneswalkers: SlotedCardPool;
	legendaryBackgrounds: SlotedCardPool;

	constructor(cardPool: SlotedCardPool, landSlot: BasicLandSlot | null, options: Options) {
		const [legendaryCreaturesAndPlaneswalkers, intermediaryFilteredCardPool] = filterCardPool(
			cardPool,
			(cid: CardID) =>
				getCard(cid).type.includes("Legendary") &&
				(getCard(cid).type.includes("Creature") || getCard(cid).type.includes("Planeswalker")) &&
				!["Vivien, Champion of the Wilds", "Xenagos, the Reveler", "Faceless One"].includes(getCard(cid).name) // These two cannot be your commander
		);
		const [legendaryBackgrounds, filteredCardPool] = filterCardPool(
			intermediaryFilteredCardPool,
			(cid: CardID) => getCard(cid).name !== "Faceless One" && getCard(cid).subtypes.includes("Background")
		);
		super(filteredCardPool, landSlot, options);
		this.completeCardPool = cardPool;
		this.legendaryCreaturesAndPlaneswalkers = legendaryCreaturesAndPlaneswalkers;
		this.legendaryBackgrounds = legendaryBackgrounds;
	}

	// Not using the suplied cardpool here
	generateBooster(targets: Targets) {
		let updatedTargets = Object.assign({}, targets);
		// These slots are handled by the originalGenBooster function; Others are special slots with custom logic.
		if (targets === DefaultBoosterTargets)
			updatedTargets = {
				common: 13,
				uncommon: 3,
				rare: 1,
			};
		// Ignore the rule if there's no legendary creatures or planeswalkers left
		if (isEmpty(this.legendaryCreaturesAndPlaneswalkers)) {
			return super.generateBooster(updatedTargets);
		} else {
			const booster = super.generateBooster(updatedTargets);
			if (isMessageError(booster)) return booster;

			// 1 Legendary creature or planeswalker (rare or mythic rare in 31% of boosters)
			let legendaryRarity = "uncommon";
			const legendaryRarityCheck = random.real(0, 1);
			// Rare or mythic rare in 31% of boosters (Ratio of mythics is unknown)
			if (legendaryRarityCheck < 0.31 / 8.0) legendaryRarity = "mythic";
			else if (legendaryRarityCheck < 0.31) legendaryRarity = "rare";
			const pickedLegend = pickCard(this.legendaryCreaturesAndPlaneswalkers[legendaryRarity], booster);
			removeCardFromCardPool(pickedLegend.id, this.completeCardPool[pickedLegend.rarity]);

			let backgroundRarity = "common";
			const backgroundRarityCheck = random.real(0, 1);
			// Rare in 1 of 12 boosters, no idea about uncommon/common ratio
			// There's 4 Mythics, 5 Rares, 15 Uncommons and 5 Commons
			if (backgroundRarityCheck < 1.0 / 12.0 / 8.0 && this.legendaryBackgrounds["mythic"].size > 0)
				backgroundRarity = "mythic";
			else if (backgroundRarityCheck < 1.0 / 12.0 && this.legendaryBackgrounds["rare"].size > 0)
				backgroundRarity = "rare";
			else if (backgroundRarityCheck < 1.0 / 2.0 && this.legendaryBackgrounds["uncommon"].size > 0)
				backgroundRarity = "uncommon"; // This ratio is completely arbitrary
			if (this.legendaryBackgrounds[backgroundRarity].size <= 0)
				return new MessageError("Error generating boosters", `Not enough legendary backgrounds.`);
			const pickedBackground = pickCard(this.legendaryBackgrounds[backgroundRarity], booster);
			removeCardFromCardPool(pickedBackground.id, this.completeCardPool[pickedBackground.rarity]);

			booster.unshift(pickedBackground);
			booster.unshift(pickedLegend);

			// One random foil
			let foilRarity = "common";
			const rarityCheck = random.real(0, 1);
			for (const r in foilRarityRates)
				if (rarityCheck <= foilRarityRates[r] && this.completeCardPool[r].size > 0) {
					foilRarity = r;
					break;
				}
			const pickedFoil = pickCard(this.completeCardPool[foilRarity], [], { foil: true });
			if (this.cardPool[pickedFoil.rarity].has(pickedFoil.id))
				removeCardFromCardPool(pickedFoil.id, this.cardPool[pickedFoil.rarity]);
			if (this.legendaryCreaturesAndPlaneswalkers[pickedFoil.rarity].has(pickedFoil.id))
				removeCardFromCardPool(pickedFoil.id, this.legendaryCreaturesAndPlaneswalkers[pickedFoil.rarity]);
			booster.push(pickedFoil);

			return booster;
		}
	}
}

/* Double Masters 2022
 * 8 Commons
 * 3 Uncommons
 * 2 Rares and/or mythic rares
 * 2 Traditional foil cards of any rarity
 * 1 Cryptic Spires (As the land slot)
 */
class M2X2BoosterFactory extends BoosterFactory {
	constructor(cardPool: SlotedCardPool, landSlot: BasicLandSlot | null, options: Options) {
		super(cardPool, landSlot, options);
	}

	generateBooster(targets: Targets) {
		let updatedTargets = Object.assign({}, targets);
		if (targets === DefaultBoosterTargets) {
			updatedTargets = {
				rare: 2,
				uncommon: 3,
				common: 8,
			};
		}

		const booster = super.generateBooster(updatedTargets);
		if (isMessageError(booster)) return booster;
		const mythicPromotion = this.options?.mythicPromotion ?? true;

		// 2 Foils
		for (let i = 0; i < 2; i++) {
			const pickedRarity = rollSpecialCardRarity(countBySlot(this.cardPool), updatedTargets, {
				minRarity: "common",
				mythicPromotion,
			});
			booster.unshift(pickCard(this.cardPool[pickedRarity], [], { foil: true }));
		}

		return booster;
	}
}

/* Dominaria United
 * 1 Legendary Creature in every pack (75% U, 25% R/M)
 * 1 Common land in every pack (To be confirmed)
 */
class DMUBoosterFactory extends BoosterFactory {
	static legendaryCreatureRegex = /Legendary.*Creature/;
	legendaryCreatures: SlotedCardPool;

	constructor(cardPool: SlotedCardPool, landSlot: BasicLandSlot | null, options: Options) {
		const [legendaryCreatures, filteredCardPool] = filterCardPool(
			cardPool,
			(cid: CardID) => getCard(cid).type.match(DMUBoosterFactory.legendaryCreatureRegex) !== null
		);
		super(filteredCardPool, landSlot, options);
		this.legendaryCreatures = legendaryCreatures;
	}

	generateBooster(targets: Targets) {
		// Ignore the rule if there's no legendary creatures left
		if (isEmpty(this.legendaryCreatures)) {
			return super.generateBooster(targets);
		} else {
			const updatedTargets = Object.assign({}, targets);

			let legendaryCreature = null;
			if (
				updatedTargets["uncommon"] > 0 &&
				this.legendaryCreatures["uncommon"].size > 0 &&
				random.realZeroToOneInclusive() < 0.75
			) {
				--updatedTargets["uncommon"];
				legendaryCreature = pickCard(this.legendaryCreatures["uncommon"]);
			} else if (updatedTargets["rare"] > 0 && this.legendaryCreatures["rare"].size > 0) {
				--updatedTargets["rare"];
				if (
					this.options.mythicPromotion &&
					this.legendaryCreatures["mythic"].size > 0 &&
					random.realZeroToOneInclusive() < 1 / 7.4
				)
					legendaryCreature = pickCard(this.legendaryCreatures["mythic"]);
				else legendaryCreature = pickCard(this.legendaryCreatures["rare"]);
			}

			const booster = super.generateBooster(updatedTargets);
			if (isMessageError(booster)) return booster;
			if (legendaryCreature) booster.splice(updatedTargets["rare"] ?? 0, 0, legendaryCreature);
			return booster;
		}
	}
}

// Dominaria United Alchemy
// Replaces a DMU common with a YDMU card.
class YDMUBoosterFactory extends BoosterFactory {
	static legendaryCreatureRegex = /Legendary.*Creature/;
	legendaryCreatures: SlotedCardPool;
	alchemyCards: SlotedCardPool;

	constructor(cardPool: SlotedCardPool, landSlot: BasicLandSlot | null, options: Options) {
		const [legendaryCreatures, filteredCardPool] = filterCardPool(
			cardPool,
			(cid: CardID) => getCard(cid).type.match(DMUBoosterFactory.legendaryCreatureRegex) !== null
		);
		super(filteredCardPool, landSlot, options);
		this.legendaryCreatures = legendaryCreatures;

		// Filter YDMU cards according to session collections
		if (options.session && !options.session.unrestrictedCardPool()) {
			const YDMUCards: CardPool = options.session.restrictedCollection(["ydmu"]);
			this.alchemyCards = { uncommon: new Map(), rare: new Map(), mythic: new Map() };
			for (const cid of YDMUCards.keys())
				this.alchemyCards[getCard(cid).rarity].set(
					cid,
					Math.min(options.maxDuplicates?.[getCard(cid).rarity] ?? 99, YDMUCards.get(cid) as number)
				);
		} else {
			this.alchemyCards = { uncommon: new Map(), rare: new Map(), mythic: new Map() };
			for (const cid of BoosterCardsBySet["alchemy_dmu"])
				this.alchemyCards[getCard(cid).rarity].set(cid, options.maxDuplicates?.[getCard(cid).rarity] ?? 99);
		}
	}

	generateBooster(targets: Targets) {
		// Ignore the rule if there's no legendary creatures left
		if (isEmpty(this.legendaryCreatures)) {
			return super.generateBooster(targets);
		} else {
			const updatedTargets = Object.assign({}, targets);

			let legendaryCreature = null;
			if (
				updatedTargets["uncommon"] > 0 &&
				this.legendaryCreatures["uncommon"].size > 0 &&
				random.realZeroToOneInclusive() < 0.75
			) {
				--updatedTargets["uncommon"];
				legendaryCreature = pickCard(this.legendaryCreatures["uncommon"]);
			} else if (updatedTargets["rare"] > 0 && this.legendaryCreatures["rare"].size > 0) {
				--updatedTargets["rare"];
				if (
					this.options.mythicPromotion &&
					this.legendaryCreatures["mythic"].size > 0 &&
					random.realZeroToOneInclusive() < 1 / 7.4
				)
					legendaryCreature = pickCard(this.legendaryCreatures["mythic"]);
				else legendaryCreature = pickCard(this.legendaryCreatures["rare"]);
			}

			// Alchemy Card
			updatedTargets["common"] = Math.max(0, updatedTargets["common"] - 1);
			const alchemyCardsCounts = countBySlot(this.alchemyCards);
			const alchemyRarityRoll = random.real(0, 1);
			const pickedRarity =
				updatedTargets["rare"] > 0
					? this.options.mythicPromotion && alchemyCardsCounts["mythic"] > 0 && alchemyRarityRoll < 0.066
						? "mythic"
						: alchemyCardsCounts["rare"] > 0 && alchemyRarityRoll < 0.066 + 0.264
						? "rare"
						: "uncommon"
					: "uncommon";
			const alchemyCard = pickCard(this.alchemyCards[pickedRarity], []);

			const booster = super.generateBooster(updatedTargets);
			if (isMessageError(booster)) return booster;
			if (legendaryCreature) booster.splice(updatedTargets["rare"] ?? 0, 0, legendaryCreature);
			if (alchemyCard) booster.unshift(alchemyCard);
			return booster;
		}
	}
}

/* Unfinity - Sparse implementation.
 *  1 Planetary space-ic basic land, orbital space-ic basic land, or borderless shock land (Not implemented)
 *  1 Rare or mythic rare (can be a showcase or borderless planeswalker card)
 *  2 Attraction cards of any rarity (and both can be the same rarity, including two rares)
 *  3 Uncommons
 *  6 Commons
 *  1 Common or a traditional foil card of any rarity (can be a showcase or borderless planeswalker card, or an Attraction card) (Not implemented)
 *  1 Sticker insert (with a variety of stickers for gameplay use)
 *  1 Token or ad insert
 */
class UNFBoosterFactory extends BoosterFactory {
	attractions: SlotedCardPool;
	stickers: CardID[];

	constructor(cardPool: SlotedCardPool, landSlot: BasicLandSlot | null, options: Options) {
		const [attractions, filteredCardPool] = filterCardPool(cardPool, (cid: CardID) =>
			getCard(cid).subtypes.includes("Attraction")
		);
		super(filteredCardPool, landSlot, options);
		this.attractions = attractions;
		this.stickers = CardsBySet["sunf"];
	}

	generateBooster(targets: Targets) {
		if (isEmpty(this.attractions)) {
			return super.generateBooster(targets);
		} else {
			let updatedTargets = Object.assign({}, targets);
			if (targets === DefaultBoosterTargets) {
				updatedTargets = {
					rare: 1,
					uncommon: 3,
					common: 7,
				};
			} else {
				updatedTargets["common"] = Math.max(0, updatedTargets["common"] - 2);
			}

			const booster = super.generateBooster(updatedTargets);
			if (isMessageError(booster)) return booster;

			for (let i = 0; i < 2; ++i) {
				const attractionRarity = rollSpecialCardRarity(
					countBySlot(this.attractions),
					updatedTargets,
					this.options
				);
				const attraction = pickCard(this.attractions[attractionRarity]);
				booster.unshift(attraction);
			}

			const stickerID = getRandom(this.stickers);
			booster.push(getUnique(stickerID));

			return booster;
		}
	}
}

/* 1 Rare or mythic rare
 * 1 Retro artifact or retro schematic card ("It's an uncommon approximately 66% of the time, a rare ~27% of the time, and a mythic rare ~7% of the time")
 * 3 Non-foil uncommons
 * 10 Non-foil commons, unless one is replaced by a traditional foil card of any rarity (33%)
 * 1 Basic land or mech land card
 */
class BROBoosterFactory extends BoosterFactory {
	readonly RetroMythicChance = 0.07;
	readonly RetroRareChance = 0.27;

	retroArtifacts: SlotedCardPool = { uncommon: new Map(), rare: new Map(), mythic: new Map() };

	constructor(cardPool: SlotedCardPool, landSlot: BasicLandSlot | null, options: Options) {
		super(cardPool, landSlot, options);

		if (options.session && !options.session.unrestrictedCardPool()) {
			const BRRCards: CardPool = options.session.restrictedCollection(["brr"]);
			for (const cid of BRRCards.keys())
				this.retroArtifacts[getCard(cid).rarity].set(
					cid,
					Math.min(options.maxDuplicates?.[getCard(cid).rarity] ?? 99, BRRCards.get(cid) as number)
				);
		} else {
			for (const cid of CardsBySet["brr"])
				this.retroArtifacts[getCard(cid).rarity].set(cid, options.maxDuplicates?.[getCard(cid).rarity] ?? 99);
		}
	}

	generateBooster(targets: Targets) {
		if (isEmpty(this.retroArtifacts)) {
			return super.generateBooster(targets);
		} else {
			const retroCardsCounts = countBySlot(this.retroArtifacts);
			const retroRarityRoll = random.real(0, 1);
			const pickedRarity =
				targets["rare"] > 0
					? this.options.mythicPromotion &&
					  retroCardsCounts["mythic"] > 0 &&
					  retroRarityRoll < this.RetroMythicChance
						? "mythic"
						: retroCardsCounts["rare"] > 0 &&
						  retroRarityRoll < this.RetroMythicChance + this.RetroRareChance
						? "rare"
						: "uncommon"
					: "uncommon";
			const retroArtifact = pickCard(this.retroArtifacts[pickedRarity], []);

			const booster = super.generateBooster(targets);
			if (isMessageError(booster)) return booster;
			if (retroArtifact) booster.unshift(retroArtifact);
			return booster;
		}
	}
}

// Dominaria Remastered
// 1 Retro C/U/R/M in every pack. If R/M is Retro, C/U is not Retro, and vice versa.
class DMRBoosterFactory extends BoosterFactory {
	readonly RetroRareChance = 0.25; // "Retro Rare or higher replaces a non-Retro Rare or higher in 25% of boosters"

	retroCards: SlotedCardPool = { common: new Map(), uncommon: new Map(), rare: new Map(), mythic: new Map() };

	constructor(cardPool: SlotedCardPool, landSlot: BasicLandSlot | null, options: Options) {
		const [retroCards, filteredCardPool] = filterCardPool(
			cardPool,
			(cid: CardID) =>
				parseInt(getCard(cid).collector_number) >= 262 && parseInt(getCard(cid).collector_number) <= 401
		);
		super(filteredCardPool, landSlot, options);
		this.retroCards = retroCards;
	}

	generateBooster(targets: Targets) {
		if (isEmpty(this.retroCards)) {
			return super.generateBooster(targets);
		} else {
			const retroCardsCounts = countBySlot(this.retroCards);
			const retroRarityRoll = random.real(0, 1);

			const updatedTargets = Object.assign({}, targets);

			let pickedRarity = "common";
			if (retroCardsCounts["rare"] > 0 && retroRarityRoll < this.RetroRareChance) {
				--updatedTargets["rare"];
				if (retroCardsCounts["mythic"] > 0 && retroRarityRoll < (1.0 / 8.0) * this.RetroRareChance)
					pickedRarity = "mythic";
				else pickedRarity = "rare";
			} else if (retroCardsCounts["uncommon"] > 0 && retroRarityRoll < 0.55)
				// FIXME: We don't know the actual rate.
				pickedRarity = "uncommon";

			const retroCard = pickCard(this.retroCards[pickedRarity], []);

			const booster = super.generateBooster(updatedTargets);
			if (isMessageError(booster)) return booster;
			// Insert the Retro card right after the rare.
			if (retroCard) booster.splice(updatedTargets["rare"], 0, retroCard);
			return booster;
		}
	}
}

// Phyrexia: All Will be One
// Chance (exact probability unknown) at a 'Borderless Concept Praetor'.
class ONEBoosterFactory extends BoosterFactory {
	praetorsIDs: CardID[] = [
		"649be99a-fa52-469e-85df-11ecc576ea39", // Elesh Norn, Mother of Machines (ONE) 416
		"ff018fe2-9feb-431d-b4c5-61b2ed0d919d", // Vorinclex, Monstrous Raider (KHM) 406
		"8df6603a-38c1-4d18-8b84-6211e9a7cc09", // Sheoldred, the Apocalypse (DMU) 435
		"8c395a69-b60d-4510-b04b-86b59ed2b158", // Jin-Gitaxias, Progress Tyrant (NEO) 513
		"c13670af-e266-4e19-b479-92fae2b15f4a", // Urabrask, Heretic Praetor (SNC) 468
	];

	constructor(cardPool: SlotedCardPool, landSlot: BasicLandSlot | null, options: Options) {
		super(cardPool, landSlot, options);
	}

	generateBooster(targets: Targets) {
		const updatedTargets = Object.assign({}, targets);

		let conceptPraetor: null | UniqueCard = null;
		const praetorRarityRoll = random.real(0, 1);
		// There's 20 other mythics, we give the 'concept praetor' the same probability as any other (counting all 5 as a single mythic).
		if (
			updatedTargets.rare > 0 &&
			this.options?.mythicPromotion &&
			praetorRarityRoll < (1.0 / 8.0) * (1.0 / 21.0)
		) {
			const conceptPraetorID = getRandom(this.praetorsIDs);
			conceptPraetor = getUnique(conceptPraetorID);
			--updatedTargets["rare"];
		}

		const booster = super.generateBooster(updatedTargets);
		if (isMessageError(booster)) return booster;

		if (conceptPraetor) booster.unshift(conceptPraetor);

		return booster;
	}
}

// Shadows over Innistrad Remastered (SIR)
// One card from a rotating bonus sheet in each booster
import ShadowOfThePastLists from "./data/shadow_of_the_past.json" assert { type: "json" };

class SIRBoosterFactory extends BoosterFactory {
	bonusSheet: SlotedCardPool = { common: new Map(), uncommon: new Map(), rare: new Map(), mythic: new Map() };

	constructor(cardPool: SlotedCardPool, landSlot: BasicLandSlot | null, options: Options) {
		super(cardPool, landSlot, options);
		const currentSheet =
			options.bonusSheet ??
			Math.floor(new Date().getTime() / (1000 * 60 * 60 * 24 * 7)) % ShadowOfThePastLists.length;
		for (const cid of ShadowOfThePastLists[currentSheet].card_ids) {
			const card = getCard(cid);
			this.bonusSheet[card.rarity].set(cid, options.maxDuplicates?.[card.rarity] ?? 99);
		}
	}

	generateBooster(targets: Targets) {
		const updatedTargets = Object.assign({}, targets);

		// FIXME: No idea if the bonus sheet card actually replaces a common or not, but it's simpler for now (keeps the cards count to 14 without land slot).
		updatedTargets.common = Math.max(0, updatedTargets.common - 1);

		const bonusCardRarity = rollSpecialCardRarity(countBySlot(this.bonusSheet), updatedTargets, this.options);

		const booster = super.generateBooster(updatedTargets);
		if (isMessageError(booster)) return booster;

		const bonusCard = pickCard(this.bonusSheet[bonusCardRarity]);
		booster.unshift(bonusCard);

		return booster;
	}
}

// Allow users to specify the bonus sheet
class SIRBoosterFactoryBonusSheet0 extends SIRBoosterFactory {
	constructor(cardPool: SlotedCardPool, landSlot: BasicLandSlot | null, options: Options) {
		super(cardPool, landSlot, Object.assign({ bonusSheet: 0 }, options));
	}
}
class SIRBoosterFactoryBonusSheet1 extends SIRBoosterFactory {
	constructor(cardPool: SlotedCardPool, landSlot: BasicLandSlot | null, options: Options) {
		super(cardPool, landSlot, Object.assign({ bonusSheet: 1 }, options));
	}
}
class SIRBoosterFactoryBonusSheet2 extends SIRBoosterFactory {
	constructor(cardPool: SlotedCardPool, landSlot: BasicLandSlot | null, options: Options) {
		super(cardPool, landSlot, Object.assign({ bonusSheet: 2 }, options));
	}
}
class SIRBoosterFactoryBonusSheet3 extends SIRBoosterFactory {
	constructor(cardPool: SlotedCardPool, landSlot: BasicLandSlot | null, options: Options) {
		super(cardPool, landSlot, Object.assign({ bonusSheet: 3 }, options));
	}
}

// March of the Machine
// 1 Rare or mythic rare
// 1 Multiverse Legends card
// 1 Battle card
// 1 Non-battle double-faced card
// 3–5 Uncommons (including double-faced cards, battle cards, and Multiverse Legends cards noted above)
// 8–9 Commons
//
// "1–2 cards of rarity Rare or higher in every pack"
// My intuition is that the possible additional rare is the multiverse legends card, and the battle/non-battle double-faced card/single face card share the garanteed rare slot.
class MOMBoosterFactory extends BoosterFactory {
	static readonly RareBattleChance = 0.25; // TODO: Check this rate

	multiverseLegend: SlotedCardPool = { uncommon: new Map(), rare: new Map(), mythic: new Map() };
	battleCards: SlotedCardPool = { uncommon: new Map(), rare: new Map(), mythic: new Map() };
	doubleFacedCards: SlotedCardPool = { common: new Map(), uncommon: new Map(), rare: new Map(), mythic: new Map() };

	constructor(cardPool: SlotedCardPool, landSlot: BasicLandSlot | null, options: Options) {
		const [battleCards, filteredCardPool] = filterCardPool(
			cardPool,
			(cid: CardID) => getCard(cid).type.includes("Battle") // Note: We could use the layout, but it's not always correctly set on scryfall yet
		);
		// TODO: Check if this is correct
		const [doubleFacedCards, refilteredCardPool] = filterCardPool(
			filteredCardPool,
			(cid: CardID) => !!getCard(cid).back
		);
		super(refilteredCardPool, landSlot, options);

		if (options.session && !options.session.unrestrictedCardPool()) {
			const MULCards: CardPool = options.session.restrictedCollection(["mul"]);
			for (const cid of MULCards.keys())
				this.multiverseLegend[getCard(cid).rarity].set(
					cid,
					Math.min(options.maxDuplicates?.[getCard(cid).rarity] ?? 99, MULCards.get(cid) as number)
				);
		} else {
			for (const cid of CardsBySet["mul"])
				this.multiverseLegend[getCard(cid).rarity].set(cid, options.maxDuplicates?.[getCard(cid).rarity] ?? 99);
		}

		this.battleCards = battleCards;
		this.doubleFacedCards = doubleFacedCards;
	}

	generateBooster(targets: Targets) {
		if (isEmpty(this.multiverseLegend) || isEmpty(this.battleCards) || isEmpty(this.doubleFacedCards)) {
			return super.generateBooster(targets);
		} else {
			const updatedTargets = Object.assign({}, targets);
			updatedTargets.uncommon = Math.max(0, updatedTargets.uncommon - 1);
			updatedTargets.common = Math.max(0, updatedTargets.common - 2);

			const insertedCards: UniqueCard[] = [];

			const mulRarity = rollSpecialCardRarity(
				countBySlot(this.multiverseLegend),
				targets,
				Object.assign({ minRarity: "uncommon" }, this.options)
			);
			insertedCards.push(pickCard(this.multiverseLegend[mulRarity]));

			let battleRarity = "uncommon";
			let dfcRarity =
				this.doubleFacedCards.common.size === 0 ||
				(targets.uncommon > 0 && random.real(0, 1) <= targets.uncommon / (targets.common + targets.uncommon))
					? "uncommon"
					: "common";

			if (targets.rare > 0) {
				const raresCount = countMap(this.cardPool.rare);
				const battleRaresCount = countMap(this.battleCards.rare);
				const dfcRaresCount = countMap(this.doubleFacedCards.rare);

				const rareTypeRoll = random.real(0, raresCount + battleRaresCount + dfcRaresCount);

				if (rareTypeRoll > raresCount) {
					updatedTargets.rare = Math.max(0, updatedTargets.rare - 1);
					if (rareTypeRoll <= raresCount + battleRaresCount) {
						battleRarity =
							this.options?.mythicPromotion &&
							random.real(0, 1) < mythicRate &&
							this.battleCards.mythic.size > 0
								? "mythic"
								: "rare";
					} else {
						dfcRarity =
							this.options?.mythicPromotion &&
							random.real(0, 1) < mythicRate &&
							this.doubleFacedCards.mythic.size > 0
								? "mythic"
								: "rare";
					}
				}
			}
			insertedCards.push(pickCard(this.battleCards[battleRarity]));
			insertedCards.push(pickCard(this.doubleFacedCards[dfcRarity]));

			const booster = super.generateBooster(updatedTargets);
			if (isMessageError(booster)) return booster;
			// Insert the Retro card right after the rare.
			booster.splice(updatedTargets["rare"], 0, ...insertedCards);
			return booster;
		}
	}
}

// Set specific rules.
// Neither DOM, WAR or ZNR have specific rules for commons, so we don't have to worry about color balancing (colorBalancedSlot)
export const SetSpecificFactories: {
	[set: string]: new (cardPool: SlotedCardPool, landSlot: BasicLandSlot | null, options: Options) => BoosterFactory;
} = {
	war: WARBoosterFactory,
	dom: DOMBoosterFactory,
	znr: ZNRBoosterFactory,
	cmr: CMRBoosterFactory,
	tsr: TSRBoosterFactory,
	stx: STXBoosterFactory,
	mh2: MH2BoosterFactory,
	mid: MIDBoosterFactory,
	vow: MIDBoosterFactory, // Innistrad: Crimson Vow - Identical to MID
	dbl: DBLBoosterFactory,
	neo: NEOBoosterFactory,
	clb: CLBBoosterFactory,
	"2x2": M2X2BoosterFactory,
	dmu: DMUBoosterFactory,
	unf: UNFBoosterFactory,
	ydmu: YDMUBoosterFactory,
	bro: BROBoosterFactory,
	dmr: DMRBoosterFactory,
	one: ONEBoosterFactory,
	sir: SIRBoosterFactory,
	sir0: SIRBoosterFactoryBonusSheet0,
	sir1: SIRBoosterFactoryBonusSheet1,
	sir2: SIRBoosterFactoryBonusSheet2,
	sir3: SIRBoosterFactoryBonusSheet3,
	mom: MOMBoosterFactory,
};

/*
 * Another collation method using data from https://github.com/taw/magic-sealed-data
 */

import PaperBoosterData from "./data/sealed_extended_data.json" assert { type: "json" };
import { isMessageError, MessageError } from "./Message.js";

class CardInfo {
	set: string = "";
	number: string = "";
	weight: number = 0;
	foil: boolean = false;
	uuid: string = "";
	// computed
	id: string = "";
}
interface BoosterInfo {
	sheets: { [slot: string]: number };
	weight: number;
}
interface SheetInfo {
	balance_colors?: boolean;
	total_weight: number;
	cards: CardInfo[];
}
interface SetInfo {
	name: string;
	code: string;
	set_code: string;
	set_name: string;
	boosters: BoosterInfo[];
	sheets: { [slot: string]: SheetInfo };
	// computed
	colorBalancedSheets?: { [sheet: string]: { [subsheet: string]: { cards: CardInfo[]; total_weight: number } } };
}

function weightedRandomPick(
	arr: Array<CardInfo>,
	totalWeight: number,
	picked: Array<CardInfo> = [],
	attempt = 0
): CardInfo {
	const idx = weightedRandomIdx(arr, totalWeight);
	// Duplicate protection (allows duplicates between foil and non-foil)
	// Not sure if we should checks ids or (set, number) here.
	if (attempt < 10 && picked.some((c: CardInfo) => c.id === arr[idx].id && c.foil === arr[idx].foil))
		return weightedRandomPick(arr, totalWeight, picked, attempt + 1);
	return arr[idx];
}

const CardsBySetAndCollectorNumber: { [id: string]: CardID } = {};
for (const [cid, card] of Cards) {
	CardsBySetAndCollectorNumber[`${card.set}:${card.collector_number}`] = cid;
}

export class PaperBoosterFactory implements IBoosterFactory {
	set: SetInfo;
	options: Options;
	possibleContent: BoosterInfo[];
	landSlot: null = null;

	constructor(set: SetInfo, options: Options, possibleContent: BoosterInfo[]) {
		this.set = set;
		this.options = options;
		this.possibleContent = possibleContent;
	}

	generateBooster() {
		const booster: Array<CardInfo> = [];
		// Select one of the possible sheet arrangement
		const boosterContent =
			this.possibleContent[
				weightedRandomIdx(
					this.possibleContent,
					this.possibleContent.reduce((acc: number, val: BoosterInfo) => acc + val.weight, 0)
				)
			];
		// Pick cards from each sheet, color balancing if necessary
		for (const sheetName in boosterContent.sheets) {
			if (this.set.sheets[sheetName].balance_colors) {
				const sheet = this.set.colorBalancedSheets?.[sheetName];
				if (!sheet) {
					console.error(
						`PaperBoosterFactory::generateBooster(): ${sheetName} marked with balance_colors = true but corresponding colorBalancedSheets not initialized.`
					);
					continue;
				}
				const pickedCards: Array<CardInfo> = [];
				for (const color of "WUBRG")
					pickedCards.push(weightedRandomPick(sheet[color].cards, sheet[color].total_weight, pickedCards));
				const cardsToPick = boosterContent.sheets[sheetName] - pickedCards.length;
				// Compensate the color balancing to keep a uniform distribution of cards within the sheet.
				const x =
					(sheet["Mono"].total_weight * cardsToPick - sheet["Others"].total_weight * pickedCards.length) /
					(cardsToPick * (sheet["Mono"].total_weight + sheet["Others"].total_weight));
				for (let i = 0; i < cardsToPick; ++i) {
					// For sets with only one non-mono colored card (like M14 and its unique common artifact)
					// compensating for the color balance may introduce duplicates. This check makes sure it doesn't happen.
					const noOther =
						sheet["Others"].cards.length === 1 &&
						pickedCards.some((c) => c.id === sheet["Others"].cards[0].id);
					const selectedSheet = random.bool(x) || noOther ? sheet["Mono"] : sheet["Others"];
					pickedCards.push(weightedRandomPick(selectedSheet.cards, selectedSheet.total_weight, pickedCards));
				}
				shuffleArray(pickedCards);
				booster.push(...pickedCards);
			} else {
				for (let i = 0; i < boosterContent.sheets[sheetName]; ++i) {
					booster.push(
						weightedRandomPick(
							this.set.sheets[sheetName].cards,
							this.set.sheets[sheetName].total_weight,
							booster
						)
					);
				}
			}
		}
		return booster.map((c) => getUnique(c.id, { foil: c.foil })).reverse();
	}
}

export const PaperBoosterFactories: {
	[set: string]: (options?: Options) => PaperBoosterFactory;
} = {};
export const PaperBoosterSizes: {
	[set: string]: number;
} = {};
for (const s of PaperBoosterData as any[]) {
	const set: SetInfo = s as SetInfo;
	if (!Constants.PrimarySets.includes(set.code) && !set.code.includes("-arena")) {
		//console.log( `PaperBoosterFactories: Found '${set.code}' collation data but set is not in PrimarySets, skippink it.` );
		continue;
	}

	set.colorBalancedSheets = {};
	for (const sheetName in set.sheets) {
		for (const card of set.sheets[sheetName].cards) {
			let num = card.number;
			card.id = CardsBySetAndCollectorNumber[`${card.set}:${num}`];
			if (!card.id) {
				// Special case for double faced cards
				if (["a", "★"].includes(num[num.length - 1])) num = num.substr(0, num.length - 1);
				card.id = CardsBySetAndCollectorNumber[`${card.set}:${num}`];
			}
			if (!card.id) console.log("Error! Could not find corresponding card:", card);
		}
		if (set.sheets[sheetName].balance_colors) {
			set.colorBalancedSheets[sheetName] = {
				W: { cards: [], total_weight: 0 },
				U: { cards: [], total_weight: 0 },
				B: { cards: [], total_weight: 0 },
				R: { cards: [], total_weight: 0 },
				G: { cards: [], total_weight: 0 },
				Mono: { cards: [], total_weight: 0 },
				Others: { cards: [], total_weight: 0 },
			};
			for (const c of set.sheets[sheetName].cards) {
				const card = getCard(c.id);
				if (card.colors.length === 1) {
					set.colorBalancedSheets[sheetName][card.colors[0]].cards.push(c);
					set.colorBalancedSheets[sheetName][card.colors[0]].total_weight += c.weight;
					set.colorBalancedSheets[sheetName]["Mono"].cards.push(c);
					set.colorBalancedSheets[sheetName]["Mono"].total_weight += c.weight;
				} else {
					set.colorBalancedSheets[sheetName]["Others"].cards.push(c);
					set.colorBalancedSheets[sheetName]["Others"].total_weight += c.weight;
				}
			}
		}
	}
	PaperBoosterFactories[set.code] = function (options: Options = {}) {
		let possibleContent = set.boosters;
		if (!options.foil) {
			// (Attempt to) Filter out sheets with foils if option is disabled.
			const nonFoil = set.boosters.filter((e) => !Object.keys(e.sheets).some((s) => s.includes("foil")));
			if (nonFoil.length > 0) possibleContent = nonFoil;
		}
		return new PaperBoosterFactory(set, options, possibleContent);
	};
	PaperBoosterSizes[set.code] = Object.keys(set.boosters[0].sheets).reduce(
		(acc: number, curr: string): number => acc + set.boosters[0].sheets[curr],
		0
	);
}

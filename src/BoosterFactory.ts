import { CardID, Card, UniqueCard } from "./CardTypes.js";
import { getUnique, BoosterCardsBySet, CardsBySet, getCard, DefaultMaxDuplicates } from "./Cards.js";
import { shuffleArray, Options, random, getRandom, cumulativeSum, chooseWeighted } from "./utils.js";
import { pickCard } from "./cardUtils.js";
import { BasicLandSlot } from "./LandSlot.js";
import { MessageError, isMessageError } from "./Message.js";
import { Session } from "./Session.js";

// Generates booster for regular MtG Sets

const DefaultMythicRate = 1.0 / 8.0;
const foilRate = 15.0 / 67.0;
// 1/16 chances of a foil basic land added to the common slot. Mythic to common
const foilRarityRates: { [slot: string]: number } = {
	mythic: 1.0 / 128,
	rare: 1.0 / 128 + 7.0 / 128,
	uncommon: 1.0 / 16 + 3.0 / 16,
	common: 1.0,
};

const SetMythicRates: Record<string, number> = {};

for (const [set, cards] of Object.entries(BoosterCardsBySet)) {
	const rareCount = cards.filter((cid) => getCard(cid).rarity === "rare").length;
	const mythicCount = cards.filter((cid) => getCard(cid).rarity === "mythic").length;
	const mythicRate = mythicCount / (2 * rareCount + mythicCount);
	// Reject NaN and outliers
	if (!isNaN(mythicRate) && mythicRate > 1 / 9 && mythicRate < 1 / 6)
		SetMythicRates[set] = mythicCount / (2 * rareCount + mythicCount);
}
SetMythicRates["pio"] = 1.0 / 5.0;
Object.freeze(SetMythicRates);

export function getSetMythicRate(set: string | null): number {
	if (set === null) return DefaultMythicRate;
	if (SetMythicRates[set]) return SetMythicRates[set];
	return DefaultMythicRate;
}

export function getSetFoilRate(set: string | null) {
	if (set === null) return foilRate;
	if (
		[
			"eld",
			"thb",
			"iko",
			"znr",
			"khm",
			"stx",
			"afr",
			"mid",
			"vow",
			"neo",
			"snc",
			"dmu",
			"bro",
			"dmr",
			"one",
			"mom",
			"woe",
			"lci",
			"rvr",
			"mkm",
		].includes(set)
	)
		return 1.0 / 3.0;
	return foilRate;
}

type Targets = { [slot: string]: number };

export const DefaultBoosterTargets: Targets = {
	common: 10,
	uncommon: 3,
	rare: 1,
	bonus: 1,
};

function isEmpty(slotedCardPool: SlotedCardPool): boolean {
	return Object.values(slotedCardPool).every((value: CardPool) => value.size === 0);
}

class ColorBalancedSlotCache {
	originalCardPool: CardPool;

	byColor: { [color: string]: CardPool } = {};
	monocolored: CardPool = new CardPool();
	others: CardPool = new CardPool();

	constructor(cardPool: CardPool, options: { getCard?: (cid: CardID) => Card }) {
		this.originalCardPool = cardPool;

		const localGetCard = options.getCard ?? getCard;
		for (const cid of cardPool.keys()) {
			if (!(localGetCard(cid).colors.join() in this.byColor))
				this.byColor[localGetCard(cid).colors.join()] = new CardPool();
		}

		this.reset(options);
	}

	reset(options: { getCard?: (cid: CardID) => Card }) {
		const localGetCard = options.getCard ?? getCard;
		for (const [cid, count] of this.originalCardPool) {
			this.byColor[localGetCard(cid).colors.join()].set(cid, count);
		}

		for (const cardPool of Object.keys(this.byColor)
			.filter((k) => k.length === 1)
			.map((k) => this.byColor[k]))
			for (const [cid, val] of cardPool.entries()) this.monocolored.set(cid, val);

		for (const cardPool of Object.keys(this.byColor)
			.filter((k) => k.length !== 1)
			.map((k) => this.byColor[k]))
			for (const [cid, val] of cardPool.entries()) this.others.set(cid, val);
	}

	// Signals the supplied card has been picked and has to be removed from the internal cache.
	removeCard(pickedCard: Card) {
		this.byColor[pickedCard.colors.join()].removeCard(pickedCard.id);
		if (pickedCard.colors.length === 1) this.monocolored.removeCard(pickedCard.id);
		else this.others.removeCard(pickedCard.id);
	}
}

import TheListMKM from "./data/TheList/MKM_TheList.json" with { type: "json" };

const TheList = {
	mkm: TheListMKM,
};

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

	static choiceCount(uniformAll: boolean): (cardPool: CardPool) => number {
		if (uniformAll)
			return (cardPool: CardPool) => cardPool.count(); // Multiple copies means a higher weight.
		else return (cardPool: CardPool) => cardPool.size; // All unique cards have the same probability of being picked.
	}

	// Returns cardCount color balanced cards picked from cardPool.
	// duplicateProtection can contain pre-selected cards to avoid duplicates.
	generate(
		cardCount: number,
		duplicateProtection: Array<UniqueCard> = [],
		options: Parameters<typeof pickCard>[2] = {}
	) {
		const pickedCards: UniqueCard[] = [];
		const withReplacement = options?.withReplacement ?? false;
		const uniformAll = options?.uniformAll ?? false;
		const choiceCount = ColorBalancedSlot.choiceCount(uniformAll);

		const forcedColors = ["W", "U", "B", "R", "G"];

		// How many mono-colored cards can we force before running out of space to correct the ratio?
		const maxColorBalanceCount = Math.floor(
			(cardCount * choiceCount(this.cache.monocolored)) /
				(choiceCount(this.cache.monocolored) + choiceCount(this.cache.others))
		);
		// cardCount is too low to ensure space for non-monocolored cards
		if (maxColorBalanceCount < forcedColors.length) {
			// Not a high enough ratio of mono cards to support even one balanced card, fallback to random picking.
			if (maxColorBalanceCount < 1) {
				for (let i = 0; i < cardCount; ++i) {
					const pickedCard = pickCard(this.cardPool, pickedCards.concat(duplicateProtection), options);
					pickedCards.push(pickedCard);
					if (!withReplacement) this.cache.removeCard(pickedCard);
				}
				return pickedCards;
			}

			if (maxColorBalanceCount < forcedColors.length) {
				shuffleArray(forcedColors);
				forcedColors.length = maxColorBalanceCount;
			}
		}

		for (const c of forcedColors) {
			if (this.cache.byColor[c] && this.cache.byColor[c].size > 0) {
				const pickedCard = pickCard(this.cache.byColor[c], pickedCards.concat(duplicateProtection), options);
				pickedCards.push(pickedCard);

				if (!withReplacement) {
					this.cardPool.removeCard(pickedCard.id);
					if (pickedCard.colors.length === 1) this.cache.monocolored.removeCard(pickedCard.id);
					else this.cache.others.removeCard(pickedCard.id);
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
		const c = choiceCount(this.cache.monocolored) + seededMonocolors;
		const a = choiceCount(this.cache.others);
		const remainingCards = cardCount - seededMonocolors; // r
		const x = (c * remainingCards - a * seededMonocolors) / (remainingCards * (c + a));
		for (let i = pickedCards.length; i < cardCount; ++i) {
			const type =
				(random.bool(x) && choiceCount(this.cache.monocolored) !== 0) || choiceCount(this.cache.others) === 0;
			const pickedCard = pickCard(
				type ? this.cache.monocolored : this.cache.others,
				pickedCards.concat(duplicateProtection),
				options
			);
			pickedCards.push(pickedCard);

			if (!withReplacement) {
				this.cardPool.removeCard(pickedCard.id);
				this.cache.byColor[pickedCard.colors.join()].removeCard(pickedCard.id);
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

export type BoosterFactoryOptions = {
	foil?: boolean;
	foilRate?: number;
	foilCardPool?: SlotedCardPool;
	mythicPromotion?: boolean;
	mythicRate?: number;
	colorBalance?: boolean;
	session?: Session;
	maxDuplicates?: Record<string, number>;
	bonusSheet?: number;
};

export class BoosterFactory implements IBoosterFactory {
	cardPool: SlotedCardPool;
	landSlot: BasicLandSlot | null;
	options: BoosterFactoryOptions;
	colorBalancedSlot?: ColorBalancedSlot;

	constructor(cardPool: SlotedCardPool, landSlot: BasicLandSlot | null, options: BoosterFactoryOptions) {
		this.cardPool = cardPool;
		this.landSlot = landSlot;
		if (this.landSlot && this.landSlot.setup) this.landSlot.setup(this.cardPool["common"]);
		this.options = options;
		if (this.options.colorBalance) this.colorBalancedSlot = new ColorBalancedSlot(this.cardPool["common"]);
	}

	/* Returns a standard draft booster
	 *   targets: Card count for each slot (e.g. {common:10, uncommon:3, rare:1})
	 *   pickedCards: (optional) Already picked cards, they do not count towards targets and are only there to provide duplicate protection.
	 */
	generateBooster(targets: Targets, pickedCards?: Array<UniqueCard>): UniqueCard[] | MessageError {
		let booster: Array<UniqueCard> = pickedCards ?? [];

		let addedFoils = 0;
		const localFoilRate = this.options.foilRate ?? foilRate;
		if (this.options.foil && random.bool(localFoilRate)) {
			const rarityCheck = random.real(0, 1);
			const foilCardPool: SlotedCardPool = this.options.foilCardPool ?? this.cardPool;
			for (const r in foilRarityRates)
				if (rarityCheck <= foilRarityRates[r] && foilCardPool[r].size > 0) {
					const pickedCard = pickCard(foilCardPool[r], [], { foil: true });
					// Synchronize color balancing dictionary
					if (this.options.colorBalance && this.colorBalancedSlot && pickedCard.rarity === "common")
						this.colorBalancedSlot.cache.removeCard(pickedCard);
					booster.push(pickedCard);
					addedFoils += 1;
					break;
				}
		}

		const mythicRate = this.options.mythicRate ?? DefaultMythicRate;
		for (let i = 0; i < targets["rare"]; ++i) {
			if (
				(!this.options.mythicPromotion || this.cardPool["mythic"].size === 0) &&
				this.cardPool["rare"].size === 0
			)
				return new MessageError("Error generating boosters", `Not enough rare or mythic cards in card pool.`);

			const pool =
				this.options.mythicPromotion &&
				this.cardPool["mythic"].size > 0 &&
				(random.bool(mythicRate) || this.cardPool["rare"].size === 0)
					? "mythic"
					: "rare";
			booster.push(pickCard(this.cardPool[pool], booster));
		}

		for (let i = 0; i < targets["uncommon"]; ++i) booster.push(pickCard(this.cardPool["uncommon"], booster));

		// Color balance the booster by adding one common of each color if possible
		let pickedCommons = [];
		const commonCount = targets["common"] - addedFoils;
		if (this.cardPool["common"].count() < commonCount)
			return new MessageError("Error generating boosters", `Not enough common cards in card pool.`);
		if (this.options.colorBalance && this.colorBalancedSlot) {
			pickedCommons = this.colorBalancedSlot.generate(commonCount, booster);
		} else {
			for (let i = pickedCommons.length; i < commonCount; ++i) {
				const pickedCard = pickCard(this.cardPool["common"], pickedCommons);
				pickedCommons.push(pickedCard);
				// commonCount might change (because of foils, or other future collation oddities) between packs, make sure cache is up to date.
				if (this.colorBalancedSlot) this.colorBalancedSlot.cache.removeCard(pickedCard);
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
		specialCards[slot] = new CardPool();
		filteredCardPool[slot] = new CardPool();
		for (const [cid, count] of slotedCardPool[slot]) {
			if (predicate(cid)) specialCards[slot].set(cid, count);
			else filteredCardPool[slot].set(cid, count);
		}
	}
	return [specialCards, filteredCardPool];
}

function rollSpecialCardRarity(
	cardCounts: { [slot: string]: number },
	targets: Targets,
	options: { minRarity?: string; mythicPromotion?: boolean; mythicRate?: number }
) {
	const mythicPromotion = options.mythicPromotion ?? true;
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
			(cardCounts["mythic"] > 0 && mythicPromotion && random.bool(options.mythicRate ?? DefaultMythicRate))
		)
			pickedRarity = "mythic";
	}

	if (cardCounts[pickedRarity] === 0) pickedRarity = Object.keys(cardCounts).find((v) => cardCounts[v] > 0)!;

	return pickedRarity;
}

function countBySlot(slotedCardPool: SlotedCardPool) {
	const counts: { [slot: string]: number } = {};
	for (const slot in slotedCardPool) counts[slot] = slotedCardPool[slot].count();
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

	constructor(cardPool: SlotedCardPool, landSlot: BasicLandSlot | null, options: BoosterFactoryOptions) {
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

			const updatedTargets = structuredClone(targets);
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

	constructor(cardPool: SlotedCardPool, landSlot: BasicLandSlot | null, options: BoosterFactoryOptions) {
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

			const updatedTargets = structuredClone(targets);
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

	constructor(cardPool: SlotedCardPool, landSlot: BasicLandSlot | null, options: BoosterFactoryOptions) {
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

			const updatedTargets = structuredClone(targets);
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
	static PrismaticPiperID = "a69e6d8f-f742-4508-a83a-38ae84be228c";
	completeCardPool: SlotedCardPool;
	legendaryCreatures: SlotedCardPool;

	constructor(cardPool: SlotedCardPool, landSlot: BasicLandSlot | null, options: BoosterFactoryOptions) {
		const [legendaryCreatures, filteredCardPool] = filterCardPool(
			cardPool,
			(cid: CardID) => getCard(cid).type.match(CMRBoosterFactory.regex) !== null
		);
		filteredCardPool["common"].delete(CMRBoosterFactory.PrismaticPiperID); // Remove Prismatic Piper from the common pool (can still be found in the foil pool completeCardPool)
		super(filteredCardPool, landSlot, options);
		this.completeCardPool = cardPool;
		this.legendaryCreatures = legendaryCreatures;
	}

	// Not using the suplied cardpool here
	generateBooster(targets: Targets) {
		// 20 Cards: *13 Commons (Higher chance of a Prismatic Piper); *3 Uncommons; 2 Legendary Creatures; *1 Non-"Legendary Creature" Rare/Mythic; 1 Foil
		// * These slots are handled by the originalGenBooster function; Others are special slots with custom logic.
		const updatedTargets =
			targets === DefaultBoosterTargets
				? {
						common: 13,
						uncommon: 3,
						rare: 1,
					}
				: structuredClone(targets);
		const legendaryCounts = countBySlot(this.legendaryCreatures);
		// Ignore the rule if there's no legendary creatures left
		if (Object.values(legendaryCounts).every((c) => c === 0)) {
			return super.generateBooster(updatedTargets);
		} else {
			const booster: Array<UniqueCard> = [];
			// Prismatic Piper instead of a common in about 1 of every 6 packs
			if (random.bool(1 / 6)) {
				--updatedTargets.common;
				booster.push(getUnique(CMRBoosterFactory.PrismaticPiperID));
			}
			const nonLegendary = super.generateBooster(updatedTargets);
			if (isMessageError(nonLegendary)) return nonLegendary;
			booster.push(...nonLegendary);

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
				this.completeCardPool[pickedCard.rarity].removeCard(pickedCard.id);
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
			const pickedFoil = pickCard(this.completeCardPool[foilRarity], [], { foil: true });
			if (this.cardPool[pickedFoil.rarity].has(pickedFoil.id))
				this.cardPool[pickedFoil.rarity].removeCard(pickedFoil.id);
			if (this.legendaryCreatures[pickedFoil.rarity].has(pickedFoil.id))
				this.legendaryCreatures[pickedFoil.rarity].removeCard(pickedFoil.id);
			booster.unshift(pickedFoil);

			return booster;
		}
	}
}

// One Timeshifted Card ("special" rarity) per booster.
// Foil rarity should be higher for this set, but we'll probably just rely on the other collation method.
class TSRBoosterFactory extends BoosterFactory {
	constructor(cardPool: SlotedCardPool, landSlot: BasicLandSlot | null, options: BoosterFactoryOptions) {
		super(cardPool, landSlot, options);
	}
	generateBooster(targets: Targets) {
		const booster = super.generateBooster(targets);
		if (isMessageError(booster)) return booster;
		for (let i = 0; i < targets.bonus; ++i) {
			const timeshifted = pickCard(this.cardPool["special"], []);
			booster.push(timeshifted);
		}
		return booster;
	}
}

// Strixhaven: One card from the Mystical Archive (sta)
class STXBoosterFactory extends BoosterFactory {
	lessonsByRarity: SlotedCardPool;
	mysticalArchiveByRarity: SlotedCardPool;

	constructor(cardPool: SlotedCardPool, landSlot: BasicLandSlot | null, options: BoosterFactoryOptions) {
		const [lessons, filteredCardPool] = filterCardPool(
			cardPool,
			(cid: CardID) => getCard(cid).subtypes.includes("Lesson") && getCard(cid).rarity !== "uncommon"
		);
		super(filteredCardPool, landSlot, options);
		this.lessonsByRarity = lessons;

		this.mysticalArchiveByRarity = { uncommon: new CardPool(), rare: new CardPool(), mythic: new CardPool() };
		// Filter STA cards according to session collections
		if (options.session && !options.session.unrestrictedCardPool()) {
			const STACards: CardPool = options.session.restrictedCollection(["sta"]);
			for (const [cid, count] of STACards) {
				const card = getCard(cid);
				// Remove Japanese versions
				if (parseInt(card.collector_number) <= 63)
					this.mysticalArchiveByRarity[card.rarity].set(
						cid,
						Math.min(options.maxDuplicates?.[card.rarity] ?? DefaultMaxDuplicates, count)
					);
			}
		} else {
			for (const cid of BoosterCardsBySet["sta"]) {
				const card = getCard(cid);
				// Remove Japanese versions
				if (parseInt(card.collector_number) <= 63)
					this.mysticalArchiveByRarity[card.rarity].set(
						cid,
						options.maxDuplicates?.[card.rarity] ?? DefaultMaxDuplicates
					);
			}
		}
	}

	generateBooster(targets: Targets) {
		const updatedTargets = structuredClone(targets);
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

		const mysticalArchives: UniqueCard[] = [];
		for (let i = 0; i < targets.bonus; ++i) {
			if (updatedTargets["common"] > 0) --updatedTargets["common"];
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

			mysticalArchives.push(pickCard(this.mysticalArchiveByRarity[archiveRarity], []));
		}

		const booster = super.generateBooster(updatedTargets);
		if (isMessageError(booster)) return booster;
		booster.push(pickedLesson);

		booster.push(...mysticalArchives);

		return booster;
	}
}

// Modern Horizons 2
// 1 New-to-Modern reprint card (uncommon, rare, or mythic rare) [numbered #261-#303]
class MH2BoosterFactory extends BoosterFactory {
	newToModern: SlotedCardPool;
	constructor(cardPool: SlotedCardPool, landSlot: BasicLandSlot | null, options: BoosterFactoryOptions) {
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
			const newToModern: UniqueCard[] = [];
			for (let i = 0; i < targets.bonus; ++i) {
				// Roll for New-to-Modern rarity
				const pickedRarity = rollSpecialCardRarity(newToModernCounts, targets, this.options);
				newToModern.push(pickCard(this.newToModern[pickedRarity], []));
			}

			const booster = super.generateBooster(targets);
			if (isMessageError(booster)) return booster;
			// Insert the New-to-Modern card in the appropriate slot. FIXME: Currently unknown
			booster.unshift(...newToModern);
			return booster;
		}
	}
}

// Innistrad: Midnight Hunt
//  - Exactly one common double-faced card
//  - Exactly one uncommon or rare/mythic DFC
class MIDBoosterFactory extends BoosterFactory {
	doubleFacedCards: SlotedCardPool;
	constructor(cardPool: SlotedCardPool, landSlot: BasicLandSlot | null, options: BoosterFactoryOptions) {
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
			const updatedTargets = structuredClone(targets);
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
						? random.integer(
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
	constructor(cardPool: SlotedCardPool, landSlot: BasicLandSlot | null, options: BoosterFactoryOptions) {
		// We won't use the default booster generator, or the land slot
		super(cardPool, landSlot, options);
		[this.midCardPool, this.vowCardPool] = filterCardPool(cardPool, (cid: CardID) => getCard(cid).set === "mid");
	}

	generateBooster(targets: Targets) {
		let updatedTargets = structuredClone(targets);
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
		const mythicRate = this.options.mythicRate ?? DefaultMythicRate;

		// Silver screen foil card (Note: We could eventually use actual DBL cards for this, to get the proper image)
		const pickedPool = random.pick([this.midCardPool, this.vowCardPool]);
		const pickedRarity = rollSpecialCardRarity(countBySlot(pickedPool), updatedTargets, {
			minRarity: "common",
			mythicPromotion,
			mythicRate,
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
	constructor(cardPool: SlotedCardPool, landSlot: BasicLandSlot | null, options: BoosterFactoryOptions) {
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
			const updatedTargets = structuredClone(targets);
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
				{ minRarity: "common" }
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

	constructor(cardPool: SlotedCardPool, landSlot: BasicLandSlot | null, options: BoosterFactoryOptions) {
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
		let updatedTargets = structuredClone(targets);
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
			this.completeCardPool[pickedLegend.rarity].removeCard(pickedLegend.id);

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
			this.completeCardPool[pickedBackground.rarity].removeCard(pickedBackground.id);

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
				this.cardPool[pickedFoil.rarity].removeCard(pickedFoil.id);
			if (this.legendaryCreaturesAndPlaneswalkers[pickedFoil.rarity].has(pickedFoil.id))
				this.legendaryCreaturesAndPlaneswalkers[pickedFoil.rarity].removeCard(pickedFoil.id);
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
	constructor(cardPool: SlotedCardPool, landSlot: BasicLandSlot | null, options: BoosterFactoryOptions) {
		super(cardPool, landSlot, options);
	}

	generateBooster(targets: Targets) {
		let updatedTargets = structuredClone(targets);
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
				mythicRate: this.options.mythicRate ?? DefaultMythicRate,
			});
			booster.unshift(pickCard(this.cardPool[pickedRarity], booster, { foil: true }));
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

	constructor(cardPool: SlotedCardPool, landSlot: BasicLandSlot | null, options: BoosterFactoryOptions) {
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
			const updatedTargets = structuredClone(targets);

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

	constructor(cardPool: SlotedCardPool, landSlot: BasicLandSlot | null, options: BoosterFactoryOptions) {
		const [legendaryCreatures, filteredCardPool] = filterCardPool(
			cardPool,
			(cid: CardID) => getCard(cid).type.match(DMUBoosterFactory.legendaryCreatureRegex) !== null
		);
		super(filteredCardPool, landSlot, options);
		this.legendaryCreatures = legendaryCreatures;

		// Filter YDMU cards according to session collections
		if (options.session && !options.session.unrestrictedCardPool()) {
			const YDMUCards: CardPool = options.session.restrictedCollection(["ydmu"]);
			this.alchemyCards = { uncommon: new CardPool(), rare: new CardPool(), mythic: new CardPool() };
			for (const [cid, count] of YDMUCards)
				this.alchemyCards[getCard(cid).rarity].set(
					cid,
					Math.min(options.maxDuplicates?.[getCard(cid).rarity] ?? DefaultMaxDuplicates, count)
				);
		} else {
			this.alchemyCards = { uncommon: new CardPool(), rare: new CardPool(), mythic: new CardPool() };
			for (const cid of BoosterCardsBySet["alchemy_dmu"])
				this.alchemyCards[getCard(cid).rarity].set(
					cid,
					options.maxDuplicates?.[getCard(cid).rarity] ?? DefaultMaxDuplicates
				);
		}
	}

	generateBooster(targets: Targets) {
		// Ignore the rule if there's no legendary creatures left
		if (isEmpty(this.legendaryCreatures)) {
			return super.generateBooster(targets);
		} else {
			const updatedTargets = structuredClone(targets);

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

	constructor(cardPool: SlotedCardPool, landSlot: BasicLandSlot | null, options: BoosterFactoryOptions) {
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
			let updatedTargets = structuredClone(targets);
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
				const attraction = pickCard(this.attractions[attractionRarity], booster);
				booster.unshift(attraction);
			}

			const stickerID = getRandom(this.stickers);
			booster.push(getUnique(stickerID));

			return booster;
		}
	}
}

/* The Brothers' War
 * 1 Rare or mythic rare
 * 1 Retro artifact or retro schematic card ("It's an uncommon approximately 66% of the time, a rare ~27% of the time, and a mythic rare ~7% of the time")
 * 3 Non-foil uncommons
 * 10 Non-foil commons, unless one is replaced by a traditional foil card of any rarity (33%)
 * 1 Basic land or mech land card
 */
class BROBoosterFactory extends BoosterFactory {
	readonly RetroMythicChance = 0.07;
	readonly RetroRareChance = 0.27;

	retroArtifacts: SlotedCardPool = { uncommon: new CardPool(), rare: new CardPool(), mythic: new CardPool() };

	constructor(cardPool: SlotedCardPool, landSlot: BasicLandSlot | null, options: BoosterFactoryOptions) {
		super(cardPool, landSlot, options);

		if (options.session && !options.session.unrestrictedCardPool()) {
			const BRRCards: CardPool = options.session.restrictedCollection(["brr"]);
			for (const [cid, count] of BRRCards) {
				const card = getCard(cid);
				if (parseInt(card.collector_number) <= 63)
					this.retroArtifacts[card.rarity].set(
						cid,
						Math.min(options.maxDuplicates?.[card.rarity] ?? DefaultMaxDuplicates, count)
					);
			}
		} else {
			for (const cid of CardsBySet["brr"]) {
				const card = getCard(cid);
				if (parseInt(card.collector_number) <= 63)
					this.retroArtifacts[card.rarity].set(
						cid,
						options.maxDuplicates?.[card.rarity] ?? DefaultMaxDuplicates
					);
			}
		}
	}

	generateBooster(targets: Targets) {
		if (isEmpty(this.retroArtifacts)) {
			return super.generateBooster(targets);
		} else {
			const retroArtifacts: UniqueCard[] = [];
			for (let i = 0; i < targets.bonus; ++i) {
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
				retroArtifacts.push(pickCard(this.retroArtifacts[pickedRarity], []));
			}

			const booster = super.generateBooster(targets);
			if (isMessageError(booster)) return booster;
			booster.unshift(...retroArtifacts);
			return booster;
		}
	}
}

// Dominaria Remastered
// 1 Retro C/U/R/M in every pack. If R/M is Retro, C/U is not Retro, and vice versa.
class DMRBoosterFactory extends BoosterFactory {
	readonly RetroRareChance = 0.25; // "Retro Rare or higher replaces a non-Retro Rare or higher in 25% of boosters"

	retroCards: SlotedCardPool = {
		common: new CardPool(),
		uncommon: new CardPool(),
		rare: new CardPool(),
		mythic: new CardPool(),
	};

	constructor(cardPool: SlotedCardPool, landSlot: BasicLandSlot | null, options: BoosterFactoryOptions) {
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

			const updatedTargets = structuredClone(targets);

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

	constructor(cardPool: SlotedCardPool, landSlot: BasicLandSlot | null, options: BoosterFactoryOptions) {
		super(cardPool, landSlot, options);
	}

	generateBooster(targets: Targets) {
		const updatedTargets = structuredClone(targets);

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
import ShadowOfThePastLists from "./data/shadow_of_the_past.json" with { type: "json" };

class SIRBoosterFactory extends BoosterFactory {
	bonusSheet: SlotedCardPool = {
		common: new CardPool(),
		uncommon: new CardPool(),
		rare: new CardPool(),
		mythic: new CardPool(),
	};

	constructor(cardPool: SlotedCardPool, landSlot: BasicLandSlot | null, options: BoosterFactoryOptions) {
		super(cardPool, landSlot, options);
		const currentSheet =
			options.bonusSheet ??
			Math.floor(new Date().getTime() / (1000 * 60 * 60 * 24 * 7)) % ShadowOfThePastLists.length;
		for (const cid of ShadowOfThePastLists[currentSheet].card_ids) {
			const card = getCard(cid);
			this.bonusSheet[card.rarity].set(cid, options.maxDuplicates?.[card.rarity] ?? DefaultMaxDuplicates);
		}
	}

	generateBooster(targets: Targets) {
		const updatedTargets = structuredClone(targets);

		const bonusCards: UniqueCard[] = [];
		for (let i = 0; i < targets.bonus; ++i) {
			// FIXME: No idea if the bonus sheet card actually replaces a common or not, but it's simpler for now (keeps the cards count to 14 without land slot).
			updatedTargets.common = Math.max(0, updatedTargets.common - 1);
			const bonusCardRarity = rollSpecialCardRarity(countBySlot(this.bonusSheet), updatedTargets, this.options);
			bonusCards.push(pickCard(this.bonusSheet[bonusCardRarity]));
		}

		const booster = super.generateBooster(updatedTargets);
		if (isMessageError(booster)) return booster;

		booster.unshift(...bonusCards);

		return booster;
	}
}

// Allow users to specify the bonus sheet
class SIRBoosterFactoryBonusSheet0 extends SIRBoosterFactory {
	constructor(cardPool: SlotedCardPool, landSlot: BasicLandSlot | null, options: BoosterFactoryOptions) {
		super(cardPool, landSlot, Object.assign({ bonusSheet: 0 }, options));
	}
}
class SIRBoosterFactoryBonusSheet1 extends SIRBoosterFactory {
	constructor(cardPool: SlotedCardPool, landSlot: BasicLandSlot | null, options: BoosterFactoryOptions) {
		super(cardPool, landSlot, Object.assign({ bonusSheet: 1 }, options));
	}
}
class SIRBoosterFactoryBonusSheet2 extends SIRBoosterFactory {
	constructor(cardPool: SlotedCardPool, landSlot: BasicLandSlot | null, options: BoosterFactoryOptions) {
		super(cardPool, landSlot, Object.assign({ bonusSheet: 2 }, options));
	}
}
class SIRBoosterFactoryBonusSheet3 extends SIRBoosterFactory {
	constructor(cardPool: SlotedCardPool, landSlot: BasicLandSlot | null, options: BoosterFactoryOptions) {
		super(cardPool, landSlot, Object.assign({ bonusSheet: 3 }, options));
	}
}

// March of the Machine
// https://magic.wizards.com/en/news/feature/collecting-march-of-the-machine
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

	multiverseLegend: SlotedCardPool = { uncommon: new CardPool(), rare: new CardPool(), mythic: new CardPool() };
	battleCards: SlotedCardPool = { uncommon: new CardPool(), rare: new CardPool(), mythic: new CardPool() };
	doubleFacedCards: SlotedCardPool = {
		common: new CardPool(),
		uncommon: new CardPool(),
		rare: new CardPool(),
		mythic: new CardPool(),
	};

	constructor(cardPool: SlotedCardPool, landSlot: BasicLandSlot | null, options: BoosterFactoryOptions) {
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
			for (const [cid, count] of MULCards) {
				const card = getCard(cid);
				if (parseInt(card.collector_number) <= 65)
					this.multiverseLegend[card.rarity].set(
						cid,
						Math.min(options.maxDuplicates?.[card.rarity] ?? DefaultMaxDuplicates, count)
					);
			}
		} else {
			for (const cid of CardsBySet["mul"]) {
				const card = getCard(cid);
				if (parseInt(card.collector_number) <= 65)
					this.multiverseLegend[card.rarity].set(
						cid,
						options.maxDuplicates?.[card.rarity] ?? DefaultMaxDuplicates
					);
			}
		}

		this.battleCards = battleCards;
		this.doubleFacedCards = doubleFacedCards;
	}

	generateBooster(targets: Targets) {
		if (isEmpty(this.multiverseLegend) || isEmpty(this.battleCards) || isEmpty(this.doubleFacedCards)) {
			return super.generateBooster(targets);
		} else {
			const updatedTargets = structuredClone(targets);
			updatedTargets.common = Math.max(0, updatedTargets.common - 1);

			const mulCards: UniqueCard[] = [];
			for (let i = 0; i < targets.bonus; ++i) {
				updatedTargets.common = Math.max(0, updatedTargets.common - 1);
				const mulCounts = countBySlot(this.multiverseLegend);
				if (mulCounts.uncommon === 0 && mulCounts.rare === 0 && mulCounts.mythic === 0)
					return new MessageError("Not enough Multiverse Legends cards.");
				// "Roughly one third of the time you receive a non-foil Multiverse Legends card, it will be a rare or mythic rare."
				const mulRarityRoll = random.real(0, 1);
				const mulRarity =
					this.options?.mythicPromotion && mulCounts.mythic > 0 && mulRarityRoll <= 1.0 / 15.0
						? "mythic"
						: mulCounts.rare > 0 && mulRarityRoll <= 5.0 / 15.0
							? "rare"
							: "uncommon";
				mulCards.push(pickCard(this.multiverseLegend[mulRarity]));
			}

			let battleRarity = "uncommon";
			let dfcRarity =
				this.doubleFacedCards.common.size === 0 ||
				(targets.uncommon > 0 && random.real(0, 1) <= targets.uncommon / (targets.common + targets.uncommon))
					? "uncommon"
					: "common";

			const mythicRate = this.options.mythicRate ?? DefaultMythicRate;

			const insertedCards: UniqueCard[] = [];
			if (targets.rare > 0) {
				const raresCount = this.cardPool.rare.count();
				const battleRaresCount = this.battleCards.rare.count();
				const dfcRaresCount = this.doubleFacedCards.rare.count();

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
				} else {
					updatedTargets.uncommon = Math.max(0, updatedTargets.uncommon - 1);
				}
			}
			insertedCards.push(pickCard(this.battleCards[battleRarity]));
			insertedCards.push(pickCard(this.doubleFacedCards[dfcRarity]));

			const booster = super.generateBooster(updatedTargets);
			if (isMessageError(booster)) return booster;
			// Insert special slots right after the rare(s).
			booster.splice(updatedTargets["rare"], 0, ...insertedCards);
			// We'll always have the mul card in first for clarity.
			booster.unshift(...mulCards);
			return booster;
		}
	}
}

// March of the Machine: Aftermath Arena Draft
// One MAT card in each pack (instead of one common?)
class MATBoosterFactory extends MOMBoosterFactory {
	matPool: SlotedCardPool;

	constructor(cardPool: SlotedCardPool, landSlot: BasicLandSlot | null, options: BoosterFactoryOptions) {
		const [matPool, momCardPool] = filterCardPool(cardPool, (cid: CardID) => getCard(cid).set === "mat");
		super(momCardPool, landSlot, options);
		this.matPool = matPool;
	}

	generateBooster(targets: Targets) {
		if (isEmpty(this.matPool)) {
			return super.generateBooster(targets);
		} else {
			const updatedTargets = structuredClone(targets);
			const matCards: UniqueCard[] = [];
			for (let i = 0; i < targets.bonus; ++i) {
				updatedTargets.common = Math.max(0, updatedTargets.common - 1);
				const matCounts = countBySlot(this.matPool);
				if (matCounts.uncommon === 0 && matCounts.rare === 0 && matCounts.mythic === 0)
					return new MessageError("Not enough Aftermath cards.");
				// Rates from Multiverse Legends in MOM
				const matRarityRoll = random.real(0, 1);
				const matRarity =
					this.options?.mythicPromotion && matCounts.mythic > 0 && matRarityRoll <= 1.0 / 15.0
						? "mythic"
						: matCounts.rare > 0 && matRarityRoll <= 5.0 / 15.0
							? "rare"
							: "uncommon";
				matCards.push(pickCard(this.matPool[matRarity]));
			}
			const booster = super.generateBooster(targets);
			if (isMessageError(booster)) return booster;
			booster.unshift(...matCards);
			return booster;
		}
	}
}

/* Commander Masters
 * 11 Commons - In every sixth booster, one common is replaced with the Prismatic Piper.
 * 3 Nonlegendary uncommons
 * 2 Legendary uncommons
 * 1 Legendary rare or mythic rare
 * 1 Nonlegendary rare or mythic rare
 * 1 Nonlegendary uncommon (in two thirds of boosters) or nonlegendary rare or mythic rare (in one third of boosters)
 * (?) 1 Traditional Foil C/U/R/M
 */
class CMMBoosterFactory extends BoosterFactory {
	static PrismaticPiperID = "c78c2713-39e7-4a6e-a132-027099a89665";
	completeCardPool: SlotedCardPool;
	legendaryCards: SlotedCardPool;

	constructor(cardPool: SlotedCardPool, landSlot: BasicLandSlot | null, options: BoosterFactoryOptions) {
		const [legendary, filteredCardPool] = filterCardPool(cardPool, (cid: CardID) =>
			getCard(cid).type.includes("Legendary")
		);
		filteredCardPool["common"].delete(CMMBoosterFactory.PrismaticPiperID); // Remove Prismatic Piper from the common pool (can still be found in the foil pool completeCardPool)
		options.foil = false; // Don't generate additional foils (one is always garanteed)
		super(filteredCardPool, landSlot, options);
		this.completeCardPool = cardPool;
		this.legendaryCards = legendary;
	}

	// Not using the suplied cardpool here
	generateBooster(targets: Targets) {
		const updatedTargets =
			targets === DefaultBoosterTargets
				? {
						common: 11,
						uncommon: 4,
						rare: 1,
					}
				: structuredClone(targets);
		const legendaryCounts = countBySlot(this.legendaryCards);

		// 1 Nonlegendary uncommon (in two thirds of boosters) or nonlegendary rare or mythic rare (in one third of boosters)
		if (random.bool(1 / 3)) {
			--updatedTargets.uncommon;
			++updatedTargets.rare;
		}

		const booster: Array<UniqueCard> = [];
		// In every sixth booster, one common is replaced with the Prismatic Piper.
		if (random.bool(1 / 6)) {
			--updatedTargets.common;
			booster.push(getUnique(CMMBoosterFactory.PrismaticPiperID));
		}
		const nonLegendary = super.generateBooster(updatedTargets);
		if (isMessageError(nonLegendary)) return nonLegendary;
		booster.unshift(...nonLegendary);

		// 2 Legendary uncommons
		const addedUncommonLegendaries = Math.min(legendaryCounts["uncommon"], 2);
		for (let i = 0; i < addedUncommonLegendaries; ++i)
			booster.splice(updatedTargets["rare"], 0, pickCard(this.legendaryCards["uncommon"], booster));
		// Fallback
		for (let i = 0; i < Math.max(2 - addedUncommonLegendaries, 0); ++i)
			booster.splice(updatedTargets["rare"], 0, pickCard(this.cardPool["uncommon"], booster));

		// 1 Legendary rare or mythic rare
		const pickedRarity = random.bool(1 / 8) ? "mythic" : "rare";
		booster.splice(
			updatedTargets["rare"],
			0,
			pickCard(
				legendaryCounts[pickedRarity] > 0 ? this.legendaryCards[pickedRarity] : this.cardPool[pickedRarity],
				booster
			)
		);

		// One random foil
		let foilRarity = "common";
		const foilRarityCheck = random.real(0, 1);
		for (const r in foilRarityRates)
			if (foilRarityCheck <= foilRarityRates[r] && this.completeCardPool[r].size > 0) {
				foilRarity = r;
				break;
			}
		const pickedFoil = pickCard(this.completeCardPool[foilRarity], [], { foil: true });
		if (this.cardPool[pickedFoil.rarity].has(pickedFoil.id))
			this.cardPool[pickedFoil.rarity].removeCard(pickedFoil.id);
		if (this.legendaryCards[pickedFoil.rarity].has(pickedFoil.id))
			this.legendaryCards[pickedFoil.rarity].removeCard(pickedFoil.id);
		booster.unshift(pickedFoil);

		return booster;
	}
}

// Wilds of Eldraine - One 'Enchanting Tale' per pack
class WOEBoosterFactory extends BoosterFactory {
	static readonly MaxWOTCollectorNumber = 63; // WOT Cards with a higher collector number are special variations not available in draft boosters.

	wotPool: SlotedCardPool = { uncommon: new CardPool(), rare: new CardPool(), mythic: new CardPool() };

	constructor(cardPool: SlotedCardPool, landSlot: BasicLandSlot | null, options: BoosterFactoryOptions) {
		super(cardPool, landSlot, options);
		if (options.session && !options.session.unrestrictedCardPool()) {
			const WOTCards: CardPool = options.session.restrictedCollection(["wot"]);
			for (const [cid, count] of WOTCards) {
				const card = getCard(cid);
				if (parseInt(card.collector_number) <= WOEBoosterFactory.MaxWOTCollectorNumber)
					this.wotPool[card.rarity].set(
						cid,
						Math.min(options.maxDuplicates?.[card.rarity] ?? DefaultMaxDuplicates, count)
					);
			}
		} else {
			for (const cid of CardsBySet["wot"]) {
				const card = getCard(cid);
				if (parseInt(card.collector_number) <= WOEBoosterFactory.MaxWOTCollectorNumber)
					this.wotPool[card.rarity].set(cid, options.maxDuplicates?.[card.rarity] ?? DefaultMaxDuplicates);
			}
		}
	}

	generateBooster(targets: Targets) {
		if (isEmpty(this.wotPool)) {
			return super.generateBooster(targets);
		} else {
			const updatedTargets = structuredClone(targets);
			const wotCards: UniqueCard[] = [];
			for (let i = 0; i < targets.bonus; ++i) {
				updatedTargets.common = Math.max(0, updatedTargets.common - 1);
				const wotCounts = countBySlot(this.wotPool);
				if (wotCounts.uncommon === 0 && wotCounts.rare === 0 && wotCounts.mythic === 0)
					return new MessageError("Not enough Enchanting Tales cards.");
				// Rates from Multiverse Legends in MOM
				const wotRarityRoll = random.real(0, 1);
				const wotRarity =
					this.options?.mythicPromotion && wotCounts.mythic > 0 && wotRarityRoll <= 0.05
						? "mythic"
						: wotCounts.rare > 0 && wotRarityRoll <= 0.25
							? "rare"
							: "uncommon";
				wotCards.push(pickCard(this.wotPool[wotRarity]));
			}
			const booster = super.generateBooster(updatedTargets);
			if (isMessageError(booster)) return booster;
			booster.unshift(...wotCards);
			return booster;
		}
	}
}

// The Lost Caverns of Ixalan
// Double-faced common or uncommon.
class LCIBoosterFactory extends BoosterFactory {
	dfcByRarity: SlotedCardPool;

	constructor(cardPool: SlotedCardPool, landSlot: BasicLandSlot | null, options: BoosterFactoryOptions) {
		const [dfcByRarity, filteredCardPool] = filterCardPool(cardPool, (cid: CardID) => {
			const c = getCard(cid);
			return c.name.includes("//") && (c.rarity === "common" || c.rarity === "uncommon");
		});
		super(filteredCardPool, landSlot, options);
		this.dfcByRarity = dfcByRarity;
	}

	generateBooster(targets: Targets) {
		const dfcCounts = countBySlot(this.dfcByRarity);
		// Ignore the rule if there's no dfc left
		if (Object.values(dfcCounts).every((c) => c === 0)) {
			return super.generateBooster(targets);
		} else {
			// Roll for MDFC rarity
			const pickedRarity = random.bool(6 / 11) ? "uncommon" : "common";
			const pickedMDFC = pickCard(this.dfcByRarity[pickedRarity], []);

			const updatedTargets = structuredClone(targets);
			updatedTargets.common = Math.max(0, updatedTargets.common - 1); // Replace one common by a Double-faced card

			const booster = super.generateBooster(updatedTargets);
			if (isMessageError(booster)) return booster;

			booster.splice(updatedTargets["rare"], 0, pickedMDFC);

			return booster;
		}
	}
}

// Ravnica Remastered
// 10 Commons (1 Traditional Foil card replaces a Common in 33% of boosters)
// 3 Uncommons
// 1 Rare or mythic rare
// 1 Mana slot card, replacing the basic land
//   58% Guildgate (common)
//   33% Signet (uncommon)
//   9% Chromatic Lantern or a shock land (rare)
// 1 Retro frame card of any rarity: One retro frame common, uncommon, rare, or mythic rare in every Draft Booster.
//   If the rare or mythic rare has a retro frame, the common or uncommon does not and vice versa
// Note: The retro frame slot is not simulated. But...
// FIXME: Not all cards have a retro frame version, so this might affect pull rates. And it can be a 4th uncommon.
class RVRBoosterFactory extends BoosterFactory {
	manaSlot: SlotedCardPool;

	constructor(cardPool: SlotedCardPool, landSlot: BasicLandSlot | null, options: BoosterFactoryOptions) {
		const [manaSlot, filteredCardPool] = filterCardPool(cardPool, (cid: CardID) => {
			const c = getCard(cid);
			return (
				c.name.includes("Signet") ||
				c.name.includes("Guildgate") ||
				// Chromatic Lantern
				c.collector_number == "253" ||
				// Shocklands
				c.collector_number == "291" ||
				c.collector_number == "273" ||
				c.collector_number == "275" ||
				c.collector_number == "277" ||
				c.collector_number == "280" ||
				c.collector_number == "283" ||
				c.collector_number == "285" ||
				c.collector_number == "288" ||
				c.collector_number == "289" ||
				c.collector_number == "290"
			);
		});
		super(filteredCardPool, landSlot, options);
		this.manaSlot = manaSlot;
	}

	generateBooster(targets: Targets) {
		const manaSlotCounts = countBySlot(this.manaSlot);
		if (Object.values(manaSlotCounts).every((c) => c === 0)) {
			return super.generateBooster(targets);
		} else {
			const manaSlotRarityRoll = random.realZeroToOneInclusive();
			const pickedRarity =
				manaSlotRarityRoll < 0.58 ? "common" : manaSlotRarityRoll < 0.58 + 0.33 ? "uncommon" : "rare";
			const pickedManaSlot = pickCard(this.manaSlot[pickedRarity], []);

			const booster = super.generateBooster(structuredClone(targets));
			if (isMessageError(booster)) return booster;

			booster.push(pickedManaSlot);

			return booster;
		}
	}
}

function filterSetByNumber(set: keyof typeof CardsBySet, min: number, max: number) {
	return CardsBySet[set].filter((cid) => {
		try {
			const card = getCard(cid);
			// Reject non-numeric collector numbers
			if (!/^\d+$/.test(card.collector_number)) return false;
			const cn = parseInt(card.collector_number);
			return cn >= min && cn <= max;
			// eslint-disable-next-line @typescript-eslint/no-unused-vars
		} catch (e: unknown) {
			return false;
		}
	});
}

export const SpecialGuests = {
	mkm: [
		"d0ae5ac7-4cd9-40d7-b3a7-e7d493f2bf7a",
		"c754663b-8414-483f-b2b1-c2deebe60ee6",
		"08844d76-fc69-4fe3-9c1d-118110b3eb2c",
		"8cf5c0b7-dd26-4515-9034-1483437fbd7e",
		"e7e7cbed-83d7-41e5-b495-9850d631ad56",
		"6d289cdd-3afa-48dd-9c90-3d8f9df79f16",
		"564eb8e2-e3fb-44b6-a36d-a74e2374f9ff",
		"b3364018-aeba-4f58-8233-b0026c488dd0",
		"03c8654e-900a-4720-a4a1-1107d6271c70",
		"2cf97898-1e05-4c0e-896f-ba6713bf6a7b",
	],
	otj: filterSetByNumber("spg", 29, 38),
	mh3: filterSetByNumber("spg", 39, 48),
	blb: filterSetByNumber("spg", 54, 63),
	dsk: filterSetByNumber("spg", 64, 73),
	fdn: filterSetByNumber("spg", 74, 83),
	dft: filterSetByNumber("spg", 84, 93),
	tdm: filterSetByNumber("spg", 104, 113), // Next 5 SPG are exclusive to Collector Boosters
	eoe: filterSetByNumber("spg", 119, 128),
};

// NOTE: This mimics the ratios of wildcard set boosters described here: https://magic.wizards.com/en/news/making-magic/set-boosters-2020-07-25
//         Common:   0.7
//         Uncommon: 0.175
//         Rare:     0.125
function rollSetBoosterWildcardRarity(pool?: SlotedCardPool, options?: BoosterFactoryOptions) {
	const rarityRoll = random.realZeroToOneInclusive();
	const thresholds = {
		mythic: (options?.mythicRate ?? 1.0 / 7.0) * 0.125,
		rare: 0.125,
		uncommon: 0.125 + 0.175,
		common: 1.0,
	};
	for (const r in thresholds)
		if (rarityRoll <= thresholds[r as keyof typeof thresholds] && (!pool || pool[r]?.size > 0)) return r;
	return "common";
}

// "Play Boosters": https://magic.wizards.com/en/news/making-magic/what-are-play-boosters
// - 6 Commons from the set
// - 7/8: 7th common from the set; 1/8: Random card from The List
//   Full breakdown:
//     - 87.5% – A common from the main set
//     - 9.38% – A common or uncommon normal reprint from The List
//     - 1.56% – A rare or mythic rare normal reprint from The List
//     - 1.56% – A Special Guests card from The List
// - 2 Uncommons from the set
// - 1 Rare (6/7)/Mythic (1/7) from the set
// - Land Slot
// - Non-Foil Wildcard from the set
// - Traditional Foil Wildcard from the set

// eslint-disable-next-line @typescript-eslint/no-unused-vars
class PlayBoosterFactory extends BoosterFactory {
	theList: SlotedCardPool;
	spg: CardPool; // Special Guests

	constructor(
		theList: SlotedCardPool,
		spg: CardPool,
		cardPool: SlotedCardPool,
		landSlot: BasicLandSlot | null,
		options: BoosterFactoryOptions
	) {
		const opt = { ...options };
		opt.foil = false; // We'll handle the garanteed foil slot ourselves.
		super(cardPool, landSlot, opt);
		this.theList = theList;
		this.spg = spg;
	}

	generateBooster(targets: Targets) {
		const updatedTargets = structuredClone(targets);
		const booster: UniqueCard[] = [];

		if (targets === DefaultBoosterTargets) {
			updatedTargets.common -= 3; // 10 -> 6 or 7
		} else {
			updatedTargets.common = Math.max(1, updatedTargets.common - 2);
		}

		// 7th Common or The List
		const theListRand = random.realZeroToOneInclusive();
		if (theListRand > 0.875) {
			--updatedTargets.common;
			if (theListRand < 0.875 + 0.0938) {
				// Common or Uncommon from The List
				const rarity = random.bool(1 / 3) ? "uncommon" : "common";
				booster.push(pickCard(this.theList[rarity], booster));
			} else if (theListRand < 0.875 + 0.0938 + 0.0156) {
				// Rare or Mythic from The List.
				// FIXME: Unknown rate.
				const rarity = random.bool(1 / 7) ? "mythic" : "rare";
				booster.push(pickCard(this.theList[rarity], booster));
			} else {
				// Special Guests from The List
				booster.push(pickCard(this.spg, booster));
			}
		}

		// Two "wildcards", one nonfoil and one foil
		for (let i = 0; i < 2; ++i)
			booster.push(pickCard(this.cardPool[rollSetBoosterWildcardRarity(this.cardPool, this.options)], booster));
		booster[booster.length - 1].foil = true;

		// Make sure there are no negative counts
		for (const key in updatedTargets) updatedTargets[key] = Math.max(0, updatedTargets[key]);
		return super.generateBooster(updatedTargets, booster);
	}
}

// Murders at Karlov Manor
// Should extends PlayBoosterFactory, but the rare lands irregularities are annoying.
// https://magic.wizards.com/en/news/feature/collecting-murders-at-karlov-manor
class MKMBoosterFactory extends BoosterFactory {
	theList: SlotedCardPool;
	spg: CardPool = new CardPool(); // Special Guests
	rareLands: SlotedCardPool;
	wildcardFoilPool: SlotedCardPool;

	constructor(cardPool: SlotedCardPool, landSlot: BasicLandSlot | null, options: BoosterFactoryOptions) {
		const [rareLands, filteredCardPool] = filterCardPool(cardPool, (cid: CardID) => {
			const c = getCard(cid);
			return c.rarity === "rare" && c.type.includes("Land");
		});
		const opt = { ...options, mythicRate: getSetMythicRate("mkm") };
		opt.foil = false; // We'll handle the garanteed foil slot ourselves.
		super(filteredCardPool, landSlot, opt);
		this.rareLands = rareLands;
		this.wildcardFoilPool = cardPool;

		const mkmTheList: Record<string, CardPool> = {};
		for (const r in TheList.mkm) {
			if (!mkmTheList[r]) mkmTheList[r] = new CardPool();
			for (const cid of TheList.mkm[r as keyof typeof TheList.mkm]) {
				mkmTheList[r].set(cid, options.maxDuplicates?.[r] ?? DefaultMaxDuplicates);
			}
		}
		this.theList = mkmTheList;

		for (const cid of SpecialGuests.mkm)
			this.spg.set(cid, options.maxDuplicates?.[getCard(cid).rarity] ?? DefaultMaxDuplicates);
	}

	generateBooster(targets: Targets) {
		const updatedTargets = structuredClone(targets);
		const booster: UniqueCard[] = [];

		if (targets === DefaultBoosterTargets) {
			updatedTargets.common -= 3; // 10 -> 6 or 7
		} else {
			updatedTargets.common = Math.max(1, updatedTargets.common - 2);
		}

		// 7th Common or The List
		const theListRand = random.realZeroToOneInclusive();
		if (theListRand > 0.875) {
			--updatedTargets.common;
			if (theListRand < 0.875 + 0.0938) {
				// Common or Uncommon from The List
				const rarity = random.bool(1 / 3) ? "uncommon" : "common";
				booster.push(pickCard(this.theList[rarity], booster));
			} else if (theListRand < 0.875 + 0.0938 + 0.0156) {
				// Rare or Mythic from The List.
				// FIXME: Unknown rate.
				const rarity = random.bool(1 / 7) ? "mythic" : "rare";
				booster.push(pickCard(this.theList[rarity], booster));
			} else {
				// Special Guests from The List
				booster.push(pickCard(this.spg, booster));
			}
		}

		// The first has a 1/6 chance to be a rare dual land.
		if (random.bool(1.0 / 6.0) && this.rareLands.rare.count() > 0) {
			booster.push(pickCard(this.rareLands.rare, booster));
		} else {
			booster.push(pickCard(this.cardPool[rollSetBoosterWildcardRarity(this.cardPool, this.options)], booster));
		}

		// Traditional foil wildcard. This one can also be a rare dual land.
		booster.push(
			pickCard(
				this.wildcardFoilPool[rollSetBoosterWildcardRarity(this.wildcardFoilPool, this.options)],
				[], // NOTE: This is probably not duplicate protected.
				{ foil: true }
			)
		);

		// Make sure there are no negative counts
		for (const key in updatedTargets) updatedTargets[key] = Math.max(0, updatedTargets[key]);
		return super.generateBooster(updatedTargets, booster);
	}
}

// Outlaws of Thunder Junction - https://magic.wizards.com/en/news/feature/collecting-outlaws-of-thunder-junction
// You can find a card from The List in 1 out of 5 Play Boosters. The List for OTJ has 40 cards: 30 cards from The Big Score and 10 Special Guests cards (SPG). You'll find a non-foil Special Guests card in 1 out of 64 Play Boosters.
class OTJBoosterFactory extends BoosterFactory {
	static readonly ListRatio: number = 1 / 5;
	static readonly SPGRatio: number = 1 / 64;

	otp: SlotedCardPool; // Breaking News
	big: CardPool; // Big Score
	spg: CardPool; // Special Guests

	constructor(cardPool: SlotedCardPool, landSlot: BasicLandSlot | null, options: BoosterFactoryOptions) {
		const opt = { ...options };
		opt.foil = false; // We'll handle the garanteed foil slot ourselves.
		super(cardPool, landSlot, opt);
		this.otp = {};
		for (const c of BoosterCardsBySet["otp"]) {
			const rarity = getCard(c).rarity;
			if (!this.otp[rarity]) this.otp[rarity] = new CardPool();
			this.otp[rarity].set(c, options.maxDuplicates?.[rarity] ?? DefaultMaxDuplicates);
		}
		this.big = new CardPool();
		for (const c of BoosterCardsBySet["big"])
			this.big.set(c, options.maxDuplicates?.[getCard(c).rarity] ?? DefaultMaxDuplicates);
		this.spg = new CardPool();
		for (const c of SpecialGuests.otj)
			this.spg.set(c, options.maxDuplicates?.[getCard(c).rarity] ?? DefaultMaxDuplicates);
	}

	generateBooster(targets: Targets) {
		const updatedTargets = structuredClone(targets);
		const booster: UniqueCard[] = [];

		if (targets === DefaultBoosterTargets) {
			updatedTargets.common -= 4; // 10 -> 5 or 6
		} else {
			updatedTargets.common = Math.max(1, updatedTargets.common - 3);
		}

		// 6th Common or The List (SPG/BIG)
		const theListRand = random.realZeroToOneInclusive();
		if (theListRand < OTJBoosterFactory.ListRatio) {
			--updatedTargets.common;
			booster.push(pickCard(theListRand < OTJBoosterFactory.SPGRatio ? this.spg : this.big, booster));
		}

		// 1 Wildcard of any rarity, including OTJ Booster Fun cards (We don't care about booster fun.)
		booster.push(pickCard(this.cardPool[rollSetBoosterWildcardRarity(this.cardPool, this.options)], booster));

		// Breaking News (OTP) card. 1/3 Rare or Mythic Rare.
		{
			const rarityRoll = random.realZeroToOneInclusive();
			const rarity = rarityRoll < (1 / 7) * (1 / 3) ? "mythic" : rarityRoll < 1 / 3 ? "rare" : "uncommon";
			booster.push(pickCard(this.otp[rarity]));
		}

		// Traditional foil card of any rarity - This can include Booster Fun cards and OTP cards but doesn't include cards from The List.
		{
			const rarity = rollSetBoosterWildcardRarity(undefined, this.options);
			// FIXME: You can find OTP cards here too... But rate is unknown. NOTE: There are no OTP commons.
			const pool =
				rarity in this.otp &&
				random.realZeroToOneInclusive() < this.otp[rarity].size / this.cardPool[rarity].size
					? this.otp
					: this.cardPool;
			booster.push(pickCard(pool[rarity], booster, { foil: true }));
		}

		// Make sure there are no negative counts
		for (const key in updatedTargets) updatedTargets[key] = Math.max(0, updatedTargets[key]);
		return super.generateBooster(updatedTargets, booster);
	}
}

// Modern Horizons 3 - https://magic.wizards.com/en/news/feature/collecting-modern-horizons-3
export class MH3BoosterFactory extends BoosterFactory {
	static readonly Filter = (min: number, max: number) => filterSetByNumber("mh3", min, max);

	static readonly SPGRatio: number = 1 / 64;

	static readonly RetroFrame = MH3BoosterFactory.Filter(384, 441);
	static readonly BorderlessFramebreak = MH3BoosterFactory.Filter(320, 349);
	static readonly BorderlessProfile = MH3BoosterFactory.Filter(362, 380);
	static readonly EldraziConcept = MH3BoosterFactory.Filter(381, 383);
	static readonly Borderless = [
		...MH3BoosterFactory.BorderlessFramebreak,
		...MH3BoosterFactory.BorderlessProfile,
		...MH3BoosterFactory.EldraziConcept,
		...MH3BoosterFactory.Filter(350, 351), // Borderless Lands
		...MH3BoosterFactory.Filter(442, 446), // Borderless DFC Planeswalkers
		...MH3BoosterFactory.Filter(352, 361), // Borderless Fetch lands
	];

	static readonly NewToModern = MH3BoosterFactory.Filter(262, 303);
	static readonly NewToModernNames = MH3BoosterFactory.NewToModern.map((cid) => getCard(cid).name);
	static readonly NewToModernFilter = (arr: CardID[]) =>
		arr.filter((cid) => MH3BoosterFactory.NewToModernNames.includes(getCard(cid).name));
	static readonly RetroFrameWildcard = MH3BoosterFactory.RetroFrame.filter(
		(cid) => getCard(cid).rarity === "uncommon" || !MH3BoosterFactory.NewToModernNames.includes(getCard(cid).name)
	); // Retro frames, including new-to-modern uncommons for the wildcard slot.
	static readonly NewToModernBorderlessFramebreak = MH3BoosterFactory.NewToModernFilter(
		MH3BoosterFactory.BorderlessFramebreak
	);
	static readonly NewToModernBorderlessProfile = MH3BoosterFactory.NewToModernFilter(
		MH3BoosterFactory.BorderlessProfile
	);
	static readonly NewToModernRetroFrame = MH3BoosterFactory.NewToModernFilter(MH3BoosterFactory.RetroFrame);

	static readonly CommanderMythics = filterSetByNumber("m3c", 9, 16);
	static readonly Basics = MH3BoosterFactory.Filter(310, 319);
	static readonly FullartBasics = MH3BoosterFactory.Filter(304, 308);

	retroFrame: SlotedCardPool = {};
	retroFrameWildcard: SlotedCardPool = {};
	borderlessFramebreak: SlotedCardPool = {};
	borderlessProfile: SlotedCardPool = {};
	borderless: SlotedCardPool = {};

	newToModern: SlotedCardPool = {}; // New-to-Modern reprint card (uncommon, rare, or mythic rare)
	newToModernBorderlessFramebreak: SlotedCardPool = {}; // Borderless Framebreak New-to-Modern reprint card
	newToModernBorderlessProfile: SlotedCardPool = {}; // Borderless Profile New-to-Modern reprint card
	newToModernRetroFrame: SlotedCardPool = {}; // Retro Frame New-to-Modern reprint card

	commanderMythics: CardPool = new CardPool();

	spg: CardPool = new CardPool(); // Special Guests

	constructor(cardPool: SlotedCardPool, landSlot: BasicLandSlot | null, options: BoosterFactoryOptions) {
		const opt = { ...options };
		opt.foil = false; // We'll handle the garanteed foil slot ourselves.
		super(cardPool, landSlot, opt);

		// Populate specials slots.
		for (const [source, dest] of [
			[MH3BoosterFactory.RetroFrame, this.retroFrame],
			[MH3BoosterFactory.RetroFrameWildcard, this.retroFrameWildcard],
			[MH3BoosterFactory.BorderlessFramebreak, this.borderlessFramebreak],
			[MH3BoosterFactory.BorderlessProfile, this.borderlessProfile],
			[MH3BoosterFactory.Borderless, this.borderless],
			[MH3BoosterFactory.NewToModern, this.newToModern],
			[MH3BoosterFactory.NewToModernBorderlessFramebreak, this.newToModernBorderlessFramebreak],
			[MH3BoosterFactory.NewToModernBorderlessProfile, this.newToModernBorderlessProfile],
			[MH3BoosterFactory.NewToModernRetroFrame, this.newToModernRetroFrame],
		] as [CardID[], SlotedCardPool][]) {
			for (const cid of source) {
				const rarity = getCard(cid).rarity;
				if (!dest[rarity]) dest[rarity] = new CardPool();
				dest[rarity].set(cid, options.maxDuplicates?.[rarity] ?? DefaultMaxDuplicates);
			}
		}
		for (const c of SpecialGuests.mh3)
			this.spg.set(c, options.maxDuplicates?.[getCard(c).rarity] ?? DefaultMaxDuplicates);
		for (const c of MH3BoosterFactory.CommanderMythics)
			this.commanderMythics.set(c, options.maxDuplicates?.[getCard(c).rarity] ?? DefaultMaxDuplicates);
	}

	pickWildcard(foil: boolean, pickedCards: UniqueCard[]): UniqueCard {
		const probabilities = cumulativeSum([
			0.417,
			0.334 + 0.083,
			0.067,
			0.011, // Despite the wording, I'm pretty sure the 1.1% is not only for the DFC planeswalkers, but all mythics.
			0.004,
			0.042,
			0.0415, // Adjusted from 0.042 to allow Full-art Snow-Covered Wastes to appear (rounding was making that basically impossible)
		]);
		const wildcardPool = random.realZeroToOneInclusive();
		if (wildcardPool < probabilities[3]) {
			const rarity =
				wildcardPool < probabilities[0]
					? "common"
					: wildcardPool < probabilities[1]
						? "uncommon"
						: wildcardPool < probabilities[2]
							? "rare"
							: "mythic";
			const pool =
				foil &&
				this.newToModern[rarity] &&
				random.realZeroToOneInclusive() <
					this.newToModern[rarity].size / (this.newToModern[rarity].size + this.cardPool[rarity].size)
					? this.newToModern[rarity] // Foil slot includes new-to-modern cards
					: this.cardPool[rarity];
			return pickCard(pool, pickedCards, { foil });
		} else if (wildcardPool < probabilities[4]) {
			// Borderless cards
			const rarity = random.realZeroToOneInclusive() < 1.0 / 7.0 ? "mythic" : "rare";
			return pickCard(this.borderless[rarity], pickedCards, { foil });
		} else if (wildcardPool < probabilities[5]) {
			// MH3 retro frame cards
			const rarity = rollSetBoosterWildcardRarity(this.retroFrame, this.options);
			// Non-foils only includes uncommons new-to-modern reprints
			return pickCard((!foil ? this.retroFrameWildcard : this.retroFrame)[rarity], pickedCards, { foil });
		} else if (wildcardPool < probabilities[6]) {
			// Commander mythic rares - FIXME: What are the "double-faced cards, and more"?!
			return pickCard(this.commanderMythics, pickedCards, { foil });
		} else {
			// Full-art Snow-Covered Wastes
			return getUnique("ad21a874-525e-4d11-bd8e-bc44918bec40", { foil });
		}
	}

	generateBooster(targets: Targets) {
		const updatedTargets = structuredClone(targets);
		const specialSlots: UniqueCard[] = [];

		if (targets === DefaultBoosterTargets) {
			updatedTargets.common -= 4; // 10 -> 5 or 6
		} else {
			updatedTargets.common = Math.max(1, updatedTargets.common - 3);
		}

		// 1 Traditional foil card of any rarity**
		// This contains a traditional foil version of the new-to-Modern cards, retro frame new-to-Modern cards (all rarities), and traditional foil versions of the wildcard slot
		// (except for Special Guests; traditional foil versions are only in Collector Boosters)
		specialSlots.push(this.pickWildcard(true, specialSlots));

		// 1 Rare or mythic rare, including Booster Fun, double-faced, and retro frame cards
		// Here you can get any of the 60 MH3 rares (79.8%) or 20 mythic rares, including DFC planeswalkers (13.0%), retro frame cards (24 rares, 8 mythic rares [2.1% in total]),
		// or a Booster Fun borderless card, including fetch lands, concept Eldrazi, DFC planeswalkers, frame break cards, profile cards, and other borderless rares or mythic rares (5.1% in total).
		{
			updatedTargets.rare = Math.max(0, updatedTargets.rare - 1);

			const probabilities = cumulativeSum([0.798, 0.13, 0.021]);
			const rarePoolRoll = random.realZeroToOneInclusive();

			if (rarePoolRoll < probabilities[0]) {
				specialSlots.push(pickCard(this.cardPool["rare"], specialSlots));
			} else if (rarePoolRoll < probabilities[1]) {
				specialSlots.push(pickCard(this.cardPool["mythic"], specialSlots));
			} else if (rarePoolRoll < probabilities[2]) {
				// Retro frame
				const rarity = random.realZeroToOneInclusive() < 1.0 / 7.0 ? "mythic" : "rare";
				specialSlots.push(pickCard(this.retroFrame[rarity], specialSlots));
			} else {
				// "Booster Fun borderless"
				const rarity = random.realZeroToOneInclusive() < 1.0 / 7.0 ? "mythic" : "rare";
				specialSlots.push(pickCard(this.borderless[rarity], specialSlots));
			}
		}

		// 1 New-to-Modern card
		// MH3 brings 20 uncommons, 18 rares, and 4 mythic rares from Commander and Legacy formats and introduces them to the Modern format for the first time.
		// This slot contains only cards that are new to Modern. In a regular frame, this slot has the 20 uncommons (75%), 18 rares (21.3%), and 4 mythic rares (2.3%).
		// The slot also could contain Booster Fun or retro frame versions. There are 6 rares and 1 mythic rare in the borderless frame break treatment (0.8% in total),
		// 2 rares and 2 mythic rares in the borderless profile treatment (0.3% in total), 2 rares and 1 mythic rare in a retro frame (0.2% in total), and 1 additional borderless mythic rare (less than 0.1%).
		{
			const probabilities = cumulativeSum([0.75 + 0.213 + 0.023, 0.008, 0.003, 0.002]);
			const newPoolRoll = random.realZeroToOneInclusive();
			if (newPoolRoll < probabilities[0]) {
				const rarity = newPoolRoll < 0.75 ? "uncommon" : newPoolRoll < 0.75 + 0.213 ? "rare" : "mythic";
				specialSlots.push(pickCard(this.newToModern[rarity], specialSlots));
			} else if (newPoolRoll < probabilities[1]) {
				// Borderless Framebreak
				const rarity = random.realZeroToOneInclusive() < 1.0 / 7.0 ? "mythic" : "rare";
				specialSlots.push(pickCard(this.newToModernBorderlessFramebreak[rarity], specialSlots));
			} else if (newPoolRoll < probabilities[2]) {
				// Borderless Profile
				const rarity = random.realZeroToOneInclusive() < 1.0 / 7.0 ? "mythic" : "rare";
				specialSlots.push(pickCard(this.newToModernBorderlessProfile[rarity], specialSlots));
			} else if (newPoolRoll < probabilities[3]) {
				// Retro Frame
				const rarity = random.realZeroToOneInclusive() < 1.0 / 7.0 ? "mythic" : "rare";
				specialSlots.push(pickCard(this.newToModernRetroFrame[rarity], specialSlots));
			} else {
				// Additional borderless mythic rare
				specialSlots.push(getUnique("5d1506f3-5121-4b83-b199-6594b41e7883")); // FIXME: Which one? This is Ugin's Labyrinth, but I have no idea what it's supposed to be.
			}
		}

		// 6th Common or Special Guests
		const spgRand = random.realZeroToOneInclusive();
		if (spgRand < MH3BoosterFactory.SPGRatio) {
			--updatedTargets.common;
			specialSlots.push(pickCard(this.spg, specialSlots));
		}

		// 1 Wildcard of any rarity – In addition to the 80 commons (41.7%), 81 uncommons (33.4%), DFC uncommons (8.3%), 60 rares (6.7%), and 20 mythic rares (including DFC planeswalkers [1.1%]), this slot is where you will find:
		//  - Borderless frame break cards (20 rares, 3 mythic rares), borderless profile cards (10 rares, 5 mythic rares), borderless concept Eldrazi (3 mythic rares), and other borderless cards,
		//    including ally fetch lands and DFC planeswalkers (10 rares, 6 mythic rares). In total, you get one of these rares or mythic rares in a borderless treatment in the wildcard slot in 0.4% of Play Boosters.
		//  - MH3 retro frame cards, including new-to-Modern uncommons (7 commons, 16 uncommons, 24 rares, and 8 mythic rares that show up 4.2% in total)
		//  - Commander mythic rares (8 cards, both regular and borderless; 4.2% in total) double-faced cards, and more
		//  - Full-art Snow-Covered Wastes (1 card; less than 0.1%)
		// (Included in the pack after the rare, new-to-modern card and potential SPG)
		specialSlots.push(this.pickWildcard(false, specialSlots));

		// Make sure there are no negative counts
		for (const key in updatedTargets) updatedTargets[key] = Math.max(0, updatedTargets[key]);
		const booster = super.generateBooster(updatedTargets, specialSlots);

		if (isMessageError(booster)) return booster;

		// 1 Land card or common (This is normally the first card in the pack; but I prefer to put it at the end)
		// Each of the 80 MH3 commons show up in this slot half of the time (50%). The remainder of the time, you get one of the 10 regular basic lands in non-foil (20%) or traditional foil (13.3%),
		// or a full-art Eldrazi basic land in non-foil (10%) or traditional foil (6.7%).
		{
			const probabilities = cumulativeSum([0.5, 0.2, 0.133, 0.1]);
			const landRoll = random.realZeroToOneInclusive();
			if (landRoll < probabilities[0]) {
				booster.push(pickCard(this.cardPool["common"], booster));
			} else if (landRoll < probabilities[1]) {
				// Basic lands
				booster.push(getUnique(getRandom(MH3BoosterFactory.Basics)));
			} else if (landRoll < probabilities[2]) {
				// Foil Basic lands
				booster.push(getUnique(getRandom(MH3BoosterFactory.Basics), { foil: true }));
			} else if (landRoll < probabilities[3]) {
				// Full-art Eldrazi basic land
				booster.push(getUnique(getRandom(MH3BoosterFactory.FullartBasics)));
			} else {
				// Foil Full-art Eldrazi basic land
				booster.push(
					getUnique(getRandom(MH3BoosterFactory.FullartBasics), {
						foil: true,
					})
				);
			}
		}

		return booster;
	}
}

// Bloomburrow - https://magic.wizards.com/en/news/feature/collecting-bloomburrow
//   NOTE/TODO: Both wildcards (foil and non foil) can be "booster fun" (Woodland Frame or Borderless Field Notes), however the rate is unknown.
//              It's very possible that this will have no bearing on the gameplay, and thus could be safely ignored.
class BLBBoosterFactory extends BoosterFactory {
	static readonly SPGRatio: number = 0.015625;

	spg: CardPool; // Special Guests

	constructor(cardPool: SlotedCardPool, landSlot: BasicLandSlot | null, options: BoosterFactoryOptions) {
		const opt = { ...options };
		opt.foil = false; // We'll handle the garanteed foil slot ourselves.
		super(cardPool, landSlot, opt);
		this.spg = new CardPool();
		for (const c of SpecialGuests.blb)
			this.spg.set(c, options.maxDuplicates?.[getCard(c).rarity] ?? DefaultMaxDuplicates);
	}

	generateBooster(targets: Targets) {
		const updatedTargets = structuredClone(targets);
		const booster: UniqueCard[] = [];

		if (targets === DefaultBoosterTargets) {
			// 10 -> 6 or 7
			updatedTargets.common = Math.max(0, updatedTargets.common - 3);
		} else {
			// Two commons will be replaced by wildcards.
			updatedTargets.common = Math.max(0, updatedTargets.common - 2);
		}

		// 6th Common or Special Guest
		if (random.realZeroToOneInclusive() < BLBBoosterFactory.SPGRatio) {
			--updatedTargets.common;
			booster.push(pickCard(this.spg, booster));
		}

		// 1 Wildcard of any rarity
		booster.push(pickCard(this.cardPool[rollSetBoosterWildcardRarity(this.cardPool, this.options)], booster));

		// Traditional foil card of any rarity
		booster.push(
			pickCard(this.cardPool[rollSetBoosterWildcardRarity(this.cardPool, this.options)], booster, { foil: true })
		);

		// TODO: Seasonal full-art basic land... or not?

		// Make sure there are no negative counts
		for (const key in updatedTargets) updatedTargets[key] = Math.max(0, updatedTargets[key]);
		return super.generateBooster(updatedTargets, booster);
	}
}

// Duskmourn: House of Horror Play Boosters
//   6–7 Commons
//   There are 81 commons in the main set of Duskmourn: House of Horror that show up in this slot. Of those, 2 of the commons have a lurking evil version that will show up 1 in 4 times you see that common.
//   One of the 10 Special Guests cards in non-foil replaces a common in 1 in 64 Play Boosters. Of note, Special Guests cards aren’t found in the wildcard nor traditional foil slot in Play Boosters.
//   3 Uncommons
//   There are 100 uncommons in the main set that show up in this slot. Of those, 4 of the uncommons have a lurking evil version and 4 have a paranormal frame version, each showing up 1 in 4 times you see that uncommon.
//   1 Rare or mythic rare
//     There are 60 rares (75%) and 20 mythic rares (12.6%) in the main set that show up in this slot. The remainder of the time, you get one of the following Booster Fun cards:
//   	46 Booster Fun rares (8.2%) and 16 mythic rares (1.4%) – The cards found here include borderless treatments of Rooms, lands, and a planeswalker. This also includes paranormal frame cards, mirror monster cards, and double exposure cards.
//   	7 Lurking evil rares (2.5%) and 2 lurking evil mythic rares (0.3%)
//     There are some cards that show up in two treatments. When that occurs, we adjust how often we drop each Booster Fun variant so that particular card shows up as often as any other card of the same rarity.
//   1 Wildcard of any rarity – Can be one of the cards mentioned in the above common, uncommon, and rare or mythic rare slots, including Booster Fun cards.
//   1 Traditional foil card of any rarity – This slot contains the same list of cards as is found in the wildcard slot.
//   1 Land card – Here, you get one of either the 5 full-art manor lands (13.3% non-foil, 3.3% traditional foil), 10 regular basic lands (26.7% non-foil, 6.7% traditional foil), or one of 10 common dual lands (40% non-foil, 10% traditional foil).
//   1 Token or art card
// Most of the complexity here is only cosmetic. It is ignored (at least for now).
class DSKBoosterFactory extends BoosterFactory {
	static readonly SPGRatio: number = 0.015625;

	spg: CardPool; // Special Guests

	constructor(cardPool: SlotedCardPool, landSlot: BasicLandSlot | null, options: BoosterFactoryOptions) {
		const opt = { ...options };
		opt.foil = false; // We'll handle the garanteed foil slot ourselves.
		super(cardPool, landSlot, opt);
		this.spg = new CardPool();
		for (const c of SpecialGuests.dsk)
			this.spg.set(c, options.maxDuplicates?.[getCard(c).rarity] ?? DefaultMaxDuplicates);
	}

	generateBooster(targets: Targets) {
		const updatedTargets = structuredClone(targets);
		const booster: UniqueCard[] = [];

		if (targets === DefaultBoosterTargets) {
			// 10 -> 6 or 7
			updatedTargets.common = Math.max(0, updatedTargets.common - 3);
		} else {
			// Two commons will be replaced by wildcards.
			updatedTargets.common = Math.max(0, updatedTargets.common - 2);
		}

		// 6th Common or Special Guest
		if (random.realZeroToOneInclusive() < DSKBoosterFactory.SPGRatio) {
			--updatedTargets.common;
			booster.push(pickCard(this.spg, booster));
		}

		// 1 Wildcard of any rarity
		booster.push(pickCard(this.cardPool[rollSetBoosterWildcardRarity(this.cardPool, this.options)], booster));

		// Traditional foil card of any rarity
		booster.push(
			pickCard(this.cardPool[rollSetBoosterWildcardRarity(this.cardPool, this.options)], booster, { foil: true })
		);

		// Make sure there are no negative counts
		for (const key in updatedTargets) updatedTargets[key] = Math.max(0, updatedTargets[key]);
		return super.generateBooster(updatedTargets, booster);
	}
}

import MB2PlistCards from "../data/mb2.json" with { type: "json" };
import { CardPool, SlotedCardPool } from "./CardPool.js";

// Mystery Booster 2
//   10 Commons or uncommons
//    - 2 Cards of each color
//   1 Multicolor, artifact, or common or uncommon land
//   1 Rare or mythic rare
//   1 Future Sight frame card
//    - Less than 5% of Future Sight frame cards appear in traditional foil.
//    - In less than 1% of boosters, this slot is replaced with a traditional foil acorn Alchemy card.
//   1 White-bordered card
//   1 Playtest card
class MB2BoosterFactory extends BoosterFactory {
	monocoloredCommonsOrUncommons = {
		W: new CardPool(),
		U: new CardPool(),
		B: new CardPool(),
		R: new CardPool(),
		G: new CardPool(),
	};
	otherCommonsOrUncommons: CardPool = new CardPool();
	rares: CardPool = new CardPool();
	mythics: CardPool = new CardPool();
	futureSight: CardPool = new CardPool();
	whiteBordered: CardPool = new CardPool();
	playtest: CardPool = new CardPool();
	alchemy: CardPool = new CardPool();

	constructor(cardPool: SlotedCardPool, landSlot: BasicLandSlot | null, options: BoosterFactoryOptions) {
		super(cardPool, landSlot, options);
		for (const cid of MB2PlistCards) {
			const card = getCard(cid);
			const rarity = card.rarity;
			const copies = options.maxDuplicates?.[card.rarity] ?? DefaultMaxDuplicates;
			if (rarity === "common" || rarity === "uncommon") {
				if (card.colors.length === 1) {
					this.monocoloredCommonsOrUncommons[card.colors[0]].set(cid, copies);
				} else {
					this.otherCommonsOrUncommons.set(cid, copies);
				}
			} else if (rarity === "rare") {
				this.rares.set(cid, copies);
			} else if (rarity === "mythic") {
				this.mythics.set(cid, copies);
			} else {
				console.error(`MB2BoosterFactory: Unrecognized rarity: ${rarity}`);
			}
		}
		for (const cid of BoosterCardsBySet["mb2"]) {
			const card = getCard(cid);
			const collector_number = parseInt(card.collector_number);
			const copies = options.maxDuplicates?.[card.rarity] ?? DefaultMaxDuplicates;
			if (collector_number >= 1 && collector_number <= 121) {
				this.whiteBordered.set(cid, copies);
			} else if (collector_number >= 122 && collector_number <= 257) {
				this.futureSight.set(cid, copies);
			} else if (collector_number >= 258 && collector_number <= 264) {
				this.alchemy.set(cid, copies);
			} else if (collector_number >= 265) {
				this.playtest.set(cid, copies);
			}
		}
	}

	generateBooster(targets: Targets) {
		const booster: UniqueCard[] = [];

		if (targets !== DefaultBoosterTargets) {
			return new MessageError("Unsupported", "Mystery Booster 2 does not support non-default booster content.");
		}

		booster.push(pickCard(this.playtest, booster));
		booster.push(pickCard(this.whiteBordered, booster));

		const futureSightRoll = random.realZeroToOneInclusive();
		if (futureSightRoll < 0.01) {
			booster.push(pickCard(this.alchemy, booster));
		} else if (futureSightRoll < 0.05) {
			booster.push(pickCard(this.futureSight, booster, { foil: true }));
		} else {
			booster.push(pickCard(this.futureSight, booster));
		}

		if (random.realZeroToOneInclusive() < 1.0 / 8.0) booster.push(pickCard(this.mythics, booster));
		else booster.push(pickCard(this.rares, booster));

		booster.push(pickCard(this.otherCommonsOrUncommons, booster));

		for (const color of Object.keys(this.monocoloredCommonsOrUncommons)) {
			for (let i = 0; i < 2; ++i)
				booster.push(
					pickCard(
						this.monocoloredCommonsOrUncommons[color as keyof typeof this.monocoloredCommonsOrUncommons],
						booster
					)
				);
		}

		return booster;
	}
}

// Foundations
// 14 Magic: The Gathering cards
//   6–7 Commons
//     There are 80 commons from the main set of Magic: The Gathering Foundations that can show up in these slots.
//     In 1.5% of Play Boosters, 1 of these commons will be replaced with 1 of the 10 Special Guests cards in non-foil. Of note, Special Guests cards aren't found in the wildcard nor traditional foil slot in Play Boosters.
//   3 Uncommons
//     There are 100 possible uncommons in the main set that can appear in this slot.
//   1 Rare or mythic rare
//     This slot contains 1 of the 60 rares (78%) or 20 mythic rares (12.8%) in the main set.
//     It's also possible to open 1 of the 47 borderless rares (7.7%) or 17 borderless mythic rares (1.5%, including 5 borderless planeswalkers).
//   1 Non-foil wildcard of any rarity. This includes any of the commons, uncommons, rares, or mythic rares mentioned above, including borderless versions.
//     You can receive a common (16.7%), uncommon (58.3%), rare (16.3%), or mythic rare (2.6%) card from the main set.
//     You can also receive a borderless rare (1.6%) or borderless mythic rares (0.3%, including 5 borderless planeswalkers).
//     This is also where you will find 1 of the 2 borderless commons (1.8%) or 8 borderless uncommons (2.4%).
//   1 Traditional foil wildcard of any rarity. This includes the same range of main set cards that are found in the non-foil wildcard slot.
//   1 Land card. You can receive 1 of the 10 character lands (25%), 1 of 10 common dual lands (50%), or 1 of 10 regular frame basic lands (25%). In 20% of boosters, this land will be traditional foil.
class FDNBoosterFactory extends BoosterFactory {
	static filter(minNumber: number, maxNumber: number, rarity?: string) {
		return CardsBySet["fdn"].filter((cid: CardID) => {
			const c = getCard(cid);
			return (
				(rarity === undefined || c.rarity === rarity) &&
				parseInt(c.collector_number) >= minNumber &&
				parseInt(c.collector_number) <= maxNumber
			);
		});
	}

	static readonly SPGRatio: number = 0.015625;
	static readonly Borderless: Record<string, CardID[]> = {
		mythic: FDNBoosterFactory.filter(292, 361, "mythic"),
		rare: FDNBoosterFactory.filter(292, 361, "rare"),
		uncommon: FDNBoosterFactory.filter(292, 361, "uncommon"),
		common: FDNBoosterFactory.filter(292, 361, "common"),
	};
	static readonly CharacterLands: CardID[] = FDNBoosterFactory.filter(282, 291);
	static readonly DualLands: CardID[] = FDNBoosterFactory.filter(259, 271).filter(
		(cid) => ![262, 264, 267].includes(parseInt(getCard(cid).collector_number))
	);
	static readonly Basics: CardID[] = FDNBoosterFactory.filter(272, 281);
	static readonly WildCardOdds = cumulativeSum([0.167, 0.583, 0.163, 0.026, 0.016, 0.003, 0.018, 0.024]);

	spg: CardPool = new CardPool(); // Special Guests
	borderless: Record<string, CardPool> = {
		common: new CardPool(),
		uncommon: new CardPool(),
		rare: new CardPool(),
		mythic: new CardPool(),
	};

	constructor(cardPool: SlotedCardPool, landSlot: BasicLandSlot | null, options: BoosterFactoryOptions) {
		const opt = { ...options };
		opt.foil = false; // We'll handle the garanteed foil slot ourselves.
		super(cardPool, landSlot, opt);
		for (const c of SpecialGuests.fdn)
			this.spg.set(c, options.maxDuplicates?.[getCard(c).rarity] ?? DefaultMaxDuplicates);
		for (const rarity of ["common", "uncommon", "rare", "mythic"])
			for (const c of FDNBoosterFactory.Borderless[rarity])
				this.borderless[rarity].set(c, options.maxDuplicates?.[rarity] ?? DefaultMaxDuplicates);
	}

	generateBooster(targets: Targets) {
		const updatedTargets = structuredClone(targets);
		const booster: UniqueCard[] = [];

		if (targets === DefaultBoosterTargets) {
			// 10 -> 6 or 7
			updatedTargets.common = Math.max(0, updatedTargets.common - 3);
			updatedTargets.rare = 0; // We'll handle the rare ourselves.
		} else {
			// Two commons will be replaced by wildcards.
			updatedTargets.common = Math.max(0, updatedTargets.common - 2);
			updatedTargets.rare = Math.max(0, updatedTargets.rare - 1); // We'll handle the rare ourselves.
		}

		// 6th Common or Special Guest
		if (random.realZeroToOneInclusive() < FDNBoosterFactory.SPGRatio) {
			--updatedTargets.common;
			booster.push(pickCard(this.spg));
		}

		// Don't force a rare if the initial targets don't allow it.
		if (targets.rare > 0) {
			const rareRoll = random.realZeroToOneInclusive();
			booster.push(
				pickCard(
					rareRoll < 0.015
						? this.borderless.mythic
						: rareRoll < 0.077 + 0.015
							? this.borderless.rare
							: rareRoll < 0.128 + 0.077 + 0.015
								? this.cardPool["mythic"]
								: this.cardPool["rare"]
				)
			);
		}

		// 1 Wildcard of any rarity
		// Traditional foil card of any rarity
		for (let i = 0; i < 2; ++i) {
			const wildcardRoll = random.realZeroToOneInclusive();
			const pools = [
				this.cardPool.common,
				this.cardPool.uncommon,
				this.cardPool.rare,
				this.cardPool.mythic,
				this.borderless.rare,
				this.borderless.mythic,
				this.borderless.common,
				this.borderless.uncommon,
			];
			let poolIdx = 0;
			while (wildcardRoll > FDNBoosterFactory.WildCardOdds[poolIdx]) poolIdx++;
			booster.push(pickCard(pools[poolIdx]));
		}
		booster[booster.length - 1].foil = true;

		// Make sure there are no negative counts
		for (const key in updatedTargets) updatedTargets[key] = Math.max(0, updatedTargets[key]);
		const boosterOrError = super.generateBooster(updatedTargets); // Allow duplicates here.
		if (isMessageError(boosterOrError)) return boosterOrError;

		// Land card
		const landRoll = random.realZeroToOneInclusive();
		const land = getUnique(
			getRandom(
				landRoll < 0.25
					? FDNBoosterFactory.CharacterLands
					: landRoll < 0.75
						? FDNBoosterFactory.DualLands
						: FDNBoosterFactory.Basics
			)
		);
		land.foil = random.realZeroToOneInclusive() < 0.2;

		return [...booster, ...boosterOrError, land];
	}
}

// 15 Pioneer Masters cards
//   8 Commons from the main set
//   3 Uncommons from the main set
//   1 Rare or mythic rare from the main set
//     A rare can upgrade to mythic rare at a rate of approximately 1:5.
//   1 Variety slot from the main set
//   1 Card from the scheduled bonus sheet
//   1 Guildgate land (LandSlot)
class PIOBoosterFactory extends BoosterFactory {
	static readonly BonusLists = [
		CardsBySet["pio"].filter(
			(c) => parseInt(getCard(c).collector_number) >= 279 && parseInt(getCard(c).collector_number) <= 318
		),
		CardsBySet["pio"].filter(
			(c) => parseInt(getCard(c).collector_number) >= 319 && parseInt(getCard(c).collector_number) <= 358
		),
		CardsBySet["pio"].filter(
			(c) => parseInt(getCard(c).collector_number) >= 359 && parseInt(getCard(c).collector_number) <= 398
		),
	];

	bonus: SlotedCardPool;

	constructor(cardPool: SlotedCardPool, landSlot: BasicLandSlot | null, options: BoosterFactoryOptions) {
		super(cardPool, landSlot, options);
		this.bonus = {};
		const currentSheet =
			options.bonusSheet ??
			(Math.floor((new Date().getTime() - 1733785200000) / (1000 * 60 * 60 * 24 * 7 * 2)) + 1) %
				PIOBoosterFactory.BonusLists.length;
		for (const c of PIOBoosterFactory.BonusLists[currentSheet]) {
			const rarity = getCard(c).rarity;
			if (!this.bonus[rarity]) this.bonus[rarity] = new CardPool();
			this.bonus[rarity].set(c, options.maxDuplicates?.[rarity] ?? DefaultMaxDuplicates);
		}
	}

	generateBooster(targets: Targets) {
		const updatedTargets = structuredClone(targets);
		updatedTargets.common = Math.max(0, updatedTargets.common - 1 - (updatedTargets.bonus ?? 0));

		const booster: UniqueCard[] = [];

		// 1 Card from the scheduled bonus sheet (see schedule above)
		// 	 Uncommons are more likely than commons in this slot, appearing at an approximate rate of 5:4.
		// 	 For the Planeswalkers and Devotion bonus sheets:
		// 		A common or uncommon can upgrade to mythic rare at a rate of approximately 1:10. There are no rares in these bonus sheets.
		// 	 For the Spells bonus sheet:
		// 		A common or uncommon can upgrade to a rare at a rate of approximately 1:10.
		// 		A rare can upgrade to a mythic rare at a rate of approximately 1:5.
		for (let i = 0; i < updatedTargets.bonus; ++i) {
			let rarity = "common";
			const rarityRoll = random.realZeroToOneInclusive();
			if (this.bonus["rare"]?.size > 0) {
				if (rarityRoll < this.ratio(1, 10) * this.ratio(1, 5)) {
					rarity = "mythic";
				} else if (rarityRoll < this.ratio(1, 10)) {
					rarity = "rare";
				} else if (rarityRoll < this.ratio(5, 4)) {
					rarity = "uncommon";
				}
			} else {
				if (rarityRoll < this.ratio(1, 10)) {
					rarity = "mythic";
				} else if (rarityRoll < this.ratio(5, 4)) {
					rarity = "uncommon";
				}
			}
			booster.push(pickCard(this.bonus[rarity], booster));
		}

		// 1 Variety slot from the main set
		// 	 Uncommons are more likely than commons in this slot, appearing at an approximate rate of 4:1.
		// 	 An uncommon can upgrade to a rare at a rate of approximately 1:5.
		// 	 A rare can upgrade to a mythic rare at a rate of approximately 1:4.
		{
			const ratios = { u: this.ratio(4, 1), r: this.ratio(1, 5), m: this.ratio(1, 4) };
			const rarityRoll = random.realZeroToOneInclusive();
			const rarity =
				rarityRoll < ratios.m * ratios.r * ratios.u
					? "mythic"
					: rarityRoll < ratios.r * ratios.u
						? "rare"
						: rarityRoll < ratios.u
							? "uncommon"
							: "common";
			booster.push(pickCard(this.cardPool[rarity], booster));
		}

		return super.generateBooster(updatedTargets, booster);
	}

	ratio(cat0: number, cat1: number): number {
		return cat0 / (cat0 + cat1);
	}
}
class PIOBoosterFactoryBonusSheet0 extends PIOBoosterFactory {
	constructor(cardPool: SlotedCardPool, landSlot: BasicLandSlot | null, options: BoosterFactoryOptions) {
		super(cardPool, landSlot, Object.assign({ bonusSheet: 0 }, options));
	}
}
class PIOBoosterFactoryBonusSheet1 extends PIOBoosterFactory {
	constructor(cardPool: SlotedCardPool, landSlot: BasicLandSlot | null, options: BoosterFactoryOptions) {
		super(cardPool, landSlot, Object.assign({ bonusSheet: 1 }, options));
	}
}
class PIOBoosterFactoryBonusSheet2 extends PIOBoosterFactory {
	constructor(cardPool: SlotedCardPool, landSlot: BasicLandSlot | null, options: BoosterFactoryOptions) {
		super(cardPool, landSlot, Object.assign({ bonusSheet: 2 }, options));
	}
}

function cidsToSlotedCardPool(cids: CardID[], maxDuplicates?: Record<string, number>): SlotedCardPool {
	const r: SlotedCardPool = {};
	for (const cid of cids) {
		const card = getCard(cid);
		if (!r[card.rarity]) r[card.rarity] = new CardPool();
		r[card.rarity]!.set(card.id, maxDuplicates?.[card.rarity] ?? DefaultMaxDuplicates);
	}
	return r;
}

// Innistrad Remastered (INR) : 14 Magic: The Gathering cards
// FIXME: Special treatments outside of retro frame not implemented. Remove this when a better collation method is available?
// FIXME: Color Balance can't be applied as-is, single faced common slot only has 5 cards.
//   5 Single-faced common cards
//   1 Double-faced common card
//   3 Uncommon cards
//       There is a 0.6% chance for an equinox treatment uncommon here or in the wildcard slot.
//   1 Wildcard of any rarity
//       There is a 3% chance for a borderless common.
//       There is a 0.7% chance for a borderless uncommon.
//       There is a 0.3% chance for a showcase fang uncommon.
//   1 Rare or mythic rare card
//       There is a 2.8% chance for a Booster Fun rare here or in the wildcard slot.
//       There is a 0.5% chance for a Booster Fun mythic rare here or in the wildcard slot.
//   1 Non-foil retro frame card of any rarity
//   1 Traditional foil card of any rarity
//       There is a 2.7% chance for a traditional foil Booster Fun common.
//       There is a 0.1% chance for a traditional foil Booster Fun uncommon.
//       There is a 0.9% chance for a traditional foil Booster Fun rare.
//       There is a 0.1% chance for a traditional foil Booster Fun mythic rare.
//           Excludes retro frame cards
//   1 Basic land (20% chance for a traditional foil basic land)
class INRBoosterFactory extends BoosterFactory {
	static filter(min: number, max: number) {
		return CardsBySet["inr"].filter(
			(c) => parseInt(getCard(c).collector_number) >= min && parseInt(getCard(c).collector_number) <= max
		);
	}

	static readonly Borderless = INRBoosterFactory.filter(298, 322);
	static readonly ShowcaseEquinox = INRBoosterFactory.filter(323, 325);
	static readonly ShowcaseFang = INRBoosterFactory.filter(326, 328);
	static readonly RetroFrameCards = INRBoosterFactory.filter(329, 480);
	static readonly MoviePosterCards = INRBoosterFactory.filter(481, 490); // Collector Boosters only
	static readonly SerializedMoviePosterCards = INRBoosterFactory.filter(491, 491); // Collector Boosters only
	static readonly BoosterFunCards = [
		...INRBoosterFactory.Borderless,
		...INRBoosterFactory.ShowcaseEquinox,
		...INRBoosterFactory.ShowcaseFang,
	];

	doubleFacedCommons: CardPool;
	retroFrameCards: SlotedCardPool = {};

	constructor(cardPool: SlotedCardPool, landSlot: BasicLandSlot | null, options: BoosterFactoryOptions) {
		const [doubleFacedCommons, filteredCardPool] = filterCardPool(cardPool, (cid: CardID) => {
			const c = getCard(cid);
			return c.rarity === "common" && c.back !== undefined;
		});
		super(filteredCardPool, landSlot, options);
		this.doubleFacedCommons = doubleFacedCommons.common;
		this.retroFrameCards = cidsToSlotedCardPool(INRBoosterFactory.RetroFrameCards, options.maxDuplicates);
	}

	generateBooster(targets: Targets) {
		const updatedTargets = structuredClone(targets);
		if (targets === DefaultBoosterTargets) updatedTargets.common = Math.max(0, updatedTargets.common - 5);
		else updatedTargets.common = Math.max(1, updatedTargets.common - 4);

		const booster: UniqueCard[] = [];
		const doubleFacedCommon = pickCard(this.doubleFacedCommons);

		// Traditional foil card of any rarity
		{
			const rarityRoll = rollSetBoosterWildcardRarity(this.cardPool, {});
			booster.push(pickCard(this.cardPool[rarityRoll], booster, { foil: true }));
		}
		// Non-foil retro frame card of any rarity
		{
			const rarityRoll = rollSetBoosterWildcardRarity(this.retroFrameCards, {});
			booster.push(pickCard(this.retroFrameCards[rarityRoll], booster, { foil: false }));
		}
		// Wildcard of any rarity
		{
			const rarityRoll = rollSetBoosterWildcardRarity(this.cardPool, {});
			booster.push(pickCard(this.cardPool[rarityRoll], booster, { foil: false }));
		}

		const rest = super.generateBooster(updatedTargets);
		if (isMessageError(rest)) return rest;

		// Insert double-faced common
		rest.splice(rest.length - updatedTargets.common, 0, doubleFacedCommon);
		return [...booster, ...rest];
	}
}

// Aetherdrift (DFT) - https://magic.wizards.com/en/news/feature/collecting-aetherdrift
// 14 Magic: The Gathering cards
//   6–7 Commons
//     There are 81 commons from Aetherdrift that can show up in these slots.
//     In 1.5% of Play Boosters, 1 of these commons will be replaced with 1 of the 10 Special Guests cards in non-foil. Of note, Special Guests cards aren't found in the wildcard nor traditional foil slot in Play Boosters.
//   3 Uncommons
//     There are 100 possible uncommons from Aetherdrift that can appear in this slot.
//   1 Wildcard of any rarity
//     You can receive a common (8.3%), uncommon (62.5%), or rare or mythic rare (20.8%; same proportion as below) from Aetherdrift, or a (8.3%) borderless revved up common or uncommon card.
//   1 Rare or mythic rare
//     This slot contains 1 of the 60 rares (78%) or 20 mythic rares (13%) in the main set.
//     	It's also possible to open 1 of 28 borderless rare cards (8%).
//     	It's also possible to open 1 of 13 borderless mythic rare cards (1%).
//   1 Traditional foil card of any rarity
//     From the main set of Aetherdrift, you can receive a common (60.5%), uncommon (30%), rare (6.4%), or mythic rare (1.1%) card.
//     From the borderless cards of Aetherdrift, you can receive a common (0.5%), uncommon (0.5%), rare (0.9%), or mythic rare (0.1%) card.
//   1 Land card. This land will be traditional foil in 20% of boosters.
//     A common dual land appears 50% of the time.
//     A default frame basic land appears 37.5% of the time.
//     A full-art driver's seat basic land appears 12.5% of the time.
class DFTBoosterFactory extends BoosterFactory {
	static filter(min: number, max: number) {
		return CardsBySet["dft"].filter(
			(c) => parseInt(getCard(c).collector_number) >= min && parseInt(getCard(c).collector_number) <= max
		);
	}

	static readonly Borderless = DFTBoosterFactory.filter(292, 375);
	static readonly Basics = DFTBoosterFactory.filter(277, 291);
	static readonly FullArtBasics = DFTBoosterFactory.filter(272, 276);
	static readonly CommonDualLands = DFTBoosterFactory.filter(248, 271).filter((c) => getCard(c).rarity === "common");

	borderless: SlotedCardPool = {};
	spg: SlotedCardPool = {};

	constructor(cardPool: SlotedCardPool, landSlot: BasicLandSlot | null, options: BoosterFactoryOptions) {
		const [, filteredCardPool] = filterCardPool(cardPool, (cid: CardID) =>
			DFTBoosterFactory.CommonDualLands.includes(cid)
		);
		super(filteredCardPool, landSlot, options);
		this.borderless = cidsToSlotedCardPool(DFTBoosterFactory.Borderless, options.maxDuplicates);
		this.spg = cidsToSlotedCardPool(SpecialGuests.dft, options.maxDuplicates);
	}

	generateBooster(targets: Targets) {
		const updatedTargets = structuredClone(targets);
		if (targets === DefaultBoosterTargets) updatedTargets.common = Math.max(0, updatedTargets.common - 3);
		else updatedTargets.common = Math.max(1, updatedTargets.common - 2);

		const booster: UniqueCard[] = [];

		const spgRoll = random.realZeroToOneInclusive();
		if (spgRoll < 0.015) {
			updatedTargets.common = Math.max(0, updatedTargets.common - 1);
			booster.push(pickCard(this.spg.mythic, booster, { foil: false }));
		}

		// Traditional foil card of any rarity
		{
			const pool = chooseWeighted(
				[0.605, 0.3, 0.064, 0.011, 0.005, 0.005, 0.009, 0.001],
				[
					this.cardPool.common,
					this.cardPool.uncommon,
					this.cardPool.rare,
					this.cardPool.mythic,
					this.borderless.common,
					this.borderless.uncommon,
					this.borderless.rare,
					this.borderless.mythic,
				]
			);
			booster.push(pickCard(pool, booster, { foil: true }));
		}
		// Rare or mythic rare
		while (updatedTargets.rare > 0) {
			updatedTargets.rare -= 1;
			const pool = chooseWeighted(
				[0.78, 0.13, 0.08, 0.01],
				[this.cardPool.rare, this.cardPool.mythic, this.borderless.rare, this.borderless.mythic]
			);
			booster.push(pickCard(pool, booster));
		}
		// Wildcard of any rarity
		{
			const pool = chooseWeighted(
				[
					0.083,
					0.625,
					0.083 * (0.083 / (0.083 + 0.625)), // Borderless common and uncommon:
					0.083 * (0.625 / (0.083 + 0.625)), //   Ratio unknown, using the same as the regular versions in the same slot.
					0.208 * 0.78,
					0.208 * 0.13,
					0.208 * 0.08,
					0.208 * 0.01,
				],
				[
					this.cardPool.common,
					this.cardPool.uncommon,
					this.borderless.common,
					this.borderless.uncommon,
					this.cardPool.rare,
					this.cardPool.mythic,
					this.borderless.rare,
					this.borderless.mythic,
				]
			);
			booster.push(pickCard(pool, booster));
		}

		const rest = super.generateBooster(updatedTargets, booster);
		if (isMessageError(rest)) return rest;

		// Land card
		{
			const pool = chooseWeighted(
				[0.5, 0.375, 0.125],
				[DFTBoosterFactory.CommonDualLands, DFTBoosterFactory.Basics, DFTBoosterFactory.FullArtBasics]
			);
			rest.push(getUnique(getRandom(pool)));
		}

		return rest;
	}
}

// Tarkir: Dragonstorm  (TDM) - https://magic.wizards.com/en/news/feature/collecting-tarkir-dragonstorm
class TDMBoosterFactory extends BoosterFactory {
	static filter(min: number, max: number) {
		return CardsBySet["tdm"].filter(
			(c) => parseInt(getCard(c).collector_number) >= min && parseInt(getCard(c).collector_number) <= max
		);
	}

	static readonly Showcase = TDMBoosterFactory.filter(292, 326);
	static readonly BorderlessClan = TDMBoosterFactory.filter(327, 376);
	static readonly BorderlessReversible = TDMBoosterFactory.filter(377, 382);
	static readonly Borderless = TDMBoosterFactory.filter(383, 398);
	static readonly Basics = TDMBoosterFactory.filter(277, 291);
	static readonly FullArtBasics = TDMBoosterFactory.filter(272, 276);
	static readonly CommonDualLands = TDMBoosterFactory.filter(250, 271).filter((c) => getCard(c).rarity === "common");

	showcase: SlotedCardPool = {};
	borderlessClan: SlotedCardPool = {};
	borderless: SlotedCardPool = {};
	borderlessReversible: SlotedCardPool = {};
	spg: SlotedCardPool = {};

	constructor(cardPool: SlotedCardPool, landSlot: BasicLandSlot | null, options: BoosterFactoryOptions) {
		const [, filteredCardPool] = filterCardPool(cardPool, (cid: CardID) =>
			TDMBoosterFactory.CommonDualLands.includes(cid)
		);
		super(filteredCardPool, landSlot, options);
		this.showcase = cidsToSlotedCardPool(TDMBoosterFactory.Showcase, options.maxDuplicates);
		this.borderlessClan = cidsToSlotedCardPool(TDMBoosterFactory.BorderlessClan, options.maxDuplicates);
		this.borderless = cidsToSlotedCardPool(TDMBoosterFactory.Borderless, options.maxDuplicates);
		this.borderlessReversible = cidsToSlotedCardPool(TDMBoosterFactory.BorderlessReversible, options.maxDuplicates);
		this.spg = cidsToSlotedCardPool(SpecialGuests.tdm, options.maxDuplicates);
	}

	generateBooster(targets: Targets) {
		const updatedTargets = structuredClone(targets);
		// 6–7 Commons
		if (targets === DefaultBoosterTargets) updatedTargets.common = Math.max(0, updatedTargets.common - 3);
		else updatedTargets.common = Math.max(1, updatedTargets.common - 2);
		// 3 Uncommons

		const booster: UniqueCard[] = [];

		// In 1.5% of Play Boosters, 1 of these commons will be replaced with 1 of the 10 Special Guests cards in non-foil. Of note, Special Guests cards aren't found in the wildcard nor traditional foil slot in Play Boosters.
		const spgRoll = random.realZeroToOneInclusive();
		if (spgRoll < 0.015) {
			updatedTargets.common = Math.max(0, updatedTargets.common - 1);
			booster.push(pickCard(this.spg.mythic, booster, { foil: false }));
		}

		// 1 Traditional foil card of any rarity from among the following:
		//   A common (56.5%), uncommon (32%), rare (6.4%), or mythic rare (1.1%) from Tarkir: Dragonstorm's main set
		//   A common (1.6%), uncommon (1.4%), rare (less than 0.1%), or mythic rare (less than 0.1%) showcase draconic frame card
		//   A rare (0.5%) or mythic rare (0.1%) borderless clan card
		//   A rare (0.2%) from among the borderless Sagas, Sieges, and lands or a borderless mythic rare Elspeth, Storm Slayer (less than 0.1%)
		//   A rare (0.1%) or mythic rare (less than 0.1%) borderless reversible dragon
		{
			const pool = chooseWeighted(
				[
					0.565,
					0.32,
					0.064,
					0.011,
					0.016,
					0.014,
					0.001 / 4, // FIXME: "less than 0.1%"
					0.001 / 4, // FIXME: "less than 0.1%"
					0.005,
					0.001,
					0.002,
					0.001 / 4, // FIXME: "less than 0.1%"
					0.001,
					0.001 / 4, // FIXME: "less than 0.1%"
				],
				[
					this.cardPool.common,
					this.cardPool.uncommon,
					this.cardPool.rare,
					this.cardPool.mythic,
					this.showcase.common,
					this.showcase.uncommon,
					this.showcase.rare,
					this.showcase.mythic,
					this.borderlessClan.rare,
					this.borderlessClan.mythic,
					this.borderless.rare,
					this.borderless.mythic,
					this.borderlessReversible.rare,
					this.borderlessReversible.mythic,
				]
			);
			booster.push(pickCard(pool, booster, { foil: true }));
		}

		// 1 Rare or mythic rare card from among the following:
		//   A rare (75%) or mythic rare (12.5%) from Tarkir: Dragonstorm's main set
		//   A rare (0.8%) or mythic rare (0.6%) showcase draconic frame card
		//   A rare (6.4%) or mythic rare (1.2%) borderless clan card
		//   A rare (2.7%) from among the borderless Sagas, Sieges, and lands or a borderless mythic rare Elspeth, Storm Slayer (0.1%)
		//   A rare (0.8%) or mythic rare (0.9%) borderless reversible dragon
		while (updatedTargets.rare > 0) {
			updatedTargets.rare -= 1;
			const pool = chooseWeighted(
				[0.75, 0.125, 0.008, 0.006, 0.064, 0.012, 0.027, 0.001, 0.008, 0.009], //  FIXME: Doesn't add up to 1
				[
					this.cardPool.rare,
					this.cardPool.mythic,
					this.showcase.rare,
					this.showcase.mythic,
					this.borderlessClan.rare,
					this.borderlessClan.mythic,
					this.borderless.rare,
					this.borderless.mythic,
					this.borderlessReversible.rare,
					this.borderlessReversible.mythic,
				]
			);
			booster.push(pickCard(pool, booster));
		}

		// 1 Wildcard of any rarity from among the following:
		//   A common (12.5%), uncommon (58.3%), rare (15.6%), or mythic rare (2.6%) from Tarkir: Dragonstorm's main set
		//   A common (4.6%) or uncommon (3.8%) showcase draconic frame card
		//   A rare (0.2%) or mythic rare (0.1%) showcase draconic frame card
		//   A rare (1.3%) or mythic rare (0.2%) borderless clan card
		//   A rare (0.6%) from among the borderless Sagas, Sieges, and lands or a borderless mythic rare Elspeth, Storm Slayer (less than 0.1%)
		//   A rare (0.2%) or mythic rare (less than 0.1%) borderless reversible dragon
		{
			const pool = chooseWeighted(
				[
					0.125,
					0.583,
					0.156,
					0.026,

					0.046,
					0.038,
					0.002,
					0.001,

					0.013,
					0.002,

					0.006,
					0.006 / 7, // FIXME: "less than 0.1%"

					0.002,
					0.0005, // FIXME: "less than 0.1%"
				], //  FIXME: Doesn't add up to 1
				[
					this.cardPool.common,
					this.cardPool.uncommon,
					this.cardPool.rare,
					this.cardPool.mythic,

					this.showcase.common,
					this.showcase.uncommon,
					this.showcase.rare,
					this.showcase.mythic,

					this.borderlessClan.rare,
					this.borderlessClan.mythic,

					this.borderless.rare,
					this.borderless.mythic,

					this.borderlessReversible.rare,
					this.borderlessReversible.mythic,
				]
			);
			booster.push(pickCard(pool, booster));
		}

		const rest = super.generateBooster(updatedTargets, booster);
		if (isMessageError(rest)) return rest;

		// 1 Land card from among the following:
		//   A non-foil default frame basic land (7.0%) or full-art dragon's presence basic land (3.5%)
		//   A traditional foil default frame basic land (1.7%) or full-art dragon's presence basic land (0.9%)
		//   Can be 1 of 10 common two-color lands in non-foil (70.0%) or traditional foil (17.4%)
		{
			const pool = chooseWeighted(
				[0.07 + 0.017, 0.035 + 0.009, 0.7 + 0.174], //  FIXME: Doesn't add up to 1
				[TDMBoosterFactory.Basics, TDMBoosterFactory.FullArtBasics, TDMBoosterFactory.CommonDualLands]
			);
			const foil = random.realZeroToOneInclusive() <= 0.4;
			rest.push(getUnique(getRandom(pool), { foil }));
		}

		return rest;
	}
}

// Final Fantasy (FIN) - https://magic.wizards.com/en/news/feature/collecting-final-fantasy
export class FINBoosterFactory extends BoosterFactory {
	static filter(min: number, max: number) {
		return CardsBySet["fin"].filter(
			(c) =>
				parseInt(getCard(c).collector_number) >= min &&
				parseInt(getCard(c).collector_number) <= max &&
				!getCard(c).collector_number.endsWith("b")
		);
	}

	static readonly ThroughTheAges = CardsBySet["fca"].filter((c) => !getCard(c).collector_number.startsWith("A"));
	static readonly Borderless = [...FINBoosterFactory.filter(310, 405), ...FINBoosterFactory.filter(577, 577)];
	static readonly BorderlessAdventure = FINBoosterFactory.filter(310, 314);
	static readonly BorderlessArtist = [...FINBoosterFactory.filter(315, 323), ...FINBoosterFactory.filter(577, 577)];
	static readonly BorderlessWoodblock = FINBoosterFactory.filter(324, 373); // 50
	static readonly BorderlessCharacter = FINBoosterFactory.filter(374, 405); // 32
	static readonly CidVariants = [...FINBoosterFactory.filter(216, 216), ...FINBoosterFactory.filter(407, 420)];
	static readonly Basics = FINBoosterFactory.filter(294, 309);
	static readonly CommonDualLands = [
		...FINBoosterFactory.filter(278, 292).filter((c) => getCard(c).rarity === "common"),
		...FINBoosterFactory.filter(273, 273),
	];

	throughTheAges: SlotedCardPool = {};
	borderless: SlotedCardPool = {};
	borderlessArtist: SlotedCardPool = {};
	borderlessAdventure: SlotedCardPool = {};
	borderlessWoodblock: SlotedCardPool = {};
	borderlessCharacter: SlotedCardPool = {};
	cid: SlotedCardPool = {};

	constructor(cardPool: SlotedCardPool, landSlot: BasicLandSlot | null, options: BoosterFactoryOptions) {
		const [, filteredCardPool] = filterCardPool(cardPool, (cid: CardID) =>
			FINBoosterFactory.CommonDualLands.includes(cid)
		);
		super(filteredCardPool, landSlot, options);
		this.throughTheAges = cidsToSlotedCardPool(FINBoosterFactory.ThroughTheAges, options.maxDuplicates);
		this.borderless = cidsToSlotedCardPool(FINBoosterFactory.Borderless, options.maxDuplicates); // NOTE: The multiple card pools means maxDuplicates might not be respected...
		this.borderlessArtist = cidsToSlotedCardPool(FINBoosterFactory.BorderlessArtist, options.maxDuplicates);
		this.borderlessAdventure = cidsToSlotedCardPool(FINBoosterFactory.BorderlessAdventure, options.maxDuplicates);
		this.borderlessWoodblock = cidsToSlotedCardPool(FINBoosterFactory.BorderlessWoodblock, options.maxDuplicates);
		this.borderlessCharacter = cidsToSlotedCardPool(FINBoosterFactory.BorderlessCharacter, options.maxDuplicates);
		this.cid = cidsToSlotedCardPool(["7fb99393-d2b6-40a6-8de7-317efdc4c50b"], options.maxDuplicates);
	}

	generateBooster(targets: Targets) {
		const updatedTargets = structuredClone(targets);
		// 6–7 Commons
		if (targets === DefaultBoosterTargets) updatedTargets.common = Math.max(0, updatedTargets.common - 3);
		else updatedTargets.common = Math.max(1, updatedTargets.common - 2);

		const booster: UniqueCard[] = [];

		// In one third of Play Boosters, one of these commons will be replaced by a card from the FINAL FANTASY Through the Ages bonus sheet.
		// Cards from the bonus sheet aren't found in the wildcard or traditional foil slot in Play Boosters.
		// You can receive an uncommon (63.25%), rare (29.75%), or mythic rare (7%) FINAL FANTASY Through the Ages bonus sheet card.
		const bonusRoll = random.realZeroToOneInclusive();
		if (bonusRoll < 1.0 / 3.0) {
			updatedTargets.common = Math.max(0, updatedTargets.common - 1);
			const pool = chooseWeighted(
				[0.6325, 0.2975, 0.07],
				[this.throughTheAges.uncommon, this.throughTheAges.rare, this.throughTheAges.mythic]
			);
			booster.push(pickCard(pool, booster, { foil: false }));
		}

		// 1 Traditional foil card
		//   Default frame common (55.75%), uncommon (35.9%), rare (5.5%), or mythic rare (0.75%)
		//   Booster Fun common (0.1%), uncommon (0.5%), rare (1%), or mythic rare (0.25%)
		//   1 of 15 Cid variants (0.25%)
		{
			const pool = chooseWeighted(
				[0.5575, 0.359, 0.055, 0.075, 0.001, 0.005, 0.01, 0.0025, 0.0025],
				[
					this.cardPool.common,
					this.cardPool.uncommon,
					this.cardPool.rare,
					this.cardPool.mythic,
					this.borderless.common, // FIXME: Booster fun means borderless here?
					this.borderless.uncommon,
					this.borderless.rare,
					this.borderless.mythic,
					this.cid.uncommon,
				]
			);
			booster.push(pickCard(pool, booster, { foil: true }));
		}

		// 1 Wildcard of any rarity
		//   Common (16.7%), uncommon (58.3%; same proportion as above), a borderless woodblock common (2.6%), borderless woodblock or borderless character uncommon (5.7%), or rare or mythic rare (16.7%; same proportion as below).
		{
			const pool = chooseWeighted(
				[
					0.167,
					0.583,
					0.026,
					0.057 * (4 / (12 + 4)),
					0.057 * (12 / (12 + 4)),
					(0.167 * 8) / 9, // FIXME: 80:10 ratio? Really?
					(0.167 * 1) / 9, // FIXME
				],
				[
					this.cardPool.common,
					this.cardPool.uncommon,
					this.borderlessWoodblock.common,
					this.borderlessWoodblock.uncommon,
					this.borderlessCharacter.uncommon,
					this.cardPool.rare,
					this.cardPool.mythic,
				]
			);
			booster.push(pickCard(pool, booster, { foil: false }));
		}

		// 1 Non-foil rare or mythic rare
		//   Default frame rare (80%) or mythic rare (10%)
		//   Borderless rare (8%) or mythic rare (1%)
		//   FINAL FANTASY artist rare (0.5%) or mythic rare (0.5%)
		for (let i = 0; i < updatedTargets.rare; ++i) {
			const pool = chooseWeighted(
				[0.8, 0.1, 0.08, 0.01, 0.05, 0.05],
				[
					this.cardPool.rare,
					this.options.mythicPromotion ? this.cardPool.mythic : this.cardPool.rare,
					this.borderless.rare,
					this.options.mythicPromotion ? this.borderless.mythic : this.borderless.rare,
					this.borderlessArtist.rare,
					this.options.mythicPromotion ? this.borderlessArtist.mythic : this.borderlessArtist.rare,
				]
			);
			booster.push(pickCard(pool, booster, { foil: false }));
		}
		updatedTargets.rare = 0;

		// 3 Uncommons
		//   Of these uncommons, 0.3% will be a double-faced uncommon borderless woodblock or borderless character card.
		//   One of those uncommons—Cid, Timeless Artificer—has 15 different alternate-art variants. Cid, Timeless Artificer appears at the same rate as other uncommons, and all variants of the card appear at equal rates. Since there are 109 uncommons that can appear in this slot, any given uncommon has a 0.9% chance to be Cid, Timeless Artificer.
		{
			const count = updatedTargets.uncommon;
			for (let i = 0; i < count; i++) {
				if (random.realZeroToOneInclusive() < 0.003) {
					const pool = chooseWeighted(
						[12 / (12 + 4), 4 / (12 + 4)],
						[this.borderlessWoodblock.uncommon, this.borderlessCharacter.uncommon] // FIXME: "Double-faced" only?
					);
					booster.push(pickCard(pool, booster, { foil: false }));
					updatedTargets.uncommon -= 1;
				}
			}
			// See bellow for Cid variants.
		}

		const rest = super.generateBooster(updatedTargets, booster);
		if (isMessageError(rest)) return rest;

		for (let i = 0; i < rest.length; ++i) {
			// Cid, Timeless Artificer. Reroll it into any of its variant.
			if (rest[i].oracle_id === "87050537-99c9-4993-a770-4329b2e749e4") {
				rest[i] = getUnique(getRandom(FINBoosterFactory.CidVariants), { foil: rest[i].foil });
			}
		}

		//	1 Land
		//		Common two-color land (55%) or basic land (45%)
		//		This card is traditional foil 20% of the time.
		{
			const pool = chooseWeighted([0.55, 0.45], [FINBoosterFactory.Basics, FINBoosterFactory.CommonDualLands]);
			const foil = random.realZeroToOneInclusive() <= 0.2;
			rest.push(getUnique(getRandom(pool), { foil }));
		}

		return rest;
	}
}

// Edge of Eternities (EOE) - https://magic.wizards.com/en/news/feature/collecting-edge-of-eternities
export class EOEBoosterFactory extends BoosterFactory {
	static filter(min: number, max: number) {
		return CardsBySet["eoe"].filter(
			(c) => parseInt(getCard(c).collector_number) >= min && parseInt(getCard(c).collector_number) <= max
		);
	}

	static readonly StellarSights = CardsBySet["eos"].filter((c) => parseInt(getCard(c).collector_number) <= 45); // 30 rares, 15 mythics
	static readonly BorderlessViewport = EOEBoosterFactory.filter(277, 286); // 5 rare shock lands and 5 mythic rare legendary Planet lands
	static readonly BorderlessTriumphant = EOEBoosterFactory.filter(287, 302); // 12 rare creatures, 3 mythic rare creatures, and 1 mythic rare planeswalker
	static readonly BorderlessSurreal = EOEBoosterFactory.filter(303, 315); // 11 rares, 3 mythics
	static readonly Basics = EOEBoosterFactory.filter(267, 276);
	static readonly BorderlessCelestialBasics = EOEBoosterFactory.filter(262, 266);

	stellarSights: SlotedCardPool;
	borderlessViewport: SlotedCardPool;
	borderlessTriumphant: SlotedCardPool;
	borderlessSurreal: SlotedCardPool;
	borderlessTS: SlotedCardPool;
	borderlessVTS: SlotedCardPool;
	spg: CardPool = new CardPool();

	constructor(cardPool: SlotedCardPool, landSlot: BasicLandSlot | null, options: BoosterFactoryOptions) {
		super(cardPool, landSlot, options);
		this.stellarSights = cidsToSlotedCardPool(EOEBoosterFactory.StellarSights, options.maxDuplicates);
		this.borderlessViewport = cidsToSlotedCardPool(EOEBoosterFactory.BorderlessViewport, options.maxDuplicates);
		this.borderlessTriumphant = cidsToSlotedCardPool(EOEBoosterFactory.BorderlessTriumphant, options.maxDuplicates);
		this.borderlessSurreal = cidsToSlotedCardPool(EOEBoosterFactory.BorderlessSurreal, options.maxDuplicates);
		this.borderlessTS = cidsToSlotedCardPool(
			[...EOEBoosterFactory.BorderlessTriumphant, ...EOEBoosterFactory.BorderlessSurreal],
			options.maxDuplicates
		);
		this.borderlessVTS = cidsToSlotedCardPool(
			[
				...EOEBoosterFactory.BorderlessViewport,
				...EOEBoosterFactory.BorderlessTriumphant,
				...EOEBoosterFactory.BorderlessSurreal,
			],
			options.maxDuplicates
		);
		for (const cid of SpecialGuests.eoe) {
			const c = getCard(cid);
			this.spg.set(cid, options.maxDuplicates?.[c.rarity] ?? DefaultMaxDuplicates);
		}
	}

	generateBooster(targets: Targets) {
		const updatedTargets = structuredClone(targets);
		// 6–7 Commons
		if (targets === DefaultBoosterTargets) updatedTargets.common = Math.max(0, updatedTargets.common - 3);
		else updatedTargets.common = Math.max(1, updatedTargets.common - 2);
		// 3 Uncommons

		const booster: UniqueCard[] = [];

		// "In 1.8% of Play Boosters, 1 of 10 non-foil Special Guests cards will replace a common. Of note, Special Guests cards aren't found in the wildcard nor traditional foil slot in Play Boosters."
		const spgRoll = random.realZeroToOneInclusive();
		if (spgRoll < 0.018) {
			updatedTargets.common = Math.max(0, updatedTargets.common - 1);
			booster.push(pickCard(this.spg, booster, { foil: false }));
		}

		// 1 Traditional foil card of any rarity
		{
			const VTSRares = 5 + 12 + 11;
			const VTSMythics = 5 + 3 + 1 + 3;
			const pool = chooseWeighted(
				[
					//   A common (58%), uncommon (32%), rare (6.4%), or mythic rare (1.1%) from Edge of Eternities's main set
					0.58,
					0.32,
					0.064,
					0.011,
					//   A rare (1%) or mythic rare (less than 1%) Stellar Sights land
					0.01, // NOTE: Adds up to 98.5% here, last 3 entries share the remaining 1.5%
					0.01 / 4, // "less than 0.1%", using the ratio from non-foil wildcard
					//   A rare (less than 1%) or mythic rare (less than 1%) borderless viewport, triumphant, or surreal space card
					(1 - (0.58 + 0.32 + 0.064 + 0.011 + 0.01 + 0.01 / 4)) * (VTSRares / (VTSRares + VTSMythics)), //  FIXME: "less than 0.1%"
					(1 - (0.58 + 0.32 + 0.064 + 0.011 + 0.01 + 0.01 / 4)) * (VTSMythics / (VTSRares + VTSMythics)), //  FIXME: "less than 0.1%"
				],
				[
					this.cardPool.common,
					this.cardPool.uncommon,
					this.cardPool.rare,
					this.cardPool.mythic,
					this.stellarSights.rare,
					this.stellarSights.mythic,
					this.borderlessVTS.rare,
					this.borderlessVTS.mythic,
				]
			);
			booster.push(pickCard(pool, booster, { foil: true }));
		}

		// 1 Rare or mythic rare card
		while (updatedTargets.rare > 0) {
			updatedTargets.rare -= 1;
			const pool = chooseWeighted(
				[
					//   A rare (80.4%) or mythic rare (14.2%) from Edge of Eternities's main set
					0.804,
					0.142,
					//   A rare (2%) or mythic rare (less than 1%) borderless triumphant card
					0.02,
					0.02 * (4 / 16),
					//   A rare (2%) or mythic rare (less than 1%) borderless surreal space card
					0.02,
					0.02 * (3 / 14),
					//   A mythic rare (less than 1%) borderless viewport land
					1 - (0.804 + 0.142 + 0.02 + 0.02 * (4 / 16) + 0.02 + 0.02 * (3 / 14)),
				],
				[
					this.cardPool.rare,
					this.cardPool.mythic,
					this.borderlessTriumphant.rare,
					this.borderlessTriumphant.mythic,
					this.borderlessSurreal.rare,
					this.borderlessSurreal.mythic,
					this.borderlessViewport.mythic,
				]
			);
			booster.push(pickCard(pool, booster));
		}

		// 1 Wildcard of any rarity
		{
			const TSRares = 12 + 11;
			const TSMythics = 3 + 1 + 3;
			const pool = chooseWeighted(
				[
					//   A common (12.5%), uncommon (62.5%), rare (10.6%), or mythic rare (less than 1%) from Edge of Eternities's main set (EOE default frame cards)
					0.125,
					0.625,
					0.106,
					0.007, // FIXME: "Less than 1%"
					//   A rare (10%) or mythic rare (2.5%) Stellar Sights land
					0.1,
					0.025,
					//   A rare (1%) or mythic rare (less than 1%) borderless viewport land
					0.01,
					0.01 / 7, // FIXME: "less than 0.1%"
					//   A rare (less than 1%) or mythic rare (less than 1%) borderless triumphant or surreal space card
					(1 - (0.125 + 0.625 + 0.106 + 0.007 + 0.1 + 0.025 + 0.01 + 0.01 / 7)) *
						(TSRares / (TSRares + TSMythics)), // FIXME: "less than 0.1%"
					(1 - (0.125 + 0.625 + 0.106 + 0.007 + 0.1 + 0.025 + 0.01 + 0.01 / 7)) *
						(TSMythics / (TSRares + TSMythics)), // FIXME: "less than 0.1%"
				],
				[
					this.cardPool.common,
					this.cardPool.uncommon,
					this.cardPool.rare,
					this.cardPool.mythic,

					this.stellarSights.rare,
					this.stellarSights.mythic,

					this.borderlessViewport.rare,
					this.borderlessViewport.mythic,

					this.borderlessTS.rare,
					this.borderlessTS.mythic,
				]
			);
			booster.push(pickCard(pool, booster));
		}

		const rest = super.generateBooster(updatedTargets, booster);
		if (isMessageError(rest)) return rest;

		// 1 Land
		//   A non-foil (64%) or traditional foil (16%) default frame basic land
		//   A non-foil (16%) or traditional foil (4%) borderless celestial basic land
		{
			const pool = chooseWeighted(
				[0.64 + 0.16, 0.16 + 0.04],
				[EOEBoosterFactory.Basics, EOEBoosterFactory.BorderlessCelestialBasics]
			);
			const foil = random.realZeroToOneInclusive() <= 0.25;
			rest.push(getUnique(getRandom(pool), { foil }));
		}

		return rest;
	}
}

// Set specific rules.
// Neither DOM, WAR or ZNR have specific rules for commons, so we don't have to worry about color balancing (colorBalancedSlot)
export const SetSpecificFactories: {
	[set: string]: new (
		cardPool: SlotedCardPool,
		landSlot: BasicLandSlot | null,
		options: BoosterFactoryOptions
	) => BoosterFactory;
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
	mat: MATBoosterFactory,
	cmm: CMMBoosterFactory,
	woe: WOEBoosterFactory,
	lci: LCIBoosterFactory,
	rvr: RVRBoosterFactory,
	mkm: MKMBoosterFactory,
	otj: OTJBoosterFactory,
	mh3: MH3BoosterFactory,
	blb: BLBBoosterFactory,
	dsk: DSKBoosterFactory,
	mb2: MB2BoosterFactory,
	fdn: FDNBoosterFactory,
	pio: PIOBoosterFactory,
	pio0: PIOBoosterFactoryBonusSheet0,
	pio1: PIOBoosterFactoryBonusSheet1,
	pio2: PIOBoosterFactoryBonusSheet2,
	inr: INRBoosterFactory,
	dft: DFTBoosterFactory,
	tdm: TDMBoosterFactory,
	fin: FINBoosterFactory,
	eoe: EOEBoosterFactory,
};

export const getBoosterFactory = function (
	set: string | null,
	cardPool: SlotedCardPool,
	landSlot: BasicLandSlot | null,
	options: BoosterFactoryOptions
) {
	const localOptions = { ...options, foilRate: getSetFoilRate(set), mythicRate: getSetMythicRate(set) };
	// Check for a special booster factory
	if (set && set in SetSpecificFactories) return new SetSpecificFactories[set](cardPool, landSlot, localOptions);
	return new BoosterFactory(cardPool, landSlot, localOptions);
};

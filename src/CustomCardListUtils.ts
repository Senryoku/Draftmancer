import { ColorBalancedSlot } from "./BoosterFactory.js";
import { CardID, Card, UniqueCard } from "./CardTypes.js";
import { getCard } from "./Cards.js";
import { pickCard, pickPrintRun, pickStriped } from "./cardUtils.js";
import { MessageError } from "./Message.js";
import { isEmpty, random, weightedRandomIdx, shuffleArray } from "./utils.js";
import { CCLSettings, CustomCardList, getSheetCardIDs } from "./CustomCardList.js";
import { hasProperty, isArrayOf, isBoolean, isNumber, isObject, isString } from "./TypeChecks.js";
import { CardPool, SlotedCardPool } from "./CardPool.js";

export function generateCustomGetCardFunction(customCardList: CustomCardList): (cid: CardID) => Card {
	if (!customCardList?.customCards) return getCard;
	return (cid: CardID) => {
		return customCardList.customCards && cid in customCardList.customCards
			? customCardList.customCards[cid]
			: getCard(cid);
	};
}

export function generateBoosterFromCustomCardList(
	customCardList: CustomCardList,
	boosterQuantity: number,
	options: {
		colorBalance?: boolean;
		cardsPerBooster?: number;
		withReplacement?: boolean;
		duplicateProtection?: boolean;
		playerCount?: number; // Allow correct ordering of boosters when using predetermined layouts
		removeFromCardPool?: CardID[]; // Used by LoreSeeker draft effect
	} = {}
): MessageError | Array<UniqueCard>[] {
	if (
		!customCardList.sheets ||
		Object.keys(customCardList.sheets).length === 0 ||
		Object.values(customCardList.sheets).every((sheet) => getSheetCardIDs(sheet).length === 0)
	) {
		return new MessageError("Error generating boosters", "No custom card list provided.");
	}

	const refillWhenEmpty = customCardList.settings?.refillWhenEmpty ?? false;
	if (options.colorBalance === undefined) options.colorBalance = false;
	if (options.duplicateProtection === undefined) options.duplicateProtection = true;
	if (options.withReplacement === undefined) options.withReplacement = false;
	const pickOptions = {
		uniformAll: true,
		withReplacement: options.withReplacement,
		duplicateProtection: options.duplicateProtection,
		getCard: generateCustomGetCardFunction(customCardList),
		onEmpty: undefined as undefined | (() => void),
	};

	// List is using custom layouts
	if (customCardList.layouts && !isEmpty(customCardList.layouts)) {
		const layouts = customCardList.layouts;
		const layoutsTotalWeights = Object.keys(layouts).reduce((acc, key) => acc + layouts[key].weight, 0);

		const cardsBySheet: SlotedCardPool = {};

		const fillSheet = (sheetName: string) => {
			if (customCardList.sheets[sheetName].collation !== "random")
				return console.error(
					`Called fillSheet on sheet with '${customCardList.sheets[sheetName].collation}' collation.`
				);
			for (const [cardID, count] of Object.entries(customCardList.sheets[sheetName].cards))
				cardsBySheet[sheetName].set(cardID, count);
		};
		for (const sheetName of Object.keys(customCardList.sheets)) {
			if (customCardList.sheets[sheetName].collation === "random") {
				cardsBySheet[sheetName] = new CardPool();
				fillSheet(sheetName);
			}
		}

		// Workaround to handle the LoreSeeker draft effect with a limited number of cards
		if (!options.withReplacement && options.removeFromCardPool) {
			// We don't know from which slot the cards were picked, so we might remove them multiple times if they're shared between multiple slots,
			// however I don't have a better solution for now.
			for (const sheetName in cardsBySheet)
				for (const cardId of options.removeFromCardPool)
					if (cardsBySheet[sheetName].has(cardId)) cardsBySheet[sheetName].removeCard(cardId);
		}

		// Color balance the largest slot of each layout
		const colorBalancedSlots: Map<string, number> = new Map();
		const colorBalancedGenerators: Map<string, ColorBalancedSlot> = new Map();
		if (options.colorBalance) {
			for (const layoutName in layouts) {
				let largest_slot = 0;
				for (let i = 1; i < layouts[layoutName].slots.length; ++i) {
					if (layouts[layoutName].slots[i].count > layouts[layoutName].slots[largest_slot].count)
						largest_slot = i;
				}
				colorBalancedSlots.set(layoutName, largest_slot);
			}
			for (const sheetName in customCardList.sheets) {
				if (customCardList.sheets[sheetName].collation === "random") {
					colorBalancedGenerators.set(sheetName, new ColorBalancedSlot(cardsBySheet[sheetName], pickOptions));
				}
			}
		}

		const predeterminedLayouts = customCardList.settings?.predeterminedLayouts;

		const nextLayout = predeterminedLayouts
			? customCardList.settings?.layoutWithReplacement === false
				? // Predetermined layouts, without replacement
					(() => {
						const bags: string[][] = predeterminedLayouts.map(() => []);
						const refill = (index: number) => {
							const bag = [];
							for (const layout of predeterminedLayouts[index])
								for (let i = 0; i < layout.weight; ++i) bag.push(layout.name);
							shuffleArray(bag);
							bags[index] = bag;
						};
						return (index: number): string => {
							if (bags[index % bags.length].length === 0) refill(index % bags.length);
							return bags[index % bags.length].pop()!;
						};
					})()
				: // Predetermined layouts, with replacement
					(index: number): string => {
						const choices = predeterminedLayouts[index % predeterminedLayouts.length]!;
						if (choices.length === 1) return choices[0].name;
						return choices[weightedRandomIdx(choices)].name;
					}
			: customCardList.settings?.layoutWithReplacement === false
				? // Random layouts without replacement (until we have no other choice)
					(() => {
						let bag: string[] = [];
						const refill = () => {
							bag = [];
							for (const layoutName in layouts)
								for (let i = 0; i < layouts[layoutName].weight; ++i) bag.push(layoutName);
							shuffleArray(bag);
						};
						return (/*index: number*/): string => {
							if (bag.length === 0) refill();
							return bag.pop()!;
						};
					})()
				: // Random layouts
					(/*index: number*/): string => {
						let randomLayout = random.real(0, layoutsTotalWeights);
						for (const layoutName in layouts) {
							randomLayout -= layouts[layoutName].weight;
							if (randomLayout <= 0) return layoutName;
						}
						return Object.keys(layouts)[0]!;
					};

		// Generate Boosters
		const boosters: Array<UniqueCard>[] = [];
		for (let i = 0; i < boosterQuantity; ++i) {
			const booster: Array<UniqueCard> = [];

			// Pick a layout
			const pickedLayoutName = nextLayout(options.playerCount ? Math.floor(i / options.playerCount) : i);
			// Should be caught earlier, but just in case, check again.
			if (!(pickedLayoutName in layouts))
				return new MessageError("Error generating boosters", `Invalid layout '${pickedLayoutName}'.`);
			const pickedLayout = layouts[pickedLayoutName];

			for (const [index, slot] of pickedLayout.slots.entries()) {
				const sheetName = slot.sheets[weightedRandomIdx(slot.sheets)].name;
				const useColorBalance: boolean =
					options.colorBalance &&
					index === colorBalancedSlots.get(pickedLayoutName) &&
					colorBalancedGenerators.has(sheetName);
				// Checking the card count beforehand is tricky, we'll rely on pickCard throwing an exception if we run out of cards to pick.
				try {
					let pickedCards: UniqueCard[] = [];

					switch (customCardList.sheets[sheetName].collation) {
						case "printRun": {
							pickedCards = pickPrintRun(
								slot.count,
								customCardList.sheets[sheetName].printRun,
								customCardList.sheets[sheetName].groupSize,
								pickOptions
							);
							break;
						}
						case "striped": {
							pickedCards = pickStriped(
								slot.count,
								customCardList.sheets[sheetName].sheet,
								customCardList.sheets[sheetName].length,
								customCardList.sheets[sheetName].weights,
								pickOptions
							);
							break;
						}
						case "random":
						default: {
							const sheetPickOption = refillWhenEmpty
								? {
										...pickOptions,
										onEmpty: () => {
											fillSheet(sheetName);
											colorBalancedGenerators.get(sheetName)?.cache.reset(pickOptions);
										},
									}
								: pickOptions;

							if (useColorBalance) {
								pickedCards = colorBalancedGenerators
									.get(sheetName)!
									.generate(slot.count, booster, sheetPickOption);
							} else {
								for (let i = 0; i < slot.count; ++i) {
									const pickedCard = pickCard(
										cardsBySheet[sheetName],
										booster.concat(pickedCards),
										sheetPickOption
									);
									pickedCards.push(pickedCard);
									if (colorBalancedGenerators.has(sheetName) && !pickOptions.withReplacement)
										colorBalancedGenerators.get(sheetName)!.cache.removeCard(pickedCard);
								}
							}
						}
					}

					if (customCardList.settings?.showSlots) {
						const displaySlotName = slot.name.split("##")[0]; // Remove potential 'hidden id' after '##' delimiter.
						for (const card of pickedCards) card.slot = displaySlotName;
					}
					if (customCardList.settings?.showSheets) {
						const displaySheetName = sheetName.split("##")[0];
						for (const card of pickedCards) card.sheet = displaySheetName;
					}
					if (slot.foil) pickedCards.forEach((card) => (card.foil = true));

					booster.push(...pickedCards);
				} catch (e) {
					console.error("generateBoosterFromCustomCardList error: ", e);
					return new MessageError(
						"Error generating boosters",
						"An error occured while generating boosters. Make sure there are enough cards in the list."
					);
				}
			}

			boosters.push(booster);
		}
		return boosters;
	} else {
		// In the absence of layouts, we expect the presence of a single slot.
		// Number of cards in pack is determined by the session settings.

		// These errors should have been caught during list parsing, double checking just in case.
		const slotsCount = Object.keys(customCardList.sheets).length;
		if (slotsCount === 0) {
			return new MessageError("Error generating boosters", `No slot defined.`);
		} else if (slotsCount !== 1) {
			return new MessageError(
				"Error generating boosters",
				`Multiple 'default' slots defined. Merge them into a single one, or use layouts (you can define a default layout by explicitly setting slot sizes).`
			);
		}

		const defaultSlot = Object.values(customCardList.sheets)[0];

		if (defaultSlot.collation !== "random")
			return new MessageError(
				"Error generating boosters",
				`Only the default collation is supported when a single slot is defined.`
			);

		// Generate fully random 15-cards booster for cube (not considering rarity)
		// Getting custom card list
		const localCollection: CardPool = new CardPool();

		const fillPool = () => {
			let cardCount = 0;
			for (const [cardID, count] of Object.entries(defaultSlot.cards)) {
				localCollection.set(cardID, count);
				cardCount += count;
			}
			return cardCount;
		};
		const cardCount = fillPool();
		const cardsPerBooster = options.cardsPerBooster ?? 15;

		// Workaround to handle the LoreSeeker draft effect with a limited number of cards
		if (!options.withReplacement && options.removeFromCardPool) {
			for (const cardId of options.removeFromCardPool)
				if (localCollection.has(cardId)) localCollection.removeCard(cardId);
		}

		const cardTarget = cardsPerBooster * boosterQuantity;
		if (!options.withReplacement && !refillWhenEmpty && cardCount < cardTarget) {
			return new MessageError(
				"Error generating boosters",
				`Not enough cards (${cardCount}/${cardTarget}) in custom list.`
			);
		}

		const boosters = [];

		if (options.colorBalance && cardsPerBooster >= 5) {
			const colorBalancedSlotGenerator = new ColorBalancedSlot(localCollection, pickOptions);
			if (refillWhenEmpty)
				pickOptions.onEmpty = () => {
					fillPool();
					colorBalancedSlotGenerator.cache.reset(pickOptions);
				};
			for (let i = 0; i < boosterQuantity; ++i)
				boosters.push(colorBalancedSlotGenerator.generate(cardsPerBooster, [], pickOptions));
		} else {
			if (refillWhenEmpty) pickOptions.onEmpty = fillPool;
			for (let i = 0; i < boosterQuantity; ++i) {
				const booster: Array<UniqueCard> = [];
				for (let j = 0; j < cardsPerBooster; ++j) booster.push(pickCard(localCollection, booster, pickOptions));
				boosters.push(booster);
			}
		}
		return boosters;
	}
}

const CCLSettingsKeys = [
	"cardBack",
	"cardTitleHeightFactor",
	"showSlots",
	"showSheets",
	"boosterSettings",
	"predeterminedLayouts",
	"layoutWithReplacement",
	"duplicateProtection",
	"boostersPerPlayer",
	"withReplacement",
	"colorBalance",
	"refillWhenEmpty",
	"botModel",
] as const;

export function isKeyOfCCLSettings(key: unknown): key is keyof CCLSettings {
	return CCLSettingsKeys.includes(key as keyof CCLSettings);
}

export function checkCCLSettingType(key: keyof CCLSettings, value: unknown): value is CCLSettings[keyof CCLSettings] {
	switch (key) {
		case "cardBack":
			return isString(value);
		case "cardTitleHeightFactor":
			return isNumber(value);
		case "showSlots":
			return isBoolean(value);
		case "showSheets":
			return isBoolean(value);
		case "boosterSettings":
			return (
				isObject(value) &&
				hasProperty("picks", isArrayOf(isNumber))(value) &&
				hasProperty("burns", isArrayOf(isNumber))(value)
			);
		case "predeterminedLayouts":
			return isArrayOf(
				isArrayOf(
					(val) => isObject(val) && hasProperty("name", isString)(val) && hasProperty("weight", isNumber)(val)
				)
			)(value);
		case "layoutWithReplacement":
			return isBoolean(value);
		case "duplicateProtection":
			return isBoolean(value);
		case "boostersPerPlayer":
			return isNumber(value);
		case "withReplacement":
			return isBoolean(value);
		case "colorBalance":
			return isBoolean(value);
		case "refillWhenEmpty":
			return isBoolean(value);
		case "botModel":
			return isString(value);
	}
}

import { ColorBalancedSlot } from "./BoosterFactory.js";
import { CardID, Card, SlotedCardPool, Cards, UniqueCard, CardPool, getCard } from "./Cards.js";
import { countCards, pickCard } from "./cardUtils.js";
import { MessageError } from "./Message.js";
import { Options, random } from "./utils.js";

export type PackLayout = {
	weight: number;
	slots: { [slot: string]: number };
};

export type CustomCardList = {
	name?: string;
	slots: { [slot: string]: { [cid: CardID]: number } };
	layouts: { [name: string]: PackLayout } | false;
	customCards: { [cardID: string]: Card } | null;
};

export function generateBoosterFromCustomCardList(
	customCardList: CustomCardList,
	boosterQuantity: number,
	options: Options
): MessageError | Array<UniqueCard>[] {
	if (
		!customCardList.slots ||
		Object.keys(customCardList.slots).every((key) => customCardList.slots[key].length === 0)
	) {
		return new MessageError("Error generating boosters", "No custom card list provided.");
	}
	// List is using custom layouts
	if (customCardList.layouts) {
		const layouts = customCardList.layouts;
		const layoutsTotalWeights = Object.keys(layouts).reduce((acc, key) => (acc += layouts[key].weight), 0);

		let cardsBySlot: SlotedCardPool = {};
		for (let slotName in customCardList.slots) {
			cardsBySlot[slotName] = new Map();
			for (let cardId in customCardList.slots[slotName])
				cardsBySlot[slotName].set(cardId, customCardList.slots[slotName][cardId]);
		}

		let pickOptions: Options = { uniformAll: true };
		if (customCardList.customCards)
			pickOptions.getCard = (cid: CardID) => {
				return customCardList.customCards && cid in customCardList.customCards
					? customCardList.customCards[cid]
					: getCard(cid);
			};

		// Color balance the largest slot of each layout
		const colorBalancedSlots: { [layoutName: string]: string } = {};
		const colorBalancedSlotGenerators: { [slotName: string]: ColorBalancedSlot } = {};
		if (options.colorBalance) {
			for (let layoutName in layouts) {
				colorBalancedSlots[layoutName] = Object.keys(layouts[layoutName].slots).reduce((max, curr) =>
					layouts[layoutName].slots[curr] > layouts[layoutName].slots[max] ? curr : max
				);
			}
			for (let slotName of new Set(Object.values(colorBalancedSlots))) {
				colorBalancedSlotGenerators[slotName] = new ColorBalancedSlot(cardsBySlot[slotName], pickOptions);
			}
		}

		// Generate Boosters
		let boosters: Array<UniqueCard>[] = [];
		for (let i = 0; i < boosterQuantity; ++i) {
			let booster: Array<UniqueCard> = [];

			// Pick a layout
			let randomLayout = random.real(0, layoutsTotalWeights);
			let pickedLayoutName = Object.keys(layouts)[0];
			for (let layoutName in layouts) {
				randomLayout -= layouts[layoutName].weight;
				if (randomLayout <= 0) {
					pickedLayoutName = layoutName;
					break;
				}
			}
			const pickedLayout = layouts[pickedLayoutName];

			for (let slotName in pickedLayout.slots) {
				const useColorBalance =
					options.colorBalance &&
					slotName === colorBalancedSlots[pickedLayoutName] &&
					pickedLayout.slots[slotName] >= 5 &&
					colorBalancedSlotGenerators[slotName];
				if (useColorBalance) {
					booster = booster.concat(
						colorBalancedSlotGenerators[slotName].generate(pickedLayout.slots[slotName], [], pickOptions)
					);
				} else {
					for (let i = 0; i < pickedLayout.slots[slotName]; ++i) {
						// Checking the card count beforehand is tricky, we'll rely on pickCard throwing an exception if we run out of cards to pick.
						try {
							const pickedCard = pickCard(cardsBySlot[slotName], booster, pickOptions);
							booster.push(pickedCard);
						} catch (e) {
							return new MessageError(
								"Error generating boosters",
								"An error occured while generating boosters, make sure there is enough cards in the list."
							);
						}
					}
				}
			}

			boosters.push(booster);
		}
		return boosters;
	} else {
		// Generate fully random 15-cards booster for cube (not considering rarity)
		// Getting custom card list
		let localCollection: CardPool = new Map();

		for (let cardId in customCardList.slots["default"])
			localCollection.set(cardId, customCardList.slots["default"][cardId]);

		const cardsPerBooster = options.cardsPerBooster ?? 15;

		const pickOptions: Options = { uniformAll: true };

		let card_count = customCardList.slots["default"].length;
		let card_target = cardsPerBooster * boosterQuantity;
		if (card_count < card_target) {
			return new MessageError(
				"Error generating boosters",
				`Not enough cards (${card_count}/${card_target}) in custom list.`
			);
		}

		let boosters = [];

		if (options.colorBalance && cardsPerBooster >= 5) {
			const colorBalancedSlotGenerator = new ColorBalancedSlot(localCollection);
			for (let i = 0; i < boosterQuantity; ++i)
				boosters.push(colorBalancedSlotGenerator.generate(cardsPerBooster, [], pickOptions));
		} else {
			for (let i = 0; i < boosterQuantity; ++i) {
				let booster: Array<UniqueCard> = [];
				for (let j = 0; j < cardsPerBooster; ++j) booster.push(pickCard(localCollection, booster, pickOptions));
				boosters.push(booster);
			}
		}
		return boosters;
	}
}

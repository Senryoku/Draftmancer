import { weightedRandomIdx } from "./BoosterFactory.js";
import { CardID, getUnique, UniqueCard } from "./Cards.js";

export type JHHBoosterPattern = {
	name: string;
	colors: string[];
	cycling_land: boolean;
	cards: string[];
	alts: {
		name: string;
		id: string;
		weight: number;
	}[][];
};

export function generateJHHBooster(
	boosterPattern: JHHBoosterPattern
): { name: string; cards: UniqueCard[]; colors: Array<string> } {
	let booster: { name: string; cards: UniqueCard[]; colors: Array<string> } = {
		name: boosterPattern.name,
		colors: boosterPattern.colors,
		cards: [],
	};
	// Immutable part of the pack
	booster.cards = boosterPattern.cards.map((cid: CardID) => getUnique(cid));
	// Random variations
	if (boosterPattern.alts) {
		for (let slot of boosterPattern.alts) {
			const totalWeight = slot.map(o => o.weight).reduce((p, c) => p + c, 0); // FIXME: Should always be 100, but since cards are still missing from the database, we'll compute it correctly.
			const pickIdx = weightedRandomIdx(slot, totalWeight);
			booster.cards.push(getUnique(slot[pickIdx].id));
		}
	}
	return booster;
}

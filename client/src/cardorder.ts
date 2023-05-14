import { Card, CardColor, CardID, CardRarity } from "@/CardTypes";

const ColorOrder: { [color in CardColor]: number } = {
	W: 0,
	U: 1,
	B: 2,
	R: 3,
	G: 4,
};

const RarityOrder: { [rarity: string]: number } = {
	mythic: 0,
	rare: 1,
	uncommon: 2,
	common: 3,
	other: 4,
};

const TypeOrder: { [type: string]: number } = {
	Creature: 0,
	"Legendary Creature": 0,
	"Enchantment Creature": 0,
	"Artifact Creature": 0,
	Planeswalker: 1,
	"Legendary Planeswalker": 1,
	Enchantment: 2,
	"Legendary Enchantment": 2,
	Artifact: 3,
	"Legendary Artifact": 3,
	Instant: 4,
	Sorcery: 5,
	Land: 6,
	"Basic Land": 7,
};

function colorOrder(colors: CardColor[]) {
	if (colors.length === 1) return ColorOrder[colors[0]];
	else if (colors.length === 0) return 5;
	else return 6;
}

function rarityOrder(rarity: string) {
	if (!(rarity in RarityOrder)) return RarityOrder["other"];
	return RarityOrder[rarity];
}

function getFirstType(type: string) {
	const idx = type.indexOf(" //");
	if (idx >= 0) return type.substring(0, idx);
	else return type;
}

function typeOrder(type: string) {
	const fullType = getFirstType(type);
	const simpleType = fullType.split(" ").pop();
	if (fullType in TypeOrder) return TypeOrder[getFirstType(type)];
	else if (simpleType && simpleType in TypeOrder) return TypeOrder[simpleType];
	else return 1;
}

export type ComparatorType = (
	lhs: { cmc: number; type: string; colors: CardColor[]; rarity: CardRarity; name: string; id: CardID },
	rhs: { cmc: number; type: string; colors: CardColor[]; rarity: CardRarity; name: string; id: CardID }
) => number;

const Comparators: { [name: string]: ComparatorType } = {
	// Arena counts each X as 100 basically
	// Arena uses the front half of split cards here
	// TODO: handle X, handle split cards
	cmc: (lhs, rhs) => {
		return lhs.cmc - rhs.cmc;
	},

	// Arena puts creatures before non-creatures
	type: (lhs, rhs) => {
		return typeOrder(lhs.type) - typeOrder(rhs.type);
	},

	// Arena does W U B R G WU WB UB UR BR BG RG RW GW GB WUB UBR BRG RGW GWU WRB URG WBG URW BGU, ??, WUBRG, no colors
	// TODO: handle cards that aren't monocolor
	color: (lhs, rhs) => {
		const l = lhs.colors;
		const r = rhs.colors;
		if (!l || !r) return 0;
		if (l.length === 1 && r.length === 1) return ColorOrder[l[0]] - ColorOrder[r[0]];
		else if (l.length === 1) return -1;
		else if (r.length === 1) return 1;
		else return String(l).localeCompare(String(r));
	},

	rarity: (lhs, rhs) => {
		return rarityOrder(lhs.rarity) - rarityOrder(rhs.rarity);
	},

	name: (lhs, rhs) => {
		return String(lhs.name).localeCompare(rhs.name);
	},

	id: (lhs, rhs) => {
		return lhs.id.localeCompare(rhs.id);
	},

	arena: (lhs, rhs) => {
		const arenaComparators = [
			Comparators.cmc,
			Comparators.type,
			Comparators.color,
			Comparators.name,
			Comparators.id,
		];
		for (const comparator of arenaComparators) {
			const result = comparator(lhs, rhs);
			if (result !== 0) return result;
		}
		return 0;
	},
};

export function columnCMC(cards: Card[]) {
	const a = cards.reduce((acc, item) => {
		if (!acc[item.cmc]) acc[item.cmc] = [];
		acc[item.cmc].push(item);
		return acc;
	}, {} as { [cmc: number]: Card[] });
	for (const col in a) orderByArenaInPlace(a[col]);
	return a;
}

export function columnColor(cards: Card[]) {
	const a = cards.reduce(
		(acc, item) => {
			if (item.colors.length > 1) {
				if (!acc["multi"]) acc["multi"] = [];
				acc["multi"].push(item);
			} else if (item.colors.length === 0) {
				acc[""].push(item);
			} else {
				if (!acc[item.colors[0]]) acc[item.colors[0]] = [];
				acc[item.colors[0]].push(item);
			}
			return acc;
		},
		{ "": [], W: [], U: [], B: [], R: [], G: [], multi: [] } as { [key: string]: Card[] }
	);
	for (const col in a) orderByArenaInPlace(a[col]);
	return a;
}

export function orderByCMCInPlace(cards: Card[]) {
	return cards.sort(function (lhs, rhs) {
		if (lhs.cmc == rhs.cmc) return Comparators.color(lhs, rhs);
		return lhs.cmc - rhs.cmc;
	});
}

export function orderByCMC(cards: Card[]) {
	return orderByCMCInPlace([...cards]);
}

export function orderByColorInPlace(cards: Card[]) {
	return cards.sort(function (lhs, rhs) {
		if (Comparators.color(lhs, rhs) == 0) return Comparators.arena(lhs, rhs);
		return Comparators.color(lhs, rhs);
	});
}

export function orderByColor(cards: Card[]) {
	return orderByColorInPlace([...cards]);
}

export function orderByRarityInPlace(cards: Card[]) {
	return cards.sort(function (lhs, rhs) {
		if (RarityOrder[lhs.rarity] == RarityOrder[rhs.rarity]) Comparators.arena(lhs, rhs);
		return RarityOrder[lhs.rarity] - RarityOrder[rhs.rarity];
	});
}

export function orderByRarity(cards: Card[]) {
	return orderByRarityInPlace([...cards]);
}

export function orderByArenaInPlace(cards: Card[]) {
	return cards.sort(Comparators.arena);
}

export function orderByArena(cards: Card[]) {
	return orderByArenaInPlace([...cards]);
}

export function isOrdered(cards: Card[], comparator: (lhs: Card, rhs: Card) => number) {
	for (let i = 0; i < cards.length - 1; i++) {
		if (comparator(cards[i], cards[i + 1]) > 0) {
			return false;
		}
	}
	return true;
}

export default {
	Comparators,
	columnCMC,
	columnColor,
	orderByCMCInPlace,
	orderByCMC,
	orderByColorInPlace,
	orderByColor,
	orderByRarityInPlace,
	orderByRarity,
	orderByArenaInPlace,
	orderByArena,
	isOrdered,
	colorOrder,
	rarityOrder,
	typeOrder,
};

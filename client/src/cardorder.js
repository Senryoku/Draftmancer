const ColorOrder = {
	W: 0,
	U: 1,
	B: 2,
	R: 3,
	G: 4,
};

const RarityOrder = {
	mythic: 0,
	rare: 1,
	uncommon: 2,
	common: 3,
};

const TypeOrder = {
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

function colorOrder(colors) {
	if(colors.length === 1) return ColorOrder[colors[0]];
	else if(colors.length === 0) return 5;
	else return 6;
}

function rarityOrder(rarity) {
	return RarityOrder[rarity];
}

function getFirstType(type) {
	const idx = type.indexOf(" //");
	if (idx >= 0) return type.substr(0, idx);
	else return type;
};

function typeOrder(type) {
	const fullType = getFirstType(type);
	const simpleType = fullType.split(" ").pop();
	if(fullType in TypeOrder)
		return TypeOrder[getFirstType(type)];
	else if(simpleType in TypeOrder)
		return TypeOrder[simpleType];
	else return 1;
}

const Comparators = {
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
		return lhs.id - rhs.id;
	},

	arena: (lhs, rhs) => {
		const arenaComparators = [
			Comparators.cmc,
			Comparators.type,
			Comparators.color,
			Comparators.name,
			Comparators.id,
		];
		for (let comparitor of arenaComparators) {
			let result = comparitor(lhs, rhs);
			if (result != 0) {
				return result;
			}
		}
		return 0;
	},
};

export function columnCMC(cards) {
	let a = cards.reduce((acc, item) => {
		if (!acc[item.cmc]) acc[item.cmc] = [];
		acc[item.cmc].push(item);
		return acc;
	}, {});
	for (let col in a) this.orderByArenaInPlace(a[col]);
	return a;
}

export function columnColor(cards) {
	let a = cards.reduce(
		(acc, item) => {
			if (item.colors.length > 1) {
				if (!acc["multi"]) acc["multi"] = [];
				acc["multi"].push(item);
			} else {
				if (!acc[item.colors]) acc[item.colors] = [];
				acc[item.colors].push(item);
			}
			return acc;
		},
		{ "": [], W: [], U: [], B: [], R: [], G: [], multi: [] }
	);
	for (let col in a) this.orderByArenaInPlace(a[col]);
	return a;
}

export function idColumnCMC(cardids) {
	let a = cardids.reduce((acc, id) => {
		const cmc = Math.min(7, this.cards[id].cmc);
		if (!acc[cmc]) acc[cmc] = [];
		acc[cmc].push(id);
		return acc;
	}, {});
	for (let col in a) this.orderByArenaInPlace(a[col]);
	return a;
}

export function orderByCMCInPlace(cards) {
	return cards.sort(function(lhs, rhs) {
		if (lhs.cmc == rhs.cmc) return Comparators.color(lhs, rhs);
		return lhs.cmc - rhs.cmc;
	});
}

export function orderByCMC(cards) {
	return orderByCMCInPlace([...cards]);
}

export function orderByColorInPlace(cards) {
	return cards.sort(function(lhs, rhs) {
		if (Comparators.color(lhs, rhs) == 0) return Comparators.arena(lhs, rhs);
		return Comparators.color(lhs, rhs);
	});
}

export function orderByColor(cards) {
	return this.orderByColorInPlace([...cards]);
}

export function orderByRarityInPlace(cards) {
	return cards.sort(function(lhs, rhs) {
		if (RarityOrder[lhs.rarity] == RarityOrder[rhs.rarity]) Comparators.arena(lhs, rhs);
		return RarityOrder[lhs.rarity] - RarityOrder[rhs.rarity];
	});
}

export function orderByRarity(cards) {
	return orderByRarityInPlace([...cards]);
}

export function orderByArenaInPlace(cards) {
	return cards.sort(Comparators.arena);
}

export function orderByArena(cards) {
	return this.orderByArenaInPlace([...cards]);
}

export function isOrdered(cards, comparator) {
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
	idColumnCMC,
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
	typeOrder
};

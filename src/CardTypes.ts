export type CardID = string;
export type ArenaID = string;
export type OracleID = string;
export type UniqueCardID = number;

export enum CardColor {
	W = "W",
	U = "U",
	B = "B",
	R = "R",
	G = "G",
}

export type CardBack = {
	name: string;
	printed_names: { [lang: string]: string };
	image_uris: { [lang: string]: string };
	type: string;
	subtypes: Array<string>;
};

export type CardRarity = string;

export class Card {
	id: CardID = "";
	arena_id?: ArenaID;
	oracle_id: OracleID = "";
	name: string = "";
	mana_cost: string = "";
	cmc: number = 0;
	colors: Array<CardColor> = [];
	set: string = "";
	collector_number: string = "";
	rarity: CardRarity = "";
	type: string = "";
	subtypes: Array<string> = [];
	rating: number = 0;
	in_booster: boolean = true;
	layout?: string;
	printed_names: { [lang: string]: string } = {};
	image_uris: { [lang: string]: string } = {};
	back?: CardBack;
}

export type DeckBasicLands = { [key in CardColor]: number };

export type CardPool = Map<string, number>;
export type SlotedCardPool = { [slot: string]: CardPool };
export type DeckList = {
	main: Array<CardID>;
	side: Array<CardID>;
	hashes?: { [key: string]: string };
	lands?: DeckBasicLands;
};

let UniqueID: UniqueCardID = 0;

export function getNextCardID() {
	return ++UniqueID;
}

export function toUnique(card: Card): UniqueCard {
	return { ...card, uniqueID: getNextCardID() };
}

export class UniqueCard extends Card {
	uniqueID: UniqueCardID = 0;
	foil?: boolean = false;
}

export type PlainCollection = { [aid: ArenaID]: number };

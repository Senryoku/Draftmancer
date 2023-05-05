export type CardID = string;
export type ArenaID = number;
export type OracleID = string;
export type UniqueCardID = number;

export enum CardColor {
	W = "W",
	U = "U",
	B = "B",
	R = "R",
	G = "G",
}

// Draft effects activated immediatly when the card is picked.
export enum OnPickDraftEffect {
	FaceUp = "FaceUp",
	Reveal = "Reveal",
	NotePassingPlayer = "NotePassingPlayer",
	NoteDraftedCards = "NoteDraftedCards",
}

// Same thing, but a may ability.
export enum OptionalOnPickDraftEffect {
	LoreSeeker = "LoreSeeker",
}

// Draft effect that can be activated after the card has been picked (generally while picking another card later).
export enum UsableDraftEffect {
	RemoveDraftCard = "RemoveDraftCard",
	CogworkLibrarian = "CogworkLibrarian",
	AgentOfAcquisitions = "AgentOfAcquisitions",
	NoteCardName = "NotedCardName",
	NoteCreatureName = "NoteCreatureName",
	NoteCreatureTypes = "NoteCreatureTypes",
}

export type DraftEffect =
	| OnPickDraftEffect
	| OptionalOnPickDraftEffect
	| UsableDraftEffect
	| "AnimusOfPredation"
	| "CogworkGrinder";

export type CardFace = {
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
	back?: CardFace;
	related_cards?: Array<CardID | CardFace>;
	draft_effects?: Array<DraftEffect>;
	is_custom?: boolean;
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

export type UniqueCardState = {
	faceUp?: boolean;
	cardsDraftedThisRound?: number;
	passingPlayer?: string;
	cardName?: string;
	creatureName?: string;
	creatureTypes?: string[];
	removedCards?: UniqueCard[];
};

export class UniqueCard extends Card {
	uniqueID: UniqueCardID = 0;
	foil?: boolean = false;
	state?: UniqueCardState;
}

// JSON can't use numbers as keys, we have to use a string and not ArenaID here.
export type PlainCollection = { [aid: string]: number };

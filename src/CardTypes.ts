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
	ChooseColors = "ChooseColors",
	CanalDredger = "CanalDredger",
	AetherSearcher = "AetherSearcher",
	ArchdemonOfPaliano = "ArchdemonOfPaliano",
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
	LeovoldsOperative = "LeovoldsOperative",
	NoteCardName = "NoteCardName",
	NoteCreatureName = "NoteCreatureName",
	NoteCreatureTypes = "NoteCreatureTypes",
}

// Draft effects without parameters
export type SimpleDraftEffectType =
	| OnPickDraftEffect
	| OptionalOnPickDraftEffect
	| UsableDraftEffect
	| "TrackRemovedCardsNames"
	| "TrackRemovedCardsSubtypes"
	| "CogworkGrinder";

export enum ParameterizedDraftEffectType {
	AddCards = "AddCards",
}

export type DraftEffectType = SimpleDraftEffectType | ParameterizedDraftEffectType;

export type DraftEffect =
	| {
			type: SimpleDraftEffectType;
	  }
	| { type: ParameterizedDraftEffectType.AddCards; count: number; cards: CardID[]; duplicateProtection: boolean };

export type CardFace = {
	name: string;
	printed_names: { [lang: string]: string };
	image_uris: { [lang: string]: string };
	type: string;
	subtypes: Array<string>;
	// The following fields aren't directly available for official cards but might be specified in custom cards.
	oracle_text?: string;
	power?: number | string;
	toughness?: number | string;
	loyalty?: number | string; // Planeswalker starting loyalty.
	layout?: string;
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
	foil?: boolean; // Allows specifying a card as foil by default (Mostly useful for cubes). For standard cards available in both formats, see UniqueCard.foil.
	// The following fields aren't directly available for official cards but might be specified in custom cards.
	oracle_text?: string;
	power?: number | string;
	toughness?: number | string;
	loyalty?: number | string; // Planeswalker starting loyalty.
}

export type DeckBasicLands = { [key in CardColor]: number };

// Implements a MultiSet using a standard Map.
export class CardPool extends Map<CardID, number> {
	private _count = 0;

	constructor() {
		super();
	}

	// Set the number of copies of a card in the pool.
	// Note: If count is <= 0, the card entry will be removed entirely.
	set(cid: CardID, count: number) {
		if (super.has(cid)) {
			this._count -= super.get(cid)!;
			if (count <= 0) super.delete(cid);
		}
		if (count > 0) {
			super.set(cid, count);
			this._count += count;
		}
		return this;
	}

	clear(): void {
		super.clear();
		this._count = 0;
	}

	delete(key: string): boolean {
		const oldValue = super.get(key);
		if (oldValue) this._count -= oldValue;
		return super.delete(key);
	}

	// Remove a single copy of a card from the pool.
	removeCard(cid: CardID) {
		const oldValue = this.get(cid);
		if (!oldValue) {
			console.error(`Called removeCard on a non-existing card (${cid}).`);
			console.trace();
			throw `Called removeCard on a non-existing card (${cid}).`;
		}
		// Purposefully bypassing our caching overload and calling super.set() and super.delete() directly here.
		if (oldValue === 1) super.delete(cid);
		else super.set(cid, oldValue - 1);
		--this._count;
	}

	count() {
		return this._count;
	}
}

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

export function toUnique(card: Card, slot?: string): UniqueCard {
	return { ...card, uniqueID: getNextCardID(), slot };
}

export type UniqueCardState = {
	faceUp?: boolean;
	cardsDraftedThisRound?: number;
	passingPlayer?: string;
	cardName?: string;
	creatureName?: string;
	creatureTypes?: string[];
	removedCards?: UniqueCard[];
	colors?: CardColor[];
};

export class UniqueCard extends Card {
	uniqueID: UniqueCardID = 0;
	foil?: boolean = false;
	state?: UniqueCardState;
	slot?: string;
}

// JSON can't use numbers as keys, we have to use a string and not ArenaID here.
export type PlainCollection = { [aid: string]: number };

export function hasEffect(card: Card, effect: DraftEffectType): boolean {
	if (!card.draft_effects) return false;
	for (const e of card.draft_effects) if (e.type === effect) return true;
	return false;
}

import { CardColor, OracleID } from "@/CardTypes";

export const MaxCardsPerRequest = 75; // Scryfall API accepts requests for maximum 75 cards at once.

export type ScryfallRelatedCard = {
	id: string;
	object: "related_card";
	component: string;
	name: string;
	type_line: string;
	uri: string;
};

export function isScryfallRelatedCard(obj: unknown): obj is ScryfallRelatedCard {
	return (
		obj !== undefined && obj !== null && typeof obj === "object" && "object" in obj && obj.object === "related_card"
	);
}

export type ImageURIs = {
	thumb?: string;
	grid?: string;
	display?: string;
	art?: string;
	crop?: string;
	// Deprecated
	small?: string;
	normal?: string;
	large?: string;
	png?: string;
	art_crop?: string;
	border_crop?: string;
	jpeg?: string;
};

export type ScryfallCardFace = {
	artist?: string;
	cmc?: number;
	color_indicator?: CardColor[];
	colors?: CardColor[];
	flavor_text?: string;
	illustration_id?: string;
	image_uris?: ImageURIs;
	layout?: string;
	loyalty?: string;
	mana_cost: string;
	name: string;
	object: "card_face";
	oracle_id?: OracleID;
	oracle_text?: string;
	power?: string;
	printed_name?: string;
	printed_text?: string;
	printed_type_line?: string;
	toughness?: string;
	type_line?: string;
	watermark?: string;
};

export function isScryfallCardFace(obj: unknown): obj is ScryfallCardFace {
	return (
		obj !== undefined && obj !== null && typeof obj === "object" && "object" in obj && obj.object === "card_face"
	);
}

export type ScryfallCard = {
	arena_id?: number;
	id: string;
	lang: string;
	mtgo_id?: number;
	mtgo_foil_id?: number;
	multiverse_ids?: number[];
	tcgplayer_id?: number;
	tcgplayer_etched_id?: number;
	cardmarket_id?: number;
	object: "card";
	oracle_id: string;
	prints_search_uri: string;
	rulings_uri: string;
	scryfall_uri: string;
	uri: string;

	all_parts: ScryfallRelatedCard[];
	card_faces: ScryfallCardFace[];
	cmc: number;
	color_identity: CardColor[];
	color_indicator?: CardColor[];
	colors?: CardColor[];
	edhrec_rank?: number;
	hand_modifier?: string;
	keywords: string[];
	layout: string;
	legalities: { [format: string]: "legal" | "not_legal" | "restricted" | "banned" };
	life_modifier?: string;
	loyalty?: string;
	mana_cost?: string;
	name: string;
	oracle_text?: string;
	oversized: boolean;
	penny_rank?: number;
	power?: string;
	produced_mana?: CardColor[];
	reserved?: boolean;
	toughness?: string;
	type_line: string;

	artist?: string;
	attraction_lights: [];
	booster: boolean;
	border_color: "black" | "white" | "borderless" | "silver" | "gold";
	card_back_id: string;
	collector_number: string;
	content_warning?: boolean;
	digital: boolean;
	finishes: ("foil" | "nonfoil" | "etched")[];
	flavor_name?: string;
	flavor_text?: string;
	frame_effects?: string[];
	frame: string;
	full_art: boolean;
	games: string[];
	highres_image: boolean;
	illustration_id?: string;
	image_status: string;
	image_uris?: ImageURIs;
	prices: { [currency: string]: string };
	printed_name?: string;
	printed_text?: string;
	printed_type_line?: string;
	promo: boolean;
	promo_types: string[];
	purchase_uris: { [marketplace: string]: string };
	rarity: "common" | "uncommon" | "rare" | "special" | "mythic" | "bonus";
	related_uris: { [type: string]: string };
	released_at: string;
	reprint: boolean;
	scryfall_set_uri: string;
	set_name: string;
	set_search_uri: string;
	set_type: string;
	set_uri: string;
	set: string;
	story_spotlight: boolean;
	textless: boolean;
	variation: boolean;
	variation_of?: string;
	security_stamp?: string;
	watermark?: string;
	"preview.previewed_at": string;
	"preview.source_uri": string;
	"preview.source": string;
};

export function isScryfallCard(obj: unknown): obj is ScryfallCard {
	return obj !== undefined && obj !== null && typeof obj === "object" && "object" in obj && obj.object === "card";
}

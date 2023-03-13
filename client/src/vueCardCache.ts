import Vue from "vue";
import axios, { AxiosResponse } from "axios";
import { CardID, CardColor, OracleID } from "../../src/CardTypes";

export type ScryfallRelatedCard = {
	id: string;
	object: "related_card";
	component: string;
	name: string;
	type_line: string;
	uri: string;
};

export function isScryfallRelatedCard(obj: any): obj is ScryfallRelatedCard {
	return obj?.object === "related_card";
}

export type ScryfallCardFace = {
	artist?: string;
	cmc?: number;
	color_indicator?: CardColor[];
	colors?: CardColor[];
	flavor_text?: string;
	illustration_id?: string;
	image_uris?: {
		small?: string;
		normal?: string;
		large?: string;
		png?: string;
		art_crop?: string;
		border_crop?: string;
	};
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

export function isScryfallCardFace(obj: any): obj is ScryfallCardFace {
	return obj?.object === "card_face";
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
	image_uris?: {
		small?: string;
		normal?: string;
		large?: string;
		png?: string;
		art_crop?: string;
		border_crop?: string;
	};
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

export function isScryfallCard(obj: any): obj is ScryfallCard {
	return obj?.object === "card";
}

export type CardCacheEntry = { id: CardID; status: string } | (ScryfallCard & { status: "ready" });

export function isReady(entry: CardCacheEntry): entry is ScryfallCard & { status: "ready" } {
	return entry?.status === "ready";
}

const cardCachePlugin = new Vue({
	data() {
		const r: {
			cardCache: { [cardID: CardID]: CardCacheEntry };
		} = { cardCache: {} };
		return r;
	},
	methods: {
		request(cardID: CardID) {
			// Note: This will always request the english version of the card data, regardless of the language prop.,
			//	   but the all_parts (related cards) property doesn't seem to exist on translated cards anyway.
			//     We could search for the translated cards from their english ID, but I'm not sure if that's worth it,
			//     especially since I strongly suspect most of them won't be in Scryfall DB at all.
			if (!this.cardCache[cardID]) {
				this.$set(this.cardCache, cardID, { id: cardID, status: "pending" });
				return axios
					.get(`https://api.scryfall.com/cards/${cardID}`, { timeout: 5000 })
					.then((response) => {
						if (response.status === 200) {
							response.data.status = "ready";
							this.$set(this.cardCache, cardID, response.data);
						} else this.$set(this.cardCache, cardID, undefined);
					})
					.catch((error) => {
						console.error("Error fetching card data:", error);
						this.$set(this.cardCache, cardID, undefined);
					});
			}
			return null;
		},
		requestBulk(cardIDs: CardID[]): Promise<any[]> | null {
			cardIDs = cardIDs.filter((cid) => !this.cardCache[cid]); // Request only missing cards
			if (cardIDs.length === 0) return null;
			let promises = [];
			// Scryfall API accepts requests for maximum 75 cards at once.
			if (cardIDs.length > 75) {
				let rest = cardIDs.slice(75);
				promises.push(this.requestBulk(rest));
				cardIDs = cardIDs.slice(0, 75);
			}
			let identifiers = [];
			for (let cid of cardIDs) {
				identifiers.push({ id: cid });
				this.$set(this.cardCache, cid, { id: cid, status: "pending" });
			}
			promises.push(
				axios
					.post(`https://api.scryfall.com/cards/collection`, { identifiers }, { timeout: 10000 })
					.then((response) => {
						if (response.status === 200) {
							for (let card of response.data.data) {
								card.status = "ready";
								this.$set(this.cardCache, card.id, card);
							}
						}
						for (let cid of cardIDs)
							if (this.cardCache[cid].status !== "ready") this.$set(this.cardCache, cid, undefined);
					})
					.catch((error) => {
						console.error("Error fetching card data:", error);
						for (let cid of cardIDs) this.$set(this.cardCache, cid, undefined);
					})
			);
			return Promise.all(promises);
		},
		get(cardID: CardID) {
			this.request(cardID);
			return this.cardCache[cardID];
		},
		add(card: ScryfallCard) {
			this.$set(this.cardCache, card.id, card);
		},
	},
});

declare module "vue" {
	interface Vue {
		$cardCache: {
			get: (cardID: CardID) => CardCacheEntry;
			add: (card: ScryfallCard) => void;
			request: (cardID: CardID) => Promise<AxiosResponse> | null;
		};
	}
}

export default cardCachePlugin;

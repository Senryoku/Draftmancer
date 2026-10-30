import axios from "axios";
import { Card, CardID, CardColor, OracleID } from "@/CardTypes";
import { ref, App } from "vue";

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

export type CardCacheEntry = { id: CardID; status: "pending" } | (ScryfallCard & { status: "ready" });

export function isReady(entry: CardCacheEntry): entry is ScryfallCard & { status: "ready" } {
	return entry?.status === "ready";
}

const cardCachePlugin = {
	cardCache: ref({} as { [cardID: CardID]: CardCacheEntry }),
	request(cardID: CardID) {
		// Note: This will always request the english version of the card data, regardless of the language prop.,
		//	   but the all_parts (related cards) property doesn't seem to exist on translated cards anyway.
		//     We could search for the translated cards from their english ID, but I'm not sure if that's worth it,
		//     especially since I strongly suspect most of them won't be in Scryfall DB at all.
		if (!this.cardCache.value[cardID]) {
			this.cardCache.value[cardID] = { id: cardID, status: "pending" };
			return axios
				.get(`https://api.scryfall.com/cards/${cardID}`, { timeout: 5000 })
				.then((response) => {
					if (response.status === 200) {
						response.data.status = "ready";
						this.cardCache.value[cardID] = response.data;
					} else delete this.cardCache.value[cardID];
				})
				.catch((error) => {
					console.error("Error fetching card data:", error);
					delete this.cardCache.value[cardID];
				});
		}
		return null;
	},
	requestBulk(cardIDs: CardID[]): Promise<boolean> {
		const missingCardsIDs = cardIDs.filter((cid) => !this.cardCache.value[cid]); // Request only missing cards
		if (missingCardsIDs.length === 0) return Promise.resolve(true);
		const promises = [];
		const maxCards = 75; // Scryfall API accepts requests for maximum 75 cards at once.
		for (let idx = 0; idx < missingCardsIDs.length; idx += maxCards) {
			const requestCardIDs = missingCardsIDs.slice(idx, idx + maxCards);
			const identifiers = [];
			for (const cid of requestCardIDs) {
				identifiers.push({ id: cid });
				this.cardCache.value[cid] = { id: cid, status: "pending" };
			}
			promises.push(
				axios
					.post(`https://api.scryfall.com/cards/collection`, { identifiers }, { timeout: 10000 })
					.then((response) => {
						if (response.status === 200) {
							for (const card of response.data.data) {
								card.status = "ready";
								this.cardCache.value[card.id] = card;
							}
						}
						for (const cid of requestCardIDs)
							if (this.cardCache.value[cid].status !== "ready") delete this.cardCache.value[cid];
						return true;
					})
					.catch((error) => {
						console.error("Error fetching card data:", error);
						for (const cid of requestCardIDs) delete this.cardCache.value[cid];
						return false;
					})
			);
		}
		return Promise.all(promises).then((results) => results.every((r) => r));
	},
	get(cardID: CardID) {
		this.request(cardID);
		return this.cardCache.value[cardID];
	},
	add(card: ScryfallCard) {
		this.cardCache.value[card.id] = { ...card, status: "ready" };
	},
	install(app: App) {
		app.config.globalProperties.$cardCache = cardCachePlugin;
	},
};

export const useCardCache = () => ({ cardCache: cardCachePlugin });

declare module "vue" {
	interface ComponentCustomProperties {
		$cardCache: typeof cardCachePlugin;
	}
}

export default cardCachePlugin;

export type DefaultPrint = { id: CardID; image: string; backImage?: string } | null;

type DefaultPrintIdentifier = { name: string; set: string };

const defaultPrints = ref<Record<string, DefaultPrint>>({});
const queuedDefaultPrints = new Map<string, DefaultPrintIdentifier>();
const requestedDefaultPrintKeys = new Set<string>();
let defaultPrintsFlushScheduled = false;

export const getDefaultPrint = (card: Card): DefaultPrint | undefined => {
	const identifier = { name: frontFaceName(card.name), set: card.set };
	const key = defaultPrintKey(identifier);
	if (!(key in defaultPrints.value)) {
		queueDefaultPrint(key, identifier);
	}
	return defaultPrints.value[key];
};

function queueDefaultPrint(key: string, identifier: DefaultPrintIdentifier) {
	if (requestedDefaultPrintKeys.has(key)) {
		return;
	}
	requestedDefaultPrintKeys.add(key);
	queuedDefaultPrints.set(key, identifier);
	if (!defaultPrintsFlushScheduled) {
		defaultPrintsFlushScheduled = true;
		setTimeout(flushQueuedDefaultPrints, 50);
	}
}

async function flushQueuedDefaultPrints() {
	const maxCards = 75;
	const delayBetweenRequests = 500;
	while (queuedDefaultPrints.size > 0) {
		const batch = [...queuedDefaultPrints.values()].slice(0, maxCards);
		for (const identifier of batch) {
			queuedDefaultPrints.delete(defaultPrintKey(identifier));
		}
		await requestDefaultPrints(batch);
		if (queuedDefaultPrints.size > 0) {
			await new Promise((resolve) => setTimeout(resolve, delayBetweenRequests));
		}
	}
	defaultPrintsFlushScheduled = false;
}

async function requestDefaultPrints(identifiers: DefaultPrintIdentifier[]) {
	try {
		const response = await axios.post(
			`https://api.scryfall.com/cards/collection`,
			{ identifiers },
			{ timeout: 10000 }
		);
		for (const card of response.data.data as ScryfallCard[]) {
			const key = defaultPrintKey({ name: frontFaceName(card.name), set: card.set });
			defaultPrints.value[key] = toDefaultPrint(card);
		}
		for (const identifier of response.data.not_found as DefaultPrintIdentifier[]) {
			defaultPrints.value[defaultPrintKey(identifier)] = null;
		}
	} catch (error) {
		console.error("Error fetching default prints:", error);
	}
}

function toDefaultPrint(card: ScryfallCard): DefaultPrint {
	const image = card.image_uris?.border_crop ?? card.card_faces?.[0]?.image_uris?.border_crop;
	if (!image) {
		return null;
	}
	return { id: card.id, image, backImage: card.card_faces?.[1]?.image_uris?.border_crop };
}

function defaultPrintKey(identifier: DefaultPrintIdentifier) {
	return `${identifier.set}:${identifier.name}`.toLowerCase();
}

function frontFaceName(name: string) {
	return name.split(" //")[0];
}

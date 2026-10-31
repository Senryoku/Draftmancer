import axios from "axios";
import { CardID } from "@/CardTypes";
import { ref, App } from "vue";
import { MaxCardsPerRequest, ScryfallCard } from "./Scryfall";

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
		for (let idx = 0; idx < missingCardsIDs.length; idx += MaxCardsPerRequest) {
			const requestCardIDs = missingCardsIDs.slice(idx, idx + MaxCardsPerRequest);
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

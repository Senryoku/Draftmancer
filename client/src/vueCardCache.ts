import Vue from "vue";
import axios from "axios";
import { CardID } from "../../src/CardTypes";

declare module "vue/types/vue" {
	interface Vue {
		$cardCache: { [cardID: CardID]: any };
	}
}

const cardCachePlugin = new Vue({
	data() {
		const r: { cardCache: { [cardID: CardID]: any } } = { cardCache: {} };
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
	},
});

cardCachePlugin.install = function () {
	Object.defineProperty(Vue.prototype, "$cardCache", {
		get() {
			return cardCachePlugin;
		},
	});
};

export default cardCachePlugin;

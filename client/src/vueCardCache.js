import Vue from "vue";
import axios from "axios";

const cardCachePlugin = new Vue({
	data: { cardCache: {} },
	methods: {
		request(cardID) {
			// Note: This will always request the english version of the card data, regardless of the language prop.,
			//	   but the all_parts (related cards) property doesn't seem to exist on translated cards anyway.
			//     We could search for the translated cards from their english ID, but I'm not sure if that's worth it,
			//     especially since I strongly suspect most of them won't be in Scryfall DB at all.
			if (!this.cardCache[cardID]) {
				this.$set(this.cardCache, cardID, { id: cardID, status: "pending" });
				return axios
					.get(`https://api.scryfall.com/cards/${cardID}`)
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
		requestBulk(cardIDs) {
			cardIDs = cardIDs.filter((cid) => !this.cardCache[cid]); // Request only missing cards
			if (cardIDs.length === 0) return;
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
					.post(`https://api.scryfall.com/cards/collection`, { identifiers })
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
		get(cardID) {
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

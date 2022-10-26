import Vue from "vue";
import App from "./App.vue";
import axios from "axios";
import FloatingVue from "floating-vue";
import "floating-vue/dist/style.css";

Vue.config.productionTip = false;

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
					});
			}
			return null;
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

Vue.use(cardCachePlugin);
Vue.use(FloatingVue, {
	placement: "bottom-start",
	boundariesElement: "window",
	delay: 250,
});

const app = new Vue({
	render: (h) => h(App),
});
app.$mount("#main-vue");

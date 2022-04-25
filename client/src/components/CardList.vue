<template>
	<div v-if="isValid" class="card-list">
		Loaded {{ cardlist.name ? cardlist.name : "list" }} with {{ cardlist.length }} cards.
		<span v-if="missing && missing.total > 0">
			<i class="fas fa-exclamation-triangle yellow"></i>
			{{ missing.total }} are missing from your collection ({{ missingText }})
		</span>
		<button @click="download">Download List</button>
		<template v-if="cardlist.customSheets">
			<div v-for="(slot, key) in cardlist.cards" :key="key">
				<h2>{{ key }} ({{ cardlist.cardsPerBooster[key] }})</h2>
				<div v-for="(row, rowIndex) in rowsBySlot[key]" :key="'row' + rowIndex" class="category-wrapper">
					<card-list-column
						v-for="(column, colIndex) in row"
						:key="'col' + colIndex"
						:column="column"
						:checkcollection="checkCollection"
						:collection="collection"
						:language="language"
					></card-list-column>
				</div>
			</div>
		</template>
		<template v-else>
			<div v-for="(row, rowIndex) in rows" :key="'row' + rowIndex" class="category-wrapper">
				<card-list-column
					v-for="(column, colIndex) in row"
					:key="'col' + colIndex"
					:column="column"
					:checkcollection="checkCollection"
					:collection="collection"
					:language="language"
				></card-list-column>
			</div>
		</template>
	</div>
	<div v-else>No card list loaded.</div>
</template>

<script>
import { download, isEmpty } from "../helper.js";
import CardOrder from "../cardorder.js";
import CardListColumn from "./CardListColumn.vue";

export default {
	components: { CardListColumn },
	props: {
		cardlist: { type: Object, required: true },
		language: { type: String, required: true },
		collection: { type: Object },
	},
	data() {
		return { cards: null };
	},
	mounted() {
		// Could be useful to cache this, but also quite annoying to keep it in sync with the cardlist.
		this.getCards();
	},
	computed: {
		isValid() {
			return this.cardlist && this.cardlist.length;
		},
		rows() {
			if (this.cardlist.customSheets || !this.cards) return [];
			return this.rowsByColor(this.cards);
		},
		rowsBySlot() {
			if (!this.cardlist.customSheets || !this.cards) return [];
			let rowsBySlot = {};
			for (let slot in this.cardlist.cards) rowsBySlot[slot] = this.rowsByColor(this.cards[slot]);
			return rowsBySlot;
		},
		checkCollection() {
			return !isEmpty(this.collection);
		},
		missing() {
			if (!this.checkCollection || !this.cards) return null;
			let missing = { total: 0, common: 0, uncommon: 0, rare: 0, mythic: 0 };
			const count = arr => {
				for (let c of arr)
					if (!(c.arena_id in this.collection)) {
						missing.total += 1;
						missing[c.rarity] += 1;
					}
			};
			if (this.cardlist.customSheets) for (let slot in this.cards) count(this.cards[slot]);
			else count(this.cards);
			return missing;
		},
		missingText() {
			return ["common", "uncommon", "rare", "mythic"].map(r => `${this.missing[r]} ${r}s`).join(", ");
		},
	},
	methods: {
		download() {
			if (!this.cards) return;
			let str = "";
			if (this.cardlist.customCards) {
				str += "[CustomCards]\n";
				str += JSON.stringify(this.cardlist.customCards, null, 2);
				str += "\n";
			}
			if (this.cardlist.customSheets) {
				for (let slot in this.cardlist.cards) {
					str += `[${slot}(${this.cardlist.cardsPerBooster[slot]})]\n`;
					for (let card of this.cards[slot]) {
						str += card.name + "\n";
					}
				}
			} else {
				for (let card of this.cards) {
					str += card.name + "\n";
				}
			}
			download("Cube.txt", str);
		},
		rowsByColor(cards) {
			if (!cards) return [];
			let a = cards.reduce(
				(acc, item) => {
					const c = item.colors;
					if (c in acc[0]) {
						acc[0][c].push(item);
					} else {
						if (!acc[1][c]) acc[1][c] = [];
						acc[1][c].push(item);
					}
					return acc;
				},
				[{ "": [], W: [], U: [], B: [], R: [], G: [] }, {}]
			);
			for (let row of a) for (let col in row) CardOrder.orderByArenaInPlace(row[col]);
			return a;
		},
		async getCards() {
			if (!this.cardlist || !this.cardlist.cards) return;
			let cards = [];
			let tofetch = [];
			if (this.cardlist.customCards) {
				if (this.cardlist.customSheets) {
					cards = {};
					tofetch = {};
					for (let slot in this.cardlist.cards) {
						cards[slot] = [];
						tofetch[slot] = [];
						for (let cid of this.cardlist.cards[slot]) {
							if (this.cardlist.customCards && cid in this.cardlist.customCards)
								cards[slot].push(this.cardlist.customCards[cid]);
							else tofetch[slot].push(cid);
						}
					}
				} else {
					for (let cid of this.cardlist.cards) {
						if (this.cardlist.customCards && cid in this.cardlist.customCards)
							cards.push(this.cardlist.customCards[cid]);
						else tofetch.push(cid);
					}
				}
			} else {
				tofetch = this.cardlist.cards;
			}
			const response = await fetch("/getCards", {
				method: "POST",
				mode: "cors",
				cache: "no-cache",
				credentials: "same-origin",
				headers: {
					"Content-Type": "application/json",
				},
				redirect: "follow",
				referrerPolicy: "no-referrer",
				body: JSON.stringify(tofetch),
			});
			const fetchedCards = await response.json();
			if (this.cardlist.customSheets) {
				for (let slot in this.cardlist.cards) if (fetchedCards[slot]) cards[slot].push(...fetchedCards[slot]);
			} else {
				cards.push(...fetchedCards);
			}
			this.cards = cards;
		},
	},
};
</script>

<style scoped>
.card-list {
	margin-left: 3em;
	margin-right: 3em;
}

.category-wrapper {
	display: flex;
	flex-wrap: wrap;
	justify-content: space-evenly;
}

.category-wrapper > .card-column {
	margin-right: 1em;
}

.card-wrapper {
	position: relative;
	margin: 0;
}
</style>

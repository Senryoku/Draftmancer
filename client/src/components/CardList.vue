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
	data: function () {
		return { cards: null };
	},
	mounted: function () {
		this.getCards();
	},
	computed: {
		isValid: function () {
			return this.cardlist && this.cardlist.length;
		},
		rows: function () {
			if (this.cardlist.customSheets) return [];
			return this.rowsByColor(this.cards);
		},
		rowsBySlot: function () {
			if (!this.cardlist.customSheets) return [];
			let rowsBySlot = {};
			for (let slot in this.cardlist.cards) {
				rowsBySlot[slot] = this.rowsByColor(this.cards); // FIXME
			}
			return rowsBySlot;
		},
		checkCollection: function () {
			return !isEmpty(this.collection);
		},
		missing: function () {
			if (!this.checkCollection || !this.cards) return null;
			let missing = { total: 0, common: 0, uncommon: 0, rare: 0, mythic: 0 };
			for (let c of this.cards) {
				if (!(c.arena_id in this.collection)) {
					missing.total += 1;
					missing[c.rarity] += 1;
				}
			}
			return missing;
		},
		missingText: function () {
			return ["common", "uncommon", "rare", "mythic"].map((r) => `${this.missing[r]} ${r}s`).join(", ");
		},
	},
	methods: {
		download: function () {
			let str = "";
			if (this.cardlist.customSheets) {
				for (let slot in this.cardlist.cards) {
					str += `[${slot}(${this.cardlist.cardsPerBooster[slot]})]\n`;
					for (let c of this.cardlist.cards[slot]) {
						str += c.name + "\n";
					}
				}
			} else {
				for (let c of this.cardlist.cards) {
					str += c.name + "\n";
				}
			}
			download("Cube.txt", str);
		},
		rowsByColor: function (cards) {
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
		getCards: async function () {
			console.log("GetCards");
			if (!this.cardlist || !this.cardlist.cards) return;
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
				body: JSON.stringify(this.cardlist.cards),
			});
			console.log(response);
			this.cards = await response.json();
			console.log(this.cards);
		},
	},
	watch: {
		cardlist: {
			deep: true,
			handler: "getCards",
		},
	},
};
</script>

<style>
.card-list {
	margin-left: 3em;
	margin-right: 3em;
}

.category-wrapper {
	column-count: 6;
	column-gap: 1rem;
	margin-bottom: 300px;
}

.card-wrapper {
	position: relative;
	margin: 0;
}

.collection-warning {
	position: absolute;
	top: 0.55em;
	left: -0.25em;
	z-index: 1;
}
</style>

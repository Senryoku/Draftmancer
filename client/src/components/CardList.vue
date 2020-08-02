<template>
	<div v-if="isValid">
		Loaded {{ cardlist.name ? cardlist.name : "list" }} with {{ cardlist.length }} cards.
		<span
			v-if="missing && missing.total > 0"
		>
			<i class="fas fa-exclamation-triangle yellow"></i>
			{{ missing.total }} are missing from your collection ({{ missingText }})
		</span>
		<button @click="download">Download List</button>
		<template v-if="cardlist.customSheets">
			<div v-for="(slot, key) in cardlist.cards" :key="key">
				<h2>{{ key }} ({{ cardlist.cardsPerBooster[key] }})</h2>
				<div
					v-for="(row, rowIndex) in rowsBySlot[key]"
					:key="'row' + rowIndex"
					class="category-wrapper"
				>
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
import { Cards } from "./../Cards.js";
import CardOrder from "../cardorder.js";
import CardListColumn from "./CardListColumn.vue";

export default {
	components: { CardListColumn },
	props: {
		cardlist: { type: Object, required: true },
		language: { type: String, required: true },
		collection: { type: Object },
	},
	computed: {
		isValid: function () {
			return this.cardlist && this.cardlist.length;
		},
		rows: function () {
			if (this.cardlist.customSheets) return [];
			return this.rowsByColor(this.cardlist.cards.map((cid) => Cards[cid]));
		},
		rowsBySlot: function () {
			if (!this.cardlist.customSheets) return [];
			let rowsBySlot = {};
			for (let slot in this.cardlist.cards) {
				rowsBySlot[slot] = this.rowsByColor(this.cardlist.cards[slot].map((cid) => Cards[cid]));
			}
			return rowsBySlot;
		},
		checkCollection: function () {
			return !isEmpty(this.collection);
		},
		missing: function () {
			if (!this.checkCollection) return null;
			let missing = { total: 0, common: 0, uncommon: 0, rare: 0, mythic: 0 };
			for (let cid of this.flatCardList) {
				if (!(cid in this.collection)) {
					missing.total += 1;
					missing[Cards[cid].rarity] += 1;
				}
			}
			return missing;
		},
		missingText: function () {
			return ["common", "uncommon", "rare", "mythic"].map((r) => `${this.missing[r]} ${r}s`).join(", ");
		},
		flatCardList: function () {
			return this.cardlist.customSheets
				? Object.values(this.cardlist.cards).reduce((acc, val) => acc.concat(val), [])
				: this.cardlist.cards;
		},
	},
	methods: {
		download: function () {
			let str = "";
			if (this.cardlist.customSheets) {
				for (let slot in this.cardlist.cards) {
					str += `[${slot}(${this.cardlist.cardsPerBooster[slot]})]\n`;
					for (let cid of this.cardlist.cards[slot]) {
						str += Cards[cid].name + "\n";
					}
				}
			} else {
				for (let cid of this.cardlist.cards) {
					str += Cards[cid].name + "\n";
				}
			}
			download("Cube.txt", str);
		},
		rowsByColor: function (cards) {
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
	},
};
</script>

<style>
.category-wrapper {
	column-count: 6;
	column-gap: 1rem;
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

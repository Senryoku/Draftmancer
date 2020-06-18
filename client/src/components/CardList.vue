<template>
	<div v-if="isValid">
		Loaded list with {{ cardlist.length }} cards.
		<span v-if="missing && missing.total > 0">
			<i class="fas fa-exclamation-triangle yellow"></i> {{ missing.total }} are missing from your collection ({{
				missingText
			}})
		</span>
		<button @click="download">Download List</button>
		<template v-if="cardlist.customSheets">
			<div v-for="(slot, key) in cardlist.cards" :key="key">
				<h2>{{ key }} ({{ cardlist.cardsPerBooster[key] }})</h2>
				<div v-for="(row, rowIndex) in rowsBySlot[key]" :key="'row' + rowIndex" class="category-wrapper">
					<card-column v-for="(column, colIndex) in row" :key="'col' + colIndex" :column="column">
					</card-column>
				</div>
			</div>
		</template>
		<template v-else>
			<div v-for="(row, rowIndex) in rows" :key="'row' + rowIndex" class="category-wrapper">
				<card-column v-for="(column, colIndex) in row" :key="'col' + colIndex" :column="column"> </card-column>
			</div>
		</template>
	</div>
	<div v-else>
		No card list loaded.
	</div>
</template>

<script>
import Vue from "vue";
import { download } from "../helper.js";
import CardImage from "./CardImage.vue";

const CardColumn = Vue.component("CardColumn", {
	props: {
		column: { type: Object, required: true },
	},
	components: { CardImage },
	data: function() {
		return {
			count: 0,
		};
	},
	template: `
<div class="card-column" v-show="column.length > 0">
	<div v-for="(card, index) in column" :key="index" class="card card-wrapper">
		<div v-if="$root.hasCollection && !(card.id in $root.collection)" class="collection-warning">
			<i class="fas fa-exclamation-triangle yellow"></i>
		</div>
		<card-image :card="card" :language="$root.language"></card-image>
	</div>
</div>`,
});

export default {
	components: { CardColumn },
	props: {
		cardlist: { type: Object, required: true },
	},
	computed: {
		isValid: function() {
			return this.cardlist && this.cardlist.length;
		},
		rows: function() {
			if (this.cardlist.customSheets) return [];
			return this.rowsByColor(this.cardlist.cards.map(cid => this.$root.cards[cid]));
		},
		rowsBySlot: function() {
			if (!this.cardlist.customSheets) return [];
			let rowsBySlot = {};
			for (let slot in this.cardlist.cards) {
				rowsBySlot[slot] = this.rowsByColor(this.cardlist.cards[slot].map(cid => this.$root.cards[cid]));
			}
			return rowsBySlot;
		},
		missing: function() {
			if (!this.$root.hasCollection) return null;
			let missing = { total: 0, common: 0, uncommon: 0, rare: 0, mythic: 0 };
			for (let cid of this.flatCardList) {
				if (!(cid in this.$root.collection)) {
					missing.total += 1;
					missing[this.$root.cards[cid].rarity] += 1;
				}
			}
			return missing;
		},
		missingText: function() {
			return ["common", "uncommon", "rare", "mythic"].map(r => `${this.missing[r]} ${r}s`).join(", ");
		},
		flatCardList: function() {
			return this.cardlist.customSheets ? Object.values(this.cardlist.cards).flat() : this.cardlist.cards;
		},
	},
	methods: {
		download: function() {
			let str = "";
			if (this.cardlist.customSheets) {
				for (let slot in this.cardlist.cards) {
					str += `[${slot}(${this.cardlist.cardsPerBooster[slot]})]\n`;
					for (let cid of this.cardlist.cards[slot]) {
						str += this.$root.cards[cid].name + "\n";
					}
				}
			} else {
				for (let cid of this.cardlist.cards) {
					str += this.$root.cards[cid].name + "\n";
				}
			}
			download("Cube.txt", str);
		},
		rowsByColor: function(cards) {
			let a = cards.reduce(
				(acc, item) => {
					const c = item.color_identity;
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
			for (let row of a) for (let col in row) row[col] = this.$root.orderByCMC(row[col]);
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

.card-column {
	-webkit-column-break-inside: avoid;
	page-break-inside: avoid;
	break-inside: avoid;
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

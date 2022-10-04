<template>
	<div v-if="isValid" class="card-list">
		Loaded {{ cardlist.name ? cardlist.name : "list" }}.
		<span v-if="missing && missing.total > 0">
			<i class="fas fa-exclamation-triangle yellow"></i>
			{{ missing.total }} are missing from your collection ({{ missingText }})
		</span>
		<button @click="download">Download List</button>
		<template v-if="defaultLayout">
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
		<template v-else>
			<div v-if="cardlist.layouts">
				<h2>Layouts</h2>
				<div class="layouts">
					<div v-for="(value, name) in cardlist.layouts" :key="name">
						<h3>{{ name }} ({{ value.weight }})</h3>
						<div v-for="(num, slot) in value.slots" :key="slot">{{ num }} {{ slot }}</div>
					</div>
				</div>
			</div>
			<h2>Slots</h2>
			<div v-for="(slot, key) in cardlist.slots" :key="key">
				<h3>{{ key }}</h3>
				<template v-if="cards">
					<div v-for="(row, rowIndex) in rowsBySlot[key]" :key="'row' + rowIndex" class="category-wrapper">
						<card-list-column
							v-for="(column, colIndex) in row"
							:key="'col' + colIndex"
							:column="column"
							:checkcollection="checkCollection"
							:collection="collection"
							:language="language"
						></card-list-column></div
				></template>
				<template v-else>(<i class="fas fa-spinner fa-spin"></i> Loading...)</template>
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
			return this.cardlist?.slots && Object.keys(this.cardlist.slots).length > 0;
		},
		defaultLayout() {
			return !this.cardlist.layouts;
		},
		rows() {
			if (!this.defaultLayout || !this.cards || !this.cards["default"]) return [];
			return this.rowsByColor(this.cards["default"]);
		},
		rowsBySlot() {
			if (this.defaultLayout || !this.cards) return [];
			let rowsBySlot = {};
			for (let slot in this.cardlist.slots) rowsBySlot[slot] = this.rowsByColor(this.cards[slot]);
			return rowsBySlot;
		},
		checkCollection() {
			return !isEmpty(this.collection);
		},
		missing() {
			if (!this.checkCollection || !this.cards) return null;
			let missing = { total: 0, common: 0, uncommon: 0, rare: 0, mythic: 0 };
			const count = (arr) => {
				for (let c of arr)
					if (!(c.arena_id in this.collection)) {
						missing.total += 1;
						missing[c.rarity] += 1;
					}
			};
			for (let slot in this.cards) count(this.cards[slot]);
			return missing;
		},
		missingText() {
			return ["common", "uncommon", "rare", "mythic"].map((r) => `${this.missing[r]} ${r}s`).join(", ");
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
			str += `[Layouts]\n`;
			for (let layout in this.cardlist.layouts) {
				const l = this.cardlist.layouts[layout];
				str += `- ${layout} (${l.weight})\n`;
				for (let slot in l.slots) str += `  ${l.slots[slot]} ${slot}\n`;
			}
			for (let slot in this.cardlist.slots) {
				str += `[${slot}]\n`;
				for (let card in this.cardlist.slots[slot]) {
					str += `${this.cardlist.slots[slot][card]} ${this.cards[slot].find((c) => c.id === card).name}\n`;
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
			if (!this.cardlist || !this.cardlist.slots) return;
			let cards = {};
			let tofetch = {};
			for (let slot in this.cardlist.slots) {
				cards[slot] = [];
				tofetch[slot] = [];
				for (let cid in this.cardlist.slots[slot]) {
					if (this.cardlist.customCards && cid in this.cardlist.customCards)
						cards[slot].push(this.cardlist.customCards[cid]);
					else tofetch[slot].push(cid);
				}
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
			if (response.status === 200) {
				const json = await response.json();
				for (let slot in json) {
					for (let card of json[slot]) cards[slot].push(card);
				}
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

.layouts {
	display: flex;
	gap: 1em;
}
</style>

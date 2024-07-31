<template>
	<div v-if="isValid" class="card-list">
		Loaded {{ cardlist.name ? cardlist.name : "list" }}.
		<span v-if="missing && missing.total > 0">
			<font-awesome-icon icon="fa-solid fa-exclamation-triangle" class="yellow"></font-awesome-icon>
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
						></card-list-column>
					</div>
				</template>
				<template v-else>
					(<font-awesome-icon icon="fa-solid fa-spinner" spin></font-awesome-icon> Loading...)
				</template>
			</div>
		</template>
	</div>
	<div v-else>No card list loaded.</div>
</template>

<script lang="ts">
import { download, isEmpty } from "../helper";
import CardOrder from "../cardorder";
import CardListColumn from "./CardListColumn.vue";
import { Language } from "@/Types";
import { CustomCardList } from "@/CustomCardList";
import { defineComponent, PropType } from "vue";
import { Card, CardID, PlainCollection } from "@/CardTypes";

type CardWithCount = Card & { count: number };

export default defineComponent({
	components: { CardListColumn },
	props: {
		cardlist: { type: Object as PropType<CustomCardList>, required: true },
		language: { type: String as PropType<Language>, required: true },
		collection: { type: Object as PropType<PlainCollection> },
	},
	data() {
		return { cards: {} } as { cards: { [slot: string]: CardWithCount[] } };
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
			if (!this.defaultLayout || !this.cards || !this.cards[Object.keys(this.cardlist.slots)[0]]) return [];
			return this.rowsByColor(this.cards[Object.keys(this.cardlist.slots)[0]]);
		},
		rowsBySlot() {
			if (this.defaultLayout || !this.cards) return {};
			let rowsBySlot: { [slot: string]: { [s: string]: CardWithCount[] }[] } = {};
			for (let slotName in this.cardlist.slots) rowsBySlot[slotName] = this.rowsByColor(this.cards[slotName]);
			return rowsBySlot;
		},
		checkCollection() {
			return this.collection && !isEmpty(this.collection);
		},
		missing() {
			if (!this.checkCollection || !this.cards) return null;
			const missing: { [a: string]: number } = { total: 0, common: 0, uncommon: 0, rare: 0, mythic: 0 };
			const count = (arr: Card[]) => {
				for (let c of arr)
					if (!c.arena_id || !(c.arena_id in this.collection!)) {
						missing.total += 1;
						missing[c.rarity] += 1;
					}
			};
			for (let slot in this.cards) count(this.cards[slot]);
			return missing;
		},
		missingText() {
			return ["common", "uncommon", "rare", "mythic"].map((r) => `${this.missing![r]} ${r}s`).join(", ");
		},
	},
	methods: {
		download() {
			if (!this.cards) return;
			let str = "";
			if (this.cardlist.settings) {
				str += "[Settings]\n";
				str += JSON.stringify(this.cardlist.settings, null, 2);
				str += "\n";
			}
			if (this.cardlist.customCards) {
				str += "[CustomCards]\n";
				str += JSON.stringify(Object.values(this.cardlist.customCards), null, 2);
				str += "\n";
			}
			if (this.cardlist.layouts !== false) {
				str += `[Layouts]\n`;
				for (let layout in this.cardlist.layouts) {
					const l = this.cardlist.layouts[layout];
					str += `- ${layout} (${l.weight})\n`;
					for (let slot in l.slots) str += `  ${l.slots[slot]} ${slot}\n`;
				}
			}
			for (let [slotName, slot] of Object.entries(this.cardlist.slots)) {
				let slotSettings = "";
				if (slot.collation) {
					slotSettings = ` {"collation":"${slot.collation}"}`;
				}
				str += `[${slotName}${slotSettings}]\n`;
				for (let [cardID, count] of Object.entries(slot.cards)) {
					str += `${count} ${this.cards[slotName].find((c) => c.id === cardID)!.name}\n`;
				}
			}
			download(this.cardlist.name ?? "Cube" + ".txt", str);
		},
		rowsByColor(cards: CardWithCount[]) {
			if (!cards) return [];
			let a = cards.reduce(
				(acc, item) => {
					const c: string = item.colors.sort().join();
					if (c in acc[0]) {
						acc[0][c].push(item);
					} else {
						if (!acc[1][c]) acc[1][c] = [];
						acc[1][c].push(item);
					}
					return acc;
				},
				[{ "": [], W: [], U: [], B: [], R: [], G: [] } as { [s: string]: CardWithCount[] }, {}]
			);
			for (let row of a) for (let col in row) CardOrder.orderByArenaInPlace(row[col]);
			return a;
		},
		async getCards() {
			if (!this.cardlist || !this.cardlist.slots) return;
			let cards: typeof this.cards = {};
			let tofetch: { [slot: string]: CardID[] } = {};
			for (let slotName in this.cardlist.slots) {
				cards[slotName] = [];
				tofetch[slotName] = [];
				for (let [cid, count] of Object.entries(this.cardlist.slots[slotName].cards)) {
					if (this.cardlist.customCards && cid in this.cardlist.customCards)
						cards[slotName].push({
							...this.cardlist.customCards[cid],
							count: count,
						});
					else tofetch[slotName].push(cid);
				}
			}

			if (!isEmpty(tofetch)) {
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
						for (let card of json[slot]) {
							cards[slot].push(card);
							card.count = this.cardlist.slots[slot].cards[card.id];
						}
					}
				}
			}

			this.cards = cards;
		},
	},
});
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

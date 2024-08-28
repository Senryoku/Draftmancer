<template>
	<div v-if="isValid" class="card-list">
		Loaded {{ cardlist.name ? cardlist.name : "list" }}.
		<span v-if="missing && missing.total > 0">
			<font-awesome-icon icon="fa-solid fa-exclamation-triangle" class="yellow"></font-awesome-icon>
			{{ missing.total }} are missing from your collection ({{ missingText }})
		</span>
		<button @click="downloadList">Download List</button>
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

<script setup lang="ts">
import { download, isEmpty } from "../helper";
import CardOrder from "../cardorder";
import CardListColumn from "./CardListColumn.vue";
import { Language } from "@/Types";
import { CustomCardList } from "@/CustomCardList";
import { ref, computed, onMounted, toRaw } from "vue";
import { Card, CardID, PlainCollection } from "@/CardTypes";

type CardWithCount = Card & { count: number };

const props = withDefaults(
	defineProps<{
		cardlist: CustomCardList;
		language: Language;
		collection?: PlainCollection;
	}>(),
	{ collection: undefined }
);

const cards = ref<{ [slot: string]: CardWithCount[] }>({});

onMounted(() => {
	// Could be useful to cache this, but also quite annoying to keep it in sync with the cardlist.
	getCards();
});

const isValid = computed(() => {
	return props.cardlist?.slots && Object.keys(props.cardlist.slots).length > 0;
});

const defaultLayout = computed(() => {
	return !props.cardlist.layouts;
});

const rows = computed(() => {
	if (!defaultLayout.value || !cards.value[Object.keys(props.cardlist.slots)[0]]) return [];
	return rowsByColor(cards.value[Object.keys(props.cardlist.slots)[0]]);
});

const rowsBySlot = computed(() => {
	if (defaultLayout.value || !cards.value) return {};
	let rowsBySlot: { [slot: string]: { [s: string]: CardWithCount[] }[] } = {};
	for (let slotName in props.cardlist.slots) rowsBySlot[slotName] = rowsByColor(cards.value[slotName]);
	return rowsBySlot;
});

const checkCollection = computed(() => {
	return props.collection !== undefined && !isEmpty(props.collection);
});

const missing = computed(() => {
	if (!checkCollection.value || !cards.value) return null;

	const missing: { [a: string]: number } = { total: 0, common: 0, uncommon: 0, rare: 0, mythic: 0 };
	const count = (arr: Card[]) => {
		for (let c of arr)
			if (!c.arena_id || !(c.arena_id in props.collection!)) {
				missing.total += 1;
				missing[c.rarity] += 1;
			}
	};
	for (let slot of Object.values(cards.value)) count(slot);
	return missing;
});

const missingText = computed(() => {
	if (!missing.value) return "";
	return ["common", "uncommon", "rare", "mythic"].map((r) => `${missing.value![r]} ${r}s`).join(", ");
});

function downloadList() {
	if (!cards.value) return;
	let str = "";
	const settings: Record<string, unknown> = structuredClone(toRaw(props.cardlist.settings) ?? {});
	if (props.cardlist.layouts !== false) {
		settings.layouts = props.cardlist.layouts;
	}
	str += "[Settings]\n";
	str += JSON.stringify(settings, null, 2);
	str += "\n";
	if (props.cardlist.customCards) {
		str += "[CustomCards]\n";
		str += JSON.stringify(Object.values(props.cardlist.customCards), null, 2);
		str += "\n";
	}
	for (let [slotName, slot] of Object.entries(props.cardlist.slots)) {
		let slotSettings = "";
		if (slot.collation) {
			slotSettings = ` {"collation":"${slot.collation}"}`;
		}
		str += `[${slotName}${slotSettings}]\n`;
		if (slot.collation === "printRun") {
			for (let cardID of slot.printRun) {
				const card = cards.value[slotName].find((c) => c.id === cardID)!;
				str += `${card.name} (${card.set.toUpperCase()}) ${card.collector_number}\n`;
			}
		} else {
			for (let [cardID, count] of Object.entries(slot.cards)) {
				const card = cards.value[slotName].find((c) => c.id === cardID)!;
				str += `${count} ${card.name} (${card.set.toUpperCase()}) ${card.collector_number}\n`;
			}
		}
	}
	download(props.cardlist.name ?? "Cube" + ".txt", str);
}

function rowsByColor(cards: CardWithCount[]) {
	if (!cards) return [];
	let a = cards.reduce(
		(acc, item) => {
			const c: string = item.colors.sort().join();
			if (c.length <= 1) {
				acc[0][c].push(item);
			} else {
				if (!acc[c.length - 1]) acc[c.length - 1] = {};
				if (!acc[c.length - 1][c]) acc[c.length - 1][c] = [];
				acc[c.length - 1][c].push(item);
			}
			return acc;
		},
		[{ W: [], U: [], B: [], R: [], G: [], "": [] } as { [s: string]: CardWithCount[] }, {}]
	);
	for (let row of a) for (let col in row) CardOrder.orderByArenaInPlace(row[col]);
	return a;
}

async function getCards() {
	if (!props.cardlist || !props.cardlist.slots) return;
	let tmpCards: typeof cards.value = {};
	let tofetch: { [slot: string]: CardID[] } = {};
	for (let [slotName, slot] of Object.entries(props.cardlist.slots)) {
		tmpCards[slotName] = [];
		tofetch[slotName] = [];
		if (slot.collation === "printRun") {
			for (let cid of slot.printRun) {
				if (props.cardlist.customCards && cid in props.cardlist.customCards)
					tmpCards[slotName].push({
						...props.cardlist.customCards[cid],
						count: 1,
					});
				else tofetch[slotName].push(cid);
			}
		} else {
			for (let [cid, count] of Object.entries(slot.cards)) {
				if (props.cardlist.customCards && cid in props.cardlist.customCards)
					tmpCards[slotName].push({
						...props.cardlist.customCards[cid],
						count: count,
					});
				else tofetch[slotName].push(cid);
			}
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
			for (let slotName in json) {
				const slot = props.cardlist.slots[slotName];
				for (let card of json[slotName]) {
					tmpCards[slotName].push(card);
					card.count = slot.collation === "printRun" ? 1 : slot.cards[card.id];
				}
			}
		}
	}

	cards.value = tmpCards;
}
</script>

<style scoped>
.card-list {
	margin-left: auto;
	margin-right: auto;
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

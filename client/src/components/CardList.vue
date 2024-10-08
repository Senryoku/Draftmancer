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
						<div v-for="slot in value.slots" :key="slot">{{ slot.count }} {{ slot.name }}</div>
					</div>
				</div>
			</div>
			<div style="display: flex; justify-content: space-between; align-items: center">
				<h2>Sheets</h2>
				<div v-tooltip="'Display cards in a 2D grid following their collation when applicable'">
					<label for="sheetDisplay">Full Sheet Display</label>
					<input type="checkbox" v-model="sheetDisplay" id="sheetDisplay" />
				</div>
			</div>
			<div v-for="(sheet, key) in cardlist.sheets" :key="key">
				<h3>{{ key }}</h3>
				<template v-if="cards">
					<template v-if="sheet.collation === 'random' || !sheetDisplay">
						<div
							v-for="(row, rowIndex) in rowsBySheet[key]"
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
					</template>
					<template v-else>
						<div
							class="sheet-display"
							:style="`--card-size: ${sheet.collation === 'striped' ? 'calc(100%/' + sheet.length + ')' : 'calc(100%/11)'}`"
						>
							<CardComponent
								v-for="(card, idx) in cards[key]"
								:key="idx"
								:card="{ ...card, uniqueID: idx }"
								:language="language"
							/>
						</div>
					</template>
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
import { CustomCardList, getSheetCardIDs } from "../../../src/CustomCardList";
import { ref, computed, onMounted, toRaw } from "vue";
import { Card, CardID, PlainCollection } from "@/CardTypes";
import CardComponent from "./Card.vue";

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
const sheetDisplay = ref(true);

onMounted(() => {
	// Could be useful to cache this, but also quite annoying to keep it in sync with the cardlist.
	getCards();
});

const isValid = computed(() => {
	return props.cardlist?.sheets && Object.keys(props.cardlist.sheets).length > 0;
});

const defaultLayout = computed(() => {
	return !props.cardlist.layouts;
});

const rows = computed(() => {
	if (!defaultLayout.value || !cards.value[Object.keys(props.cardlist.sheets)[0]]) return [];
	return rowsByColor(cards.value[Object.keys(props.cardlist.sheets)[0]]);
});

const rowsBySheet = computed(() => {
	if (defaultLayout.value || !cards.value) return {};
	let rowsBySlot: { [slot: string]: { [s: string]: CardWithCount[] }[] } = {};
	for (let sheetName in props.cardlist.sheets) rowsBySlot[sheetName] = rowsByColor(cards.value[sheetName]);
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
	for (let [sheetName, sheet] of Object.entries(props.cardlist.sheets)) {
		let sheetSettings = "";
		switch (sheet.collation) {
			case "printRun": {
				sheetSettings = ` {"collation": "${sheet.collation}", "groupSize": ${sheet.groupSize} }`;
				break;
			}
			case "striped": {
				sheetSettings = ` {"collation": "${sheet.collation}", "length": ${sheet.length}, "weights": ${JSON.stringify(sheet.weights)}}`;
				break;
			}
			// Nothing to do in the "random" case
		}
		str += `[${sheetName}${sheetSettings}]\n`;
		switch (sheet.collation) {
			case "printRun":
			case "striped": {
				for (let cardID of getSheetCardIDs(sheet)) {
					const card = cards.value[sheetName].find((c) => c.id === cardID)!;
					str += `${card.name} (${card.set.toUpperCase()}) ${card.collector_number}\n`;
				}
				break;
			}
			case "random": {
				for (let [cardID, count] of Object.entries(sheet.cards)) {
					const card = cards.value[sheetName].find((c) => c.id === cardID)!;
					str += `${count} ${card.name} (${card.set.toUpperCase()}) ${card.collector_number}\n`;
				}
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
	if (!props.cardlist || !props.cardlist.sheets) return;
	let cardData: Record<CardID, Card> = {};
	let tofetch = new Set<CardID>();
	for (let sheet of Object.values(props.cardlist.sheets)) {
		switch (sheet.collation) {
			case "printRun":
			case "striped": {
				for (let cid of getSheetCardIDs(sheet)) {
					if (props.cardlist.customCards && cid in props.cardlist.customCards)
						cardData[cid] = props.cardlist.customCards[cid];
					else tofetch.add(cid);
				}
				break;
			}
			case "random":
			default: {
				for (let cid of Object.keys(sheet.cards)) {
					if (props.cardlist.customCards && cid in props.cardlist.customCards)
						cardData[cid] = props.cardlist.customCards[cid];
					else tofetch.add(cid);
				}
			}
		}
	}

	if (tofetch.size > 0) {
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
			body: JSON.stringify([...tofetch]),
		});
		if (response.status === 200) {
			const json = await response.json();
			for (let card of json) {
				cardData[card.id] = card;
			}
		}
	}

	let tmpCards: typeof cards.value = {};
	for (let [sheetName, sheet] of Object.entries(props.cardlist.sheets)) {
		tmpCards[sheetName] = [];
		for (let cid of getSheetCardIDs(sheet)) {
			tmpCards[sheetName].push({
				...cardData[cid],
				count: sheet.collation !== "random" ? 1 : sheet.cards[cid],
			});
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

.sheet-display {
	display: flex;
	flex-wrap: wrap;
	justify-content: left;

	& > div {
		flex-basis: var(--card-size);
		height: auto;
	}
}
</style>

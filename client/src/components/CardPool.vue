<template>
	<div ref="root">
		<div class="section-title">
			<h2>
				<slot name="title">Card Pool ({{ cards.length }})</slot>
			</h2>
			<div class="controls">
				<slot name="controls"></slot>
				<dropdown>
					<template v-slot:handle>
						<font-awesome-icon
							icon="fa-solid fa-sort-amount-up"
							class="handle-icon clickable"
							@click="sortByCMC"
							v-if="options.sort === 'cmc'"
						/>
						<img
							src="../assets/img/sort-color.svg"
							class="handle-icon clickable"
							@click="sortByColor"
							v-else-if="options.sort === 'color'"
						/>
						<img
							src="../assets/img/sort-rarity.svg"
							class="handle-icon clickable"
							@click="sortByRarity"
							v-else-if="options.sort === 'rarity'"
						/>
						<img
							src="../assets/img/sort-type.svg"
							class="handle-icon clickable"
							@click="sortByType"
							v-else-if="options.sort === 'type'"
						/>
						Layout
					</template>
					<template v-slot:dropdown>
						<div class="section">
							<div class="header">Columns</div>
							<div style="display: flex; justify-content: space-evenly">
								<font-awesome-icon
									icon="fa-solid fa-minus"
									size="lg"
									class="clickable"
									@click="remColumn(undefined)"
									v-tooltip="'Remove the last column'"
									:class="{ disabled: rows[0].length <= 1 }"
								/>
								{{ rows[0].length }}
								<font-awesome-icon
									icon="fa-solid fa-plus"
									size="lg"
									class="clickable"
									@click="addColumn"
									v-tooltip="'Add a column'"
								/>
							</div>
						</div>
						<div class="section section-left-align">
							<checkbox
								:value="options.layout === 'TwoRows'"
								@toggle="toggleTwoRowsLayout"
								label="Two Rows"
							/>
							<checkbox
								:value="options.displayHeaders"
								@toggle="toggleDisplayHeaders"
								label="Column Headers"
							/>
						</div>
						<div class="section">
							<div class="header">Sort</div>
							<div style="display: grid; grid-template-columns: auto auto; margin: auto">
								<div
									@click="sortByCMC"
									class="sort-button clickable"
									:class="{ 'selected-sort': options.sort === 'cmc' }"
									v-tooltip.left="'Sort cards by CMC'"
								>
									<font-awesome-icon icon="fa-solid fa-sort-amount-up" size="2x" />
								</div>
								<div
									@click="sortByColor"
									class="sort-button clickable"
									:class="{ 'selected-sort': options.sort === 'color' }"
									v-tooltip.right="'Sort cards by color'"
								>
									<img src="../assets/img/sort-color.svg" />
								</div>
								<div
									@click="sortByRarity"
									class="sort-button clickable"
									:class="{ 'selected-sort': options.sort === 'rarity' }"
									v-tooltip.left="'Sort cards by rarity'"
								>
									<img src="../assets/img/sort-rarity.svg" />
								</div>
								<div
									@click="sortByType"
									class="sort-button clickable"
									:class="{ 'selected-sort': options.sort === 'type' }"
									v-tooltip.right="'Sort cards by type'"
								>
									<img src="../assets/img/sort-type.svg" />
								</div>
							</div>
						</div>
					</template>
				</dropdown>
				<div class="right-controls">
					<slot name="right-controls"></slot>
				</div>
			</div>
		</div>
		<div class="card-pool" ref="cardcolumns" :key="poolKey">
			<div class="empty-warning" v-if="cards.length == 0">
				<slot name="empty">
					<h3>This card pool is currently empty!</h3>
				</slot>
			</div>
			<div class="column-headers" v-show="options.displayHeaders">
				<div v-if="rowHeaders" class="row-header-placeholder">&nbsp;</div>
				<div class="column-header" v-for="index in rows[0].length" :key="index">
					<span class="column-header-count">{{ cardsPerColumn[index - 1] }}</span>
					<span class="column-header-name" v-html="columnNames[index - 1]"></span>
					<font-awesome-icon icon="fa-solid fa-times" class="clickable" @click="remColumn(index - 1)" />
				</div>
			</div>
			<div class="card-columns" v-for="(row, index) in rows" :key="index">
				<div class="row-header" v-if="rowHeaders">
					<span class="row-count">{{ rowHeaders[index].count }}</span>
					<span class="row-name">{{ rowHeaders[index].name }}</span>
				</div>
				<Sortable
					v-for="(column, colIdx) in row"
					:key="columnKeys[index][colIdx]"
					class="card-column drag-column"
					:list="column"
					item-key="uniqueID"
					:options="{
						group: group,
						animation: 200,
						ghostClass: 'ghost',
						multiDrag: !isTouchDevice,
						selectedClass: 'multi-drag-selected',
						multiDragKey: 'ctrl',
						delay: 100,
						delayOnTouchOnly: true,
					}"
					@add="(evt: SortableEvent) => addToColumn(evt, column)"
					@remove="(evt: SortableEvent) => removeFromColumn(evt, column)"
					@update="sortableUpdate($event, column)"
				>
					<template #item="{ element }">
						<Card
							:card="element"
							:language="language"
							@click.exact="$emit('cardClick', $event, element)"
							@dblclick="$emit('cardDoubleClick', $event, element)"
							@dragstart.exact="$emit('cardDragStart', $event, element)"
							:conditionalClasses="cardConditionalClasses"
							:key="element.uniqueID"
						/>
					</template>
				</Sortable>
			</div>
		</div>
	</div>
</template>

<script setup lang="ts">
import { ref, computed, watch, onMounted, useTemplateRef, nextTick, getCurrentInstance, toHandlerKey } from "vue";
import { SortableEvent } from "sortablejs";
import { Sortable } from "sortablejs-vue3";
import CardOrder from "../cardorder";
import Card from "./Card.vue";
import Dropdown from "./Dropdown.vue";
import Checkbox from "./Checkbox.vue";
import { Language } from "@/Types";
import { UniqueCard, UniqueCardID } from "@/CardTypes";
import { sortableUpdate } from "../helper";
import { EnglishBasicLandNames } from "../../../src/Constants";

const props = withDefaults(
	defineProps<{
		cards: UniqueCard[];
		language: Language;
		group: string;
		cardConditionalClasses?: (card: UniqueCard) => string[];
		/* This only serves as a mean to declare intentions and make sure the drag events are correctly bound when necessary.
		   By design this will not prevent the user to move cards within the pool. */
		readOnly: boolean;
		backupKey?: string;
	}>(),
	{ readOnly: false }
);
const emit = defineEmits<{
	(e: "cardClick", event: MouseEvent, card: UniqueCard): void;
	(e: "cardDoubleClick", event: MouseEvent, card: UniqueCard): void;
	(e: "cardDragStart", event: DragEvent, card: UniqueCard): void;
	(e: "cardDragAdd", card: UniqueCardID): void;
	(e: "cardDragRemove", card: UniqueCardID): void;
}>();

type SortType = "cmc" | "color" | "rarity" | "type";
const options = ref({
	layout: "default" as "default" | "TwoRows",
	columnCount: 7,
	sort: "cmc" as SortType,
	displayHeaders: true,
});
const rows = ref<UniqueCard[][][]>([[[], [], [], [], [], [], []]]);

const element = useTemplateRef("root");
const cardColumns = useTemplateRef("cardcolumns");

const instance = getCurrentInstance();
const isTouchDevice = "ontouchstart" in window || navigator.maxTouchPoints > 0;

// Forces a re-render of the whole component.
// Used to workaround some de-sync issues (see #623). Might be a bug in sortablejs-vue3.
const forceRerender = ref(0);
const forceUpdate = () => forceRerender.value++;
function checkDOMColumn(DOMColumn: HTMLElement, column: UniqueCard[]) {
	// Checks if the DOM column is still valid and forces a re-render if not.
	// FIXME: This is a workaround. I'm still looking for a proper fix to #623.
	if (DOMColumn.children.length !== column.length) {
		console.error("[CardPool] Missing card in column! Forcing a re-render...");
		forceUpdate();
	} else {
		const DOMUIDs = [...DOMColumn.children].map((c) => parseInt((c as HTMLElement).dataset.uniqueid!));
		const columnUIDs = column.map((c) => c.uniqueID);
		for (let i = 0; i < DOMUIDs.length; ++i) {
			if (DOMUIDs[i] !== columnUIDs[i]) {
				console.error("[CardPool] Unexcepted unique card ID! Forcing a re-render...");
				forceUpdate();
				break;
			}
		}
	}
}

onMounted(() => {
	let storedOptions = localStorage.getItem("card-pool-options");
	if (storedOptions) options.value = JSON.parse(storedOptions);
	sync();
});

function reset() {
	const colCount = Math.max(1, options.value.columnCount);
	rows.value = [[]];
	for (let i = 0; i < colCount; ++i) rows.value[0].push([]);
	if (options.value.layout === "TwoRows") {
		rows.value.push([]);
		for (let i = 0; i < colCount; ++i) rows.value[1].push([]);
	}
}
function sync() {
	reset();
	if (!tryRecover()) for (let card of props.cards) addCard(card, undefined);
}

let checkedBackup = false;
function tryRecover(): boolean {
	// Attempts to recover the row/column arrangement from localStorage.
	// Returns true if successful. No changes are made if unsuccessful.
	if (!props.backupKey || checkedBackup) return false;
	checkedBackup = true;
	try {
		const savedPoolStr = localStorage.getItem("card-pool-backup-" + props.backupKey);
		if (savedPoolStr) {
			const toStr = (col: { id: string; uniqueID: number }[]) =>
				col
					.map((c) => c.id + "," + c.uniqueID)
					.sort()
					.join(";");
			const savedPool: { id: string; uniqueID: number }[][][] = JSON.parse(savedPoolStr);

			if (savedPool.length !== rows.value.length) return false;
			if (savedPool[0].length !== rows.value[0].length) return false;

			if (toStr(savedPool.flat().flat()) === toStr(props.cards)) {
				const tmpRows = [];

				for (let r of savedPool) {
					const row = [];
					for (let c of r) {
						const col = [];
						for (let { id, uniqueID } of c) {
							const uniqueCard = props.cards.find((card) => card.id === id && card.uniqueID === uniqueID);
							if (!uniqueCard) return false;
							col.push(uniqueCard);
						}
						row.push(col);
					}
					tmpRows.push(row);
				}

				rows.value = tmpRows;
				return true;
			}
		}
	} catch (e) {
		console.error("[CardPool] Failed to recover card pool from localStorage: ", e);
	}
	return false;
}

function filterBasics() {
	// Removes basics without affecting other cards ordering.
	for (let r of rows.value)
		for (let i = 0; i < r.length; ++i)
			r.splice(
				i,
				1,
				r[i].filter((c) => !EnglishBasicLandNames.includes(c.name))
			);
}

function selectRow(card: UniqueCard) {
	return options.value.layout === "TwoRows" && !card.type.includes("Creature") && options.value.sort !== "type"
		? rows.value[1]
		: rows.value[0];
}
function defaultColumnIdx(card: UniqueCard) {
	let columnIndex = card.cmc;
	switch (options.value.sort) {
		case "color":
			columnIndex = CardOrder.colorOrder(card.colors);
			break;
		case "rarity":
			columnIndex = CardOrder.rarityOrder(card.rarity);
			break;
		case "type":
			columnIndex = CardOrder.typeOrder(card.type);
			break;
	}
	return Math.min(columnIndex, rows.value[0].length - 1);
}
function addCard(card: UniqueCard, event?: MouseEvent) {
	if (event) {
		insertCard(getColumnFromCoordinates(event), card);
	} else {
		let columnIndex = defaultColumnIdx(card);
		const row = selectRow(card);
		let columnWithDuplicate = row.findIndex((column) => column.findIndex((c) => c.name === card.name) > -1);
		if (columnWithDuplicate > -1) {
			columnIndex = columnWithDuplicate;
		}
		insertCard(row[columnIndex], card);
	}
}
function remCard(card: UniqueCard) {
	for (let row of rows.value)
		for (let col of row) {
			let idx = col.indexOf(card);
			if (idx >= 0) {
				col.splice(idx, 1);
				return;
			}
		}
}
function insertCard(column: UniqueCard[], card: UniqueCard) {
	let duplicateIndex = column.findIndex((c) => c.name === card.name);
	if (duplicateIndex != -1) {
		column.splice(duplicateIndex, 0, card);
	} else if (CardOrder.isOrdered(column, CardOrder.Comparators.arena)) {
		column.push(card);
		CardOrder.orderByArenaInPlace(column);
	} else {
		column.push(card);
	}
}

function sort(columnSorter = CardOrder.orderByArenaInPlace) {
	reset();
	if (props.cards.length === 0) return;
	for (let card of props.cards) {
		const row = selectRow(card);
		const col = row[defaultColumnIdx(card)];
		col.push(card);
	}
	for (let row of rows.value) for (let col of row) columnSorter(col);
}
function sortBy(sortType: SortType, columnSorter = CardOrder.orderByArenaInPlace) {
	options.value.sort = sortType;
	sort(columnSorter);
	saveOptions();
}
const sortByCMC = () => sortBy("cmc");
const sortByColor = () => sortBy("color");
const sortByRarity = () => sortBy("rarity", CardOrder.orderByColorInPlace);
const sortByType = () => sortBy("type");

function hasListener(name: string) {
	if (!instance) return false;
	const props = instance.vnode.props || {};
	const key = toHandlerKey(name);
	return !!(props[key] || props[key + "Once"]);
}

function addToColumn(e: SortableEvent, column: UniqueCard[]) {
	const entries = e.newIndicies.length > 0 ? e.newIndicies : [{ multiDragElement: e.item, index: e.newIndex! }];
	entries.sort((l, r) => l.index - r.index); // Insert lower indices first as they are given in relation to the new array.

	// Event is just a movement within the card pool.
	const inner = cardColumns.value?.contains(e.from) && cardColumns.value?.contains(e.to);
	if (!inner && !props.readOnly && !hasListener("cardDragAdd")) {
		console.warn(
			"CardPool: Not declared as readOnly, but has no 'cardDragAdd' event handler.",
			"Make sure to bind the cardDragAdd event to handle these modifications or this will cause a desync between the prop and the displayed content, or mark the card pool as readOnly if it does not share its group with any other draggables."
		);
		console.warn(e);
	}

	for (const entry of entries) {
		const item = entry.multiDragElement;
		const targetIndex = Math.min(entry.index, column.length); // Make sure we won't introduce undefined values by inserting past the end.
		// Remove the previous DOM element: rendering will be handled by vue once the state is correctly updated.
		item.remove();

		if (!item.dataset.uniqueid) return console.error("Error in CardPool::addToColumn: Invalid item.", e);
		const cardUniqueID = parseInt(item.dataset.uniqueid);

		// Parent is responsible for updating props.cards prop by reacting to this event.
		if (!inner) emit("cardDragAdd", cardUniqueID);

		// FIXME: Failsafe. Make sure we won't introduce a duplicate when inserting the card into this column.
		// NOTE: This seem to happen when drag & dropping multiple cards, multiple times in a row (without letting go of ctrl).
		//       I feel like this is an issue with sortablejs-vue3 wich doesn't properly clear the dragged items, but I have to investigate the root cause.
		const alreadyAdded = column.findIndex((c) => c.uniqueID === cardUniqueID) >= 0;
		if (!alreadyAdded) {
			const idx = props.cards.findIndex((c) => c.uniqueID === cardUniqueID);
			if (idx >= 0) column.splice(targetIndex, 0, props.cards[idx]);
		} else console.warn(`CardPool: Card ${cardUniqueID} already added to column.`);
	}
}
function removeFromColumn(e: SortableEvent, column: UniqueCard[]) {
	const entries = e.oldIndicies.length > 0 ? e.oldIndicies : [{ multiDragElement: e.item, index: e.oldIndex! }];
	entries.sort((l, r) => r.index - l.index); // Remove higher indices first to preverse order.

	// Event is just a movement within the card pool, don't broadcast it.
	const inner = cardColumns.value?.contains(e.from) && cardColumns.value?.contains(e.to);

	if (!inner && !props.readOnly && !hasListener("cardDragRemove")) {
		console.warn(
			"CardPool: Not declared as readOnly, but has no 'cardDragRemove' event handler.",
			"Make sure to bind the cardDragRemove event to handle these modifications or this will cause a desync between the prop and the displayed content, or mark the card pool as readOnly if it does not share its group with any other draggables."
		);
		console.warn(e);
	}

	nextTick(() => checkDOMColumn(e.from, column));

	for (const entry of entries) {
		const item = entry.multiDragElement;
		const index = entry.index;
		const boundedIndex = Math.max(0, Math.min(entry.index, column.length - 1));

		// Make sure we're removing the intended card (source may have changed: see App.forcePick and #606)
		if (item.dataset.uniqueid) {
			const cardUniqueID = parseInt(item.dataset.uniqueid);
			if (index < 0 || index >= column.length || column[index].uniqueID !== cardUniqueID) {
				const fixedIndex = column.findIndex((c) => c.uniqueID === cardUniqueID);
				if (fixedIndex >= 0) {
					column.splice(fixedIndex, 1);
				} else
					console.error(`Error in CardPool::removeFromColumn: Invalid card UniqueID (${cardUniqueID}).`, e);
			} else {
				column.splice(boundedIndex, 1);
			}
		} else {
			column.splice(boundedIndex, 1);
		}

		if (!inner) {
			if (!item.dataset.uniqueid) return console.error("Error in CardPool::removeFromColumn: Invalid item.", e);
			const cardUniqueID = parseInt(item.dataset.uniqueid);
			emit("cardDragRemove", cardUniqueID);
		}
	}
}
function addColumn() {
	for (let row of rows.value) {
		row.push([]);
		row[row.length - 1] = row[row.length - 2].filter((c) => c.cmc > row.length - 2);
		row[row.length - 2] = row[row.length - 2].filter((c) => c.cmc <= row.length - 2);
	}
	saveOptions();
}
function remColumn(index: number | undefined) {
	if (rows.value[0].length < 2) return;
	if (index === undefined || index < 0 || index >= rows.value[0].length) index = rows.value[0].length - 1;
	const other = index < rows.value[0].length - 1 ? index + 1 : index - 1;
	for (let row of rows.value) {
		row[other] = ([] as UniqueCard[]).concat(row[other], row[index]);
		CardOrder.orderByArenaInPlace(row[other]);
		row.splice(index, 1);
	}
	saveOptions();
}
function getColumnFromCoordinates(event: { clientX: number; clientY: number }) {
	// Search for the column at the supplied coordinates, creating a new one if necessary.
	const x = event.clientX;
	const y = event.clientY;
	// Find surrounding row
	const elRows = element.value!.querySelectorAll(".card-columns");
	let rowIdx = 0;
	while (rowIdx < elRows.length - 1 && elRows[rowIdx + 1].getBoundingClientRect().top < y) ++rowIdx;
	// Select column directly to the left or bellow the event
	const columns = elRows[rowIdx].querySelectorAll(".card-column");
	let colIdx = 0;
	while (colIdx < columns.length && columns[colIdx].getBoundingClientRect().left < x) ++colIdx;
	// Returns the column bellow the mouse, or directly to the left (or the first if we're completely to the left).
	const finalColumnIndex = Math.max(0, Math.min(rows.value[rowIdx].length - 1, colIdx - 1));
	return rows.value[rowIdx][finalColumnIndex];
	/*
	// This was creating new column if cards were dropped outside of existing columns,
	// but I'm not sure this is good idea. Disabled for now.

	// Returns it if we're within its horizontal boundaries
	if (colIdx > 0 && x < columns[colIdx - 1].getBoundingClientRect().right) {
		return rows.value[rowIdx][colIdx - 1];
	} else {
		// Creates a new one if card is dropped outside of existing columns
		for (let row of rows.value) row.splice(colIdx, 0, []);
		this.saveOptions(); // Update cached columnCount
		return rows.value[rowIdx][colIdx];
	}
	*/
}
function toggleTwoRowsLayout() {
	if (options.value.layout === "TwoRows") {
		for (let i = 0; i < rows.value[0].length; ++i) {
			rows.value[0][i] = rows.value[0][i].concat(rows.value[1][i]);
		}
		rows.value.pop();
		options.value.layout = "default";
	} else {
		const prev = rows.value[0];
		rows.value = [[], []];
		options.value.layout = "TwoRows";
		for (let i = 0; i < prev.length; ++i) {
			rows.value[0].push([]);
			rows.value[1].push([]);
			for (let c of prev[i]) selectRow(c)[i].push(c);
		}
	}
	saveOptions();
}
function toggleDisplayHeaders() {
	options.value.displayHeaders = !options.value.displayHeaders;
	saveOptions();
}
function saveOptions() {
	// Trying to circumvent a rare issue.
	const columnCount =
		rows.value && rows.value[0] && rows.value[0].length
			? rows.value[0].length
			: options.value.columnCount
				? options.value.columnCount
				: 7;
	options.value.columnCount = Math.max(2, Math.min(columnCount, 32));
	localStorage.setItem("card-pool-options", JSON.stringify(options.value));
}

// Yet another workaround for #623.
const poolKey = computed(() => `card-pool-${props.group}-${props.backupKey}-${forceRerender.value}`);
const columnKeys = computed(() =>
	rows.value.map((row, rowIdx) =>
		row.map(
			(col, colIdx) => `col-${rowIdx}-${colIdx}-${forceRerender.value}-${col.map((c) => c.uniqueID).join(",")}`
		)
	)
);

const columnNames = computed(() => {
	let r = [];
	switch (options.value.sort) {
		default:
		case "cmc":
			for (let i = 0; i < rows.value[0].length; ++i) {
				let cards = rows.value.map((row) => row[i]).flat();
				if (cards.length === 0 && i <= 20) {
					r.push(`<img class="mana-icon" src="img/mana/${i}.svg">`);
				} else {
					let v = [...new Set(cards.map((c) => c.cmc))];
					if (v.length === 1) r.push(`<img class="mana-icon" src="img/mana/${v[0]}.svg">`);
					else r.push("");
				}
			}
			break;
		case "color": {
			const defaultValues = "WUBRGCM";
			for (let i = 0; i < rows.value[0].length; ++i) {
				const cards = rows.value.map((row) => row[i]).flat();
				if (cards.length === 0 && i < defaultValues.length) {
					r.push(`<img class="mana-icon" src="img/mana/${defaultValues[i]}.svg">`);
				} else {
					let v = [...new Set(cards.map((c) => c.colors).flat())];
					let c = "M";
					if (v.length === 1) c = v[0];
					else if (v.length === 0) c = "C";
					r.push(`<img class="mana-icon" src="img/mana/${c}.svg">`);
				}
			}
			break;
		}
		case "rarity": {
			const defaultValues = ["Mythic", "Rare", "Uncommon", "Common"];
			for (let i = 0; i < rows.value[0].length; ++i) {
				let cards = rows.value.map((row) => row[i]).flat();
				if (cards.length === 0 && i < defaultValues.length) {
					r.push(defaultValues[i]);
				} else {
					let v = [...new Set(cards.map((c) => c.rarity))];
					if (v.length === 1) r.push(v[0]);
					else r.push("");
				}
			}
			break;
		}
		case "type": {
			const defaultValues = [
				"Creature",
				"Planeswalker",
				"Enchantment",
				"Artifact",
				"Instant",
				"Sorcery",
				"Land",
				"Basic Land",
			];
			for (let i = 0; i < rows.value[0].length; ++i) {
				const cards = rows.value.map((row) => row[i]).flat();
				if (cards.length === 0 && i < defaultValues.length) {
					r.push(defaultValues[i]);
				} else {
					let v = [...new Set(cards.map((c) => c.type))];
					if (v.length === 1) r.push(v[0].split(" ").pop());
					else {
						// Try with simpler types
						v = [...new Set(v.map((t) => t.split(" ").pop()!))];
						if (v.length === 1) r.push(v[0]);
						else r.push("");
					}
				}
			}
			break;
		}
	}
	while (r.length < rows.value[0].length) r.push("");
	return r;
});
const cardsPerColumn = computed((): number[] => {
	let r = [];
	for (let i = 0; i < rows.value[0].length; ++i) {
		r.push(0);
		for (let row of rows.value) r[i] += row[i].length;
	}
	return r;
});
const rowHeaders = computed(() => {
	if (options.value.layout !== "TwoRows") return null;
	return [
		{
			count: rows.value[0].reduce((acc, val) => val.length + acc, 0),
			name: rows.value[0].flat().every((card) => card.type.includes("Creature")) ? "Creatures" : "-",
		},
		{
			count: rows.value[1].reduce((acc, val) => val.length + acc, 0),
			name: rows.value[1].flat().every((card) => !card.type.includes("Creature")) ? "Non-Creatures" : "-",
		},
	];
});

watch(
	rows,
	(newValue) => {
		if (!props.backupKey || props.cards.length === 0 || newValue.flat().flat().length !== props.cards.length)
			return;
		const serialized = newValue.map((r) =>
			r.map((c) =>
				c.map((card) => {
					return { id: card.id, uniqueID: card.uniqueID };
				})
			)
		);
		localStorage.setItem("card-pool-backup-" + props.backupKey, JSON.stringify(serialized));
	},
	{ deep: true }
);

defineExpose({ addCard, remCard, sync, filterBasics });
</script>

<style scoped>
.card-pool {
	position: relative;
	box-sizing: border-box;
	width: 100%;
	background-color: #282828;
	border-radius: 10px;
	box-shadow: inset 0 0 8px #383838;
	padding: 0.5em;

	user-select: none;
}

.controls {
	flex-grow: 1;
}

.right-controls {
	margin-left: auto;
}

@media (max-width: 1250px) {
	.section-title {
		flex-wrap: wrap;
	}

	.controls {
		justify-content: space-around;
		gap: 0 0.5em;
		margin-left: 0;
	}

	.right-controls {
		margin-left: inherit;
	}
}

.card-pool .card {
	width: 100%;
}

.empty-warning {
	position: absolute;
	top: 50%;
	left: 50%;
	transform: translate(-50%, -50%);
	pointer-events: none;
	user-select: none;
	opacity: 0.5;
}

.handle-icon {
	width: 1em;
	position: absolute;
	left: 5px;
	top: 5px;
}

.column-headers {
	display: flex;
	justify-content: flex-start;
	position: relative;
	flex-grow: 1;
}

.column-header {
	flex: 1 1 10%;
	display: flex;
	justify-content: space-between;
	padding: 0.2em 0.5em 0.1em 0.5em;
	background-color: #333;
	border-radius: 6px 6px 0 0;
	margin: 0 0.375em;
	box-shadow: 0 6px 0 #333;
}

.column-header-name {
	text-transform: capitalize;
}

.card-columns {
	display: flex;
	justify-content: flex-start;
	position: relative;
	flex-grow: 1;
	margin-bottom: 0.5em;
}

.card-pool .card-column {
	margin: 0 0.375em;
	flex: 1 1 10%;
	min-width: 0; /* Overrides drag-column value */
}

.section {
	display: flex;
	flex-direction: column;
	margin-bottom: 0.5rem;
}

.section-left-align {
	margin-left: auto;
	margin-right: auto;
	text-align: left;
}

.header {
	font-variant: small-caps;
	font-size: 0.75em;
	margin: 0 0 0 0.25rem;
}

.row-header-placeholder {
	width: 22px;
	box-sizing: border-box;
	flex-shrink: 0;
}

.row-header {
	width: 22px;
	box-sizing: border-box;

	position: relative;
	display: flex;
	justify-content: center;
	padding-left: 6px;
	background-color: #333;
	border-radius: 6px 0 0 6px;
	margin: 0.375em 0;
	box-shadow: 6px 0 0 #333;
	flex-shrink: 0;
}

.row-header .row-name {
	writing-mode: vertical-rl;
	transform: rotate(180deg);
	text-align: center;
	/*writing-mode: sideways-lr;*/
}

.row-count {
	position: absolute;
	top: 6px;
}

.sort-button {
	margin: 0.25em 0.5em;
	background-color: rgba(0, 0, 0, 0.1);
	border-radius: 0.25em;
	padding: 8px;
	width: 32px;
	height: 32px;
	text-align: center;
}

.sort-button img {
	width: 32px;
	height: 32px;
}

.selected-sort {
	box-shadow: 0px 0px 5px rgba(255, 255, 255, 0.5);
}

/* Little hack to override width of cards coming from the collapsed sideboard */
:deep(.ghost) {
	width: 100%;
}
</style>

<template>
	<div>
		<div class="section-title">
			<h2 style="min-width: 7em">
				<slot name="title">Card Pool ({{ cards.length }})</slot>
			</h2>
			<div class="controls">
				<slot name="controls"></slot>
				<dropdown>
					<template v-slot:handle>
						<i
							class="fas fa-sort-amount-up handle-icon clickable"
							@click="sortByCMC"
							v-if="options.sort === 'cmc'"
						></i>
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
								<i
									class="fas fa-minus fa-lg clickable"
									@click="remColumn()"
									v-tooltip="'Remove the last column'"
									:class="{ disabled: rows[0].length <= 1 }"
								></i>
								{{ rows[0].length }}
								<i
									class="fas fa-plus fa-lg clickable"
									@click="addColumn"
									v-tooltip="'Add a column'"
								></i>
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
									<i class="fas fa-sort-amount-up fa-2x"></i>
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
			</div>
		</div>
		<!-- Dummy draggable component to handle dropping card between columns -->
		<draggable
			:group="group"
			:list="tempColumn"
			@add="dropCard"
			@change="change"
			ghostClass="no-ghost"
			draggable=".card"
			class="card-pool"
		>
			<div class="empty-warning" v-if="cards.length == 0">
				<slot name="empty">
					<h3>This card pool is currently empty!</h3>
				</slot>
			</div>
			<div class="column-headers" v-show="options.displayHeaders">
				<div class="column-header" v-for="index in rows[0].length" :key="index">
					<span class="column-header-count">{{ cardsPerColumn[index - 1] }}</span>
					<span class="column-header-name" v-html="columnNames[index - 1]"></span>
					<i class="fas fa-times clickable" @click="remColumn(index - 1)"></i>
				</div>
			</div>
			<div class="card-columns" v-for="(row, index) in rows" :key="index">
				<draggable
					v-for="(column, colIdx) in row"
					:key="`col_${colIdx}`"
					class="card-column drag-column"
					:list="column"
					:group="group"
					@change="change"
					:animation="200"
				>
					<card
						v-for="(card, index) in column"
						:key="`card_${card.uniqueID ? card.uniqueID : index}`"
						:card="card"
						:language="language"
						@click="click($event, card)"
						:filter="filter"
					></card>
				</draggable>
			</div>
		</draggable>
	</div>
</template>

<script>
import Vue from "vue";
import draggable from "vuedraggable";
import CardOrder from "../cardorder.js";
import Card from "./Card.vue";
import Dropdown from "./Dropdown.vue";
import Checkbox from "./Checkbox.vue";

export default {
	name: "CardPool",
	components: { draggable, Card, Dropdown, Checkbox },
	props: {
		cards: { type: Array, required: true },
		language: { type: String, required: true },
		click: { type: Function, default: () => {} },
		group: { type: String },
		filter: { type: String },
	},
	data: function () {
		return {
			options: {
				layout: "default",
				columnCount: 7,
				sort: "cmc",
				displayHeaders: true,
			},
			rows: [[[], [], [], [], [], [], []]],
			tempColumn: [] /* Temp. destination for card when creating a new column by drag & drop */,
		};
	},
	mounted: function () {
		let options = localStorage.getItem("card-pool-options");
		if (options) this.options = JSON.parse(options);
		this.sync();
	},
	methods: {
		reset: function () {
			const colCount = Math.max(1, this.options.columnCount);
			this.rows = [[]];
			for (let i = 0; i < colCount; ++i) this.rows[0].push([]);
			if (this.options.layout === "TwoRows") {
				this.rows.push([]);
				for (let i = 0; i < colCount; ++i) this.rows[1].push([]);
			}
		},
		sync: function () {
			this.reset();
			for (let card of this.cards) this.addCard(card);
		},
		filterBasics: function () {
			// Removes basics without affecting other cards ordering.
			for (let r of this.rows)
				for (let i = 0; i < r.length; ++i)
					r.splice(
						i,
						1,
						r[i].filter((c) => c.type !== "Basic Land")
					);
		},
		selectRow: function (card) {
			return this.options.layout === "TwoRows" && !card.type.includes("Creature") && this.options.sort !== "type"
				? this.rows[1]
				: this.rows[0];
		},
		defaultColumnIdx: function (card) {
			let columnIndex = card.cmc;
			switch (this.options.sort) {
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
			return Math.min(columnIndex, this.rows[0].length - 1);
		},
		addCard: function (card, event) {
			if (event) {
				this.insertCard(this.getColumnFromCoordinates(event), card);
			} else {
				let columnIndex = this.defaultColumnIdx(card);
				const row = this.selectRow(card);
				let columnWithDuplicate = row.findIndex((column) => column.findIndex((c) => c.name === card.name) > -1);
				if (columnWithDuplicate > -1) {
					columnIndex = columnWithDuplicate;
				}
				this.insertCard(row[columnIndex], card);
			}
		},
		insertCard: function (column, card) {
			let duplicateIndex = column.findIndex((c) => c.name === card.name);
			if (duplicateIndex != -1) {
				column.splice(duplicateIndex, 0, card);
			} else if (CardOrder.isOrdered(column, CardOrder.Comparators.arena)) {
				column.push(card);
				CardOrder.orderByArenaInPlace(column);
			} else {
				column.push(card);
			}
		},
		sort: function (comparator, columnSorter = CardOrder.orderByArenaInPlace) {
			this.reset();
			if (this.cards.length === 0) return;
			for (let card of this.cards) {
				const row = this.selectRow(card);
				const col = row[this.defaultColumnIdx(card)];
				col.push(card);
			}
			for (let row of this.rows) for (let col of row) columnSorter(col);
		},
		sortByCMC: function () {
			this.options.sort = "cmc";
			this.sort(CardOrder.Comparators.cmc);
			this.saveOptions();
		},
		sortByColor: function () {
			this.options.sort = "color";
			this.sort(CardOrder.Comparators.color);
			this.saveOptions();
		},
		sortByRarity: function () {
			this.options.sort = "rarity";
			this.sort(CardOrder.Comparators.rarity, CardOrder.orderByColorInPlace);
			this.saveOptions();
		},
		sortByType: function () {
			this.options.sort = "type";
			this.sort(CardOrder.Comparators.type);
			this.saveOptions();
		},
		remCard: function (card) {
			for (let row of this.rows)
				for (let col of row) {
					let idx = col.indexOf(card);
					if (idx >= 0) {
						col.splice(idx, 1);
						return;
					}
				}
		},
		change: function (e) {
			// Sync. source array when adding/removing cards by drag & drop
			if (e.removed)
				this.cards.splice(
					this.cards.findIndex((c) => c === e.removed.element),
					1
				);
			if (e.added) this.cards.push(e.added.element);
		},
		addColumn: function () {
			for (let row of this.rows) {
				row.push([]);
				Vue.set(
					row,
					row.length - 1,
					row[row.length - 2].filter((c) => c.cmc > row.length - 2)
				);
				Vue.set(
					row,
					row.length - 2,
					row[row.length - 2].filter((c) => c.cmc <= row.length - 2)
				);
			}
			this.saveOptions();
		},
		remColumn: function (index) {
			if (this.rows[0].length < 2) return;
			if (index === undefined || index < 0 || index >= this.rows[0].length) index = this.rows[0].length - 1;
			const other = index < this.rows[0].length - 1 ? index + 1 : index - 1;
			for (let row of this.rows) {
				Vue.set(row, other, [].concat(row[other], row[index]));
				CardOrder.orderByArenaInPlace(row[other]);
				row.splice(index, 1);
			}
			this.saveOptions();
		},
		getColumnFromCoordinates: function (event) {
			// Search for the column at the supplied coordinates, creating a new one if necessary.
			const x = event.clientX;
			const y = event.clientY;
			// Find surrounding row
			const rows = this.$el.querySelectorAll(".card-columns");
			let rowIdx = 0;
			while (rowIdx < rows.length - 1 && rows[rowIdx + 1].getBoundingClientRect().top < y) ++rowIdx;
			// Select column directly to the left or bellow the event
			const columns = rows[rowIdx].querySelectorAll(".card-column");
			let colIdx = 0;
			while (colIdx < columns.length && columns[colIdx].getBoundingClientRect().left < x) ++colIdx;
			// Returns it if we're within its horizontal boundaries
			if (colIdx > 0 && x < columns[colIdx - 1].getBoundingClientRect().right) {
				return this.rows[rowIdx][colIdx - 1];
			} else {
				// Creates a new one if card is dropped outside of existing columns
				for (let row of this.rows) row.splice(colIdx, 0, []);
				this.saveOptions(); // Update cached columnCount
				return this.rows[rowIdx][colIdx];
			}
		},
		dropCard: function (event) {
			// Triggered when the last valid position of a card after a drop event is within the dummy draggable element surrounding the columns.
			// This is either:
			//   An invalid drop (outside of the card pool bounds): Revert the operation.
			//   Between two existing columns: Create a new one and insert the card.
			if (this.tempColumn.length > 0) {
				// Revert all events that ended outside of the card pool bounds.
				const bounds = this.$el.getBoundingClientRect();
				if (
					event.originalEvent.clientX < bounds.left ||
					event.originalEvent.clientX > bounds.right ||
					event.originalEvent.clientY < bounds.top ||
					event.originalEvent.clientY > bounds.bottom ||
					event.originalEvent.type === "dragend" // (a valid final drop location will trigger an event of type 'drop')
				) {
					// Insert the card in its original column, at its original index (oldDraggableIndex)
					this.getColumnFromCoordinates({
						clientX: event.from.getBoundingClientRect().left + 1,
						clientY: event.from.getBoundingClientRect().top + 1,
					}).splice(event.oldDraggableIndex, 0, ...this.tempColumn);
				} else {
					this.getColumnFromCoordinates(event.originalEvent).push(...this.tempColumn);
				}
				this.tempColumn = [];
			}
		},
		toggleTwoRowsLayout: function () {
			if (this.options.layout === "TwoRows") {
				for (let i = 0; i < this.rows[0].length; ++i) {
					this.rows[0][i] = this.rows[0][i].concat(this.rows[1][i]);
				}
				this.rows.pop();
				this.options.layout = "default";
			} else {
				const prev = this.rows[0];
				this.rows = [[], []];
				this.options.layout = "TwoRows";
				for (let i = 0; i < prev.length; ++i) {
					this.rows[0].push([]);
					this.rows[1].push([]);
					for (let c of prev[i]) this.selectRow(c)[i].push(c);
				}
			}
			this.saveOptions();
		},
		toggleDisplayHeaders: function () {
			this.options.displayHeaders = !this.options.displayHeaders;
			this.saveOptions();
		},
		saveOptions: function () {
			// Trying to circumvent a rare issue.
			const columnCount =
				this.rows && this.rows[0] && this.rows[0].length
					? this.rows[0].length
					: this.options.columnCount
					? this.options.columnCount
					: 7;
			this.options.columnCount = Math.max(2, Math.min(columnCount, 32));
			localStorage.setItem("card-pool-options", JSON.stringify(this.options));
		},
	},
	computed: {
		columnNames: function () {
			let r = [];
			switch (this.options.sort) {
				default:
				case "cmc":
					for (let i = 0; i < this.rows[0].length; ++i) {
						let cards = this.rows.map((row) => row[i]).flat();
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
					for (let i = 0; i < this.rows[0].length; ++i) {
						const cards = this.rows.map((row) => row[i]).flat();
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
					for (let i = 0; i < this.rows[0].length; ++i) {
						let cards = this.rows.map((row) => row[i]).flat();
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
					for (let i = 0; i < this.rows[0].length; ++i) {
						const cards = this.rows.map((row) => row[i]).flat();
						if (cards.length === 0 && i < defaultValues.length) {
							r.push(defaultValues[i]);
						} else {
							let v = [...new Set(cards.map((c) => c.type))];
							if (v.length === 1) r.push(v[0].split(" ").pop());
							else {
								// Try with simpler types
								v = [...new Set(v.map((t) => t.split(" ").pop()))];
								if (v.length === 1) r.push(v[0]);
								else r.push("");
							}
						}
					}
					break;
				}
			}
			while (r.length < this.rows[0].length) r.push("");
			return r;
		},
		cardsPerColumn: function () {
			let r = [];
			for (let i = 0; i < this.rows[0].length; ++i) {
				r.push(0);
				for (let row of this.rows) r[i] += row[i].length;
			}
			return r;
		},
	},
};
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
	transition: width 0.25s ease;
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

/* Hides card when dragged to the controls area */
.no-ghost {
	display: none;
}
</style>

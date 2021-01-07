<template>
	<div>
		<div class="section-title">
			<h2 style="min-width: 8em">
				<slot name="title">Card Pool ({{ cards.length }})</slot>
			</h2>
			<div class="controls">
				<slot name="controls"></slot>
				<dropdown>
					<template v-slot:handle>Layout</template>
					<template v-slot:dropdown>
						<div class="section">
							<div class="header">Columns</div>
							<div style="display: flex; justify-content: space-evenly">
								<i
									class="fas fa-minus fa-lg clickable"
									@click="remColumn"
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
						<div class="section">
							<span @click="toggleTwoRowsLayout">
								<i
									class="fas"
									:class="{
										'fa-check-square': layout === 'TwoRows',
										'fa-square': layout !== 'TwoRows',
									}"
								></i>
								Two Rows</span
							>
						</div>
						<div class="section">
							<div class="header">Sort</div>
							<div style="display: grid; grid-template-columns: auto auto; margin: auto">
								<div @click="sync" class="sort-button clickable" v-tooltip.left="'Sort cards by CMC'">
									<i class="fas fa-sort-amount-up fa-2x"></i>
								</div>
								<div
									@click="sortByColor"
									class="sort-button clickable"
									v-tooltip.right="'Sort cards by color'"
								>
									<img src="../assets/img/sort-color.svg" />
								</div>
								<div
									@click="sortByRarity"
									class="sort-button clickable"
									v-tooltip.left="'Sort cards by rarity'"
								>
									<img src="../assets/img/sort-rarity.svg" />
								</div>
								<div
									@click="sortByType"
									class="sort-button clickable"
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
			<div class="card-columns" v-for="(row, index) in rows" :key="index">
				<draggable
					v-for="(column, colIdx) in row"
					:key="`col_${colIdx}`"
					class="card-column drag-column"
					:list="column"
					:group="group"
					@change="change"
					drag-class="drag"
				>
					<card
						v-for="(card, index) in column"
						:key="`card_${card.uniqueID ? card.uniqueID : index}`"
						:card="card"
						:language="language"
						@click="click($event, card)"
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

export default {
	name: "CardPool",
	components: { draggable, Card, Dropdown },
	props: {
		cards: { type: Array, required: true },
		language: { type: String, required: true },
		click: { type: Function, default: () => {} },
		group: { type: String },
	},
	data: function () {
		return {
			options: {
				layout: "default",
				columnCount: 7,
				sort: "cmc",
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
			if (this.layout === "TwoRows") {
				this.rows.push([]);
				for (let i = 0; i < colCount; ++i) this.rows[1].push([]);
			}
		},
		sync: function () {
			this.reset();
			for (let card of this.cards) this.addCard(card);
		},
		selectRow: function (card) {
			return this.layout === "TwoRows" && !card.type.includes("Creature") ? this.rows[1] : this.rows[0];
		},
		addCard: function (card, event) {
			if (event) {
				this.insertCard(this.getNearestColumn(event), card);
			} else {
				let columnIndex = Math.min(card.cmc, this.rows[0].length - 1);
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
			let sorted = [...this.cards].sort(comparator);
			let columnIndex = 0;
			for (let idx = 0; idx < sorted.length - 1; ++idx) {
				const row = this.selectRow(sorted[idx]);
				row[columnIndex].push(sorted[idx]);
				if (comparator(sorted[idx], sorted[idx + 1]))
					columnIndex = Math.min(columnIndex + 1, this.rows[0].length - 1);
			}
			this.rows[0][columnIndex].push(sorted[sorted.length - 1]);
			for (let col of this.rows[0]) columnSorter(col);
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
		remColumn: function () {
			if (this.rows[0].length < 2) return;
			for (let row of this.rows) {
				Vue.set(row, row.length - 2, [].concat(row[row.length - 2], row[row.length - 1]));
				CardOrder.orderByArenaInPlace(row[row.length - 2]);
				row.pop();
			}
			this.saveOptions();
		},
		getNearestColumn: function (event) {
			// Search for the nearest column.
			const x = event.clientX;
			const y = event.clientY;
			// Find surrounding row
			const rows = this.$el.querySelectorAll(".card-columns");
			let rowIdx = 0;
			while (rowIdx < rows.length - 1 && rows[rowIdx + 1].getBoundingClientRect().top < y) ++rowIdx;
			//
			const columns = rows[rowIdx].querySelectorAll(".card-column");
			let colIdx = 0;
			while (colIdx < columns.length && columns[colIdx].getBoundingClientRect().left < x) ++colIdx;
			// Returns it if we're within its horizontal boundaries
			if (colIdx > 0 && x < columns[colIdx - 1].getBoundingClientRect().right) {
				return this.rows[rowIdx][colIdx - 1];
			} else {
				// Creates a new one if card is dropped outside of existing columns
				for (let row of this.rows) row.splice(colIdx, 0, []);
				return this.rows[rowIdx][colIdx];
			}
		},
		dropCard: function (event) {
			if (this.tempColumn.length > 0) {
				this.getNearestColumn(event.originalEvent).push(...this.tempColumn);
				this.tempColumn = [];
			}
		},
		toggleTwoRowsLayout: function () {
			if (this.layout === "TwoRows") {
				for (let i = 0; i < this.rows[0].length; ++i) {
					this.rows[0][i] = this.rows[0][i].concat(this.rows[1][i]);
				}
				this.rows.pop();
				this.layout = "default";
			} else {
				this.rows.push([]);
				for (let i = 0; i < this.rows[0].length; ++i) {
					this.rows[1].push(this.rows[0][i].filter((c) => !c.type.includes("Creature")));
					this.rows[0][i] = this.rows[0][i].filter((c) => c.type.includes("Creature"));
				}
				this.layout = "TwoRows";
			}
			this.saveOptions();
		},
		saveOptions: function () {
			this.options.columnCount = this.rows[0].length;
			localStorage.setItem("card-pool-options", JSON.stringify(this.options));
		},
	},
};
</script>

<style>
.card-pool .card-image,
.card-pool .card img {
	width: 100%;
}
</style>

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

.card-columns {
	display: flex;
	justify-content: flex-start;
	position: relative;
	flex-grow: 1;
	margin-bottom: 0.5em;
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

/* Hides card when dragged to the controls area */
.no-ghost {
	display: none;
}
</style>

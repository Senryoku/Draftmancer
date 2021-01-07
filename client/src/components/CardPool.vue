<template>
	<div class="card-pool">
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
									:class="{ disabled: columns.length <= 1 }"
								></i>
								{{ columns.length }}
								<i
									class="fas fa-plus fa-lg clickable"
									@click="addColumn"
									v-tooltip="'Add a column'"
								></i>
							</div>
						</div>
						<div class="section">
							<span><i class="fas fa-check-square"></i> Two Rows Layout</span>
						</div>
						<div class="section">
							<div class="header">Sort</div>
							<div style="display: grid; grid-template-columns: auto auto; margin: auto">
								<div @click="sync" class="sort-button clickable" v-tooltip.right="'Sort cards by CMC'">
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
									v-tooltip.right="'Sort cards by rarity'"
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
			class="card-pool card-container"
		>
			<div class="empty-warning" v-if="cards.length == 0">
				<slot name="empty">
					<h3>This card pool is currently empty!</h3>
				</slot>
			</div>
			<div class="card-columns">
				<draggable
					v-for="(column, colIdx) in columns"
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
			columns: [[], [], [], [], [], [], []],
			tempColumn: [] /* Temp. destination for card when creating a new column by drag & drop */,
		};
	},
	mounted: function () {
		this.sync();
	},
	methods: {
		reset: function () {
			const colCount = Math.max(1, this.columns.length);
			this.columns = [];
			for (let i = 0; i < colCount; ++i) this.columns.push([]);
		},
		sync: function () {
			this.reset();
			for (let card of this.cards) this.addCard(card);
		},
		addCard: function (card, event) {
			if (event) {
				this.insertCard(this.getNearestColumn(event), card);
			} else {
				let columnIndex = Math.min(card.cmc, this.columns.length - 1);
				let columnWithDuplicate = this.columns.findIndex(
					(column) => column.findIndex((c) => c.name === card.name) > -1
				);
				if (columnWithDuplicate > -1) {
					columnIndex = columnWithDuplicate;
				}
				this.insertCard(this.columns[columnIndex], card);
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
				this.columns[columnIndex].push(sorted[idx]);
				if (comparator(sorted[idx], sorted[idx + 1]))
					columnIndex = Math.min(columnIndex + 1, this.columns.length - 1);
			}
			this.columns[columnIndex].push(sorted[sorted.length - 1]);
			for (let col of this.columns) columnSorter(col);
		},
		sortByColor: function () {
			this.sort(CardOrder.Comparators.color);
		},
		sortByRarity: function () {
			this.sort(CardOrder.Comparators.rarity, CardOrder.orderByColorInPlace);
		},
		sortByType: function () {
			this.sort(CardOrder.Comparators.type);
		},
		remCard: function (card) {
			for (let col of this.columns) {
				let idx = col.indexOf(card);
				if (idx >= 0) {
					col.splice(idx, 1);
					break;
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
			this.columns.push([]);
			Vue.set(
				this.columns,
				this.columns.length - 1,
				this.columns[this.columns.length - 2].filter((c) => c.cmc > this.columns.length - 2)
			);
			Vue.set(
				this.columns,
				this.columns.length - 2,
				this.columns[this.columns.length - 2].filter((c) => c.cmc <= this.columns.length - 2)
			);
		},
		remColumn: function () {
			if (this.columns.length < 2) return;
			Vue.set(
				this.columns,
				this.columns.length - 2,
				[].concat(this.columns[this.columns.length - 2], this.columns[this.columns.length - 1])
			);
			CardOrder.orderByArenaInPlace(this.columns[this.columns.length - 2]);
			this.columns.pop();
		},
		getNearestColumn: function (event) {
			// Search for the nearest column.
			const x = event.clientX;
			const columns = this.$el.querySelector(".card-columns").querySelectorAll(".card-column");
			let colIdx = 0;
			while (colIdx < columns.length && columns[colIdx].getBoundingClientRect().left < x) ++colIdx;
			// Returns it if we're within its horizontal boundaries
			if (colIdx > 0 && x < columns[colIdx - 1].getBoundingClientRect().right) {
				return this.columns[colIdx - 1];
			} else {
				// Creates a new one if card is dropped outside of existing columns
				this.columns.splice(colIdx, 0, []);
				return this.columns[colIdx];
			}
		},
		dropCard: function (event) {
			if (this.tempColumn.length > 0) {
				this.getNearestColumn(event.originalEvent).push(...this.tempColumn);
				this.tempColumn = [];
			}
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
}

.card-columns {
	display: flex;
	justify-content: flex-start;
	position: relative;
	flex-grow: 1;
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

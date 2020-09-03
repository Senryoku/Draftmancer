<template>
	<div class="card-container card-columns">
		<div class="empty-warning" v-if="cards.length == 0">
			<slot name="empty">
				<h3>This card pool is currently empty!</h3>
			</slot>
		</div>
		<draggable
			v-for="(column, colIdx) in columns"
			:key="`${_uid}_col_${colIdx}`"
			class="card-column drag-column"
			:list="column"
			:group="group"
			@change="change"
			drag-class="drag"
		>
			<card
				v-for="card in column"
				:key="`${_uid}_card_${card.uniqueID}`"
				:card="card"
				:language="language"
				@click="click($event, card)"
			></card>
		</draggable>
		<div class="draggable-controls">
			<div @click="addColumn" class="column-control clickable" v-tooltip.right="'Add a Column'">
				<i class="fas fa-plus fa-2x"></i>
			</div>
			<div
				v-show="columns.length > 1"
				@click="remColumn"
				class="column-control clickable"
				v-tooltip.right="'Remove the last Column'"
			>
				<i class="fas fa-minus fa-2x"></i>
			</div>
			<div class="sort-dropdown">
				<div @click="sync" class="column-control clickable" v-tooltip.right="'Sort cards by CMC'">
					<i class="fas fa-sort-amount-up fa-2x"></i>
				</div>
				<div
					@click="sortByColor"
					class="column-control clickable"
					v-tooltip.right="'Sort cards by color'"
				>
					<img src="../assets/img/sort-color.svg" />
				</div>
				<div
					@click="sortByRarity"
					class="column-control clickable"
					v-tooltip.right="'Sort cards by rarity'"
				>
					<img src="../assets/img/sort-rarity.svg" />
				</div>
				<div
					@click="sortByType"
					class="column-control clickable"
					v-tooltip.right="'Sort cards by type'"
				>
					<img src="../assets/img/sort-type.svg" />
				</div>
			</div>
		</div>
	</div>
</template>

<script>
import Vue from "vue";
import draggable from "vuedraggable";
import CardOrder from "../cardorder.js";
import Card from "./Card.vue";

export default {
	name: "CardPool",
	components: { draggable, Card },
	props: {
		cards: { type: Array, required: true },
		language: { type: String, required: true },
		click: { type: Function },
		group: { type: String },
	},
	data: function () {
		return {
			columns: [[], [], [], [], [], [], []],
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
		addCard: function (card) {
			let columnIndex = Math.min(card.cmc, this.columns.length - 1);
			let columnWithDuplicate = this.columns.findIndex(
				(column) => column.findIndex((c) => c.name === card.name) > -1
			);
			if (columnWithDuplicate > -1) {
				columnIndex = columnWithDuplicate;
			}
			this.insertCard(this.columns[columnIndex], card);
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
	},
};
</script>

<style>
:root {
	--controls-margin: 0.4em;
	--controls-padding: 8px;
	--controls-size: 32px;
}

.column-control {
	margin: 0 0 var(--controls-margin) 0;
	background-color: rgba(0, 0, 0, 0.1);
	border-radius: calc(var(--controls-padding) + var(--controls-size));
	padding: var(--controls-padding);
	width: var(--controls-size);
	height: var(--controls-size);
	text-align: center;
}

.column-control:hover {
	box-shadow: inset 0 0 4px 0 rgba(255, 255, 255, 0.25);
}

.column-control img {
	width: var(--controls-size);
	height: var(--controls-size);
}

.sort-dropdown {
	max-height: calc(2 * var(--controls-padding) + var(--controls-size));
	transition: 0.2s ease-out;
	overflow: hidden;
}

.sort-dropdown:hover {
	max-height: calc(4 * (2 * var(--controls-padding) + var(--controls-size) + var(--controls-margin)));
}
</style>

<style scoped>
/* 
 * This fixes the dragged image in Chrome (where overflow:visible is ignored) by setting the height explicitly
 * but also causes a distracting reflow. Commenting it until we find a better solution.
 */
/*
.drag {
	height: 283.33px;
}
*/

.empty-warning {
	position: absolute;
	top: 50%;
	left: 50%;
	transform: translate(-50%, -50%);
}
</style>

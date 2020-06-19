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
		>
			<card
				v-for="card in column"
				:key="`${_uid}_card_${card.uniqueID}`"
				:card="card"
				:language="$root.language"
				:selectcard="click"
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
			<div @click="sync" class="column-control clickable" v-tooltip.right="'Sort cards'">
				<i class="fas fa-sort-amount-up fa-2x"></i>
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
		click: { type: Function },
		group: { type: String },
	},
	data: function() {
		return {
			columns: [[], [], [], [], [], [], []],
		};
	},
	mounted: function() {
		this.sync();
	},
	methods: {
		reset: function() {
			this.columns = [[], [], [], [], [], [], []];
		},
		sync: function() {
			this.reset();
			for (let card of this.cards) this.addCard(card);
		},
		addCard: function(card) {
			let columnIndex = Math.min(card.cmc, this.columns.length - 1);
			let columnWithDuplicate = this.columns.findIndex(
				column => column.findIndex(c => c.name === card.name) > -1
			);
			if (columnWithDuplicate > -1) {
				columnIndex = columnWithDuplicate;
			}
			this.insertCard(this.columns[columnIndex], card);
		},
		insertCard: function(column, card) {
			let duplicateIndex = column.findIndex(c => c.name === card.name);
			if (duplicateIndex != -1) {
				column.splice(duplicateIndex, 0, card);
			} else if (CardOrder.isOrdered(column, CardOrder.Comparators.arena)) {
				column.push(card);
				CardOrder.orderByArenaInPlace(column);
			} else {
				column.push(card);
			}
		},
		remCard: function(card) {
			for (let col of this.columns) {
				let idx = col.indexOf(card);
				if (idx >= 0) {
					col.splice(idx, 1);
					break;
				}
			}
		},
		change: function(e) {
			// Sync. source array when adding/removing cards by drag & drop
			if (e.removed)
				this.cards.splice(
					this.cards.findIndex(c => c === e.removed.element),
					1
				);
			if (e.added) this.cards.push(e.added.element);
		},
		addColumn: function() {
			this.columns.push([]);
			Vue.set(
				this.columns,
				this.columns.length - 1,
				this.columns[this.columns.length - 2].filter(c => c.cmc > this.columns.length - 2)
			);
			Vue.set(
				this.columns,
				this.columns.length - 2,
				this.columns[this.columns.length - 2].filter(c => c.cmc <= this.columns.length - 2)
			);
		},
		remColumn: function() {
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

<style scoped>
.card-pool {
	position: relative;
	min-height: 200px;
}

.empty-warning {
	position: absolute;
	top: 50%;
	left: 50%;
	translate: -50% -50%;
}

.draggable-constrols {
	display: flex;
	flex-direction: column;
}

.column-control {
	margin: 0 0 0.4em 0;
	background-color: rgba(0, 0, 0, 0.1);
	border-radius: 37px;
	padding: 5px;
	width: 32px;
	height: 32px;
	text-align: center;
}
</style>

<template>
	<div class="card-container card-columns">
		<draggable
			v-for="(column, colIdx) in columns"
			:key="'side' + colIdx"
			class="card-column drag-column"
			:list="column"
			group="cardColumn"
			@change="change"
		>
			<card
				v-for="card in column"
				:key="card.uniqueID"
				:card="card"
				:language="$root.language"
				:selectcard="click"
			></card>
		</draggable>
		<div class="draggable-controls">
			<div @click="addColumn" class="plus-column"><i class="fas fa-plus fa-2x"></i></div>
			<div v-show="columns.length > 1" @click="remColumn" class="minus-column">
				<i class="fas fa-minus fa-2x"></i>
			</div>
		</div>
		<div class="empty-warning" v-if="cards.length == 0">
			<slot name="empty">
				<h3>This card pool is currently empty!</h3>
			</slot>
		</div>
	</div>
</template>

<script>
import draggable from "vuedraggable";
import Card from "./Card.vue";

export default {
	name: "CardPool",
	components: { draggable, Card },
	props: {
		cards: { type: Array, required: true },
		click: { type: Function },
	},
	data: function() {
		return {
			columns: [[], [], [], [], [], [], []],
		};
	},
	methods: {
		reset: function() {
			this.columns = [[], [], [], [], [], [], []];
		},
		sync: function() {
			this.reset();
			for (let card of this.cards) this.addCard(card);
			for (let col of this.columns) this.$root.orderByColorInPlace(col);
		},
		addCard: function(card) {
			this.columns[Math.min(card.cmc, this.columns.length - 1)].push(card);
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
			if (e.removed)
				this.cards.splice(
					this.cards.findIndex(c => c === e.removed.element),
					1
				);
			if (e.added) this.cards.push(e.added.element);
		},
		addColumn: function() {
			this.columns.push([]);
			this.columns[this.columns.length - 1] = this.columns[this.columns.length - 2].filter(
				c => c.cmc > this.columns.length - 2
			);
			this.columns[this.columns.length - 2] = this.columns[this.columns.length - 2].filter(
				c => c.cmc <= this.columns.length - 2
			);
		},
		remColumn: function() {
			if (this.columns.length < 2) return;
			this.columns[this.columns.length - 2] = [].concat(
				this.columns[this.columns.length - 2],
				this.columns[this.columns.length - 1]
			);
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

.minus-column,
.plus-column {
	margin: 0 0 0.2em 0;
	background-color: rgba(0, 0, 0, 0.1);
	border-radius: 37px;
	padding: 5px;
	width: 32px;
	height: 32px;
	text-align: center;
}
</style>

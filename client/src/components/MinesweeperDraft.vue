<template>
	<div class="minesweeper-draft">
		<transition name="slide-fade-left" mode="out-in">
			<div class="minesweeper-grid" v-if="state.grid" :key="state.gridNumber">
				<div class="minesweeper-row" v-for="(row, rowIdx) in state.grid" :key="rowIdx">
					<div
						class="minesweeper-cell"
						v-for="(cell, colIdx) in row"
						:key="rowIdx * state.grid[0].length + colIdx"
					>
						<transition name="turnover" mode="out-in">
							<CardPlaceholder
								v-if="cell.state === 0"
								:key="rowIdx * state.grid[0].length + colIdx + '_placeholder'"
							/>
							<Card
								v-else
								:card="cell.card"
								:class="{ clickable: picking && cell.state === 1, picked: cell.state === 2 }"
								@click="pick(rowIdx, colIdx)"
								:key="rowIdx * state.grid[0].length + colIdx + '_card'"
							/>
						</transition>
					</div>
				</div>
			</div>
		</transition>
	</div>
</template>

<script>
import Card from "./Card.vue";
import CardPlaceholder from "./CardPlaceholder.vue";
export default {
	components: { Card, CardPlaceholder },
	props: { state: { type: Object, required: true }, picking: { type: Boolean, required: true } },
	methods: {
		pick(row, col) {
			if (this.picking && this.state.grid[row][col].state === 1) {
				this.$emit("pick", row, col);
			}
		},
	},
	computed: {},
};
</script>

<style scoped>
.minesweeper-draft {
	background-color: #282828;
	border-radius: 10px;
	box-shadow: inset 0 0 8px #383838;
	padding: 0.5em;
	overflow-y: hidden;
	overflow-x: scroll;
}

.minesweeper-grid {
	margin: auto;
	align-items: center;

	display: table;
	table-layout: fixed;
	--gap: 5px;
	border-spacing: var(--gap);
}

.minesweeper-row {
	display: table-row;
}

.minesweeper-cell {
	display: table-cell;
}

.minesweeper-grid .card {
	/*
	width: auto;
	height: auto;
	*/
	transition: transform 0.2s ease-in-out;
}

.picked {
	filter: brightness(0.4);
	transform: scale(0.8);
}

.turnover-enter-active,
.turnover-leave-active {
	perspective-origin: center center;
	backface-visibility: hidden;
	z-index: 1;
}

.turnover-enter-active {
	transition: transform 0.3s ease-out, scale 0.3s ease-in-out !important;
}

.turnover-leave-active {
	transition: transform 0.3s ease-in, scale 0.3s ease-in-out !important;
}

.turnover-enter,
.turnover-leave-to {
	scale: 1.15;
}

.turnover-enter {
	transform: perspective(1000px) rotateY(-90deg);
}

.turnover-leave-to {
	transform: perspective(1000px) rotateY(90deg);
}
</style>

<style>
.clickable img {
	transition: box-shadow 0.15s ease-in-out;
}

.clickable:hover img {
	cursor: pointer;
	box-shadow: deepskyblue 0 0 5px 1px;
}
</style>

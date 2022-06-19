<template>
	<div class="minesweeper-draft">
		<div class="minesweeper-grid" v-if="state.grid">
			<template v-for="(row, rowIdx) in state.grid">
				<div v-for="(cell, colIdx) in row" :key="rowIdx * state.grid[0].length + colIdx">
					<CardPlaceholder v-if="cell.state === 0" />
					<Card
						v-else
						:card="cell.card"
						:class="{ clickable: picking && cell.state === 1, picked: cell.state === 2 }"
						@click="pick(rowIdx, colIdx)"
					/>
				</div>
			</template>
		</div>
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
	width: 100%;
}

.minesweeper-grid {
	margin: auto;
	align-items: center;

	display: grid;
	grid-auto-flow: row dense;
	grid-template-columns: repeat(9, 1fr);

	--gap: 5px;
	gap: var(--gap);

	/*
	overflow: scroll;
	*/
}

.minesweeper-grid .card {
	width: 100%;
	height: auto;
	transition: box-shadow 0.15s ease-in-out, transform 0.2s ease-in-out;
}

.minesweeper-row {
	display: flex;
}

.picked {
	filter: brightness(0.4);
	transform: scale(0.8);
}

.clickable:hover {
	cursor: pointer;
	box-shadow: deepskyblue 0 0 5px 1px;
}
</style>

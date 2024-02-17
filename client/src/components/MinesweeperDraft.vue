<template>
	<div>
		<div class="section-title">
			<h2>Minesweeper Draft</h2>
			<div class="controls" style="flex-grow: 1">
				<span>
					Grid #{{ state.gridNumber + 1 }}/{{ state.gridCount }}, Pick #{{ state.pickNumber + 1 }}/{{
						state.picksPerGrid
					}}
				</span>
				<span>
					<template v-if="picking">
						<font-awesome-icon icon="fa-solid fa-exclamation-circle"></font-awesome-icon> It's your turn!
						Pick a card.
					</template>
					<template v-else-if="state.currentPlayer === null">
						<template v-if="state.gridNumber >= state.gridCount">
							This was the last grid! Let me cleanup this cards off the table...
						</template>
						<template v-else>Advancing to the next grid...</template>
					</template>
					<template v-else>
						<font-awesome-icon icon="fa-solid fa-spinner" spin></font-awesome-icon>
						Waiting for
						{{ currentPlayerUsername !== "" ? currentPlayerUsername : "the next grid" }}...
					</template>
				</span>
			</div>
			<scale-slider v-model.number="gridScale" />
		</div>
		<div class="minesweeper-draft" :style="`--grid-scale: ${gridScale}`" ref="grid">
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
									:card="undefined"
								/>
								<Card
									v-else
									:card="cell.card!"
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
	</div>
</template>

<script lang="ts">
import { PropType, defineComponent } from "vue";
import { MinesweeperSyncData } from "@/MinesweeperDraftTypes";

import Card from "./Card.vue";
import CardPlaceholder from "./CardPlaceholder.vue";
import ScaleSlider from "./ScaleSlider.vue";

export default /*#__PURE__*/ defineComponent({
	data() {
		return { gridScale: 1, gridScrollState: { left: 0, top: 0, x: 0, y: 0, moved: false } };
	},
	components: { Card, CardPlaceholder, ScaleSlider },
	props: {
		state: { type: Object as PropType<MinesweeperSyncData>, required: true },
		currentPlayerUsername: { type: String, required: true },
		picking: { type: Boolean, required: true },
	},
	mounted() {
		(this.$refs.grid as HTMLElement)?.addEventListener("mousedown", this.gridOnMouseDown);
	},
	methods: {
		pick(row: number, col: number) {
			if (this.picking && this.state.grid[row][col].state === 1) {
				this.$emit("pick", row, col);
			}
		},
		gridOnMouseDown(e: MouseEvent) {
			if (!this.$refs.grid) return;
			const grid = this.$refs.grid as HTMLElement;
			this.gridScrollState = {
				left: grid.scrollLeft,
				top: grid.scrollTop,
				x: e.clientX,
				y: e.clientY,
				moved: false,
			};
			document.addEventListener("mousemove", this.gridOnMouseMove);
			document.addEventListener("mouseup", this.gridOnMouseUp);
		},
		gridOnMouseMove(e: MouseEvent) {
			if (!this.$refs.grid) return;
			const grid = this.$refs.grid as HTMLElement;
			const dx = e.clientX - this.gridScrollState.x;
			const dy = e.clientY - this.gridScrollState.y;
			grid.scrollTop = this.gridScrollState.top - dy;
			grid.scrollLeft = this.gridScrollState.left - dx;

			if (!this.gridScrollState.moved) {
				grid.classList.add("dragging");
				this.gridScrollState.moved = true;
			}
		},
		gridOnMouseUp() {
			document.removeEventListener("mousemove", this.gridOnMouseMove);
			document.removeEventListener("mouseup", this.gridOnMouseUp);

			if (this.gridScrollState.moved) {
				(this.$refs.grid as HTMLElement)?.classList.remove("dragging");
			}
		},
	},
});
</script>

<style scoped>
.minesweeper-draft {
	background-color: #282828;
	border-radius: 10px;
	box-shadow: inset 0 0 8px #383838;
	padding: 0.5em;
	overflow: auto;

	max-height: 90vh;
}

/* Disable vertical scrolling when using the fixed deck feature*/
.using-fixed-deck .minesweeper-draft {
	max-height: initial;
}

.dragging {
	cursor: grabbing;
}

.dragging * {
	pointer-events: none;
}

.minesweeper-grid {
	margin: auto;

	display: table;
	table-layout: fixed;
	align-items: center;
	--gap: 5px;
	border-spacing: var(--gap) var(--gap);
	border-collapse: separate;

	cursor: grab;
	user-select: none;
}

.minesweeper-row {
	display: table-row;
}

.minesweeper-cell {
	display: table-cell;
}

.minesweeper-grid .card {
	display: block;
	width: calc(var(--grid-scale) * 200px);
	height: calc(var(--grid-scale) * 282px);
	transition: transform 0.2s ease-in-out;
}

.minesweeper-grid .card-placeholder {
	width: calc(var(--grid-scale) * 200px);
	height: calc(var(--grid-scale) * 282px);
	padding-top: 0;
	transition: transform 0.2s ease-in-out;
}

.picked {
	animation: card-pick 4s ease-in-out;
	animation-fill-mode: forwards;
}

.turnover-enter-active,
.turnover-leave-active {
	perspective-origin: center center;
	backface-visibility: hidden;
	z-index: 1;
}

.turnover-enter-active {
	transition:
		transform 0.3s ease-out,
		scale 0.3s ease-in-out !important;
}

.turnover-leave-active {
	transition:
		transform 0.3s ease-in,
		scale 0.3s ease-in-out !important;
}

.turnover-enter-from,
.turnover-leave-to {
	scale: 1.15;
}

.turnover-enter-from {
	transform: perspective(1000px) rotateY(-90deg);
}

.turnover-leave-to {
	transform: perspective(1000px) rotateY(90deg);
}

@keyframes card-pick {
	0% {
		z-index: 100;
	}
	2% {
		box-shadow: 0 0 30px 24px rgba(255, 255, 255, 1);
		transform: scale(1.4);
		z-index: 100;
	}
	3% {
		box-shadow: 0 0 20px 12px rgba(255, 255, 255, 1);
		transform: scale(1.2);
		z-index: 100;
	}
	10% {
		box-shadow: 0 0 20px 12px rgba(255, 255, 255, 1);
		transform: scale(1.2);
		z-index: 100;
	}
	30% {
		box-shadow: 0 0 28px 14px rgba(255, 255, 255, 1);
		transform: scale(1.2);
		z-index: 100;
	}
	50% {
		box-shadow: 0 0 20px 12px rgba(255, 255, 255, 1);
		transform: scale(1.2);
		z-index: 100;
		filter: brightness(1);
	}
	60% {
		box-shadow: 0 0 12px 6px rgba(255, 255, 255, 1);
		transform: scale(0.8);
		filter: brightness(0.4);
	}
	90% {
		box-shadow: 0 0 12px 6px rgba(255, 255, 255, 1);
		transform: scale(0.8);
		filter: brightness(0.4);
	}
	100% {
		transform: scale(0.8);
		filter: brightness(0.4);
	}
}
</style>

<style>
.minesweeper-cell .clickable img {
	transition: box-shadow 0.15s ease-in-out;
}

.minesweeper-cell .clickable:hover img {
	cursor: pointer;
	box-shadow: deepskyblue 0 0 5px 1px;
}

.minesweeper-cell img {
	pointer-events: none; /* Prevent image dragging specifically */
}
</style>

<template>
	<modal @close="cancel">
		<template v-slot:header>
			<h2>Minesweeper Draft</h2>
		</template>
		<template v-slot:body>
			<div class="dialog">
				<p>
					Minesweeper Draft is a draft variant where players alternatively pick cards from a partially
					revealed card grid, discovering neighboring cards after each pick.
				</p>
				<div class="dialog-settings">
					<label for="grid-count">Grid Count</label>
					<div>
						<input
							id="grid-count"
							type="number"
							min="1"
							max="99"
							step="1"
							placeholder="Grid Count"
							v-model.number="gridCount"
						/>
						<ResetButton v-model="gridCount" :default-value="defaults.gridCount" />
					</div>
					<label>Grid Size</label>
					<div>
						<input
							type="number"
							v-model.number="gridWidth"
							min="1"
							max="40"
							step="1"
							class="small-number-input"
							placeholder="Grid Width"
						/>
						x
						<input
							type="number"
							v-model.number="gridHeight"
							min="1"
							max="40"
							step="1"
							class="small-number-input"
							placeholder="Grid Height"
						/>
						<font-awesome-icon
							icon="fa-solid fa-undo-alt"
							class="clickable"
							@click="
								gridWidth = defaults.gridWidth;
								gridHeight = defaults.gridHeight;
							"
							style="padding: 0.4em; vertical-align: middle"
							v-tooltip.right="`Reset to default value (${defaults.gridWidth}x${defaults.gridHeight})`"
						></font-awesome-icon>
					</div>
					<label for="picks-input">Picks per Player, per Grid</label>
					<div>
						<input
							id="picks-input"
							type="number"
							min="1"
							:max="40 * 40"
							step="1"
							placeholder="Picks"
							v-model.number="picksPerPlayerPerGrid"
						/>
						<ResetButton v-model="picksPerPlayerPerGrid" :default-value="defaults.picksPerPlayerPerGrid" />
					</div>
					<label for="reveal-border-input">Reveal borders</label>
					<input type="checkbox" id="reveal-border-input" v-model="revealBorders" />
				</div>
			</div>
		</template>
		<template v-slot:footer>
			<div class="actions">
				<button class="confirm" @click="start">Start Minesweeper Draft</button>
				<button class="cancel" @click="cancel">Cancel</button>
			</div>
		</template>
	</modal>
</template>

<script setup lang="ts">
import { ref } from "vue";
import Modal from "./Modal.vue";
import ResetButton from "./ResetButton.vue";

const props = defineProps<{
	defaults: {
		gridCount: number;
		gridWidth: number;
		gridHeight: number;
		picksPerPlayerPerGrid: number;
		revealBorders: boolean;
	};
}>();

const gridCount = ref(props.defaults.gridCount);
const gridWidth = ref(props.defaults.gridWidth);
const gridHeight = ref(props.defaults.gridHeight);
const picksPerPlayerPerGrid = ref(props.defaults.picksPerPlayerPerGrid);
const revealBorders = ref(props.defaults.revealBorders);

const emit = defineEmits<{
	(e: "cancel"): void;
	(
		e: "start",
		gridCount: number,
		revealedCardsCount: number,
		exchangeCount: number,
		roundCount: number,
		removeBasicLands: boolean
	): void;
}>();

const cancel = () => emit("cancel");
const start = () =>
	emit("start", gridCount.value, gridWidth.value, gridHeight.value, picksPerPlayerPerGrid.value, revealBorders.value);
</script>

<style scoped src="../css/start-game-dialog.css" />

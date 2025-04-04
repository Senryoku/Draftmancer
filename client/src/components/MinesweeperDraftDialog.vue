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
							class="small-number-input"
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
							class="small-number-input"
							v-model.number="picksPerPlayerPerGrid"
						/>
						<ResetButton v-model="picksPerPlayerPerGrid" :default-value="defaults.picksPerPlayerPerGrid" />
					</div>
					<label for="reveal-center-input">Reveal center</label>
					<input type="checkbox" id="reveal-center-input" v-model="revealCenter" />
					<label for="reveal-corners-input">Reveal corners</label>
					<input type="checkbox" id="reveal-corners-input" v-model="revealCorners" />
					<label for="reveal-border-input">Reveal borders (except corners)</label>
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

const defaults = {
	gridCount: 4,
	gridWidth: 10,
	gridHeight: 9,
	picksPerPlayerPerGrid: 9,
	revealCenter: true,
	revealCorners: true,
	revealBorders: false,
};

const gridCount = ref(defaults.gridCount);
const gridWidth = ref(defaults.gridWidth);
const gridHeight = ref(defaults.gridHeight);
const picksPerPlayerPerGrid = ref(defaults.picksPerPlayerPerGrid);
const revealCenter = ref(defaults.revealCenter);
const revealCorners = ref(defaults.revealCorners);
const revealBorders = ref(defaults.revealBorders);

const savedValues = localStorage.getItem("draftmancer-minesweeper");
if (savedValues) {
	try {
		const values = JSON.parse(savedValues);
		gridCount.value = values.gridCount ?? defaults.gridCount;
		gridWidth.value = values.gridWidth ?? defaults.gridWidth;
		gridHeight.value = values.gridHeight ?? defaults.gridHeight;
		picksPerPlayerPerGrid.value = values.picksPerPlayerPerGrid ?? defaults.picksPerPlayerPerGrid;
		revealCenter.value = values.revealCenter ?? defaults.revealCenter;
		revealCorners.value = values.revealCorners ?? defaults.revealCorners;
		revealBorders.value = values.revealBorders ?? defaults.revealBorders;
	} catch (err) {
		console.error("Error parsing saved values for Minesweeper Draft: ", err);
	}
}

const emit = defineEmits<{
	(e: "close"): void;
	(
		e: "start",
		gridCount: number,
		gridWidth: number,
		gridHeight: number,
		picksPerPlayerPerGrid: number,
		revealCenter: boolean,
		revealCorners: boolean,
		revealBorders: boolean
	): void;
}>();

const cancel = () => emit("close");
const start = () => {
	localStorage.setItem(
		"draftmancer-minesweeper",
		JSON.stringify({
			gridCount: gridCount.value,
			gridWidth: gridWidth.value,
			gridHeight: gridHeight.value,
			picksPerPlayerPerGrid: picksPerPlayerPerGrid.value,
			revealCenter: revealCenter.value,
			revealCorners: revealCorners.value,
			revealBorders: revealBorders.value,
		})
	);
	emit(
		"start",
		gridCount.value,
		gridWidth.value,
		gridHeight.value,
		picksPerPlayerPerGrid.value,
		revealCenter.value,
		revealCorners.value,
		revealBorders.value
	);
	emit("close");
};
</script>

<style scoped src="../css/start-game-dialog.css" />

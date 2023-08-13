<template>
	<modal @close="cancel">
		<template v-slot:header>
			<h2>Grid Draft</h2>
		</template>
		<template v-slot:body>
			<div class="dialog">
				<p>Grid Draft is a draft variant for two to four players mostly used for drafting cubes.</p>
				<p>
					9-cards boosters are presented one by one in a 3x3 grid and players alternatively chooses a row or a
					column of each booster, resulting in 2 or 3 cards being picked from each booster. The remaining
					cards are discarded.
				</p>
				<p>
					The grid will be refilled once after the first pick at 3 or 4 players, or if 'Two Picks per Grid' is
					enabled at two players.
				</p>
				<div class="dialog-settings">
					<label for="two-picks-input">
						Two Picks per Grid
						<div style="font-size: 0.8em">(only available for 2 players)</div>
					</label>
					<div>
						<input type="checkbox" id="two-picks-input" v-model="twoPicksPerGrid" />
					</div>
					<label for="booster-count-input">Grid count</label>
					<div>
						<input
							id="booster-count-input"
							type="number"
							min="6"
							max="32"
							step="1"
							placeholder="Booster count"
							class="small-number-input"
							v-model.number="boosterCount"
						/>
						<ResetButton v-model="boosterCount" :default-value="18" />
					</div>
				</div>
			</div>
		</template>
		<template v-slot:footer>
			<div class="actions">
				<button class="confirm" @click="start">Start Grid Draft</button>
				<button class="cancel" @click="cancel">Cancel</button>
			</div>
		</template>
	</modal>
</template>

<script setup lang="ts">
import { ref } from "vue";
import Modal from "./Modal.vue";
import ResetButton from "./ResetButton.vue";

const boosterCount = ref(18);
const twoPicksPerGrid = ref(false);

const emit = defineEmits<{
	(e: "close"): void;
	(e: "start", boosterCount: number, twoPicksPerGrid: boolean): void;
}>();

const cancel = () => emit("close");
const start = () => {
	emit("start", boosterCount.value, twoPicksPerGrid.value);
	emit("close");
};
</script>

<style scoped src="../css/start-game-dialog.css" />

<style scoped>
.dialog {
	max-width: min(500px, 100vw);
}
</style>

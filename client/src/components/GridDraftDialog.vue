<template>
	<modal @close="cancel">
		<template v-slot:header>
			<h2>Grid Draft</h2>
		</template>
		<template v-slot:body>
			<div class="dialog">
				<p>Grid Draft is a draft variant for two or three players mostly used for drafting cubes.</p>
				<p>
					9-cards boosters are presented one by one in a 3x3 grid and players alternatively chooses a row or a
					column of each booster, resulting in 2 or 3 cards being picked from each booster. The remaining
					cards are discarded.
				</p>
				<div class="dialog-settings">
					<label for="booster-count-input">Booster count</label>
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

const emit = defineEmits<{
	(e: "cancel"): void;
	(e: "start", boosterCount: number): void;
}>();

const cancel = () => emit("cancel");
const start = () => emit("start", boosterCount.value);
</script>

<style scoped src="../css/start-game-dialog.css" />

<style scoped>
.dialog {
	max-width: min(500px, 100vw);
}
</style>

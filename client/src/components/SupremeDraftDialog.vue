<template>
	<modal @close="cancel">
		<template v-slot:header>
			<h2>Supreme Draft</h2>
		</template>
		<template v-slot:body>
			<div class="dialog">
				<p>Supreme Draft is a solo draft variant.</p>
				<p>Pick {{ pickedCardsPerRound }} cards in each booster and discard the rest!</p>
				<div class="dialog-settings">
					<label for="booster-count-input">Booster count</label>
					<div>
						<input
							id="booster-count-input"
							type="number"
							min="6"
							max="64"
							step="1"
							placeholder="Booster count"
							class="small-number-input"
							v-model.number="boosterCount"
						/>
						<ResetButton v-model="boosterCount" :default-value="18" />
					</div>
				</div>
				<div class="dialog-settings">
					<label for="pick-count-input">Picks per booster</label>
					<div>
						<input
							id="pick-count-input"
							type="number"
							min="1"
							max="64"
							step="1"
							placeholder="Pick count"
							class="small-number-input"
							v-model.number="pickedCardsPerRound"
						/>
						<ResetButton v-model="pickedCardsPerRound" :default-value="2" />
					</div>
				</div>
			</div>
		</template>
		<template v-slot:footer>
			<div class="actions">
				<button class="confirm" @click="start">Start Supreme Draft</button>
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
const pickedCardsPerRound = ref(2);

const emit = defineEmits<{
	(e: "close"): void;
	(e: "start", boosterCount: number, pickedCardsPerRound: number): void;
}>();

const cancel = () => emit("close");
const start = () => {
	emit("start", boosterCount.value, pickedCardsPerRound.value);
	emit("close");
};
</script>

<style scoped src="../css/start-game-dialog.css" />

<style scoped>
.dialog {
	max-width: min(500px, 100vw);
}
</style>

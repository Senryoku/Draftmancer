<template>
	<modal @close="cancel">
		<template v-slot:header>
			<h2>Glimpse Draft</h2>
		</template>
		<template v-slot:body>
			<div class="dialog">
				<p>
					Glimpse Draft (or Burn Draft) is a draft variant where players remove cards from the draft
					(typically 2) alongside each pick. It's mostly used for small and medium sized groups where a
					regular draft makes not much sense.
				</p>
				<div class="dialog-settings">
					<label for="boosters-per-player-input">Boosters per Player</label>
					<div>
						<input
							id="boosters-per-player-input"
							type="number"
							min="3"
							step="1"
							placeholder="Boosters per Player"
							class="small-number-input"
							v-model.number="boostersPerPlayer"
						/>
						<ResetButton v-model="boostersPerPlayer" :default-value="9" />
					</div>
					<label for="burn-count-input">Burned cards per pick</label>
					<div>
						<input
							id="burn-count-input"
							type="number"
							min="1"
							step="1"
							placeholder="Burned cards per pick"
							class="small-number-input"
							v-model.number="burnedCardsPerRound"
						/>
						<ResetButton v-model="burnedCardsPerRound" :default-value="2" />
					</div>
				</div>
			</div>
		</template>
		<template v-slot:footer>
			<div class="actions">
				<button class="confirm" @click="start">Start Glimpse Draft</button>
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
	defaultBoostersPerPlayer: number;
	defaultBurnedCardsPerRound: number;
}>();

const boostersPerPlayer = ref(props.defaultBoostersPerPlayer);
const burnedCardsPerRound = ref(props.defaultBurnedCardsPerRound);

const emit = defineEmits<{
	(e: "close"): void;
	(e: "start", boostersPerPlayer: number, burnedCardsPerRound: number): void;
}>();

const cancel = () => emit("close");
const start = () => {
	emit("start", boostersPerPlayer.value, burnedCardsPerRound.value);
	emit("close");
};
</script>

<style scoped src="../css/start-game-dialog.css" />

<style scoped>
.dialog {
	max-width: min(500px, 100vw);
}
</style>

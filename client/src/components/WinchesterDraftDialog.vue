<template>
	<modal @close="cancel">
		<template v-slot:header>
			<h2>Winchester Draft</h2>
		</template>
		<template v-slot:body>
			<div class="dialog">
				<p>
					Winchester Draft is a draft variant for two players (extensible to more players) similar to Winston
					and Rochester draft where players alternatively pick one of 4 face-up piles of cards, then add one
					card to each pile.
				</p>
				<div class="dialog-settings">
					<label for="boosters-per-player-input">Boosters per Player</label>
					<div>
						<input
							id="boosters-per-player-input"
							type="number"
							min="1"
							max="12"
							step="1"
							placeholder="Boosters per Player"
							class="small-number-input"
							v-model.number="boostersPerPlayer"
						/>
						<ResetButton v-model="boostersPerPlayer" :default-value="3" />
					</div>
				</div>
			</div>
		</template>
		<template v-slot:footer>
			<div class="actions">
				<button class="confirm" @click="start">Start Winchester Draft</button>
				<button class="cancel" @click="cancel">Cancel</button>
			</div>
		</template>
	</modal>
</template>

<script setup lang="ts">
import { ref } from "vue";
import Modal from "./Modal.vue";
import ResetButton from "./ResetButton.vue";

const boostersPerPlayer = ref(3);

const emit = defineEmits<{
	(e: "cancel"): void;
	(e: "start", boostersPerPlayer: number): void;
}>();

const cancel = () => emit("cancel");
const start = () => emit("start", boostersPerPlayer.value);
</script>

<style scoped src="../css/start-game-dialog.css" />

<style scoped>
.dialog {
	max-width: min(500px, 100vw);
}
</style>

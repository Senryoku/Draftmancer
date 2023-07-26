<template>
	<modal @close="cancel">
		<template v-slot:header>
			<h2>Winston Draft</h2>
		</template>
		<template v-slot:body>
			<div class="dialog">
				<p>
					Winston Draft is a draft variant designed for two players, but playable with more participants.
					Players take turns choosing between 3 growing piles of cards, or drawing a random one.
					<br />
					<a href="https://mtg.gamepedia.com/Winston_Draft" target="_blank" rel="noopener nofollow"
						>More information here</a
					>.
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
				<button class="confirm" @click="start">Start Winston Draft</button>
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
	(e: "close"): void;
	(e: "start", boostersPerPlayer: number): void;
}>();

const cancel = () => {
	emit("close");
};
const start = () => {
	emit("start", boostersPerPlayer.value);
	emit("close");
};
</script>

<style scoped src="../css/start-game-dialog.css" />

<style scoped>
.dialog {
	max-width: min(500px, 100vw);
}
</style>

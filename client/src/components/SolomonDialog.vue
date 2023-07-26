<template>
	<modal @close="cancel">
		<template v-slot:header>
			<h2>Solomon Draft</h2>
		</template>
		<template v-slot:body>
			<div class="dialog">
				<p>Solomon Draft is a draft variant for two players that will appeal to 'Fact or Fiction' enjoyers!</p>
				<p>
					In this game mode, a player splits an <strong>{{ cardCount }}</strong
					>-card pack into two face-up piles, with no restrictions on the size of each pile. The second player
					then selects one of the two piles to add to their deck, while the player who made the split keeps
					the remaining pile.
				</p>
				<div class="dialog-settings">
					<label for="card-input">Card Count</label>
					<div>
						<input
							id="card-input"
							type="number"
							min="1"
							max="24"
							step="1"
							placeholder="Card Count"
							class="small-number-input"
							v-model.number="cardCount"
						/>
						<ResetButton v-model="cardCount" :default-value="8" />
					</div>

					<label for="rounds-input">Rounds</label>
					<div>
						<input
							id="rounds-input"
							type="number"
							min="1"
							max="24"
							step="1"
							placeholder="Rounds"
							class="small-number-input"
							v-model.number="roundCount"
						/>
						<ResetButton v-model="roundCount" :default-value="10" />
					</div>
					<label for="remove-basic-lands-input">Remove Basic Lands?</label>
					<input type="checkbox" id="remove-basic-lands-input" v-model.number="removeBasicLands" />
				</div>
			</div>
		</template>
		<template v-slot:footer>
			<div class="actions">
				<button class="confirm" @click="start">Start Solomon Draft</button>
				<button class="cancel" @click="cancel">Cancel</button>
			</div>
		</template>
	</modal>
</template>

<script setup lang="ts">
import { ref } from "vue";
import Modal from "./Modal.vue";
import ResetButton from "./ResetButton.vue";

const cardCount = ref(8);
const roundCount = ref(10);
const removeBasicLands = ref(true);

const emit = defineEmits<{
	(e: "close"): void;
	(e: "start", cardCount: number, roundCount: number, removeBasicLands: boolean): void;
}>();

const cancel = () => emit("close");
const start = () => {
	emit("start", cardCount.value, roundCount.value, removeBasicLands.value);
	emit("close");
};
</script>

<style scoped src="../css/start-game-dialog.css" />

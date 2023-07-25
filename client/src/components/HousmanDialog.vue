<template>
	<modal @close="cancel">
		<template v-slot:header>
			<h2>Start Housman Draft</h2>
		</template>
		<template v-slot:body>
			<div class="dialog">
				<p>Housman Draft is a draft variant with hidden information suited for two players and more.</p>
				<p>
					Each player is dealt a hand of <strong>{{ handSize }}</strong> cards and
					<strong>{{ revealedCardsCount }}</strong> cards are placed face up at the center of the table.
					Players take turns exchanging a card from their hand with a revealed card until each one has made
					<strong>{{ exchangeCount }}</strong> exchanges, at which point players add their hand to their deck
					and the face up cards are discarded. This process is repeated for
					<strong>{{ roundCount }}</strong> rounds.
				</p>
				<div class="dialog-settings">
					<label for="hand-input">Hand Size</label>
					<div>
						<input
							id="hand-input"
							type="number"
							min="1"
							max="24"
							step="1"
							class="swal2-input"
							placeholder="Hand Size"
							v-model.number="handSize"
						/>
						<ResetButton v-model="handSize" :default-value="5" />
					</div>
					<label for="revealed-input">Revealed Cards</label>
					<div>
						<input
							id="revealed-input"
							type="number"
							min="1"
							max="24"
							step="1"
							class="swal2-input"
							placeholder="Revealed Cards"
							v-model.number="revealedCardsCount"
						/>
						<ResetButton v-model="revealedCardsCount" :default-value="9" />
					</div>
					<label for="exchanges-input">Exchanges</label>
					<div>
						<input
							id="exchanges-input"
							type="number"
							min="1"
							max="24"
							step="1"
							class="swal2-input"
							placeholder="Exchanges"
							v-model.number="exchangeCount"
						/>
						<ResetButton v-model="exchangeCount" :default-value="3" />
					</div>
					<label for="rounds-input">Rounds</label>
					<div>
						<input
							id="rounds-input"
							type="number"
							min="1"
							max="24"
							step="1"
							class="swal2-input"
							placeholder="Rounds"
							v-model.number="roundCount"
						/>
						<ResetButton v-model="roundCount" :default-value="9" />
					</div>
					<label for="remove-basic-lands-input"> Remove Basic Lands? </label>
					<input
						type="checkbox"
						id="remove-basic-lands-input"
						class="swal2-input"
						v-model.number="removeBasicLands"
					/>
				</div>
			</div>
		</template>
		<template v-slot:footer>
			<div class="actions">
				<button class="confirm" @click="start">Start Housman Draft</button>
				<button class="cancel" @click="cancel">Cancel</button>
			</div>
		</template>
	</modal>
</template>

<script setup lang="ts">
import { ref } from "vue";
import Modal from "./Modal.vue";
import ResetButton from "./ResetButton.vue";

const handSize = ref(5);
const revealedCardsCount = ref(9);
const exchangeCount = ref(3);
const roundCount = ref(9);
const removeBasicLands = ref(true);

const emit = defineEmits<{
	(e: "cancel"): void;
	(
		e: "start",
		handSize: number,
		revealedCardsCount: number,
		exchangeCount: number,
		roundCount: number,
		removeBasicLands: boolean
	): void;
}>();

const cancel = () => emit("cancel");
const start = () =>
	emit(
		"start",
		handSize.value,
		revealedCardsCount.value,
		exchangeCount.value,
		roundCount.value,
		removeBasicLands.value
	);
</script>

<style scoped src="../css/start-game-dialog.css" />

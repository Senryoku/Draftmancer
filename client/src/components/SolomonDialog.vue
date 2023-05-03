<template>
	<modal @close="cancel">
		<template v-slot:header>
			<h2>Start Solomon Draft</h2>
		</template>
		<template v-slot:body>
			<div class="solomon-dialog">
				<p>Solomon Draft is a draft variant for two players that will appeal to 'Fact or Fiction' enjoyers!</p>
				<p>
					In this game mode, a player splits an <strong>{{ cardCount }}</strong
					>-card pack into two face-up piles, with no restrictions on the size of each pile. The second player
					then selects one of the two piles to add to their deck, while the player who made the split keeps
					the remaining pile.
				</p>
				<div class="solomon-dialog-settings">
					<div>
						<div><label for="card-input">Card Count</label></div>
						<div>
							<input
								id="card-input"
								type="number"
								min="1"
								max="24"
								step="1"
								class="swal2-input"
								placeholder="Card Count"
								v-model.number="cardCount"
							/>
						</div>
					</div>
					<div>
						<div><label for="rounds-input">Rounds</label></div>
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
						</div>
					</div>
					<div>
						<div>
							<label for="remove-basic-lands-input"> Remove Basic Lands? </label>
						</div>
						<input
							type="checkbox"
							id="remove-basic-lands-input"
							class="swal2-input"
							v-model.number="removeBasicLands"
						/>
					</div>
				</div>
			</div>
		</template>
		<template v-slot:footer>
			<div class="actions">
				<button class="cancel" @click="cancel">Cancel</button>
				<button class="confirm" @click="start">Start Solomon Draft</button>
			</div>
		</template>
	</modal>
</template>

<script setup lang="ts">
import { ref } from "vue";
import Modal from "./Modal.vue";

const cardCount = ref(8);
const roundCount = ref(10);
const removeBasicLands = ref(true);

const emit = defineEmits<{
	(e: "cancel"): void;
	(e: "start", cardCount: number, roundCount: number, removeBasicLands: boolean): void;
}>();

const cancel = () => emit("cancel");
const start = () => emit("start", cardCount.value, roundCount.value, removeBasicLands.value);
</script>

<style scoped>
.solomon-dialog {
	text-align: center;
	width: min(60em, 90vw);
}

.solomon-dialog-settings {
	display: table;
	margin: auto;
}

.solomon-dialog-settings > div {
	display: table-row;
}

.solomon-dialog-settings > div > div {
	display: table-cell;
	text-align: center;
	vertical-align: middle;
}

.solomon-dialog-settings label {
	font-size: 1.5em;
}

.solomon-dialog-settings input {
	display: block;
	margin: auto;
}
</style>

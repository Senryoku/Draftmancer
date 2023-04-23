<template>
	<modal @close="cancel">
		<template v-slot:header>
			<h2>Start Solomon Draft</h2>
		</template>
		<template v-slot:body>
			<div class="solomon-dialog">
				<p>Solomon Draft is a draft variant for two players.</p>
				<p>
					<strong>{{ cardCount }}</strong> cards and <strong>{{ roundCount }}</strong> rounds.
				</p>
				<div class="solomon-dialog-settings">
					<div>
						<div><label for="hand-input">Card Count</label></div>
						<div>
							<input
								id="hand-input"
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

const emit = defineEmits<{
	(e: "cancel"): void;
	(e: "start", cardCount: number, roundCount: number): void;
}>();

const cancel = () => emit("cancel");
const start = () => emit("start", cardCount.value, roundCount.value);
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

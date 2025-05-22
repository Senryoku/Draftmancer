<template>
	<modal @close="cancel">
		<template v-slot:header>
			<h2>Silent Auction Draft</h2>
		</template>
		<template v-slot:body>
			<div class="dialog">
				<p>
					Each round a pack will be presented and players will secretly bid on any card (up to their current
					funds). Once all bids are in, they are resolved from left to right. Higher funds then lower card
					count are used as tiebreakers.
				</p>
				<div class="dialog-settings">
					<label for="booster-count-input">Pack count</label>
					<div>
						<input
							id="booster-count-input"
							type="number"
							min="1"
							max="128"
							step="1"
							placeholder="Pack count"
							v-model.number="boosterCount"
						/>
						<ResetButton v-model="boosterCount" :default-value="defaultBoosterCount" />
					</div>
					<label for="starting-funds-input">Starting Funds</label>
					<div>
						<input
							id="starting-funds-input"
							type="number"
							min="1"
							step="1"
							placeholder="Starting Funds"
							v-model.number="startingFunds"
						/>
						<ResetButton v-model="startingFunds" :default-value="defaultStartingFunds" />
					</div>
				</div>
			</div>
		</template>
		<template v-slot:footer>
			<div class="actions">
				<button class="confirm" @click="start">Start Silent Auction Draft</button>
				<button class="cancel" @click="cancel">Cancel</button>
			</div>
		</template>
	</modal>
</template>

<script setup lang="ts">
import { ref } from "vue";
import Modal from "./Modal.vue";
import ResetButton from "./ResetButton.vue";

const props = withDefaults(
	defineProps<{
		defaultBoosterCount: number;
		defaultStartingFunds: number;
	}>(),
	{
		defaultBoosterCount: 18,
		defaultStartingFunds: 200,
	}
);

const boosterCount = ref(props.defaultBoosterCount);
const startingFunds = ref(props.defaultStartingFunds);

const emit = defineEmits<{
	(e: "close"): void;
	(e: "start", boosterCount: number, startingFunds: number): void;
}>();

const cancel = () => emit("close");
const start = () => {
	emit("start", boosterCount.value, startingFunds.value);
	emit("close");
};
</script>

<style scoped src="../css/start-game-dialog.css" />

<style scoped>
.dialog {
	max-width: min(500px, 100vw);
}

input[type="number"] {
	width: 4em;
}
</style>

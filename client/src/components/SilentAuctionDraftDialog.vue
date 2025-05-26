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
					<label for="reserve-price-input">Reserve Price</label>
					<div>
						<input
							id="reserve-price-input"
							type="number"
							min="0"
							step="1"
							placeholder="Reserve Price"
							v-model.number="reservePrice"
						/>
						<ResetButton v-model="reservePrice" :default-value="defaultReservePrice" />
					</div>
					<div class="help">
						Minimum amount for a bid to be valid. Anything higher than 0 means that some cards might be
						discarded.
					</div>
					<label for="price-paid-input">Price Paid</label>
					<div>
						<select id="price-paid-input" v-model="pricePaid">
							<option value="first">First</option>
							<option value="second">Second</option>
						</select>
						<ResetButton v-model="pricePaid" :default-value="'first'" />
					</div>
					<div class="help">
						Example: If bids are 25, 10 and 5, the winner will pay 25 with the first-price option, and 10
						with the second-price option.
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
		defaultStartingFunds?: number;
		defaultReservePrice?: number;
	}>(),
	{
		defaultBoosterCount: 18,
		defaultStartingFunds: 200,
		defaultReservePrice: 0,
	}
);

const boosterCount = ref(props.defaultBoosterCount);
const startingFunds = ref(props.defaultStartingFunds);
const pricePaid = ref<"first" | "second">("first");
const reservePrice = ref(props.defaultReservePrice);

const emit = defineEmits<{
	(e: "close"): void;
	(
		e: "start",
		boosterCount: number,
		startingFunds: number,
		pricePaid: "first" | "second",
		reservePrice: number
	): void;
}>();

const cancel = () => emit("close");
const start = () => {
	emit("start", boosterCount.value, startingFunds.value, pricePaid.value, reservePrice.value);
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

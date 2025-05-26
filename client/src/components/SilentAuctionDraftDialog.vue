<template>
	<modal @close="cancel">
		<template v-slot:header>
			<h2>Silent Auction Draft</h2>
		</template>
		<template v-slot:body>
			<div class="dialog">
				<p>
					Each round a pack will be presented and players will secretly bid on any card (up to their current
					funds). Once all bids are in, they are resolved from left to right.
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
					<div class="tiebreakers">
						<label>Tiebreakers</label>
						<Sortable
							:list="tiebreakers"
							item-key="property"
							:options="{ animation: 200 }"
							class="tiebreakers-list"
							:key="tiebreakers.map((t) => t.property).join('-')"
							@end="(event: SortableEvent) => moveTiebreaker(event.oldIndex!, event.newIndex!)"
						>
							<template #item="{ element }">
								<div class="tiebreaker" :key="element.property">
									<font-awesome-icon icon="fa-solid fa-list" class="draggable" />
									<select v-model="element.property">
										<option
											value="funds"
											v-if="element.property === 'funds' || isAvailable('funds')"
										>
											Funds
										</option>
										<option
											value="cards"
											v-if="element.property === 'cards' || isAvailable('cards')"
										>
											Cards
										</option>
									</select>
									<select v-model="element.winner">
										<option value="higher">Higher</option>
										<option value="lower">Lower</option>
									</select>
									<font-awesome-icon
										icon="fa-solid fa-trash"
										class="clickable"
										@click="removeTiebreaker(element.property)"
									/>
								</div>
							</template>
						</Sortable>
						<div v-if="availableTiebreakers.length > 0"><button @click="addTiebreaker">Add</button></div>
					</div>
					<div class="help">
						Tiebreakers can be re-ordered. If everything is equal, winner will be chosen randomly.
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
import { computed, ref, nextTick } from "vue";
import Modal from "./Modal.vue";
import ResetButton from "./ResetButton.vue";
import { Tiebreaker, TiebreakerProperties } from "../../../src/SilentAuctionDraftTiebreakers";
import { Sortable } from "sortablejs-vue3";
import { SortableEvent } from "sortablejs";

const props = withDefaults(
	defineProps<{
		defaultBoosterCount: number;
		defaultStartingFunds?: number;
		defaultReservePrice?: number;
		defaultTiebreakers?: Tiebreaker[];
	}>(),
	{
		defaultBoosterCount: 18,
		defaultStartingFunds: 200,
		defaultReservePrice: 0,
		defaultTiebreakers: () => [
			{ property: "funds", winner: "higher" },
			{ property: "cards", winner: "lower" },
		],
	}
);

const boosterCount = ref(props.defaultBoosterCount);
const startingFunds = ref(props.defaultStartingFunds);
const pricePaid = ref<"first" | "second">("first");
const reservePrice = ref(props.defaultReservePrice);
const tiebreakers = ref(props.defaultTiebreakers);

const emit = defineEmits<{
	(e: "close"): void;
	(
		e: "start",
		boosterCount: number,
		startingFunds: number,
		pricePaid: "first" | "second",
		reservePrice: number,
		tiebreakers: Tiebreaker[]
	): void;
}>();

const cancel = () => emit("close");
const start = () => {
	emit("start", boosterCount.value, startingFunds.value, pricePaid.value, reservePrice.value, tiebreakers.value);
	emit("close");
};

const availableTiebreakers = computed((): (typeof TiebreakerProperties)[number][] =>
	TiebreakerProperties.filter((p) => !tiebreakers.value.some((t) => t.property === p))
);

function addTiebreaker() {
	if (availableTiebreakers.value.length <= 0) return;
	tiebreakers.value.push({ property: availableTiebreakers.value[0], winner: "higher" });
}

function removeTiebreaker(property: (typeof TiebreakerProperties)[number]) {
	nextTick(() => {
		tiebreakers.value = tiebreakers.value.filter((t) => t.property !== property);
	});
}

function moveTiebreaker(from: number, to: number) {
	const item = tiebreakers.value.splice(from, 1)[0];
	nextTick(() => tiebreakers.value.splice(to, 0, item));
}

function isAvailable(property: (typeof TiebreakerProperties)[number]): boolean {
	return availableTiebreakers.value.includes(property);
}
</script>

<style scoped src="../css/start-game-dialog.css" />

<style scoped>
.dialog {
	max-width: min(500px, 100vw);
}

input[type="number"] {
	width: 4em;
}

.tiebreakers {
	grid-column: span 2;
	width: 100%;
	min-height: 130px;
}

.tiebreakers-list {
	display: flex;
	flex-direction: column;
	justify-items: center;
	align-items: center;
	gap: 0.25em;
	padding: 0.25em;
}

.tiebreaker {
	display: flex;
	align-items: center;
	gap: 0.25em;
	padding: 0.2em 2em;
	background: #383838;
	border-radius: 0.25em;
}
</style>

<template>
	<modal @close="cancel">
		<template v-slot:header>
			<h2>Start Rotisserie Draft</h2>
		</template>
		<template v-slot:body>
			<div class="dialog">
				<p style="max-width: max(400px, 40vw)">
					Rotisserie is a draft variant where each player chooses cards from a common pool.
				</p>
				<p style="max-width: max(400px, 40vw)">
					Traditionally the card pool is composed of a single copy of each card from one or multiple sets
					('singleton' mode), but a 'standard' collation it also available where the final card pool is
					gathered from regular packs.<br />
					In both cases most session settings still apply.
				</p>
				<div class="dialog-settings">
					<div>
						<label for="collation-type">Collation Type</label>
						<select class="swal2-input" v-model="collationType">
							<option value="singleton">Singleton</option>
							<option value="standard">Standard</option>
						</select>
					</div>
					<div v-if="collationType === 'singleton'">
						<label for="cards-per-player">Cards per Player</label>
						<input
							type="number"
							min="1"
							step="1"
							id="cards-per-player"
							class="swal2-input"
							placeholder="Cards per Player"
							v-model.number="cardsPerPlayer"
						/>
					</div>
					<div v-if="collationType === 'singleton'">
						<label for="exact-card-count">
							Distribute only the necessary number of cards<br />
							<small> ({{ cardsPerPlayer }} cards per player, as opposed to the whole card pool) </small>
						</label>
						<input
							type="checkbox"
							id="exact-card-count"
							class="swal2-input"
							v-model.number="exactCardCount"
						/>
					</div>
					<div v-if="collationType === 'standard'">
						<label for="boosters-per-player">Boosters per Player</label>
						<input
							type="number"
							min="1"
							step="1"
							id="boosters-per-player"
							class="swal2-input"
							placeholder="Boosters per Player"
							v-model.number="boostersPerPlayer"
						/>
					</div>
				</div>
			</div>
		</template>
		<template v-slot:footer>
			<div class="actions">
				<button class="cancel" @click="cancel">Cancel</button>
				<button class="confirm" @click="start">Start</button>
			</div>
		</template>
	</modal>
</template>

<script setup lang="ts">
import { ref, toRefs } from "vue";
import { RotisserieDraftStartOptions } from "../../../src/RotisserieDraft";
import Modal from "./Modal.vue";

const props = withDefaults(
	defineProps<{
		defaultBoostersPerPlayer: number;
	}>(),
	{ defaultBoostersPerPlayer: 3 }
);
const { defaultBoostersPerPlayer } = toRefs(props);

enum CollationType {
	singleton = "singleton",
	standard = "standard",
}

const collationType = ref(CollationType.singleton);
const cardsPerPlayer = ref(45);
const exactCardCount = ref(false);
const boostersPerPlayer = ref(defaultBoostersPerPlayer.value ?? 3);

const emit = defineEmits<{
	(e: "cancel"): void;
	(e: "start", options: RotisserieDraftStartOptions): void;
}>();

// Methods
const cancel = () => emit("cancel");
const start = () => {
	let options;
	switch (collationType.value) {
		case CollationType.singleton:
			options = { singleton: { cardsPerPlayer: cardsPerPlayer.value, exactCardCount: exactCardCount.value } };
			break;
		case CollationType.standard:
			options = { standard: { boostersPerPlayer: boostersPerPlayer.value } };
			break;
	}
	emit("start", options);
};
</script>

<style scoped>
.dialog {
	text-align: center;
}

.dialog-settings {
	display: table;
	margin: auto;
	border-spacing: 1em;
}
.dialog-settings > div {
	display: table-row;
}
.dialog-settings > div > * {
	display: table-cell;
	text-align: left;
	vertical-align: middle;
}
.dialog-settings > div > *:nth-child(1) {
	width: 15em;
	max-width: inherit;
}
.dialog-settings > div > *:nth-child(2) {
	width: 200px;
	max-width: inherit;
}
</style>

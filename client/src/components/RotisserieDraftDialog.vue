<template>
	<modal @close="cancel">
		<template v-slot:header>
			<h2>Rotisserie Draft</h2>
		</template>
		<template v-slot:body>
			<div class="dialog">
				<p>Rotisserie is a draft variant where each player chooses cards from a common pool.</p>
				<p>
					Traditionally the card pool is composed of a single copy of each card from one or multiple sets
					('singleton' mode), but a 'standard' collation it also available where the final card pool is
					gathered from regular packs.<br />
					In both cases most session settings still apply.
				</p>
				<div class="dialog-settings">
					<label for="collation-type">Collation Type</label>
					<select class="swal2-input" v-model="collationType">
						<option value="singleton">Singleton</option>
						<option value="standard">Standard</option>
					</select>
					<template v-if="collationType === 'singleton'">
						<label for="cards-per-player">Cards per Player</label>
						<div>
							<input
								type="number"
								min="1"
								step="1"
								id="cards-per-player"
								placeholder="Cards per Player"
								v-model.number="cardsPerPlayer"
							/>
							<ResetButton v-model="cardsPerPlayer" :default-value="45" />
						</div>
					</template>
					<template v-if="collationType === 'singleton'">
						<label for="exact-card-count">
							Distribute only the necessary number of cards<br />
							<small> ({{ cardsPerPlayer }} cards per player, as opposed to the whole card pool) </small>
						</label>
						<input type="checkbox" id="exact-card-count" v-model.number="exactCardCount" />
					</template>
					<template v-if="collationType === 'standard'">
						<label for="boosters-per-player">Boosters per Player</label>
						<div>
							<input
								type="number"
								min="1"
								step="1"
								id="boosters-per-player"
								placeholder="Boosters per Player"
								v-model.number="boostersPerPlayer"
							/>
							<ResetButton v-model="boostersPerPlayer" :default-value="defaultBoostersPerPlayer" />
						</div>
					</template>
				</div>
			</div>
		</template>
		<template v-slot:footer>
			<div class="actions">
				<button class="confirm" @click="start">Start Rotisserie Draft</button>
				<button class="cancel" @click="cancel">Cancel</button>
			</div>
		</template>
	</modal>
</template>

<script setup lang="ts">
import { ref, toRefs } from "vue";
import { RotisserieDraftStartOptions } from "@/RotisserieDraft";
import Modal from "./Modal.vue";
import ResetButton from "./ResetButton.vue";

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

<style scoped src="../css/start-game-dialog.css" />

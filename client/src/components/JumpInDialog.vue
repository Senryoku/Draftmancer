<template>
	<modal @close="cancel">
		<template v-slot:header>
			<h2>Jump In!</h2>
		</template>
		<template v-slot:body>
			<div class="dialog">
				<p>Select one of multiple sets:</p>
				<div class="sets">
					<div v-for="set in Sets" :key="set" class="set">
						<input
							type="checkbox"
							:id="set"
							:checked="sets.includes(set)"
							@change="sets.includes(set) ? sets.splice(sets.indexOf(set), 1) : sets.push(set)"
						/>
						<label :for="set">
							<img class="set-icon" :src="SetsInfos[set].icon" />
							<span>{{ SetsInfos[set].fullName }}</span>
						</label>
					</div>
				</div>
			</div>
		</template>
		<template v-slot:footer>
			<div class="actions">
				<button class="confirm" @click="start" :disabled="sets.length === 0">Start</button>
				<button class="cancel" @click="cancel">Cancel</button>
			</div>
		</template>
	</modal>
</template>

<script setup lang="ts">
import { ref } from "vue";

import Modal from "./Modal.vue";

import SetsInfos from "../../../src/SetInfos";

const Sets = ["blb", "otj", "mkm", "lci", "woe", "ltr", "one", "bro"];

const sets = ref<string[]>(["blb", "otj", "mkm", "lci", "woe", "ltr", "one", "bro"]);

const emit = defineEmits<{
	(e: "close"): void;
	(e: "start", set: string[]): void;
}>();

const cancel = () => emit("close");
const start = () => {
	emit("start", sets.value);
	emit("close");
};
</script>

<style scoped src="../css/start-game-dialog.css" />

<style scoped>
.dialog {
	max-width: min(500px, 100vw);
}

.sets {
	display: flex;
	flex-direction: column;
	gap: 0.5em;
	margin: 1em;
}

.set {
	display: flex;
	justify-content: space-between;
}

.set .set-icon {
	--invertedness: 100%;
}

.set label {
	flex-grow: 1;

	height: 2em;
	display: flex;
	gap: 0.5em;
	align-items: center;
}
</style>

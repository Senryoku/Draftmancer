<template>
	<modal @close="cancel">
		<template v-slot:header>
			<h2>Jump In!</h2>
		</template>
		<template v-slot:body>
			<div class="dialog">
				<p>Choose a set:</p>
				<div class="sets">
					<div v-for="set in Sets" :key="set">
						<button class="set" @click="() => start(set)">
							<img class="set-icon" :src="SetsInfos[set].icon" />
							<span>{{ SetsInfos[set].fullName }}</span>
						</button>
					</div>
				</div>
			</div>
		</template>
		<template v-slot:footer>
			<div class="actions">
				<button class="cancel" @click="cancel">Cancel</button>
			</div>
		</template>
	</modal>
</template>

<script setup lang="ts">
import Modal from "./Modal.vue";

import SetsInfos from "../../../src/SetInfos";

const Sets = ["blb", "otj", "mkm", "lci", "woe", "ltr", "one", "bro"];

const emit = defineEmits<{
	(e: "close"): void;
	(e: "start", set: string): void;
}>();

const cancel = () => emit("close");
const start = (set: string) => {
	emit("start", set);
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

#main-container .sets button.set {
	width: 100%;
	height: 3.5em;
}

.set .set-icon {
	--invertedness: 100%;
	float: left;
}

.set span {
	margin-left: 2em;
	margin-right: 2em;
}
</style>

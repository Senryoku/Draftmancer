<template>
	<modal @close="cancel">
		<template v-slot:header>
			<h2>Jump In!</h2>
		</template>
		<template v-slot:body>
			<div class="dialog">
				<div>Select one or multiple sets:</div>
				<div style="display: flex; justify-content: space-evenly">
					<button @click="all">All</button>
					<button @click="current">Current</button>
					<button @click="jumpIntoMiddleEarth">Jump into Middle-Earth</button>
					<button @click="firstRotation">First Rotation</button>
					<button @click="initial">Initial</button>
					<button @click="none">None</button>
				</div>
				<div class="sets">
					<div v-for="set in Sets" :key="set" class="set">
						<input
							type="checkbox"
							:id="set"
							:checked="sets.includes(set)"
							@change="sets.includes(set) ? sets.splice(sets.indexOf(set), 1) : sets.push(set)"
						/>
						<label :for="set">
							<img class="set-icon" :src="setInfo(set).icon" />
							<span>{{ setInfo(set).fullName }}</span>
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

const Sets = [
	"fdn",
	"dsk",
	"blb",
	"otj",
	"mkm",
	"lci",
	"woe",
	"ltr",
	"jime",
	"mom",
	"one",
	"bro",
	"dmu",
	"hbg",
	"snc",
	"neo",
	"vow",
	"mid",
	"afr",
	"stx",
	"khm",
	"znr",
];
const CurrentSets = ["fdn", "dsk", "blb", "otj", "mkm", "lci", "woe", "ltr", "mom", "one", "bro", "dmu"];

const sets = ref<string[]>([...CurrentSets]);

const emit = defineEmits<{
	(e: "close"): void;
	(e: "start", set: string[]): void;
}>();

const cancel = () => emit("close");
const start = () => {
	emit("start", sets.value);
	emit("close");
};

function setInfo(set: string) {
	if (set === "jime") return { fullName: "Jump Into Middle-Earth", icon: SetsInfos["ltr"].icon };
	return SetsInfos[set];
}

function all() {
	sets.value = Sets;
}

function current() {
	sets.value = [...CurrentSets];
}

function jumpIntoMiddleEarth() {
	sets.value = ["ltr", "jime"];
}

function firstRotation() {
	sets.value = ["snc", "neo", "vow", "mid", "afr", "stx", "khm", "znr"];
}

function initial() {
	sets.value = ["mid", "afr", "stx", "khm", "znr"];
}

function none() {
	sets.value = [];
}
</script>

<style scoped src="../css/start-game-dialog.css" />

<style scoped>
.sets {
	display: flex;
	flex-direction: column;
	gap: 0.5em;
	margin: 0.5em 1em;
	max-height: 60vh;
	overflow-y: scroll;

	padding: 0.5em 1em;
	background: rgba(0, 0, 0, 0.1);
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

	height: 1.5em;
	display: flex;
	gap: 0.5em;
	align-items: center;
}
</style>

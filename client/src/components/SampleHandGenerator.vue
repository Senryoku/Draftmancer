<template>
	<div>
		<div class="toolbar">
			<div>Hand: {{ hand.length }}</div>
			<div>Deck: {{ library.length }}</div>
			<button @click="newHand">New Hand</button>
			<button @click="drawCard" :disabled="library.length < 1">Draw Card</button>
		</div>
		<div class="hand">
			<card v-for="card in hand" :card="card" :language="language" :key="card.uniqueID"></card>
		</div>
	</div>
</template>

<script setup lang="ts">
import { ref, onMounted } from "vue";
import { Language } from "@/Types";
import { UniqueCard, toUnique, CardColor } from "../../../src/CardTypes";
import Card from "./Card.vue";
import { shuffleArray } from "../helper";

import BasicLands from "../DefaultBasicLands";

const props = defineProps<{
	language: Language;
	deck: UniqueCard[];
	lands: Record<CardColor, number>;
}>();

const library = ref<UniqueCard[]>([]);
const hand = ref<UniqueCard[]>([]);

function getBasicLands(): UniqueCard[] {
	return Object.values(CardColor).flatMap((c) => {
		const count = props.lands?.[c] ?? 0;
		return new Array(count).fill(null).map(() => toUnique(BasicLands[c]));
	});
}

function drawCard() {
	if (library.value.length <= 0) return;
	hand.value.push(library.value.shift()!);
}

function newHand() {
	// Copy library from passed deck, then shuffle it
	library.value = [...props.deck, ...getBasicLands()];
	shuffleArray(library.value);
	hand.value = library.value.splice(0, Math.min(7, library.value.length));
}

onMounted(() => {
	newHand();
});
</script>

<style scoped>
.toolbar {
	display: flex;
	justify-content: flex-end;
	align-items: center;
	gap: 1em;
	margin-bottom: 0.5em;
}

.hand {
	display: flex;
	flex-wrap: wrap;
	align-items: flex-start;
	justify-content: center;
	gap: 10px;
	width: calc(200px * 7 + 60px);
	height: 574px;
}
</style>

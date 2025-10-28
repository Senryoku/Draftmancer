<template>
	<div class="card-column" v-show="column.length > 0">
		<CardComponent v-for="card in column" :key="card.uniqueID" :card="card" :language="language" :lazyLoad="true">
			<div v-if="checkcollection && missingCard[card.id] !== 'Present'" class="collection-warning">
				<font-awesome-icon
					icon="fa-solid fa-exclamation-triangle"
					class="green"
					v-if="missingCard[card.id] === 'Equivalent'"
					v-tooltip="'Exact card is missing from your collection, but you own a copy from another set.'"
				/>
				<font-awesome-icon
					icon="fa-solid fa-exclamation-triangle"
					class="yellow"
					v-else-if="missingCard[card.id] === 'Missing'"
					v-tooltip="'You do not own this card in MTGA.'"
				/>
				<font-awesome-icon
					icon="fa-solid fa-exclamation-triangle"
					class="red"
					v-else-if="missingCard[card.id] === 'NonExistent'"
					v-tooltip="'This card is not available on MTGA.'"
				/>
			</div>
			<div v-if="card.count && card.count > 1" class="card-count">{{ card.count }} x</div>
		</CardComponent>
	</div>
</template>

<script setup lang="ts">
import { Language } from "@/Types";
import { computed } from "vue";
import { UniqueCard, CardID, PlainCollection } from "@/CardTypes";
import MTGAAlternates from "../MTGAAlternates";
import CardComponent from "./Card.vue";

const props = withDefaults(
	defineProps<{
		column: (UniqueCard & { count: number })[];
		language: Language;
		checkcollection?: boolean;
		collection?: PlainCollection;
	}>(),
	{
		checkcollection: false,
		collection: undefined,
	}
);

const missingCard = computed(() => {
	if (!props.collection) return {};

	let r: { [cid: CardID]: "Present" | "Missing" | "NonExistent" | "Equivalent" } = {};
	for (let card of props.column) {
		if (card.arena_id && card.arena_id in props.collection) {
			r[card.id] = "Present";
		} else {
			const alternates = MTGAAlternates[card.name];
			if (!alternates || alternates.length === 0) r[card.id] = "NonExistent";
			else if (alternates.some((cid) => props.collection![cid] > 0)) r[card.id] = "Equivalent";
			else r[card.id] = "Missing";
		}
	}
	return r;
});
</script>

<style scoped>
.card-column {
	-webkit-column-break-inside: avoid;
	page-break-inside: avoid;
	break-inside: avoid;
}

.collection-warning {
	pointer-events: all;
	position: absolute;
	top: 0.55em;
	left: -0.25em;
	z-index: 1;
	text-shadow: 0 0 3px black;
}

.card-count {
	position: absolute;
	top: 0.55em;
	left: -1.5em;
	text-shadow: 0 0 3px black;
}
</style>

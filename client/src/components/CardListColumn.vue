<template>
	<div class="card-column" v-show="column.length > 0">
		<card v-for="(card, index) in column" :key="index" :card="card" :language="language" :lazyLoad="true">
			<div v-if="checkcollection && missingCard[card.id] !== 'Present'" class="collection-warning">
				<i
					class="fas fa-exclamation-triangle green"
					v-if="missingCard[card.id] === 'Equivalent'"
					v-tooltip="'Exact card is missing from your collection, but you own a copy from another set.'"
				></i>
				<i
					class="fas fa-exclamation-triangle yellow"
					v-else-if="missingCard[card.id] === 'Missing'"
					v-tooltip="'You do not own this card in MTGA.'"
				></i>
				<i
					class="fas fa-exclamation-triangle red"
					v-else-if="missingCard[card.id] === 'NonExistent'"
					v-tooltip="'This card is not available on MTGA.'"
				></i>
			</div>
		</card>
	</div>
</template>

<script>
import MTGAAlternates from "../MTGAAlternates.js";
import Card from "./Card.vue";

export default {
	props: {
		column: { type: Array, required: true },
		language: { type: String, required: true },
		checkcollection: { type: Boolean },
		collection: { type: Object },
	},
	components: { Card },
	computed: {
		missingCard: function() {
			let r = {};
			for (let card of this.column) {
				if (card.arena_id in this.collection) {
					r[card.id] = "Present";
				} else {
					const alternates = MTGAAlternates[card.name];
					if (!alternates || alternates.length === 0) r[card.id] = "NonExistent";
					else if (alternates.some(cid => this.collection[cid] > 0)) r[card.id] = "Equivalent";
					else r[card.id] = "Missing";
				}
			}
			return r;
		},
	},
};
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
</style>

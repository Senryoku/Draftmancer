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
			</div>
		</card>
	</div>
</template>

<script>
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
		missingCard: function () {
			let r = {};
			// FIXME
			const collectionCards = Object.keys(this.collection).map((cid) => Cards[cid]);
			for (let card of this.column) {
				if (card.id in this.collection) {
					r[card.id] = "Present";
				} else {
					if (collectionCards.find((c) => c && c.name === card.name)) r[card.id] = "Equivalent";
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
}

.collection-warning i {
	text-shadow: 0 0 3px black;
}
</style>
<template>
	<div class="card-column" v-show="column.length > 0">
		<card v-for="(card, index) in column" :key="index" :card="card" :language="language">
			<div v-if="checkcollection && !(card.id in collection)" class="collection-warning">
				<i class="fas fa-exclamation-triangle yellow"></i>
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
};
</script>

<style scoped>
.card-column {
	-webkit-column-break-inside: avoid;
	page-break-inside: avoid;
	break-inside: avoid;
}
</style>
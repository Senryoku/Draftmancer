<template>
	<div class="card-column" v-show="column.length > 0">
		<div v-for="(card, index) in column" :key="index" class="card card-wrapper">
			<div v-if="checkcollection && !(card.id in collection)" class="collection-warning">
				<i class="fas fa-exclamation-triangle yellow"></i>
			</div>
			<card :card="card" :language="language"></card>
		</div>
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
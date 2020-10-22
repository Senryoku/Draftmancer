<template>
	<div class="card-container">
		<card
			v-for="(card, index) in pick.booster"
			:key="index"
			:card="card"
			:language="language"
			:class="{ 'selected-high': pick.pick === card, burned: pick.burn && pick.burn.includes(card) }"
			:lazyLoad="true"
		></card>
	</div>
</template>

<script>
import Card from "./Card.vue";

export default {
	name: "DraftLogPick",
	components: { Card },
	props: {
		pick: { type: Object, required: true },
		language: { type: String, required: true },
	},
};
</script>

<style scoped>
.card {
	margin: 0.75em;
}
</style>

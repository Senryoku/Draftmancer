<template>
	<div>
		<div class="section-title">
			<h2>Team Sealed</h2>
			Your Team: [[TODO]]
		</div>
		<card-pool :language="language" :cards="cards" :click="onCardClick" :readOnly="true"></card-pool>
	</div>
</template>

<script>
import CardPool from "./CardPool.vue";

export default {
	components: { CardPool },
	props: {
		language: { type: String, required: true },
		cards: { type: Array, required: true },
	},
	methods: {
		onCardClick(event, card) {
			console.log("teamSealedPick", card);
			this.$emit("pick", card.id);
		},
	},
};
</script>

<style></style>

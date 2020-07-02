<template>
	<div
		class="card"
		:data-arena-id="card.id"
		:data-cmc="card.cmc"
		@click="$emit('click')"
		@dblclick="$emit('dblclick')"
		:key="`card-${card.uniqueID}`"
	>
		<card-image :card="card" :language="language"></card-image>
		<slot></slot>
	</div>
</template>

<script>
import CardImage from "./CardImage.vue";
export default {
	name: "Card",
	components: { CardImage },
	props: {
		card: { type: Object, required: true },
		language: { type: String, default: "en" },
	},
};
</script>

<style scoped>
.card {
	display: inline-block;
	position: relative;
	text-align: center;
}
</style>

<template>
	<div class="card-container">
		<card-image
			v-for="(card, index) in pick.booster"
			:key="index"
			:card="$root.cards[card]"
			:language="$root.language"
			:class="{ 'selected-high': pick.pick === card, burned: pick.burn && pick.burn.includes(card) }"
			class="card"
		></card-image>
	</div>
</template>

<script>
import CardImage from "./CardImage.vue";

export default {
	name: "DraftLogPick",
	components: { CardImage },
	props: { pick: { type: Object, required: true } },
};
</script>

<template>
	<div class="card-container">
		<Card
			v-for="(card, index) in pick.booster"
			:key="index"
			:card="$root.cards[card]"
			:language="$root.language"
			:class="{ 'selected-high': pick.pick === card, burned: pick.burn && pick.burn.includes(card) }"
		></Card>
	</div>
</template>

<script>
import Card from "./Card.vue";

export default {
	name: "DraftLogPick",
	components: { Card },
	props: { pick: { type: Object, required: true } },
};
</script>

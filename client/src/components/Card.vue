<template>
	<div
		class="card"
		:class="{ clickable: selectcard }"
		:data-arena-id="card.id"
		:data-cmc="card.cmc"
		@click="selectcard($event, card)"
		@dblclick="ondblclick($event, card)"
	>
		<card-image :card="card" :language="language"></card-image>
		<template v-if="canbeburned && !selected">
			<div v-if="burned" class="restore-card blue clickable" @click="restore($event, card)">
				<i class="fas fa-undo-alt fa-2x"></i>
			</div>
			<div v-else class="burn-card red clickable" @click="burn($event, card)">
				<i class="fas fa-ban fa-2x"></i>
			</div>
		</template>
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
		selectcard: { type: Function, default: function() {} },
		selected: { type: Boolean, default: false },
		ondblclick: { type: Function, default: function() {} },
		burn: { type: Function, default: function() {} },
		restore: { type: Function, default: function() {} },
		canbeburned: { type: Boolean, default: false },
		burned: { type: Boolean, default: false },
	},
};
</script>

<style src="./Card.css"></style>

<style scoped>
.burned {
	-webkit-box-shadow: 0px 0px 20px 1px rgb(161, 0, 3);
	-moz-box-shadow: 0px 0px 20px 1px rgb(161, 0, 3);
	box-shadow: 0px 0px 20px 1px rgb(161, 0, 3);
}

.burn-card,
.restore-card {
	position: absolute;
	left: 0;
	bottom: 0;
	text-shadow: 0 0 3px black, 0 0 4px white;
}
</style>

<template>
	<card
		:card="card"
		:language="language"
		:class="{ selected: selected, burned: burned }"
		@click="$emit('click')"
		@dblclick="$emit('dblclick')"
	>
		<template v-if="canbeburned && !selected">
			<div v-if="burned" class="restore-card blue clickable" @click="$emit('restore')">
				<i class="fas fa-undo-alt fa-2x"></i>
			</div>
			<div v-else class="burn-card red clickable" @click="$emit('burn')">
				<i class="fas fa-ban fa-2x"></i>
			</div>
		</template>
	</card>
</template>

<script>
import Card from "./Card.vue";
export default {
	name: "BoosterCard",
	components: { Card },
	props: {
		card: { type: Object, required: true },
		language: { type: String, default: "en" },
		selected: { type: Boolean, default: false },
		canbeburned: { type: Boolean, default: false },
		burned: { type: Boolean, default: false },
	},
};
</script>

<style scoped>
.card {
	margin: 0.75em;
	transition: transform 0.08s ease-out;
}

.card:hover {
	transform: scale(1.08);
}

.burn-card,
.restore-card {
	position: absolute;
	left: 0;
	bottom: 0;
	text-shadow: 0 0 3px black, 0 0 4px white;
}
</style>

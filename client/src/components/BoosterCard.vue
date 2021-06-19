<template>
	<card :card="card" :language="language" :class="{ selected: selected, burned: burned }" class="booster-card">
		<div
			v-if="wildcardneeded"
			class="collection-status"
			v-tooltip.top="
				`Playing this card will cost you a wildcard. ${
					hasenoughwildcards ? '' : 'Not enough wildcards of this type!'
				}`
			"
		>
			<i class="fas fa-exclamation-triangle yellow missing-warning" v-if="!hasenoughwildcards"></i>
			<img class="wildcard-icon" :src="`img/wc_${card.rarity}.png`" />
		</div>
		<template v-if="canbeburned && !selected">
			<div v-if="burned" class="restore-card blue clickable" @click="restoreCard($event)">
				<i class="fas fa-undo-alt fa-2x"></i>
			</div>
			<div v-else class="burn-card red clickable" @click="burnCard($event)">
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
		wildcardneeded: { type: Boolean, default: false },
		hasenoughwildcards: { type: Boolean, default: true },
	},
	methods: {
		burnCard: function(e) {
			this.$emit("burn");
			e.stopPropagation();
			e.preventDefault();
		},
		restoreCard: function(e) {
			this.$emit("restore");
			e.stopPropagation();
			e.preventDefault();
		},
	},
};
</script>

<style scoped>
.card {
	margin: 0.75em;
	transition: transform 0.08s ease-out;
	will-change: transform;
}

.card:hover {
	z-index: 10;
}

.missing-warning {
	position: absolute;
	left: -0.5em;
	top: 50%;
	transform: translateY(-50%);
	font-size: 0.7em;
	opacity: 70%;
}

.fade-enter-active.card,
.fade-leave-active.card {
	transition: transform 0.5s ease, opacity 0.5s ease;
}

.burn-card,
.restore-card {
	position: absolute;
	left: 0;
	bottom: 0;
	text-shadow: 0 0 3px black, 0 0 4px white;
}

.collection-status {
	position: absolute;
	left: 1rem;
	top: -0.8rem;
	font-family: Calibri;
	color: #888;
	background-color: black;
	font-size: 0.8em;
	width: 2.5rem;
	height: 1rem;
	line-height: 1rem;
	border-radius: 1.25rem 1.25rem 0 0 / 0.8rem 0.8rem 0 0;
	font-weight: 600;
	cursor: default;
	overflow: visible;
}

.collection-status.warn {
	color: #ffffb3;
}
</style>

<style>
.booster-card:not(.zoomedin) {
	transition: transform 0.08s ease-out;
}

.booster-card:hover:not(.zoomedin) {
	transform: scale(1.08);
}
</style>

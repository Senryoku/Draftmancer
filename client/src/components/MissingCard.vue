<template>
	<div class="card">
		<card-image :card="card" :language="language"></card-image>
		<div class="not-booster" v-if="!card.in_booster">Can't be obtained in boosters.</div>
		<div class="card-count" v-if="card.count < 4">x{{ 4 - card.count }}</div>
	</div>
</template>

<script>
import CardImage from "./CardImage.vue";
export default {
	name: "MissingCard",
	components: { CardImage },
	props: {
		card: { type: Object, required: true },
		language: { type: String, default: "en" },
	},
};
</script>

<style src="./Card.css"></style>

<style scoped>
.card-count {
	position: absolute;
	right: 1em;
	bottom: 1em;
	background: rgba(0, 0, 0, 0.5);
	width: 1.5em;
	height: 1.5em;
	border-radius: 0.75em;
	line-height: 1.5em;
	text-align: center;
}

.not-booster {
	position: absolute;
	left: 1em;
	bottom: 1em;
	font-size: 0.6em;
	font-weight: bold;
	color: red;
	background-color: rgba(255, 255, 255, 0.8);
	padding: 0.2em;
	border-radius: 0.2em;
}
</style>

<template>
	<div class="last-picks" v-if="picks && picks.length > 0">
		<span class="last-picks-title">Last Picks</span>
		<transition-group tag="div" name="vertical-queue" style="display: flex; flex-direction: column">
			<div v-for="p in picks" class="pick-remainder vertical-queue-item" :key="p.round">
				{{ p.userName }}
				<div class="card-column">
					<card v-for="c in p.cards" :card="c" :key="c.uniqueID"></card>
				</div>
			</div>
		</transition-group>
	</div>
</template>

<script>
import Card from "./Card.vue";

export default {
	components: { Card },
	props: {
		picks: { type: Array, required: true },
	},
};
</script>

<style scoped>
.last-picks {
	display: flex;
	align-items: center;
	text-align: center;
	flex-direction: column;
	justify-content: center;
	position: relative;

	opacity: 0.25;
	transition: opacity 0.5s;
}

.last-picks:hover {
	opacity: 1;
}

.last-picks-title {
	font-variant: small-caps;
	margin: 0.5em;
}

.pick-remainder {
	padding: 0.25em 0.5em;
}

.card-column {
	min-height: initial;
	margin: 0;
}

.vertical-queue-item {
	transition: transform 1s;
}

.vertical-queue-item {
	transition: all 1s;
	display: inline-block;
}

.vertical-queue-enter,
.vertical-queue-leave-to {
	opacity: 0;
	z-index: -1;
}

.vertical-queue-enter {
	transform: translateY(-400px);
}

.vertical-queue-leave-to {
	transform: translateY(400px);
}

.vertical-queue-leave-active {
	position: absolute;
	bottom: 0;
}
</style>

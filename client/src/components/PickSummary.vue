<template>
	<div class="last-picks">
		<span class="last-picks-title">Last Picks</span>
		<template v-if="picks && picks.length > 0">
			<transition-group tag="div" name="vertical-queue" class="vertical-queue" mode="">
				<div v-for="p in picks" class="pick-remainder vertical-queue-item" :key="p.round">
					{{ p.userName }}
					<div class="card-column">
						<card v-for="c in p.cards" :card="c" :key="c.uniqueID"></card>
					</div>
				</div>
			</transition-group>
		</template>
		<template v-else>
			<span>(No picks yet)</span>
		</template>
	</div>
</template>

<script setup lang="ts">
import { PickSummary } from "@/PickSummary";
import Card from "./Card.vue";

const props = defineProps<{
	picks: PickSummary[];
}>();
</script>

<style scoped>
.last-picks {
	display: flex;
	align-items: center;
	text-align: center;
	flex-direction: column;
	justify-content: center;
	position: relative;
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

.vertical-queue {
	overflow: hidden;
}
</style>

<style src="../css/vertical-queue.css" scoped />

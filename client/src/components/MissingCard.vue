<template>
	<Card :card="uniqueCard" :language="language" :lazyLoad="true">
		<div class="not-booster" v-if="!card.in_booster">Can't be obtained in boosters.</div>
		<div class="card-count" v-if="card.count < 4">x{{ 4 - card.count }}</div>
	</Card>
</template>

<script lang="ts">
import { PropType, defineComponent } from "vue";
import type { Card } from "@/CardTypes";
import { toUnique } from "../../../src/CardTypes";
import { Language } from "@/Types";
import CardComponent from "./Card.vue";

export default defineComponent({
	name: "MissingCard",
	components: { Card: CardComponent },
	props: {
		card: { type: Object as PropType<Card & { count: number }>, required: true },
		language: { type: String as PropType<Language>, default: "en" },
	},
	computed: {
		uniqueCard() {
			return toUnique(this.card);
		},
	},
});
</script>

<style scoped>
.card {
	margin: 0.75em;
}

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

<template>
	<CardComponent :card="uniqueCard" :language="language" :lazyLoad="true">
		<div class="not-booster" v-if="!card.in_booster">Can't be obtained in boosters.</div>
		<div class="card-count" v-if="card.count < 4">x{{ 4 - card.count }}</div>
	</CardComponent>
</template>

<script setup lang="ts">
import { computed } from "vue";
import type { Card } from "@/CardTypes";
import { toUnique } from "../../../src/CardTypes";
import { Language } from "../../../src/Types";
import CardComponent from "./Card.vue";

const props = withDefaults(
	defineProps<{
		card: Card & { count: number };
		language?: Language;
	}>(),
	{
		language: Language.en,
	}
);

const uniqueCard = computed(() => toUnique(props.card));
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

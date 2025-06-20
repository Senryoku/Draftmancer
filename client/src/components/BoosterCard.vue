<template>
	<CardComponent
		:card="card"
		:language="language"
		:class="{ selected: selected, burned: burned, 'bot-picked': botpicked }"
		class="booster-card"
		:style="`--booster-card-scale: ${scale}`"
		:renderCommonBackside="renderCommonBackside"
	>
		<div v-if="sourceInfo" class="source-info">{{ sourceInfo }}</div>
		<div
			v-if="wildcardneeded"
			class="collection-status"
			v-tooltip.top="
				`Playing this card will cost you a wildcard. ${
					hasenoughwildcards ? '' : 'Not enough wildcards of this type!'
				}`
			"
		>
			<font-awesome-icon
				icon="fa-solid fa-exclamation-triangle"
				class="yellow missing-warning"
				v-if="!hasenoughwildcards"
			></font-awesome-icon>
			<img class="wildcard-icon" :src="`img/wc_${card.rarity}.webp`" />
		</div>
		<div class="bot-score" v-if="botscore && displayBotScore">{{ displayBotScore }}</div>
		<template v-if="canbeburned && !selected">
			<div v-if="burned" class="restore-card blue clickable" @click="restoreCard($event)">
				<font-awesome-icon icon="fa-solid fa-undo-alt" size="2x"></font-awesome-icon>
			</div>
			<div v-else class="burn-card red clickable" @click="burnCard($event)">
				<font-awesome-icon icon="fa-solid fa-ban" size="2x"></font-awesome-icon>
			</div>
		</template>
	</CardComponent>
</template>

<script setup lang="ts">
import { Language } from "../../../src/Types";
import { computed } from "vue";
import { UniqueCard } from "@/CardTypes";
import CardComponent from "./Card.vue";

const props = withDefaults(
	defineProps<{
		card: UniqueCard;
		language?: Language;
		selected?: boolean;
		canbeburned?: boolean;
		burned?: boolean;
		wildcardneeded?: boolean;
		hasenoughwildcards?: boolean;
		botscore?: number | null;
		botpicked?: boolean;
		scale?: number;
		renderCommonBackside?: boolean;
	}>(),
	{
		language: Language.en,
		selected: false,
		canbeburned: false,
		wildcardneeded: false,
		hasenoughwildcards: true,
		botscore: null,
		botpicked: false,
		scale: 1,
		renderCommonBackside: false,
	}
);

const emit = defineEmits<{
	burn: [];
	restore: [];
}>();

function burnCard(e: Event) {
	emit("burn");
	e.stopPropagation();
	e.preventDefault();
}

function restoreCard(e: Event) {
	emit("restore");
	e.stopPropagation();
	e.preventDefault();
}

const displayBotScore = computed(() => {
	if (!props.botscore) return null;
	if (props.botscore < 0) return null;
	return props.botscore.toFixed(1);
});

const sourceInfo = computed(() => {
	if (!props.card.slot && !props.card.sheet) return null;
	return [props.card.slot, props.card.sheet].filter((s) => typeof s === "string").join(" / ");
});
</script>

<style scoped>
.card {
	margin: 0.75em;
	transition: transform 0.08s ease-out;
	will-change: transform;

	width: calc(200px * var(--booster-card-scale));
	height: calc(282px * var(--booster-card-scale));
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
	transition:
		transform 0.5s ease,
		opacity 0.5s ease;
}

.burn-card,
.restore-card {
	position: absolute;
	left: 0;
	bottom: 0;
	text-shadow:
		0 0 3px black,
		0 0 4px white;
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

.bot-score {
	position: absolute;
	right: -0.75em;
	top: 12.5%;
	border-radius: 50%;
	background-color: rgba(0, 0, 0, 0.75);
	width: 2em;
	height: 2em;
	line-height: 2em;
}

.source-info {
	position: absolute;
	top: -1.3em;
	left: 50%;
	transform: translateX(-50%);
	background-color: #333;
	border-radius: 0.5em;
	padding: 0.08em 0.5em 0.5em 0.5em;
	z-index: -1;
	font-size: 0.8em;
	white-space: nowrap;
}
</style>

<style>
.booster-card:not(.zoomedin) {
	transition: transform 0.08s ease-out;
}

.selected.booster-card:not(.zoomedin) {
	transform: scale(1.04);
}

.selected.foil .inner-card-image, /* .foil .card-image has an 'overflow:hidden' preventing the box-shadow to show up. We'll apply it earlier in this case. */
.selected .card-image .front-image,
.selected .card-image .back-image,
.selected .card-placeholder {
	animation: selected-pulse 5s infinite ease-in-out;
}

@keyframes selected-pulse {
	0%,
	10% {
		filter: drop-shadow(var(--selected-card-shadow-color) 0px 0px 1px);
	}
	30%,
	35% {
		filter: drop-shadow(var(--selected-card-shadow-color) 0px 0px 10px);
	}
	100% {
		filter: drop-shadow(var(--selected-card-shadow-color) 0px 0px 1px);
	}
}

.bot-picked.foil .inner-card-image, /* .foil .card-image has an 'overflow:hidden' preventing the box-shadow to show up. We'll apply it earlier in this case. */
.bot-picked .card-image .front-image,
.bot-picked .card-image .back-image,
.bot-picked .card-placeholder {
	box-shadow: 0px 0px 20px 1px rgb(0, 111, 175);
}

.booster-card:hover:not(.zoomedin) {
	transform: scale(1.08);
}
.skipped .booster-card:hover:not(.zoomedin) {
	transform: inherit;
}
</style>

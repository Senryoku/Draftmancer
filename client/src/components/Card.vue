<template>
	<div
		ref="rootElement"
		:class="classes"
		:data-arena-id="card.id"
		:data-cmc="card.cmc"
		:data-uniqueid="card.uniqueID"
		:key="`card-${card.uniqueID}`"
		@contextmenu="toggleZoom"
		@mouseleave="mouseLeave"
		@mouseenter="mouseEnter"
	>
		<CardImage
			:card="card"
			:language="language"
			:lazyLoad="lazyLoad"
			:displayCardText="displayCardText"
			:renderCommonBackside="renderCommonBackside"
			ref="imageElement"
		/>
		<div v-if="notes || notedColors" class="additional-notes">
			{{ notes }}

			<div v-if="notedColors" class="noted-colors">
				<img v-for="c in notedColors" :key="c" class="mana-icon" :src="`img/mana/${c}.svg`" />
			</div>
		</div>
		<slot></slot>
	</div>
</template>

<script setup lang="ts">
import { ref, computed, getCurrentInstance } from "vue";
import { Language } from "../../../src/Types";
import { UniqueCard } from "@/CardTypes";
import { hasEffect, OnPickDraftEffect } from "../../../src/CardTypes";

import CardImage from "./CardImage.vue";

import { useEmitter } from "../appCommon";
const { emitter } = useEmitter();

const props = withDefaults(
	defineProps<{
		card: UniqueCard;
		language?: Language;
		lazyLoad?: boolean;
		renderCommonBackside?: boolean;
		conditionalClasses?: (card: UniqueCard) => string[];
	}>(),
	{ language: Language.en, lazyLoad: false, renderCommonBackside: false, conditionalClasses: undefined }
);

const displayCardText = ref(false);
const rootElement = ref<HTMLElement | null>(null);
const imageElement = ref<typeof CardImage | null>(null);

const classes = computed(() => {
	let classes = props.conditionalClasses ? props.conditionalClasses(props.card) : [];
	classes.push("card");
	if (props.card.foil) classes.push("foil");
	return classes;
});

const notes = computed(() => {
	if (!props.card?.state) return undefined;
	if (props.card.draft_effects) {
		if (hasEffect(props.card, "AnimusOfPredation") && props.card.state.removedCards)
			return [...new Set(props.card.state.removedCards.map((card) => card.subtypes).flat())].join(", ");
		if (hasEffect(props.card, "CogworkGrinder") && props.card.state.removedCards)
			return props.card.state.removedCards.length.toString();
		if (hasEffect(props.card, OnPickDraftEffect.NoteDraftedCards) && props.card.state.cardsDraftedThisRound)
			return props.card.state.cardsDraftedThisRound.toString();
		if (hasEffect(props.card, OnPickDraftEffect.NotePassingPlayer) && props.card.state.passingPlayer)
			return props.card.state.passingPlayer;
		if (props.card.state.cardName) return props.card.state.cardName;
		if (props.card.state.creatureName) return props.card.state.creatureName;
		if (props.card.state.creatureTypes) return props.card.state.creatureTypes.join(", ");
	}
	return undefined;
});

const notedColors = computed(() => {
	return (props.card.state?.colors?.length ?? 0) > 0 ? props.card.state?.colors : undefined;
});

function toggleZoom(e: Event) {
	e.preventDefault();
	emitter.emit("togglecardpopup", e, props.card);
}

function mouseLeave(e: Event) {
	e.preventDefault();

	displayCardText.value = false;
	document.removeEventListener("keydown", keyDown, { capture: true });
	document.removeEventListener("keyup", keyUp, { capture: true });

	emitter.emit("closecardpopup");

	if (props.card.foil && rootElement.value) {
		document.removeEventListener("mousemove", foilEffect);
		rootElement.value.style.setProperty("--brightness", `100%`);
		rootElement.value.style.setProperty("--foil-initial-top", `-16%`);
		rootElement.value.style.setProperty("--foil-initial-left", `32%`);
		rootElement.value.style.setProperty("--transform-rotation-x", `0`);
		rootElement.value.style.setProperty("--transform-rotation-y", `0`);
	}
}

function mouseEnter() {
	document.addEventListener("keydown", keyDown, { capture: true });
	document.addEventListener("keyup", keyUp, { capture: true });

	if (props.card.foil) {
		document.addEventListener("mousemove", foilEffect);
	}
}

function foilEffect(e: MouseEvent) {
	if (!rootElement.value) return;

	const bounds = rootElement.value.getBoundingClientRect();
	const style = window.getComputedStyle(rootElement.value);
	bounds.width += (parseInt(style.marginLeft) || 0) + (parseInt(style.marginRight) || 0);
	bounds.height += (parseInt(style.marginTop) || 0) + (parseInt(style.marginBottom) || 0);
	const factor = (e.clientX - bounds.left) / bounds.width;
	const factorY = (e.clientY - bounds.top) / bounds.height;
	if (!imageElement.value) {
		document.removeEventListener("mousemove", foilEffect);
		return;
	}
	const imageBounds = imageElement.value.$el.getBoundingClientRect(); // Different from bounds when inside a card column
	const ratio = imageBounds.width / imageBounds.height;
	const rotScale = (v: number) => -20 + 40 * v;
	rootElement.value.style.setProperty("--brightness", `${100 - 50 * (factor - 0.5)}%`);
	rootElement.value.style.setProperty("--transform-rotation-x", `${rotScale(factor)}deg`);
	rootElement.value.style.setProperty("--transform-rotation-y", `${ratio * -rotScale(factorY)}deg`);
	rootElement.value.style.setProperty("--foil-initial-top", `${ratio * (-(160 * factorY) + 70)}%`);
	rootElement.value.style.setProperty("--foil-initial-left", `${-(160 * factor) + 70}%`);
}

function keyDown(event: KeyboardEvent) {
	switch (event.key) {
		case "Alt":
			displayCardText.value = event.altKey;
			getCurrentInstance()?.proxy?.$forceUpdate();
			break;
		default:
			// Ignore this event
			return;
	}
	// We handled it.
	event.stopPropagation();
	event.preventDefault();
}

function keyUp(event: KeyboardEvent) {
	switch (event.key) {
		case "Alt":
			displayCardText.value = event.altKey;
			getCurrentInstance()?.proxy?.$forceUpdate();
			break;
		default:
			// Ignore this event
			return;
	}
	// We handled it.
	event.stopPropagation();
	event.preventDefault();
}
</script>

<style scoped>
.card {
	display: inline-block;
	position: relative;
	text-align: center;
	width: 200px;
	height: 282px;

	--brightness: 100%;
	--transform-rotation-x: 0;
	--transform-rotation-y: 0;
	--foil-initial-top: 0%;
	--foil-initial-left: 0%;

	user-select: none;
}

.fade-enter-active.card,
.fade-leave-active.card {
	transition:
		transform 0.25s ease,
		opacity 0.5s;
}

.card-column .foil .card-image {
	padding-bottom: 141.5%;
}

.card .additional-notes {
	display: none;

	position: absolute;
	max-width: 100%;
	left: calc(100% + 0.2em);
	top: 0;
	background-color: rgba(0, 0, 0, 0.8);
	font-size: 0.8em;
	padding: 0.2em 0.4em;
	border-radius: 0.2em;
}

.card:hover .additional-notes {
	display: block;
}

.noted-colors {
	display: flex;
	flex-direction: column;
	gap: 0.5em;
	padding: 0.2em 0;
}

.foil:not(.booster-open-enter-active) {
	.card-image {
		position: relative;
		overflow: hidden;
		filter: brightness(var(--brightness));
		transform: perspective(1000px) rotate3d(0, 1, 0, var(--transform-rotation-x))
			rotate3d(1, 0, 0, var(--transform-rotation-y));
	}

	:not(:hover) {
		.card-image,
		.card-image:after,
		.card-image:before {
			transition: all 0.5s ease-out;
		}
	}

	.card-image:after,
	.card-image:before {
		content: "";

		position: absolute;
		width: 100%;
		padding-bottom: calc(1.41 * 300%);
		top: calc(-75% + var(--foil-initial-top));
		left: calc(0% + var(--foil-initial-left));
		transform: rotate(30deg);
	}

	.card-image:after {
		background: rgba(255, 255, 255, 0.5);
		--saturation: 100%;
		--lightness: 50%;
		background: linear-gradient(
			to right,
			hsla(0, var(--saturation), var(--lightness), 0),
			hsl(40, var(--saturation), var(--lightness)),
			hsl(80, var(--saturation), var(--lightness)),
			hsl(120, var(--saturation), var(--lightness)),
			hsl(160, var(--saturation), var(--lightness)),
			hsl(200, var(--saturation), var(--lightness)),
			hsl(240, var(--saturation), var(--lightness)),
			hsl(280, var(--saturation), var(--lightness)),
			hsl(320, var(--saturation), var(--lightness)),
			hsla(360, var(--saturation), var(--lightness), 0)
		);
		mix-blend-mode: hue;

		animation: fade-in 0.15s linear forwards;
	}

	.card-image:before {
		background: rgba(255, 255, 255, 0.25);
		background: linear-gradient(
			to right,
			rgba(255, 255, 255, 0) 35%,
			rgba(255, 255, 255, 0.04) 40%,
			rgba(255, 255, 255, 0.2) 45%,
			rgba(255, 255, 255, 0.24) 49%,
			rgba(255, 255, 255, 0.25) 50%,
			rgba(255, 255, 255, 0.24) 51%,
			rgba(255, 255, 255, 0.2) 55%,
			rgba(255, 255, 255, 0.04) 60%,
			rgba(255, 255, 255, 0) 65%,
			rgba(255, 255, 255, 0) 100%
		);
		mix-blend-mode: lighten;
		z-index: 1;

		animation: fade-in 0.15s linear forwards;
	}
}

@keyframes fade-in {
	0% {
		opacity: 0;
	}
	100% {
		opacity: 1;
	}
}
</style>

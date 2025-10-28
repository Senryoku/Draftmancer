<template>
	<div class="card-image" :class="{ 'has-back': hasBack }" v-if="!fixedLayout">
		<div v-if="hasBack" class="flip-button">
			<font-awesome-layers>
				<font-awesome-icon
					icon="fa-solid fa-sync"
					class="flip-icon"
					transform="grow-2"
					size="lg"
					style="color: black"
				/>
				<font-awesome-icon icon="fa-solid fa-sync" class="flip-icon" size="lg" />
			</font-awesome-layers>
		</div>
		<div v-if="card.layout === 'flip'" class="vertical-flip-button">
			<font-awesome-layers>
				<font-awesome-icon
					icon="fa-solid fa-sync"
					class="vertical-flip-icon"
					transform="grow-2"
					size="lg"
					style="color: black"
				/>
				<font-awesome-icon icon="fa-solid fa-sync" class="vertical-flip-icon" size="lg" />
			</font-awesome-layers>
		</div>
		<div v-if="card.layout === 'split' || card.type.includes('Battle')" class="split-button">
			<img src="../assets/img/tap-icon.svg" class="split-icon" />
		</div>
		<div v-if="card.layout === 'split-left'" class="split-left-button">
			<img src="../assets/img/tap-icon.svg" class="split-left-icon" />
		</div>
		<div class="inner-card-image">
			<div :class="{ 'flip-container': hasBack || renderCommonBackside }">
				<clazy-load
					:ratio="0"
					margin="200px"
					:src="imageURI"
					loadingClass="card-loading"
					:forceLoad="!lazyLoad"
					:class="{ 'flip-front': hasBack || renderCommonBackside }"
				>
					<template v-if="cardAdditionalData && displayCardText">
						<template v-if="cardAdditionalData.status === 'pending'">
							<div class="pending-alt-card-text">
								<font-awesome-icon icon="fa-solid fa-spinner" spin />
							</div>
						</template>
						<template v-else>
							<CardText :card="cardFrontAdditionalData!" />
						</template>
					</template>
					<img class="front-image" :src="imageURI" />
					<template v-slot:placeholder>
						<CardPlaceholder :card="card"></CardPlaceholder>
					</template>
				</clazy-load>
				<clazy-load
					:ratio="0"
					margin="200px"
					:src="backImageURI!"
					loadingClass="card-loading"
					class="flip-back"
					:forceLoad="!lazyLoad"
					v-if="hasBack"
				>
					<template v-if="cardAdditionalData && displayCardText">
						<template v-if="cardAdditionalData.status === 'pending'">
							<div class="pending-alt-card-text">
								<font-awesome-icon icon="fa-solid fa-spinner" spin />
							</div>
						</template>
						<template v-else>
							<CardText v-if="hasBack && cardBackAdditionalData" :card="cardBackAdditionalData" />
						</template>
					</template>
					<img class="back-image" :src="backImageURI" />
					<template v-slot:placeholder><CardPlaceholder :card="card.back" /></template>
				</clazy-load>
				<div class="flip-back" v-else-if="renderCommonBackside">
					<CardPlaceholder :card="undefined" />
				</div>
			</div>
		</div>
	</div>
	<div
		v-else
		class="fixed-layout"
		:class="{
			'layout-back': hasBack,
			'layout-flip': card.layout === 'flip',
			'layout-split': card.layout === 'split',
			'layout-split-left': card.layout === 'split-left',
		}"
	>
		<clazy-load
			:src="imageURI"
			loadingClass="card-loading"
			:forceLoad="!lazyLoad"
			class="card-individual-image"
			:class="{
				'split-and-back':
					card.type.includes('Battle') ||
					((card.layout === 'split' || card.layout === 'split-left') && hasBack),
				left: card.layout === 'split-left',
			}"
		>
			<img :src="imageURI" />
			<CardText v-if="displayCardText" :card="cardFrontAdditionalData!" />
			<template v-slot:placeholder>
				<CardPlaceholder :card="card" />
			</template>
		</clazy-load>
		<clazy-load
			:src="backImageURI!"
			loadingClass="card-loading"
			:forceLoad="!lazyLoad"
			class="card-individual-image"
			:class="{
				'split-back': card.back?.layout === 'split' || card.back?.layout === 'split-left',
				left: card.back?.layout === 'split-left',
			}"
			v-if="hasBack"
		>
			<img :src="backImageURI" />
			<CardText v-if="displayCardText" :card="cardBackAdditionalData!" />
			<template v-slot:placeholder>
				<CardPlaceholder :card="card.back" />
			</template>
		</clazy-load>
		<clazy-load
			:src="imageURI"
			loadingClass="card-loading"
			:forceLoad="!lazyLoad"
			class="card-individual-image"
			v-if="card.layout === 'flip'"
		>
			<img :src="imageURI" style="transform: rotate(180deg)" />
			<CardText v-if="displayCardText" :card="cardBackAdditionalData!" />
			<template v-slot:placeholder>
				<CardPlaceholder :card="card" />
			</template>
		</clazy-load>
	</div>
</template>

<script setup lang="ts">
import CardText from "./CardText.vue";
import CardPlaceholder from "./CardPlaceholder.vue";
import ClazyLoad from "./../vue-clazy-load.vue";

import { computed } from "vue";
import { Language } from "@/Types";
import { Card, CardFace } from "@/CardTypes";
import { useCardCache, ScryfallCard, isReady, ScryfallCardFace, CardCacheEntry } from "../vueCardCache";

const { cardCache } = useCardCache();

const props = withDefaults(
	defineProps<{
		card: Card;
		language: Language;
		lazyLoad?: boolean;
		fixedLayout?: boolean;
		displayCardText?: boolean;
		renderCommonBackside?: boolean; // Render standard card back, mostly for animation purposes.
	}>(),
	{
		lazyLoad: false,
		fixedLayout: false,
		displayCardText: false,
		renderCommonBackside: true,
	}
);
const imageURI = computed(() => {
	if (props.language in props.card.image_uris) return props.card.image_uris[props.language];
	return props.card.image_uris["en"];
});
const hasBack = computed(() => {
	return props.card.back !== null && props.card.back !== undefined;
});
const backImageURI = computed(() => {
	if (!hasBack.value) return undefined;
	return props.language in props.card.back!.image_uris
		? props.card.back?.image_uris[props.language]
		: props.card.back?.image_uris["en"];
});
const cardAdditionalData = computed(() => {
	if (!props.displayCardText) return false; // Don't send the requests automatically
	if (props.card.is_custom) return { ...props.card, status: "custom" } as Card & { status: "custom" };
	return cardCache.get(props.card.id);
});

const cardFrontAdditionalData = computed(
	(): CardCacheEntry | ScryfallCard | ScryfallCardFace | CardFace | undefined => {
		const data = cardAdditionalData.value;
		if (!data) return undefined;
		if (data.status === "custom") return data;
		if (isReady(data) && data.card_faces) return data.card_faces[0];
		else return data;
	}
);
const cardBackAdditionalData = computed((): CardCacheEntry | ScryfallCard | ScryfallCardFace | CardFace | undefined => {
	const data = cardAdditionalData.value;
	if (!data) return undefined;
	if (data.status === "custom") return data.back;
	if (isReady(data) && data.card_faces) return data.card_faces[1];
	else return undefined;
});
</script>

<style scoped>
.card-image,
.card-individual-image {
	position: relative;
	width: auto;
	height: 100%;
	background-color: transparent;
	perspective: 1000px;
	border-radius: 3%;
}

.card-individual-image {
	aspect-ratio: 100/140;
}

img {
	display: block;
	width: 100%;
	border-radius: 3%;
	-webkit-user-select: none;
	-moz-user-select: none;
	-ms-user-select: none;
	user-select: none;
}

.flip-button,
.vertical-flip-button,
.split-button,
.split-left-button {
	position: absolute;
	top: -0.25em;
	right: -0.2em;
	z-index: 1;
	pointer-events: auto;

	-ms-transform: translateZ(0); /* IE 9 */
	-webkit-transform: translateZ(0); /* Chrome, Safari, Opera */
	transform: translateZ(0);
}

.has-back .vertical-flip-button,
.has-back .split-left-button,
.has-back .split-button {
	right: 1.4em;
}

.flip-button .fa-layers {
	perspective: 4em;
}

.flip-icon {
	transition: transform 0.2s;
	transform: rotateX(45deg) skewX(-10deg);
	color: white;
}

.flip-button:hover .flip-icon {
	transform: rotateX(45deg) skewX(-10deg) rotateZ(180deg);
}

.flip-container {
	position: relative;
	transition: transform 0.2s;
	transform-style: preserve-3d;
}

.flip-button:hover ~ div .flip-container {
	transform: rotateY(-180deg);
}

.flip-front,
.flip-back {
	-webkit-backface-visibility: hidden; /* Safari */
	backface-visibility: hidden;

	-ms-transform: translateZ(0); /* IE 9 */
	-webkit-transform: translateZ(0); /* Chrome, Safari, Opera */
	transform: translateZ(0);
}

.flip-back {
	position: absolute;
	width: 100%;
	height: 100%;
	top: 0;
	left: 0;

	transform: rotateY(180deg) translateZ(0);
}

.vertical-flip-icon {
	transition:
		transform 0.2s,
		text-shadow 0.2s;
	color: white;
}

.vertical-flip-button:hover .vertical-flip-icon {
	transform: rotateZ(180deg);
}

.vertical-flip-button ~ div .front-image {
	transform-origin: center;
	transition: transform 0.2s;
}

.vertical-flip-button:hover ~ div .front-image {
	transform: rotateZ(180deg);
}

.split-icon,
.split-left-icon {
	transition:
		transform 0.2s,
		text-shadow 0.2s;
	width: 1em;
	color: white;
}

.split-button:hover .split-icon {
	transform: rotateZ(90deg);
}

.split-left-icon {
	transform: scaleX(-1);
}

.split-left-button:hover .split-left-icon {
	transform: rotateZ(-89.999deg) scaleX(-1);
}

.split-button ~ div .front-image,
.split-left-button ~ div .front-image {
	transform-origin: center;
	transition: transform 0.2s;
}

.split-button:hover ~ div .front-image {
	transform: scale(1.41) rotateZ(90deg);
}

.split-left-button:hover ~ div .front-image {
	transform: scale(1.41) rotateZ(-90deg);
}

/* Cancel foil transform when hovering the flip button */
.flip-button,
.vertical-flip-button,
.split-button,
.split-left-button {
	&:hover {
		~ .inner-card-image {
			--brightness: 100%;
			--transform-rotation-x: 0;
			--transform-rotation-y: 0;
			--foil-initial-top: 0%;
			--foil-initial-left: 0%;
			overflow: visible;

			&:before,
			&:after {
				display: none;
			}
		}
	}
}

/* Fixed Layouts (Used by CardPopup) */
.fixed-layout {
	width: 100%;
	height: 100%;
	transform-origin: center;
}

.layout-flip,
.layout-back {
	display: flex;
	gap: 5px;
}

.layout-split img {
	transform: translate(50%) scale(1.41) rotateZ(90deg);
}
.right .layout-split img {
	transform: translate(-50%) scale(1.41) rotateZ(90deg);
}

.layout-split-left img {
	transform: translate(50%) scale(1.41) rotateZ(-90deg);
}
.right .layout-split-left img {
	transform: translate(-50%) scale(1.41) rotateZ(-90deg);
}

.layout-split-left img,
.layout-split img {
	max-height: calc(90vw / 1.41);
	background-image: var(--card-back-image, url("../assets/img/cardback.webp"));
	background-size: cover;
}

.split-and-back,
.split-back {
	width: var(--image-height);
	--rotation: 90deg;
}

.split-and-back.left,
.split-back.left {
	--rotation: -90deg;
}

.split-and-back {
	--translate-x: 20.5%;
}
.split-back {
	--translate-x: calc(2 * 20.5%); /* This assumes both sides are landscape (split)... Good enough :) */
}

.split-and-back img,
.split-back img {
	transform: translateX(var(--translate-x)) rotate(var(--rotation));
}

.card-popup.right .split-and-back img,
.card-popup.right .split-back img {
	transform: translateX(calc(-1 * var(--translate-x))) rotate(var(--rotation));
}

.pending-alt-card-text {
	position: absolute;
	top: 0;
	left: 0;
	right: 0;
	aspect-ratio: 100/140;
	background-color: #00000060;
	display: flex;
	align-items: center;
	justify-content: center;
}
</style>

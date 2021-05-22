<template>
	<div class="card-image" v-if="!fixedLayout">
		<div v-if="hasBack" class="flip-button">
			<i class="fas fa-sync flip-icon"></i>
		</div>
		<div v-if="card.layout === 'flip'" class="vertical-flip-button">
			<i class="fas fa-sync vertical-flip-icon"> </i>
		</div>
		<div v-if="card.layout === 'split'" class="split-button">
			<i class="fas fa-sync split-icon"> </i>
		</div>
		<div v-if="card.layout === 'split-left'" class="split-left-button">
			<i class="fas fa-sync split-left-icon"> </i>
		</div>
		<div class="flip-container">
			<clazy-load
				:ratio="0"
				margin="200px"
				:src="imageURI"
				loadingClass="card-loading"
				:forceLoad="!lazyLoad"
				class="flip-front"
			>
				<img :src="imageURI" />
				<card-placeholder slot="placeholder" :card="card"></card-placeholder>
			</clazy-load>
			<clazy-load
				:ratio="0"
				margin="200px"
				:src="backImageURI"
				loadingClass="card-loading"
				class="flip-back"
				:forceLoad="!lazyLoad"
				v-if="hasBack"
			>
				<img :src="backImageURI" />
				<card-placeholder slot="placeholder" :card="card.back"></card-placeholder>
			</clazy-load>
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
		<div class="card-image">
			<img :src="imageURI" />
		</div>
		<div class="card-image" v-if="hasBack">
			<img :src="backImageURI" />
		</div>
		<div class="card-image" v-if="card.layout === 'flip'">
			<img :src="imageURI" style="transform: rotate(180deg)" />
		</div>
	</div>
</template>

<script>
import CardPlaceholder from "./CardPlaceholder.vue";
import ClazyLoad from "./../vue-clazy-load.vue";
export default {
	name: "CardImage",
	components: { CardPlaceholder, ClazyLoad },
	props: {
		card: { type: Object, required: true },
		language: { type: String, required: true },
		lazyLoad: { type: Boolean, default: false },
		fixedLayout: { type: Boolean, default: false },
	},
	computed: {
		imageURI: function () {
			if (this.language in this.card.image_uris) return this.card.image_uris[this.language];
			return this.card.image_uris["en"];
		},
		hasBack: function () {
			return this.card.back !== null && this.card.back !== undefined;
		},
		backImageURI: function () {
			return this.language in this.card.back.image_uris
				? this.card.back.image_uris[this.language]
				: this.card.back.image_uris["en"];
		},
	},
};
</script>

<style scoped>
.card-image {
	width: 100%;
	height: 100%;
	background-color: transparent;
	perspective: 1000px;
	border-radius: 3%;
}

img {
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
	right: -0.4em;
	z-index: 1;
	pointer-events: auto;

	-ms-transform: translateZ(0); /* IE 9 */
	-webkit-transform: translateZ(0); /* Chrome, Safari, Opera */
	transform: translateZ(0);
}

.booster .flip-button,
.booster .vertical-flip-button {
	top: -0.75em;
	right: -0.9em;
	padding: 0.5em;
}

.flip-icon {
	transition: transform 0.2s, text-shadow 0.2s;
	transform: rotateX(45deg) skewX(-10deg);
	color: white;
	text-shadow: 0 0 4px black, 0 4px 0 black;
}

.flip-button:hover .flip-icon {
	transform: rotateX(45deg) skewX(-10deg) rotateZ(180deg);
	text-shadow: 0 0 4px black, 0 -4px 0 black;
}

.flip-container {
	position: relative;
	transition: transform 0.2s;
	transform-style: preserve-3d;
}

.flip-button:hover ~ .flip-container {
	transform: rotateY(-180deg);
}

.flip-front,
.flip-back {
	position: absolute;
	width: 100%;
	height: 100%;
	-webkit-backface-visibility: hidden; /* Safari */
	backface-visibility: hidden;

	-ms-transform: translateZ(0); /* IE 9 */
	-webkit-transform: translateZ(0); /* Chrome, Safari, Opera */
	transform: translateZ(0);
}

.flip-back {
	transform: rotateY(180deg) translateZ(0);
}

.vertical-flip-icon {
	transition: transform 0.2s, text-shadow 0.2s;
	color: white;
	text-shadow: 0 0 4px black, 0 4px 0 black;
}

.vertical-flip-button:hover .vertical-flip-icon {
	transform: rotateZ(180deg);
	text-shadow: 0 0 4px black, 0 -4px 0 black;
}

.vertical-flip-button ~ .flip-container div img {
	transform-origin: center;
	transition: transform 0.2s;
}

.vertical-flip-button:hover ~ .flip-container div img {
	transform: rotateZ(180deg);
}

.split-icon,
.split-left-icon {
	transition: transform 0.2s, text-shadow 0.2s;
	color: white;
	text-shadow: 0 0 4px black, 0 4px 0 black;
}

.split-left-icon {
	transform: scaleX(-1);
}

.split-button:hover .split-icon {
	transform: rotateZ(90deg);
	text-shadow: 0 0 4px black, 4px 0 0 black;
}

.split-left-button:hover .split-left-icon {
	transform: rotateZ(-90deg) scaleX(-1);
	text-shadow: 0 0 4px black, 4px 0 0 black;
}

.split-button ~ .flip-container div img,
.split-left-button ~ .flip-container div img {
	transform-origin: center;
	transition: transform 0.2s;
}

.split-button:hover ~ .flip-container div img {
	transform: scale(1.41) rotateZ(90deg);
	z-index: 100;
}

.split-left-button:hover ~ .flip-container div img {
	transform: scale(1.41) rotateZ(-90deg);
	z-index: 100;
}

/* Fixed Layouts (Used by CardPopup) */
.fixed-layout {
	width: 100%;
}

.layout-flip,
.layout-back {
	display: flex;
	gap: 5px;
}

.layout-split {
	transform: translate(50%) scale(1.41) rotateZ(90deg);
}
.right .layout-split {
	transform: translate(-50%) scale(1.41) rotateZ(90deg);
}

.layout-split-left {
	transform: translate(50%) scale(1.41) rotateZ(-90deg);
}
.right .layout-split-left {
	transform: translate(-50%) scale(1.41) rotateZ(-90deg);
}

.layout-split-left img,
.layout-split img {
	max-height: calc(90vw / 1.41);
}
</style>

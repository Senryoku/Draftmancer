<template>
	<div class="card-image">
		<i v-if="hasBack" class="fas fa-sync flip-icon flip-button"></i>

		<div class="flip-container">
			<clazy-load
				:ratio="0"
				margin="200px"
				:src="imageURI"
				loadingClass="card-loading"
				:title="printedName"
				:forceLoad="!lazyLoad"
				class="flip-front"
			>
				<img :src="imageURI" />
				<card-placeholder slot="placeholder" :cardname="printedName"></card-placeholder>
			</clazy-load>
			<clazy-load
				:ratio="0"
				margin="200px"
				:src="backImageURI"
				loadingClass="card-loading"
				:title="backPrintedName"
				class="flip-back"
				:forceLoad="!lazyLoad"
				v-if="hasBack"
			>
				<img :src="backImageURI" />
				<card-placeholder slot="placeholder" :cardname="backPrintedName"></card-placeholder>
			</clazy-load>
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
	},
	computed: {
		imageURI: function () {
			if (this.language in this.card.image_uris) return this.card.image_uris[this.language];
			return this.card.image_uris["en"];
		},
		printedName: function () {
			if (this.language in this.card.printed_names) return this.card.printed_names[this.language];
			return this.card.name;
		},
		hasBack: function () {
			return this.card.back !== null && this.card.back !== undefined;
		},
		back: function () {
			if (!this.hasBack) return {};
			if (this.language in this.card.back) return this.card.back[this.language];
			return this.card.back["en"];
		},
		backPrintedName: function () {
			return this.language in this.card.back.printed_names
				? this.card.back.printed_names[this.language]
				: this.card.back.name;
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
	width: 200px;
	height: 283.3333333333334px;
	background-color: transparent;
	perspective: 1000px;
}

img {
	width: 200px;
	border-radius: 6px;
	-webkit-user-select: none;
	-moz-user-select: none;
	-ms-user-select: none;
	user-select: none;
}

.flip-button {
	position: absolute;
	top: -0.25em;
	right: -0.4em;
	z-index: 1;
	pointer-events: auto;
}

.flip-icon {
	transition: transform 0.2s, text-shadow 0.2s;
	transform: rotateX(45deg) skewX(-10deg);
	color: white;
	text-shadow: 0 0 4px black, 0 4px 0 black;
}

.flip-icon:hover {
	transform: rotateX(45deg) skewX(-10deg) rotateZ(180deg);
	text-shadow: 0 0 4px black, 0 -4px 0 black;
}

.flip-container {
	position: relative;
	transition: transform 0.2s;
	transform-style: preserve-3d;
}

.flip-button:hover ~ .flip-container {
	transform: rotateY(180deg);
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
</style>

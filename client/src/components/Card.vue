<template>
	<div
		class="card"
		:class="{ foil: card.foil }"
		:data-arena-id="card.id"
		:data-cmc="card.cmc"
		@click="$emit('click')"
		@dblclick="$emit('dblclick')"
		:key="`card-${card.uniqueID}`"
		@contextmenu="toggleZoom"
		@mouseleave="disableZoom"
	>
		<card-image :card="card" :language="language" :lazyLoad="lazyLoad"></card-image>
		<slot></slot>
	</div>
</template>

<script>
import CardImage from "./CardImage.vue";
export default {
	name: "Card",
	components: { CardImage },
	props: {
		card: { type: Object, required: true },
		language: { type: String, default: "en" },
		lazyLoad: { type: Boolean, default: false },
	},
	methods: {
		toggleZoom: function (e) {
			e.currentTarget.classList.toggle("zoomedin");
			e.preventDefault();
		},
		disableZoom: function (e) {
			e.currentTarget.classList.remove("zoomedin");
			e.preventDefault();
		},
	},
};
</script>

<style scoped>
.card {
	display: inline-block;
	position: relative;
	text-align: center;
	transition: transform 0.2s ease;
}

.fade-enter-active.card,
.fade-leave-active.card {
	transition: transform 0.25s ease, opacity 0.5s;
}

.card.zoomedin {
	transform: scale(1.75) !important;
	z-index: 2;
	image-rendering: optimizeQuality;
}
</style>

<style>
.foil .card-image {
	position: relative;
	overflow: hidden;
}

.foil .card-image:after {
	animation: foil 5s ease-in-out infinite;
	animation-direction: alternate;
	animation-fill-mode: both;
	content: "";

	position: absolute;
	width: 100%;
	padding-bottom: calc(1.41 * 200%);
	opacity: 0;
	transform: rotate(30deg);

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
}

.foil .card-image:before {
	animation: foil 5s ease-in-out infinite;
	animation-direction: alternate;
	animation-fill-mode: both;
	content: "";

	position: absolute;
	width: 100%;
	padding-bottom: calc(1.41 * 200%);
	opacity: 0;
	transform: rotate(30deg);

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
}

@keyframes foil {
	0% {
		opacity: 0;
		top: 0;
		left: 60%;
	}
	10% {
		opacity: 1;
	}
	90% {
		opacity: 1;
	}
	100% {
		opacity: 0;
		top: -100%;
		left: -100%;
	}
}
</style>
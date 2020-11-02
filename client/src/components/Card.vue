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
		@mouseenter="activateFoilEffect"
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
	data: function () {
		return {
			foilInterval: null,
		};
	},
	methods: {
		toggleZoom: function (e) {
			e.currentTarget.classList.toggle("zoomedin");
			e.preventDefault();
		},
		disableZoom: function (e) {
			e.currentTarget.classList.remove("zoomedin");
			e.preventDefault();

			if (this.card.foil) {
				document.removeEventListener("mousemove", this.foilEffect);
				this.$el.style.setProperty("--foil-initial-top", `-16%`);
				this.$el.style.setProperty("--foil-initial-left", `32%`);
			}
		},
		activateFoilEffect: function (e) {
			if (!this.card.foil) return;

			document.addEventListener("mousemove", this.foilEffect);
		},
		foilEffect: function (e) {
			let bounds = this.$el.getBoundingClientRect();
			this.$el.style.setProperty(
				"--foil-initial-top",
				`${-(120 * (e.clientX - bounds.left)) / bounds.width + 30}%`
			);
			this.$el.style.setProperty(
				"--foil-initial-left",
				`${-(160 * (e.clientX - bounds.left)) / bounds.width + 70}%`
			);
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

	--foil-initial-top: -16%;
	--foil-initial-left: 32%;
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

.foil .card-image {
	position: relative;
	overflow: hidden;
}

.foil .card-image:after,
.foil .card-image:before {
	content: "";

	position: absolute;
	width: 100%;
	padding-bottom: calc(1.41 * 200%);
	top: var(--foil-initial-top);
	left: var(--foil-initial-left);
	transform: rotate(30deg);
}

.foil .card-image:after {
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
/*
Foil animation: Now tied to cursor position.

.foil:hover .card-image:after,
.foil:hover .card-image:before {
	animation: foil 4s linear infinite;
}

@keyframes foil {
	0% {
		top: var(--foil-initial-top);
		left: var(--foil-initial-left);
	}
	40% {
		top: -80%;
		left: -80%;
	}
	90% {
		top: 0%;
		left: 60%;
	}
	100% {
		top: var(--foil-initial-top);
		left: var(--foil-initial-left);
	}
}
*/
</style>
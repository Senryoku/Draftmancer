<template>
	<div
		class="card"
		:class="{ foil: card.foil, faded: isFiltered }"
		:data-arena-id="card.id"
		:data-cmc="card.cmc"
		@click="$emit('click')"
		@dblclick="$emit('dblclick')"
		:key="`card-${card.uniqueID}`"
		@contextmenu="toggleZoom"
		@mouseleave="mouseLeave"
		@mouseenter="activateFoilEffect"
	>
		<card-image :card="card" :language="language" :lazyLoad="lazyLoad" ref="image"></card-image>
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
		filter: { type: String },
	},
	data: function () {
		return {
			foilInterval: null,
		};
	},
	computed: {
		isFiltered: function () {
			if (!this.filter || this.filter === "") return false;
			const filter = this.filter.toLowerCase();
			return !this.passFilter(this.card, filter) && (!this.card.back || !this.passFilter(this.card.back, filter));
		},
	},
	methods: {
		toggleZoom: function (e) {
			e.preventDefault();
			this.$root.$emit("togglecardpopup", e, this.card);
		},
		mouseLeave: function (e) {
			e.preventDefault();
			this.$root.$emit("closecardpopup");

			if (this.card.foil) {
				document.removeEventListener("mousemove", this.foilEffect);
				this.$el.style.setProperty("--brightness", `100%`);
				this.$el.style.setProperty("--foil-initial-top", `-16%`);
				this.$el.style.setProperty("--foil-initial-left", `32%`);
				this.$el.style.setProperty("--transform-rotation-x", `0`);
				this.$el.style.setProperty("--transform-rotation-y", `0`);
			}
		},
		activateFoilEffect: function () {
			if (!this.card.foil) return;

			document.addEventListener("mousemove", this.foilEffect);
		},
		foilEffect: function (e) {
			const bounds = this.$el.getBoundingClientRect();
			const style = this.$el.currentStyle || window.getComputedStyle(this.$el);
			bounds.width += (parseInt(style.marginLeft) || 0) + (parseInt(style.marginRight) || 0);
			bounds.height += (parseInt(style.marginTop) || 0) + (parseInt(style.marginBottom) || 0);
			const factor = (e.clientX - bounds.left) / bounds.width;
			const factorY = (e.clientY - bounds.top) / bounds.height;
			if (!this.$refs.image) {
				document.removeEventListener("mousemove", this.foilEffect);
				return;
			}
			const imageBounds = this.$refs.image.$el.getBoundingClientRect(); // Different from bounds when inside a card column
			const ratio = imageBounds.width / imageBounds.height;
			const rotScale = (v) => -20 + 40 * v;
			this.$el.style.setProperty("--brightness", `${100 - 50 * (factor - 0.5)}%`);
			this.$el.style.setProperty("--transform-rotation-x", `${rotScale(factor)}deg`);
			this.$el.style.setProperty("--transform-rotation-y", `${ratio * -rotScale(factorY)}deg`);
			this.$el.style.setProperty("--foil-initial-top", `${ratio * (-(160 * factorY) + 70)}%`);
			this.$el.style.setProperty("--foil-initial-left", `${-(160 * factor) + 70}%`);
		},
		passFilter: function (card, filter) {
			return (
				card.name.toLowerCase().includes(filter) ||
				card.type.toLowerCase().includes(filter) ||
				card.subtypes.join(" ").toLowerCase().includes(filter)
			);
		},
	},
};
</script>

<style>
/*
Can't be applied to .faded directly as it creates a bug with the rotation handle position.
See: https://stackoverflow.com/questions/52937708/why-does-applying-a-css-filter-on-the-parent-break-the-child-positioning
*/
.faded .card-image i,
.faded .card-image img {
	filter: brightness(50%) /*blur(2px)*/;
}

.card-image img {
	transition: filter 0.2s;
}
</style>

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
	transition: transform 0.25s ease, opacity 0.5s;
}

.foil .card-image {
	position: relative;
	overflow: hidden;
	filter: brightness(var(--brightness));
	transform: perspective(1000px) rotate3d(0, 1, 0, var(--transform-rotation-x))
		rotate3d(1, 0, 0, var(--transform-rotation-y));
}

.card-column .foil .card-image {
	padding-bottom: 141.5%;
}

.foil:not(:hover) .card-image,
.foil:not(:hover) .card-image:after,
.foil:not(:hover) .card-image:before {
	transition: all 0.5s ease-out;
}

.foil .card-image:after,
.foil .card-image:before {
	content: "";

	position: absolute;
	width: 100%;
	padding-bottom: calc(1.41 * 300%);
	top: calc(-75% + var(--foil-initial-top));
	left: calc(0% + var(--foil-initial-left));
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
</style>
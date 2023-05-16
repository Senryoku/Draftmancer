<template>
	<div
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
			ref="image"
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

<script lang="ts">
import { Language } from "@/Types";
import { defineComponent, PropType } from "vue";
import { UniqueCard } from "@/CardTypes";
import { OnPickDraftEffect } from "../../../src/CardTypes";

import CardImage from "./CardImage.vue";

export default defineComponent({
	name: "Card",
	components: { CardImage },
	props: {
		card: { type: Object as PropType<UniqueCard>, required: true },
		language: { type: String as PropType<Language>, default: "en" },
		lazyLoad: { type: Boolean, default: false },
		conditionalClasses: { type: Function },
	},
	data() {
		return {
			foilInterval: null,
			displayCardText: false,
		};
	},
	computed: {
		classes() {
			let classes = this.conditionalClasses ? this.conditionalClasses(this.card) : [];
			classes.push("card");
			if (this.card.foil) classes.push("foil");
			return classes;
		},
		notes(): string | undefined {
			if (!this.card?.state) return undefined;
			if (this.card.draft_effects) {
				if (this.card.draft_effects.includes("AnimusOfPredation") && this.card.state.removedCards)
					return [...new Set(this.card.state.removedCards.map((card) => card.subtypes).flat())].join(", ");
				if (this.card.draft_effects.includes("CogworkGrinder") && this.card.state.removedCards)
					return this.card.state.removedCards.length.toString();
				if (
					this.card.draft_effects.includes(OnPickDraftEffect.NoteDraftedCards) &&
					this.card.state.cardsDraftedThisRound
				)
					return this.card.state.cardsDraftedThisRound.toString();
				if (
					this.card.draft_effects.includes(OnPickDraftEffect.NotePassingPlayer) &&
					this.card.state.passingPlayer
				)
					return this.card.state.passingPlayer;
				if (this.card.state.cardName) return this.card.state.cardName;
				if (this.card.state.creatureName) return this.card.state.creatureName;
				if (this.card.state.creatureTypes) return this.card.state.creatureTypes.join(", ");
			}
			return undefined;
		},
		notedColors() {
			return (this.card.state?.colors?.length ?? 0) > 0 ? this.card.state?.colors : undefined;
		},
	},
	methods: {
		toggleZoom(e: Event) {
			e.preventDefault();
			this.emitter.emit("togglecardpopup", e, this.card);
		},
		mouseLeave(e: Event) {
			e.preventDefault();

			this.displayCardText = false;
			document.removeEventListener("keydown", this.keyDown, { capture: true });
			document.removeEventListener("keyup", this.keyUp, { capture: true });

			this.emitter.emit("closecardpopup");

			if (this.card.foil) {
				document.removeEventListener("mousemove", this.foilEffect);
				const el = this.$el as HTMLElement;
				el.style.setProperty("--brightness", `100%`);
				el.style.setProperty("--foil-initial-top", `-16%`);
				el.style.setProperty("--foil-initial-left", `32%`);
				el.style.setProperty("--transform-rotation-x", `0`);
				el.style.setProperty("--transform-rotation-y", `0`);
			}
		},
		mouseEnter() {
			document.addEventListener("keydown", this.keyDown, { capture: true });
			document.addEventListener("keyup", this.keyUp, { capture: true });

			if (this.card.foil) {
				document.addEventListener("mousemove", this.foilEffect);
			}
		},
		foilEffect(e: MouseEvent) {
			const el = this.$el as HTMLElement;
			const bounds = this.$el.getBoundingClientRect();
			const style = window.getComputedStyle(this.$el);
			bounds.width += (parseInt(style.marginLeft) || 0) + (parseInt(style.marginRight) || 0);
			bounds.height += (parseInt(style.marginTop) || 0) + (parseInt(style.marginBottom) || 0);
			const factor = (e.clientX - bounds.left) / bounds.width;
			const factorY = (e.clientY - bounds.top) / bounds.height;
			if (!this.$refs.image) {
				document.removeEventListener("mousemove", this.foilEffect);
				return;
			}
			const imageBounds = (this.$refs.image as typeof CardImage).$el.getBoundingClientRect(); // Different from bounds when inside a card column
			const ratio = imageBounds.width / imageBounds.height;
			const rotScale = (v: number) => -20 + 40 * v;
			el.style.setProperty("--brightness", `${100 - 50 * (factor - 0.5)}%`);
			el.style.setProperty("--transform-rotation-x", `${rotScale(factor)}deg`);
			el.style.setProperty("--transform-rotation-y", `${ratio * -rotScale(factorY)}deg`);
			el.style.setProperty("--foil-initial-top", `${ratio * (-(160 * factorY) + 70)}%`);
			el.style.setProperty("--foil-initial-left", `${-(160 * factor) + 70}%`);
		},
		keyDown(event: KeyboardEvent) {
			switch (event.key) {
				case "Alt":
					this.displayCardText = event.altKey;
					this.$forceUpdate();
					break;
				default:
					// Ignore this event
					return;
			}
			// We handled it.
			event.stopPropagation();
			event.preventDefault();
		},
		keyUp(event: KeyboardEvent) {
			switch (event.key) {
				case "Alt":
					this.displayCardText = event.altKey;
					this.$forceUpdate();
					break;
				default:
					// Ignore this event
					return;
			}
			// We handled it.
			event.stopPropagation();
			event.preventDefault();
		},
	},
});
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

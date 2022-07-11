<template>
	<transition name="zoom">
		<div
			class="card-popup"
			:class="{ left: position === 'left', right: position === 'right' }"
			v-if="card"
			v-show="display"
		>
			<div class="carousel">
				<div
					:class="{
						selected: currentPart === 0,
						before: currentPart === 1,
						'before-hidden': currentPart > 1,
					}"
					:key="card.id"
				>
					<CardImage :language="language" :card="card" :fixedLayout="true" />
				</div>
				<div
					class="related-card"
					v-for="(relatedCard, idx) in relatedCards"
					:key="relatedCard.id"
					:class="{
						selected: currentPart === idx + 1,
						before: currentPart === idx + 2,
						after: currentPart === idx,
						'before-hidden': currentPart > idx + 2,
						'after-hidden': currentPart < idx,
					}"
				>
					<template v-if="relatedCard.status !== 'ready'">
						<card-placeholder class="card-image"></card-placeholder>
					</template>
					<template v-else>
						<img :src="relatedCard.image_uris.border_crop" class="card-image" />
					</template>
				</div>
				<div v-if="relatedCards.length > 0" class="all-parts">
					<div class="mouse-hint"><i class="fas fa-arrows-alt-v"></i> <i class="fas fa-mouse"></i></div>
					<i class="fas fa-angle-up"></i>
					<i class="fas fa-square fa-sm" :class="{ selected: currentPart === 0 }"></i>
					<template v-for="(part, idx) in relatedCards">
						<template v-if="part.status === 'ready'"
							><i
								class="fas fa-square fa-sm"
								:key="part.id"
								:class="{ selected: currentPart === idx + 1 }"
							></i
						></template>
						<template v-else
							><i
								class="fas fa-spinner fa-spin"
								:class="{ selected: currentPart === idx + 1 }"
								:key="part.id"
							></i
						></template>
					</template>
					<i class="fas fa-angle-down"></i>
				</div>
				<div v-if="hasPendingData(card.id)" class="all-parts"><i class="fas fa-spinner fa-spin" /></div>
			</div>
		</div>
	</transition>
</template>

<script>
import axios from "axios";

import CardPlaceholder from "./CardPlaceholder.vue";
import CardImage from "./CardImage.vue";

const scrollCooldown = 100; // ms

export default {
	components: { CardImage, CardPlaceholder },
	props: {
		language: { type: String, required: true },
	},
	data() {
		return { display: false, card: null, position: "left", cardCache: {}, currentPart: 0, lastScroll: 0 };
	},
	created() {
		this.$root.$on("togglecardpopup", (event, card) => {
			if (!this.display) {
				this.position = event.clientX < window.innerWidth / 2 ? "right" : "left";
				this.card = card;
				this.currentPart = 0;
				this.requestData(card.id);

				document.addEventListener("wheel", this.mouseWheel, { passive: false });
				document.addEventListener("keydown", this.keyDown);
			} else this.cleanupEventHandlers();
			this.display = !this.display;
		});
		this.$root.$on("closecardpopup", () => {
			this.display = false;
			this.cleanupEventHandlers();
		});
	},
	methods: {
		requestData(cardID) {
			// Note: This will always request the english version of the card data, regardless of the language prop.,
			//	   but the all_parts (related cards) property doesn't seem to exist on translated cards anyway.
			//     We could search for the translated cards from their english ID, but I'm not sure if that's worth it,
			//     especially since I strongly suspect most of them won't be in Scryfall DB at all.
			if (!this.cardCache[cardID]) {
				this.$set(this.cardCache, cardID, { id: cardID, status: "pending" });
				axios.get(`https://api.scryfall.com/cards/${cardID}`).then((response) => {
					if (response.status === 200) {
						response.data.status = "ready";
						this.$set(this.cardCache, cardID, response.data);
					} else this.$set(this.cardCache, cardID, undefined);
				});
			}
		},
		hasPendingData(cardID) {
			return cardID in this.cardCache && this.cardCache[cardID]?.status === "pending";
		},
		additionalData(cardID) {
			return this.cardCache[cardID];
		},
		nextPart() {
			if (this.relatedCards.length === 0) return;
			this.currentPart = (this.currentPart + 1) % (this.relatedCards.length + 1);
		},
		previousPart() {
			if (this.relatedCards.length === 0) return;
			this.currentPart = (this.currentPart - 1) % (this.relatedCards.length + 1);
			while (this.currentPart < 0) this.currentPart += this.relatedCards.length + 1;
		},
		mouseWheel(event) {
			if (this.relatedCards.length > 0) {
				if (Date.now() - this.lastScroll > scrollCooldown) {
					if (event.deltaY > 0) this.nextPart();
					else this.previousPart();
					this.lastScroll = Date.now();
				}
				event.stopPropagation();
				event.preventDefault();
			}
		},
		keyDown(event) {
			switch (event.key) {
				case "ArrowUp":
					this.previousPart();
					break;
				case "ArrowDown":
					this.nextPart();
					break;
				default:
					// Ignore this event
					return;
			}
			// We handled it.
			event.stopPropagation();
			event.preventDefault();
		},
		negMod(x, n) {
			return ((x % n) + n) % n;
		},
		cleanupEventHandlers() {
			document.removeEventListener("wheel", this.mouseWheel);
			document.removeEventListener("keydown", this.keyDown);
		},
	},
	computed: {
		relatedCards() {
			let r = [];
			if (!this.cardCache[this.card?.id]?.all_parts) return r;

			for (let card of this.cardCache[this.card.id].all_parts) {
				if (card.id !== this.card.id) {
					this.requestData(card.id);
					r.push(this.additionalData(card.id));
				}
			}
			return r;
		},
	},
};
</script>

<style scoped>
.card-popup {
	--image-height: calc(min(70vh, 90vw * 1.4 * 0.5));

	position: fixed;
	top: 15vh;
	height: var(--image-height);
	z-index: 999;
	pointer-events: none;
	filter: drop-shadow(0 0 0.5vw #000000);
}

.card-popup.right {
	right: 3.5vw;
	direction: rtl;
}

.card-popup.left {
	left: 3.5vw;
}

.card-popup >>> img {
	width: auto;
	height: var(--image-height);
}

.zoom-enter-active,
.zoom-leave-active {
	transition: all 0.15s ease;
}

.zoom-enter,
.zoom-leave-to {
	opacity: 0;
}
.zoom-enter.left,
.zoom-leave-to.left {
	left: -5vw;
}

.zoom-enter.right,
.zoom-leave-to.right {
	right: -5vw;
}

.carousel {
	position: relative;
	width: 50vw;
	height: var(--image-height);
}

.carousel > * {
	position: absolute;
	transition: all 0.4s ease-out;
	transform-origin: left center;
}

.right .carousel > * {
	transform-origin: right center;
}

.carousel .selected {
	z-index: 1;
}

.carousel .before:not(.selected) {
	z-index: 0;
	transform: translateY(-25%) scale(70%);
	opacity: 0.8;
}

.carousel .after:not(.selected) {
	z-index: 0;
	transform: translateY(25%) scale(70%);
	opacity: 0.8;
}

.carousel .before-hidden:not(.selected) {
	z-index: -1;
	transform: translateY(-50%) scale(0%);
	opacity: 0;
}

.carousel .after-hidden:not(.selected) {
	z-index: -1;
	transform: translateY(50%) scale(0%);
	opacity: 0;
}

.related-card {
	width: calc(0.71 * var(--image-height));
	height: var(--image-height);
	background: url("../assets/img/cardback.png");
	background-size: 100%;
	border-radius: 3%;
}

.related-card .card-image {
	width: auto;
	height: var(--image-height);
	border-radius: 3%;
}

.all-parts {
	position: absolute;
	top: 50%;
	transform: translateY(-50%);

	display: flex;
	flex-direction: column;
	justify-content: center;
	align-items: center;
	gap: 0.5vh;

	height: 50%;
	width: 2em;
	margin: 0 auto 0 auto;
	padding: 1vh 0;
	background: #222;
	border: 2px solid #aaa;

	color: #aaa;
}

.right .all-parts {
	right: -2em;

	border-left: 0;
	border-radius: 0 1em 1em 0;
}

.left .all-parts {
	left: -2em;
	text-align: left;

	border-right: 0;
	border-radius: 1em 0 0 1em;
}

.all-parts > * {
	transition: all 0.1s;
}

.all-parts .selected {
	text-shadow: 0 0 6px white;
	color: white;
}

.all-parts .fa-angle-up,
.all-parts .fa-angle-down {
	color: #666;
}

.mouse-hint {
	position: absolute;
	color: #666;
	text-shadow: 0px -1px 0px rgba(0, 0, 0, 0.7);
	top: 1em;
	left: 50%;
	transform: translateX(-50%);
	display: flex;
	gap: 0.25em;
}
</style>

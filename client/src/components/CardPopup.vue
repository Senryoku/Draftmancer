<template>
	<transition name="zoom">
		<div
			class="card-popup"
			:class="{ left: position === 'left', right: position === 'right' }"
			v-if="card"
			v-show="display"
			@pointerdown="close"
		>
			<div class="carousel">
				<div
					class="carousel-item"
					:class="{
						'carousel-selected': currentPart === 0,
						before: currentPart === 1,
						'before-hidden': currentPart > 1,
					}"
					:key="card.id"
				>
					<CardImage
						:language="language"
						:card="card"
						:fixedLayout="true"
						:displayCardText="displayCardText"
					/>
				</div>
				<div
					class="carousel-item related-card"
					v-for="(relatedCard, idx) in relatedCards"
					:key="relatedCard.id"
					:class="{
						'carousel-selected': currentPart === idx + 1,
						before: currentPart === idx + 2,
						after: currentPart === idx,
						'before-hidden': currentPart > idx + 2,
						'after-hidden': currentPart < idx,
					}"
				>
					<img :src="relatedCardImage(idx)" class="related-card-image" />
					<card-text
						v-if="relatedCard.status === 'ready' && displayCardText"
						:card="relatedCard"
						class="alt-card-text"
					/>
				</div>
				<div class="all-parts">
					<div class="mouse-hint" v-if="relatedCards.length > 0">
						<font-awesome-icon icon="fa-solid fa-arrows-alt-v"></font-awesome-icon>
						<font-awesome-icon icon="fa-solid fa-mouse"></font-awesome-icon>
					</div>
					<font-awesome-icon icon="fa-solid fa-angle-up" v-if="relatedCards.length > 0"></font-awesome-icon>
					<font-awesome-icon
						icon="fa-solid fa-square"
						size="sm"
						:class="{ 'carousel-selected': currentPart === 0 }"
					></font-awesome-icon>
					<template v-for="(part, idx) in relatedCards">
						<template v-if="part.status === 'pending'">
							<font-awesome-icon
								icon="fa-solid fa-spinner"
								spin
								:class="{ 'carousel-selected': currentPart === idx + 1 }"
								:key="`${part.id}_${part.status}`"
							></font-awesome-icon>
						</template>
						<template v-else>
							<font-awesome-icon
								icon="fa-solid fa-square"
								size="sm"
								:key="`${part.id}_${part.status}`"
								:class="{ 'carousel-selected': currentPart === idx + 1 }"
							></font-awesome-icon>
						</template>
					</template>
					<font-awesome-icon icon="fa-solid fa-angle-down" v-if="relatedCards.length > 0"></font-awesome-icon>
					<div class="alt-hint" :style="displayCardText ? 'color: white' : ''">⎇ Alt</div>
				</div>
				<div v-if="hasPendingData()" class="all-parts">
					<font-awesome-icon icon="fas fa-spinner" spin></font-awesome-icon>
				</div>
			</div>
		</div>
	</transition>
</template>

<script lang="ts">
import { defineComponent, PropType } from "vue";
import { Language } from "@/Types";
import axios from "axios";

import CardText from "./CardText.vue";
import CardImage from "./CardImage.vue";
import { isString } from "../../../src/TypeChecks";
import { Card, CardFace, CardID } from "@/CardTypes";
import { ScryfallCard, isReady, CardCacheEntry } from "../vueCardCache";

const scrollCooldown = 100; // ms

export default defineComponent({
	components: { CardImage, CardText },
	props: {
		language: { type: String as PropType<Language>, required: true },
		customCards: { type: Object as PropType<Record<string, Card>> },
	},
	data() {
		return {
			display: false,
			card: null as Card | null,
			position: "left",
			currentPart: 0,
			lastScroll: 0,
			displayCardText: false,
			spellbooks: {} as { [name: string]: Set<CardID> }, // Associates card names to their spellbooks (Sets of card ids)
		};
	},
	created() {
		this.emitter.on("togglecardpopup", (event: MouseEvent, card: Card) => {
			if (!this.display) {
				this.position = event.clientX < window.innerWidth / 2 ? "right" : "left";
				this.card = card;
				this.currentPart = 0;
				if (!this.card.is_custom) {
					let promise = this.$cardCache.request(card.id);
					// Also request associated spellbook if necessary
					promise?.then(() => {
						const cardData = this.$cardCache.get(card.id) as ScryfallCard;
						if (!(card.name in this.spellbooks)) {
							const url = `https://api.scryfall.com/cards/search?q=spellbook%3A%22${encodeURI(
								cardData.name
							)}%22&unique=cards`;
							axios
								.get(url)
								.then((response) => {
									if (response.status === 200 && response.data?.data?.length > 0) {
										this.spellbooks[cardData.name] = new Set();
										for (const card of response.data.data) {
											card.status = "ready";
											this.$cardCache.add(card);
											this.spellbooks[cardData.name].add(card.id);
										}
									}
								})
								.catch((error) => {
									// There's no spellbook for this card, add an empty set so we don't request it again and return without error
									if (error.response?.status === 404) {
										this.spellbooks[cardData.name] = new Set();
									} else console.error("Error fetching spellbook:", error);
								});
						}
					});
				}

				document.addEventListener("wheel", this.mouseWheel, { passive: false });
				document.addEventListener("keydown", this.keyDown, { capture: true });
				document.addEventListener("keyup", this.keyUp, { capture: true });
				this.display = true;
			} else this.close();
		});
		this.emitter.on("closecardpopup", () => {
			this.close();
		});
	},
	methods: {
		close() {
			this.display = false;
			this.displayCardText = false;
			this.cleanupEventHandlers();
		},
		hasPendingData() {
			if (!this.card || this.card?.is_custom) return false;
			return this.$cardCache.get(this.card.id)?.status === "pending";
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
		mouseWheel(event: WheelEvent) {
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
		keyDown(event: KeyboardEvent) {
			switch (event.key) {
				case "Escape":
					this.close();
					break;
				case "ArrowUp":
					this.previousPart();
					break;
				case "ArrowDown":
					this.nextPart();
					break;
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
		negMod(x: number, n: number) {
			return ((x % n) + n) % n;
		},
		cleanupEventHandlers() {
			document.removeEventListener("wheel", this.mouseWheel);
			document.removeEventListener("keydown", this.keyDown, { capture: true });
			document.removeEventListener("keyup", this.keyUp, { capture: true });
		},
		relatedCardImage(index: number) {
			if (this.relatedCards.length <= index) return undefined;
			const card = this.relatedCards[index];
			if (card.status === "custom") return card.image_uris["en"]!;
			if (!isReady(card)) return undefined;
			return card.image_uris
				? card.image_uris.border_crop
				: card.card_faces && card.card_faces[0] && card.card_faces[0].image_uris
				  ? card.card_faces[0].image_uris.border_crop
				  : undefined;
		},
	},
	computed: {
		relatedCards() {
			let r: CardCacheEntry[] = [];
			if (!this.card) return r;
			if (this.card.is_custom) {
				if (this.customCards && this.card.related_cards)
					return [
						...this.card.related_cards.map((c) => {
							if (isString(c)) {
								if (this.customCards![c]) return { status: "custom", ...this.customCards![c] };
								else return this.$cardCache.get(c);
							} else return { status: "custom", ...c };
						}),
					] as (({ status: "custom"; id: string } & CardFace) | CardCacheEntry)[];
			} else {
				const c = this.$cardCache.get(this.card.id);
				if (!isReady(c)) return r;

				if (c.all_parts?.length > 0)
					for (let card of c.all_parts) {
						if (card.id !== this.card.id) r.push(this.$cardCache.get(card.id));
					}
				if (this.spellbooks[this.card?.name]?.size > 0)
					for (const cid of this.spellbooks[this.card.name]) r.push(this.$cardCache.get(cid));

				if (this.card.related_cards)
					for (const cid of this.card.related_cards) if (isString(cid)) r.push(this.$cardCache.get(cid));
			}
			return r;
		},
	},
});
</script>

<style scoped>
.card-popup {
	--image-height: calc(min(70vh, 90vw * 1.4 * 0.5));

	position: fixed;
	top: 15vh;
	height: var(--image-height);
	z-index: 1040;
	filter: drop-shadow(0 0 0.5vw #000000);
}

@media (hover: hover) {
	.card-popup {
		/* Necessary when popup overlaps with the element that triggered it:
		 * Allowing these events would trigger a mouseout on the origin element and cause the popup to disappear.
		 */
		pointer-events: none;
	}
}

.card-popup.right {
	right: 3.5vw;
	direction: rtl;
}

.card-popup.left {
	left: 3.5vw;
}

.zoom-enter-active,
.zoom-leave-active {
	transition: all 0.15s ease;
}

.zoom-enter-from,
.zoom-leave-to {
	opacity: 0;
}
.zoom-enter-from.left,
.zoom-leave-to.left {
	left: -5vw;
}

.zoom-enter-from.right,
.zoom-leave-to.right {
	right: -5vw;
}

.carousel {
	position: relative;
	width: 50vw;
	height: var(--image-height);
	pointer-events: none;
}

.carousel > .carousel-item {
	position: absolute;
	z-index: -2000;
	transition: all 0.4s ease-out;
	transform-origin: left center;
	backface-visibility: hidden;
}

.right .carousel > .carousel-item {
	transform-origin: right center;
}

.carousel .carousel-item.carousel-selected {
	z-index: 0;
}

.carousel .carousel-item.before {
	z-index: -1000;
	transform: translateY(-25%) scale(70%);
	opacity: 0.8;
}

.carousel .carousel-item.after {
	z-index: -1000;
	transform: translateY(25%) scale(70%);
	opacity: 0.8;
}

.carousel .carousel-item.before-hidden {
	z-index: -2000;
	transform: translateY(-50%) scale(1%);
	opacity: 0;
}

.carousel .carousel-item.after-hidden {
	z-index: -2000;
	transform: translateY(50%) scale(1%);
	opacity: 0;
}

.card-popup :deep(.card-individual-image > img) {
	width: auto;
	height: var(--image-height);
	aspect-ratio: 100/140;
	background-image: var(--card-back-image, url("../assets/img/cardback.webp"));
	background-size: cover;
}

.related-card {
	width: calc(0.71 * var(--image-height));
	height: var(--image-height);
	background: var(--card-back-image, url("../assets/img/cardback.webp"));
	background-size: 100%;
	border-radius: 3%;
}

.related-card .related-card-image {
	width: auto;
	height: var(--image-height);
	border-radius: 3%;
	background-image: var(--card-back-image, url("../assets/img/cardback.webp"));
	background-size: cover;
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

	min-height: 50%;
	max-height: 95%;
	width: 2em;
	margin: 0 auto 0 auto;
	padding: 2.5em 0 2.5em 0;
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

.all-parts .carousel-selected {
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
	top: 0.8em;
	left: 50%;
	transform: translateX(-50%);
	display: flex;
	gap: 0.25em;
}

.alt-hint {
	position: absolute;
	color: #666;
	text-shadow: 0px -1px 0px rgba(0, 0, 0, 0.7);
	bottom: 0.8em;
	left: 50%;
	transform: translateX(-50%);
	display: flex;
	gap: 0.25em;
}

.alt-card-text {
	position: absolute;
	top: 0;
	bottom: 0;
	left: 0;
	right: 0;
	z-index: 10;
}
</style>

<template>
	<transition name="zoom">
		<div
			class="card-popup"
			:class="{ left: position === 'left', right: position === 'right' }"
			v-if="card"
			v-show="display"
		>
			<CardImage
				class="card-image"
				:language="language"
				:card="card"
				:fixedLayout="true"
				v-if="currentPart === 0"
			/>
			<div class="related-card" v-else>
				<template v-if="relatedCards[currentPart - 1].status !== 'ready'">
					<card-placeholder class="card-image"></card-placeholder>
				</template>
				<template v-else>
					<img :src="relatedCards[currentPart - 1].image_uris.border_crop" class="card-image" />
				</template>
			</div>
			<div v-if="hasAdditionalData(card.id)">
				<div v-if="relatedCards.length > 0" class="all-parts">
					<div class="mouse-hint"><i class="fas fa-arrows-alt-v"></i> <i class="fas fa-mouse"></i></div>
					<i class="fas fa-angle-left"></i>
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
					<i class="fas fa-angle-right"></i>
				</div>
			</div>
			<div v-else class="all-parts"><i class="fas fa-spinner fa-spin"></i></div>
		</div>
	</transition>
</template>

<script>
import axios from "axios";

import CardPlaceholder from "./CardPlaceholder.vue";
import CardImage from "./CardImage.vue";

export default {
	components: { CardImage, CardPlaceholder },
	props: {
		language: { type: String, required: true },
	},
	data() {
		return { display: false, card: null, position: "left", cardCache: {}, currentPart: 0 };
	},
	created() {
		this.$root.$on("togglecardpopup", (event, card) => {
			if (!this.display) {
				this.position = event.clientX < window.innerWidth / 2 ? "right" : "left";
				this.card = card;
				this.currentPart = 0;
				this.requestData(card.id);

				document.addEventListener("wheel", this.mouseWheel, { passive: false });
			} else document.removeEventListener("wheel", this.mouseWheel);
			this.display = !this.display;
		});
		this.$root.$on("closecardpopup", () => {
			this.display = false;
		});
	},
	methods: {
		requestData(cardID) {
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
		hasAdditionalData(cardID) {
			return cardID in this.cardCache && this.cardCache[cardID]?.status === "ready";
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
				if (event.deltaY > 0) this.nextPart();
				else this.previousPart();
				event.stopPropagation();
				event.preventDefault();
			}
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
	--image-height: 70vh;

	position: fixed;
	top: 15vh;
	height: var(--image-height);
	min-width: min(90vw, calc(0.71 * var(--image-height)));
	max-width: min(90vw, calc(2 * 0.71 * var(--image-height)));
	z-index: 999;
	pointer-events: none;
	filter: drop-shadow(0 0 0.5vw #000000);
}

.card-popup .card-image {
	width: 100%;
}

.card-popup.right {
	right: 2.5vw;
}

.card-popup.left {
	left: 2.5vw;
}

.card-popup >>> img {
	max-height: var(--image-height);
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

.all-parts {
	position: relative;
	display: flex;
	flex-direction: row;
	justify-content: center;
	align-items: center;
	gap: 0.5vw;

	width: 50%;
	margin: 0 auto 0 auto;
	padding: 1vh 0.5vw 1vh 0.5vw;
	background: #222;
	border: 2px solid #333;
	border-top: 0;
	border-radius: 0 0 1em 1em;

	color: #aaa;
}

.all-parts .selected {
	text-shadow: 0 0 6px white;
	color: white;
}

.all-parts .fa-angle-left,
.all-parts .fa-angle-right {
	color: #666;
}

.mouse-hint {
	position: absolute;
	left: 1em;
	color: #666;
	text-shadow: 0px -1px 0px rgba(0, 0, 0, 0.7);
	top: 50%;
	transform: translateY(-50%);
}

.related-card {
	height: var(--image-height);
	background: url("../assets/img/cardback.png");
	background-size: 100%;
	border-radius: 3%;
}

.related-card .card-image {
	height: var(--image-height);
	border-radius: 3%;
}
</style>

<template>
	<div class="card-text-container">
		<template v-if="!face">
			<div>
				<font-awesome-icon icon="fa-solid fa-spinner" spin></font-awesome-icon>
			</div>
		</template>
		<template v-else>
			<div class="card-text">
				<div class="card-top-line" v-if="face.name">
					<div class="card-top-line-inner">
						<div class="card-name font-size-fit">{{ face.name }}</div>
						<div
							class="card-mana-cost"
							v-if="face.mana_cost"
							v-html="transformManaCost(face.mana_cost)"
						></div>
					</div>
				</div>
				<div class="card-type font-size-fit" v-if="face.type_line">
					{{ face.type_line }}
				</div>
				<div
					class="card-oracle font-size-fit"
					v-if="face.oracle_text"
					v-html="parseOracle(face.oracle_text)"
				></div>
				<div class="card-pt font-size-fit" v-if="face.power">{{ face.power }} / {{ face.toughness }}</div>
				<div class="card-loyalty font-size-fit" v-if="face.loyalty">{{ face.loyalty }}</div>
			</div>
		</template>
	</div>
</template>

<script lang="ts">
import { ScryfallCard, isScryfallCard, ScryfallCardFace, CardCacheEntry, isScryfallCardFace } from "../vueCardCache";
import { defineComponent, PropType } from "vue";
import { replaceManaSymbols } from "../ManaSymbols";
import { Card, CardFace } from "@/CardTypes";
import { fitFontSize } from "../helper";

// Displays a card using Scryfall card data instead of its image.
export default defineComponent({
	name: "CardText",
	props: {
		card: { type: Object as PropType<ScryfallCard | ScryfallCardFace | CardCacheEntry | CardFace | Card> },
		fixedLayout: { type: Boolean, default: false },
	},
	mounted() {
		// This has to be called when the component is visible:
		// We can't use v-show or mounted will be called while the element is hidden and fitAll will do nothing.
		// There's no way to know when the element is visible becasue of v-show (apart from tracking it ourselves).
		this.fitAll();
	},
	methods: {
		fitAll() {
			this.$nextTick(() => {
				this.$el.querySelectorAll(".card-text .font-size-fit").forEach((div: HTMLElement) => {
					fitFontSize(div, div, 2.5, "vh");
				});
			});
		},
		parseOracle(str: string) {
			str = replaceManaSymbols(str);
			// Included reminder text
			str = str.replace(/\([^)]+\)/g, (match) => `<span class="oracle-reminder">${match}</span>`);
			return str
				.split("\n")
				.map((line) => `<div>${line}</div>`)
				.join("");
		},
		transformManaCost(str: string) {
			return replaceManaSymbols(str);
		},
	},
	computed: {
		face() {
			if (!this.card) return undefined;
			if (isScryfallCard(this.card)) {
				if (!this.card?.card_faces || this.card?.card_faces?.length <= 1) return this.card;
				return this.card.card_faces[0];
			} else if (isScryfallCardFace(this.card)) {
				return this.card;
			}
			const r: Record<string, any> = {};
			if ("name" in this.card) r.name = this.card.name;
			if ("mana_cost" in this.card) r.mana_cost = this.card.mana_cost;
			if ("type" in this.card) {
				r.type_line = this.card.type;
				if ("subtypes" in this.card && this.card.subtypes.length > 0)
					r.type_line += " \u2013 " + this.card.subtypes;
			}
			if ("oracle_text" in this.card) r.oracle_text = this.card.oracle_text;
			if ("power" in this.card) r.power = this.card.power;
			if ("toughness" in this.card) r.toughness = this.card.toughness;
			if ("loyalty" in this.card) r.loyalty = this.card.loyalty;
			return r;
		},
	},
	watch: {
		card() {
			this.fitAll();
		},
	},
});
</script>

<style scoped>
@font-face {
	font-family: "Beleren";
	src: url("../assets/fonts/beleren-bold_P1.01.ttf") format("truetype");
}
@font-face {
	font-family: "Beleren Small Caps";
	src: url("../assets/fonts/belerensmallcaps-bold.ttf") format("truetype");
}
@font-face {
	font-family: "MPlantin";
	src:
		url("../assets/fonts/mplantin.eot") format("eot"),
		url("../assets/fonts/mplantin.woff") format("woff");
}
@font-face {
	font-family: "MPlantin-Italic";
	src:
		url("../assets/fonts/MPlantin-Italic.woff") format("woff"),
		url("../assets/fonts/MPlantin-Italic.woff2") format("woff2");
	font-style: italic;
}

.card-text-container {
	display: flex;
}

.card-text-container > * {
	flex: 1;
}

.card-text {
	position: relative;
	aspect-ratio: 100/140;
	border-radius: 3%;
	background-color: #00000060;
	direction: ltr;
	-webkit-user-select: none;
	-moz-user-select: none;
	-ms-user-select: none;
	user-select: none;

	font-family: Beleren;
}

.card-text > div {
	background-color: #222;
	overflow: hidden;
	border: solid 2px #666;
	box-sizing: border-box;
}

.card-text .card-top-line {
	position: absolute;
	top: 2.5%;
	left: 3%;
	right: 3%;

	height: 7%;

	border-radius: 2% / 50%;
	padding: 0 2.6%;
}

.card-text .card-top-line-inner {
	display: flex;
	justify-content: space-between;
	align-items: center;
	align-content: center;
	white-space: nowrap;
	width: 100%;
	height: 100%;
}

.card-text .card-name {
	flex: 0 1 auto;
	max-height: 100%;
}

.card-text .card-mana-cost {
	flex: 1 0 auto;

	display: inline-flex;
	justify-content: flex-end;
	align-items: stretch;
	gap: 2%;
	height: 60%;
	width: auto;
}

.card-text .card-type {
	position: absolute;
	top: 56%;
	left: 3%;
	right: 3%;
	height: 7%;

	display: flex;
	justify-content: flex-start;
	white-space: nowrap;
	align-items: center;
	padding: 0.5% 4%;

	border-radius: 2% / 50%;

	font-size: 0.8em;
	z-index: 1;
}

.card-text .card-oracle {
	position: absolute;
	top: 62.5%;
	left: 5.5%;
	right: 5.5%;
	bottom: 6%;

	display: flex;
	flex-direction: column;
	justify-content: center;
	align-items: flex-start;
	gap: 0.2em;

	border-radius: 1%;

	padding: 2% 3%;
	text-align: left;
	font-size: 0.8em;
	font-family: MPlantin;
}

.card-text .card-loyalty,
.card-text .card-pt {
	position: absolute;
	width: 18%;
	height: 6%;
	right: 3%;
	bottom: 2%;
	z-index: 2;

	border-radius: 10% / 50%;

	display: flex;
	justify-content: center;
	align-items: center;
}

.card-text :deep(.mana-symbol) {
	display: inline-block;
	width: 1em;
	border-radius: 50%;
}

.card-text .card-mana-cost :deep(.mana-symbol) {
	box-shadow: -0.14vh 0.14vh 0 rgba(0, 0, 0, 0.85);
	width: auto;
}

.card-text .card-oracle :deep(.mana-symbol) {
	width: 0.8em;
	margin: 0 0.07em;
	vertical-align: baseline;
}

.card-text .card-oracle :deep(.oracle-reminder) {
	font-family: MPlantin-Italic;
	font-style: italic;
}
</style>

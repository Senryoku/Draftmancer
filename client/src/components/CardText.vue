<template>
	<div class="card-text-container" ref="rootElement">
		<template v-if="!face">
			<div>
				<font-awesome-icon icon="fa-solid fa-spinner" spin></font-awesome-icon>
			</div>
		</template>
		<template v-else>
			<div class="card-text" :class="'color-' + backColor">
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

<script setup lang="ts">
import { ScryfallCard, isScryfallCard, ScryfallCardFace, CardCacheEntry, isScryfallCardFace } from "../vueCardCache";
import { ref, computed, watch, onMounted, nextTick } from "vue";
import { replaceManaSymbols } from "../ManaSymbols";
import { Card, CardFace } from "@/CardTypes";
import { fitFontSize } from "../helper";

// Displays a card using Scryfall card data instead of its image.
const props = withDefaults(
	defineProps<{
		card: ScryfallCard | ScryfallCardFace | CardCacheEntry | CardFace | Card;
		fixedLayout?: boolean;
	}>(),
	{ fixedLayout: false }
);

const rootElement = ref<HTMLElement>();

onMounted(() => {
	// This has to be called when the component is visible:
	// We can't use v-show or mounted will be called while the element is hidden and fitAll will do nothing.
	// There's no way to know when the element is visible becasue of v-show (apart from tracking it ourselves).
	fitAll();
});

function fitAll() {
	nextTick(() => {
		rootElement.value?.querySelectorAll(".card-text .font-size-fit").forEach((div) => {
			fitFontSize(div as HTMLElement, div as HTMLElement, 2.5, "vh");
		});
	});
}

function parseOracle(str: string) {
	str = replaceManaSymbols(str);
	// Included reminder text
	str = str.replace(/\([^)]+\)/g, (match) => `<span class="oracle-reminder">${match}</span>`);
	return str
		.split("\n")
		.map((line) => `<div>${line}</div>`)
		.join("");
}

function transformManaCost(str: string) {
	return replaceManaSymbols(str);
}

const colors = computed(() => {
	if (!props.card) return undefined;
	if (isScryfallCard(props.card)) {
		return props.card.colors;
	} else if (isScryfallCardFace(props.card)) {
		return props.card.colors;
	}
	if ("colors" in props.card) return props.card.colors;
	return undefined;
});

const backColor = computed(() => {
	if (!colors.value) return undefined;
	if (colors.value?.length === 1) return colors.value[0];
	return "M";
});

const face = computed(() => {
	if (!props.card) return undefined;
	if (isScryfallCard(props.card)) {
		if (!props.card?.card_faces || props.card?.card_faces?.length <= 1) return props.card;
		return props.card.card_faces[0];
	} else if (isScryfallCardFace(props.card)) {
		return props.card;
	}
	const r: Partial<ScryfallCardFace> = {};
	if ("name" in props.card) r.name = props.card.name;
	if ("mana_cost" in props.card) r.mana_cost = props.card.mana_cost;
	if ("type" in props.card) {
		r.type_line = props.card.type;
		if ("subtypes" in props.card && props.card.subtypes.length > 0) r.type_line += " \u2013 " + props.card.subtypes;
	}
	if ("oracle_text" in props.card) r.oracle_text = props.card.oracle_text;
	if ("power" in props.card) r.power = props.card.power?.toString();
	if ("toughness" in props.card) r.toughness = props.card.toughness?.toString();
	if ("loyalty" in props.card) r.loyalty = props.card.loyalty?.toString();
	return r;
});

watch(face, () => {
	fitAll();
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
	position: absolute;
	aspect-ratio: 100/140;
	top: 0;
	left: 0;
	right: 0;
	bottom: 0;
	display: flex;

	--bg-opacity: 0.3;
	--bg-color: rgba(0, 0, 0, var(--bg-opacity));
}

.battle-front .card-text-container {
	top: 0;
	left: 14.5%;
	right: auto;
	bottom: 0;
}

.card-text-container > * {
	flex: 1;
}

.color-W {
	--bg-color: rgba(230, 231, 225, var(--bg-opacity));
}
.color-U {
	--bg-color: rgba(14, 104, 171, var(--bg-opacity));
}
.color-B {
	--bg-color: rgba(20, 10, 0, var(--bg-opacity));
}
.color-R {
	--bg-color: rgba(160, 12, 22, var(--bg-opacity));
}
.color-G {
	--bg-color: rgba(0, 110, 57, var(--bg-opacity));
}
.color-M {
	--bg-color: rgba(0, 0, 0, var(--bg-opacity));
	/* --bg-color: rgba(134, 88, 0, var(--bg-opacity)); */
}

.card-text {
	position: relative;
	aspect-ratio: 100/140;
	z-index: 10;

	border-radius: 3%;
	background: radial-gradient(circle at 50% 35%, rgba(0, 0, 0, 0) 10%, var(--bg-color) 80%);
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

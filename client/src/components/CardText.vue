<template>
	<div class="card-text-container">
		<div v-if="faces.length === 0">
			<i class="fas fa-spinner fa-spin"></i>
		</div>
		<div class="card-text" v-for="(face, idx) in faces" :key="idx">
			<div class="card-top-line" v-if="face.name">
				<span class="card-name font-size-fit">{{ face.name }}</span>
				<span class="card-mana-cost" v-html="replaceManaSymbols(face.mana_cost)"></span>
			</div>
			<div class="card-type font-size-fit" v-if="face.type_line">
				{{ face.type_line }}
			</div>
			<div class="card-oracle font-size-fit" v-if="face.oracle_text" v-html="parseOracle(face.oracle_text)"></div>
			<div class="card-pt font-size-fit" v-if="face.power">{{ face.power }} / {{ face.toughness }}</div>
			<div class="card-loyalty font-size-fit" v-if="face.loyalty">{{ face.loyalty }}</div>
		</div>
	</div>
</template>

<script>
const ManaRegex = /{([^}]+)}/g;
const ManaSymbols = {};
import ManaSymbolsList from "../../../data/symbology.json";
for (let symbol of ManaSymbolsList.data) ManaSymbols[symbol.symbol] = symbol;

function checkOverflow(el) {
	const curOverflow = el.style.overflow;
	if (!curOverflow || curOverflow === "visible") el.style.overflow = "hidden";
	const isOverflowing = el.clientWidth < el.scrollWidth || el.clientHeight < el.scrollHeight;
	el.style.overflow = curOverflow;
	return isOverflowing;
}

// Displays a card using Scryfall card data instead of its image.
export default {
	name: "CardText",
	props: { card: { type: Object }, fixedLayout: { type: Boolean, default: false } },
	mounted() {
		// This has to be called when the component is visible:
		// We can't use v-show or mounted will be called while the element is hidden and fitAll will do nothing.
		// There's no way to know when the element is visible becasue of v-show (apart from tracking it ourselves).
		this.fitAll();
	},
	methods: {
		fitAll() {
			this.$nextTick(() => {
				this.$el.querySelectorAll(".card-text .font-size-fit").forEach((div) => {
					this.fitFontSize(div);
				});
			});
		},
		fitFontSize(el, initial_size = 2.5) {
			el.classList.add("fitting");
			let curr_font_size = initial_size;
			el.style.fontSize = curr_font_size + "vh";
			while (checkOverflow(el) && curr_font_size > 0.1) {
				curr_font_size *= 0.9;
				el.style.fontSize = curr_font_size + "vh";
			}
			el.classList.remove("fitting");
		},
		replaceManaSymbols(str) {
			return str.replace(ManaRegex, (match, group) => this.genManaSymbol(group)?.outerHTML.trim() ?? match);
		},
		parseOracle(str) {
			str = this.replaceManaSymbols(str);
			// Included reminder text
			str = str.replace(/\([^)]+\)/g, (match) => `<span class="oracle-reminder">${match}</span>`);
			return str
				.split("\n")
				.map((line) => `<div>${line}</div>`)
				.join("");
		},
		genManaSymbol(str) {
			if ("{" + str + "}" in ManaSymbols) {
				let el = new Image();
				el.src = ManaSymbols["{" + str + "}"].svg_uri;
				el.className = "mana-symbol";
				return el;
			}
			return null;
		},
	},
	computed: {
		front() {
			if (!this.card?.card_faces || this.card?.card_faces?.length <= 1) return this.card;
			return this.card.card_faces[0];
		},
		back() {
			if (!this.card?.card_faces || this.card?.card_faces?.length <= 1 || !this.fixedLayout) return null;
			return this.card.card_faces[1];
		},
		faces() {
			return [this.front, this.back].filter((f) => !!f);
		},
	},
	watch: {
		card() {
			this.fitAll();
		},
	},
};
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
	src: url("../assets/fonts/mplantin.eot") format("eot"), url("../assets/fonts/mplantin.woff") format("woff");
}
@font-face {
	font-family: "MPlantin-Italic";
	src: url("../assets/fonts/MPlantin-Italic.woff") format("woff"),
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

	display: flex;
	justify-content: space-between;
	white-space: nowrap;
	align-items: center;
	padding: 2% 4%;

	border-radius: 2% / 50%;
}

.card-text .card-mana-cost {
	display: flex;
	justify-content: center;
	font-size: 2.5vh;
	gap: 0.2em;
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

.card-text >>> .mana-symbol {
	display: inline-block;
	width: 1em;
	border-radius: 50%;
}

.card-text .card-mana-cost >>> .mana-symbol {
	box-shadow: -0.14vh 0.14vh 0 rgba(0, 0, 0, 0.85);
}

.card-text .card-oracle >>> .mana-symbol {
	width: 0.8em;
	margin: 0 0.07em;
	vertical-align: baseline;
}

.card-text .card-oracle >>> .oracle-reminder {
	font-family: MPlantin-Italic;
	font-style: italic;
}
</style>

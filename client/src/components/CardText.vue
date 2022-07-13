<template>
	<div class="card-text">
		<div class="card-name" v-if="card && card.name">
			<span>{{ card.name }}</span>
			<span>{{ card.mana_cost }}</span>
		</div>
		<div class="card-type" v-if="card && card.type_line">
			{{ card.type_line }}
		</div>
		<div class="card-oracle" v-if="card && card.oracle_text">{{ card.oracle_text }}</div>
		<div class="card-pt" v-if="card && card.power">{{ card.power }} / {{ card.toughness }}</div>
		<div class="card-loyalty" v-if="card && card.loyalty">{{ card.loyalty }}</div>
	</div>
</template>

<script>
function check_overflow(el) {
	const curOverflow = el.style.overflow;
	if (!curOverflow || curOverflow === "visible") el.style.overflow = "hidden";
	const isOverflowing = el.clientWidth < el.scrollWidth || el.clientHeight < el.scrollHeight;
	el.style.overflow = curOverflow;
	return isOverflowing;
}

// Displays a card using Scryfall card data instead of its image.
export default {
	name: "CardText",
	props: { card: { type: Object } },
	mounted() {
		// This has to be called when the component is visible:
		// We can't use v-show or mounted will be called while the element is hidden and fit_all will do nothing.
		// There's no way to know when the element is visible becasue of v-show (apart from tracking it ourselves).
		this.fit_all();
	},
	methods: {
		fit_all() {
			this.$nextTick(() => {
				this.$el.querySelectorAll(".card-text > div").forEach((div) => {
					this.fit_font_size(div);
				});
			});
		},
		fit_font_size(el, initial_size = 14) {
			el.classList.add("fitting");
			let curr_font_size = initial_size;
			el.style.fontSize = curr_font_size + "pt";
			while (check_overflow(el) && curr_font_size > 3) {
				curr_font_size *= 0.9;
				el.style.fontSize = curr_font_size + "pt";
			}
			el.classList.remove("fitting");
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
	src: url("../assets/fonts/mplantin.eot") format("eot"), url("../assets/fonts/mplantin.woff") format("woff"),
		url("../assets/fonts/mplantin.ttf") format("truetype");
}
@font-face {
	font-family: "MPlantin-Italic";
	src: url("../assets/fonts/MPlantin-Italic.ttf") format("truetype");
	font-style: italic;
}

.card-text {
	position: relative;
	padding-top: 140%;
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
}

.card-text .card-name {
	position: absolute;
	top: 2.5%;
	left: 3%;
	right: 3%;

	height: 7%;

	display: flex;
	justify-content: space-between;
	white-space: nowrap;
	align-items: center;
	padding: 0 4%;

	border-radius: 1000px;
}

.card-text .card-type {
	position: absolute;
	top: 55.5%;
	left: 3%;
	right: 3%;
	height: 7%;

	display: flex;
	justify-content: flex-start;
	white-space: nowrap;
	align-items: center;
	padding: 0 4%;

	border-radius: 1000px;

	font-size: 0.8em;
}

.card-text .card-oracle {
	position: absolute;
	top: 62.5%;
	left: 5.5%;
	right: 5.5%;
	bottom: 6%;

	display: flex;
	justify-content: flex-start;
	align-items: center;

	border-radius: 1%;

	padding: 2% 3%;
	text-align: left;
	font-size: 0.8em;
	font-family: MPlantin;
	white-space: pre-wrap;
}

.card-text .card-loyalty,
.card-text .card-pt {
	position: absolute;
	width: 18%;
	height: 6%;
	right: 3%;
	bottom: 2%;
	z-index: 2;

	border-radius: 1000px;

	display: flex;
	justify-content: center;
	align-items: center;
}
</style>

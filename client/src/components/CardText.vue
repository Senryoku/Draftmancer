<template>
	<div class="card-text-container">
		<div class="card-text" v-if="front">
			<div class="card-name" v-if="front.name">
				<span>{{ front.name }}</span>
				<span>{{ front.mana_cost }}</span>
			</div>
			<div class="card-type" v-if="front.type_line">
				{{ front.type_line }}
			</div>
			<div class="card-oracle" v-if="front.oracle_text">{{ front.oracle_text }}</div>
			<div class="card-pt" v-if="front.power">{{ front.power }} / {{ front.toughness }}</div>
			<div class="card-loyalty" v-if="front.loyalty">{{ front.loyalty }}</div>
		</div>
		<div class="card-text" v-if="fixedLayout && back">
			<div class="card-name" v-if="back.name">
				<span>{{ back.name }}</span>
				<span>{{ back.mana_cost }}</span>
			</div>
			<div class="card-type" v-if="back.type_line">
				{{ back.type_line }}
			</div>
			<div class="card-oracle" v-if="back.oracle_text">{{ back.oracle_text }}</div>
			<div class="card-pt" v-if="back.power">{{ back.power }} / {{ back.toughness }}</div>
			<div class="card-loyalty" v-if="back.loyalty">{{ back.loyalty }}</div>
		</div>
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
	props: { card: { type: Object }, fixedLayout: { type: Boolean, default: false } },
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
		fit_font_size(el, initial_size = 16) {
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
	computed: {
		front() {
			if (!this.card?.card_faces || this.card?.card_faces?.length <= 1) return this.card;
			return this.card.card_faces[0];
		},
		back() {
			if (!this.card?.card_faces || this.card?.card_faces?.length <= 1) return null;
			return this.card.card_faces[1];
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
	padding: 0.5% 4%;

	border-radius: 2% / 50%;
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

	border-radius: 10% / 50%;

	display: flex;
	justify-content: center;
	align-items: center;
}
</style>

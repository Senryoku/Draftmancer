<template>
	<div class="card">
		<clazy-load :ratio="0.01" margin="200px" :src="imageURI" loadingClass="card-loading">
			<img :src="imageURI" :title="printedName" />
			<div class="card-placeholder" slot="placeholder">
				<div class="card-name">{{ printedName }}</div>
			</div>
		</clazy-load>
		<div class="not-booster" v-if="!card.in_booster">Can't be obtained in boosters.</div>
		<div class="card-count" v-if="card.count < 4">x{{ 4 - card.count }}</div>
	</div>
</template>

<script>
const ImageURLPrefix = "https://img.scryfall.com/cards/border_crop/front/";
export default {
	name: "MissingCard",
	template: `
	`,
	props: {
		card: { type: Object, required: true },
		language: { type: String, default: "en" },
	},
	computed: {
		imageURI: function() {
			return ImageURLPrefix + this.$root.cards[this.card.id].image_uris[this.language];
		},
		printedName: function() {
			return this.$root.cards[this.card.id].printed_name[this.language];
		},
	},
	created: function() {
		// Preload Carback
		const img = new Image();
		img.src = "img/cardback.png";
	},
};
</script>

<style scoped>
.card-count {
	position: absolute;
	right: 1em;
	bottom: 1em;
	background: rgba(0, 0, 0, 0.5);
	width: 1.5em;
	height: 1.5em;
	border-radius: 0.75em;
	line-height: 1.5em;
	text-align: center;
}

.not-booster {
	position: absolute;
	left: 1em;
	bottom: 1em;
	font-size: 0.6em;
	font-weight: bold;
	color: red;
	background-color: rgba(255, 255, 255, 0.8);
	padding: 0.2em;
	border-radius: 0.2em;
}
</style>
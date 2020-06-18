<template>
	<clazy-load :ratio="0.01" margin="200px" :src="imageURI" loadingClass="card-loading" :title="printedName">
		<img :src="imageURI" />
		<div class="card-placeholder" slot="placeholder">
			<div class="card-name">{{ printedName }}</div>
		</div>
	</clazy-load>
</template>

<script>
const ImageURLPrefix = "https://img.scryfall.com/cards/border_crop/front/";
export default {
	name: "CardImage",
	props: {
		card: { type: Object, required: true },
		language: { type: String, default: "en" },
	},
	computed: {
		imageURI: function() {
			if (this.language in this.$root.cards[this.card.id].image_uris)
				return ImageURLPrefix + this.$root.cards[this.card.id].image_uris[this.language];
			return ImageURLPrefix + this.$root.cards[this.card.id].image_uris["en"];
		},
		printedName: function() {
			if (this.language in this.$root.cards[this.card.id].printed_name)
				return this.$root.cards[this.card.id].printed_name[this.language];
			return this.$root.cards[this.card.id].name;
		},
	},
};
</script>

<style scoped>
.card-placeholder {
	width: 200px;
	height: 283.333px;
	border-radius: 5px;
	background: url("../assets/img/cardback.png");
	background-repeat: no-repeat;
	background-size: 100%;
}

img {
	width: 200px;
	border-radius: 6px;
	-webkit-user-select: none;
	-moz-user-select: none;
	-ms-user-select: none;
	user-select: none;
}
</style>

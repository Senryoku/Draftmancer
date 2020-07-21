<template>
	<clazy-load
		:ratio="0.01"
		margin="200px"
		:src="imageURI"
		loadingClass="card-loading"
		:title="printedName"
	>
		<img :src="imageURI" />
		<card-placeholder slot="placeholder" :name="printedName"></card-placeholder>
	</clazy-load>
</template>

<script>
import { Cards } from "./../Cards.js";
import CardPlaceholder from "./CardPlaceholder.vue";
const ImageURLPrefix = "https://img.scryfall.com/cards/border_crop/front/";
export default {
	name: "CardImage",
	components: { CardPlaceholder },
	props: {
		card: { type: Object, required: true },
		language: { type: String, required: true },
	},
	computed: {
		imageURI: function() {
			if (this.language in Cards[this.card.id].image_uris)
				return ImageURLPrefix + Cards[this.card.id].image_uris[this.language];
			return ImageURLPrefix + Cards[this.card.id].image_uris["en"];
		},
		printedName: function() {
			if (this.language in Cards[this.card.id].printed_name)
				return Cards[this.card.id].printed_name[this.language];
			return Cards[this.card.id].name;
		},
	},
};
</script>

<style scoped>
img {
	width: 200px;
	border-radius: 6px;
	-webkit-user-select: none;
	-moz-user-select: none;
	-ms-user-select: none;
	user-select: none;
}
</style>

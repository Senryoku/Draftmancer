<template>
	<div
		class="card clickable"
		:data-arena-id="card.id"
		:data-cmc="card.cmc"
		@click="selectcard($event, card)"
		@dblclick="ondblclick($event, card)"
		:title="card.printed_name[language]"
	>
		<clazy-load :ratio="0.01" margin="200px" :src="imageURI" loadingClass="card-loading">
			<img
				v-if="card.image_uris[language]"
				:src="imageURI"
				:class="{ selected: selected, burned: burned }"
			/>
			<img v-else src="img/missing.svg" />
			<div class="card-placeholder" slot="placeholder" :class="{ selected: selected }">
				<div class="card-name">{{ card.printed_name[language] }}</div>
			</div>
		</clazy-load>
		<div
			v-if="!selected && canbeburned && !burned"
			class="burn-card red clickable"
			@click="burn($event, card)"
		>
			<i class="fas fa-ban fa-2x"></i>
		</div>
		<div
			v-if="!selected && canbeburned && burned"
			class="restore-card blue clickable"
			@click="restore($event, card)"
		>
			<i class="fas fa-undo-alt fa-2x"></i>
		</div>
	</div>
</template>

<script>
const ImageURLPrefix = "https://img.scryfall.com/cards/border_crop/front/";

export default {
	name: "Card",
	props: {
		card: { type: Object, required: true },
		language: String,
		selectcard: { type: Function, default: function() {} },
		selected: Boolean,
		ondblclick: { type: Function, default: function() {} },
		burn: { type: Function, default: function() {} },
		restore: { type: Function, default: function() {} },
		canbeburned: { type: Boolean, default: false },
		burned: { type: Boolean, default: false },
	},
	computed: {
		imageURI: function() {
			return ImageURLPrefix + this.card.image_uris[this.language];
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
.burned {
	-webkit-box-shadow: 0px 0px 20px 1px rgb(161, 0, 3);
	-moz-box-shadow: 0px 0px 20px 1px rgb(161, 0, 3);
	box-shadow: 0px 0px 20px 1px rgb(161, 0, 3);
}

.burn-card,
.restore-card {
	position: absolute;
	left: 0;
	bottom: 0;
	text-shadow: 0 0 3px black, 0 0 4px white;
}
</style>

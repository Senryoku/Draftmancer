<template>
	<div>
		<div
			v-if="hasBack"
			style="pointer-events: auto"
			@mouseenter="displayBack = true"
			@mouseleave="displayBack = false"
		>
			<i class="fas fa-sync flip-icon"></i>
		</div>
		<transition name="flip" mode="out-in">
			<div v-if="hasBack && displayBack" :key="'back'">
				<clazy-load
					:ratio="0.01"
					margin="200px"
					:src="back['image_uris']"
					loadingClass="card-loading"
					:title="back['printed_name']"
				>
					<img :src="back['image_uris']" />
					<card-placeholder slot="placeholder" :name="back['printed_name']"></card-placeholder>
				</clazy-load>
			</div>
			<div v-else :key="'front'">
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
			</div>
		</transition>
	</div>
</template>

<script>
import { Cards } from "./../Cards.js";
import CardPlaceholder from "./CardPlaceholder.vue";
export default {
	name: "CardImage",
	components: { CardPlaceholder },
	props: {
		card: { type: Object, required: true },
		language: { type: String, required: true },
	},
	data: function () {
		return { displayBack: false };
	},
	computed: {
		imageURI: function () {
			if (this.language in Cards[this.card.id].image_uris) return Cards[this.card.id].image_uris[this.language];
			return Cards[this.card.id].image_uris["en"];
		},
		printedName: function () {
			if (this.language in Cards[this.card.id].printed_name)
				return Cards[this.card.id].printed_name[this.language];
			return Cards[this.card.id].name;
		},
		hasBack: function () {
			return Cards[this.card.id].back !== null && Cards[this.card.id].back !== undefined;
		},
		back: function () {
			if (!this.hasBack) return {};
			if (this.language in Cards[this.card.id].back) return Cards[this.card.id].back[this.language];
			return Cards[this.card.id].back["en"];
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

.flip-icon {
	position: absolute;
	top: -0.25em;
	right: -0.4em;
	z-index: 2;

	transform: rotateX(45deg) skewX(-10deg);
}

.flip-enter-active {
	transition: transform 0.1s ease-out;
}

.flip-leave-active {
	transition: transform 0.1s ease-in;
}
.flip-enter {
	transform: rotateY(-90deg);
}

.flip-leave-to {
	transform: rotateY(90deg);
}
</style>

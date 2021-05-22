<template>
	<transition name="zoom">
		<div class="card-popup" :class="{ left: position === 'left', right: position === 'right' }" v-show="display">
			<CardImage v-if="card" :language="language" :card="card" :fixedLayout="true" />
		</div>
	</transition>
</template>

<script>
import CardImage from "./CardImage.vue";
export default {
	components: { CardImage },
	props: {
		language: { type: String, required: true },
	},
	data() {
		return { display: false, card: null, position: "left" };
	},
	created() {
		this.$root.$on("togglecardpopup", (event, card) => {
			console.log("gotit!");
			console.log(event);
			console.log(event.clientX, window.innerWidth / 2);
			if (event.clientX < window.innerWidth / 2) {
				this.position = "right";
			} else {
				this.position = "left";
			}
			this.card = card;
			this.display = !this.display;
		});
		this.$root.$on("closecardpopup", () => {
			this.display = false;
		});
	},
	computed: {
		imageURI: function () {
			if (this.language in this.card.image_uris) return this.card.image_uris[this.language];
			return this.card.image_uris["en"];
		},
		hasBack: function () {
			return this.card.back !== null && this.card.back !== undefined;
		},
		backImageURI: function () {
			return this.language in this.card.back.image_uris
				? this.card.back.image_uris[this.language]
				: this.card.back.image_uris["en"];
		},
	},
};
</script>

<style scoped>
.card-popup {
	position: fixed;
	top: 10vh;
	height: 80vh;
	max-width: min(90vw, calc(2 * 0.71 * 80vh));
	z-index: 999;
	pointer-events: none;
	filter: drop-shadow(0 0 0.5vw #000000);
}

.card-popup.right {
	right: 5vw;
}

.card-popup.left {
	left: 5vw;
}

.card-popup .card {
	width: 100%;
}

.zoom-enter-active,
.zoom-leave-active {
	transition: all 0.15s ease;
}

.zoom-enter,
.zoom-leave-to {
	opacity: 0;
	transform: scale(0);
}
</style>
<template>
	<transition name="zoom">
		<div
			class="card-popup"
			:class="{ left: position === 'left', right: position === 'right' }"
			v-if="card"
			v-show="display"
		>
			<CardImage :language="language" :card="card" :fixedLayout="true" />
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
			if (!this.display) {
				this.position = event.clientX < window.innerWidth / 2 ? "right" : "left";
				this.card = card;
			}
			this.display = !this.display;
		});
		this.$root.$on("closecardpopup", () => {
			this.display = false;
		});
	},
};
</script>

<style scoped>
.card-popup {
	--image-height: 70vh;

	position: fixed;
	top: 15vh;
	height: var(--image-height);
	min-width: min(90vw, calc(0.71 * var(--image-height)));
	max-width: min(90vw, calc(2 * 0.71 * var(--image-height)));
	z-index: 999;
	pointer-events: none;
	filter: drop-shadow(0 0 0.5vw #000000);
}

.card-popup.right {
	right: 2.5vw;
}

.card-popup.left {
	left: 2.5vw;
}

.card-popup >>> img {
	max-height: var(--image-height);
}

.zoom-enter-active,
.zoom-leave-active {
	transition: all 0.15s ease;
}

.zoom-enter,
.zoom-leave-to {
	opacity: 0;
}
.zoom-enter.left,
.zoom-leave-to.left {
	left: -5vw;
}

.zoom-enter.right,
.zoom-leave-to.right {
	right: -5vw;
}
</style>
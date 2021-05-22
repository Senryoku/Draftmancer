<template>
	<transition name="zoom">
		<div
			class="card-popup"
			:class="{ left: position === 'left', right: position === 'right' }"
			v-if="card"
			v-show="display"
			style="-webkit-transform: translateZ(0)"
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
			this.position = event.clientX < window.innerWidth / 2 ? "right" : "left";
			this.card = card;
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
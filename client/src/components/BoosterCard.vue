<template>
	<Card
		:card="card"
		:language="language"
		:class="{ selected: selected, burned: burned, 'bot-picked': botpicked }"
		class="booster-card"
		:style="`--booster-card-scale: ${scale}`"
	>
		<div v-if="slotName" class="slot-name">{{ slotName }}</div>
		<div
			v-if="wildcardneeded"
			class="collection-status"
			v-tooltip.top="
				`Playing this card will cost you a wildcard. ${
					hasenoughwildcards ? '' : 'Not enough wildcards of this type!'
				}`
			"
		>
			<font-awesome-icon
				icon="fa-solid fa-exclamation-triangle"
				class="yellow missing-warning"
				v-if="!hasenoughwildcards"
			></font-awesome-icon>
			<img class="wildcard-icon" :src="`img/wc_${card.rarity}.webp`" />
		</div>
		<div class="bot-score" v-if="botscore && displayBotScore">{{ displayBotScore }}</div>
		<template v-if="canbeburned && !selected">
			<div v-if="burned" class="restore-card blue clickable" @click="restoreCard($event)">
				<font-awesome-icon icon="fa-solid fa-undo-alt" size="2x"></font-awesome-icon>
			</div>
			<div v-else class="burn-card red clickable" @click="burnCard($event)">
				<font-awesome-icon icon="fa-solid fa-ban" size="2x"></font-awesome-icon>
			</div>
		</template>
	</Card>
</template>

<script lang="ts">
import { Language } from "@/Types";
import { defineComponent, PropType } from "vue";
import { UniqueCard } from "@/CardTypes";
import CardComponent from "./Card.vue";

export default defineComponent({
	name: "BoosterCard",
	components: { Card: CardComponent },
	props: {
		card: { type: Object as PropType<UniqueCard>, required: true },
		language: { type: String as PropType<Language>, default: "en" },
		selected: { type: Boolean, default: false },
		canbeburned: { type: Boolean, default: false },
		burned: { type: Boolean, default: false },
		wildcardneeded: { type: Boolean, default: false },
		hasenoughwildcards: { type: Boolean, default: true },
		botscore: { type: Number, default: null },
		botpicked: { type: Boolean, default: false },
		scale: { type: Number, default: 1 },
	},
	methods: {
		burnCard(e: Event) {
			this.$emit("burn");
			e.stopPropagation();
			e.preventDefault();
		},
		restoreCard(e: Event) {
			this.$emit("restore");
			e.stopPropagation();
			e.preventDefault();
		},
	},
	computed: {
		displayBotScore() {
			if (!this.botscore) return null;
			if (this.botscore < 0) return null;
			return this.botscore.toFixed(1);
		},
		slotName() {
			return this.card.slot;
		},
	},
});
</script>

<style scoped>
.card {
	margin: 0.75em;
	transition: transform 0.08s ease-out;
	will-change: transform;

	width: calc(200px * var(--booster-card-scale));
	height: calc(282px * var(--booster-card-scale));
}

.missing-warning {
	position: absolute;
	left: -0.5em;
	top: 50%;
	transform: translateY(-50%);
	font-size: 0.7em;
	opacity: 70%;
}

.fade-enter-active.card,
.fade-leave-active.card {
	transition: transform 0.5s ease, opacity 0.5s ease;
}

.burn-card,
.restore-card {
	position: absolute;
	left: 0;
	bottom: 0;
	text-shadow: 0 0 3px black, 0 0 4px white;
}

.collection-status {
	position: absolute;
	left: 1rem;
	top: -0.8rem;
	font-family: Calibri;
	color: #888;
	background-color: black;
	font-size: 0.8em;
	width: 2.5rem;
	height: 1rem;
	line-height: 1rem;
	border-radius: 1.25rem 1.25rem 0 0 / 0.8rem 0.8rem 0 0;
	font-weight: 600;
	cursor: default;
	overflow: visible;
}

.collection-status.warn {
	color: #ffffb3;
}

.bot-score {
	position: absolute;
	right: -0.75em;
	top: 12.5%;
	border-radius: 50%;
	background-color: rgba(0, 0, 0, 0.75);
	width: 2em;
	height: 2em;
	line-height: 2em;
}

.slot-name {
	position: absolute;
	top: -1.3em;
	left: 50%;
	transform: translateX(-50%);
	background-color: #333;
	border-radius: 0.5em;
	padding: 0.08em 0.5em 0.5em 0.5em;
	z-index: -1;
	font-size: 0.8em;
}
</style>

<style>
.booster-card:not(.zoomedin) {
	transition: transform 0.08s ease-out;
}

.booster-card:hover:not(.zoomedin) {
	transform: scale(1.08);
}
.skipped .booster-card:hover:not(.zoomedin) {
	transform: inherit;
}

.bot-picked .card-image .front-image,
.bot-picked .card-image .back-image,
.bot-picked .card-placeholder {
	-webkit-box-shadow: 0px 0px 20px 1px rgb(0, 111, 175);
	-moz-box-shadow: 0px 0px 20px 1px rgb(0, 111, 175);
	box-shadow: 0px 0px 20px 1px rgb(0, 111, 175);
}
</style>

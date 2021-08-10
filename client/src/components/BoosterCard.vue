<template>
	<card
		:card="card"
		:language="language"
		:class="{ selected: selected, burned: burned, 'bot-picked': botpicked }"
		class="booster-card"
		v-tooltip.right="botTooltip"
	>
		<div
			v-if="wildcardneeded"
			class="collection-status"
			v-tooltip.top="
				`Playing this card will cost you a wildcard. ${
					hasenoughwildcards ? '' : 'Not enough wildcards of this type!'
				}`
			"
		>
			<i class="fas fa-exclamation-triangle yellow missing-warning" v-if="!hasenoughwildcards"></i>
			<img class="wildcard-icon" :src="`img/wc_${card.rarity}.png`" />
		</div>
		<div class="bot-score" v-if="botscore">{{ (10 * botscore.score).toFixed(1) }}</div>
		<template v-if="canbeburned && !selected">
			<div v-if="burned" class="restore-card blue clickable" @click="restoreCard($event)">
				<i class="fas fa-undo-alt fa-2x"></i>
			</div>
			<div v-else class="burn-card red clickable" @click="burnCard($event)">
				<i class="fas fa-ban fa-2x"></i>
			</div>
		</template>
	</card>
</template>

<script>
import Card from "./Card.vue";
export default {
	name: "BoosterCard",
	components: { Card },
	props: {
		card: { type: Object, required: true },
		language: { type: String, default: "en" },
		selected: { type: Boolean, default: false },
		canbeburned: { type: Boolean, default: false },
		burned: { type: Boolean, default: false },
		wildcardneeded: { type: Boolean, default: false },
		hasenoughwildcards: { type: Boolean, default: true },
		botscore: { type: Object, default: null },
		botpicked: { type: Boolean, default: false },
	},
	methods: {
		burnCard: function(e) {
			this.$emit("burn");
			e.stopPropagation();
			e.preventDefault();
		},
		restoreCard: function(e) {
			this.$emit("restore");
			e.stopPropagation();
			e.preventDefault();
		},
	},
	computed: {
		botTooltip() {
			if (!this.botscore?.oracleResults) return "";
			let r = `Bot score: ${(10 * this.botscore.score).toFixed(1)} `;
			if (this.botpicked) r += "★";
			r += '<br /><div style="font-size:small">';
			for (let o of this.botscore.oracleResults) {
				r += `&nbsp;&nbsp;${o.title}: ${(10 * o.value).toFixed(1)}<br />`;
			}
			r += "</div>";
			return r;
		},
	},
};
</script>

<style scoped>
.card {
	margin: 0.75em;
	transition: transform 0.08s ease-out;
	will-change: transform;
}

.card:hover {
	z-index: 10;
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
</style>

<style>
.booster-card:not(.zoomedin) {
	transition: transform 0.08s ease-out;
}

.booster-card:hover:not(.zoomedin) {
	transform: scale(1.08);
}

.bot-picked .card-image,
.bot-picked .card-placeholder {
	-webkit-box-shadow: 0px 0px 20px 1px rgb(0, 111, 175);
	-moz-box-shadow: 0px 0px 20px 1px rgb(0, 111, 175);
	box-shadow: 0px 0px 20px 1px rgb(0, 111, 175);
}
</style>

<template>
	<div class="grid-draft">
		<div class="card-grid">
			<div style="grid-area: empty"></div>

			<div
				v-for="idx in [0, 1, 2]"
				:key="'pick-col-' + idx"
				:class="'clickable pick-col pick-col-' + idx"
				:style="'grid-area: pick-col-' + idx"
			>
				<transition :name="arrowTransition" mode="out-in">
					<i
						class="fas fa-chevron-circle-down fa-3x"
						v-show="picking && isValidChoice(idx)"
						@click="$emit('pick', idx)"
						@mouseenter="highlight($event, 'col', idx)"
						@mouseleave="highlight($event, 'col', idx)"
					></i>
				</transition>
			</div>
			<div
				v-for="idx in [0, 1, 2]"
				:key="'pick-row-' + idx"
				:class="'clickable pick-row pick-row-' + idx"
				:style="'grid-area: pick-row-' + idx"
			>
				<transition :name="arrowTransition" mode="out-in">
					<i
						class="fas fa-chevron-circle-right fa-3x"
						v-show="picking && isValidChoice(3 + idx)"
						@click="$emit('pick', 3 + idx)"
						@mouseenter="highlight($event, 'row', idx)"
						@mouseleave="highlight($event, 'row', idx)"
					></i>
				</transition>
			</div>
			<div v-for="(c, idx) in state.booster" :key="idx" class="card-slot" :style="'grid-area: card-slot-' + idx">
				<transition :name="cardTransition" mode="out-in">
					<div v-if="c" :key="'card-container-' + c.uniqueID">
						<card :card="c" :class="`row-${Math.floor(idx / 3)} col-${idx % 3}`"></card>
					</div>
					<div v-else :key="'empty-' + idx">
						<i class="fas fa-times-circle fa-4x" style="color: rgba(255, 255, 255, 0.1)"></i>
					</div>
				</transition>
			</div>
		</div>
		<pick-summary v-if="state.lastPicks && state.lastPicks.length > 0" :picks="state.lastPicks"></pick-summary>
	</div>
</template>

<script lang="ts">
import { PropType, defineComponent } from "vue";
import { GridDraftSyncData } from "../../../src/GridDraft";
import { UniqueCard } from "../../../src/CardTypes";

import Card from "./Card.vue";
import PickSummary from "./PickSummary.vue";

export default defineComponent({
	components: { Card, PickSummary },
	props: {
		state: { type: Object as PropType<GridDraftSyncData>, required: true },
		picking: { type: Boolean, required: true },
	},
	methods: {
		isValidChoice(choice: number) {
			let validCards = 0;
			for (let i = 0; i < 3; ++i) {
				//                     Column           Row
				let idx = choice < 3 ? 3 * i + choice : 3 * (choice - 3) + i;
				if (this.state.booster[idx]) ++validCards;
			}
			return validCards > 0;
		},
		highlight(event: Event, type: string, index: number) {
			this.$el.querySelectorAll(`.${type}-${index}`).forEach((el) => {
				if (event.type === "mouseenter") el.classList.add("highlight");
				else if (event.type === "mouseleave") el.classList.remove("highlight");
			});
		},
	},
	computed: {
		cardTransition() {
			// Use special card transition on pick and a simple fading between boosters.
			return this.state.booster.some((c: UniqueCard | null) => c === null) ? "card-select" : "fade";
		},
		arrowTransition() {
			return this.state.booster.some((c: UniqueCard | null) => c === null) ? "fade-delayed" : "fade";
		},
	},
});
</script>

<style scoped>
.grid-draft {
	position: relative;
}

.card-grid {
	display: grid;

	grid-template-areas:
		"empty      pick-col-0  pick-col-1  pick-col-2"
		"pick-row-0 card-slot-0 card-slot-1 card-slot-2"
		"pick-row-1 card-slot-3 card-slot-4 card-slot-5"
		"pick-row-2 card-slot-6 card-slot-7 card-slot-8";

	align-items: center;
	justify-items: center;
	justify-content: center;
	grid-template-columns: 3em 300px 300px 300px;
	grid-template-rows: 4em 300px 300px 300px;

	--animation-duration: 2.5s;
}

.last-picks {
	position: absolute;
	top: 0;
	bottom: 0;
	right: 0;
}

/* Hide last picks on screens too narrow for them to fit */
@media only screen and (max-width: 1200px) {
	.last-picks {
		display: none;
	}
}

/* Adjust positions on narrow but still large enough screens */
@media only screen and (min-width: 1200px) and (max-width: 1400px) {
	.card-grid {
		margin-right: 200px;
	}
}

@media only screen and (min-width: 1600px) {
	.last-picks {
		margin-right: 60px;
	}
}

.highlight {
	box-shadow: 0 0 10px 4px rgba(255, 255, 255, 0.5);
}

.fade-delayed-enter-active,
.fade-delayed-leave-active {
	transition: opacity 0.5s;
}
.fade-delayed-enter,
.fade-delayed-leave-to {
	opacity: 0;
}

.fade-delayed-enter-active {
	transition-delay: calc(var(--animation-duration) - 0.25s);
}

.card-select-enter-active {
	transition: opacity 0.25s;
}

.card-select-enter-from {
	opacity: 0;
}

.card-select-leave-active {
	animation: card-select var(--animation-duration) ease-in;
}

@keyframes card-select {
	0% {
		opacity: 1;
	}
	3% {
		box-shadow: 0 0 40px 12px rgba(255, 255, 255, 1);
		transform: scale(1.05);
		opacity: 1;
	}
	6% {
		box-shadow: 0 0 20px 6px rgba(255, 255, 255, 0.6);
		transform: scale(1);
		opacity: 1;
	}
	45% {
		box-shadow: 0 0 25px 6px rgba(255, 255, 255, 0.8);
		transform: scale(1);
		opacity: 1;
	}
	85% {
		box-shadow: 0 0 20px 6px rgba(255, 255, 255, 0.6);
		transform: scale(1);
		opacity: 1;
	}
	90% {
		transform: scale(1.025);
		opacity: 1;
	}
	95% {
		transform: scale(1);
		opacity: 1;
	}
	100% {
		transform: scale(0);
		opacity: 0;
	}
}
</style>

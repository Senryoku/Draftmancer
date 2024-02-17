<template>
	<div>
		<div class="section-title">
			<h2>Winston Draft</h2>
			<div class="controls">
				<span>
					<template v-if="userID === winstonDraftState.currentPlayer"
						>Your turn to pick a pile of cards!</template
					>
					<template v-else>
						Waiting for
						{{
							winstonDraftState.currentPlayer in sessionUsers
								? sessionUsers[winstonDraftState.currentPlayer].userName
								: "(Disconnected)"
						}}...
					</template>
					There are {{ winstonDraftState.remainingCards }} cards left in the main stack.
				</span>
			</div>
		</div>
		<div class="winston-piles">
			<div
				v-for="(pile, index) in winstonDraftState.piles"
				:key="`winston-pile-${index}`"
				class="winston-pile"
				:class="{ 'winston-current-pile': index === winstonDraftState.currentPile }"
			>
				<transition name="pile" mode="out-in">
					<div class="card-column" :key="pile.length > 0 ? pile[0].uniqueID : `column-${index}`">
						<TransitionGroup name="card">
							<div
								v-for="(card, cardIndex) in pile"
								:key="card.uniqueID"
								class="column-card-container"
								:style="{ '--anim-index': cardIndex }"
							>
								<transition name="flip-card" mode="out-in">
									<template
										v-if="
											userID === winstonDraftState.currentPlayer &&
											index === winstonDraftState.currentPile
										"
									>
										<card :card="card as UniqueCard" :language="language"></card>
									</template>
									<template v-else>
										<div class="card">
											<card-placeholder :card="undefined"></card-placeholder>
										</div>
									</template>
								</transition>
							</div>
						</TransitionGroup>
					</div>
				</transition>
				<template v-if="index === winstonDraftState.currentPile">
					<div class="winston-current-pile-options" v-if="userID === winstonDraftState.currentPlayer">
						<button class="confirm" @click="take">Take Pile</button>
						<button class="stop" @click="skip" v-if="winstonCanSkipPile">
							Skip Pile
							<span v-show="index === 2">and Draw</span>
						</button>
					</div>
					<div class="winston-pile-status" v-else>
						{{ sessionUsers[winstonDraftState.currentPlayer]?.userName ?? "(Disconnected)" }} is looking at
						this pile...
					</div>
				</template>
			</div>
		</div>
	</div>
</template>

<script setup lang="ts">
import { computed } from "vue";
import { UserID } from "@/IDTypes";
import { UserData } from "@/Session/SessionTypes";
import { WinstonDraftSyncData } from "@/WinstonDraft";
import { Language } from "../../../src/Types";
import Card from "./Card.vue";
import CardPlaceholder from "./CardPlaceholder.vue";
import { UniqueCard } from "@/CardTypes";

const props = defineProps<{
	userID: UserID;
	language: Language;
	sessionUsers: { [uid: UserID]: UserData };
	winstonDraftState: WinstonDraftSyncData;
}>();

const emit = defineEmits<{
	(e: "take"): void;
	(e: "skip"): void;
}>();

const take = () => {
	emit("take");
};
const skip = () => {
	emit("skip");
};

const winstonCanSkipPile = computed(() => {
	const s = props.winstonDraftState;
	return !(
		!s.remainingCards &&
		((s.currentPile === 0 && !s.piles[1].length && !s.piles[2].length) ||
			(s.currentPile === 1 && !s.piles[2].length) ||
			s.currentPile === 2)
	);
});
</script>

<style scoped>
.winston-piles {
	display: flex;
	justify-content: space-around;
	position: relative;
	padding: 0.75em;
	min-height: 354.2px;
}

.winston-pile {
	margin: 0 1em 0 1em;
	padding: 0.5em;
	width: 250px;
}

.winston-pile .card {
	width: 100%;
}

.winston-current-pile {
	background-color: #555;
	-webkit-box-shadow: 0px 0px 5px 5px #555;
	-moz-box-shadow: 0px 0px 5px 5px #555;
	box-shadow: 0px 0px 5px 5px #555;
}

.winston-current-pile-options {
	display: flex;
	flex-direction: column;
}

.winston-pile-status {
	box-sizing: border-box;
	width: 100%;
	padding: 0.5em;
	text-align: center;
}

.column-card-container {
	will-change: transform;
}

.pile-enter-active,
.pile-leave-active {
	transition: all 0.5s ease;
}

.card-enter-active {
	transition: all 0.5s ease 0.5s;
}

.pile-leave-to {
	transform: translateY(-300px);
	opacity: 0;
}

.pile-enter-from,
.card-enter-from {
	transform: translateY(300px);
	opacity: 0;
}

.flip-card-enter-active {
	transition: all 0.25s ease-out;
}
.flip-card-leave-active {
	transition: all 0.25s ease-in;
}

.flip-card-enter-active,
.flip-card-leave-active {
	perspective-origin: center center;
}

.flip-card-leave-active {
	transition-delay: calc(0.1s * var(--anim-index));
}

.flip-card-enter-from {
	transform: perspective(1000px) rotateY(90deg);
}

.flip-card-leave-to {
	transform: perspective(1000px) rotateY(-90deg);
}
</style>

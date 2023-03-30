<template>
	<div class="housman-draft" :style="`--card-scale: ${cardScale}`">
		<div class="housman-draft-controls">
			<span>
				Round #{{ state.roundNum + 1 }}/{{ state.roundCount }} - Exchange #{{
					1 + Math.floor(state.exchangeNum / Object.values(sessionUsers).length)
				}}/{{ state.exchangeCount }}.
			</span>
			<template v-if="!inTransition">
				<template v-if="userID === state.currentPlayer">
					<span>Your turn to exchange a card!</span>
					<span>
						<button @click="confirmExchange" class="blue" :disabled="!selectionIsValid">Confirm</button>
					</span>
				</template>
				<template v-else>
					<span>
						Waiting for
						{{
							state.currentPlayer in sessionUsers
								? sessionUsers[state.currentPlayer].userName
								: "(Disconnected)"
						}}...
					</span>
					<span></span>
				</template>
			</template>
			<template v-else>
				<span></span>
				<span></span>
			</template>
			<span></span>
			<span><scale-slider v-model.number="cardScale" /></span>
		</div>
		<div class="container">
			<transition name="revealed-cards" mode="out-in">
				<div class="housman-revealed-cards card-container" :key="`revealed-cards-${state.roundNum}`">
					<div class="zone-name">Common Cards</div>
					<div v-for="(card, index) in state.revealedCards" class="revealed-card-container">
						<transition
							:name="isCurrentPlayer ? 'current-player-revealed-card' : 'revealed-card'"
							mode="out-in"
						>
							<card
								:key="card.uniqueID"
								:card="card"
								:language="language"
								:class="{ selected: selectedRevealedCard === index }"
								@click="selectRevealedCard(index)"
							></card>
						</transition>
					</div>
				</div>
			</transition>
		</div>
		<div class="container">
			<transition name="hand-cards" mode="out-in">
				<div class="housman-hand card-container" :key="`hand-cards-${state.roundNum}`">
					<div class="zone-name">Your Hand</div>
					<div v-for="(card, index) in state.hand" class="hand-card-container">
						<transition name="hand-card" mode="out-in">
							<card
								:key="card.uniqueID"
								:card="card"
								:language="language"
								:class="{ selected: selectedHandCard === index }"
								@click="selectHandCard(index)"
							></card>
						</transition>
					</div>
				</div>
			</transition>
		</div>
	</div>
</template>

<script setup lang="ts">
import { UserID } from "@/IDTypes";
import { UserData } from "@/Session/SessionTypes";
import { HousmanDraftSyncData } from "@/HousmanDraft";
import { Language } from "../../../src/Types";
import Card from "./Card.vue";
import ScaleSlider from "./ScaleSlider.vue";
import { computed, onMounted, onUnmounted, ref } from "vue";
import { Socket } from "socket.io-client";
import { ClientToServerEvents, ServerToClientEvents } from "@/SocketType";
import { Alert } from "../alerts";
import { UniqueCard } from "@/CardTypes";

const props = defineProps<{
	userID: UserID;
	socket: Socket<ServerToClientEvents, ClientToServerEvents>;
	language: Language;
	sessionUsers: { [uid: UserID]: UserData };
	state: HousmanDraftSyncData;
}>();

const selectedRevealedCard = ref(null as number | null);
const selectedHandCard = ref(null as number | null);
const inTransition = ref(false);
const cardScale = ref(1.0);

const emit = defineEmits<{
	(e: "update:state", state: HousmanDraftSyncData): void;
	(e: "addToDeck", cards: UniqueCard[]): void;
	(e: "end"): void;
}>();

const delayedStateUpdate = ref(null as ReturnType<typeof setTimeout> | null);
const clearDelayedStateUpdate = () => {
	if (delayedStateUpdate.value) {
		clearTimeout(delayedStateUpdate.value);
		delayedStateUpdate.value = null;
	}
};

onMounted(() => {
	props.socket.on("housmanDraftSync", (state) => {
		console.log("housmanDraftSync", state);
		clearDelayedStateUpdate();
		inTransition.value = true;
		delayedStateUpdate.value = setTimeout(() => {
			inTransition.value = false;
			emit("update:state", state);
		}, 2000);
	});
	props.socket.on("housmanDraftExchange", (index, card, currentPlayer, exchangeNum) => {
		console.log("housmanDraftExchange", index, card, currentPlayer, exchangeNum);
		props.state.revealedCards[index] = card;
		inTransition.value = true;
		// Let the animation run before updating current player
		clearDelayedStateUpdate();
		delayedStateUpdate.value = setTimeout(() => {
			inTransition.value = false;
			props.state.currentPlayer = currentPlayer;
			props.state.exchangeNum = exchangeNum;
		}, 1000);
	});
	props.socket.on("housmanDraftRoundEnd", (pickedCards) => {
		console.log("housmanDraftRoundEnd", pickedCards);
		emit("addToDeck", pickedCards);
	});
	props.socket.on("housmanDraftEnd", () => {
		console.log("housmanDraftEnd");
		emit("end");
	});
});

onUnmounted(() => {
	props.socket.off("housmanDraftEnd");
	props.socket.off("housmanDraftRoundEnd");
	props.socket.off("housmanDraftExchange");
	props.socket.off("housmanDraftSync");
});

const isCurrentPlayer = computed(() => props.userID === props.state.currentPlayer);

const selectRevealedCard = (index: number) => {
	if (!isCurrentPlayer.value) return;
	selectedRevealedCard.value = index;
};

const selectHandCard = (index: number) => {
	if (!isCurrentPlayer.value) return;
	selectedHandCard.value = index;
};

const confirmExchange = () => {
	if (!selectionIsValid.value) return;

	const selectedCard = props.state.revealedCards[selectedRevealedCard.value!];

	props.socket.emit("housmanDraftPick", selectedHandCard.value!, selectedRevealedCard.value!, (anwser) => {
		if (anwser.code !== 0 && anwser.error) Alert.fire(anwser.error);
		else {
			props.state.hand[selectedHandCard.value!] = selectedCard;
			selectedRevealedCard.value = null;
			selectedHandCard.value = null;
		}
	});
};

const selectionIsValid = computed(() => {
	return (
		selectedRevealedCard.value !== null &&
		selectedHandCard.value !== null &&
		selectedRevealedCard.value >= 0 &&
		selectedRevealedCard.value < props.state.revealedCards.length &&
		selectedHandCard.value >= 0 &&
		selectedHandCard.value < props.state.hand.length
	);
});
</script>

<style scoped>
.card {
	width: calc(200px * var(--card-scale));
	height: calc(282px * var(--card-scale));
}

.housman-draft-controls {
	display: grid;
	grid-template-columns: 1fr 1fr auto 1fr 1fr;
	margin: 0 2em;
	align-items: center;
	height: 2em;
}

.housman-revealed-cards,
.housman-hand {
	display: flex;
	flex-direction: row;
	flex-wrap: wrap;
	justify-content: center;
	gap: 8px;
	position: relative;
}

.zone-name {
	position: absolute;
	left: 0.2em;
	top: 50%;
	transform: translateY(-50%);
	font-size: 2em;
	writing-mode: sideways-lr;
	color: #666;
	text-align: center;
}

.revealed-card-container,
.hand-card-container {
	position: relative;
}

.hand-cards-enter-active,
.hand-cards-leave-active,
.revealed-cards-enter-active,
.revealed-cards-leave-active {
	will-change: transform, opacity;
	transition: all 0.5s ease;
}

.revealed-cards-leave-to {
	transform: scale(0);
	opacity: 0;
}

.revealed-cards-enter-from {
	transform: scale(0);
	opacity: 0;
}

.hand-cards-enter-from {
	transform: scale(0);
	opacity: 0;
}

.hand-cards-leave-to {
	transform: translateY(100%);
	opacity: 0;
}

.hand-card-enter-active,
.hand-card-leave-active,
.current-player-revealed-card-enter-active,
.current-player-revealed-card-leave-active,
.revealed-card-enter-active,
.revealed-card-leave-active {
	z-index: 1;
	will-change: transform, opacity;
	transition: all 0.5s ease-in;
}

.hand-card-enter-active,
.current-player-revealed-card-enter-active,
.revealed-card-enter-active {
	z-index: 1;
	will-change: transform, opacity;
	transition: all 0.5s ease-out;
}

.revealed-card-leave-to,
.revealed-card-enter-from,
.hand-card-enter-from,
.hand-card-leave-to {
	transform: translateY(-150px);
	opacity: 0;
}

.current-player-revealed-card-enter-from,
.current-player-revealed-card-leave-to {
	transform: translateY(150px);
	opacity: 0;
}
</style>

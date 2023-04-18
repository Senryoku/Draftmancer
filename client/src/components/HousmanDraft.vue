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
						<button @click="confirmExchange" class="blue housman-confirm" :disabled="!selectionIsValid">
							Confirm
						</button>
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
		<div class="container hand-and-last-exchanges">
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
			<div class="last-picks-container card-container">
				<span class="last-picks-title">Last Exchanges</span>
				<transition-group tag="div" name="vertical-queue" class="vertical-queue last-picks">
					<div
						v-for="p in state.lastPicks"
						class="vertical-queue-item pick-remainder"
						:key="`${p.round}-${p.exchange}`"
					>
						<div class="name">{{ sessionUsers[p.userID]?.userName ?? "(Disconnected)" }}</div>
						<div class="cards">
							<card v-for="c in p.cards" :card="c" :key="c.uniqueID"></card>
							<font-awesome-icon icon="fa-solid fa-sync" size="lg" class="swap-icon"></font-awesome-icon>
						</div>
					</div>
				</transition-group>
			</div>
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
	(e: "notifyTurn"): void;
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
		clearDelayedStateUpdate();
		inTransition.value = true;
		delayedStateUpdate.value = setTimeout(
			() => {
				inTransition.value = false;
				emit("update:state", state);
				if (state.currentPlayer === props.userID) emit("notifyTurn");
			},
			navigator.webdriver ? 10 : 2000
		);
	});
	props.socket.on("housmanDraftExchange", (index, card, currentPlayer, exchangeNum) => {
		props.state.lastPicks.unshift({
			userID: props.state.currentPlayer,
			round: props.state.roundNum,
			exchange: props.state.exchangeNum,
			cards: [props.state.revealedCards[index], card],
		});
		if (props.state.lastPicks.length > 2) props.state.lastPicks.pop();
		props.state.revealedCards[index] = card;
		inTransition.value = true;
		// Let the animation run before updating current player
		clearDelayedStateUpdate();
		delayedStateUpdate.value = setTimeout(
			() => {
				inTransition.value = false;
				props.state.currentPlayer = currentPlayer;
				props.state.exchangeNum = exchangeNum;
				if (props.state.currentPlayer === props.userID) emit("notifyTurn");
			},
			navigator.webdriver ? 10 : 1000
		);
	});
	props.socket.on("housmanDraftRoundEnd", (pickedCards) => {
		emit("addToDeck", pickedCards);
	});
	props.socket.on("housmanDraftEnd", () => {
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
	min-height: 2em;
}

.housman-draft-controls span:nth-child(3) {
	justify-self: center;
}

.housman-draft-controls span:nth-child(4),
.housman-draft-controls span:nth-child(5) {
	justify-self: end;
}

.housman-revealed-cards,
.housman-hand {
	display: flex;
	flex-direction: row;
	flex-wrap: wrap;
	justify-content: center;
	align-content: center;
	gap: 8px;
	position: relative;
	flex-grow: 1;
}

.zone-name {
	position: absolute;
	left: 0.2em;
	top: 50%;
	font-size: 2em;
	height: 100%;
	color: #666;
	text-align: center;
	font-variant-caps: small-caps;

	writing-mode: vertical-rl;
	transform: translateY(-50%) rotate(-180deg);
}

.revealed-card-container,
.hand-card-container {
	position: relative;
}

.hand-and-last-exchanges {
	display: flex;
	gap: 1em;
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

.last-picks-container {
	display: flex;
	flex-wrap: nowrap;
}

.last-picks {
	display: flex;
	align-items: center;
	flex-direction: column;
	justify-content: center;
	position: relative;
	gap: 0.4em;

	min-width: calc(2em + 2 * 200px * 0.45 * var(--card-scale));
}

.last-picks .card {
	width: calc(200px * 0.45 * var(--card-scale));
	height: calc(282px * 0.45 * var(--card-scale));
}

.last-picks-title {
	font-variant: small-caps;
	font-size: 1.5em;
	color: #666;
	text-align: center;
	font-variant-caps: small-caps;

	writing-mode: vertical-rl;
	transform: rotate(-180deg);
}

.pick-remainder {
	display: flex !important;
	align-items: center;
	gap: 0.2em;
}

.pick-remainder .name {
	text-align: center;

	max-height: calc(0.8 * 282px * 0.45 * var(--card-scale));
	width: 1.2em;
	overflow-y: hidden;
	overflow-x: hidden;

	writing-mode: vertical-rl;
	transform: rotate(-180deg);
}

.pick-remainder .cards {
	position: relative;
	display: flex;
	flex-wrap: nowrap;
	gap: 0.2em;
}

.swap-icon {
	position: absolute;
	top: 50%;
	left: 50%;
	transform: translate(-50%, -50%);
	filter: drop-shadow(0 0 1px black);
}

.vertical-queue-leave-to {
	z-index: inherit !important; /* Allow leaving picks to stay in front of the container background */
}

@media (max-width: 800px) {
	.hand-and-last-exchanges {
		flex-direction: column;
	}

	.last-picks {
		flex-direction: row !important;
	}
}
</style>

<style src="../css/vertical-queue.css" scoped />

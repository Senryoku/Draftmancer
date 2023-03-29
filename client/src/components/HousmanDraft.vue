<template>
	<div class="housman-draft">
		<div class="section-title">
			<h2>Housman Draft</h2>
			<div class="controls">
				<span>
					<template v-if="userID === state.currentPlayer">
						Your turn to exchange a card!
						<button @click="confirmExchange" :disabled="!selectionIsValid">Confirm</button>
					</template>
					<template v-else>
						Waiting for
						{{
							state.currentPlayer in sessionUsers
								? sessionUsers[state.currentPlayer].userName
								: "(Disconnected)"
						}}...
					</template>
					Round #{{ state.roundNum }}/{{ state.roundCount }}. There are {{ state.remainingCards }} cards left
					in the main stack.
				</span>
			</div>
		</div>
		<div class="container">
			<transition name="revealed-cards" mode="out-in">
				<div
					class="housman-revealed-cards"
					:key="state.revealedCards.length > 0 ? state.revealedCards[0].uniqueID : `revealed-cards`"
				>
					<template v-for="(card, index) in state.revealedCards">
						<transition name="card" mode="out-in">
							<div :key="index">
								<card
									:key="card.uniqueID"
									:card="card"
									:language="language"
									:class="{ selected: selectedRevealedCard === index }"
									@click="selectRevealedCard(index)"
								></card>
							</div>
						</transition>
					</template>
				</div>
			</transition>
		</div>
		<div class="container">
			<transition name="hand-cards" mode="out-in">
				<div class="housman-hand" :key="state.hand.length > 0 ? state.hand[0].uniqueID : `hand-cards`">
					<template v-for="(card, index) in state.hand">
						<transition name="card" mode="out-in">
							<div :key="index">
								<card
									:key="card.uniqueID"
									:card="card"
									:language="language"
									:class="{ selected: selectedHandCard === index }"
									@click="selectHandCard(index)"
								></card>
							</div>
						</transition>
					</template>
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
import { onMounted, onUnmounted, ref } from "vue";
import { Socket } from "socket.io-client";
import { ClientToServerEvents, ServerToClientEvents } from "@/SocketType";
import { Alert } from "../alerts";

const props = defineProps<{
	userID: UserID;
	socket: Socket<ServerToClientEvents, ClientToServerEvents>;
	language: Language;
	sessionUsers: { [uid: UserID]: UserData };
	state: HousmanDraftSyncData;
}>();

const selectedRevealedCard = ref(null as number | null);
const selectedHandCard = ref(null as number | null);

const emit = defineEmits<{
	(e: "update:state", state: HousmanDraftSyncData): void;
}>();

onMounted(() => {
	props.socket.on("housmanDraftSync", (state) => {
		console.log("housmanDraftSync", state);
		emit("update:state", state);
	});
	props.socket.on("housmanDraftExchange", (index, card, currentPlayer) => {
		console.log("housmanDraftExchange", index, card, currentPlayer);
		props.state.revealedCards[index] = card;
		props.state.currentPlayer = currentPlayer;
	});
	props.socket.on("housmanDraftRoundEnd", (data) => {
		console.log("housmanDraftRoundEnd", data);
	});
	props.socket.on("housmanDraftEnd", () => {
		console.log("housmanDraftEnd");
	});
});

onUnmounted(() => {
	props.socket.off("housmanDraftEnd");
	props.socket.off("housmanDraftRoundEnd");
	props.socket.off("housmanDraftExchange");
	props.socket.off("housmanDraftSync");
});

const selectRevealedCard = (index: number) => {
	if (props.userID !== props.state.currentPlayer) return;
	selectedRevealedCard.value = index;
};

const selectHandCard = (index: number) => {
	if (props.userID !== props.state.currentPlayer) return;
	selectedHandCard.value = index;
};

const confirmExchange = () => {
	if (!selectionIsValid) return;

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

const selectionIsValid = () => {
	return (
		selectedRevealedCard.value !== null &&
		selectedHandCard.value !== null &&
		selectedRevealedCard.value >= 0 &&
		selectedRevealedCard.value < props.state.revealedCards.length &&
		selectedHandCard.value >= 0 &&
		selectedHandCard.value < props.state.hand.length
	);
};
</script>

<style scoped>
.housman-revealed-cards,
.housman-hand {
	display: flex;
	flex-direction: row;
	flex-wrap: wrap;
	justify-content: space-around;
}

.revealed-cards-enter-active,
.revealed-cards-leave-active {
	transition: all 0.5s ease;
}

.card-enter-active,
.card-leave-active {
	transition: all 0.5s ease;
}

.revealed-cards-leave-to {
	transform: translateY(-300px);
	opacity: 0;
}

.revealed-cards-enter-from,
.card-enter-from {
	transform: translateY(300px);
	opacity: 0;
}

.card-leave-to {
	transform: translateY(-300px);
	opacity: 0;
}
</style>

<template>
	<div class="solomon-draft" :style="`--card-scale: ${cardScale}`">
		<div class="solomon-draft-controls">
			<template v-if="userID === state.currentPlayer">
				<span
					>Round #{{ state.roundNum + 1 }}/{{ state.roundCount }} - Your turn
					{{ state.step === "dividing" ? "to reorder piles!" : "to pick a pile!" }}</span
				>
				<span>
					<template v-if="!inTransition">
						<button v-if="state.step === 'dividing'" @click="confirmPiles" class="blue solomon-confirm">
							Confirm
						</button>
						<button
							v-if="state.step === 'picking'"
							:disabled="selectedPile === null"
							@click="pickPile(selectedPile!)"
							class="blue solomon-confirm"
						>
							Confirm
						</button>
					</template>
				</span>
			</template>
			<template v-else>
				<span>
					Round #{{ state.roundNum + 1 }}/{{ state.roundCount }} - Waiting for
					{{
						state.currentPlayer in sessionUsers
							? sessionUsers[state.currentPlayer].userName
							: "(Disconnected)"
					}}...
				</span>
				<span></span>
			</template>
			<span><scale-slider v-model.number="cardScale" /></span>
		</div>
		<transition name="solomon-piles" mode="out-in">
			<div class="container" :key="state.roundNum">
				<div
					class="solomon-pile card-container"
					v-for="(pile, idx) in state.piles"
					:key="`pile-${idx}`"
					:class="{ clickable: isCurrentPlayer && state.step === 'picking', selected: idx === selectedPile }"
					@dblclick="pickPile(idx as 0 | 1)"
					@click="selectPile(idx as 0 | 1)"
				>
					<div class="zone-name">Pile {{ idx + 1 }}</div>
					<template v-if="state.step === 'dividing' && isCurrentPlayer">
						<Sortable
							:key="`pile_${idx}_${pile.map((c) => c.uniqueID).join('-')}`"
							class="solomon-pile-inner sortable-pile"
							:list="pile"
							item-key="uniqueID"
							:options="{ group: 'solomon-piles', animation: 200 }"
							@add="addToPile($event, state.piles[(idx + 1) % 2], state.piles[idx])"
							@update="updatePile($event, pile)"
						>
							<template #item="{ element }">
								<card
									:key="element.uniqueID"
									:card="element"
									:language="language"
									@click="moveCard(element.uniqueID, idx as 0 | 1)"
								></card>
							</template>
						</Sortable>
					</template>
					<template v-else>
						<TransitionGroup tag="div" class="solomon-pile-inner" name="solomon-pile">
							<card v-for="card in pile" :key="card.uniqueID" :card="card" :language="language"></card>
						</TransitionGroup>
					</template>
				</div>
			</div>
		</transition>
		<div class="last-picks-container card-container">
			<span class="last-picks-title">Last Picks</span>
			<transition-group tag="div" name="vertical-queue" class="vertical-queue last-picks"></transition-group>
		</div>
	</div>
</template>

<script setup lang="ts">
import { UserID } from "@/IDTypes";
import { UserData } from "@/Session/SessionTypes";
import { SolomonDraftSyncData } from "@/SolomonDraft";
import { Language } from "../../../src/Types";
import Card from "./Card.vue";
import ScaleSlider from "./ScaleSlider.vue";
import { computed, onMounted, onUnmounted, ref } from "vue";
import { Socket } from "socket.io-client";
import { ClientToServerEvents, ServerToClientEvents } from "@/SocketType";
import { Alert } from "../alerts";
import { UniqueCard, UniqueCardID } from "@/CardTypes";
import { sortableUpdate } from "../helper";
import { Sortable } from "sortablejs-vue3";
import { SortableEvent } from "sortablejs";

const props = defineProps<{
	userID: UserID;
	socket: Socket<ServerToClientEvents, ClientToServerEvents>;
	language: Language;
	sessionUsers: { [uid: UserID]: UserData };
	state: SolomonDraftSyncData;
}>();

const selectedPile = ref(null as 0 | 1 | null);
const inTransition = ref(false);
const cardScale = ref(1.0);

const emit = defineEmits<{
	(e: "update:state", state: SolomonDraftSyncData): void;
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
	props.socket.on("solomonDraftState", (state) => {
		clearDelayedStateUpdate();
		inTransition.value = true;
		delayedStateUpdate.value = setTimeout(
			() => {
				inTransition.value = false;
				emit("update:state", state);
				if (state.currentPlayer === props.userID) emit("notifyTurn");
			},
			navigator.webdriver ? 1 : state.roundCount !== props.state.roundCount ? 2000 : 1
		);
	});
	props.socket.on("solomonDraftUpdatePiles", (piles) => {
		const cards = props.state.piles[0].concat(props.state.piles[1]);
		props.state.piles = [
			piles[0].map((uid) => cards.find((card) => card.uniqueID === uid)!),
			piles[1].map((uid) => cards.find((card) => card.uniqueID === uid)!),
		];
	});
	props.socket.on("solomonDraftPicked", (pileIdx) => {
		const playerIdx = props.state.currentPlayer === Object.values(props.sessionUsers)[0].userID ? 0 : 1;
		props.state.lastPicks.unshift({
			round: props.state.roundNum,
			picks: [
				props.state.piles[playerIdx === 0 ? pileIdx : (pileIdx + 1) % 2],
				props.state.piles[playerIdx === 1 ? pileIdx : (pileIdx + 1) % 2],
			],
		});
		if (props.state.lastPicks.length > 2) props.state.lastPicks.pop();
		emit("addToDeck", props.state.piles[isCurrentPlayer ? pileIdx : (pileIdx + 1) % 2]);
	});
	props.socket.on("solomonDraftEnd", () => {
		emit("end");
	});
});

onUnmounted(() => {
	props.socket.off("solomonDraftEnd");
	props.socket.off("solomonDraftPicked");
	props.socket.off("solomonDraftUpdatePiles");
	props.socket.off("solomonDraftState");
});

const isCurrentPlayer = computed(() => props.userID === props.state.currentPlayer);

const updatePile = (evt: SortableEvent, pile: UniqueCard[]) => {
	sortableUpdate(evt, pile);
	updatePiles();
};

const addToPile = (evt: SortableEvent, from: UniqueCard[], to: UniqueCard[]) => {
	evt.item.remove();
	const card = from.splice(evt.oldIndex!, 1)[0];
	to.splice(evt.newIndex!, 0, card);
	updatePiles();
};

const moveCard = (uid: UniqueCardID, from: 0 | 1) => {
	const cardIdx = props.state.piles[from].findIndex((card) => card.uniqueID === uid)!;
	const card = props.state.piles[from].splice(cardIdx, 1)[0];
	props.state.piles[(from + 1) % 2].push(card);
	updatePiles();
};

const removeFromPile = (evt: SortableEvent, pile: UniqueCard[]) => {};

const updatePiles = () => {
	const piles = props.state.piles.map((arr) => arr.map((card) => card.uniqueID));
	props.socket.emit("solomonDraftOrganize", piles as [UniqueCardID[], UniqueCardID[]], (anwser) => {
		if (anwser.code !== 0 && anwser.error) Alert.fire(anwser.error);
	});
};

const confirmPiles = () => {
	props.socket.emit("solomonDraftConfirmPiles", (anwser) => {
		if (anwser.code !== 0 && anwser.error) Alert.fire(anwser.error);
	});
};

const selectPile = (idx: 0 | 1) => {
	if (!isCurrentPlayer || props.state.step !== "picking") return;
	selectedPile.value = idx;
};

const pickPile = (idx: 0 | 1) => {
	if (!isCurrentPlayer || props.state.step !== "picking" || selectedPile.value === null) return;
	props.socket.emit("solomonDraftPick", idx, (anwser) => {
		if (anwser.code !== 0 && anwser.error) Alert.fire(anwser.error);
	});
	selectedPile.value = null;
};
</script>

<style scoped>
.card {
	width: calc(200px * var(--card-scale));
	height: calc(282px * var(--card-scale));
}

.solomon-draft-controls {
	display: grid;
	grid-template-columns: 1fr auto 1fr;
	margin: 0 2em;
	align-items: center;
	min-height: 2em;
}

.solomon-draft-controls span:nth-child(2) {
	justify-self: center;
}

.solomon-draft-controls span:nth-child(3) {
	justify-self: end;
}

.solomon-piles-enter-active,
.solomon-piles-leave-active {
	will-change: transform opacity;
	transition: all 0.25s ease;
}

.solomon-piles-enter-from,
.solomon-piles-leave-to {
	opacity: 0;
}

.solomon-pile {
	position: relative;
}

.sortable-pile .card {
	cursor: grab;
}

.solomon-pile-inner {
	position: relative;
	display: flex;
	flex-direction: row;
	flex-wrap: wrap;
	justify-content: center;
	align-content: center;
	align-items: center;
	gap: 8px;
	flex-grow: 1;
	min-height: 300px;
	width: 100%;
	height: 100%;
}

.solomon-pile-enter-active,
.solomon-pile-leave-active,
.solomon-pile-move {
	will-change: transform opacity;
	transition: all 0.25s ease;
}

.solomon-pile-leave-active {
	position: absolute;
}

.solomon-pile-enter-from,
.solomon-pile-leave-to {
	height: 0;
	width: 0;
	opacity: 0;
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
	user-select: none;

	writing-mode: vertical-rl;
	transform: translateY(-50%) rotate(-180deg);
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

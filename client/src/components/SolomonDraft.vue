<template>
	<div class="solomon-draft" :style="`--card-scale: ${cardScale}`">
		<div class="solomon-draft-controls">
			<template v-if="!inTransition">
				<template v-if="userID === state.currentPlayer">
					<div style="grid-area: info">
						Round #{{ state.roundNum + 1 }}/{{ state.roundCount }} - Your turn
						{{ state.step === "dividing" ? "to reorder piles!" : "to pick a pile!" }}
					</div>
					<div style="grid-area: confirm">
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
					</div>
				</template>
				<template v-else>
					<div style="grid-area: info">
						Round #{{ state.roundNum + 1 }}/{{ state.roundCount }} - Waiting for
						{{
							state.currentPlayer in sessionUsers
								? sessionUsers[state.currentPlayer].userName
								: "(Disconnected)"
						}}...
					</div>
					<div style="grid-area: confirm"></div>
				</template>
			</template>
			<template v-else>
				<div style="grid-area: info">Picked pile #{{ lastSelectedPile! + 1 }}!</div>
				<div style="grid-area: confirm"></div>
			</template>
			<div style="grid-area: settings">
				<scale-slider v-model.number="cardScale" />
				<VDropdown placement="left-start">
					<font-awesome-icon
						icon="fa-solid fa-clock-rotate-left"
						size="xl"
						class="clickable"
					></font-awesome-icon>
					<template #popper>
						<div class="last-picks-container">
							<div class="last-picks">
								<div v-if="state.lastPicks.length === 0">No picks yet.</div>
								<div v-for="round in state.lastPicks" :key="round.round">
									<h2>Round {{ round.round + 1 }}</h2>
									<div style="display: flex; gap: 1em">
										<div v-for="(p, idx) in round.picks" :key="idx">
											<div style="text-align: center">
												{{ sessionUsers[state.players[idx]]?.userName ?? "Disconnected" }}
											</div>
											<div class="card-column" style="width: 200px">
												<card
													v-for="card in p"
													:card="card"
													:language="language"
													:key="card.uniqueID"
												/>
											</div>
										</div>
									</div>
								</div>
							</div>
						</div>
					</template>
				</VDropdown>
			</div>
		</div>
		<transition
			name="solomon-piles"
			mode="out-in"
			@before-leave="inTransition = true"
			@after-leave="inTransition = false"
			@before-enter="inTransition = true"
			@after-enter="inTransition = false"
		>
			<div class="solomon-piles" :key="state.roundNum">
				<div
					class="solomon-pile card-container"
					v-for="(pile, idx) in state.piles"
					:key="`pile-${idx}`"
					:class="{
						clickable: isCurrentPlayer && state.step === 'picking',
						'selected-pile': idx === selectedPile,
						'last-selected-pile': idx === lastSelectedPile,
					}"
					@dblclick="pickPile(idx as 0 | 1)"
					@click="selectPile(idx as 0 | 1)"
				>
					<div class="zone-name">Pile {{ idx + 1 }}</div>
					<template v-if="state.step === 'dividing' && isCurrentPlayer">
						<Sortable
							:key="`pile_${idx}_${pile.map((c) => c.uniqueID).join('-')}`"
							class="solomon-pile-inner sortable-pile"
							:style="`grid-area: pile-${idx}`"
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
const lastSelectedPile = ref(null as 0 | 1 | null); // For animation purposes only
const inTransition = ref(false);
const cardScale = ref(1.0);

const emit = defineEmits<{
	(e: "update:state", state: SolomonDraftSyncData): void;
	(e: "notifyTurn"): void;
	(e: "addToDeck", cards: UniqueCard[]): void;
	(e: "end"): void;
}>();

onMounted(() => {
	props.socket.on("solomonDraftState", (state) => {
		emit("update:state", state);
		if (state.currentPlayer === props.userID) emit("notifyTurn");
	});
	props.socket.on("solomonDraftUpdatePiles", (piles) => {
		const cards = props.state.piles[0].concat(props.state.piles[1]);
		props.state.piles = [
			piles[0].map((uid) => cards.find((card) => card.uniqueID === uid)!),
			piles[1].map((uid) => cards.find((card) => card.uniqueID === uid)!),
		];
	});
	props.socket.on("solomonDraftPicked", (pileIdx) => {
		lastSelectedPile.value = pileIdx;
		const playerIdx = props.state.currentPlayer === Object.values(props.sessionUsers)[0].userID ? 0 : 1;
		props.state.lastPicks.unshift({
			round: props.state.roundNum,
			picks: [
				props.state.piles[playerIdx === 0 ? pileIdx : (pileIdx + 1) % 2],
				props.state.piles[playerIdx === 1 ? pileIdx : (pileIdx + 1) % 2],
			],
		});
		if (props.state.lastPicks.length > 2) props.state.lastPicks.pop();
		emit("addToDeck", props.state.piles[isCurrentPlayer.value ? pileIdx : (pileIdx + 1) % 2]);
	});
	props.socket.on("solomonDraftEnd", (immediate) => {
		// Delay for animation purposes
		const delay = immediate || navigator.webdriver ? 1 : 2000;
		if (!immediate) ++props.state.roundNum; // Triggers animation
		setTimeout(() => emit("end"), delay);
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
	if (inTransition.value || !isCurrentPlayer.value || props.state.step !== "picking") return;
	selectedPile.value = idx;
};

const pickPile = (idx: 0 | 1) => {
	if (inTransition.value || !isCurrentPlayer.value || props.state.step !== "picking" || selectedPile.value === null)
		return;
	props.socket.emit("solomonDraftPick", idx, (anwser) => {
		if (anwser.code !== 0 && anwser.error) Alert.fire(anwser.error);
	});
	selectedPile.value = null;
};
</script>

<style scoped>
.solomon-draft-controls {
	display: grid;
	grid-template-columns: 1fr auto 1fr;
	grid-template-areas: "info confirm settings";
	margin: 0 2em;
	align-items: center;
	min-height: 2em;
	grid-area: control;
}

@media (max-width: 800px) {
	.solomon-draft-controls {
		grid-template-columns: auto;
		grid-template-rows: 1fr 1fr;
		grid-template-areas: "info info" "confirm settings";
	}
}

#main-container .solomon-draft-controls button {
	margin: 0;
}

.solomon-draft-controls > *:nth-child(2) {
	justify-self: center;
}

.solomon-draft-controls > *:nth-child(3) {
	justify-self: end;
	display: flex;
	gap: 1em;
}

.solomon-draft {
	display: flex;
	flex-direction: column;
	gap: 0.5em;
}

.solomon-piles {
	grid-area: piles;
	display: flex;
	flex-direction: column;
	gap: 1em;
}

.solomon-piles .card {
	width: calc(200px * var(--card-scale));
	height: calc(282px * var(--card-scale));
}

.solomon-piles-enter-active,
.solomon-piles-leave-active {
	will-change: transform opacity;
}

.solomon-piles-enter-active,
.solomon-piles-enter-active .solomon-pile {
	transition: all 0.5s ease;
}

.solomon-piles-leave-active,
.solomon-piles-leave-active .solomon-pile {
	transition: all 2s ease;
}

.solomon-piles-enter-from {
	opacity: 0;
}

.solomon-piles-leave-active .solomon-pile {
	transition: all 2s cubic-bezier(0.7, 0, 1, 0.3);
}

.solomon-piles-leave-to .solomon-pile {
	opacity: 0;
}

.solomon-piles-leave-active .solomon-pile.last-selected-pile {
	animation: pile-selected 2s ease-in;
}

@keyframes pile-selected {
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

.solomon-pile {
	position: relative;
}

.sortable-pile .card {
	cursor: grab;
}

.solomon-pile.selected-pile {
	box-shadow: 0 0 5px 1px white;
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
	max-height: 80vh;
	overflow-y: scroll;
	padding: 1em;
}
.last-picks {
	display: flex;
	flex-direction: column-reverse;
	align-items: center;
	justify-content: center;
	position: relative;
	gap: 0.4em;
}
.last-picks h2 {
	margin: 0.25em;
}
</style>

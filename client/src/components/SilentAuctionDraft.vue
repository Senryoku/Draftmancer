<template>
	<div class="silent-auction-draft" :style="`--card-scale: ${cardScale}`">
		<div>
			<button @click="nextRound()" class="confirm" v-if="results">Continue</button>
			<button @click="confirmBids()" class="confirm" v-else>Confirm Bids</button>
			<div v-for="player in state.players" :key="player.userID" class="player">
				<div class="player-name">{{ sessionUsers[player.userID].userName }}</div>
				<div>{{ player.funds }} points</div>
			</div>
		</div>
		<div v-if="state.currentPack" class="card-container pack">
			<div v-for="(card, idx) in state.currentPack" :key="card.uniqueID">
				<div class="card-display" :class="{ 'card-won': results && results[idx].winner === userID }">
					<div class="card-won-animation"></div>
					<Card :card="card" :language="language" :lazyLoad="false" />
					<div v-if="results" class="results">
						<div
							v-for="pidx in state.players.length"
							:key="pidx"
							:class="{ winner: state.players[pidx - 1].userID === results[idx].winner }"
						>
							{{ sessionUsers[state.players[pidx - 1].userID].userName }}:
							{{ results[idx].bids[pidx - 1] }}
						</div>
					</div>
					<div v-else>
						<input type="number" v-model="bids[idx]" min="0" :max="currentFunds" />
					</div>
				</div>
			</div>
		</div>
	</div>
</template>

<script setup lang="ts">
import { UserID } from "@/IDTypes";
import { UserData } from "@/Session/SessionTypes";
import type { SilentAuctionDraftSyncData, SilentAuctionDraftResults } from "@/SilentAuctionDraft";
import { Language } from "../../../src/Types";
import Card from "./Card.vue";
import ScaleSlider from "./ScaleSlider.vue";
import { computed, onMounted, onUnmounted, ref, watch } from "vue";
import { Socket } from "socket.io-client";
import { ClientToServerEvents, ServerToClientEvents } from "@/SocketType";
import { Alert } from "../alerts";
import { UniqueCard, UniqueCardID } from "@/CardTypes";

const props = defineProps<{
	userID: UserID;
	socket: Socket<ServerToClientEvents, ClientToServerEvents>;
	language: Language;
	sessionUsers: { [uid: UserID]: UserData };
	state: SilentAuctionDraftSyncData;
}>();

const inTransition = ref(false);
const cardScale = ref(1.0);
const bids = ref<number[]>(new Array(props.state.currentPack!.length).fill(0));
const results = ref<SilentAuctionDraftResults | null>(null);
const nextState = ref<SilentAuctionDraftSyncData | null>(null);

const emit = defineEmits<{
	(e: "update:state", state: SilentAuctionDraftSyncData): void;
	(e: "addToDeck", cards: UniqueCard[]): void;
	(e: "end"): void;
}>();

onMounted(() => {
	props.socket.on("silentAuctionDraftSync", (state) => {
		if (results.value) {
			nextState.value = state;
		} else setState(state);
	});
	props.socket.on("silentAuctionDraftResults", (r) => {
		results.value = r;
	});
	props.socket.on("silentAuctionDraftEnd", () => {
		// TODO: Display results of final round and a button to close them.
	});
});

onUnmounted(() => {
	props.socket.off("silentAuctionDraftEnd");
	props.socket.off("silentAuctionDraftSync");
});

const currentFunds = computed(() => {
	return props.state.players.find((p) => p.userID === props.userID)?.funds ?? 0;
});

function setState(state: SilentAuctionDraftSyncData) {
	emit("update:state", state);
	if (state.currentPack && bids.value.length !== state.currentPack.length)
		bids.value = new Array(state.currentPack.length).fill(0);
}

function confirmBids() {
	props.socket.emit("silentAuctionDraftBid", bids.value, (answer) => {
		if (answer.code !== 0 && answer.error) Alert.fire(answer.error);
	});
}

function nextRound() {
	if (nextState.value) {
		setState(nextState.value);
		nextState.value = null;
	}
	results.value = null;
}
</script>

<style scoped>
.pack {
	display: flex;
	flex-wrap: wrap;
	gap: 1em;

	& > div {
		flex-basis: 200px;
	}
}

.card-display {
	position: relative;
}

.card-won-animation {
	--size: 4em;

	pointer-events: none;

	position: absolute;
	top: calc(-1 * var(--size));
	left: calc(-1 * var(--size));
	right: calc(-1 * var(--size));
	bottom: calc(-1 * var(--size));

	mask-image: radial-gradient(ellipse 100% 100% at center, black 40%, transparent 50%);
	overflow: hidden;
	border-radius: 50%;

	display: flex;
	justify-content: center;
	align-items: center;

	&::after {
		content: "";
		z-index: -1;
		height: 100%;
		aspect-ratio: 1;
		background: repeating-conic-gradient(
			from 0deg,
			rgba(255, 255, 255, 0.4) 0deg 6deg,
			rgba(255, 255, 255, 0.05) 8deg 22deg,
			rgba(255, 255, 255, 0.4) 24deg
		);
		animation: rotate 10s linear infinite;
	}
}

@keyframes rotate {
	100% {
		transform: rotate(1turn);
	}
}

.results {
	position: absolute;
	top: 10%;
	bottom: 0;
	left: 0;
	right: 0;

	padding: 1em;

	background-color: #00000080;
}

.winner {
	/*TODO*/
	&::after {
		content: "🎉";
		position: absolute;
		top: 0;
		right: 0;
	}
}
</style>

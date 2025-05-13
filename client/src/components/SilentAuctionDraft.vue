<template>
	<div class="silent-auction-draft">
		<div class="header">
			<div class="players">
				<div
					v-for="player in state.players"
					:key="player.userID"
					class="player"
					:class="{ self: player.userID === userID }"
				>
					<div class="name">{{ sessionUsers[player.userID].userName }}</div>
					<div>
						{{ player.funds }}
						<div class="currency-icon" />
					</div>
					<div>
						<font-awesome-icon
							icon="fa-solid fa-check"
							class="green"
							v-if="player.bidCast"
						></font-awesome-icon>
						<font-awesome-icon icon="fa-solid fa-spinner" spin v-else></font-awesome-icon>
					</div>
				</div>
			</div>
			<div>
				<button @click="end()" v-if="ended">Close</button>
				<button @click="nextRound()" v-else-if="results">Next Pack</button>
				<div v-else-if="bidCast">Waiting for other players...</div>
				<button @click="confirmBids()" :disabled="!bidsAreValid" v-else>Confirm Bids</button>
			</div>
		</div>
		<div v-if="state.currentPack" class="card-container pack">
			<div v-for="(card, idx) in state.currentPack" :key="card.uniqueID" :style="`--nth: ${idx}`">
				<div class="card-display" :class="{ won: results && results[idx].winner === userID }">
					<div class="card-won-animation" v-if="results && results[idx].winner === userID"></div>
					<Card :card="card" :language="language" :lazyLoad="false" />
					<Transition name="fade">
						<div v-if="results" class="results">
							<div v-for="bid in results[idx].bids" :key="bid.userID" :class="{ winner: bid.won }">
								<div class="name">{{ sessionUsers[bid.userID].userName }}</div>
								<div class="bid">
									{{ bid.bid }}
									<div class="currency-icon" />
								</div>
							</div>
						</div>
						<div v-else class="bid-input">
							<input type="number" v-model="bids[idx]" min="0" :max="currentFunds" v-if="!bidCast" />
							<div v-else style="display: inline-block; margin: 0.25em">{{ bids[idx] }}</div>
							<div class="currency-icon" />
						</div>
					</Transition>
				</div>
			</div>
		</div>
	</div>
</template>

<script setup lang="ts">
import { UserID } from "@/IDTypes";
import { UserData } from "@/Session/SessionTypes";
import type { SilentAuctionDraftSyncData, SilentAuctionDraftResults } from "@/SilentAuctionDraft";
import { Language } from "@/Types";
import Card from "./Card.vue";
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
	state: SilentAuctionDraftSyncData;
}>();

const bids = ref<number[]>(new Array(props.state.currentPack!.length).fill(0));
const results = ref<SilentAuctionDraftResults | null>(null);
const nextState = ref<SilentAuctionDraftSyncData | null>(null);
const ended = ref(false);

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
	props.socket.on("silentAuctionDraftNotifyBid", (userID) => {
		const player = props.state.players.find((p) => p.userID === userID);
		if (player) player.bidCast = true;
	});
	props.socket.on("silentAuctionDraftResults", (r) => {
		results.value = r;
		bids.value = new Array(props.state.currentPack!.length).fill(0);
	});
	props.socket.on("silentAuctionDraftEnd", () => {
		ended.value = true;
		// If we have results to display, wait for the user to dismiss them. Otherwise end immediately.
		if (!results.value) end();
	});
});

onUnmounted(() => {
	props.socket.off("silentAuctionDraftEnd");
	props.socket.off("silentAuctionDraftResults");
	props.socket.off("silentAuctionDraftNotifyBid");
	props.socket.off("silentAuctionDraftSync");
});

const currentFunds = computed(() => {
	return props.state.players.find((p) => p.userID === props.userID)?.funds ?? 0;
});

const bidsAreValid = computed(() => {
	return (
		bids.value &&
		bids.value.length === props.state.currentPack!.length &&
		bids.value.every((bid) => bid >= 0 && bid <= currentFunds.value) &&
		bids.value.reduce((a, b) => a + b, 0) >= 0 &&
		bids.value.reduce((a, b) => a + b, 0) <= currentFunds.value
	);
});

const bidCast = computed(() => {
	return props.state.players.find((p) => p.userID === props.userID)?.bidCast;
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

function end() {
	emit("end");
}
</script>

<style scoped>
.header {
	display: flex;
	justify-content: space-between;
	align-items: center;
	gap: 1em;
	padding: 0.5em;
}

.players {
	display: flex;
	flex-wrap: wrap;
	gap: 0.2em 1em;
}

.player {
	display: flex;
	align-items: center;
	gap: 1em;

	background: #282828;
	border-radius: 5px;
	padding: 0.5em;

	.name {
		max-width: 10em;
		white-space: nowrap;
		text-overflow: ellipsis;
		overflow: hidden;
	}

	&.self {
		box-shadow: inset 0 0 5px 0px rgba(255, 255, 255, 0.3);
	}
}

.fade-enter-active {
	transition-delay: calc(0.05s * var(--nth));
}

.card-won-animation {
	--size: 10%;

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

	animation: calc(0.05s * var(--nth)) delayed;
	animation-fill-mode: forwards;
	visibility: hidden;

	&::after {
		content: "";
		z-index: -1;
		height: 100%;
		aspect-ratio: 1;
		background:
			radial-gradient(ellipse 100% 100% at center, rgba(255, 255, 255, 0.4) 0, transparent 45%),
			repeating-conic-gradient(
				from 0deg,
				rgba(255, 255, 255, 0.4) 0deg 6deg,
				rgba(255, 255, 255, 0) 8deg 22deg,
				rgba(255, 255, 255, 0.4) 24deg
			);
		animation: rotate 10s linear infinite;
	}
}

@keyframes delayed {
	99% {
		visibility: hidden;
	}
	100% {
		visibility: visible;
	}
}

@keyframes rotate {
	100% {
		transform: rotate(1turn);
	}
}
</style>

<style scoped src="../css/silentAuction.css" />

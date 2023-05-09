<template>
	<div class="draft-queue">
		<div class="upper-control">
			<a href="/"><font-awesome-icon icon="fa-solid fa-arrow-left"></font-awesome-icon> Back</a>
			<h1>Draftmancer / Draft Queue</h1>
			<div v-if="queueStatus">Playing: {{ queueStatus.playing }}</div>
			<div v-else><LoadingComponent /></div>
		</div>

		<p>Join a queue to be automatically paired with other players for a training draft:</p>
		<div class="sets-container">
			<div class="sets" :class="{ disabled: readyCheck !== null }">
				<TransitionGroup name="sets">
					<div
						v-for="set in availableQueues"
						:key="set.id"
						:class="{ clickable: !inQueue }"
						@click="if (!inQueue) register(set.id);"
						class="set-card"
						:style="{ backgroundImage: `url(${set.image})` }"
					>
						<template v-if="inQueue === set.id">
							<LoadingComponent size="3x" />
							<button class="stop" @click="unregister()">Cancel</button>
						</template>

						<div class="set-name">
							<h2>{{ set.name }}</h2>
						</div>

						<template v-if="queueStatus && set.id in queueStatus.queues">
							<div class="queue-waiting-count">
								{{ queueStatus.queues[set.id]!.inQueue }} / {{ set.playerCount }}
							</div>
							<div class="queue-player-count">
								{{ queueStatus.queues[set.id]!.playing }}
							</div>
						</template>
					</div>
				</TransitionGroup>
			</div>
			<div class="ready-check" v-if="readyCheck !== null">
				<div class="ready-check-inner">
					<div
						class="ready-check-timer"
						:key="readyCheck.timeout"
						:style="`--timer:${readyCheck.animDuration}ms;`"
					></div>
					<div style="text-align: center">
						{{ Math.floor(readyCheck.timeLeft / 1000 / 60) }}:{{
							Math.floor(readyCheck.timeLeft / 1000) < 10 ? "0" : ""
						}}{{ Math.floor(readyCheck.timeLeft / 1000) }}
					</div>
					<div class="ready-check-players">
						<div
							v-for="(p, idx) in readyCheck.players"
							:class="{ 'player-ready': p.status === ReadyState.Ready }"
						>
							<font-awesome-icon
								v-if="p.status === ReadyState.Ready"
								icon="fa-solid fa-check"
								class="green"
							></font-awesome-icon>
							<font-awesome-icon
								v-else-if="p.status === ReadyState.NotReady"
								icon="fa-solid fa-times"
								class="red"
							></font-awesome-icon>
							<font-awesome-icon v-else icon="fa-solid fa-spinner" spin></font-awesome-icon>
							Player {{ idx + 1 }}
						</div>
					</div>
					<div class="ready-check-question">
						<div v-if="readyCheck.anwser === ReadyState.Unknown">
							<button class="confirm ready-button" @click="setReadyState(ReadyState.Ready)">
								I am Ready!
							</button>
						</div>
						<div v-else>
							Waiting for others players...
							{{ readyCheck.players.filter((p) => p.status === ReadyState.Ready).length }}/{{
								readyCheck.players.length
							}}
						</div>
					</div>
				</div>
			</div>
		</div>
		<p>
			These draft queues are a convenient way to practice with the latest sets: There is no obligation to play the
			games afterwards. However, if you do want to challenge other players in your pod, a chat is available during
			and right after the draft!
		</p>
		<p>
			Want to organize your own customized drafts? Check out the
			<a href="/">full application</a>!
		</p>
	</div>
</template>

<script setup lang="ts">
import axios from "axios";
import { ref, computed, onMounted, onUnmounted } from "vue";
import { Socket } from "socket.io-client";
import { ClientToServerEvents, ServerToClientEvents } from "@/SocketType";
import { SetCode } from "@/Types";
import { Alert, fireToast } from "../alerts";
import { useEmitter } from "../appCommon";
import { QueueDescription, QueueID } from "@/draftQueue/QueueDescription";
import AvailableQueues from "../../../src/draftQueue/AvailableQueues";
import { ReadyState } from "../../../src/Session/SessionTypes";
import LoadingComponent from "./LoadingComponent.vue";
import { SweetAlertIcon } from "sweetalert2";
import { Sounds } from "../App.vue";

const Queues: (QueueDescription & { image: string })[] = [];
for (const q of AvailableQueues) Queues.push({ ...q, image: require(`../assets/img/queues/${q.id}.jpg`) });

const { emitter } = useEmitter();

const props = defineProps<{
	socket: Socket<ServerToClientEvents, ClientToServerEvents>;
}>();

const availableQueues = computed(() => Queues.filter((q) => !inQueue.value || q.id === inQueue.value));
const inQueue = ref(false as false | QueueID);
const queueStatus = ref(
	undefined as
		| undefined
		| { playing: number; queues: Record<QueueID, { set: string; inQueue: number; playing: number }> }
);
let queueStatusRequest = setTimeout(() => {
	requestQueueStatus();
}, 0);
let readyCheckCountdownInterval: NodeJS.Timeout;

const readyCheck = ref(
	null as null | {
		queue: QueueID;
		anwser: ReadyState;
		timeout: number;
		animDuration: number;
		timeLeft: number;
		players: { status: ReadyState }[];
	}
);

function requestQueueStatus() {
	console.log("requestQueueStatus");
	clearTimeout(queueStatusRequest);
	axios.get("/api/getDraftQueueStatus").then((res) => {
		if (res.status === 200) queueStatus.value = res.data;
		queueStatusRequest = setTimeout(() => {
			requestQueueStatus();
		}, 5000);
	});
}

function notify(type: SweetAlertIcon, title: string, text: string) {
	if (!document.hasFocus()) new Notification(title, { body: text });
	fireToast(type, title, text);
}

function onStartDraft() {
	console.log("DraftQueue startDraft");
	inQueue.value = false;
	readyCheck.value = null;
	clearTimeout(queueStatusRequest);
}

function onReadyCheck(queue: QueueID, timeout: number, players: { status: ReadyState }[]) {
	readyCheck.value = {
		queue,
		anwser: ReadyState.Unknown,
		timeout,
		animDuration: timeout - Date.now(),
		timeLeft: timeout - Date.now(),
		players,
	};
	clearInterval(readyCheckCountdownInterval);
	readyCheckCountdownInterval = setInterval(() => {
		if (readyCheck.value === null) {
			clearInterval(readyCheckCountdownInterval);
			return;
		}
		readyCheck.value.timeLeft = timeout - Date.now();
	}, 100);
	Sounds["readyCheck"].play();
	notify("info", "Your draft is about to start!", "Are you ready?");
}

function onReadyCheckCancel(queue: QueueID, backInQueue: boolean) {
	if (readyCheck.value === null || readyCheck.value.queue !== queue) return;
	if (backInQueue) {
		notify("error", "Draft canceled", "You are back in the queue.");
		inQueue.value = queue;
		readyCheck.value = null;
	} else {
		notify("error", "Draft canceled.", "You did not respond in time");
		inQueue.value = false;
		readyCheck.value = null;
	}
}

function onReadyCheckUpdate(queue: QueueID, players: { status: ReadyState }[]) {
	if (readyCheck.value === null || readyCheck.value.queue !== queue) return;

	if (
		players.filter((p) => p.status === ReadyState.Ready).length >
		readyCheck.value.players.filter((p) => p.status === ReadyState.Ready).length
	) {
		// Play sound?
	}
	readyCheck.value.players = players;
}

function setReadyState(status: ReadyState) {
	if (!readyCheck.value) return;
	readyCheck.value.anwser = status;
	props.socket.emit("draftQueueSetReadyState", readyCheck.value.anwser);
	if (readyCheck.value.anwser !== ReadyState.Ready) {
		inQueue.value = false;
		readyCheck.value = null;
	}
}

onMounted(() => {
	props.socket.on("draftQueueReadyCheckCancel", onReadyCheckCancel);
	props.socket.on("draftQueueReadyCheck", onReadyCheck);
	props.socket.on("draftQueueReadyCheckUpdate", onReadyCheckUpdate);
	props.socket.once("startDraft", onStartDraft);
	history.pushState({}, "", "/draftqueue");
});

onUnmounted(() => {
	props.socket.off("startDraft", onStartDraft);
	props.socket.off("draftQueueReadyCheckUpdate", onReadyCheckUpdate);
	props.socket.off("draftQueueReadyCheck", onReadyCheck);
	props.socket.off("draftQueueReadyCheckCancel", onReadyCheckCancel);

	clearTimeout(queueStatusRequest);
});

function register(setCode: SetCode) {
	emitter.emit("requestNotificationPermission");
	props.socket.emit("draftQueueRegister", setCode, (r) => {
		if (r.code !== 0 && r.error) Alert.fire(r.error);
		else {
			inQueue.value = setCode;
			if (queueStatus.value?.queues[setCode]) queueStatus.value!.queues[setCode].inQueue += 1;
			requestQueueStatus();
		}
	});
}
function unregister() {
	props.socket.emit("draftQueueUnregister", (r) => {
		if (r.code !== 0 && r.error) Alert.fire(r.error);
		else inQueue.value = false;
	});
	requestQueueStatus();
}
</script>

<style scoped>
.draft-queue {
	position: relative;
	margin-top: 0.5em;
}

.upper-control {
	display: flex;
	justify-content: space-between;
	align-items: center;
}

.upper-control h1 {
	margin: 0;
}

.sets-container {
	max-width: 100%;
	overflow-x: auto;
	position: relative;
}

.sets {
	display: flex;
	align-items: center;
	justify-content: center;
}
.set-card {
	box-sizing: border-box;
	flex: 0 1 300px;
	width: 300px;
	height: 400px;
	border-radius: 10px;
	display: flex;
	flex-direction: column;
	justify-content: center;
	align-items: center;
	position: relative;
	overflow: hidden;
	margin: 0.5em;
	gap: 1em;

	will-change: box-shadow, background-size;
	transition: all 0.5s ease;
	background-color: black;
	background-size: auto 100%;
	background-position: 50% 50%;
	background-repeat: no-repeat;
	box-shadow: 5px 5px 10px rgba(0, 0, 0, 0.8), inset 0 0 50px rgba(0, 0, 0, 1);
}

.set-card:hover {
	box-shadow: 5px 5px 10px rgba(0, 0, 0, 0.8), inset 0 0 50px rgba(0, 0, 0, 1);
	background-size: auto 110%;
	color: white;
}

.set-name {
	position: absolute;
	left: 0;
	right: 0;
	padding-left: 0.5rem;
	padding-right: 0.5rem;
	transition: all 0.5s ease;
	bottom: -10em;
	padding-top: 1em;
	background: linear-gradient(to bottom, rgba(0, 0, 0, 0) 0, rgba(0, 0, 0, 0.7) 25%);
	text-align: center;
}
.set-name h2 {
	margin: 0.5em;
}

.set-card:hover .set-name {
	bottom: 0;
}

.queue-waiting-count,
.queue-player-count {
	position: absolute;
	top: 1rem;
	font-size: 1.4em;
	background-color: rgba(0, 0, 0, 0.6);
	padding: 0.1em 0.4em;
	border-radius: 10px;
	box-shadow: 0 0 10px rgba(0, 0, 0, 0.6);
}

.queue-waiting-count {
	left: 1rem;
}

.queue-player-count {
	right: 1rem;
}

.sets-enter-active,
.sets-leave-active {
	will-change: all;
	transition: all 0.5s ease;
	max-width: 300px;
}

.sets-enter-from,
.sets-leave-to {
	opacity: 0;
	overflow: hidden;
	max-width: 0;
	margin: 0;
}

.ready-check {
	position: absolute;
	top: 0;
	left: 0;
	right: 0;
	bottom: 0;
	display: flex;
	flex-direction: column;
	align-items: center;
	justify-content: center;
}

.ready-check-inner {
	position: relative;
	padding: 0.5em;
	background-color: #222;
	border-radius: 0 0 0.5em 0.5em;
	display: flex;
	flex-direction: column;
	align-items: stretch;
	justify-content: center;
	gap: 1em;
	min-width: min(50vw, 500px);
	max-width: max(90vw, 500px);
	box-shadow: 0 0 10px rgba(0, 0, 0, 0.8);
}

.ready-check-timer {
	position: absolute;
	top: 0;
	left: 0;
	width: 100%;
	height: 4px;
	background-color: #518ae6;
	will-change: width;

	transform-origin: left;
	animation: timer var(--timer) linear forwards;
}

@keyframes timer {
	from {
		width: 100%;
	}

	to {
		width: 0;
	}
}

.ready-check-timer:after {
	content: "";
	position: absolute;
	top: -2px;
	right: -2px;
	width: 4px;
	height: 8px;
	border-radius: 2px/4px;
	background-color: #518ae6;
	box-shadow: 0 0 2px #518ae6;
	animation: timer-pulse 1s infinite;
}

@keyframes timer-pulse {
	0% {
		box-shadow: 0 0 0 0 rgba(81, 138, 230, 0.8);
	}

	70% {
		box-shadow: 0 0 0 6px rgba(81, 138, 230, 0);
	}

	100% {
		box-shadow: 0 0 0 0 rgba(81, 138, 230, 0);
	}
}

.ready-check-question {
	text-align: center;
	height: 2em;
}

.ready-check-players {
	display: grid;
	grid-template-columns: repeat(2, 1fr);
	gap: 0.5em;
}

.ready-check-players > div {
	padding: 0.5em;
	background-color: #444;
	transition: all 0.25s ease;
	border-radius: 2px;
}

.player-ready {
	background-image: linear-gradient(to left, #008029 0%, rgba(122, 196, 146, 0) 50%);
	box-shadow: 0 0 8px 4px #008029, inset 0 0 2px 2px #008029;
	animation: player-ready-pulse 0.5s ease-out forwards;
}

@keyframes player-ready-pulse {
	0% {
		box-shadow: 0 0 0 0 #008029;
	}

	15% {
		box-shadow: 0 0 16px 6px #01ac37;
	}

	30% {
		box-shadow: 0 0 4px 2px #01ac37, inset 0 0 4px 2px #008029;
	}

	100% {
		box-shadow: 0 0 8px 4px #008029, inset 0 0 2px 2px #008029;
	}
}
</style>

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
						:key="set.code"
						:class="{ clickable: !inQueue }"
						@click="if (!inQueue) register(set.code);"
						class="set-card"
						:style="{ backgroundImage: `url(${set.image})` }"
					>
						<template v-if="inQueue === set.code">
							<LoadingComponent size="3x" />
							<button class="stop" @click="unregister()">Cancel</button>
						</template>

						<div class="set-name">
							<h2>{{ set.name }}</h2>
						</div>

						<template v-if="queueStatus && set.code in queueStatus.queues">
							<div class="queue-waiting-count">{{ queueStatus.queues[set.code]!.inQueue }} / 8</div>
							<div class="queue-player-count">
								{{ queueStatus.queues[set.code]!.playing }}
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
							<button class="confirm" @click="setReadyState(ReadyState.Ready)">I am Ready!</button>
						</div>
						<div v-else>Waiting for others players...</div>
					</div>
				</div>
			</div>
		</div>
		<p>Want more options? Try the <a href="/">full application</a>!</p>
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
import { QueueID } from "@/draftQueue/DraftQueue";
import { ReadyState } from "../../../src/Session/SessionTypes";
import LoadingComponent from "./LoadingComponent.vue";
import { SweetAlertIcon } from "sweetalert2";

const Queues = [
	{ code: "mom", name: "March of the Machine", image: require("../assets/img/mom_sma_insta_1080x1920_en.jpg") },
	{
		code: "sir",
		name: "Shadows over Innistrad Remastered",
		image: require("../assets/img/sir_quickdraft.jpg"),
	},
	{ code: "one", name: "Phyrexia: All Will Be One", image: require("../assets/img/one_sma_insta_1080x1920_en.jpg") },
];

const { emitter } = useEmitter();

const props = defineProps<{
	socket: Socket<ServerToClientEvents, ClientToServerEvents>;
}>();

const availableQueues = computed(() => Queues.filter((q) => !inQueue.value || q.code === inQueue.value));
const inQueue = ref(false as false | SetCode);
const queueStatus = ref(
	undefined as
		| undefined
		| { playing: number; queues: Record<SetCode, { set: string; inQueue: number; playing: number }> }
);
let queueStatusRequest = setTimeout(() => {
	requestQueueStatus();
}, 0);

const readyCheck = ref(
	null as null | {
		queue: QueueID;
		anwser: ReadyState;
		timeout: number;
		animDuration: number;
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
	history.pushState({}, "", "/draftqueue");
}

function onReadyCheck(queue: QueueID, timeout: number, players: { status: ReadyState }[]) {
	readyCheck.value = { queue, anwser: ReadyState.Unknown, timeout, animDuration: timeout - Date.now(), players };
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
	background-size: 100% auto;
	background-position: 50% 50%;
	background-repeat: no-repeat;
	box-shadow: 5px 5px 10px rgba(0, 0, 0, 0.8), inset 0 0 50px rgba(0, 0, 0, 1);
}

.set-card:hover {
	box-shadow: 5px 5px 10px rgba(0, 0, 0, 0.8), inset 0 0 50px rgba(0, 0, 0, 1);
	background-size: 110% auto;
	color: white;
}

.set-name {
	position: absolute;
	left: 0;
	right: 0;
	padding-left: 0.5rem;
	padding-right: 0.5rem;
	transition: all 0.5s ease;
	bottom: -7em;
	padding-top: 1em;
	background: linear-gradient(to bottom, rgba(0, 0, 0, 0) 0, rgba(0, 0, 0, 0.7) 25%);
	text-align: center;
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
	align-items: center;
	justify-content: center;
	gap: 1em;
	min-width: 50vw;
}

.ready-check-timer {
	position: absolute;
	top: 0;
	left: 0;
	width: 100%;
	height: 4px;
	background-color: #3e2ca3;
	will-change: transform;

	animation: timer var(--timer) linear forwards;
}

@keyframes timer {
	from {
		transform: scaleX(1);
	}

	to {
		transform: scaleX(0);
	}
}

.ready-check-question {
	text-align: center;
}

.ready-check-players {
	display: flex;
	flex-direction: column;
	justify-items: stretch;
	gap: 0.5em;
}

.ready-check-players > div {
	padding: 0.5em;
	background-color: #444;
	transition: all 0.25s ease;
}

.player-ready {
	box-shadow: 0px 0px 10px 5px #008029, inset 0px 0px 5px 5px #008029;
}
</style>

<template>
	<div class="quick-draft">
		<div class="upper-control">
			<a href="/"><font-awesome-icon icon="fa-solid fa-arrow-left"></font-awesome-icon> Back</a>
			<h1>Draftmancer / Quick Draft</h1>
			<div v-if="queueStatus">Playing: {{ queueStatus.playing }}</div>
			<div v-else><LoadingComponent /></div>
		</div>

		<p>Join a queue to be automatically paired with other players for a training draft:</p>
		<div class="sets-container">
			<div class="sets">
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
						<div v-else><LoadingComponent /></div>
					</div>
				</TransitionGroup>
			</div>
		</div>
		<p>Want more options? Try the <a href="/">full application</a>!</p>
	</div>
</template>

<script setup lang="ts">
import { ref, computed } from "vue";
import { ClientToServerEvents, ServerToClientEvents } from "@/SocketType";
import { Socket } from "socket.io-client";
import { Alert } from "../alerts";
import { SetCode } from "@/Types";
import { onMounted } from "vue";
import { onUnmounted } from "vue";
import axios from "axios";
import LoadingComponent from "./LoadingComponent.vue";

const props = defineProps<{
	socket: Socket<ServerToClientEvents, ClientToServerEvents>;
}>();

const inQueue = ref(false as false | SetCode);
const queueStatus = ref(
	undefined as
		| undefined
		| { playing: number; queues: Record<SetCode, { set: string; inQueue: number; playing: number }> }
);
let queueStatusRequest = setTimeout(() => {
	requestQueueStatus();
}, 0);

const Queues = [
	{ code: "mom", name: "March of the Machine", image: require("../assets/img/mom_sma_insta_1080x1920_en.jpg") },
	{
		code: "sir",
		name: "Shadows over Innistrad Remastered",
		image: require("../assets/img/sir_quickdraft.jpg"),
	},
	{ code: "one", name: "Phyrexia: All Will Be One", image: require("../assets/img/one_sma_insta_1080x1920_en.jpg") },
];

const availableQueues = computed(() => Queues.filter((q) => !inQueue.value || q.code === inQueue.value));

function requestQueueStatus() {
	clearTimeout(queueStatusRequest);
	axios.get("/api/getQuickDraftStatus").then((res) => {
		if (res.status === 200) queueStatus.value = res.data;
		queueStatusRequest = setTimeout(() => {
			requestQueueStatus();
		}, 5000);
	});
}

function onStartDraft() {
	console.log("QuickDraft startDraft");
	inQueue.value = false;
	clearTimeout(queueStatusRequest);
}

onMounted(() => {
	props.socket.once("startDraft", onStartDraft);
});

onUnmounted(() => {
	props.socket.off("startDraft", onStartDraft);

	clearTimeout(queueStatusRequest);
});

function register(setCode: SetCode) {
	props.socket.emit("register", setCode, (r) => {
		if (r.code !== 0 && r.error) Alert.fire(r.error);
		else {
			inQueue.value = setCode;
			if (queueStatus.value?.queues[setCode]) queueStatus.value!.queues[setCode].inQueue += 1;
			requestQueueStatus();
		}
	});
}
function unregister() {
	props.socket.emit("unregister", (r) => {
		if (r.code !== 0 && r.error) Alert.fire(r.error);
		else inQueue.value = false;
	});
	requestQueueStatus();
}
</script>

<style scoped>
.quick-draft {
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
</style>

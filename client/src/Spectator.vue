<template>
	<div id="main-container">
		<a href="/"><font-awesome-icon icon="fa-solid fa-chevron-left" /> Go back to Draftmancer</a>
		<div class="main">
			<h1>Spectating</h1>
			<div v-if="draftLog">
				<DraftLogLiveComponent :draftlog="draftLog" :language="language" ref="draftloglive" />
			</div>
			<div v-else>
				<label>Session ID</label>
				<input type="text" v-model="sessionID" />
				<label>Password</label>
				<input type="password" v-model="password" />
				<button @click="join(sessionID, password)">Spectate</button>
			</div>
		</div>
	</div>
</template>

<script lang="ts" setup>
import { ref, onMounted, useTemplateRef } from "vue";
import DraftLogLiveComponent from "./components/DraftLogLive.vue";
import type { SessionID } from "@/IDTypes";
import type { DraftLog } from "@/DraftLog";
import { Language } from "@/Types";
import { ClientToServerEvents, ServerToClientEvents } from "@/SocketType.js";
import { io, Socket } from "socket.io-client";
import { DeckList } from "@/CardTypes.js";
import { fireToast } from "./alerts.js";

const language: Language = Language.en;
const sessionID = ref<SessionID>("");
const password = ref("");

const draftLog = ref<DraftLog | null>(null);

const socket = ref<Socket<ServerToClientEvents, ClientToServerEvents> | null>(null);

const draftLogLiveComponentRef = useTemplateRef("draftloglive");

onMounted(() => {
	console.log("Mounted");
});

function join(sessionID: SessionID, password: string) {
	const query: Record<string, string> = {
		sessionID: sessionID,
		password: password,
	};

	socket.value = io({
		transports: ["websocket", "polling"], // Immediately try websocket connection instead of polling first.
		query,
	});

	socket.value.on("connect_error", () => {
		// revert to classic upgrade
		socket.value!.io.opts.transports = ["polling", "websocket"];
	});

	socket.value.on("draftLogLive", (data) => {
		if (data.log) draftLog.value = data.log;

		if (!draftLog.value) return;

		if (data.pick) draftLog.value.users[data.userID!].picks.push(data.pick);
		if (data.decklist) {
			const decklist: Partial<DeckList> = data.decklist;
			if (!decklist.main) decklist.main = [];
			if (!decklist.side) decklist.side = [];
			draftLog.value.users[data.userID!].decklist = decklist as DeckList;
		}
	});

	socket.value.on("pickAlert", (data) => {
		fireToast(
			"info",
			`${data.userName} picked ${data.cards
				.map((s) => (s.printed_names[language] ? s.printed_names[language] : s.name))
				.join(", ")}!`
		);
		draftLogLiveComponentRef.value?.newPick(data);
	});
}
</script>

<style src="./css/style.css"></style>
<style src="./css/app.css"></style>
<style src="./css/tooltip.css"></style>

<style></style>

<template>
	<TimedSidePopup :timer="30" @timeout="emit('choose', undefined)" ref="popup">
		<h1>Choose a player</h1>
		<div style="margin-left: 1em; margin-right: 1em">{{ reason }}</div>
		<div style="display: flex; flex-direction: column; justify-content: center; gap: 0.5em">
			<div v-for="uid in users" :key="uid" @click="choose(uid)" class="choice">
				{{ sessionUsers.find((u) => u.userID === uid)?.userName ?? uid }}
			</div>
		</div>
	</TimedSidePopup>
</template>

<script setup lang="ts">
import { ref } from "vue";
import TimedSidePopup from "./TimedSidePopup.vue";
import { UserData } from "@/Session/SessionTypes";
import { UserID } from "@/IDTypes";

const props = defineProps<{ sessionUsers: UserData[]; reason: string; users: UserID[] }>();
const emit = defineEmits<{ (e: "choose", uid: UserID | undefined): void }>();

const popup = ref<typeof TimedSidePopup | null>(null);

function choose(uid: UserID) {
	popup.value?.close(() => {
		emit("choose", uid);
	});
}
</script>

<style scoped>
h1 {
	margin: 0;
}
.choice {
	cursor: pointer;
	padding: 0.5em 1em;
	border-radius: 0.5em;
	background-color: #444;

	transition: all 0.1s ease-out;
}
.choice:hover {
	filter: drop-shadow(0 0 8px white);
	background-color: #555;
}
</style>

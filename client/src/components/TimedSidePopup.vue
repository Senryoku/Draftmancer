<template>
	<div class="side-popup" :class="{ closing: closing }">
		<div class="line-timer" key="timeout-10" :style="`--timer:${timer}s;`"></div>
		<slot></slot>
	</div>
</template>

<script setup lang="ts">
import { ref } from "vue";
import { onMounted } from "vue";

const props = defineProps<{ timer: number }>();
const emit = defineEmits<{ (e: "timeout"): void }>();

const closing = ref(false);
const timeout = ref(undefined as ReturnType<typeof setTimeout> | undefined);

function close(callback?: () => void) {
	if (closing.value) return;
	closing.value = true;
	clearTimeout(timeout.value);
	if (callback) setTimeout(callback, 200);
}

defineExpose({ close });

onMounted(() => {
	timeout.value = setTimeout(() => {
		close(() => {
			emit("timeout");
		});
	}, 1000 * props.timer);
});
</script>

<style scoped>
.side-popup {
	position: fixed;
	right: 0;
	top: 50%;
	transform: translateY(-50%);
	z-index: 10;
	min-width: 300px;
	max-width: min(50vw, 400px);
	max-height: 90vh;
	overflow-y: auto;

	display: flex;
	flex-direction: column;
	align-items: center;
	gap: 0.5em;

	background-color: #282828;
	border-radius: 0 0 0 50px;
	box-shadow: 0 0 12px 1px black, inset 0 0 8px #383838;
	padding: 0.75em;
	padding-right: 2em;
	text-align: center;

	animation-duration: 0.2s;
	animation-name: side-popup-enter;
}

@keyframes side-popup-enter {
	0% {
		opacity: 0;
		transform: translateX(100%) translateY(-50%);
	}
	100% {
		transform: translateY(-50%);
	}
}

.side-popup.closing {
	transition: all 0.2s ease-out;
	transform: translateX(100%) translateY(-50%);
}
</style>

<style src="../css/line-timer.css" />

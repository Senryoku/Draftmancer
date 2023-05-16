<template>
	<div class="ask-color" :class="{ closing: closing }">
		<div class="line-timer" key="timeout-10" :style="`--timer:${timer}s;`"></div>
		<h1>Choose a color</h1>
		<div style="margin-left: 1em; margin-right: 1em">For {{ userName }}'s '{{ card.name }}'</div>
		<div style="display: flex; flex-wrap: wrap; justify-content: center; gap: 0.5em">
			<img v-for="c in availableChoices" :key="c" @click="select(c)" class="choice" :src="`img/mana/${c}.svg`" />
		</div>
		<CardComponent :card="card">
			<div v-if="(card.state?.colors?.length ?? 0) > 0" style="position: absolute; left: -2em; top: 1em">
				<div style="display: flex; flex-direction: column; gap: 0.5em">
					<img v-for="c in card.state!.colors" :key="c" class="mana-icon" :src="`img/mana/${c}.svg`" />
				</div>
			</div>
		</CardComponent>
	</div>
</template>

<script setup lang="ts">
import { UniqueCard } from "@/CardTypes";
import { CardColor } from "../../../src/CardTypes";
import CardComponent from "./Card.vue";
import { ref, computed } from "vue";
import { onMounted } from "vue";

const props = defineProps<{ userName: string; card: UniqueCard; timer: number }>();
const emit = defineEmits<{ (e: "selectColor", color: CardColor | undefined): void }>();

const closing = ref(false);

const availableChoices = computed(() => {
	return (["W", "U", "B", "R", "G"] as CardColor[]).filter((c) => !props.card.state?.colors?.includes(c));
});

let timeout = ref(undefined as ReturnType<typeof setTimeout> | undefined);

function select(c: CardColor | undefined) {
	if (closing.value) return;
	closing.value = true;
	clearTimeout(timeout.value);
	setTimeout(() => {
		emit("selectColor", c);
	}, 200);
}

onMounted(() => {
	timeout.value = setTimeout(() => {
		select(undefined);
	}, 1000 * props.timer);
});
</script>

<style scoped>
.ask-color {
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
	animation-name: ask-color-enter;
}

h1 {
	margin: 0;
}

@keyframes ask-color-enter {
	0% {
		opacity: 0;
		transform: translateX(100%) translateY(-50%);
	}
	100% {
		transform: translateY(-50%);
	}
}

.ask-color.closing {
	transition: all 0.2s ease-out;
	transform: translateX(100%) translateY(-50%);
}

.choice {
	width: 3.5em;
	cursor: pointer;
	padding: 0.5em;

	transition: all 0.1s ease-out;
}
.choice:hover {
	filter: drop-shadow(0 0 8px white);
}
</style>

<style src="../css/line-timer.css" />

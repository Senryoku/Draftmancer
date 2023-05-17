<template>
	<TimedSidePopup :timer="30" @timeout="emit('selectColor', undefined)" ref="popup">
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
	</TimedSidePopup>
</template>

<script setup lang="ts">
import { UniqueCard } from "@/CardTypes";
import { CardColor } from "../../../src/CardTypes";
import CardComponent from "./Card.vue";
import { ref, computed } from "vue";
import TimedSidePopup from "./TimedSidePopup.vue";

const props = defineProps<{ userName: string; card: UniqueCard }>();
const emit = defineEmits<{ (e: "selectColor", color: CardColor | undefined): void }>();

const availableChoices = computed(() => {
	return (["W", "U", "B", "R", "G"] as CardColor[]).filter((c) => !props.card.state?.colors?.includes(c));
});

const popup = ref<typeof TimedSidePopup | null>(null);

function select(c: CardColor | undefined) {
	popup.value?.close(() => {
		emit("selectColor", c);
	});
}
</script>

<style scoped>
h1 {
	margin: 0;
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

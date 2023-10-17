<template>
	<modal @close="close">
		<template v-slot:header>
			<h2 v-if="title">{{ title }}</h2>
			<h2 v-else>Sealed - Booster # {{ currentBooster + 1 }} / {{ boosters.length }}</h2>
		</template>
		<template v-slot:body>
			<transition-group
				tag="div"
				name="booster-open"
				class="booster"
				:duration="500 + 500 + 400 + Math.min(20, boosters[currentBooster].length) * 40"
				@enter="onEnterBoosterCards"
				appear
				:key="currentBooster"
			>
				<CardComponent
					v-for="card in boosters[currentBooster]"
					:key="card.uniqueID"
					:card="card"
					:lazyLoad="true"
					:renderCommonBackside="true"
				/>
			</transition-group>
		</template>
		<template v-slot:footer>
			<div class="actions">
				<button v-if="currentBooster < boosters.length - 1" class="confirm" @click="next">Next</button>
				<button v-else class="confirm" @click="close">Build!</button>
			</div>
		</template>
	</modal>
</template>

<script setup lang="ts">
import { ref } from "vue";
import Modal from "./Modal.vue";
import { UserID } from "@/IDTypes";
import { SetCode } from "../../../src/Types";
import { UniqueCard } from "@/CardTypes";
import CardComponent from "./Card.vue";
import { onEnterBoosterCards } from "../helper";

const props = defineProps<{
	title: string | undefined;
	boosters: UniqueCard[][];
}>();

const currentBooster = ref(0);

const emit = defineEmits<{
	(e: "close"): void;
	(e: "distribute", boostersPerPlayer: number, customBoosters: SetCode[], teams: UserID[][]): void;
}>();

// Methods
const next = () => {
	currentBooster.value = (currentBooster.value + 1) % props.boosters.length;
};
const close = () => {
	emit("close");
};
</script>

<style scoped>
.booster {
	display: flex;
	flex-wrap: wrap;
	justify-content: center;
}

.card {
	margin: 0.75em;
}
</style>

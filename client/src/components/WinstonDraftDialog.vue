<template>
	<modal @close="cancel">
		<template v-slot:header>
			<h2>Winston Draft</h2>
		</template>
		<template v-slot:body>
			<div class="dialog">
				<p>
					Winston Draft is a draft variant designed for two players, but extentable to more participants.<br />
					Players take turns choosing between 3 growing piles of cards, or drawing a random one.<br />
					<a href="https://mtg.gamepedia.com/Winston_Draft" target="_blank" rel="noopener nofollow">
						<font-awesome-icon icon="fa-solid fa-external-link-alt"></font-awesome-icon> More information
					</a>
				</p>
				<p>
					Customize the number of boosters in the main stack.<br />The default is 3 times the number of
					players. The game ends when all the cards of the main stack have been picked.
				</p>
				<div class="dialog-settings">
					<label for="booster-count-input">Boosters in the main stack</label>
					<div>
						<input
							id="booster-count-input"
							type="number"
							min="1"
							step="1"
							placeholder="Booster Count"
							class="small-number-input"
							v-model.number="boosterCount"
						/>
						<ResetButton v-model="boosterCount" :default-value="defaultBoosterCount" />
					</div>
				</div>
			</div>
		</template>
		<template v-slot:footer>
			<div class="actions">
				<button class="confirm" @click="start">Start Winston Draft</button>
				<button class="cancel" @click="cancel">Cancel</button>
			</div>
		</template>
	</modal>
</template>

<script setup lang="ts">
import { ref } from "vue";
import Modal from "./Modal.vue";
import ResetButton from "./ResetButton.vue";

const props = defineProps<{
	defaultBoosterCount: number;
}>();

const boosterCount = ref(props.defaultBoosterCount);

const emit = defineEmits<{
	(e: "close"): void;
	(e: "start", boostersPerPlayer: number): void;
}>();

const cancel = () => {
	emit("close");
};
const start = () => {
	emit("start", boosterCount.value);
	emit("close");
};
</script>

<style scoped src="../css/start-game-dialog.css" />

<style scoped>
.dialog {
	max-width: min(500px, 100vw);
}
</style>

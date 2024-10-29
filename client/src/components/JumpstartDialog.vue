<template>
	<modal @close="cancel">
		<template v-slot:header>
			<h2>Jumpstart</h2>
		</template>
		<template v-slot:body>
			<div class="dialog">
				<div>Select a set:</div>
				<div style="display: flex; flex-direction: column">
					<button @click="start('j25')">Foundations Jumpstart</button>
					<button @click="start('super')">Super Jump</button>
					<button @click="start('j22')">Jumpstart 2022</button>
					<button @click="start('j21')">Jumpstart: Historic Horizons</button>
					<button @click="start('jmp')">Jumpstart</button>
				</div>
			</div>
		</template>
		<template v-slot:footer>
			<div class="actions">
				<button class="cancel" @click="cancel">Cancel</button>
			</div>
		</template>
	</modal>
</template>

<script setup lang="ts">
import Modal from "./Modal.vue";

const emit = defineEmits<{
	(e: "close"): void;
	(e: "start", set: string): void;
}>();

const cancel = () => emit("close");
const start = (set: string) => {
	emit("start", set);
	emit("close");
};
</script>

<style scoped src="../css/start-game-dialog.css" />

<style scoped></style>

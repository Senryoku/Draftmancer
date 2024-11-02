<template>
	<modal @close="cancel">
		<template v-slot:header>
			<h2>Jumpstart</h2>
		</template>
		<template v-slot:body>
			<div class="dialog">
				<div>Choose a set:</div>
				<div class="set-list">
					<button @click="start('j25')">
						<img src="../../public/img/sets/j25.svg" class="set-icon" alt="J25" />
						<div>Foundations Jumpstart</div>
					</button>
					<button @click="start('super')"><div>Super Jump</div></button>
					<button @click="start('j22')">
						<img src="../../public/img/sets/j22.svg" class="set-icon" alt="J22" />
						<div>Jumpstart 2022</div>
					</button>
					<button @click="start('j21')">
						<img src="../../public/img/sets/j21.svg" class="set-icon" alt="J21" />
						<div>Jumpstart: Historic Horizons</div>
					</button>
					<button @click="start('jmp')">
						<img src="../../public/img/sets/jmp.svg" class="set-icon" alt="JMP" />
						<div>Jumpstart</div>
					</button>
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

<style scoped>
.set-list {
	display: flex;
	flex-direction: column;
}

.set-list button {
	height: 4em !important;
	line-height: 2em !important;
}

.set-list button div {
	margin: 0 4em;
}

.set-icon {
	--invertedness: 100%;
	float: left;
	height: 2em;
	transform: translateX(-50%);
	margin-left: 1em;
}
</style>

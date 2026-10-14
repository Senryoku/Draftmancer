<template>
	<span class="scale-slider">
		<font-awesome-icon
			icon="fa-solid fa-search-minus"
			class="clickable"
			@click="update(Math.max(modelValue - 0.1, min))"
		/>
		<input type="range" :min="min" :max="max" step="0.01" :value="modelValue" @input="handleEvent" />
		<font-awesome-icon
			icon="fa-solid fa-search-plus"
			class="clickable"
			@click="update(Math.min(modelValue + 0.1, max))"
		/>
		<font-awesome-icon icon="fa-solid fa-undo-alt" class="clickable reset-button" @click="update(1.0)" />
	</span>
</template>

<script setup lang="ts">
const props = withDefaults(
	defineProps<{
		modelValue: number;
		min?: number;
		max?: number;
	}>(),
	{
		min: 0.1,
		max: 2.0,
	}
);

const emit = defineEmits<{
	(e: "update:modelValue", value: number): void;
}>();

function handleEvent(e: Event) {
	emit("update:modelValue", parseFloat((e.target as HTMLInputElement).value));
}

function update(value: number) {
	emit("update:modelValue", value);
}
</script>

<style scoped>
.scale-slider {
	white-space: nowrap;
	display: flex;
	align-items: center;
}

input {
	vertical-align: bottom;
}

.reset-button {
	margin-left: 0.4em;
}
</style>

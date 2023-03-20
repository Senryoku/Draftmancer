<template>
	<span class="scale-slider">
		<font-awesome-icon
			icon="fa-solid fa-search-minus"
			class="clickable"
			@click="update(Math.max(modelValue - 0.1, min))"
		></font-awesome-icon>
		<input type="range" :min="min" :max="max" step="0.01" :value="modelValue" @input="handleEvent" />
		<font-awesome-icon
			icon="fa-solid fa-search-plus"
			class="clickable"
			@click="update(Math.min(modelValue + 0.1, max))"
		></font-awesome-icon>
		<font-awesome-icon
			icon="fa-solid fa-undo-alt"
			class="clickable reset-button"
			@click="update(1.0)"
		></font-awesome-icon>
	</span>
</template>

<script lang="ts">
import { defineComponent } from "vue";

export default defineComponent({
	props: {
		modelValue: { type: Number, required: true },
		min: { type: Number, default: 0.1 },
		max: { type: Number, default: 2.0 },
	},
	methods: {
		handleEvent(e: Event) {
			this.$emit("update:modelValue", (e.target as HTMLInputElement).value);
		},
		update(value: number) {
			this.$emit("update:modelValue", value);
		},
	},
});
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

<template>
	<span class="scale-slider">
		<i class="fas fa-search-minus clickable" @click="update(Math.max(modelValue - 0.1, min))"></i>
		<input type="range" :min="min" :max="max" step="0.01" :value="modelValue" @input="handleEvent" />
		<i class="fas fa-search-plus clickable" @click="update(Math.min(modelValue + 0.1, max))"></i>
		<i class="fas fa-undo-alt clickable reset-button" @click="update(1.0)"></i>
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
			this.$emit("input", (e.target as HTMLInputElement).value);
		},
		update(value: number) {
			this.$emit("input", value);
		},
	},
});
</script>

<style scoped>
.scale-slider {
	white-space: nowrap;
}

input {
	vertical-align: bottom;
}

.reset-button {
	margin-left: 0.4em;
}
</style>

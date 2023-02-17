<template>
	<div class="checkbox-button" :data-checked="checked ? 'true' : 'false'" @click="$emit('click')">
		<input :id="id" type="checkbox" :checked="checked" class="checkbox-button" @change="onChange" />
		<label :for="id">
			<slot></slot>
		</label>
	</div>
</template>

<script lang="ts">
import { defineComponent } from "vue";

export default defineComponent({
	name: "Toggle",
	model: {
		prop: "checked",
		event: "change",
	},
	props: {
		id: { type: String, required: true },
		checked: { type: Boolean, required: true },
	},
	methods: {
		onChange(event: Event) {
			this.$emit("change", (event.target as HTMLInputElement)?.checked);
		},
	},
});
</script>

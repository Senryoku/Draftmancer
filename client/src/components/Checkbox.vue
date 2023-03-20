<template>
	<span class="clickable" @click="$emit('toggle')">
		<font-awesome-icon :icon="`fa-solid ${value ? 'fa-check-square' : 'fa-square'}`"></font-awesome-icon>
		{{ label }}
	</span>
</template>

<script lang="ts">
import { defineComponent } from "vue";

export default defineComponent({
	props: {
		value: { type: Boolean, required: true },
		label: { type: String, required: false },
	},
});
</script>

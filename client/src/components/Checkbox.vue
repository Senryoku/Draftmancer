<template>
	<span class="clickable" @click="$emit('toggle')">
		<i
			class="fas"
			:class="{
				'fa-check-square': value,
				'fa-square': !value,
			}"
		></i>
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

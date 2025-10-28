<template>
	<span class="clickable" @click="$emit('toggle')">
		<font-awesome-icon :icon="`fa-solid ${value ? 'fa-check-square' : 'fa-square'}`" />
		{{ label }}
	</span>
</template>

<script setup lang="ts">
defineProps<{
	value: boolean;
	label?: string;
}>();
</script>

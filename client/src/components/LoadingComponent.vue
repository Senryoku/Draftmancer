<template>
	<div style="display: flex; justify-content: center; place-items: center">
		<font-awesome-icon icon="fa-solid fa-spinner" :size="size" spin></font-awesome-icon>
	</div>
</template>

<script setup lang="ts">
withDefaults(defineProps<{ size?: string }>(), { size: "1x" });
</script>

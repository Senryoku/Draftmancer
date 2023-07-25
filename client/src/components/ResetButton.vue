<template>
	<font-awesome-icon
		icon="fa-solid fa-undo-alt"
		class="clickable reset-button"
		@click="reset"
		v-tooltip.right="`Reset to default value (${defaultValue})`"
	></font-awesome-icon>
</template>

<script setup lang="ts" generic="T">
const props = defineProps<{ modelValue: T; defaultValue: T }>();

const emits = defineEmits<{ (e: "update:modelValue", value: T): void }>();

const reset = () => {
	emits("update:modelValue", props.defaultValue);
};
</script>

<style scoped>
.reset-button {
	padding: 0.4em;
	vertical-align: middle;
}
</style>

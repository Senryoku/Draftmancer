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

<script>
export default {
	props: {
		value: { type: Boolean, required: true },
		label: { type: String, required: false },
	},
};
</script>
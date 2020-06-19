<template>
	<div class="checkbox-button" :data-checked="checked ? 'true' : 'false'" @click="$emit('click')">
		<input
			:id="id"
			type="checkbox"
			:checked="checked"
			class="checkbox-button"
			@change="$emit('change', $event.target.checked)"
		/>
		<label :for="id">
			<slot></slot>
		</label>
	</div>
</template>

<script>
export default {
	name: "Toggle",
	model: {
		prop: "checked",
		event: "change",
	},
	props: {
		id: { type: String, required: true },
		checked: { type: Boolean, required: true },
	},
};
</script>

<template>
	<form @submit.prevent="update">
		<input
			@change="update"
			@input="modified"
			:value="modelValue"
			:id="id"
			:type="type"
			:placeholder="placeholder"
			:maxlength="maxlength"
			:min="min"
			:max="max"
			:step="step"
			ref="inputEl"
		/>
	</form>
</template>

<script setup lang="ts">
import { ref } from "vue";

// Input emiting a input event when unfocus, hiting return or optionally on a timeout (time without further change)
const props = withDefaults(
	defineProps<{
		modelValue: unknown;
		inputstyle?: string;
		delay?: number;
		validate?: (val: string) => string;
		waitOnEmpty?: boolean;

		id?: string;
		type: string;
		placeholder?: string;
		maxlength?: number;
		min?: number;
		max?: number;
		step?: number;
	}>(),
	{
		delay: 0,
		waitOnEmpty: true,
		type: "text",
	}
);

const timeout = ref<ReturnType<typeof setTimeout> | null>(null);
const inputEl = ref<HTMLInputElement | null>(null);

const emit = defineEmits<{
	(e: "update:modelValue", value: string): void;
}>();

const update = () => {
	if (!inputEl.value) return;

	if (props.validate) inputEl.value.value = props.validate(inputEl.value.value);

	emit("update:modelValue", inputEl.value.value);
	inputEl.value.classList.remove("dirty");
	inputEl.value.classList.add("updated");
	clearTimeout(timeout.value!);
};

const modified = () => {
	if (!inputEl.value) return;

	inputEl.value.classList.add("dirty");
	inputEl.value.classList.remove("updated");
	//                    Avoid automatically validating & propagating changes when the input is empty
	if (props.delay > 0 && !(props.waitOnEmpty && inputEl.value.value === "")) {
		clearTimeout(timeout.value!);
		timeout.value = setTimeout(() => {
			update();
		}, 1000 * props.delay);
	}
};
</script>

<style scoped>
form {
	display: inline-block;
	box-sizing: border-box;
}

input {
	width: 100%;
	box-sizing: border-box;
	--shadow-blur: 3px;
	--shadow-width: 1px;
}

.dirty {
	-webkit-box-shadow: 0px 0px var(--shadow-blur) var(--shadow-width) #c5b027;
	-moz-box-shadow: 0px 0px var(--shadow-blur) var(--shadow-width) #c5b027;
	box-shadow: 0px 0px var(--shadow-blur) var(--shadow-width) #c5b027;
}

.updated {
	animation: highlight 1.5s linear;
}

@keyframes highlight {
	0% {
		-webkit-box-shadow: 0px 0px var(--shadow-blur) var(--shadow-width) #00b309;
		-moz-box-shadow: 0px 0px var(--shadow-blur) var(--shadow-width) #00b309;
		box-shadow: 0px 0px var(--shadow-blur) var(--shadow-width) #00b309;
	}
	5% {
		-webkit-box-shadow: 0px 0px 8px var(--shadow-width) #00da0b;
		-moz-box-shadow: 0px 0px 8px var(--shadow-width) #00da0b;
		box-shadow: 0px 0px 8px var(--shadow-width) #00da0b;
	}
	10% {
		-webkit-box-shadow: 0px 0px var(--shadow-blur) var(--shadow-width) #00b309;
		-moz-box-shadow: 0px 0px var(--shadow-blur) var(--shadow-width) #00b309;
		box-shadow: 0px 0px var(--shadow-blur) var(--shadow-width) #00b309;
	}
	80% {
		-webkit-box-shadow: 0px 0px var(--shadow-blur) var(--shadow-width) #00b309;
		-moz-box-shadow: 0px 0px var(--shadow-blur) var(--shadow-width) #00b309;
		box-shadow: 0px 0px var(--shadow-blur) var(--shadow-width) #00b309;
	}
	100% {
		-webkit-box-shadow: 0;
		-moz-box-shadow: 0;
		box-shadow: 0;
	}
}
</style>

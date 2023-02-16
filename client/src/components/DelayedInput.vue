<template>
	<form @submit.prevent="update">
		<input
			@change="update"
			@input="modified"
			:value="value"
			:type="$attrs.type"
			:placeholder="$attrs.placeholder"
			:maxlength="$attrs.maxlength"
			:min="$attrs.min"
			:max="$attrs.max"
		/>
	</form>
</template>

<script lang="ts">
import { defineComponent, PropType } from "vue";

// Input emiting a input event when unfocus, hiting return or optionally on a timeout (time without further change)
export default defineComponent({
	props: {
		value: { type: Object as PropType<any>, required: true },
		inputstyle: { type: String },
		delay: { type: Number, default: 0 },
		validate: { type: Function as PropType<(val: string) => string> },
		waitOnEmpty: { type: Boolean, default: true },
	},
	data() {
		return {
			timeout: null,
			inputEl: null,
		} as { timeout: ReturnType<typeof setTimeout> | null; inputEl: HTMLInputElement | null };
	},
	mounted() {
		this.inputEl = this.$el.querySelector("input");
	},
	methods: {
		update() {
			if (!this.inputEl) return;

			if (this.validate) this.inputEl.value = this.validate(this.inputEl.value);

			this.$emit("input", this.inputEl.value);
			this.inputEl.classList.remove("dirty");
			this.inputEl.classList.add("updated");
			clearTimeout(this.timeout!);
		},
		modified() {
			if (!this.inputEl) return;

			this.inputEl.classList.add("dirty");
			this.inputEl.classList.remove("updated");
			//                    Avoid automatically validating & propagating changes when the input is empty
			if (this.delay > 0 && !(this.waitOnEmpty && this.inputEl.value === "")) {
				clearTimeout(this.timeout!);
				this.timeout = setTimeout(() => {
					this.update();
				}, 1000 * this.delay);
			}
		},
	},
});
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

<template>
	<form @submit.prevent="update">
		<input
			@change="update"
			@input="modified"
			:value="value"
			:type="$attrs.type"
			:placeholder="$attrs.placeholder"
			:maxlength="$attrs.maxlength"
		/>
	</form>
</template>

<script>
// Input emiting a input event when unfocus, hiting return or optionally on a timeout (time without further change)
export default {
	props: {
		value: { type: String, required: true },
		inputstyle: { type: String },
		delay: { type: Number, default: 0 },
	},
	data: function () {
		return {
			timeout: null,
			inputEl: null,
		};
	},
	mounted: function () {
		this.inputEl = this.$el.querySelector("input");
	},
	methods: {
		update: function (e) {
			this.$emit("input", this.inputEl.value);
			this.inputEl.classList.remove("dirty");
			this.inputEl.classList.add("updated");
			clearTimeout(this.timeout);
		},
		modified: function (e) {
			this.inputEl.classList.add("dirty");
			this.inputEl.classList.remove("updated");
			if (this.delay > 0) {
				clearTimeout(this.timeout);
				this.timeout = setTimeout(() => {
					this.update();
				}, 1000 * this.delay);
			}
		},
	},
};
</script>

<style scoped>
form {
	display: inline-block;
	box-sizing: border-box;
}

input {
	width: calc(100% - 0.25em);
	box-sizing: border-box;
}

.dirty {
	-webkit-box-shadow: 0px 0px 5px 0 #ffe645;
	-moz-box-shadow: 0px 0px 5px 0 #ffe645;
	box-shadow: 0px 0px 5px 0 #ffe645;
}

.updated {
	animation: highlight 1s ease-out;
}

@keyframes highlight {
	0% {
		-webkit-box-shadow: 0px 0px 5px 1px #00b309;
		-moz-box-shadow: 0px 0px 5px 1px #00b309;
		box-shadow: 0px 0px 5px 1px #00b309;
	}
	50% {
		-webkit-box-shadow: 0px 0px 5px 1px #00b309;
		-moz-box-shadow: 0px 0px 5px 1px #00b309;
		box-shadow: 0px 0px 5px 1px #00b309;
	}
	100% {
		-webkit-box-shadow: 0;
		-moz-box-shadow: 0;
		box-shadow: 0;
	}
}
</style>
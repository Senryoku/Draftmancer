<template>
	<transition name="modal">
		<div class="modal-mask" v-if="displayed">
			<div class="modal-wrapper" @click="close($event)">
				<div class="modal-container">
					<div class="modal-header">
						<slot name="header"></slot>
						<div class="modal-controls">
							<slot name="controls"></slot>
						</div>
						<font-awesome-icon
							@click="$emit('close')"
							class="modal-default-button clickable"
							icon="fa-solid fa-times"
							size="lg"
							aria-hidden="true"
						></font-awesome-icon>
					</div>

					<div class="modal-body">
						<slot name="body">Loading...</slot>
					</div>

					<div class="modal-footer">
						<slot name="footer"></slot>
					</div>
				</div>
			</div>
		</div>
	</transition>
</template>

<script lang="ts">
import { defineComponent } from "vue";

export default defineComponent({
	name: "Modal",
	props: { displayed: { type: Boolean, default: true } },
	methods: {
		close(e: Event) {
			if (e.target == e.currentTarget) this.$emit("close");
		},
		shortcuts(e: KeyboardEvent) {
			if (e.key === "Escape") this.$emit("close");
		},
	},
	mounted() {
		(document.activeElement as HTMLElement).blur();
		document.addEventListener("keydown", this.shortcuts);
	},
	beforeUnmount() {
		document.removeEventListener("keydown", this.shortcuts);
	},
});
</script>

<style scoped>
.modal-mask {
	position: fixed;
	z-index: 1020;
	top: 0;
	left: 0;
	width: 100%;
	height: 100%;
	background-color: rgba(0, 0, 0, 0.5);
	display: table;
	transition: opacity 0.3s ease;
}

.modal-wrapper {
	display: table-cell;
	vertical-align: middle;
	max-width: 100vw;
}

.modal-container {
	width: -webkit-fit-content;
	width: -moz-fit-content;
	width: fit-content;
	max-width: 95%;
	margin: 0 auto;
	padding: 1em;
	background-color: rgba(32, 32, 32, 1);
	border-radius: 1em;
	box-shadow: 0 2px 8px rgba(0, 0, 0, 0.33);
	transition: all 0.3s ease;
	display: flex;
	flex-direction: column;
	max-height: 90vh;
}

@media (orientation: portrait) and (max-width: 500px) {
	.modal-container {
		max-width: 100%;
		padding: 1em 0;
	}
}

.modal-header {
	position: relative;
	text-align: center;
	padding-right: 2em;
	flex-shrink: 0;
}

.modal-body {
	max-height: 85vh;
	overflow-y: scroll;
	will-change: transform;
	background-color: rgba(255, 255, 255, 0.1);
	padding: 0.5em;
	border-radius: 0.5em;
	flex-shrink: 1;
}

.modal-default-button {
	position: absolute;
	top: 0.2em;
	right: 0.2em;
}

.modal-controls {
	position: absolute;
	top: 0.2em;
	right: 3em;
}

.modal-enter-active,
.modal-leave-active {
	transition: all 0.2s ease;
}

.modal-footer {
	text-align: right;
	flex-shrink: 0;
}

.modal-enter-from {
	opacity: 0;
}

.modal-leave-active {
	opacity: 0;
}

.modal-enter-from .modal-container,
.modal-leave-active .modal-container {
	-webkit-transform: scale(1.1);
	transform: scale(1.1);
}
</style>

<style>
.modal-header h2 {
	margin-top: 0;
}

/* Overrides for buttons in footer */

.actions {
	display: flex;
	z-index: 1;
	box-sizing: border-box;
	flex-wrap: wrap;
	align-items: center;
	justify-content: center;
	width: 100%;
	margin: 1.25em auto 0;
	padding: 0;
}

/* We have to provide more specialized selectors than the default #main-container button */

.actions button,
#main-container .actions button {
	width: auto;
	height: auto;
	margin: 0.3125em;
	padding: 0.625em 1.1em;
	box-shadow: none;
	font-weight: 500;
	border: 0;
	border-radius: 0.25em;
	color: #fff;
	font-size: 1em;
	font-family: "MS Shell Dlg 2";
	text-transform: none;
	letter-spacing: initial;
}

.actions button.cancel,
#main-container .actions button.cancel {
	background-color: rgb(221, 51, 51);
}

.actions button:hover,
#main-container .actions button:hover {
	background-image: linear-gradient(rgba(0, 0, 0, 0.1), rgba(0, 0, 0, 0.1));
}
</style>

<template>
	<transition name="modal">
		<div class="modal-mask">
			<div class="modal-wrapper" @click="close($event)">
				<div class="modal-container">
					<div class="modal-header">
						<slot name="header"></slot>
						<i
							@click="$emit('close')"
							class="fa fa-times fa-lg modal-default-button clickable"
							aria-hidden="true"
						></i>
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

<script>
export default {
	name: "Modal",
	methods: {
		close: function(e) {
			if (e.target == e.currentTarget) this.$emit("close");
		},
		shortcuts: function(e) {
			if (e.which === 27)
				// Escape
				this.$emit("close");
		},
	},
	mounted: function() {
		document.addEventListener("keydown", this.shortcuts);
	},
	beforeDestroy: function() {
		document.removeEventListener("keydown", this.shortcuts);
	},
};
</script>

<style>
.modal-mask {
	position: fixed;
	z-index: 20;
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
}

.modal-container {
	width: -webkit-fit-content;
	width: -moz-fit-content;
	width: fit-content;
	max-width: 95%;
	margin: 0px auto;
	padding: 1em;
	background-color: rgba(32, 32, 32, 1);
	border-radius: 1em;
	box-shadow: 0 2px 8px rgba(0, 0, 0, 0.33);
	transition: all 0.3s ease;
}

.modal-header {
	position: relative;
	text-align: center;
}

.modal-header h2 {
	margin-top: 0;
}

.modal-body {
	max-height: 80vh;
	overflow-y: scroll;
	background-color: rgba(255, 255, 255, 0.1);
	padding: 0.5em;
	border-radius: 0.5em;
}

.modal-default-button {
	position: absolute;
	top: 0.2em;
	right: 0.2em;
}

.modal-footer {
	text-align: right;
}

/*
 * The following styles are auto-applied to elements with
 * transition="modal" when their visibility is toggled
 * by Vue.js.
 *
 * You can easily play with the modal transition by editing
 * these styles.
 */

.modal-enter {
	opacity: 0;
}

.modal-leave-active {
	opacity: 0;
}

.modal-enter .modal-container,
.modal-leave-active .modal-container {
	-webkit-transform: scale(1.1);
	transform: scale(1.1);
}
</style>

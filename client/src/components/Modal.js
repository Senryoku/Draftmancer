export default {
	name: "Modal",
	template: `
<transition name="modal">
	<div class="modal-mask">
		<div class="modal-wrapper" @click="close($event)">
			<div class="modal-container">

				<div class="modal-header">
					<slot name="header"></slot>
					<i @click="$emit('close')" class="fa fa-times fa-lg modal-default-button clickable" aria-hidden="true"></i>
				</div>

				<div class="modal-body">
					<slot name="body">
						Loading...
					</slot>
				</div>

				<div class="modal-footer">
					<slot name="footer"></slot>
				</div>
			</div>
		</div>
	</div>
</transition>
`,
	methods: {
		close: function (e) {
			if (e.target == e.currentTarget) this.$emit("close");
		},
		shortcuts: function (e) {
			if (e.which === 27)
				// Escape
				this.$emit("close");
		},
	},
	mounted: function () {
		document.addEventListener("keydown", this.shortcuts);
	},
	beforeDestroy: function () {
		document.removeEventListener("keydown", this.shortcuts);
	},
};

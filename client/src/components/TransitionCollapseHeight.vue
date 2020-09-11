<template>
	<transition
		enter-active-class="enter-active"
		leave-active-class="leave-active"
		@before-enter="beforeEnter"
		@enter="enter"
		@after-enter="afterEnter"
		@before-leave="beforeLeave"
		@leave="leave"
		@after-leave="afterLeave"
	>
		<slot />
	</transition>
</template>
<script>
export default {
	methods: {
		beforeEnter(element) {
			requestAnimationFrame(() => {
				if (!element.style.height) element.style.height = "0px";
				element.style.display = null;
			});
		},
		enter(element) {
			requestAnimationFrame(() => {
				requestAnimationFrame(() => {
					element.style.height = `${element.scrollHeight}px`;
				});
			});
		},
		afterEnter(element) {
			element.style.height = null;
		},
		beforeLeave(element) {
			requestAnimationFrame(() => {
				if (!element.style.height) {
					element.style.height = `${element.offsetHeight}px`;
				}
			});
		},
		leave(element) {
			requestAnimationFrame(() => {
				requestAnimationFrame(() => {
					element.style.height = "0px";
				});
			});
		},
		afterLeave(element) {
			element.style.height = null;
		},
	},
};
</script>

<style scoped>
.enter-active,
.leave-active {
	overflow: hidden;
	transition: height 0.5s linear;
}
</style>
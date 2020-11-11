<template>
	<span class="dropdown-container">
		<div class="handle"><slot name="handle"></slot></div>
		<div class="dropdown">
			<div class="content" ref="content">
				<slot name="dropdown"></slot>
			</div>
		</div>
	</span>
</template>

<script>
export default {};
</script>

<style scoped>
.dropdown-container {
	position: relative;
	display: inline-block;
	background-color: #444;
	border-radius: 8px 8px 0 0;
	box-shadow: 0 2px 4px 0 #444;
	min-width: 12em;

	--unrolled-height: 500px;
}

.handle {
	margin: 0.25em 0.5em;
	text-align: center;
}

.handle span {
	margin: 0 0.25em;
}

.dropdown {
	position: absolute;
	top: 100%;
	z-index: 1;
	background-color: #444;
	width: 100%;
	box-sizing: border-box;
	box-shadow: 0 8px 8px 1px rgba(0, 0, 0, 0.5);
	border-radius: 0 0 8px 8px;
	max-height: 0;
	overflow: hidden;
	transition: all 0.2s ease-in-out;
	text-align: center;
}

.dropdown-container:active .dropdown,
.dropdown-container:hover .dropdown {
	max-height: var(--unrolled-height);
	z-index: 1;
}

.content {
	margin: 0 0.5em 0.5em 0.5em;
	display: flex;
	flex-direction: column;
}
</style>
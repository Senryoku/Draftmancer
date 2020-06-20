<template functional>
	<div class="card-placeholder">
		<div class="card-name" v-if="name !== ''">{{ props.name }}</div>
	</div>
</template>

<script>
export default {
	name: "CardPlaceholder",
	props: { name: { type: String } },
};
</script>

<style>
.card-placeholder {
	width: 200px;
	height: 283.333px;
	border-radius: 5px;
	background: url("../assets/img/cardback.png");
	background-repeat: no-repeat;
	background-size: 100%;
}

.card-placeholder .card-name {
	height: 20px;
	width: calc(100% - 5px);
	padding-top: 5px;
	padding-left: 5px;
	background-color: rgba(0, 0, 0, 0.25);
	-webkit-user-select: none;
	-moz-user-select: none;
	-ms-user-select: none;
	user-select: none;
}
</style>

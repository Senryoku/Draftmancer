<template functional>
	<div class="card-placeholder">
		<div class="card-name" v-if="props.card.name">{{ props.card.name }}</div>
		<div class="card-type" v-if="props.card.type">{{ props.card.type }}</div>
		<div class="card-oracle" v-if="props.card.oracle_text">{{ props.card.oracle_text }}</div>
	</div>
</template>

<script>
export default {
	name: "CardPlaceholder",
	props: { card: { type: Object } },
};
</script>

<style>
.card-placeholder {
	position: relative;
	padding-top: 140%;
	border-radius: 5px;
	background: url("../assets/img/cardback.png");
	background-repeat: no-repeat;
	background-size: 100%;
}

.card-placeholder .card-name {
	position: absolute;
	top: 0;
	left: 0;
	right: 0;
	overflow: hidden;

	height: calc(0.7 * 13.5%);

	display: flex;
	justify-content: space-around;
	white-space: nowrap;
	align-items: center;
	padding: 0 0.25em;

	background-color: rgba(0, 0, 0, 0.25);

	-webkit-user-select: none;
	-moz-user-select: none;
	-ms-user-select: none;
	user-select: none;
}

.card-placeholder .card-type {
	position: absolute;
	top: 50%;
	left: 0;
	right: 0;
	overflow: hidden;

	padding: 0.25em 1em;
	transform: translateY(-100%);
	text-align: left;
	background-color: rgba(0, 0, 0, 0.25);
	-webkit-user-select: none;
	-moz-user-select: none;
	-ms-user-select: none;
	user-select: none;
}

.card-placeholder .card-oracle {
	position: absolute;
	top: calc(50% + 0.25em);
	left: 0;
	right: 0;
	bottom: 1%;
	overflow: hidden;

	padding: 0.25em 1em;
	white-space: pre-line;
	text-align: left;
	font-size: 0.8em;

	background-color: rgba(0, 0, 0, 0.25);

	-webkit-user-select: none;
	-moz-user-select: none;
	-ms-user-select: none;
	user-select: none;
}
</style>

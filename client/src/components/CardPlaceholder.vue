<template functional>
	<div class="card-placeholder">
		<div class="card-name" v-if="props.card && props.card.name">{{ props.card.name }}</div>
		<div class="card-type" v-if="props.card && (props.card.type || props.card.type_line)">
			{{ $options.typeLine(props.card) }}
		</div>
	</div>
</template>

<script>
export default {
	name: "CardPlaceholder",
	props: { card: { type: Object } },
	typeLine(card) {
		if (card.type_line) return card.type_line;
		return `${card.type}${card.subtypes?.length > 0 ? " — " : ""}${card.subtypes.join(" ")}`;
	},
};
</script>

<style>
.card-placeholder {
	position: relative;
	padding-top: 140%;
	border-radius: 5px;
	background: url("../assets/img/cardback.webp");
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
	top: 56.5%;
	left: 0;
	right: 0;
	height: 5.5%;
	overflow: hidden;

	padding: 0.25em 1em;
	text-align: left;
	font-size: 0.8em;
	background-color: rgba(0, 0, 0, 0.25);
	-webkit-user-select: none;
	-moz-user-select: none;
	-ms-user-select: none;
	user-select: none;
}
</style>

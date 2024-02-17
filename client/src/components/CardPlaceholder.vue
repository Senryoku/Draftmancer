<template>
	<div class="card-placeholder">
		<div class="card-name" v-if="card && card.name">{{ card.name }}</div>
		<div class="card-type" v-if="card && typeLine">
			{{ typeLine }}
		</div>
	</div>
</template>

<script setup lang="ts">
import { isScryfallCard, ScryfallCard, ScryfallCardFace, isScryfallCardFace } from "../vueCardCache";
import { computed } from "vue";
import { Card, CardFace } from "@/CardTypes";

const props = defineProps<{ card: Card | CardFace | ScryfallCard | ScryfallCardFace | undefined }>();

const typeLine = computed(() => {
	if (!props.card) return undefined;
	if (isScryfallCard(props.card) || isScryfallCardFace(props.card)) return props.card.type_line;
	return `${props.card.type}${props.card.subtypes?.length > 0 ? " — " : ""}${props.card.subtypes.join(" ")}`;
});
</script>

<style>
.card-placeholder {
	position: relative;
	padding-top: 140%;
	border-radius: 5px;
	background: var(--card-back-image, url("../assets/img/cardback.webp"));
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

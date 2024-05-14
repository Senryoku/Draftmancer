<template>
	<div class="card-placeholder">
		<CardText class="alt-card-text" v-if="card" :card="card!" />
	</div>
</template>

<script setup lang="ts">
import { ScryfallCard, ScryfallCardFace } from "../vueCardCache";
import CardText from "./CardText.vue";
import { Card, CardFace } from "@/CardTypes";

defineProps<{ card: Card | CardFace | ScryfallCard | ScryfallCardFace | undefined }>();
</script>

<style>
.card-placeholder {
	aspect-ratio: 100/140;
	position: relative;
	border-radius: 5px;
	background: var(--card-back-image, url("../assets/img/cardback.webp"));
	background-repeat: no-repeat;
	background-size: 100%;
}
</style>

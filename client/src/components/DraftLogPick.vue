<template>
	<div class="card-container" v-if="type === 'Draft' || type === 'Rochester Draft'">
		<BoosterCard
			v-for="(cid, index) in draftPick.booster"
			:key="index"
			:card="getUnique(cid)"
			:language="language"
			:class="{
				'selected-high': draftPick.pick.includes(index),
				burned: draftPick.burn && draftPick.burn.includes(index),
			}"
			:lazyLoad="true"
			:scale="scale"
		/>
	</div>
	<div class="card-container grid3x3" v-else-if="type === 'Grid Draft'">
		<template v-for="(cid, index) in gridDraftPick.booster">
			<CardComponent
				v-if="cid"
				:key="index + '_' + cid"
				:card="getUnique(cid)"
				:language="language"
				:class="{ 'selected-high': gridDraftPick.pick.includes(index) }"
				:lazyLoad="true"
			/>
			<font-awesome-icon
				v-else
				:key="index"
				icon="fa-solid fa-times-circle"
				size="4x"
				style="color: rgba(255, 255, 255, 0.1)"
			/>
		</template>
	</div>
	<div
		class="card-container winston-pick"
		v-else-if="type === 'Winston Draft' || type === 'Winchester Draft' || type === 'Solomon Draft'"
	>
		<div
			v-for="(cards, index) in winstonDraftPick.piles"
			:key="index"
			class="card-column"
			:class="{ selected: 'pickedPile' in winstonDraftPick && winstonDraftPick.pickedPile === index }"
		>
			<CardComponent
				v-for="(cid, cidx) in cards"
				:key="index + '_' + cidx"
				:card="getUnique(cid)"
				:language="language"
			/>
		</div>
		<div v-if="'randomCard' in winstonDraftPick">
			<h3>Drawn Card:</h3>
			<CardComponent :card="getUnique(winstonDraftPick.randomCard)" :language="language" />
		</div>
	</div>
	<div class="housman-pick" v-else-if="type === 'Housman Draft'">
		<h2 style="margin: 0">Revealed Cards</h2>
		<div class="card-container">
			<CardComponent
				v-for="(cid, cidx) in housmanDraftPick.revealedCards"
				:key="cidx + '_' + cid"
				:card="getUnique(cid)"
				:language="language"
				:class="{ 'selected-high': housmanDraftPick.picked === cidx }"
				:lazyLoad="true"
			/>
		</div>
		<h2 style="margin: 0">Hand</h2>
		<div class="card-container">
			<CardComponent
				v-for="(cid, cidx) in housmanDraftPick.hand"
				:key="cidx + '_' + cid"
				:card="getUnique(cid)"
				:language="language"
				:class="{ replaced: housmanDraftPick.replaced === cidx }"
				:lazyLoad="true"
			/>
		</div>
	</div>
	<div class="card-container" v-else>Not Implemented</div>
</template>

<script setup lang="ts">
import { computed } from "vue";
import { DraftPick, GridDraftPick, HousmanDraftPick, WinchesterDraftPick, WinstonDraftPick } from "@/DraftLog";
import { Card, CardID, UniqueCard } from "@/CardTypes";
import { Language } from "@/Types";

import CardComponent from "./Card.vue";
import BoosterCard from "./BoosterCard.vue";
import { toUnique } from "../../../src/CardTypes";

const props = withDefaults(
	defineProps<{
		pick: DraftPick | GridDraftPick | WinstonDraftPick | WinchesterDraftPick | HousmanDraftPick;
		carddata: { [cid: CardID]: Card };
		language: Language;
		type: string;
		scale: number;
	}>(),
	{
		type: "Draft",
		scale: 1,
	}
);

function getUnique(cid: CardID): UniqueCard {
	return toUnique(props.carddata[cid]);
}

const draftPick = computed(() => props.pick as DraftPick);
const gridDraftPick = computed(() => props.pick as GridDraftPick);
// And Winchester Draft, as WinchesterDraftPick is a subset of WinstonDraftPick
const winstonDraftPick = computed(() => props.pick as WinstonDraftPick);
const housmanDraftPick = computed(() => props.pick as HousmanDraftPick);
</script>

<style scoped>
.booster-card,
.grid3x3 .card,
.housman-pick .card {
	margin: 0.75em;
}

.grid3x3 {
	display: grid;
	align-items: center;
	justify-items: center;
	justify-content: center;
	grid-template-columns: 300px 300px 300px;
	grid-template-rows: 300px 300px 300px;
}

.winston-pick {
	display: flex;
	gap: 1em;
}
</style>

<style>
.replaced .card-image .front-image,
.replaced .card-image .back-image,
.replaced .card-placeholder {
	-webkit-box-shadow: 0px 0px 20px 4px rgb(200, 0, 0);
	-moz-box-shadow: 0px 0px 20px 4px rgba(200, 0, 0, 1);
	box-shadow: 0px 0px 20px 4px rgba(200, 0, 0, 1);
}
</style>

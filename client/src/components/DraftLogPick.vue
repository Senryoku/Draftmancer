<template>
	<div class="card-container" v-if="type === 'Draft' || type === 'Rochester Draft'">
		<booster-card
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
		></booster-card>
	</div>
	<div class="card-container grid3x3" v-else-if="type === 'Grid Draft'">
		<template v-for="(cid, index) in gridDraftPick.booster">
			<card
				v-if="cid"
				:key="index + '_' + cid"
				:card="getUnique(cid)"
				:language="language"
				:class="{ 'selected-high': gridDraftPick.pick.includes(index) }"
				:lazyLoad="true"
			></card>
			<font-awesome-icon
				v-else
				:key="index"
				icon="fa-solid fa-times-circle"
				size="4x"
				style="color: rgba(255, 255, 255, 0.1)"
			></font-awesome-icon>
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
			<card
				v-for="(cid, cidx) in cards"
				:key="index + '_' + cidx"
				:card="getUnique(cid)"
				:language="language"
			></card>
		</div>
		<div v-if="'randomCard' in winstonDraftPick">
			<h3>Drawn Card:</h3>
			<card :card="getUnique(winstonDraftPick.randomCard)" :language="language"></card>
		</div>
	</div>
	<div class="card-container" v-else>Not Implemented</div>
</template>

<script lang="ts">
import { DraftPick, GridDraftPick, WinchesterDraftPick, WinstonDraftPick } from "@/DraftLog";
import { Card, CardID, UniqueCard } from "@/CardTypes";
import { Language } from "@/Types";

import { PropType, defineComponent } from "vue";

import CardComponent from "./Card.vue";
import BoosterCard from "./BoosterCard.vue";
import { toUnique } from "../../../src/CardTypes";

export default defineComponent({
	name: "DraftLogPick",
	components: { Card: CardComponent, BoosterCard },
	props: {
		pick: {
			type: Object as PropType<DraftPick | GridDraftPick | WinstonDraftPick | WinchesterDraftPick>,
			required: true,
		},
		carddata: { type: Object as PropType<{ [cid: CardID]: Card }>, required: true },
		language: { type: String as PropType<Language>, required: true },
		type: { type: String, default: "Draft" },
		scale: { type: Number, default: 1 },
	},
	methods: {
		getUnique(cid: CardID): UniqueCard {
			if (typeof cid !== "string") return toUnique(cid); // FIXME: Backward compatility with previously unused WinstonDraftPick where cards were stored as full objects, should be removed at some point.
			return toUnique(this.carddata[cid]);
		},
	},
	computed: {
		draftPick() {
			return this.pick as DraftPick;
		},
		gridDraftPick() {
			return this.pick as GridDraftPick;
		},
		winstonDraftPick() {
			// And Winchester Draft, as WinchesterDraftPick is a subset of WinstonDraftPick
			return this.pick as WinstonDraftPick;
		},
	},
});
</script>

<style scoped>
.booster-card,
.grid3x3 .card {
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

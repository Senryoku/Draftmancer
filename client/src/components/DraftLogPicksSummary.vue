<template>
	<div class="packs" v-if="picks && picks.length > 0">
		<div v-for="(pack, idx) in picks" :key="idx">
			Pack #{{ idx + 1 }}
			<ol>
				<li
					v-for="(pick, pickIdx) in pack"
					:key="pickIdx"
					v-tooltip.left="{
						html: true,
						content: `<img src='${
							getPick(idx, pickIdx).image_uris[language] ?? getPick(idx, pickIdx).image_uris['en']
						}' style='max-height: 40vh; max-width: 40vw'/>`,
					}"
					@click="$emit('selectPick', idx, pickIdx)"
					class="clickable"
				>
					<span class="card-mana-cost" v-html="transformManaCost(getPick(idx, pickIdx).mana_cost)"></span>
					{{ getPick(idx, pickIdx).printed_names[language] ?? getPick(idx, pickIdx).name }}
				</li>
			</ol>
		</div>
	</div>
	<div v-else>No picks.</div>
</template>

<script lang="ts">
import { defineComponent, PropType } from "vue";
import { Card, CardID } from "@/CardTypes";
import { replaceManaSymbols } from "../ManaSymbols";

export default defineComponent({
	name: "DraftLogPicksSummary",
	props: {
		picks: { type: Array as PropType<{ pick: number[]; booster: CardID[] }[][]>, required: true },
		carddata: { type: Object as PropType<{ [cid: CardID]: Card }>, required: true },
		language: { type: String, required: true },
	},
	methods: {
		transformManaCost(str: string) {
			return replaceManaSymbols(str);
		},
		getPick(packIdx: number, pickIdx: number) {
			const p = this.picks[packIdx][pickIdx];
			return this.carddata[p.booster[p.pick[0]]];
		},
	},
});
</script>

<style scoped>
.packs {
	display: flex;
	align-items: center;
	justify-items: center;
	justify-content: space-around;
	gap: 1em;
}

.card-mana-cost {
	display: inline-block;
	min-width: 3em;
}

.card-mana-cost :deep(.mana-symbol) {
	display: inline-block;
	width: 1em;
	border-radius: 50%;
	box-shadow: -0.14vh 0.14vh 0 rgba(0, 0, 0, 0.85);
}
</style>

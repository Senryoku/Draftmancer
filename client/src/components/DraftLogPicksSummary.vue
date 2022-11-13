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
							carddata[pick.data.booster[pick.data.pick]].image_uris[language] ??
							carddata[pick.data.booster[pick.data.pick]].image_uris['en']
						}' style='max-height: 40vh; max-width: 40vw'/>`,
					}"
					@click="$emit('selectPick', idx, pickIdx)"
					class="clickable"
				>
					<span
						class="card-mana-cost"
						v-html="transformManaCost(carddata[pick.data.booster[pick.data.pick]].mana_cost)"
					></span>
					{{
						carddata[pick.data.booster[pick.data.pick]].printed_names[language] ??
						carddata[pick.data.booster[pick.data.pick]].name
					}}
				</li>
			</ol>
		</div>
	</div>
	<div v-else>No picks.</div>
</template>

<script>
import { replaceManaSymbols } from "../ManaSymbols.js";

export default {
	name: "DraftLogPicksSummary",
	components: {},
	props: {
		picks: { type: Array, required: true },
		carddata: { type: Object, required: true },
		language: { type: String, required: true },
	},
	methods: {
		transformManaCost(str) {
			return replaceManaSymbols(str);
		},
	},
};
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

<template>
	<div class="packs" v-if="picks && picks.length > 0">
		<div v-for="(pack, idx) in picks" :key="idx">
			Pack #{{ idx + 1 }}
			<ol>
				<li
					v-for="(pick, pickIdx) in pack"
					:key="pickIdx"
					@click="selectPick(idx, pickIdx)"
					class="pick clickable"
				>
					<div
						v-for="(card, cardIdx) in getPicks(idx, pickIdx)"
						:key="`${cardIdx}_${pickIdx}`"
						v-tooltip.left="{
							html: true,
							content: `<img src='${
								card.image_uris[language] ?? card.image_uris['en']
							}' style='max-height: 40vh; max-width: 40vw'/>`,
						}"
						@contextmenu="toggleZoom($event, card)"
						@mouseleave="mouseLeave"
					>
						<span class="card-mana-cost" v-html="replaceManaSymbols(card.mana_cost)"></span>
						{{ card.printed_names[language] ?? card.name }}
					</div>
				</li>
			</ol>
		</div>
	</div>
	<div v-else>No picks.</div>
</template>

<script setup lang="ts">
import { Card, CardID } from "@/CardTypes";
import { replaceManaSymbols } from "../ManaSymbols";
import { useEmitter } from "../appCommon";
const { emitter } = useEmitter();

const props = defineProps<{
	picks: { pick: number[]; booster: CardID[] }[][];
	carddata: { [cid: CardID]: Card };
	language: string;
}>();
const emit = defineEmits<{ (e: "selectPick", packIdx: number, pickIdx: number): void }>();

function selectPick(packIdx: number, pickIdx: number) {
	emitter.emit("closecardpopup");
	emit("selectPick", packIdx, pickIdx);
}
function getPicks(packIdx: number, pickIdx: number) {
	const pick = props.picks[packIdx][pickIdx];
	return pick.pick.map((card_idx) => props.carddata[pick.booster[card_idx]]);
}
function toggleZoom(e: Event, card: Card) {
	e.preventDefault();
	emitter.emit("togglecardpopup", e, card);
}
function mouseLeave(e: Event) {
	e.preventDefault();
	emitter.emit("closecardpopup");
}
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
	vertical-align: middle;
}

.card-mana-cost :deep(.mana-symbol) {
	display: inline-block;
	width: 1em;
	border-radius: 50%;
	box-shadow: -0.14vh 0.14vh 0 rgba(0, 0, 0, 0.85);
}
</style>

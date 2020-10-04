<template>
	<div>
		<div class="section-title">
			<h2>Mainboard ({{ list.main.length }})</h2>
			<div class="controls">
				Added basics:
				<span v-for="c in ['W', 'U', 'B', 'R', 'G'].filter((c) => list.lands[c] > 0)" :key="c">
					<img :src="`img/mana/${c}.svg`" class="mana-icon" style="vertical-align: text-bottom" />
					{{ list.lands[c] }}
				</span>
				<div>
					<button type="button" @click="exportDeck" v-tooltip="'Export deck and sideboard'">
						<i class="fas fa-clipboard-list"></i> Export Deck to MTGA
					</button>
					<button type="button" @click="exportDeck(false)" v-tooltip="'Export without set information'">
						<i class="fas fa-clipboard"></i> Export (Simple)
					</button>
				</div>
				<template v-if="list.hashes">
					<span>Cockatrice: {{ list.hashes.cockatrice }}</span>
					<span>MWS: {{ list.hashes.mws }}</span>
				</template>
			</div>
		</div>
		<card-pool :cards="mainboard" :language="language" :group="`deck-${_uid}`" :key="`deck-${_uid}`"></card-pool>
		<div class="section-title">
			<h2>Sideboard ({{ list.side.length }})</h2>
		</div>
		<card-pool :cards="sideboard" :language="language" :group="`side-${_uid}`" :key="`side-${_uid}`"></card-pool>
	</div>
</template>

<script>
import { copyToClipboard } from "../helper.js";
import exportToMTGA from "../exportToMTGA.js";
import { fireToast } from "../alerts.js";
import { genCard } from "../Cards.js";
import CardPool from "./CardPool.vue";
export default {
	components: { CardPool },
	props: {
		list: { type: Object, required: true },
		language: { type: String, required: true },
	},
	computed: {
		mainboard: function () {
			return this.list.main.map((cid) => genCard(cid));
		},
		sideboard: function () {
			return this.list.side.map((cid) => genCard(cid));
		},
	},
	methods: {
		exportDeck: function (full = true) {
			copyToClipboard(
				exportToMTGA(
					this.selectedLogDecklistMainboard,
					this.selectedLogDecklistSideboard,
					this.language,
					this.selectedLogDecklist.lands,
					full
				)
			);
			fireToast("success", "Deck exported to clipboard!");
		},
	},
};
</script>
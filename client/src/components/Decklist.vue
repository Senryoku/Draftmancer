<template>
	<div v-if="list && list.main && !hashesonly">
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
	<div class="message" v-else-if="list && list.hashes">
		<h2>{{ username }}'s Deck hashes</h2>
		<table class="hashes">
			<tr>
				<td>Cockatrice</td>
				<td>
					<code>{{ list.hashes.cockatrice }}</code>
				</td>
			</tr>
			<tr>
				<td>MWS</td>
				<td>
					<code>{{ list.hashes.mws }}</code>
				</td>
			</tr>
		</table>
	</div>
	<div class="message" v-else>{{ username }} did not submit their decklist.</div>
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
		list: { type: Object },
		username: { type: String, default: "Player" },
		language: { type: String, required: true },
		hashesonly: { type: Boolean, default: false },
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
			copyToClipboard(exportToMTGA(this.list.main, this.list.side, this.language, this.list.lands, full));
			fireToast("success", "Deck exported to clipboard!");
		},
	},
};
</script>

<style scoped>
.hashes {
	margin: auto;
}

.hashes td {
	padding: 0.5em;
}
</style>
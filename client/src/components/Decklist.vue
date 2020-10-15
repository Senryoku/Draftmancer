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
					<i
						class="fas fa-chart-pie fa-lg clickable"
						@click="displayStats = true"
						v-tooltip="'Deck Statistics'"
					></i>
					<button
						type="button"
						@click="exportDeck"
						v-tooltip="`Copy ${username}'s deck and sideboard, ready to be imported in MTGA.`"
					>
						<i class="fas fa-clipboard-list"></i> Export Deck to MTGA
					</button>
					<button
						type="button"
						@click="exportDeck(false)"
						v-tooltip="
							`Export ${username}'s deck and sideboard without set information, ready to be imported in MTGA or another program.`
						"
					>
						<i class="fas fa-clipboard"></i> Export Deck (Simple)
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
		<modal v-if="displayStats" @close="displayStats = false">
			<h2 slot="header">{{ username }}'s Deck Statistics</h2>
			<card-stats slot="body" :cards="mainboard" :addedbasics="landcount"></card-stats>
		</modal>
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
import Modal from "./Modal.vue";
import CardPool from "./CardPool.vue";

export default {
	components: {
		Modal,
		CardPool,
		CardStats: () => import("./CardStats.vue"),
	},
	props: {
		list: { type: Object },
		username: { type: String, default: "Player" },
		language: { type: String, required: true },
		hashesonly: { type: Boolean, default: false },
	},
	data: function () {
		return { displayStats: false };
	},
	computed: {
		mainboard: function () {
			return this.list.main.map((cid) => genCard(cid));
		},
		sideboard: function () {
			return this.list.side.map((cid) => genCard(cid));
		},
		landcount: function () {
			return Object.values(this.list.lands).reduce((acc, c) => acc + c);
		},
	},
	methods: {
		exportDeck: function (full = true) {
			copyToClipboard(exportToMTGA(this.mainboard, this.sideboard, this.language, this.list.lands, full));
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
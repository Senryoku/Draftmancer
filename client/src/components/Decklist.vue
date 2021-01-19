<template>
	<div v-if="list && list.main && !hashesonly">
		<card-pool :cards="mainboard" :language="language" :group="`deck-${_uid}`" :key="`deck-${_uid}`">
			<template v-slot:title>Mainboard ({{ list.main.length }})</template>
			<template v-slot:controls>
				<span>Added basics:</span>
				<span v-for="c in ['W', 'U', 'B', 'R', 'G'].filter((c) => list.lands[c] > 0)" :key="c">
					<img :src="`img/mana/${c}.svg`" class="mana-icon" style="vertical-align: text-bottom" />
					{{ list.lands[c] }}
				</span>
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
				<template v-if="list.hashes">
					<span @click="copyHash(list.hashes.cockatrice)" class="clickable"
						>Cockatrice: {{ list.hashes.cockatrice }}</span
					>
					<span @click="copyHash(list.hashes.cockatrice)" class="clickable">MWS: {{ list.hashes.mws }}</span>
				</template>
			</template>
		</card-pool>
		<card-pool :cards="sideboard" :language="language" :group="`side-${_uid}`" :key="`side-${_uid}`">
			<template v-slot:title>Sideboard ({{ list.side.length }})</template>
		</card-pool>
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
		carddata: { type: Object, required: true },
		language: { type: String, required: true },
		hashesonly: { type: Boolean, default: false },
	},
	data: function () {
		return { displayStats: false };
	},
	computed: {
		mainboard: function () {
			let uniqueID = 0;
			return this.list.main.map((cid) => Object.assign({ uniqueID: ++uniqueID }, this.carddata[cid]));
		},
		sideboard: function () {
			let uniqueID = 0;
			return this.list.side.map((cid) => Object.assign({ uniqueID: ++uniqueID }, this.carddata[cid]));
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
		copyHash: function (hash) {
			copyToClipboard(hash);
			fireToast("success", "Hash copied to clipboard!");
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
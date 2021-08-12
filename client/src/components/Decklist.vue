<template>
	<div v-if="list && list.main && !hashesonly">
		<card-pool
			:cards="mainboard"
			:language="language"
			:group="`deck-${_uid}`"
			:key="`deck-${_uid}`"
			ref="mainboardComponent"
		>
			<template v-slot:title><label>Deck ({{ list.main.length }})</label></template>
			<template v-slot:controls>
				<span v-tooltip="'Basic lands count and their distribution (Not shown in decklist below).'">
					<span v-if="landcount > 0">
						<label>
							<img
								src="../assets/img/Land_symbol.svg"
								style="height: 1em; vertical-align: text-bottom"
							/> Lands ({{ landcount }}):
						</label>
					</span>
					<span v-for="c in ['W', 'U', 'B', 'R', 'G'].filter(c => list.lands[c] > 0)" :key="c">
						<label>
							<img :src="`img/mana/${c}.svg`" class="mana-icon" style="vertical-align: text-bottom"/>
							{{ list.lands[c] }}
						</label>
					</span>
				</span>
				<i
					class="fas fa-chart-pie fa-lg clickable"
					@click="displayStats = true"
					v-tooltip="`${username}'s Deck Statistic`"
				></i>
				<button
					type="button"
					@click="exportDeck"
					v-tooltip="`Copy ${username}'s deck and sideboard, ready to be imported in MTGA.`"
				>
					<img class="set-icon" src="../assets/img/mtga-icon.png" /> Export Deck
				</button>
				<button
					type="button"
					@click="exportDeck(false)"
					v-tooltip="`Copy ${username}'s deck and sideboard without set information.`"
				>
					<i class="fas fa-list"></i> Export Deck (Simple)
				</button>
				<template v-if="list.hashes">
					<span
						@click="copyHash(list.hashes.cockatrice)"
						class="clickable"
						v-tooltip="'Copy Cockatrice hash to clipboard.'"
						>Cockatrice: {{ list.hashes.cockatrice }}</span
					>
					<span 
						@click="copyHash(list.hashes.mws)"
						class="clickable"
						v-tooltip="'Copy MWS hash to clipboard.'"
						>MWS: {{ list.hashes.mws }}</span
					>
				</template>
			</template>
		</card-pool>
		<card-pool
			:cards="sideboard"
			:language="language"
			:group="`side-${_uid}`"
			:key="`side-${_uid}`"
			ref="sideboardComponent"
		>
			<template v-slot:title><label>Sideboard ({{ list.side.length }})</label></template>
		</card-pool>
		<modal v-if="displayStats" @close="displayStats = false">
			<h2 slot="header">{{ username }}'s Deck Statistic</h2>
			<card-stats slot="body" :cards="mainboard" :addedbasics="landcount"></card-stats>
		</modal>
	</div>
	<div class="message" v-else-if="list && list.hashes">
		<h2>{{ username }}'s Deck Hashes</h2>
		<!-- TODO when is this displayed? When viewing player deck stats it's not shown. Why hash tooltips to the right here? -->
		<table class="hashes">
			<tr>
				<td>Cockatrice</td>
				<td
					@click="copyHash(list.hashes.cockatrice)"
					class="clickable"
					v-tooltip.right="'Copy Cockatrice hash to clipboard.'"
				>
					<code>{{ list.hashes.cockatrice }}</code>
				</td>
			</tr>
			<tr>
				<td>MWS</td>
				<td
					@click="copyHash(list.hashes.mws)"
					class="clickable"
					v-tooltip.right="'Copy MWS hash to clipboard.'"
				>
					<code>{{ list.hashes.mws }}</code>
				</td>
			</tr>
		</table>
	</div>
	<!-- TODO when is this displayed? -->
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
	data: function() {
		return { displayStats: false };
	},
	computed: {
		mainboard: function() {
			let uniqueID = 0;
			return this.list.main.map(cid => Object.assign({ uniqueID: ++uniqueID }, this.carddata[cid]));
		},
		sideboard: function() {
			let uniqueID = 0;
			return this.list.side.map(cid => Object.assign({ uniqueID: ++uniqueID }, this.carddata[cid]));
		},
		landcount: function() {
			return Object.values(this.list.lands).reduce((acc, c) => acc + c);
		},
	},
	methods: {
		exportDeck: function(full = true) {
			copyToClipboard(exportToMTGA(this.mainboard, this.sideboard, this.language, this.list.lands, full));
			fireToast("success", "Deck exported to clipboard!");
		},
		copyHash: function(hash) {
			copyToClipboard(hash);
			fireToast("success", "Hash copied to clipboard!");
		},
	},
	watch: {
		list: function() {
			this.$nextTick(() => {
				this.$refs.mainboardComponent.sync();
				this.$refs.sideboardComponent.sync();
			});
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

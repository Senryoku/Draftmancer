<template>
	<div v-if="list && list.main && !hashesonly" class="decklist">
		<card-pool
			:cards="mainboard"
			:language="language"
			:readOnly="true"
			:group="`deck-${_uid}`"
			:key="`deck-${_uid}`"
			ref="mainboardComponent"
		>
			<template v-slot:title>Mainboard ({{ list.main.length }})</template>
			<template v-slot:controls>
				<span v-if="landcount > 0">Added basics:</span>
				<span v-for="c in ['W', 'U', 'B', 'R', 'G'].filter((c) => list.lands?.[c] > 0)" :key="c">
					<img :src="`img/mana/${c}.svg`" class="mana-icon" style="vertical-align: text-bottom" />
					{{ list.lands[c] }}
				</span>
				<i
					class="fas fa-chart-pie fa-lg clickable"
					@click="displayStats = true"
					v-tooltip="'Deck Statistics'"
				></i>
				<ExportDropdown
					:language="language"
					:deck="mainboard"
					:sideboard="sideboard"
					:options="{
						lands: list.lands,
					}"
				/>
				<template v-if="list.hashes">
					<span
						@click="copyHash(list.hashes.cockatrice)"
						class="clickable"
						v-tooltip.top="'Copy hash to clipboard.'"
						>Cockatrice: {{ list.hashes.cockatrice }}</span
					>
					<span @click="copyHash(list.hashes.mws)" class="clickable" v-tooltip.top="'Copy hash to clipboard.'"
						>MWS: {{ list.hashes.mws }}</span
					>
				</template>
			</template>
		</card-pool>
		<card-pool
			v-if="sideboard && sideboard.length > 0"
			:cards="sideboard"
			:language="language"
			:readOnly="true"
			:group="`side-${_uid}`"
			:key="`side-${_uid}`"
			ref="sideboardComponent"
		>
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
				<td
					@click="copyHash(list.hashes.cockatrice)"
					class="clickable"
					v-tooltip.right="'Copy hash to clipboard.'"
				>
					<code>{{ list.hashes.cockatrice }}</code>
				</td>
			</tr>
			<tr>
				<td>MWS</td>
				<td @click="copyHash(list.hashes.mws)" class="clickable" v-tooltip.right="'Copy hash to clipboard.'">
					<code>{{ list.hashes.mws }}</code>
				</td>
			</tr>
		</table>
	</div>
	<div class="message" v-else>{{ username }} did not submit their decklist.</div>
</template>

<script>
import { copyToClipboard } from "../helper.js";
import { fireToast } from "../alerts.js";
import Modal from "./Modal.vue";
import ExportDropdown from "./ExportDropdown.vue";
import CardPool from "./CardPool.vue";

export default {
	components: {
		Modal,
		CardPool,
		CardStats: () => import("./CardStats.vue"),
		ExportDropdown,
	},
	props: {
		list: { type: Object },
		username: { type: String, default: "Player" },
		carddata: { type: Object, required: true },
		language: { type: String, required: true },
		hashesonly: { type: Boolean, default: false },
	},
	data() {
		return { displayStats: false };
	},
	computed: {
		mainboard() {
			if (!this.list.main) return [];
			let uniqueID = 0;
			return this.list?.main.map((cid) => Object.assign({ uniqueID: ++uniqueID }, this.carddata[cid]));
		},
		sideboard() {
			if (!this.list?.side) return [];
			let uniqueID = 0;
			return this.list.side.map((cid) => Object.assign({ uniqueID: ++uniqueID }, this.carddata[cid]));
		},
		landcount() {
			if (!this.list?.lands) return 0;
			return Object.values(this.list.lands).reduce((acc, c) => acc + c);
		},
	},
	methods: {
		copyHash(hash) {
			copyToClipboard(hash);
			fireToast("success", "Hash copied to clipboard!");
		},
	},
	watch: {
		list() {
			this.$nextTick(() => {
				this.$refs.mainboardComponent?.sync();
				this.$refs.sideboardComponent?.sync();
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

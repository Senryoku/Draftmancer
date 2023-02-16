<template>
	<div v-if="list && !hashesonly && (mainboard.length > 0 || sideboard.length > 0)" class="decklist">
		<card-pool
			:cards="mainboard"
			:language="language"
			:readOnly="true"
			:group="`deck-${uid}`"
			:key="`deck-${uid}`"
			ref="mainboardComponent"
		>
			<template v-slot:title>Mainboard ({{ list.main.length }})</template>
			<template v-slot:controls>
				<span v-if="landcount > 0">Added basics:</span>
				<span v-for="(color, value) in lands" :key="color">
					<img :src="`img/mana/${color}.svg`" class="mana-icon" style="vertical-align: text-bottom" />
					{{ value }}
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
						@click="copyHash(hashes.cockatrice)"
						class="clickable"
						v-tooltip.top="'Copy hash to clipboard.'"
						>Cockatrice: {{ hashes.cockatrice }}</span
					>
					<span @click="copyHash(hashes.mws)" class="clickable" v-tooltip.top="'Copy hash to clipboard.'"
						>MWS: {{ hashes.mws }}</span
					>
				</template>
			</template>
		</card-pool>
		<card-pool
			v-if="sideboard && sideboard.length > 0"
			:cards="sideboard"
			:language="language"
			:readOnly="true"
			:group="`side-${uid}`"
			:key="`side-${uid}`"
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
				<td @click="copyHash(hashes.cockatrice)" class="clickable" v-tooltip.right="'Copy hash to clipboard.'">
					<code>{{ hashes.cockatrice }}</code>
				</td>
			</tr>
			<tr>
				<td>MWS</td>
				<td @click="copyHash(hashes.mws)" class="clickable" v-tooltip.right="'Copy hash to clipboard.'">
					<code>{{ hashes.mws }}</code>
				</td>
			</tr>
		</table>
	</div>
	<div class="message" v-else>{{ username }} did not submit their decklist.</div>
</template>

<script lang="ts">
import { copyToClipboard } from "../helper";
import { fireToast } from "../alerts";
import Modal from "./Modal.vue";
import ExportDropdown from "./ExportDropdown.vue";
import CardPool from "./CardPool.vue";
import { defineComponent, PropType } from "vue";
import { Card, CardID, DeckList } from "../../../src/CardTypes";
import { Language } from "@/Types";

let deckUIDs = 0;

export default defineComponent({
	components: {
		Modal,
		CardPool,
		CardStats: () => import("./CardStats.vue"),
		ExportDropdown,
	},
	props: {
		list: { type: Object as PropType<DeckList>, required: true },
		username: { type: String, default: "Player" },
		carddata: { type: Object as PropType<{ [cid: CardID]: Card }>, required: true },
		language: { type: String as PropType<Language>, required: true },
		hashesonly: { type: Boolean, default: false },
	},
	data() {
		return { displayStats: false, uid: deckUIDs++ };
	},
	computed: {
		mainboard() {
			if (!this.list?.main) return [];
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
		hashes() {
			return this.list.hashes!;
		},
		lands() {
			if (!this.list?.lands) return {};
			const r: typeof this.list.lands = {};
			for (const c of Object.keys(this.list.lands).filter((c) => this.list.lands![c] > 0))
				r[c] = this.list.lands![c];
			return r;
		},
	},
	methods: {
		copyHash(hash: string) {
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
});
</script>

<style scoped>
.hashes {
	margin: auto;
}

.hashes td {
	padding: 0.5em;
}
</style>

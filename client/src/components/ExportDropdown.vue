<template>
	<dropdown>
		<template v-slot:handle><div @click="exportDeck($event, true)">Export</div></template>
		<template v-slot:dropdown>
			<button
				type="button"
				@click="exportDeck($event, true)"
				v-tooltip.right="'Export deck and sideboard for Arena'"
			>
				<img class="set-icon" src="../assets/img/mtga-icon.png" /> MTGA
			</button>
			<button type="button" @click="exportDeck($event, false)" v-tooltip.right="'Export without set information'">
				<i class="fas fa-clipboard"></i> Card Names
			</button>
			<button type="button" @click="exportDeckMTGO()" v-tooltip.right="'Export for MTGO (.dek)'">
				<img class="set-icon" src="../assets/img/mtgo-icon.webp" /> MTGO .dek
			</button>
		</template>
	</dropdown>
</template>

<script lang="ts">
import { exportToMTGA } from "../exportToMTGA.js";
import { exportToMTGO } from "../exportToMTGO.js";
import { fireToast } from "../alerts.js";
import { copyToClipboard } from "../helper.js";
import Dropdown from "./Dropdown.vue";

export default {
	components: { Dropdown },
	props: {
		language: { type: String, required: true },
		deck: { type: Array, required: true },
		sideboard: { type: Array, default: null },
		options: {
			type: Object,
			default: () => {
				return { lands: null, preferedBasics: "", sideboardBasics: 0 };
			},
		},
	},
	methods: {
		exportDeck(event: Event, full = true) {
			copyToClipboard(
				exportToMTGA(this.deck, this.sideboard, this.language, this.options.lands, {
					preferedBasics: this.options.preferedBasics,
					sideboardBasics: this.options.sideboardBasics,
					full: full,
				})
			);
			fireToast("success", "Deck exported to clipboard!");
		},
		exportDeckMTGO() {
			exportToMTGO(this.deck, this.sideboard, this.options);
		},
	},
};
</script>

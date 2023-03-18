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
import { PropType, defineComponent } from "vue";
import { UniqueCard } from "@/CardTypes";

import { exportToMTGA } from "../exportToMTGA";
import { exportToMTGO } from "../exportToMTGO";
import { fireToast } from "../alerts";
import { copyToClipboard } from "../helper";
import Dropdown from "./Dropdown.vue";
import { Language } from "@/Types";

export default defineComponent({
	components: { Dropdown },
	props: {
		language: { type: String as PropType<Language>, required: true },
		deck: { type: Array as PropType<UniqueCard[]>, required: true },
		sideboard: { type: Array as PropType<UniqueCard[]>, default: null },
		options: {
			type: Object,
			default: () => {
				return { lands: null, preferredBasics: "", sideboardBasics: 0 };
			},
		},
	},
	methods: {
		exportDeck(event: Event, full = true) {
			copyToClipboard(
				exportToMTGA(this.deck, this.sideboard, this.language, this.options.lands, {
					preferredBasics: this.options.preferredBasics,
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
});
</script>

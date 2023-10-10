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
				<font-awesome-icon icon="fa-solid fa-clipboard"></font-awesome-icon> Card Names
			</button>
			<button type="button" @click="exportDeckMTGO()" v-tooltip.right="'Export for MTGO (.dek)'">
				<img class="set-icon" src="../assets/img/mtgo-icon.webp" /> MTGO .dek
			</button>
			<button type="button" @click="exportDeckToFaBrary()" v-tooltip.right="'Export directly to FaBrary'">
				<font-awesome-icon icon="fa-solid fa-external-link-alt"></font-awesome-icon> to FaBrary
			</button>
		</template>
	</dropdown>
</template>

<script lang="ts">
import { PropType, defineComponent } from "vue";
import { Card, UniqueCard } from "@/CardTypes";

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
		faBraryCardExport(card: Card) {
			if (card.collector_number !== "" && card.collector_number.match(/[A-Z]{3}\d{3}/))
				return card.collector_number;
			if (
				card.set !== "" &&
				card.set.match(/[A-Z]{3}/) &&
				card.collector_number !== "" &&
				card.collector_number.match(/\d{3}/)
			)
				return card.set + card.collector_number;
			return encodeURIComponent(card.name.replace(/ /g, "-").replace(/[()]/g, "").toLowerCase());
		},
		exportDeckToFaBrary() {
			let url = "https://fabrary.net/decks?tab=import&format=draft";
			for (const card of this.deck) url += `&cards=${this.faBraryCardExport(card)}`;
			for (const card of this.sideboard) url += `&cards=${this.faBraryCardExport(card)}`;
			window.open(url);
		},
	},
});
</script>

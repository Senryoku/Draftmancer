<template>
	<dropdown>
		<template v-slot:handle>Export</template>
		<template v-slot:dropdown>
			<button
				type="button"
				@click="exportDeck($event, true)"
				v-tooltip.right="'Export deck and sideboard for Arena'"
			>
				<img class="set-icon button-icon" src="../assets/img/mtga-icon.png" />MTGA
			</button>
			<button type="button" @click="exportDeck($event, false)" v-tooltip.right="'Export without set information'">
				<font-awesome-icon icon="fa-solid fa-clipboard" class="button-icon"></font-awesome-icon>Card Names
			</button>
			<button type="button" @click="exportDeckMTGO()" v-tooltip.right="'Export for MTGO (.dek)'">
				<img class="set-icon button-icon" src="../assets/img/mtgo-icon.webp" /> MTGO .dek
			</button>
			<button
				type="button"
				@click="exportDeckToFaBrary()"
				v-tooltip.right="'Export directly to FaBrary, the Flesh and Blood library.'"
			>
				<font-awesome-icon icon="fa-solid fa-external-link-alt" class="button-icon"></font-awesome-icon>to
				FaBrary
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

// Some always available cards, such as a default hero, available equipement, set unique mechanics, ...etc
const FaBAlwaysAvailableCards = {
	EVO: ["EVO008", "EVO003", "EVO006", "EVO009", "EVO022", "EVO023", "EVO024", "EVO025"],
};

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

			const cardIDs = this.deck.map(this.faBraryCardExport);
			cardIDs.push(...this.sideboard.map(this.faBraryCardExport));

			// Check if all cards are from the same set (assuming we're exporting using set/numbers, not card names).
			const set = [...new Set(cardIDs.map((str) => str.substring(0, 3)))];
			// Add always available cards for convenience.
			if (set.length === 1 && set[0] in FaBAlwaysAvailableCards)
				cardIDs.push(...FaBAlwaysAvailableCards[set[0] as keyof typeof FaBAlwaysAvailableCards]);

			for (const cardID of cardIDs) url += `&cards=${cardID}`;

			window.open(url);
		},
	},
});
</script>

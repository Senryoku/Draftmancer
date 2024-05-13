<template>
	<dropdown>
		<template v-slot:handle>Export</template>
		<template v-slot:dropdown>
			<div class="row">
				<button
					@click="clipboardMTGA(true)"
					v-tooltip.right="'Export deck and sideboard for Arena to clipboard'"
				>
					<img class="set-icon button-icon" src="../assets/img/mtga-icon.png" />MTGA
				</button>
				<button @click="downloadMTGA(true)" v-tooltip.right="'Download deck and sideboard for Arena'">
					<font-awesome-icon icon="fa-solid fa-file-download" class="button-icon"></font-awesome-icon>
				</button>
			</div>
			<div class="row">
				<button
					@click="clipboardMTGA(false)"
					v-tooltip.right="'Export deck and sideboard without set information to clipboard'"
				>
					<font-awesome-icon icon="fa-solid fa-clipboard" class="button-icon"></font-awesome-icon>Card Names
				</button>
				<button
					@click="downloadMTGA(false)"
					v-tooltip.right="'Download deck and sideboard without set information'"
				>
					<font-awesome-icon icon="fa-solid fa-file-download" class="button-icon"></font-awesome-icon>
				</button>
			</div>
			<button @click="exportDeckMTGO()" v-tooltip.right="'Download .deck file for MTGO'">
				<img class="set-icon button-icon" src="../assets/img/mtgo-icon.webp" /> MTGO .dek
			</button>
			<button
				@click="exportDeckToFaBrary()"
				v-tooltip.right="'Export directly to FaBrary, the Flesh and Blood library.'"
			>
				<font-awesome-icon icon="fa-solid fa-external-link-alt" class="button-icon"></font-awesome-icon>to
				FaBrary
			</button>
			<div class="row">
				<button @click="clipboardCollectorNumber()" v-tooltip.right="'Export collector number list'">
					<font-awesome-icon icon="fa-solid fa-clipboard" class="button-icon"></font-awesome-icon>
					Collector #
				</button>
				<button @click="downloadCollectorNumber()" v-tooltip.right="'Download collector number list'">
					<FontAwesomeIcon icon="fa-solid fa-file-download" class="button-icon"></FontAwesomeIcon>
				</button>
			</div>
		</template>
	</dropdown>
</template>

<script lang="ts">
import { PropType, defineComponent } from "vue";
import { Card, UniqueCard } from "@/CardTypes";

import { exportToMTGA } from "../exportToMTGA";
import { exportToMTGO } from "../exportToMTGO";
import { fireToast } from "../alerts";
import { copyToClipboard, download } from "../helper";
import Dropdown from "./Dropdown.vue";
import { Language } from "@/Types";
import { FontAwesomeIcon } from "@fortawesome/vue-fontawesome";

// Some always available cards, such as a default hero, available equipement, set unique mechanics, ...etc
const FaBAlwaysAvailableCards = {
	EVO: ["EVO008", "EVO003", "EVO006", "EVO009", "EVO022", "EVO023", "EVO024", "EVO025"],
	HVY: ["HVY002", "HVY005", "HVY005", "HVY049", "HVY094", "HVY094"],
	MST: ["MST002", "MST003", "MST003", "MST130", "MST159"],
};

export default defineComponent({
	components: { Dropdown, FontAwesomeIcon },
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
		exportDeckMTGA(full = true) {
			return exportToMTGA(this.deck, this.sideboard, this.language, this.options.lands, {
				preferredBasics: this.options.preferredBasics,
				sideboardBasics: this.options.sideboardBasics,
				full: full,
			});
		},
		clipboardMTGA(full = true) {
			copyToClipboard(this.exportDeckMTGA(full));
			fireToast("success", "Deck exported to clipboard!");
		},
		downloadMTGA(full = true) {
			download("Deck.txt", this.exportDeckMTGA(full));
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
		collectorNumberList(): string {
			let deck: Record<string, number> = {};
			for (const card of this.deck) {
				if (!deck[card.collector_number]) deck[card.collector_number] = 1;
				else deck[card.collector_number]++;
			}

			let list = "";
			for (const [key, value] of Object.entries(deck)) list += `${value} ${key}\n`;
			return list;
		},
		clipboardCollectorNumber() {
			copyToClipboard(this.collectorNumberList());
			fireToast("success", "Deck exported to clipboard!");
		},
		downloadCollectorNumber() {
			download("Deck.txt", this.collectorNumberList());
		},
	},
});
</script>

<style scoped>
.row {
	display: flex;
}

.row > button:first-child {
	flex-grow: 1;
	min-width: 0;
	padding-left: 28px !important; /* Account for the icon. #main-container messes with the specificity, again. */
}
</style>

<template>
	<Dropdown>
		<template v-slot:handle>Export</template>
		<template v-slot:dropdown>
			<div class="row">
				<button @click="clipboardMTGA(true)" v-tooltip.top="'Export deck and sideboard for Arena to clipboard'">
					<img class="set-icon button-icon" src="../assets/img/mtga-icon.png" />MTGA
				</button>
				<button @click="downloadMTGA(true)" v-tooltip.right="'Download deck and sideboard for Arena'">
					<font-awesome-icon icon="fa-solid fa-file-download" class="button-icon" />
				</button>
			</div>
			<div class="row">
				<button
					@click="clipboardMTGA(false)"
					v-tooltip.top="'Export deck and sideboard without set information to clipboard'"
				>
					<font-awesome-icon icon="fa-solid fa-clipboard" class="button-icon" />Card Names
				</button>
				<button
					@click="downloadMTGA(false)"
					v-tooltip.right="'Download deck and sideboard without set information'"
				>
					<font-awesome-icon icon="fa-solid fa-file-download" class="button-icon" />
				</button>
			</div>
			<button @click="exportDeckMTGO()" v-tooltip.right="'Download .deck file for MTGO'">
				<img class="set-icon button-icon" src="../assets/img/mtgo-icon.webp" /> MTGO .dek
			</button>
			<div class="row">
				<button @click="clipboardCollectorNumber()" v-tooltip.top="'Export collector number list'">
					<font-awesome-icon icon="fa-solid fa-clipboard" class="button-icon" />
					Collector #
				</button>
				<button @click="downloadCollectorNumber()" v-tooltip.right="'Download collector number list'">
					<font-awesome-icon icon="fa-solid fa-file-download" class="button-icon" />
				</button>
			</div>
			<template v-if="hasCustomCards">
				<div class="header">External services</div>
				<button
					@click="exportDeckToFaBrary()"
					v-tooltip.right="'Export directly to FaBrary, the Flesh and Blood library.'"
				>
					<font-awesome-icon icon="fa-solid fa-external-link-alt" class="button-icon" />FaBrary
				</button>
				<div class="header">Cubecana</div>
				<button
					@click="exportToCubecana('lorcanito')"
					v-tooltip.right="'Export directly to Lorcanito via Cubecana.'"
				>
					<font-awesome-icon icon="fa-solid fa-external-link-alt" class="button-icon" />Lorcanito
				</button>
				<button
					@click="exportToCubecana('inktable')"
					v-tooltip.right="'Export directly to Inktable  via Cubecana.'"
				>
					<font-awesome-icon icon="fa-solid fa-external-link-alt" class="button-icon" />Inktable
				</button>
				<button
					@click="exportToCubecana('tts')"
					v-tooltip.right="'Export directly to Tabletop Simulator via Cubecana.'"
				>
					<font-awesome-icon icon="fa-solid fa-external-link-alt" class="button-icon" />TTS
				</button>
			</template>
		</template>
	</Dropdown>
</template>

<script setup lang="ts">
import { computed } from "vue";
import Dropdown from "./Dropdown.vue";
import { FontAwesomeIcon } from "@fortawesome/vue-fontawesome";

import { Language } from "@/Types";
import { Card, UniqueCard } from "@/CardTypes";
import { exportToMTGA } from "../exportToMTGA";
import { exportToMTGO } from "../exportToMTGO";
import { fireToast } from "../alerts";
import { copyToClipboard, download } from "../helper";

// Some always available cards, such as a default hero, available equipement, set unique mechanics, ...etc
const FaBAlwaysAvailableCards = {
	EVO: ["EVO008", "EVO003", "EVO006", "EVO009", "EVO022", "EVO023", "EVO024", "EVO025"],
	HVY: ["HVY002", "HVY005", "HVY005", "HVY049", "HVY094", "HVY094"],
	MST: ["MST002", "MST003", "MST003", "MST130", "MST159"],
	ROS: ["ROS002", "ROS003", "ROS009", "ROS015", "ROS021"],
	HNT: ["HNT099", "HNT100", "HNT100", "HNT056", "HNT056", "HNT010", "HNT010"],
	SEA: ["SEA002", "SEA006", "SEA007", "SEA044", "SEA045", "SEA083", "SEA084", "SEA094", "SEA124"],
};

const props = withDefaults(
	defineProps<{
		language: Language;
		deck: UniqueCard[];
		sideboard?: UniqueCard[];
		options?: {
			lands?: { W: number; U: number; B: number; R: number; G: number };
			preferredBasics: string;
			sideboardBasics: number;
		};
	}>(),
	{
		sideboard: () => [],
		options: () => {
			return { lands: undefined, preferredBasics: "", sideboardBasics: 0 };
		},
	}
);

const hasCustomCards = computed(() => props.deck.some((c) => c.is_custom) || props.sideboard.some((c) => c.is_custom));

function exportDeckMTGA(full = true) {
	return exportToMTGA(props.deck, props.sideboard, props.language, props.options.lands, {
		preferredBasics: props.options.preferredBasics,
		sideboardBasics: props.options.sideboardBasics,
		full: full,
	});
}

function clipboardMTGA(full = true) {
	copyToClipboard(exportDeckMTGA(full));
	fireToast("success", "Deck exported to clipboard!");
}

function downloadMTGA(full = true) {
	download("Deck.txt", exportDeckMTGA(full));
}

function exportDeckMTGO() {
	exportToMTGO(props.deck, props.sideboard, props.options);
}

function faBraryCardExport(card: Card) {
	if (card.collector_number !== "" && card.collector_number.match(/[A-Z]{3}\d{3}/)) return card.collector_number;
	if (
		card.set !== "" &&
		card.set.match(/[A-Z]{3}/) &&
		card.collector_number !== "" &&
		card.collector_number.match(/\d{3}/)
	)
		return card.set + card.collector_number;
	return encodeURIComponent(card.name.replace(/ /g, "-").replace(/[()]/g, "").toLowerCase());
}

function exportDeckToFaBrary() {
	let url = "https://fabrary.net/decks?tab=import&format=draft";

	const cardIDs = props.deck.map(faBraryCardExport);
	cardIDs.push(...props.sideboard.map(faBraryCardExport));

	// Check if all cards are from the same set (assuming we're exporting using set/numbers, not card names).
	const set = [...new Set(cardIDs.map((str) => str.substring(0, 3)))];
	// Add always available cards for convenience.
	if (set.length === 1 && set[0] in FaBAlwaysAvailableCards)
		cardIDs.push(...FaBAlwaysAvailableCards[set[0] as keyof typeof FaBAlwaysAvailableCards]);

	for (const cardID of cardIDs) url += `&cards=${cardID}`;

	window.open(url);
}

function exportToCubecana(site: "inktable" | "lorcanito" | "tts") {
	const cardNames = exportDeckMTGA(false);
	window.open(`https://www.cubecana.com/play?export=${site}&deck=${encodeURIComponent(cardNames)}`);
}

function collectorNumberList(): string {
	let deck: Record<string, number> = {};
	for (const card of props.deck) {
		if (!deck[card.collector_number]) deck[card.collector_number] = 1;
		else deck[card.collector_number]++;
	}

	let list = "";
	for (const [key, value] of Object.entries(deck)) list += `${value} ${key}\n`;
	return list;
}

function clipboardCollectorNumber() {
	copyToClipboard(collectorNumberList());
	fireToast("success", "Deck exported to clipboard!");
}

function downloadCollectorNumber() {
	download("Deck.txt", collectorNumberList());
}
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

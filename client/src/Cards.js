import { clone } from "./helper.js";

import parseCost from "../../src/parseCost.js";

export let Cards = {};

let UniqueID = 0;

export function genCard(c) {
	// Takes a card id and return a unique card object (without localization information)
	if (!(c in Cards)) {
		console.error(`Error: Card id '${c}' not found!`);
		return { id: c };
	}
	// Properties printed_name, image_uris and back can be dynamically loaded (multiple languages)
	// Access them throught Cards when needed.
	return {
		id: c,
		uniqueID: UniqueID++,
		name: Cards[c].name,
		set: Cards[c].set,
		rarity: Cards[c].rarity,
		mana_cost: Cards[c].mana_cost,
		cmc: Cards[c].cmc,
		colors: Cards[c].colors,
		type: Cards[c].type,
		collector_number: Cards[c].collector_number,
		in_booster: Cards[c].in_booster,
	};
}

export async function loadCards() {
	const CardData = (await import("../public/data/MTGACards.json")).default;
	for (let c in CardData) {
		CardData[c].id = c;
		if (!("in_booster" in CardData[c])) CardData[c].in_booster = true;
		if (!("printed_name" in CardData[c])) CardData[c].printed_name = {};
		if (!("image_uris" in CardData[c])) CardData[c].image_uris = {};
		Object.assign(CardData[c], parseCost(CardData[c].mana_cost));
	}
	Cards = Object.freeze(CardData); // Object.freeze so Vue doesn't make everything reactive.
}

export function addLanguage(lang, json) {
	let merged = clone(Cards);
	// Missing translation will default to english
	for (let c in merged) {
		merged[c]["printed_name"][lang] =
			c in json && "printed_name" in json[c] ? json[c]["printed_name"] : Cards[c]["name"];
		merged[c]["image_uris"][lang] =
			c in json && "image_uris" in json[c] ? json[c]["image_uris"] : Cards[c]["image_uris"]["en"];

		if (c in json && json[c]["back"]) {
			if (!("back" in merged[c])) merged[c]["back"] = {};
			merged[c]["back"][lang] = json[c]["back"];
			// Defaults to English
		} else if ("back" in merged[c] && "en" in merged[c]["back"]) merged[c]["back"][lang] = merged[c]["back"]["en"];
	}
	Cards = Object.freeze(merged);
}

import { clone } from "./helper.js";

import ManaSymbols from "./data/mana_symbols.json";

export let Cards = {};

let UniqueID = 0;

function parseCost(cost) {
	let r = {
		cmc: 0,
		colors: [],
	};
	// Use only the first part of split cards
	if (cost.includes("//")) cost = cost.split("//")[0].trim();
	if (!cost || cost === "") return r;
	let symbols = cost.match(/({[^}]+})/g);
	for (let s of symbols) {
		r.cmc += ManaSymbols[s].cmc;
		r.colors = r.colors.concat(ManaSymbols[s].colors);
	}
	r.colors = [...new Set(r.colors)]; // Remove duplicates
	return r;
}

export function genCard(c) {
	// Takes a card id and return a unique card object (without localization information)
	if (!(c in Cards)) {
		console.error(`Error: Card id '${c}' not found!`);
		return { id: c };
	}
	return {
		id: c,
		uniqueID: UniqueID++,
		name: Cards[c].name,
		/*
		// printed_name and image_uris can be dynamically loaded (multiple languages), use Cards
		printed_name: Cards[c].printed_name,
		image_uris: Cards[c].image_uris,
		*/
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
	}
	Cards = Object.freeze(merged);
}

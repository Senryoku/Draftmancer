import { clone } from "./helper.js";

export let Cards = {};

let UniqueID = 0;

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
		cmc: Cards[c].cmc,
		collector_number: Cards[c].collector_number,
		color_identity: Cards[c].color_identity,
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

"use strict";

import ManaSymbols from "../client/src/data/mana_symbols.json";

import fs from "fs";

// FIXME: Duplicate function from ../client/src/Cards.js, sharing code with the browser is a pain.
function parseCost(cost) {
	let r = {
		cmc: 0,
		colors: [],
	};
	// Use only the first part of split cards
	if (cost.includes("//")) cost = cost.split("//")[0].trim();
	if (!cost || cost === "") return r;
	let symbols = cost.split(/(?<=})/);
	for (let s of symbols) {
		r.cmc += ManaSymbols[s].cmc;
		r.colors = r.colors.concat(ManaSymbols[s].colors);
	}
	r.colors = [...new Set(r.colors)]; // Remove duplicates
	return r;
}

const Cards = JSON.parse(fs.readFileSync("client/public/data/MTGACards.json"));
for (let c in Cards) {
	if (!("in_booster" in Cards[c])) Cards[c].in_booster = true;
	Object.assign(Cards[c], parseCost(Cards[c].mana_cost));
}

Object.freeze(Cards);
export default Cards;

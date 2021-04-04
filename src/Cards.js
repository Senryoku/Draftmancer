"use strict";

import fs from "fs";
import parseCost from "./parseCost.js";

console.log("Loading Cards...");
export const Cards = JSON.parse(fs.readFileSync("./data/MTGCards.json"));

console.log("Preparing Cards and caches...");

export const MTGACards = {}; // Cards sorted by their arena id
export const CardVersionsByName = {}; // Every card version sorted by their name (first face)

for(let cid in Cards) {
	if (!("in_booster" in Cards[cid])) Cards[cid].in_booster = true;
	Object.assign(Cards[cid], parseCost(Cards[cid].mana_cost));

	if("arena_id" in Cards[cid])
		MTGACards[Cards[cid].arena_id] = Cards[cid];

	const firstFaceName = Cards[cid].name.split(" //")[0];
	if(!CardVersionsByName[firstFaceName]) CardVersionsByName[firstFaceName] = [];
	CardVersionsByName[firstFaceName].push(cid);
}

// Prefered version of each card
export const CardsByName = JSON.parse(fs.readFileSync("./data/CardsByName.json"));

// Cache for cards organized by set.
export const BoosterCardsBySet = {};
for (let cid in Cards) {
	if (Cards[cid].in_booster || Cards[cid].set === 'und' || Cards[cid].set === 'sta') { // Force cache for Unsanctionec (UND) as it's not a draft product originally and Mystical Archives (STA)
		if (!(Cards[cid].set in BoosterCardsBySet)) BoosterCardsBySet[Cards[cid].set] = [];
		BoosterCardsBySet[Cards[cid].set].push(cid);
	}
}

Object.freeze(Cards);
Object.freeze(MTGACards);
Object.freeze(CardsByName);
Object.freeze(CardVersionsByName);
Object.freeze(BoosterCardsBySet);

let UniqueID = 0;
export function getUnique(cid) {
	return Object.assign({uniqueID: ++UniqueID}, Cards[cid]);
}

console.log("Done.");


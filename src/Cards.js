"use strict";

import fs from "fs";
import parseCost from "./parseCost.js";

console.log("Loading Cards...");
export const Cards = JSON.parse(fs.readFileSync("./data/MTGCards.json"));

console.log("Preparing Cards and caches...");
for (let c in Cards) {
	if (!("in_booster" in Cards[c])) Cards[c].in_booster = true;
	Object.assign(Cards[c], parseCost(Cards[c].mana_cost));
}

export const MTGACards = {};
for(let cid in Cards)
	if("arena_id" in Cards[cid])
		MTGACards[Cards[cid].arena_id] = Cards[cid];

export const CardsByName = JSON.parse(fs.readFileSync("./data/CardsByName.json"));
for(let name in CardsByName)
	CardsByName[name] = Cards[CardsByName[name]];

Object.freeze(Cards);
Object.freeze(MTGACards);
Object.freeze(CardsByName);

let UniqueID = 0;
export function getUnique(cid) {
	return Object.assign({uniqueID: ++UniqueID}, Cards[cid]);
}

console.log("Done.");


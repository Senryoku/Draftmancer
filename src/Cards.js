"use strict";

import fs from "fs";
import parseCost from "./parseCost.js";
import SetsInfos from "../client/public/data/SetsInfos.json";

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
/*
for(let cid in Cards)
	// Tries to select the "best" version of the card 
	// TODO: Prioritize latest printing (add this infos to the db) and lowest collector number (within a set)
	if(SetsInfos[Cards[cid].set].isPrimary || !CardsByName[Cards[cid].name])
		CardsByName[Cards[cid].name] = Cards[cid];
*/

Object.freeze(Cards);
Object.freeze(MTGACards);
Object.freeze(CardsByName);

console.log("Done.");


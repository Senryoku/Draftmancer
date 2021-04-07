"use strict";

import fs from "fs";
import parseCost from "./parseCost.js";
import JSONSteam from "JSONStream";

console.log("Loading Cards...");

export const Cards = {};

const cardsPromise = new Promise((resolve, reject) => {
	const stream = JSONSteam.parse('$*');
	stream.on('data', function(entry) {
		Cards[entry.key] = entry.value;
	});
	stream.on('end', resolve);
	fs.createReadStream("./data/MTGCards.json").pipe(stream);
});

let used = process.memoryUsage().heapUsed / 1024 / 1024;
console.log(`Heap usage before cards parsing: ${Math.round(used * 100) / 100} MB`);
await cardsPromise;
used = process.memoryUsage().heapUsed / 1024 / 1024;
console.log(`Heap usage after cards parsing: ${Math.round(used * 100) / 100} MB`);

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


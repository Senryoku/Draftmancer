"use strict";

import fs from "fs";
import parseCost from "./parseCost.js";
import JSONStream from "JSONStream";
import { memoryReport } from "./utils.js";

console.log("Loading Cards...");
memoryReport();
console.time("Parsing Cards");

export let Cards = {};
if (process.env.NODE_ENV !== "production") {
	Cards = JSON.parse(fs.readFileSync("./data/MTGCards.json"));
} else {
	const cardsPromise = new Promise((resolve, reject) => {
		const stream = JSONStream.parse("$*");
		stream.on("data", function(entry) {
			Cards[entry.key] = entry.value;
		});
		stream.on("end", resolve);
		fs.createReadStream("./data/MTGCards.json").pipe(stream);
	});
	await cardsPromise;
}

console.timeEnd("Parsing Cards");
memoryReport();

console.log("Preparing Cards and caches...");

export const MTGACards = {}; // Cards sorted by their arena id
export const CardVersionsByName = {}; // Every card version sorted by their name (first face)

for (let cid in Cards) {
	if (!("in_booster" in Cards[cid])) Cards[cid].in_booster = true;
	Object.assign(Cards[cid], parseCost(Cards[cid].mana_cost));

	if ("arena_id" in Cards[cid]) MTGACards[Cards[cid].arena_id] = Cards[cid];

	const firstFaceName = Cards[cid].name.split(" //")[0];
	if (!CardVersionsByName[firstFaceName]) CardVersionsByName[firstFaceName] = [];
	CardVersionsByName[firstFaceName].push(cid);
}

// Prefered version of each card
export const CardsByName = JSON.parse(fs.readFileSync("./data/CardsByName.json"));

// Cache for cards organized by set.
export const CardsBySet = {};
export const BoosterCardsBySet = {};
for (let cid in Cards) {
	if (Cards[cid].in_booster || Cards[cid].set === "und") {
		// Force cache for Unsanctioned (UND) as it's not a draft product originally
		if (!(Cards[cid].set in BoosterCardsBySet)) BoosterCardsBySet[Cards[cid].set] = [];
		BoosterCardsBySet[Cards[cid].set].push(cid);
	}
	if (!(Cards[cid].set in CardsBySet)) CardsBySet[Cards[cid].set] = [];
	CardsBySet[Cards[cid].set].push(cid);
}

export const CardIDs = Object.keys(Cards);
export const MTGACardIDs = CardIDs.filter(cid => !!Cards[cid].arena_id);

Object.freeze(Cards);
Object.freeze(MTGACards);
Object.freeze(CardsByName);
Object.freeze(CardVersionsByName);
Object.freeze(BoosterCardsBySet);
Object.freeze(CardsBySet);
Object.freeze(CardIDs);
Object.freeze(MTGACardIDs);

let UniqueID = 0;
export function getUnique(cid) {
	return Object.assign({ uniqueID: ++UniqueID }, Cards[cid]);
}

console.log("Done.");

"use strict";

import fs from "fs";
import parseCost from "./parseCost.js";

import JSONStream from "JSONStream";
import { memoryReport } from "./utils.js";

export type CardID = string;
export type ArenaID = string;

export class Card {
	id: CardID = "";
	arena_id?: ArenaID;
	name: string = "";
	mana_cost: string = "";
	colors: Array<string> = [];
	set: string = "";
	collector_number: string = "";
	rarity: string = "";
	type: string = "";
	subtypes: Array<string> = [];
	rating: number = 0;
	in_booster: boolean = true;
	printed_names: { [lang: string]: string } = {};
	image_uris: { [lang: string]: string } = {};
}

export type CardPool = Map<string, number>;
export type SlotedCardPool = { [slot: string]: CardPool };
export type DeckList = {
	main: Array<CardID>;
	side: Array<CardID>;
	hashes?: { [key: string]: string };
	lands?: { [key: string]: number };
};

export let Cards: { [cid: string]: Card } = {};

let UniqueID = 0;

export class UniqueCard extends Card {
	uniqueID?: number;
	foil?: boolean = false;
}

export function getUnique(cid: CardID, foil?: boolean) {
	let uc: UniqueCard = Object.assign({}, Cards[cid]);
	uc.uniqueID = ++UniqueID;
	if (foil) uc.foil = foil;
	return uc;
}

console.group("Cards.ts::Loading Cards...");
console.time("Total");

//memoryReport();

console.time("Parsing Cards");
if (process.env.NODE_ENV !== "production") {
	Cards = JSON.parse(fs.readFileSync("./data/MTGCards.json", "utf-8"));
} else {
	// Stream the JSON file on production to reduce memory usage (to the detriment of runtime)
	const cardsPromise = new Promise((resolve, reject) => {
		const stream = JSONStream.parse("$*");
		stream.on("data", function(entry: any) {
			Cards[entry.key] = entry.value as Card;
		});
		stream.on("end", resolve);
		fs.createReadStream("./data/MTGCards.json").pipe(stream);
	});
	await cardsPromise;
}
console.timeEnd("Parsing Cards");

//memoryReport();

console.time("Preparing Cards and caches");

export const MTGACards: { [arena_id: string]: Card } = {}; // Cards sorted by their arena id
export const CardVersionsByName: { [name: string]: Array<CardID> } = {}; // Every card version sorted by their name (first face)

for (let cid in Cards) {
	if (!("in_booster" in Cards[cid])) Cards[cid].in_booster = true;
	Object.assign(Cards[cid], parseCost(Cards[cid].mana_cost));

	const aid = Cards[cid].arena_id;
	if (aid !== undefined) MTGACards[aid] = Cards[cid];

	const firstFaceName = Cards[cid].name.split(" //")[0];
	if (!CardVersionsByName[firstFaceName]) CardVersionsByName[firstFaceName] = [];
	CardVersionsByName[firstFaceName].push(cid);
}

// Prefered version of each card
export const CardsByName = JSON.parse(fs.readFileSync("./data/CardsByName.json", "utf-8"));

// Cache for cards organized by set.
export const CardsBySet: { [set: string]: Array<CardID> } = {};
export const BoosterCardsBySet: { [set: string]: Array<CardID> } = {};
for (let cid in Cards) {
	if (Cards[cid].in_booster || ["und", "j21"].includes(Cards[cid].set)) {
		// Force cache for Unsanctioned (UND) and Jumpstart: Historic Horizons as they're not originally draft products
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

console.timeEnd("Preparing Cards and caches");

console.timeEnd("Total");
console.groupEnd();

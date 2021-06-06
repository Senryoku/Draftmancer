"use strict";

import fs from "fs";
import parseCost from "./parseCost.js";
import JSONStream from "JSONStream";
import { memoryReport } from "./utils.js";
import { IIndexable } from "./Session.js";

console.log("Loading Cards...");
memoryReport();
console.time("Parsing Cards");

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

export type CardPool = { [cid: string]: number };
export type SlotedCardPool = { [slot: string]: CardPool };
export type DeckList = {
	main: Array<CardID>;
	side: Array<CardID>;
};

export let Cards: { [cid: string]: Card } = {};
if (process.env.NODE_ENV !== "production") {
	let tmp = JSON.parse(fs.readFileSync("./data/MTGCards.json").toString());
	for (let cid in tmp) {
		Cards[cid] = tmp[cid] as Card; //new Card(entry.value);
	}
} else {
	const cardsPromise = new Promise((resolve, reject) => {
		const stream = JSONStream.parse("$*");
		stream.on("data", function(entry: any) {
			Cards[entry.key] = entry.value as Card; //new Card(entry.value);
		});
		stream.on("end", resolve);
		fs.createReadStream("./data/MTGCards.json").pipe(stream);
	});
	await cardsPromise;
}

console.timeEnd("Parsing Cards");
memoryReport();

console.log("Preparing Cards and caches...");

export const MTGACards: { [arena_id: string]: Card } = {}; // Cards sorted by their arena id
export const CardVersionsByName: { [name: string]: Array<CardID> } = {}; // Every card version sorted by their name (first face)

for (let cid in Cards) {
	if (!("in_booster" in Cards[cid])) Cards[cid].in_booster = true;
	Object.assign(Cards[cid], parseCost(Cards[cid].mana_cost));

	if (Cards[cid].arena_id !== undefined) MTGACards[Cards[cid].arena_id] = Cards[cid];

	const firstFaceName = Cards[cid].name.split(" //")[0];
	if (!CardVersionsByName[firstFaceName]) CardVersionsByName[firstFaceName] = [];
	CardVersionsByName[firstFaceName].push(cid);
}

// Prefered version of each card
export const CardsByName = JSON.parse(fs.readFileSync("./data/CardsByName.json").toString());

// Cache for cards organized by set.
export const CardsBySet: { [set: string]: Array<CardID> } = {};
export const BoosterCardsBySet: { [set: string]: Array<CardID> } = {};
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

class UniqueCard extends Card {
	uniqueID: number;
	foil: boolean = false;

	constructor(card: Card, uniqueID: number, foil: boolean = false) {
		super();
		for (let prop of Object.getOwnPropertyNames(card)) (this as IIndexable)[prop] = (card as IIndexable)[prop];
		this.uniqueID = uniqueID;
		this.foil = foil;
	}
}

export function getUnique(cid: CardID) {
	return new UniqueCard(Cards[cid], ++UniqueID);
}

console.log("Done.");

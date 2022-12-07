"use strict";

import fs from "fs";
import parseCost from "./parseCost.js";

import JSONStream from "JSONStream";
import { memoryReport, Options } from "./utils.js";

export type CardID = string;
export type ArenaID = string;
export type OracleID = string;
export type UniqueCardID = number;

export type CardColor = "W" | "U" | "B" | "R" | "G";

export class Card {
	id: CardID = "";
	arena_id?: ArenaID;
	oracle_id: OracleID = "";
	name: string = "";
	mana_cost: string = "";
	cmc: number = 0;
	colors: Array<CardColor> = [];
	set: string = "";
	collector_number: string = "";
	rarity: string = "";
	type: string = "";
	subtypes: Array<string> = [];
	rating: number = 0;
	in_booster: boolean = true;
	layout?: string;
	printed_names: { [lang: string]: string } = {};
	image_uris: { [lang: string]: string } = {};
	back?: {
		name: string;
		printed_names: { [lang: string]: string };
		image_uris: { [lang: string]: string };
		type: string;
		subtypes: Array<string>;
	};
}

export type CardPool = Map<string, number>;
export type SlotedCardPool = { [slot: string]: CardPool };
export type DeckList = {
	main: Array<CardID>;
	side: Array<CardID>;
	hashes?: { [key: string]: string };
	lands?: { [key: string]: number };
};

export let Cards = new Map<CardID, Card>();

let UniqueID: UniqueCardID = 0;

export function getNextCardID() {
	return ++UniqueID;
}

export class UniqueCard extends Card {
	uniqueID: UniqueCardID = 0;
	foil?: boolean = false;
}

export function getCard(cid: CardID): Card {
	const card = Cards.get(cid);
	if (!card) {
		console.error("Error in getCard: Unknown cardID: ", cid);
		console.error(new Error().stack);
		throw Error(`Error in getCard: Unknown cardID '${cid}'.`);
	}
	return card;
}

export function getUnique(cid: CardID, options: Options = {}) {
	let uc: UniqueCard = Object.assign({}, options.getCard ? options.getCard(cid) : getCard(cid));
	uc.uniqueID = getNextCardID();
	if (options.foil) uc.foil = options.foil;
	return uc;
}

console.group("Cards.ts::Loading Cards...");
console.time("Total");

//memoryReport();

console.time("Parsing Cards");
if (process.env.NODE_ENV !== "production") {
	Cards = new Map<CardID, Card>(Object.entries(JSON.parse(fs.readFileSync("./data/MTGCards.json", "utf-8"))));
} else {
	// Stream the JSON file on production to reduce memory usage (to the detriment of runtime)
	const cardsPromise = new Promise((resolve, reject) => {
		const stream = JSONStream.parse("$*");
		stream.on("data", function (entry: any) {
			Cards.set(entry.key, entry.value as Card);
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

for (let [cid, card] of Cards) {
	if (!("in_booster" in card)) card.in_booster = true;
	Object.assign(card, parseCost(card.mana_cost));

	const aid = card.arena_id;
	if (aid !== undefined) MTGACards[aid] = card;

	const firstFaceName = card.name.split(" //")[0];
	if (!CardVersionsByName[firstFaceName]) CardVersionsByName[firstFaceName] = [];
	CardVersionsByName[firstFaceName].push(cid);

	Object.freeze(card);
}

Object.freeze(Cards);

// Prefered version of each card
export const CardsByName = JSON.parse(fs.readFileSync("./data/CardsByName.json", "utf-8"));

// Cache for cards organized by set.
export const CardsBySet: { [set: string]: Array<CardID> } = {};
export const BoosterCardsBySet: { [set: string]: Array<CardID> } = { alchemy_dmu: [], planeshifted_snc: [] };
for (let [cid, card] of Cards.entries()) {
	if (card.in_booster || ["und", "j21"].includes(card.set)) {
		// Force cache for Unsanctioned (UND) and Jumpstart: Historic Horizons as they're not originally draft products
		if (!(card.set in BoosterCardsBySet)) BoosterCardsBySet[card.set] = [];
		BoosterCardsBySet[card.set].push(cid);
	}
	if (!(card.set in CardsBySet)) CardsBySet[card.set] = [];
	CardsBySet[card.set].push(cid);

	if (card.set === "ydmu") BoosterCardsBySet["alchemy_dmu"].push(cid);
	// Planeshifted New Capenna
	if (card.set === "snc" && card.in_booster) {
		// Search for a rebalanced version of the card
		const rebalancedName = "A-" + card.name;
		if (rebalancedName in CardsByName && getCard(CardsByName[rebalancedName]).set === "snc")
			BoosterCardsBySet["planeshifted_snc"].push(CardsByName[rebalancedName]);
		else BoosterCardsBySet["planeshifted_snc"].push(cid);
	}
}
BoosterCardsBySet["dbl"] = BoosterCardsBySet["mid"].concat(BoosterCardsBySet["vow"]); // Innistrad: Double Feature (All cards from Midnight Hunt and Crimson Vow)
BoosterCardsBySet["ydmu"] = BoosterCardsBySet["dmu"]; // Dominaria United Alchemy

export const CardIDs = Object.keys(Cards);
export const MTGACardIDs = CardIDs.filter((cid) => !!getCard(cid).arena_id);

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

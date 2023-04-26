"use strict";

import fs from "fs";
import { glob } from "glob";
import JSONStream from "JSONStream";
import { memoryReport } from "./utils.js";

import { ArenaID, Card, CardID, getNextCardID, UniqueCard } from "./CardTypes.js";

console.group("Cards.ts::Loading Cards...");
console.time("Total");

//memoryReport();
let tmpCards: Map<CardID, Card> = new Map<CardID, Card>();
console.time("Parsing Cards");
const DBFiles = await glob("data/MTGCards.*.json");
if (process.env.NODE_ENV !== "production") {
	for (const file of DBFiles) {
		tmpCards = new Map<CardID, Card>([
			...tmpCards,
			...new Map<CardID, Card>(Object.entries(JSON.parse(fs.readFileSync(file, "utf-8")))),
		]);
	}
} else {
	for (const file of DBFiles) {
		// Stream the JSON file on production to reduce memory usage (to the detriment of runtime)
		const cardsPromise = new Promise((resolve, reject) => {
			const stream = JSONStream.parse("$*");
			stream.on("data", function (entry: any) {
				tmpCards.set(entry.key, entry.value as Card);
			});
			stream.on("end", resolve);
			fs.createReadStream(file).pipe(stream);
		});
		await cardsPromise;
	}
}
console.timeEnd("Parsing Cards");
//memoryReport();

export const Cards: ReadonlyMap<CardID, Card> = tmpCards;

export function getCard(cid: CardID): Card {
	const card = Cards.get(cid);
	if (!card) {
		console.error("Error in getCard: Unknown cardID: ", cid);
		console.error(new Error().stack);
		throw Error(`Error in getCard: Unknown cardID '${cid}'.`);
	}
	return card;
}

export function isValidCardID(cid: CardID): boolean {
	return Cards.has(cid);
}

export function getUnique(cid: CardID, options: { foil?: boolean; getCard?: (cid: CardID) => Card } = {}) {
	const uc: UniqueCard = Object.assign(
		{ uniqueID: getNextCardID() },
		options.getCard ? options.getCard(cid) : getCard(cid)
	);
	if (options.foil) uc.foil = options.foil;
	return uc;
}

console.time("Preparing Cards and caches");

export const MTGACards: { [arena_id: ArenaID]: Card } = {}; // Cards sorted by their arena id
export const CardVersionsByName: { [name: string]: Array<CardID> } = {}; // Every card version sorted by their name (first face)

for (const [cid, card] of Cards) {
	const aid = card.arena_id;
	if (aid !== undefined) MTGACards[aid] = card;

	const firstFaceName = card.name.split(" //")[0];
	if (!CardVersionsByName[firstFaceName]) CardVersionsByName[firstFaceName] = [];
	CardVersionsByName[firstFaceName].push(cid);

	Object.freeze(card);
}

Object.freeze(Cards);

// preferred version of each card
export const CardsByName = JSON.parse(fs.readFileSync("./data/CardsByName.json", "utf-8"));

// Cache for cards organized by set.
export const CardsBySet: { [set: string]: Array<CardID> } = { alchemy_dmu: [], planeshifted_snc: [] };
export const BoosterCardsBySet: { [set: string]: Array<CardID> } = { alchemy_dmu: [], planeshifted_snc: [] };
for (const [cid, card] of Cards.entries()) {
	if (card.in_booster || ["und", "j21"].includes(card.set)) {
		// Force cache for Unsanctioned (UND) and Jumpstart: Historic Horizons as they're not originally draft products
		if (!(card.set in BoosterCardsBySet)) BoosterCardsBySet[card.set] = [];
		BoosterCardsBySet[card.set].push(cid);
	}
	if (!(card.set in CardsBySet)) CardsBySet[card.set] = [];
	CardsBySet[card.set].push(cid);

	if (card.set === "ydmu") {
		CardsBySet["alchemy_dmu"].push(cid);
		BoosterCardsBySet["alchemy_dmu"].push(cid);
	}
	// Planeshifted New Capenna
	if (card.set === "snc" && card.in_booster) {
		// Search for a rebalanced version of the card
		const rebalancedName = "A-" + card.name;
		if (rebalancedName in CardsByName && getCard(CardsByName[rebalancedName]).set === "snc") {
			CardsBySet["planeshifted_snc"].push(cid);
			BoosterCardsBySet["planeshifted_snc"].push(CardsByName[rebalancedName]);
		} else {
			CardsBySet["planeshifted_snc"].push(cid);
			BoosterCardsBySet["planeshifted_snc"].push(cid);
		}
	}
}
BoosterCardsBySet["dbl"] = BoosterCardsBySet["mid"].concat(BoosterCardsBySet["vow"]); // Innistrad: Double Feature (All cards from Midnight Hunt and Crimson Vow)
BoosterCardsBySet["ydmu"] = BoosterCardsBySet["dmu"]; // Dominaria United Alchemy
// Shadows over Innistrad with specific Bonus Sheet
BoosterCardsBySet["sir0"] = BoosterCardsBySet["sir"];
BoosterCardsBySet["sir1"] = BoosterCardsBySet["sir"];
BoosterCardsBySet["sir2"] = BoosterCardsBySet["sir"];
BoosterCardsBySet["sir3"] = BoosterCardsBySet["sir"];
// Mystery boosters convention editions with playtest cards
BoosterCardsBySet["mb1_convention_2019"] = BoosterCardsBySet["mb1"].concat(CardsBySet["cmb1"]);
BoosterCardsBySet["mb1_convention_2021"] = BoosterCardsBySet["mb1"].concat(CardsBySet["cmb2"]);

export const MTGACardIDs = [...Cards.keys()].filter((cid) => !!getCard(cid).arena_id);

Object.freeze(MTGACards);
Object.freeze(CardsByName);
Object.freeze(CardVersionsByName);
Object.freeze(BoosterCardsBySet);
Object.freeze(CardsBySet);
Object.freeze(MTGACardIDs);

console.timeEnd("Preparing Cards and caches");

console.timeEnd("Total");
console.groupEnd();

memoryReport();

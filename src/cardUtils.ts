"use strict";

import { CardID, Card, CardPool, getUnique } from "./Cards.js";
import { getRandomMapKey } from "./utils.js";

export function removeCardFromCardPool(cid: CardID, dict: CardPool) {
	if (!dict.has(cid)) {
		console.error(`Called removeCardFromCardPool on a non-existing card (${cid}).`);
		console.trace();
		return;
	}
	dict.set(cid, (dict.get(cid) as number) - 1);
	if (dict.get(cid) == 0) dict.delete(cid);
}

// TODO: Prevent multiples by name?
export function pickCard(dict: CardPool, booster: Array<Card> = []) {
	let c = getRandomMapKey(dict);
	if (booster != undefined) {
		let prevention_attempts = 0; // Fail safe-ish
		while (booster.findIndex(card => c === card.id) !== -1 && prevention_attempts < dict.size) {
			c = getRandomMapKey(dict);
			++prevention_attempts;
		}
	}
	removeCardFromCardPool(c, dict);
	return getUnique(c);
}

export function countCards(dict: CardPool): number {
	let acc = 0;
	for (let v of dict.values()) acc += v;
	return acc;
}

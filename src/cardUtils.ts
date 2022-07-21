"use strict";

import { CardID, Card, CardPool, getUnique } from "./Cards.js";
import { getRandomMapKey, Options, random } from "./utils.js";

export function removeCardFromCardPool(cid: CardID, dict: CardPool) {
	if (!dict.has(cid)) {
		console.error(`Called removeCardFromCardPool on a non-existing card (${cid}).`);
		console.trace();
		return;
	}
	dict.set(cid, (dict.get(cid) as number) - 1);
	if (dict.get(cid) == 0) dict.delete(cid);
}

// Returns a random card from the pool, choosen uniformly across ALL cards (not UNIQUE ones),
// meaning cards present in multiple copies are more likely to be picked.
function getRandomCardFromCardPool(cardPool: CardPool): CardID {
	const idx = random.integer(0, countCards(cardPool) - 1);
	let acc = 0;
	for (let [cid, count] of cardPool) {
		acc += count;
		if (acc > idx) return cid;
	}
	return cardPool.keys().next().value;
}

// TODO: Prevent multiples by name?
export function pickCard(cardPool: CardPool, booster: Array<Card> = [], options: Options = {}) {
	// if uniformAll is false, distribution will be uniform across UNIQUE cards
	// (the probability of picking a card with a given ID is the same for any ID, regardeless of the number of copies)
	// if it is true, distribution will be uniform across ALL cards (for a given card ID, more copies means a higher chance to be picked).
	const randomFunc = options.uniformAll ? getRandomCardFromCardPool : getRandomMapKey;
	let cid = randomFunc(cardPool);
	if (booster) {
		let prevention_attempts = 0; // Fail safe-ish
		while (booster.findIndex((card) => cid === card.id) !== -1 && prevention_attempts < cardPool.size) {
			cid = randomFunc(cardPool);
			++prevention_attempts;
		}
	}
	removeCardFromCardPool(cid, cardPool);
	return getUnique(cid, options);
}

export function countCards(dict: CardPool): number {
	let acc = 0;
	for (let v of dict.values()) acc += v;
	return acc;
}

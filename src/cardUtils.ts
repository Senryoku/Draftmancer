"use strict";

import { CardID, Card, CardPool } from "./CardTypes.js";
import { getUnique } from "./Cards.js";
import { getRandomMapKey, random } from "./utils.js";

export function removeCardFromCardPool(cid: CardID, dict: CardPool) {
	if (!dict.has(cid)) {
		console.error(`Called removeCardFromCardPool on a non-existing card (${cid}).`);
		console.trace();
		throw `Called removeCardFromCardPool on a non-existing card (${cid}).`;
	}
	const newValue = dict.get(cid)! - 1;
	if (newValue > 0) dict.set(cid, newValue);
	else dict.delete(cid);
}

// Returns a random card from the pool, choosen uniformly across ALL cards (not UNIQUE ones),
// meaning cards present in multiple copies are more likely to be picked.
function getRandomCardFromCardPool(cardPool: CardPool): CardID {
	const idx = random.integer(0, countCards(cardPool) - 1);
	let acc = 0;
	for (const [cid, count] of cardPool) {
		acc += count;
		if (acc > idx) return cid;
	}
	return cardPool.keys().next().value;
}

// TODO: Prevent multiples by name?
export function pickCard(
	cardPool: CardPool,
	booster: Array<Card> = [],
	options?: {
		withReplacement?: boolean;
		uniformAll?: boolean;
		foil?: boolean;
		duplicateProtection?: boolean;
		getCard?: (cid: CardID) => Card;
	}
) {
	if (cardPool.size === 0) {
		console.trace(`Called pickCard on an empty card pool.`);
		throw `Called pickCard on an empty card pool.`;
	}
	// if uniformAll is false, distribution will be uniform across UNIQUE cards
	// (the probability of picking a card with a given ID is the same for any ID, regardeless of the number of copies)
	// if it is true, distribution will be uniform across ALL cards (for a given card ID, more copies means a higher chance to be picked).
	const randomFunc = options?.uniformAll ? getRandomCardFromCardPool : getRandomMapKey;
	let cid = randomFunc(cardPool);
	if (booster && options?.duplicateProtection !== false) {
		let prevention_attempts = 0;
		while (booster.findIndex((card) => cid === card.id) !== -1 && prevention_attempts < 3) {
			cid = randomFunc(cardPool);
			++prevention_attempts;
		}
		// Still duplicated, don't rely on random chance anymore. Slow, but should be extremely rare (expect for pathological cases, like a cube with a single card.).
		if (booster.findIndex((card) => cid === card.id) !== -1) {
			const candidates = [...cardPool.keys()].filter(
				(cid) => booster.findIndex((card) => cid === card.id) === -1
			);
			if (candidates.length > 0) {
				const tmpMap = new Map();
				for (const cid of candidates) tmpMap.set(cid, cardPool.get(cid) as number);
				cid = randomFunc(tmpMap);
			}
		}
	}
	if (options?.withReplacement !== true) removeCardFromCardPool(cid, cardPool);
	return getUnique(cid, options);
}

export function countCards(dict: CardPool): number {
	let acc = 0;
	for (const v of dict.values()) acc += v;
	return acc;
}

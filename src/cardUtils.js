"use strict";

import { Cards } from "./Cards.js";
import { getRandomKey } from "./utils.js";

export function removeCardFromDict(cid, dict) {
	dict[cid] -= 1;
	if (dict[cid] == 0) delete dict[cid];
}

// TODO: Prevent multiples by name?
export function pickCard(dict, booster) {
	let c = getRandomKey(dict);
	if (booster != undefined) {
		let prevention_attempts = 0; // Fail safe-ish
		while (booster.indexOf(c) != -1 && prevention_attempts < Object.keys(dict).length) {
			c = getRandomKey(dict);
			++prevention_attempts;
		}
	}
	removeCardFromDict(c, dict);
	return Cards[c];
}

export function countCards(dict) {
	return Object.values(dict).reduce((acc, val) => (acc += val), 0);
}

"use strict";

import { getRandomKey } from "./utils.js";

export function removeCardFromDict(c, dict) {
	/* // Debug
	if (!dict || !c || !Object.keys(dict).includes(c)) {
		console.error(`removeCardFromDict: ${c} not in dictionary! Dict. dump:`);
		console.error(dict);
		return;
	}
	*/
	dict[c] -= 1;
	if (dict[c] == 0) delete dict[c];
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
	return c;
}

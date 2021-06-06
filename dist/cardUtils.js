"use strict";
import { getUnique } from "./Cards.js";
import { getRandomKey } from "./utils.js";
export function removeCardFromDict(cid, dict) {
    if (!dict[cid]) {
        console.error("Called removeCardFromDict on a non-existing card.");
        console.trace();
        return;
    }
    dict[cid] -= 1;
    if (dict[cid] == 0)
        delete dict[cid];
}
// TODO: Prevent multiples by name?
export function pickCard(dict, booster = []) {
    let c = getRandomKey(dict);
    if (booster != undefined) {
        let prevention_attempts = 0; // Fail safe-ish
        while (booster.findIndex(card => c === card.id) !== -1 && prevention_attempts < Object.keys(dict).length) {
            c = getRandomKey(dict);
            ++prevention_attempts;
        }
    }
    removeCardFromDict(c, dict);
    return getUnique(c);
}
export function countCards(dict) {
    return Object.values(dict).reduce((acc, val) => (acc += val), 0);
}

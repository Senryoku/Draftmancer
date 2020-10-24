"use strict";

import fs from "fs";
import parseCost from "./parseCost.js";

console.log("Loading Cards...");
const Cards = JSON.parse(fs.readFileSync("./data/MTGCards.json"));
console.log("Preparing Cards...");
for (let c in Cards) {
	if (!("in_booster" in Cards[c])) Cards[c].in_booster = true;
	Object.assign(Cards[c], parseCost(Cards[c].mana_cost));
}
console.log("Done.");

Object.freeze(Cards);
export default Cards;

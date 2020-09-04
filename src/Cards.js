"use strict";

import fs from "fs";
import parseCost from "./parseCost.js";

const Cards = JSON.parse(fs.readFileSync("client/public/data/MTGACards.json"));
for (let c in Cards) {
	if (!("in_booster" in Cards[c])) Cards[c].in_booster = true;
	Object.assign(Cards[c], parseCost(Cards[c].mana_cost));
}

Object.freeze(Cards);
export default Cards;

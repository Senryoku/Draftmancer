"use strict";

const fs = require("fs");

let Cards = JSON.parse(fs.readFileSync("client/public/data/MTGACards.json"));
for (let c in Cards) {
	if (!("in_booster" in Cards[c])) Cards[c].in_booster = true;
}
Object.freeze(Cards);

module.exports = Cards;

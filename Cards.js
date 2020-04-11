"use strict";

const fs = require("fs");

let Cards = JSON.parse(fs.readFileSync("public/data/MTGACards.json"));
for (const card in Cards.filter(c => !("in_booster" in Cards[c]))) {
	Cards[card].in_booster = true;
}
Object.freeze(Cards);

module.exports = Cards;

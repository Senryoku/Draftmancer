"use strict";

const Cards = require("./Cards");

function Bot(name, id) {
	let colorBonusStartPick = 5;
	this.name = name;
	this.id = id; // Used for sorting
	this.cards = []; // For debugging mostly.
	this.pickedColors = { W: 0, U: 0, R: 0, B: 0, G: 0 };

	let getColorBonus = function (card, colors, pickNumber) {
		let colorBonus = 0;
		if (pickNumber > colorBonusStartPick) {
			for (let color of card.color_identity) {
				colorBonus += 0.35 * colors[color];
			}
		}
		else {
			if (card.color_identity.length == 0) { // early in the draft, slightly prioritize artifacts
				colorBonus += 0.3;
			}
		}
		return colorBonus;
	}


	this.pick = function (booster, pickNumber) {
		let maxScore = 0;
		let bestPick = 0;
		for (let idx = 0; idx < booster.length; ++idx) {
			let c = Cards[booster[idx]];
			// TODO: Rate cards
			let score = c.rating;
			score += getColorBonus(c, this.pickedColors, pickNumber);

			if (score > maxScore) {
				maxScore = score;
				bestPick = idx;
			}
		}
		for (let color of Cards[booster[bestPick]].color_identity) {
			this.pickedColors[color] += 1;
		}
		this.cards.push(booster[bestPick]);
		//console.log(`Bot pick: ${Cards[booster[bestPick]].name} with a score of ` + maxScore);
		//console.log(this);
		return bestPick;
	};
}

module.exports = Bot;

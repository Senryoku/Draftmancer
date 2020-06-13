"use strict";

const Cards = require("./Cards");

function Bot(name, id) {
	this.name = name;
	this.id = id; // Used for sorting
	this.cards = []; // For debugging mostly.
	this.pickedColors = { W: 0, U: 0, R: 0, B: 0, G: 0 };
	this.pick = function (booster) {
		let maxScore = 0;
		let bestPick = 0;
		for (let idx = 0; idx < booster.length; ++idx) {
			let c = Cards[booster[idx]];
			// TODO: Rate cards
			let score = c.rating;
			for (let color of c.color_identity) {
				score += 0.35 * this.pickedColors[color];
			}
			if (score > maxScore) {
				maxScore = score;
				bestPick = idx;
			}
		}
		for (let color of Cards[booster[bestPick]].color_identity) {
			this.pickedColors[color] += 1;
		}
		this.cards.push(booster[bestPick]);
		//console.log(`Bot pick: ${Cards[booster[bestPick]].name}`);
		//console.log(this);
		return bestPick;
	};
	// TODO: Chooses which card to burn.
	this.burn = function (booster) {
		return 0;
	};
}

module.exports = Bot;

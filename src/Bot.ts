"use strict";

import { calculateBotPick } from "mtgdraftbots";

import { Card } from "./Cards";

const basicOracleIds = [
	"56719f6a-1a6c-4c0a-8d21-18f7d7350b68",
	"b2c6aa39-2d2a-459c-a555-fb48ba993373",
	"bc71ebf6-2056-41f7-be35-b2e5c34afa99",
	"b34bb2dc-c1af-4d77-b0b3-a0fb342a5fc6",
	"a3fb7228-e76b-4e96-a40e-20b5fed75685",
];

export default class Bot {
	name: string;
	id: string;
	oracleIds: string[] = [];
	seen: number[] = [];
	picked: number[] = [];
	// This has to be tracked separately since it is used otuside the class.
	cards: Card[] = [];

	constructor(name: string, id: string) {
		this.name = name;
		this.id = id; // Used for sorting
	}

	getBotResult(booster: Card[], boosterNum: number, numBoosters: number, pickNum: number, numPicks: number) {
		const boosterIdxs = booster.map((_, idx) => idx + this.oracleIds.length);
		this.seen.push(...boosterIdxs);
		this.oracleIds.push(...booster.map(({ oracle_id }) => oracle_id));
		const drafterState = {
			basics: [0, 1, 2, 3, 4],
			cardsInPack: booster.map((_, idx) => idx + 5),
			picked: this.cards.map((_, idx) => idx + 5 + booster.length),
			seen: this.seen.map((_, idx) => idx + 5 + booster.length + this.cards.length),
			cardOracleIds: this.oracleIds,
			packNum: boosterNum,
			numPacks: numBoosters,
			pickNum,
			numPicks,
			seed: Math.floor(Math.random() * 65536),
		};
		return calculateBotPick(drafterState);
	}

	async pick(booster: Card[], boosterNum: number, numBoosters: number, pickNum: number, numPicks: number) {
		const result = await this.getBotResult(booster, boosterNum, numBoosters, pickNum, numPicks);
		const bestPick = result.chosenOption;
		// This dedupes the card since we know it is already in the oracleIds array.
		this.picked.push(result.cardsInPack[result.chosenOption]);
		this.cards.push(booster[bestPick]);
		return bestPick;
	}

	async burn(booster: Card[], boosterNum: number, numBoosters: number, pickNum: number, numPicks: number) {
		let worstPick = 0;
		let worstScore = 2;
		const result = await this.getBotResult(booster, boosterNum, numBoosters, pickNum, numPicks);
		for (let i = 0; i < result.scores.length; i++) {
			if (result.scores[i].score < worstScore) {
				worstPick = i;
				worstScore = result.scores[i].score;
			}
		}
		return worstPick;
	}
}

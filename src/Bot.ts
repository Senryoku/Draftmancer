"use strict";

import { calculateBotPick, initializeDraftbots, testRecognized } from "mtgdraftbots";

import { Card, OracleID } from "./Cards";

const DraftbotInitialized = await initializeDraftbots("../data/draftbotparameters.bin");
if (!DraftbotInitialized) console.error("Bot.ts: Error initializing draft bot parameters.");

export async function fallbackToSimpleBots(oracleIds: Array<OracleID>): Promise<boolean> {
	if (!DraftbotInitialized) return true; // Immediatly returns true if mtgdraftbots hasn't been properly initialized.
	// Counts the number of cards recognized by the mtgdraftbots library amoung the supplied array.
	let recognized = (await testRecognized(oracleIds)).filter((x: number) => x > 0).length;
	return recognized / oracleIds.length < 0.8; // Returns true if less than 80% of cards have associated data.
}

export interface IBot {
	name: string;
	id: string;
	cards: Card[];

	pick(booster: Card[], boosterNum: number, numBoosters: number, pickNum: number, numPicks: number): Promise<number>;
	burn(booster: Card[], boosterNum: number, numBoosters: number, pickNum: number, numPicks: number): Promise<number>;
}

// Straightforward implementation of basic bots used as a fallback
export class SimpleBot implements IBot {
	name: string;
	id: string;
	type: string = "SimpleBot";
	cards: Card[] = [];
	pickedColors: { [color: string]: number } = { W: 0, U: 0, R: 0, B: 0, G: 0 };

	constructor(name: string, id: string) {
		this.name = name;
		this.id = id;
	}

	async pick(
		booster: Card[],
		boosterNum: number,
		numBoosters: number,
		pickNum: number,
		numPicks: number
	): Promise<number> {
		let maxScore = 0;
		let bestPick = 0;
		for (let idx = 0; idx < booster.length; ++idx) {
			let c = booster[idx];
			// TODO: Rate cards
			let score = c.rating;
			for (let color of c.colors) {
				score += 0.35 * this.pickedColors[color];
			}
			if (score > maxScore) {
				maxScore = score;
				bestPick = idx;
			}
		}
		for (let color of booster[bestPick].colors) {
			this.pickedColors[color] += 1;
		}
		this.cards.push(booster[bestPick]);
		return bestPick;
	}

	// TODO: Chooses which card to burn.
	async burn(
		booster: Card[],
		boosterNum: number,
		numBoosters: number,
		pickNum: number,
		numPicks: number
	): Promise<number> {
		return 0;
	}
}

const BasicsOracleIds = [
	"56719f6a-1a6c-4c0a-8d21-18f7d7350b68",
	"b2c6aa39-2d2a-459c-a555-fb48ba993373",
	"bc71ebf6-2056-41f7-be35-b2e5c34afa99",
	"b34bb2dc-c1af-4d77-b0b3-a0fb342a5fc6",
	"a3fb7228-e76b-4e96-a40e-20b5fed75685",
];

// Uses the mtgdraftbots library
export class Bot implements IBot {
	name: string;
	id: string;
	type: string = "mtgdraftbots";
	oracleIds: string[] = [];
	seen: number[] = [];
	picked: number[] = [];
	// This has to be tracked separately since it is used otuside the class.
	cards: Card[] = [];

	constructor(name: string, id: string) {
		this.name = name;
		this.id = id; // Used for sorting
		this.oracleIds = [...BasicsOracleIds];
	}

	async getBotResult(booster: Card[], boosterNum: number, numBoosters: number, pickNum: number, numPicks: number) {
		const boosterIdxs = booster.map((_, idx) => idx + this.oracleIds.length);
		this.seen.push(...boosterIdxs);
		this.oracleIds.push(...booster.map(({ oracle_id }) => oracle_id));
		const drafterState = {
			basics: [0, 1, 2, 3, 4],
			cardsInPack: boosterIdxs,
			picked: this.picked,
			seen: this.seen,
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
		this.picked.push(result.cardsInPack[bestPick]);
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

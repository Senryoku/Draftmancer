"use strict";

import axios from "axios";

import { Card, OracleID } from "./Cards";

export async function fallbackToSimpleBots(oracleIds: Array<OracleID>): Promise<boolean> {
	// TODO: Make sure mtgdraftbots API can be reached? And the card pool is recognized?
	return false;
}

export interface IBot {
	name: string;
	id: string;
	cards: Card[];
	lastScores: any; // Keep track of the result of the last call to getScores

	pick(booster: Card[], boosterNum: number, numBoosters: number, pickNum: number, numPicks: number): Promise<number>;
	burn(booster: Card[], boosterNum: number, numBoosters: number, pickNum: number, numPicks: number): Promise<number>;

	getScores(
		booster: Card[],
		boosterNum: number,
		numBoosters: number,
		pickNum: number,
		numPicks: number
	): Promise<any>;

	addCard(card: Card): void;
}

// Straightforward implementation of basic bots used as a fallback
export class SimpleBot implements IBot {
	name: string;
	id: string;
	type: string = "SimpleBot";
	cards: Card[] = [];
	lastScores: any;

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
		let scores = await this.getScores(booster, boosterNum, numBoosters, pickNum, numPicks);
		this.addCard(booster[scores.chosenOption]);
		return scores.chosenOption;
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

	async getScores(booster: Card[], boosterNum: number, numBoosters: number, pickNum: number, numPicks: number) {
		let maxScore = 0;
		let bestPick = 0;
		let scores: { score: number }[] = [];
		for (let idx = 0; idx < booster.length; ++idx) {
			let c = booster[idx];
			let score = c.rating;
			for (let color of c.colors) score += 0.35 * this.pickedColors[color];
			scores.push({ score: score / 10 });
			if (score > maxScore) {
				maxScore = score;
				bestPick = idx;
			}
		}
		this.lastScores = {
			chosenOption: bestPick,
			scores,
		};
		return this.lastScores;
	}

	addCard(card: Card) {
		for (let color of card.colors) ++this.pickedColors[color];
		this.cards.push(card);
	}
}

// Uses the mtgdraftbots API
export class Bot implements IBot {
	name: string;
	id: string;
	type: string = "mtgdraftbots";
	cards: Card[] = [];
	lastScores: any;

	seen: any[] = [];
	picked: string[] = []; // Array of oracleIds

	fallbackBot: SimpleBot | null = null;

	constructor(name: string, id: string) {
		this.name = name;
		this.id = id; // Used for sorting
	}

	async getScores(booster: Card[], boosterNum: number, numBoosters: number, pickNum: number, numPicks: number) {
		const packOracleIds = booster.map((c: Card) => c.oracle_id);
		this.seen.push({ packNum: boosterNum - 1, pickNum, numPicks, pack: packOracleIds });
		const drafterState = {
			basics: [], // FIXME: Should not be necessary anymore.
			cardsInPack: packOracleIds,
			picked: this.picked,
			seen: this.seen,
			packNum: boosterNum - 1,
			numPacks: numBoosters,
			pickNum,
			numPicks,
			seed: Math.floor(Math.random() * 65536),
		};
		try {
			let response = await axios.post("https://mtgml.cubeartisan.net/draft", { drafterState });
			if (response.status == 200 && response.data.success) {
				console.log("MTGDraftBots response: ", response.data);
				let chosenOption = 0;
				for (let i = 1; i < response.data.scores.length; ++i) {
					if (response.data.scores[i] > response.data.scores[chosenOption]) chosenOption = i;
				}
				this.lastScores = {
					chosenOption: chosenOption,
					scores: response.data.scores,
				};
				return this.lastScores;
			} else {
				console.error("Error requesting mtgdraftbots scores, full response:");
				console.error(response);
				return await this.getScoresFallback(booster, boosterNum, numBoosters, pickNum, numPicks);
			}
		} catch (e) {
			console.error("Error requesting mtgdraftbots scores: ", e);
			return await this.getScoresFallback(booster, boosterNum, numBoosters, pickNum, numPicks);
		}
	}

	async getScoresFallback(
		booster: Card[],
		boosterNum: number,
		numBoosters: number,
		pickNum: number,
		numPicks: number
	) {
		if (!this.fallbackBot) {
			this.fallbackBot = new SimpleBot(this.name, this.id);
			for (let card of this.cards) {
				this.fallbackBot.addCard(card);
			}
		}
		this.lastScores = await this.fallbackBot.getScores(booster, boosterNum, numBoosters, pickNum, numPicks);
		return this.lastScores;
	}

	async pick(booster: Card[], boosterNum: number, numBoosters: number, pickNum: number, numPicks: number) {
		const result = await this.getScores(booster, boosterNum, numBoosters, pickNum, numPicks);
		const bestPick = result.chosenOption;
		this.picked.push(booster[bestPick].oracle_id);
		this.cards.push(booster[bestPick]);
		if (this.fallbackBot) this.fallbackBot.addCard(booster[bestPick]);
		return bestPick;
	}

	async burn(booster: Card[], boosterNum: number, numBoosters: number, pickNum: number, numPicks: number) {
		let worstPick = 0;
		let worstScore = 2;
		const result = await this.getScores(booster, boosterNum, numBoosters, pickNum, numPicks);
		for (let i = 0; i < result.scores.length; i++) {
			if (result.scores[i].score < worstScore) {
				worstPick = i;
				worstScore = result.scores[i].score;
			}
		}
		return worstPick;
	}

	addCard(card: Card) {
		this.picked.push(card.id);
		this.cards.push(card);
	}
}

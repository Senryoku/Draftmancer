"use strict";

import axios, { AxiosError } from "axios";
import dotenv from "dotenv";
if (process.env.NODE_ENV !== "production") {
	dotenv.config();
}

import { shuffleArray, weightedRandomIdx } from "./utils.js";
import { Card, OracleID } from "./CardTypes.js";

const MTGDraftBotsAPITimeout = 10000;
const MTGDraftBotsAPIURLs: { url: string; weight: number }[] = [];
async function addMTGDraftBotsInstance(domain: string, authToken: string, weight: number) {
	// Make sure the instance is accessible
	try {
		const response = await axios.get(`${domain}/version`, { timeout: 1000 });
		if (response.status === 200)
			MTGDraftBotsAPIURLs.push({ url: `${domain}/draft?auth_token=${authToken}`, weight: weight });
		else console.error(`MTGDraftBots instance '${domain}' returned an error: ${response.statusText}.`);
	} catch (error: any) {
		if (error.isAxiosError) {
			const e = error as AxiosError;
			console.error(`MTGDraftBots instance '${domain}' could not be reached: ${e.message}.`);
		} else console.error(`MTGDraftBots instance '${domain}' could not be reached: ${error}.`);
	}
}
// Official Instance
if (process.env.MTGDRAFTBOTS_AUTHTOKEN)
	await addMTGDraftBotsInstance(
		"https://mtgml.cubeartisan.net/",
		process.env.MTGDRAFTBOTS_AUTHTOKEN,
		process.env.NODE_ENV === "production" ? 1 : 0 //Do not use in development, unless it's the only instance available
	);
// Allow an alternative instance of the mtgdraftbots server
if (process.env.MTGDRAFTBOTS_ALT_INSTANCE)
	await addMTGDraftBotsInstance(
		process.env.MTGDRAFTBOTS_ALT_INSTANCE,
		process.env.MTGDRAFTBOTS_ALT_INSTANCE_AUTHTOKEN ?? "testing",
		1
	);

// Returns a random instance of the mtgdraftbots server for each request (load balancing the stupid way :D).
const MTGDraftBotsAPIURLsTotalWeight = MTGDraftBotsAPIURLs.reduce((acc, curr) => acc + curr.weight, 0);
function getMTGDraftBotsURL(): string {
	return MTGDraftBotsAPIURLs[weightedRandomIdx(MTGDraftBotsAPIURLs, MTGDraftBotsAPIURLsTotalWeight)].url;
}

export async function fallbackToSimpleBots(oracleIds: Array<OracleID>): Promise<boolean> {
	// No mtgdraftbots servers available
	if (MTGDraftBotsAPIURLs.length === 0) return true;

	// Querying the mtgdraftbots API is too slow for the test suite, always fallback to simple bots while testing. FIXME: This feels hackish.
	// FORCE_MTGDRAFTBOTS will force them on for specific tests.
	if (typeof (global as any).it === "function" && !(global as any).FORCE_MTGDRAFTBOTS) return true;

	// Send a dummy request to make sure the API is up and running that most cards in oracleIds are recognized.

	// The API will only return a maximum of 16 non-zero scores, so instead of sending oracleIds.length / 16 requests to check all cards,
	// we'll just take a random sample (of 15 cards, just because) and test these.
	let chosenOracleIds = [...oracleIds];
	shuffleArray(chosenOracleIds);
	chosenOracleIds = oracleIds.slice(0, 15);

	const drafterState = {
		basics: [], // FIXME: Should not be necessary anymore.
		cardsInPack: chosenOracleIds,
		picked: [],
		seen: [{ packNum: 0, pickNum: 0, numPicks: 1, pack: chosenOracleIds }],
		packNum: 0,
		numPacks: 1,
		pickNum: 0,
		numPicks: chosenOracleIds.length,
		seed: Math.floor(Math.random() * 65536),
	};
	try {
		const response = await axios.post(getMTGDraftBotsURL(), { drafterState }, { timeout: MTGDraftBotsAPITimeout });
		if (
			response.status !== 200 ||
			!response.data.success ||
			response.data.scores.filter((s: number) => s === 0).length > 0.8 * response.data.scores.length // A score of 0 means the card was not recognized (probably :)).
		) {
			return true;
		}
	} catch (e: any) {
		if (e.code == "ECONNABORTED") console.warn("ECONNABORTED requesting mtgdraftbots scores: ", e.message);
		else console.error("Error requesting testing the mtgdraftbots API: ", e);
		return true;
	}

	return false;
}

export type BotScores = { chosenOption: number; scores: number[] };

export interface IBot {
	name: string;
	id: string;
	cards: Card[];
	type: string;
	lastScores: BotScores; // Keep track of the result of the last call to getScores

	pick(booster: Card[], boosterNum: number, numBoosters: number, pickNum: number, numPicks: number): Promise<number>;
	burn(booster: Card[], boosterNum: number, numBoosters: number, pickNum: number, numPicks: number): Promise<number>;

	getScores(
		booster: Card[],
		boosterNum: number,
		numBoosters: number,
		pickNum: number,
		numPicks: number
	): Promise<BotScores>;

	addCard(card: Card): void;
}

// Straightforward implementation of basic bots used as a fallback
export class SimpleBot implements IBot {
	name: string;
	id: string;
	type: string = "SimpleBot";
	cards: Card[] = [];
	lastScores: BotScores = { chosenOption: 0, scores: [] };

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
		const scores = await this.getScores(booster, boosterNum, numBoosters, pickNum, numPicks);
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
		const scores: number[] = [];
		for (let idx = 0; idx < booster.length; ++idx) {
			const c = booster[idx];
			let score = c.rating;
			for (const color of c.colors) score += 0.35 * this.pickedColors[color];
			scores.push(score / 10);
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
		for (const color of card.colors) ++this.pickedColors[color];
		this.cards.push(card);
	}
}

// Uses the mtgdraftbots API
export class Bot implements IBot {
	name: string;
	id: string;
	type: string = "mtgdraftbots";
	cards: Card[] = [];
	lastScores: BotScores = { chosenOption: 0, scores: [] };

	seen: { packNum: number; pickNum: number; numPicks: number; pack: OracleID[] }[] = [];
	picked: OracleID[] = []; // Array of oracleIds

	fallbackBot: SimpleBot | null = null;

	constructor(name: string, id: string) {
		this.name = name;
		this.id = id;
	}

	async getScores(booster: Card[], boosterNum: number, numBoosters: number, pickNum: number, numPicks: number) {
		const packOracleIds: OracleID[] = booster.map((c: Card) => c.oracle_id);
		this.seen.push({ packNum: boosterNum, pickNum, numPicks, pack: packOracleIds });
		const drafterState = {
			basics: [], // FIXME: Should not be necessary anymore.
			cardsInPack: packOracleIds,
			picked: this.picked,
			seen: this.seen,
			packNum: boosterNum,
			numPacks: numBoosters,
			pickNum,
			numPicks,
			seed: Math.floor(Math.random() * 65536),
		};
		try {
			const response = await axios.post(
				getMTGDraftBotsURL(),
				{ drafterState },
				{ timeout: MTGDraftBotsAPITimeout }
			);
			if (response.status == 200 && response.data.success) {
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
		} catch (e: any) {
			if (e.code == "ECONNABORTED")
				console.warn(`ECONNABORTED requesting mtgdraftbots scores (${e.url}): `, e.message);
			else console.error(`Error requesting mtgdraftbots scores: (${e.url})`, e.message);
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
			for (const card of this.cards) this.fallbackBot.addCard(card);
		}
		this.lastScores = await this.fallbackBot.getScores(booster, boosterNum, numBoosters, pickNum, numPicks);
		return this.lastScores;
	}

	async pick(booster: Card[], boosterNum: number, numBoosters: number, pickNum: number, numPicks: number) {
		const result = await this.getScores(booster, boosterNum, numBoosters, pickNum, numPicks);
		const bestPick = result.chosenOption;
		this.picked.push(booster[bestPick].oracle_id);
		this.cards.push(booster[bestPick]);
		this.fallbackBot?.addCard(booster[bestPick]);
		return bestPick;
	}

	async burn(booster: Card[], boosterNum: number, numBoosters: number, pickNum: number, numPicks: number) {
		let worstPick = 0;
		let worstScore = 2;
		const result = await this.getScores(booster, boosterNum, numBoosters, pickNum, numPicks);
		for (let i = 0; i < result.scores.length; i++) {
			if (result.scores[i] < worstScore) {
				worstPick = i;
				worstScore = result.scores[i];
			}
		}
		return worstPick;
	}

	addCard(card: Card) {
		this.picked.push(card.oracle_id);
		this.cards.push(card);
		this.fallbackBot?.addCard(card);
	}
}

export function isBot(obj: any): obj is IBot {
	return obj instanceof Bot || obj instanceof SimpleBot;
}

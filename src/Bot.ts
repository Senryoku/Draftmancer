/* eslint-disable @typescript-eslint/no-unused-vars */
import axios, { AxiosError } from "axios";

import { arrayIntersect, random } from "./utils.js";
import { Card, OracleID } from "./CardTypes.js";
import { isArrayOf, isNumber } from "./TypeChecks.js";

import { MTGDraftBotParameters, RequestParameters } from "./bots/ExternalBotInterface.js";
import { DraftmancerAI, getScores as draftmancerAIGetScores } from "./bots/DraftmancerAI.js";
import { MTGDraftBotsAPI, getScores as MTGDraftBotsAPIGetScores } from "./bots/MTGDraftBots.js";
import { CubeCobraBots, getScores as cubeCobraGetScores } from "./bots/CubeCobraBots.js";

export function fallbackToSimpleBots(customCards: boolean, oracleIds: Array<OracleID>, wantedModel: string): boolean {
	// No bot servers available
	if (!MTGDraftBotsAPI.available && !DraftmancerAI.available && !CubeCobraBots.available) return true;

	// No external bot handles custom cards, unless they all have associated oracle IDs
	if (customCards && Object.values(customCards).some((card) => !card.oracle_id)) return true;

	// Querying the mtgdraftbots API is too slow for the test suite, always fallback to simple bots while testing. FIXME: This feels hackish.
	// FORCE_BOTS_EXTERNAL_API will force them on for specific tests.
	if (
		typeof (global as { it?: unknown }).it === "function" && // Check for the presence of mocha's 'it' function.
		!(global as { FORCE_BOTS_EXTERNAL_API?: boolean }).FORCE_BOTS_EXTERNAL_API
	)
		return true;

	// In order of preference:
	//  - MTGDraftBots set model
	//  - DraftmancerAI set model
	//  - Cube Cobra bots
	//  - MTGDraftBots prod model
	//  - Fallback to simple bots

	if (wantedModel && wantedModel !== "prod") {
		if (MTGDraftBotsAPI.available && MTGDraftBotsAPI.models.includes(wantedModel)) return false;
		if (DraftmancerAI.available && DraftmancerAI.models.includes(wantedModel)) return false;
	}

	if (
		CubeCobraBots.available
		// && !Constants.PrimarySets.slice(0, Constants.PrimarySets.indexOf("dft") + 1).includes(wantedModel)
	)
		return false;

	if (MTGDraftBotsAPI.available) {
		// At this point only the MTGDraftBots prod model is suitable, make sure it knows most of the requested cards.
		const intersection = arrayIntersect([oracleIds, MTGDraftBotsAPI.modelKnownOracles["prod"] ?? []]);
		if (intersection.length / oracleIds.length >= 0.8) return false;
	}

	return true;
}

export interface IBot {
	name: string;
	id: string;
	cards: Card[];
	type: string;
	lastScores: BotScores; // Keep track of the result of the last call to getScores

	pick(booster: Card[], boosterNum: number, numBoosters: number, pickNum: number, numPicks: number): Promise<number>;
	burn(booster: Card[], boosterNum: number, numBoosters: number, pickNum: number, numPicks: number): Promise<number>;

	// Add a card to the bot's pool, while maintaining its state of the draft if necessary.
	forcePick(
		index: number,
		booster: Card[],
		boosterNum: number,
		numBoosters: number,
		pickNum: number,
		numPicks: number
	): void;

	getScores(
		booster: Card[],
		boosterNum: number,
		numBoosters: number,
		pickNum: number,
		numPicks: number
	): Promise<BotScores>;

	// Add a card to the bot's pool without context. Don't use this outside of bot implementations, see forcePick.
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
		const scores = booster.map((c) => {
			let score = c.rating;
			for (const color of c.colors) score += 0.35 * (this.pickedColors[color] ?? 0);
			return score;
		});
		const max = Math.max(...scores);
		const candidates = scores
			.map((s, i) => {
				return { score: s, index: i };
			})
			.filter((entry) => entry.score === max);
		this.lastScores = {
			chosenOption: random.pick(candidates).index,
			scores,
		};
		return this.lastScores;
	}

	addCard(card: Card) {
		for (const color of card.colors)
			if (this.pickedColors[color]) {
				++this.pickedColors[color];
			} else {
				this.pickedColors[color] = 1;
			}
		this.cards.push(card);
	}

	forcePick(
		index: number,
		booster: Card[],
		boosterNum: number,
		numBoosters: number,
		pickNum: number,
		numPicks: number
	) {
		this.addCard(booster[index]);
	}
}

// Select an appropriate external bot API, calls it, and returns the result
async function getScores(parameters: MTGDraftBotParameters, request: RequestParameters): Promise<number[]> {
	// DraftmancerAI set model if available.
	if (DraftmancerAI.available && DraftmancerAI.models.includes(parameters.wantedModel))
		return draftmancerAIGetScores(parameters.wantedModel, request);

	// Otherwise, try Cube Cobra bots
	if (CubeCobraBots.available) return cubeCobraGetScores(request);

	// Lastly, CubeArtisan bots (prod model)
	let model = parameters.wantedModel;
	if (!MTGDraftBotsAPI.models.includes(model)) model = "prod";
	return MTGDraftBotsAPIGetScores(request);
}

export type BotScores = { chosenOption: number; scores: number[] };

// Uses one of the external bot API
export class Bot implements IBot {
	name: string;
	id: string;
	type: string = "mtgdraftbots"; // Now just means "External Bot", kept for backwards compatibility.
	parameters: MTGDraftBotParameters;
	cards: Card[] = [];
	lastScores: BotScores = { chosenOption: 0, scores: [] };

	seen: { packNum: number; pickNum: number; numPicks: number; pack: OracleID[] }[] = [];
	picked: OracleID[] = [];

	fallbackBot: SimpleBot | null = null;

	constructor(name: string, id: string, parameters: MTGDraftBotParameters = { wantedModel: "prod" }) {
		this.name = name;
		this.id = id;
		this.parameters = parameters;
	}

	async getScores(_booster: Card[], boosterNum: number, numBoosters: number, pickNum: number, numPicks: number) {
		const booster = [..._booster];
		const packOracleIds: OracleID[] = booster.map((c: Card) => c.oracle_id);
		// getScores might be called multiple times for the same booster (multiple picks). Only add to the seen list once.
		if (
			this.seen.length === 0 ||
			this.seen[this.seen.length - 1].packNum !== boosterNum ||
			this.seen[this.seen.length - 1].pickNum !== pickNum
		)
			this.seen.push({ packNum: boosterNum, pickNum, numPicks, pack: packOracleIds });

		const baseRatings: number[] = booster.map((c: Card) => c.rating);
		try {
			const scores = await getScores(this.parameters, {
				pack: packOracleIds,
				picked: this.picked,
				seen: this.seen,
				packNum: boosterNum,
				numPacks: numBoosters,
				pickNum,
				numPicks,
			});

			if (!isArrayOf(isNumber)(scores)) throw Error("Unexpected type for scores in bot response.");
			if (scores.length === 0) throw Error("Empty scores in bot response.");
			if (scores.length !== booster.length)
				console.warn(
					`Warning: bots returned an incorrect number of scores (expected ${booster.length}, got ${scores.length})`
				);

			let chosenOption = 0;
			for (let i = 0; i < Math.min(scores.length, booster.length); ++i) {
				// Non-recognized cards will return a score of 0; Use the card rating as fallback if available (mostly useful for custom cards).
				if (scores[i] === 0 && baseRatings[i]) scores[i] = 1.5 + (7.0 / 5.0) * baseRatings[i]; // Remap 0-5 to 1.5-8.5, totally arbitrary and only there to avoid bots completely ignoring custom cards.

				if (scores[i] > scores[chosenOption]) chosenOption = i;
			}
			this.lastScores = { chosenOption, scores };
			return this.lastScores;
		} catch (e) {
			if (e instanceof AxiosError) {
				console.error(`Error requesting bots scores: (${e.status ?? "No status code"}) ${e.message}.`);
			} else {
				console.error("Error requesting bots scores:", e);
			}
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
		if (!(this.fallbackBot instanceof SimpleBot)) {
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
		return 0;
	}

	forcePick(
		index: number,
		booster: Card[],
		boosterNum: number,
		numBoosters: number,
		pickNum: number,
		numPicks: number
	) {
		this.addCard(booster[index]);
		if (
			this.seen.length === 0 ||
			this.seen[this.seen.length - 1].packNum !== boosterNum ||
			this.seen[this.seen.length - 1].pickNum !== pickNum
		) {
			const packOracleIds: OracleID[] = booster.map((c: Card) => c.oracle_id);
			this.seen.push({ packNum: boosterNum, pickNum, numPicks, pack: packOracleIds });
		}
	}

	addCard(card: Card) {
		this.picked.push(card.oracle_id);
		this.cards.push(card);
		this.fallbackBot?.addCard(card);
	}
}

export function isBot(obj: unknown): obj is IBot {
	return obj instanceof Bot || obj instanceof SimpleBot;
}

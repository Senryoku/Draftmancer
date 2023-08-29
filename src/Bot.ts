"use strict";

import axios, { AxiosError } from "axios";
import dotenv from "dotenv";
if (process.env.NODE_ENV !== "production") {
	dotenv.config();
}

import { shuffleArray, weightedRandomIdx } from "./utils.js";
import { Card, OracleID } from "./CardTypes.js";
import { isArrayOf, isNumber } from "./TypeChecks.js";

const MTGDraftBotsAPITimeout = 10000;
const MTGDraftBotsAPIURLs: { url: string; weight: number }[] = [];
async function addMTGDraftBotsInstance(domain: string, authToken: string, weight: number) {
	// Make sure the instance is accessible
	try {
		const response = await axios.get(`${domain}/version`, { timeout: 5000 });
		if (response.status === 200) {
			MTGDraftBotsAPIURLs.push({ url: `${domain}/draft?auth_token=${authToken}`, weight: weight });
			console.log(`[+] MTGDraftBots instance '${domain}' added.`);
		} else console.error(`MTGDraftBots instance '${domain}' returned an error: ${response.statusText}.`);
	} catch (error: any) {
		if (error.isAxiosError) {
			const e = error as AxiosError;
			console.error(`MTGDraftBots instance '${domain}' could not be reached: ${e.message}.`);
		} else console.error(`MTGDraftBots instance '${domain}' could not be reached: ${error}.`);
	}
}

// Official Instance
if (process.env.MTGDRAFTBOTS_AUTHTOKEN)
	addMTGDraftBotsInstance(
		"https://mtgml.cubeartisan.net/",
		process.env.MTGDRAFTBOTS_AUTHTOKEN,
		process.env.NODE_ENV === "production" ? 1 : 0 // Do not use in development, unless it's the only instance available
	);

const MTGDraftBotsSetSpecializedModels = [
	"neo",
	"snc",
	"dmu",
	"bro",
	"one",
	"sir",
	//  "mom", // Disabled as it's unstable right now.
	"ltr",
];

export type MTGDraftBotParameters = {
	wantedModel: string;
};

const DraftmancerAI = {
	available: false,
	domain: process.env.DRAFTMANCER_AI_DOMAIN ?? "http://127.0.0.1:8080/",
	authToken: process.env.DRAFTMANCER_AI_AUTH_TOKEN ?? "testing",
	models: [] as string[],
};
// Check if DraftmancerAI server is online and update the list of available models
function checkDraftmancerAIAvailability() {
	axios
		.get(`${DraftmancerAI.domain}/version`, { timeout: 5000 })
		.then((response) => {
			if (response.status === 200) {
				DraftmancerAI.available = true;
				DraftmancerAI.models = response.data.models;
				console.log(`[+] DraftmancerAI instance '${DraftmancerAI.domain}' added.`);
				console.log(`    Available models: ${DraftmancerAI.models}`);
			} else {
				DraftmancerAI.available = false;
				console.error(
					`DraftmancerAI instance '${DraftmancerAI.domain}' returned an error: ${response.statusText}.`
				);
			}
		})
		.catch((error) => {
			DraftmancerAI.available = false;
			if (error.isAxiosError) {
				const e = error as AxiosError;
				console.error(`DraftmancerAI instance '${DraftmancerAI.domain}' could not be reached: ${e.message}.`);
			} else console.error(`DraftmancerAI instance '${DraftmancerAI.domain}' could not be reached: ${error}.`);
		});
}
checkDraftmancerAIAvailability();
// Verify every 30 minutes (for availability and potential new models)
setInterval(checkDraftmancerAIAvailability, 30 * 60 * 1000);

const MTGDraftBotsAPIURLsTotalWeight = MTGDraftBotsAPIURLs.reduce((acc, curr) => acc + curr.weight, 0);
function getMTGDraftBotsURL(parameters: MTGDraftBotParameters): string {
	if (
		DraftmancerAI.available &&
		DraftmancerAI.models.includes(parameters.wantedModel) &&
		(MTGDraftBotsAPIURLs.length === 0 || !MTGDraftBotsSetSpecializedModels.includes(parameters.wantedModel)) // Prefer MTGDraftBots set model if available.
	)
		return `${DraftmancerAI.domain}/draft?auth_token=${DraftmancerAI.authToken}&model_type=${parameters.wantedModel}`;

	let model = parameters.wantedModel;
	if (!MTGDraftBotsSetSpecializedModels.includes(model)) model = "prod";

	// Returns a random instance of the mtgdraftbots server for each request (load balancing the stupid way :D).
	return `${
		MTGDraftBotsAPIURLs[weightedRandomIdx(MTGDraftBotsAPIURLs, MTGDraftBotsAPIURLsTotalWeight)].url
	}&model_type=${model}`;
}

export async function fallbackToSimpleBots(oracleIds: Array<OracleID>, wantedModel?: string): Promise<boolean> {
	// No bot servers available
	if (MTGDraftBotsAPIURLs.length === 0 && !DraftmancerAI.available) return true;

	// Querying the mtgdraftbots API is too slow for the test suite, always fallback to simple bots while testing. FIXME: This feels hackish.
	// FORCE_MTGDRAFTBOTS will force them on for specific tests.
	if (typeof (global as any).it === "function" && !(global as any).FORCE_MTGDRAFTBOTS) return true;

	// In order of preference:
	//  - MTGDraftBots set model
	//  - DraftmancerAI set model
	//  - MTGDraftBots prod model
	//  - Fallback to simple bots

	if (wantedModel) {
		if (MTGDraftBotsAPIURLs.length > 0 && MTGDraftBotsSetSpecializedModels.includes(wantedModel)) return false;
		if (DraftmancerAI.available && DraftmancerAI.models.includes(wantedModel)) return false;
	}

	if (MTGDraftBotsAPIURLs.length === 0) return true;

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
		const response = await axios.post(
			getMTGDraftBotsURL({ wantedModel: "prod" }),
			{ drafterState },
			{ timeout: MTGDraftBotsAPITimeout }
		);
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
		let maxScore = 0;
		let bestPick = 0;
		const scores: number[] = [];
		for (let idx = 0; idx < booster.length; ++idx) {
			const c = booster[idx];
			let score = c.rating;
			for (const color of c.colors) score += 0.35 * this.pickedColors[color];
			scores.push(score);
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

// Uses the mtgdraftbots API
export class Bot implements IBot {
	name: string;
	id: string;
	type: string = "mtgdraftbots";
	parameters: MTGDraftBotParameters;
	cards: Card[] = [];
	lastScores: BotScores = { chosenOption: 0, scores: [] };

	seen: { packNum: number; pickNum: number; numPicks: number; pack: OracleID[] }[] = [];
	picked: OracleID[] = []; // Array of oracleIds

	fallbackBot: SimpleBot | null = null;

	constructor(name: string, id: string, parameters: MTGDraftBotParameters = { wantedModel: "prod" }) {
		this.name = name;
		this.id = id;
		this.parameters = parameters;
	}

	async getScores(booster: Card[], boosterNum: number, numBoosters: number, pickNum: number, numPicks: number) {
		const packOracleIds: OracleID[] = booster.map((c: Card) => c.oracle_id);
		// getScores might be called multiple times for the same booster (multiple picks). Only add to the seen list once.
		if (
			this.seen.length === 0 ||
			this.seen[this.seen.length - 1].packNum !== boosterNum ||
			this.seen[this.seen.length - 1].pickNum !== pickNum
		)
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
		const baseRatings: number[] = booster.map((c: Card) => c.rating);
		try {
			const response = await axios.post(
				getMTGDraftBotsURL(this.parameters),
				{ drafterState },
				{ timeout: MTGDraftBotsAPITimeout }
			);
			if (response.status === 200 && response.data.success) {
				const scores = response.data.scores;
				if (!isArrayOf(isNumber)(scores)) throw Error("Unexpected type for scores in mtgdraftbots response.");
				if (scores.length === 0) throw Error("Empty scores in mtgdraftbots response.");
				if (scores.length !== booster.length)
					console.warn(
						`Warning (Bot.getScores): mtgdraftbots returned an incorrect number of scores (expected ${booster.length}, got ${response.data.scores.length})`
					);
				let chosenOption = 0;
				for (let i = 0; i < Math.min(scores.length, booster.length); ++i) {
					// Non-recognized cards will return a score of 0; Use the card rating as fallback if available (mostly useful for custom cards).
					if (scores[i] === 0 && baseRatings[i]) scores[i] = 1.5 + (7.0 / 5.0) * baseRatings[i]; // Remap 0-5 to 1.5-8.5, totally arbitrary and only there to avoid bots completely ignoring custom cards.

					if (scores[i] > scores[chosenOption]) chosenOption = i;
				}
				this.lastScores = { chosenOption, scores };
				return this.lastScores;
			} else {
				console.error("Error requesting mtgdraftbots scores, full response:");
				console.error(response);
				return await this.getScoresFallback(booster, boosterNum, numBoosters, pickNum, numPicks);
			}
		} catch (e) {
			if (axios.isAxiosError(e)) {
				console.error(
					`Error '${e.code}' requesting mtgdraftbots scores (url: '${e.response?.config?.url
						?.replaceAll(process.env.MTGDRAFTBOTS_AUTHTOKEN ?? "testing", "xxx")
						.replaceAll(DraftmancerAI.authToken, "xxx")}):`,
					e.message
				);
			} else {
				console.error("Non-axios error requesting mtgdraftbots scores:", e);
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

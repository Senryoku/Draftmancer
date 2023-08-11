"use strict";

import axios, { AxiosError } from "axios";
import dotenv from "dotenv";
if (process.env.NODE_ENV !== "production") {
	dotenv.config();
}

import { shuffleArray, weightedRandomIdx } from "./utils.js";
import { Card, DeckList, OracleID } from "./CardTypes.js";
import { isArrayOf, isNumber } from "./TypeChecks.js";
import { computeHashes } from "./DeckHashes.js";
import { InTesting } from "./Context.js";
import { getCard } from "./Cards.js";

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
/* Temporarily disabled while we get the update working on ARM.
// Allow an alternative instance of the mtgdraftbots server
if (process.env.MTGDRAFTBOTS_ALT_INSTANCE)
	addMTGDraftBotsInstance(
		process.env.MTGDRAFTBOTS_ALT_INSTANCE,
		process.env.MTGDRAFTBOTS_ALT_INSTANCE_AUTHTOKEN ?? "testing",
		1
	);
*/

export enum MTGDraftBotsSetSpecializedModels {
	neo = "neo",
	snc = "snc",
	dmu = "dmu",
	bro = "bro",
	one = "one",
	sir = "sir",
	mom = "mom",
	ltr = "ltr",
}

export type MTGDraftBotParameters = {
	model_type: "prod" | MTGDraftBotsSetSpecializedModels;
};

// Returns a random instance of the mtgdraftbots server for each request (load balancing the stupid way :D).
const MTGDraftBotsAPIURLsTotalWeight = MTGDraftBotsAPIURLs.reduce((acc, curr) => acc + curr.weight, 0);
function getMTGDraftBotsURL(parameters: MTGDraftBotParameters): string {
	return (
		MTGDraftBotsAPIURLs[weightedRandomIdx(MTGDraftBotsAPIURLs, MTGDraftBotsAPIURLsTotalWeight)].url +
		`&model_type=${parameters.model_type}`
	);
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
		const response = await axios.post(
			getMTGDraftBotsURL({ model_type: "prod" }),
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

	constructor(name: string, id: string, parameters: MTGDraftBotParameters = { model_type: "prod" }) {
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
		} catch (e: any) {
			if (e.code === "ECONNABORTED")
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

export async function requestDeckbuilding(cardPool: Card[]): Promise<DeckList | null> {
	if (!process.env.MTGDRAFTBOTS_AUTHTOKEN) return null;
	if (InTesting) return null;

	const basics = [
		"56719f6a-1a6c-4c0a-8d21-18f7d7350b68", // Swamp
		"b2c6aa39-2d2a-459c-a555-fb48ba993373", // Island
		"bc71ebf6-2056-41f7-be35-b2e5c34afa99", // Plains
		"b34bb2dc-c1af-4d77-b0b3-a0fb342a5fc6", // Forest
		"a3fb7228-e76b-4e96-a40e-20b5fed75685", // Mountain
	];
	try {
		const postData = {
			deckState: { pool: cardPool.map((c) => c.oracle_id), basics: basics },
		};
		const r = await axios.post(
			`https://mtgml.cubeartisan.net/deck?auth_token=${process.env.MTGDRAFTBOTS_AUTHTOKEN}`,
			postData
		);
		// TEMP Debug (TODO: REMOVE)
		console.log("Request: ", postData);
		console.log("Response: ", r.data);
		console.log(cardPool.map((c) => c.oracle_id));
		/*
		console.log(
			r.data.main
				.map((t: [string, number]) => t[0])
				.filter((oid: string) => !basics.includes(oid))
				.map((oid: string) => [oid, cardPool.find((c) => c.oracle_id === oid)])
		);
		console.log(
			r.data.side
				.map((t: [string, number]) => t[0])
				.filter((oid: string) => !basics.includes(oid))
				.map((oid: string) => [oid, cardPool.find((c) => c.oracle_id === oid)])
		);
		*/
		if (r.status === 200 && r.data) {
			const basicLands = r.data.main
				.map((t: [string, number]) => t[0])
				.filter((oid: string) => basics.includes(oid));
			const landCounts = {
				W: basicLands.filter((oid: string) => oid === "bc71ebf6-2056-41f7-be35-b2e5c34afa99").length,
				U: basicLands.filter((oid: string) => oid === "b2c6aa39-2d2a-459c-a555-fb48ba993373").length,
				B: basicLands.filter((oid: string) => oid === "56719f6a-1a6c-4c0a-8d21-18f7d7350b68").length,
				R: basicLands.filter((oid: string) => oid === "a3fb7228-e76b-4e96-a40e-20b5fed75685").length,
				G: basicLands.filter((oid: string) => oid === "b34bb2dc-c1af-4d77-b0b3-a0fb342a5fc6").length,
			};
			const decklist: DeckList = {
				main: r.data.main
					.map((t: [string, number]) => t[0])
					.filter((oid: string) => !basics.includes(oid))
					.map((oid: string) => cardPool.find((c) => c.oracle_id === oid))
					.filter((c: Card) => c !== undefined)
					.map((c: Card) => c.id),
				side: r.data.side
					.map((t: [string, number]) => t[0])
					.filter((oid: string) => !basics.includes(oid))
					.map((oid: string) => cardPool.find((c) => c.oracle_id === oid))
					.filter((c: Card) => c !== undefined)
					.map((c: Card) => c.id),
				lands: landCounts,
			};
			computeHashes(decklist, { getCard: getCard });
			return decklist;
		} else return null;
	} catch (e) {
		console.error(e);
		return null;
	}
}

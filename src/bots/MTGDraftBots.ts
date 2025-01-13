import axios, { AxiosError } from "axios";
import { OracleID } from "../CardTypes.js";
import { RequestParameters } from "./ExternalBotInterface.js";
import { isArrayOf, isNumber, isString } from "../TypeChecks.js";

// Cube Artisan Draft Bots

const MTGDraftBotsAPITimeout = 10000;
export const MTGDraftBotsAPI = {
	available: false,
	domain: process.env.MTGDRAFTBOTS_API_DOMAIN ?? "https://mtgml.cubeartisan.net/",
	authToken: process.env.MTGDRAFTBOTS_AUTHTOKEN,
	models: [] as string[],
	modelKnownOracles: {} as Record<string, OracleID[]>,
};

async function checkMTGDraftBotsAPIAvailability() {
	// Make sure the instance is accessible
	try {
		const response = await axios.get(`${MTGDraftBotsAPI.domain}/version`, { timeout: 5000 });
		if (response.status === 200) {
			const models = isArrayOf(isString)(response.data.models) ? response.data.models : [];
			const modelKnownOracles: Record<string, OracleID[]> = {};
			// Requesting supported cards for each model (only really used for the prod model right now).
			for (const model of models) {
				const oracles = await axios.get(
					`${MTGDraftBotsAPI.domain}/oracle-ids?auth_token=${MTGDraftBotsAPI.authToken}&model_type=${model}`,
					{ timeout: 2000 }
				);
				if (isArrayOf(isString)(oracles.data.oracleIds)) {
					// Many MDFCs have a "-2" appended to their oracle IDs, chop it off.
					oracles.data.oracleIds = oracles.data.oracleIds.map((s: string) =>
						s.endsWith("-2") ? s.slice(0, -2) : s
					);
					modelKnownOracles[model] = oracles.data.oracleIds;
				}
			}
			MTGDraftBotsAPI.available = true;
			MTGDraftBotsAPI.models = models;
			MTGDraftBotsAPI.modelKnownOracles = modelKnownOracles;
			console.log(`[+] MTGDraftBots instance '${MTGDraftBotsAPI.domain}' added.`);
			const modelList = models
				.map((m: string) => `${m}${modelKnownOracles[m] ? ` (${modelKnownOracles[m].length})` : ""}`)
				.join(", ");
			console.log(`    Available models (${models.length}): ${modelList}`);
		} else {
			MTGDraftBotsAPI.available = false;
			console.error(
				`MTGDraftBots instance '${MTGDraftBotsAPI.domain}' returned an error: ${response.statusText}.`
			);
		}
	} catch (error: unknown) {
		MTGDraftBotsAPI.available = false;
		if (error instanceof AxiosError) {
			const e = error;
			console.error(`MTGDraftBots instance '${MTGDraftBotsAPI.domain}' could not be reached: ${e.message}.`);
		} else console.error(`MTGDraftBots instance '${MTGDraftBotsAPI.domain}' could not be reached: ${error}.`);
	}
}

if (MTGDraftBotsAPI.authToken) {
	checkMTGDraftBotsAPIAvailability();
	setInterval(checkMTGDraftBotsAPIAvailability, 30 * 60 * 1000);
} else console.warn("MTGDraftBots API token not set.");

interface DrafterState {
	basics: string[];
	cardsInPack: string[];
	picked: string[];
	seen: { packNum: number; pickNum: number; numPicks: number; pack: string[] }[];
	packNum: number;
	numPacks: number;
	pickNum: number;
	numPicks: number;
	seed: number;
}

export async function getScores(params: RequestParameters): Promise<number[]> {
	const drafterState: DrafterState = {
		basics: [], // FIXME: Should not be necessary anymore.
		cardsInPack: params.pack,
		picked: params.picked,
		seen: params.seen,
		packNum: params.packNum,
		numPacks: params.numPacks,
		pickNum: params.pickNum,
		numPicks: params.numPicks,
		seed: Math.floor(Math.random() * 65536),
	};

	const response = await axios.post(
		`${MTGDraftBotsAPI.domain}/draft?auth_token=${MTGDraftBotsAPI.authToken}&model_type=prod`,
		{ drafterState },
		{ timeout: MTGDraftBotsAPITimeout }
	);
	if (response.status === 200 && response.data.success) {
		const scores = response.data.scores;
		if (!isArrayOf(isNumber)(scores)) throw Error("Unexpected type for scores in mtgdraftbots response.");
		if (scores.length === 0) throw Error("Empty scores in mtgdraftbots response.");
		if (scores.length !== params.pack.length)
			console.warn(
				`Warning: mtgdraftbots returned an incorrect number of scores (expected ${params.pack.length}, got ${response.data.scores.length})`
			);
		return scores;
	} else {
		throw Error("Error reaching to mtgdraftbots.");
	}
}

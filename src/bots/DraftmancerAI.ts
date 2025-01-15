import axios, { AxiosError } from "axios";
import { RequestParameters } from "./ExternalBotInterface";

export const DraftmancerAI = {
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

interface DrafterState {
	cardsInPack: string[];
	picked: string[];
	seen: { packNum: number; pickNum: number; numPicks: number; pack: string[] }[];
	packNum: number;
	numPacks: number;
	pickNum: number;
	numPicks: number;
	seed: number;
}

export async function getScores(model: string, request: RequestParameters): Promise<number[]> {
	const drafterState: DrafterState = {
		cardsInPack: request.pack,
		picked: request.picked,
		seen: request.seen,
		packNum: request.packNum,
		numPacks: request.numPacks,
		pickNum: request.pickNum,
		numPicks: request.numPicks,
		seed: Math.floor(Math.random() * 65536),
	};

	const response = await axios.post(
		`${DraftmancerAI.domain}/draft?auth_token=${DraftmancerAI.authToken}&model_type=${model}`,
		{ drafterState },
		{ timeout: 3000 }
	);
	if (response.status === 200 && response.data.success) {
		return response.data.scores;
	} else {
		throw Error("Error reaching to DraftmancerAI.");
	}
}

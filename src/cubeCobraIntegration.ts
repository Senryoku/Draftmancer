import axios from "axios";
import { InTesting, InProduction } from "./Context.js";
import { Session } from "./Session.js";
import { DraftPick } from "./DraftLog.js";

const CUBECOBRA_LOG_ENDPOINT = process.env.CUBECOBRA_LOG_ENDPOINT;
const CUBECOBRA_API_KEY = process.env.CUBECOBRA_API_KEY;

interface Pick {
	booster: string[]; // oracle id
	picks: number[]; // Indices into booster
	burn: number[];
}

interface Decklist {
	main: string[]; // oracle id
	side: string[]; // oracle id
	lands: {
		W: number;
		U: number;
		B: number;
		R: number;
		G: number;
	};
}

interface Player {
	userName: string;
	isBot: boolean;
	picks: Pick[];
	decklist: Decklist;
}

interface PublishDraftBody {
	cubeID: string;
	sessionID: string;
	timestamp: number;
	players: Player[];
	apiKey: string;
}

export function sendDraftLogToCubeCobra(session: Session) {
	if (!InProduction || InTesting || !CUBECOBRA_API_KEY || !CUBECOBRA_LOG_ENDPOINT) return;

	try {
		if (
			session.useCustomCardList &&
			session.customCardList.cubeCobraID &&
			session.sendResultsToCubeCobra &&
			session.draftLog
		) {
			console.log(`Sending draft log to CubeCobra (CubeID: ${session.customCardList.cubeCobraID})...`);

			const payload: PublishDraftBody = {
				apiKey: CUBECOBRA_API_KEY,
				cubeID: session.customCardList.cubeCobraID,
				sessionID: session.id,
				timestamp: session.draftLog.time,
				players: Object.values(session.draftLog.users).map((user) => ({
					userName: user.userName,
					isBot: user.isBot,
					picks: user.picks.map((pick) => {
						const p = pick as DraftPick;
						return {
							booster: p.booster.map((c) => session.draftLog!.carddata[c].oracle_id!) ?? [],
							picks: p.pick,
							burn: p.burn ?? [],
						};
					}),
					decklist: user.decklist
						? {
								main: user.decklist.main.map((c) => session.draftLog!.carddata[c].oracle_id!),
								side: user.decklist.side.map((c) => session.draftLog!.carddata[c].oracle_id!),
								lands: user.decklist.lands ?? { W: 0, U: 0, B: 0, R: 0, G: 0 },
							}
						: {
								// Bots don't have a decklist, reconstruct it.
								main: user.picks
									.map((pick) => {
										const p = pick as DraftPick;
										return p.pick.map((i) => session.draftLog!.carddata[p.booster[i]].oracle_id);
									})
									.flat(),
								side: [],
								lands: { W: 0, U: 0, B: 0, R: 0, G: 0 },
							},
				})),
			};

			axios
				.post(CUBECOBRA_LOG_ENDPOINT, payload)
				.catch((err) => console.error("Error sending draft log to CubeCobra: ", err));
		}
	} catch (err) {
		console.error("Error sending draft log to CubeCobra: ", err);
	}
}

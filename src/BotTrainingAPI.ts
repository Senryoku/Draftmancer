import axios from "axios";
import { InTesting, InProduction } from "./Context.js";
import { Session } from "./Session.js";
import { getCard } from "./Cards.js";
import { DraftEffect, OnPickDraftEffect, OptionalOnPickDraftEffect, UsableDraftEffect } from "./CardTypes.js";
import { DraftLog, DraftPick } from "./DraftLog.js";

const MTGDraftbotsLogEndpoint = process.env.MTGDRAFTBOTS_ENDPOINT ?? "https://cubeartisan.net/integrations/draftlog";
const MTGDraftbotsDeckEndpoint =
	process.env.MTGDRAFTBOTS_DECKENDPOINT ?? " https://cubeartisan.net/integrations/decklog";
const MTGDraftbotsAPIKey = process.env.MTGDRAFTBOTS_APIKEY;

const LogStoreEndpoint = process.env.LOGSTORE_ENDPOINT ?? "http://localhost:52666/api/log";
const LogStoreAPIKey = process.env.LOGSTORE_APIKEY ?? "1234";

type MTGDraftbotsLogEntry = {
	pack: string[];
	picks: number[];
	trash: number[];
	packNum: number;
	numPacks: number;
	pickNum: number;
	numPicks: number;
};

type MTGDraftbotsLog = {
	players: MTGDraftbotsLogEntry[][];
	apiKey: string;
};

export function sendLog(type: string, session: Session) {
	if (session.draftLog) {
		// Ignore drafts that contains effects messing with the packs. These won't be useful for training.
		const excludedEffects: DraftEffect[] = [
			OnPickDraftEffect.CanalDredger,
			OptionalOnPickDraftEffect.LoreSeeker,
			UsableDraftEffect.CogworkLibrarian,
			UsableDraftEffect.AgentOfAcquisitions,
			UsableDraftEffect.LeovoldsOperative,
		];
		if (
			Object.values(session.draftLog.carddata).some(
				(c) => c.draft_effects?.some((effect) => excludedEffects.includes(effect))
			)
		)
			return;

		// Send log to MTGDraftbots endpoint
		if (type === "Draft" && !session.customCardList?.customCards) {
			const players = [];
			for (const uid in session.draftLog.users) {
				const u = session.draftLog.users[uid];
				// Skip bots, and players replaced by bots
				if (!u.isBot && u.picks.length > 0 && !session.disconnectedUsers[uid]?.replaced) {
					const player: MTGDraftbotsLogEntry[] = [];
					let packNum = 0;
					let pickNum = 0;
					let lastPackSize = (u.picks[0] as DraftPick).booster.length + 1;
					let lastPackPicks = 0;
					for (const pick of u.picks) {
						const p = pick as DraftPick;
						if (p.booster.length >= lastPackSize) {
							// Patch last pack picks with the correct numPicks
							for (let i = player.length - lastPackPicks; i < player.length; ++i)
								player[i].numPicks = pickNum;
							packNum += 1;
							pickNum = 0;
							lastPackPicks = 0;
						}
						lastPackSize = p.booster.length;
						player.push({
							pack: p.booster.map((cid: string) => getCard(cid).oracle_id),
							picks: p.pick,
							trash: p.burn ?? [],
							packNum: packNum,
							numPacks: -1,
							pickNum: pickNum,
							numPicks: -1,
						});
						pickNum += p.pick.length;
						++lastPackPicks;
					}
					// Patch each pick with the correct numPacks and the last pack with the correct numPicks
					for (const p of player) {
						p.numPacks = packNum + 1;
						if (p.numPicks === -1) p.numPicks = pickNum;
					}
					if (player.length > 0) players.push(player);
				}
			}

			if (MTGDraftbotsAPIKey && !InTesting && InProduction && players.length > 0) {
				const data: MTGDraftbotsLog = {
					players: players,
					apiKey: MTGDraftbotsAPIKey,
				};
				axios
					.post(MTGDraftbotsLogEndpoint, data)
					.then((response) => {
						// We expect a 201 (Created) response
						if (response.status !== 201) {
							console.warn("Unexpected response after sending draft log to CubeArtisan: ");
							console.warn(response);
						}
					})
					.catch((err) => console.error("Error sending logs to CubeArtisan: ", err.message));
			}

			if (LogStoreEndpoint && !InTesting && InProduction && players.length > 0) {
				const data = {
					useCustomCardList: session.useCustomCardList,
					setRestriction: session.draftLog.setRestriction,
					players,
				};
				axios
					.post(LogStoreEndpoint, data, { headers: { "x-api-key": LogStoreAPIKey }, timeout: 5000 })
					.then((response) => {
						// We expect a 201 (Created) response
						if (response.status !== 201) {
							console.warn("Unexpected response after sending draft log to LogStoreEndpoint: ");
							console.warn(response);
						}
					})
					.catch((err) => console.error("Error sending logs to LogStoreEndpoint: ", err.message));
			}
		}
	}
}

export function sendDecks(log: DraftLog) {
	if (!InTesting && InProduction && MTGDraftbotsAPIKey) {
		// Ignore drafts containing custom cards
		if (Object.values(log.carddata).some((c) => c.is_custom)) return;
		for (const uid in log.users) {
			const decklist = log.users[uid].decklist;
			if (!log.users[uid].isBot && decklist) {
				const addedLands = decklist.lands ? Object.values(decklist.lands!).reduce((a, b) => a + b, 0) : 0;
				if (decklist.main.length < 20 || decklist.main.length + addedLands !== 40) continue;
				const data = {
					apiKey: MTGDraftbotsAPIKey,
					main: decklist.main.map((cid) => getCard(cid).oracle_id),
					side: decklist.side.map((cid) => getCard(cid).oracle_id),
					lands: decklist.lands,
				};
				axios
					.post(MTGDraftbotsDeckEndpoint, data)
					.then((response) => {
						// We expect a 201 (Created) response
						if (response.status !== 201) {
							console.warn("Unexpected response after sending decks to CubeArtisan: ");
							console.warn(response);
						}
					})
					.catch((err) => console.error("Error sending decks to CubeArtisan: ", err.message));
			}
		}
	}
}

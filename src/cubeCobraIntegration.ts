import axios from "axios";
import { InTesting, InProduction } from "./Context.js";
import { Session } from "./Session.js";
import { DraftPick } from "./DraftLog.js";
import { CCLSettings, CustomCardList, PackLayout, Sheet } from "./CustomCardList.js";
import { Cards, CardVersionsByName } from "./Cards.js";
import { SocketError } from "./Message.js";
import { Card, CardColor, OracleID } from "./CardTypes.js";
import { matchCardVersion } from "./parseCardList.js";
import { hasOptionalProperty, hasProperty, isArrayOf, isObject, isRecord, isString, isUnknown } from "./TypeChecks.js";

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
			session.draftLog &&
			!session.draftLog.delayed
		) {
			console.log(`Sending draft log to CubeCobra (CubeID: ${session.customCardList.cubeCobraID})...`);

			const payload: PublishDraftBody = {
				apiKey: CUBECOBRA_API_KEY,
				cubeID: session.customCardList.cubeCobraID,
				sessionID: session.id,
				timestamp: session.draftLog.time,
				players: Object.values(session.draftLog.users).map((user) => ({
					userName: user.userName && user.userName !== "" ? user.userName : user.isBot ? "Bot" : "Anonymous",
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

			axios.post(CUBECOBRA_LOG_ENDPOINT, payload).catch((err) => {
				console.error("Error sending draft log to CubeCobra, will retry once in 5 seconds. ", err.cause ?? err);
				setTimeout(() => {
					axios.post(CUBECOBRA_LOG_ENDPOINT, payload).catch((final_err) => {
						console.error("Error sending draft log to CubeCobra (second attempt): ", final_err);
					});
				}, 5000);
			});
		}
	} catch (err) {
		console.error("Error sending draft log to CubeCobra: ", err);
	}
}

function splitTypeLine(type_line: string) {
	const types = type_line.split(/ [—-] /);
	return { type: types[0], subtypes: types.length > 1 ? types[1].toUpperCase().split(" ") : [] };
}

type CubeCobraCard = {
	cardID: string;
	finish?: "Non-foil" | "Foil" | "Etched" | "Alt-foil";
	tags?: string[];
	custom_name?: string;
	imgUrl?: string;
	imgBackUrl?: string;
	rarity?: string;
	colors?: string[];
	cmc?: string;
	type_line?: string;
	details: CubeCobraCardDetails;
	index: number;
	board: "mainboard" | "maybeboard";
	// More omitted properties
};

type CubeCobraCardDetails = {
	oracle_id: OracleID;
	scryfall_id: string;
	name: string;
	type: string;
	rarity: string;
	cmc: number;
	parsed_cost: string[];
	colors: string[];
	set: string;
	collector_number: string;
	oracle_text: string;
	power: string;
	toughness: string;
	// More omitted properties
};

export function convertCubeCobraList(
	infos: { cubeID: string; matchVersions?: boolean; name?: string },
	cube: Record<string, unknown>
): CustomCardList | SocketError {
	if (!hasOptionalProperty("name", isString)(cube)) return new SocketError("Invalid cube name.");
	if (!hasProperty("cards", isRecord(isString, isUnknown))(cube)) return new SocketError("Missing cards object.");
	if (!hasProperty("mainboard", isArrayOf(isRecord(isString, isUnknown)))(cube.cards))
		return new SocketError("Invalid mainboard object.");
	if (cube.cards.mainboard.length <= 0)
		return new SocketError("Empty cube.", `Cube '${infos.cubeID}' on Cube Cobra seems empty.`);

	const defaultSheet: Sheet = { collation: "random", cards: {} };
	const customCards: Record<string, Card> = {};
	let customCardID = 0;
	const cardList: CustomCardList = {
		name: cube.name && isString(cube.name) ? cube.name : (infos.name ?? "Imported Cube"),
		cubeCobraID: infos.cubeID,
		customCards: customCards,
		layouts: false,
		sheets: { default: defaultSheet },
	};

	for (const card of cube.cards.mainboard) {
		if (!hasProperty("cardID", isString)(card)) return new SocketError("Missing cardID.");
		const c = card as unknown as CubeCobraCard; // Trusting the Cube Cobra API here with the type :)
		if (card.cardID === "custom-card") {
			// This is a completely custom card, all valid properties should be at the root.
			// NOTE: As far as I can tell, Cube Cobra doesn't have a way to have multiple copies of the same custom card,
			//       they're all unique. I could group them by custom_name, but it would prevent art variant.
			//       I'll follow Cube Cobra and treat them as unique card for now, we'll see a better system is needed later on.
			const customID = `Custom_${customCardID}`;
			const cmc = c.cmc ? parseInt(c.cmc) : 0;
			const types = splitTypeLine(c.type_line ?? "");
			const cardData: Card = {
				id: customID,
				oracle_id: customID, // TODO: Use Cube Cobra buddy system?
				name: c.custom_name ?? customID,
				mana_cost: cmc > 0 ? `{${cmc}}` : "", // NOTE: Cube Cobra doesn't support custom mana cost, only cmc.
				cmc: cmc,
				colors: (c.colors ?? []) as CardColor[],
				set: "custom",
				collector_number: customID,
				rarity: c.rarity ?? "common",
				type: types.type,
				subtypes: types.subtypes,
				back: c.imgBackUrl
					? {
							name: customID,
							printed_names: {},
							type: "",
							subtypes: [],
							image_uris: { en: c.imgBackUrl },
						}
					: undefined,
				rating: 0,
				in_booster: false,
				printed_names: {},
				image_uris: { en: c.imgUrl ?? "https://cubecobra.com/content/custom_card.png" },
				is_custom: true,
			};
			customCards[cardData.id] = cardData;
			defaultSheet.cards[cardData.id] = 1;
			customCardID += 1;
		} else {
			// Check card ID.
			// For now we'll throw an error if the card isn't recognized, but we could try to reconstruct
			// a custom card using the information provided by Cube Cobra in the `details` property.
			// CubeCobra custom cards were originally based on an official one.
			let originalCard: Card;
			if (infos.matchVersions) {
				const maybeOriginalCard = Cards.get(card.cardID);
				if (maybeOriginalCard) {
					originalCard = maybeOriginalCard;
				} else {
					// Search for an alternate version of the card.
					const cid = matchCardVersion(c.details.name, c.details.set, c.details.collector_number, true);
					if (!cid)
						return new SocketError(
							"Unknown card",
							`Could not find card '${c.details.name}' (${c.details.set} #${c.details.collector_number}, ${card.cardID}).`
						);
					originalCard = Cards.get(cid)!;
				}
			} else {
				const cid = matchCardVersion(c.details.name, undefined, undefined, true);
				if (!cid) return new SocketError("Unknown card", `Could not find card '${c.details.name}'.`);
				originalCard = Cards.get(cid)!;
			}

			// We'll use the presence of an imgUrl as a sign this is custom card.
			if (c.imgUrl) {
				const cardData: Card = {
					...originalCard,
					related_cards: [card.cardID],
					is_custom: true,
				};
				// Modified properties are found at the root of the card object, original values in the `details` property.
				cardData.id = `Custom_${customCardID}`;
				// Update with custom properties.
				cardData.image_uris = { en: c.imgUrl };
				if (c.finish) cardData.foil = c.finish === "Foil";
				if (c.cmc) cardData.cmc = parseInt(c.cmc);
				if (c.type_line) {
					const types = splitTypeLine(c.type_line);
					cardData.type = types.type;
					cardData.subtypes = types.subtypes;
				}
				if (c.rarity) cardData.rarity = c.rarity;
				if (c.colors) cardData.colors = c.colors as CardColor[];
				if (c.imgBackUrl) {
					// Use the back of the original card if available.
					if (cardData.back) {
						cardData.back.image_uris = { en: c.imgBackUrl };
					} else {
						cardData.back = {
							name: `${cardData.name}_back`,
							printed_names: {},
							type: "",
							subtypes: [],
							image_uris: { en: c.imgBackUrl },
						};
					}
				}
				customCards[cardData.id] = cardData;
				defaultSheet.cards[cardData.id] = 1;
				customCardID += 1;
			} else {
				// Official card
				if (Object.prototype.hasOwnProperty.call(defaultSheet.cards, originalCard.id))
					defaultSheet.cards[originalCard.id] += 1;
				else defaultSheet.cards[originalCard.id] = 1;
			}
		}
	}
	return cardList;
}

// CubeCobra Draft Format types
type DraftAction = "pick" | "pass" | "trash" | "pickrandom" | "trashrandom" | "endpack";
type DraftStep = {
	action: DraftAction;
	amount: number | null;
};
interface Pack {
	slots: string[];
	steps: DraftStep[] | null;
}
export interface DraftFormat {
	title: string;
	packs: Pack[];
	multiples: boolean;
	markdown?: string;
	html?: string;
	defaultSeats: number;
}

export async function importFormat(cardList: CustomCardList, format: DraftFormat) {
	const defaultSheet = cardList.sheets.default;
	if (defaultSheet?.collation !== "random") return;
	const settings: CCLSettings = {
		withReplacement: format.multiples,
		refillWhenEmpty: format.multiples,
		boosterSettings: [],
		predeterminedLayouts: [],
		boostersPerPlayer: format.packs.length,
	};
	const customCards = cardList.customCards ? Object.values(cardList.customCards) : [];
	const layouts: Record<string, PackLayout> = {};
	const sheets: Record<string, Sheet> = {
		"*": defaultSheet, // Copy the default sheet as the wildcard filter.
	};
	let idx = 0;
	for (const pack of format.packs) {
		const layout: PackLayout = { weight: 1, slots: [] };
		for (const filter of pack.slots) {
			if (!sheets[filter]) {
				// Request the filtered list from Cube Cobra
				const filteredList = await axios.get(
					`https://cubecobra.com/cube/download/plaintext/${cardList.cubeCobraID}?showother=true&filter=${filter}`,
					{ timeout: 5000 }
				);
				const lines = filteredList.data.split(/\r?\n/).map((line: string) => line.trim());
				const sheet: Sheet = { collation: "random", cards: {} };
				for (const line of lines) {
					if (line === "") continue;
					if (line.startsWith("#")) {
						if (line == "# maybeboard") break;
						continue;
					}
					// Search the cardID corresponding to the card name, first within custom cards,
					// then within the official cards (cross-referenced with the default sheet to get the correct version)
					let cid = null;
					const customCard = customCards.find((c) => c.name === line);
					if (customCard) cid = customCard.id;
					else {
						const candidates = CardVersionsByName[line];
						for (const candidate of candidates) {
							if (candidate in defaultSheet.cards) {
								cid = candidate;
								break;
							}
						}
					}
					if (cid) {
						if (sheet.cards[cid]) sheet.cards[cid] += 1;
						else sheet.cards[cid] = 1;
					} else throw new Error(`Unknown card in sheet '${filter}': ${line}`);
				}
				sheets[filter] = sheet;
			}
			layout.slots.push({ name: filter, count: 1, foil: false, sheets: [{ name: filter, weight: 1 }] });
		}
		const layoutName = `Pack ${idx++}`;
		layouts[layoutName] = layout;
		settings.predeterminedLayouts!.push([{ name: layoutName, weight: 1 }]);
		// Convert Cube Cobra steps to booster settings. Not all use cases are supported.
		if (pack.steps) {
			const boosterSettings: { picks: number[]; burns: number[] } = { picks: [], burns: [] };
			let currentPack = { picks: 0, burns: 0 };
			for (const step of pack.steps) {
				switch (step.action) {
					case "pick": {
						currentPack.picks += step.amount ?? 0;
						break;
					}
					case "trash": {
						currentPack.burns += step.amount ?? 0;
						break;
					}
					case "pass": {
						if (currentPack.picks < 1 || currentPack.burns < 0)
							throw new Error(`Invalid pack, must at least pick 1 card per pack (${currentPack}).`);
						boosterSettings.picks.push(currentPack.picks);
						boosterSettings.burns.push(currentPack.burns);
						currentPack = { picks: 0, burns: 0 };
						break;
					}
					case "pickrandom":
					case "trashrandom":
						throw new Error(`Unsupported action: ${step.action}`);
				}
			}
			if (currentPack.picks > 0 || currentPack.burns > 0) {
				if (currentPack.picks < 1 || currentPack.burns < 0)
					throw new Error(`Invalid pack, must at least pick 1 card per pack (${currentPack}).`);
				boosterSettings.picks.push(currentPack.picks);
				boosterSettings.burns.push(currentPack.burns);
			}
			settings.boosterSettings!.push(boosterSettings);
		} else {
			// Default
			settings.boosterSettings!.push({ picks: [1], burns: [] });
		}
	}
	// Update the cardList
	cardList.settings = settings;
	cardList.layouts = layouts;
	cardList.sheets = sheets;
}

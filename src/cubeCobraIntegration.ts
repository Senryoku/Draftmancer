import axios from "axios";
import { InTesting, InProduction } from "./Context.js";
import { Session } from "./Session.js";
import { DraftPick } from "./DraftLog.js";
import { CCLSettings, CustomCardList, PackLayout, Sheet } from "./CustomCardList.js";
import { Cards, getCardVersionsByName } from "./Cards.js";
import { isSocketError, SocketError } from "./Message.js";
import {
	Card,
	CardColor,
	CardID,
	OnPickDraftEffect,
	OptionalOnPickDraftEffect,
	OracleID,
	ParameterizedDraftEffectType,
} from "./CardTypes.js";
import { matchCardVersion } from "./parseCardList.js";
import { hasOptionalProperty, hasProperty, isArrayOf, isRecord, isString, isUnknown } from "./TypeChecks.js";

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

import util from "util";

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
			const sessionID = session.id;
			const cubeCobraID = session.customCardList.cubeCobraID;
			const draftLog = session.draftLog;
			console.log(`[${sessionID}] Sending draft log to CubeCobra (CubeID: ${cubeCobraID})...`);

			const payload: PublishDraftBody = structuredClone({
				apiKey: CUBECOBRA_API_KEY,
				cubeID: cubeCobraID,
				sessionID: sessionID,
				timestamp: draftLog.time,
				players: Object.values(draftLog.users).map((user) => ({
					userName: user.userName && user.userName !== "" ? user.userName : user.isBot ? "Bot" : "Anonymous",
					isBot: user.isBot,
					picks: user.picks.map((pick) => {
						const p = pick as DraftPick;
						return {
							booster: p.booster.map((c) => draftLog.carddata[c].oracle_id) ?? [],
							picks: p.pick,
							burn: p.burn ?? [],
						};
					}),
					decklist: user.decklist
						? {
								main: user.decklist.main.map((c) => draftLog.carddata[c].oracle_id),
								side: user.decklist.side.map((c) => draftLog.carddata[c].oracle_id),
								lands: user.decklist.lands ?? { W: 0, U: 0, B: 0, R: 0, G: 0 },
							}
						: {
								// Bots don't have a decklist, reconstruct it.
								main: user.picks
									.map((pick) => {
										const p = pick as DraftPick;
										return p.pick.map((i) => draftLog.carddata[p.booster[i]].oracle_id);
									})
									.flat(),
								side: [],
								lands: { W: 0, U: 0, B: 0, R: 0, G: 0 },
							},
				})),
			});
			console.log(util.inspect(payload, false, null, true));

			axios.post(CUBECOBRA_LOG_ENDPOINT, payload).catch((err) => {
				console.error(
					`[${sessionID}] Error sending draft log to CubeCobra (CubeID: ${cubeCobraID}), will retry once in 5 seconds. `,
					err.cause ?? err
				);
				setTimeout(() => {
					axios.post(CUBECOBRA_LOG_ENDPOINT, payload).catch((final_err) => {
						console.error(
							`[${sessionID}] Error sending draft log to CubeCobra (CubeID: ${cubeCobraID}) (second attempt): `,
							final_err
						);
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
	voucher_cards?: CubeCobraCard[];
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

function convertCustomCard(state: { customCards: Record<string, Card>; customCardID: number }, c: CubeCobraCard): Card {
	const customID = `Custom_${state.customCardID}`;
	state.customCardID += 1;
	const cmc = c.cmc ? parseInt(c.cmc) : 0;
	const types = splitTypeLine(c.type_line ?? "");
	const converted = {
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
	state.customCards[converted.id] = converted;
	return converted;
}

/** Checks if a card is a custom card, and if so, adds it to the customCards object.
 *  Returns the card ID.
 */
function handleCard(
	state: { customCards: Record<string, Card>; customCardID: number; matchVersions: boolean },
	card: CubeCobraCard
): CardID | SocketError {
	if (card.cardID === "custom-card" || card.cardID === "voucher") {
		// This is a completely custom card, all valid properties should be at the root.
		// NOTE: As far as I can tell, Cube Cobra doesn't have a way to have multiple copies of the same custom card,
		//       they're all unique. I could group them by custom_name, but it would prevent art variant.
		//       I'll follow Cube Cobra and treat them as unique card for now, we'll see a better system is needed later on.
		const converted = convertCustomCard(state, card);
		// "Voucher" cards are custom cards that add multiple cards to the player pool when drafted.
		// This converts them to cards with the `AddCards` and `BurnAfterPicking` draft effects.
		// NOTE: `card.cardID` should be "voucher".
		if (hasProperty("voucher_cards", isArrayOf(isRecord(isString, isUnknown)))(card)) {
			const voucherCardsIDs: CardID[] = [];
			for (const voucherCard of card.voucher_cards) {
				const vcIDorError = handleCard(state, voucherCard);
				if (isSocketError(vcIDorError)) return vcIDorError;
				voucherCardsIDs.push(vcIDorError);
			}
			if (voucherCardsIDs.length > 0) {
				if (!converted.draft_effects) converted.draft_effects = [];
				converted.draft_effects.push({
					type: ParameterizedDraftEffectType.AddCards,
					count: voucherCardsIDs.length,
					cards: voucherCardsIDs,
					duplicateProtection: false,
				});
				converted.draft_effects.push({
					type: OnPickDraftEffect.BurnAfterPicking,
				});
			}
		}
		return converted.id;
	} else {
		// Check card ID.
		// For now we'll throw an error if the card isn't recognized, but we could try to reconstruct
		// a custom card using the information provided by Cube Cobra in the `details` property.
		// CubeCobra custom cards were originally based on an official one.
		let originalCard: Card;
		if (state.matchVersions) {
			const maybeOriginalCard = Cards.get(card.cardID);
			if (maybeOriginalCard) {
				originalCard = maybeOriginalCard;
			} else {
				// Search for an alternate version of the card.
				const cid = matchCardVersion(card.details.name, card.details.set, card.details.collector_number, true);
				if (!cid)
					return new SocketError(
						"Unknown card",
						`Could not find card '${card.details.name}' (${card.details.set} #${card.details.collector_number}, ${card.cardID}).`
					);
				originalCard = Cards.get(cid)!;
			}
		} else {
			const cid = matchCardVersion(card.details.name, undefined, undefined, true);
			if (!cid) return new SocketError("Unknown card", `Could not find card '${card.details.name}'.`);
			originalCard = Cards.get(cid)!;
		}

		// We'll use the presence of an imgUrl as a sign this is custom card.
		if (card.imgUrl) {
			const cardData: Card = {
				...structuredClone(originalCard),
				related_cards: [card.cardID],
				is_custom: true,
			};
			// Modified properties are found at the root of the card object, original values in the `details` property.
			cardData.id = `Custom_${state.customCardID}`;
			state.customCardID += 1;
			// Update with custom properties.
			cardData.image_uris = { en: card.imgUrl };
			if (card.finish) cardData.foil = card.finish === "Foil";
			if (card.cmc) cardData.cmc = parseInt(card.cmc);
			if (card.type_line) {
				const types = splitTypeLine(card.type_line);
				cardData.type = types.type;
				cardData.subtypes = types.subtypes;
			}
			if (card.rarity) cardData.rarity = card.rarity;
			if (card.colors) cardData.colors = card.colors as CardColor[];
			if (card.imgBackUrl) {
				// Use the back of the original card if available.
				if (cardData.back) {
					cardData.back.image_uris = { en: card.imgBackUrl };
				} else {
					cardData.back = {
						name: `${cardData.name}_back`,
						printed_names: {},
						type: "",
						subtypes: [],
						image_uris: { en: card.imgBackUrl },
					};
				}
			}
			state.customCards[cardData.id] = cardData;
			return cardData.id;
		} else {
			// Official card
			return originalCard.id;
		}
	}
}

export function convertCubeCobraList(
	infos: { cubeID: string; matchVersions?: boolean; name?: string },
	cube: Record<string, unknown>
): CustomCardList | SocketError {
	if (!hasOptionalProperty("name", isString)(cube)) return new SocketError("Invalid cube name.");

	if (!hasProperty("cards", isRecord(isString, isUnknown))(cube))
		return new SocketError("Invalid or missing cards object.");
	if (!hasProperty("mainboard", isArrayOf(isRecord(isString, isUnknown)))(cube.cards))
		return new SocketError("Invalid or missing mainboard object.");
	if (cube.cards.mainboard.length <= 0)
		return new SocketError("Empty cube.", `Cube '${infos.cubeID}' on Cube Cobra seems empty.`);

	const defaultSheet: Sheet = { collation: "random", cards: {} };
	const customCards: Record<string, Card> = {};
	const cardList: CustomCardList = {
		name: cube.name && isString(cube.name) ? cube.name : (infos.name ?? "Imported Cube"),
		cubeCobraID: infos.cubeID,
		customCards: customCards,
		layouts: false,
		sheets: { default: defaultSheet },
	};
	const state = { customCards, customCardID: 0, matchVersions: infos.matchVersions ?? false };

	for (const boardName in cube.cards) {
		const isDefaultSheet = boardName === "mainboard";
		if (!isDefaultSheet && !cardList.sheets[boardName])
			cardList.sheets[boardName] = { collation: "random", cards: {} };
		const sheet: Sheet = isDefaultSheet ? defaultSheet : cardList.sheets[boardName];
		if (sheet.collation !== "random") return new SocketError("Unsupported collation type."); // Just guiding Typescript
		const board = (cube.cards as Record<string, unknown>)[boardName];
		if (isArrayOf(isRecord(isString, isUnknown))(board)) {
			for (const card of board) {
				if (!hasProperty("cardID", isString)(card)) return new SocketError("Missing cardID.");
				const c = card as unknown as CubeCobraCard; // Trusting the Cube Cobra API here with the type :)
				const cardIDOrError = handleCard(state, c);
				if (isSocketError(cardIDOrError)) return cardIDOrError;
				const cardID = cardIDOrError;
				if (Object.prototype.hasOwnProperty.call(sheet.cards, cardID)) sheet.cards[cardID] += 1;
				else sheet.cards[cardID] = 1;
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
	slots: { filter: string; board?: string }[];
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
		for (const slot of pack.slots) {
			if (!sheets[slot.filter]) {
				// Request the filtered list from Cube Cobra
				const filteredList = await axios.get(
					`https://cubecobra.com/cube/download/plaintext/${cardList.cubeCobraID}?showother=true&filter=${slot.filter}`,
					{ timeout: 5000 }
				);
				const lines: string[] = filteredList.data.split(/\r?\n/);
				if (slot.board) {
					// Filter down to the requested board
					const boardIndex = lines.findIndex((line) => line.startsWith(`# ` + slot.board));
					if (boardIndex >= 0) {
						lines.splice(0, boardIndex + 1);
						const boardEnd = lines.findIndex((line) => line.startsWith("#"));
						if (boardEnd > 0) lines.splice(boardEnd);
					}
				}
				const sheet: Sheet = { collation: "random", cards: {} };
				for (const line of lines) {
					if (line === "") continue;
					if (line.startsWith("#")) {
						if (line == "# maybeboard") break; // FIXME: Might not be needed anymore?
						continue;
					}
					// Search the cardID corresponding to the card name, first within custom cards,
					// then within the official cards (cross-referenced with the default sheet to get the correct version)
					let cid = null;
					const customCard = customCards.find((c) => c.name === line);
					if (customCard) cid = customCard.id;
					else {
						const candidates = getCardVersionsByName(line);
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
					} else throw new Error(`Unknown card in sheet '${slot.filter}': '${line}'`);
				}
				sheets[slot.filter] = sheet;
			}
			layout.slots.push({ name: slot.filter, count: 1, foil: false, sheets: [{ name: slot.filter, weight: 1 }] });
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

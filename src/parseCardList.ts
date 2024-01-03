import { genCustomCardID } from "./CustomCardID.js";
import { validateCustomCard } from "./CustomCards.js";
import { Card, CardID } from "./CardTypes.js";
import { CardsByName, CardVersionsByName, getCard, isValidCardID } from "./Cards.js";
import { CCLSettings, CustomCardList, PackLayout } from "./CustomCardList.js";
import { escapeHTML } from "./utils.js";
import { ackError, isSocketError, SocketError } from "./Message.js";
import {
	hasOptionalProperty,
	isAny,
	isArrayOf,
	isBoolean,
	isInteger,
	isNumber,
	isRecord,
	isString,
	isUnknown,
} from "./TypeChecks.js";

const lineRegex =
	/^(?:(?<count>\d+)\s+)?(?<name>[^\v\n]+?)(?:\s\((?<set>\w+)\)(?:\s+(?<number>[^+\s()]+))?)?(?:\s+\+?(F))?$/;

const trailingCommasRegex = /(?<=(true|false|null|["\d}\]])\s*),(?=\s*[\]}])/g;

function removeJSONTrailingCommas(str: string): string {
	return str.replaceAll(trailingCommasRegex, "");
}

export function matchCardVersion(
	name: string,
	set?: string,
	collector_number?: string,
	fallbackToCardName = false
): CardID | null {
	// Only the name is supplied, get the preferred version of the card
	if (!set && !collector_number && name in CardsByName) return CardsByName[name];

	let candidates: Card[] = (
		name in CardVersionsByName
			? CardVersionsByName[name]
			: name.split(" //")[0] in CardVersionsByName // If not found, try double faced cards before giving up!
			  ? CardVersionsByName[name.split(" //")[0]]
			  : []
	).map((cid) => getCard(cid));

	candidates = candidates.filter(
		(c) => (!set || c.set === set) && (!collector_number || c.collector_number === collector_number)
	);

	if (candidates.length > 0)
		return candidates.reduce((best, c) => {
			if (parseInt(c.collector_number) < parseInt(best.collector_number)) return c;
			return best;
		}, candidates[0]).id;

	if (fallbackToCardName && name in CardsByName) return CardsByName[name];

	return null;
}

// Possible options:
//  - fallbackToCardName: Allow fallback to only a matching card name if exact set and/or collector number cannot be found.
//  - customCards: Dictionary of additional custom cards to try to match first.
export function parseLine(
	line: string,
	options: {
		fallbackToCardName?: boolean;
		customCards?: { cards: Record<CardID, Card>; nameCache: Map<string, Card> };
	} = { fallbackToCardName: false, customCards: undefined }
): SocketError | { count: number; cardID: CardID; foil: boolean } {
	const trimedLine = line.trim();
	const match = trimedLine.match(lineRegex);
	if (!match)
		return ackError({
			title: `Syntax Error`,
			text: `The line '${trimedLine}' doesn't match the card syntax.`,
			footer: `Full line: '${trimedLine}'`,
		});

	const [, countStr, name, , number, foilStr] = match;
	let [, , , set, ,] = match;
	const foil: boolean = !!foilStr;
	let count = parseInt(countStr);
	if (!Number.isInteger(count)) count = 1;

	// Override with custom cards if available
	if (options?.customCards) {
		if (set && number) {
			const cid = genCustomCardID(name, set, number);
			if (cid in options.customCards.cards) return { count, cardID: cid, foil };
		} else if (options.customCards.nameCache.has(name))
			return { count, cardID: options.customCards.nameCache.get(name)!.id, foil };
	}

	if (set) {
		set = set.toLowerCase();
		if (set === "dar") set = "dom";
		if (set === "conf") set = "con";
	}
	// Note: The regex currently cannot catch this case. Without
	// parenthesis, the collector number will be part of the name.
	if (number && !set) {
		console.log(
			`Collector number without Set`,
			`You should not specify a collector number without also specifying a set: '${trimedLine}'.`
		);
	}

	const cardID = matchCardVersion(name, set, number, options?.fallbackToCardName);

	if (cardID) return { count, cardID, foil };

	// No match found

	/*
	 * If the card name contains parentheses (and no set was specified by the user), it may have been confused with a set. For example:
	 * 2 Hazmat Suit (Used) (UST)   // Should be handled correctly, but
	 * 2 Hazmat Suit (Used)         // will consider (Used) as a set specifier.
	 * Try again while considering everything after an optional count as the card name:
	 */
	if (line.indexOf("(") > -1) {
		const simpleMatch = trimedLine.match(/^(?:(?<count>\d+)\s+)?(?<name>.+?)(?:\s+\+?(F))?$/);
		if (simpleMatch) {
			const [, , altName, altFoil] = simpleMatch;
			if (options?.customCards && options.customCards.nameCache.has(altName))
				return { count, cardID: options.customCards.nameCache.get(altName)!.id, foil: !!altFoil };
			if (altName in CardsByName) return { count, cardID: CardsByName[altName], foil: !!altFoil };
		}
	}

	const message =
		(name in CardsByName
			? `Could not find this exact version of '${name}' (${set}) in our database, but other printings are available.`
			: `Could not find '${name}' in our database.`) +
		` If you think it should be there, please contact us via email or our Discord server.`;

	return ackError({
		title: `Card not found`,
		text: message,
		footer: `Full line: '${trimedLine}'`,
	});
}

function findNthLine(str: string, n: number): number {
	let index = 0;
	for (let i = 0; i < n; i++) {
		index = str.indexOf("\n", index);
		if (index === -1) return -1;
		++index; // Skip \n
	}
	return index;
}

// Find 'closing' (e.g. ')', ']', '}'...) character in str matching the 'opening' character (e.g. '(', '[', '{'...) found at str[start] and returns its index.
// Returns -1 if not found or if the string doesn't start with the opening character.
function findMatching(str: string, opening: string, closing: string, start: number = 0): number {
	let index = start;
	if (str[index] !== opening) return -1;
	let opened = 1;
	while (index < str.length && opened > 0) {
		++index;
		if (str[index] === opening) ++opened;
		else if (str[index] === closing) --opened;
	}
	if (opened !== 0) return -1;
	return index;
}

function jsonParsingErrorMessage(e: { message: string }, jsonStr: string): string {
	let msg = `Error parsing json: ${e.message}.`;
	const positionStr = e.message.match(/at position (\d+)/);
	if (positionStr) {
		const position = parseInt(positionStr[1]);
		msg += `<pre>${escapeHTML(
			jsonStr.slice(Math.max(0, position - 50), Math.max(0, position - 1))
		)}<span style="color: red; text-decoration: underline red;">${escapeHTML(jsonStr[position])}</span>${escapeHTML(
			jsonStr.slice(Math.min(position + 1, jsonStr.length), Math.min(position + 50, jsonStr.length))
		)}</pre>`;
	}
	return msg;
}

function parseSettings(
	lines: string[],
	startIdx: number,
	txtcardlist: string,
	customCardList: CustomCardList
): SocketError | { advance: number; settings: CCLSettings } {
	const lineIdx = startIdx;
	if (lines.length <= lineIdx)
		return ackError({
			title: `[Settings]`,
			text: `Expected a settings object, got end-of-file.`,
		});
	if (lines[lineIdx][0] !== "{") {
		return ackError({
			title: `[Settings]`,
			text: `Settings section must be a JSON Object. Line ${lineIdx + 1}: Expected '{', got '${
				lines[lineIdx + 1]
			}'.`,
		});
	}

	let index = findNthLine(txtcardlist, lineIdx);
	while (txtcardlist[index] !== "{") ++index;
	const start = index;
	const end = findMatching(txtcardlist, "{", "}", start);
	if (end === -1)
		return ackError({
			title: `[Settings]`,
			text: `Expected '}', got end-of-file.`,
		});
	let parsedSettings = {};
	const settingsStr = removeJSONTrailingCommas(txtcardlist.substring(start, end + 1));
	try {
		parsedSettings = JSON.parse(settingsStr);
		// eslint-disable-next-line @typescript-eslint/no-explicit-any
	} catch (e: any) {
		return ackError({
			title: `[Settings]`,
			html: jsonParsingErrorMessage(e, settingsStr),
		});
	}
	const settings: CCLSettings = {};

	if ("name" in parsedSettings) {
		if (!isString(parsedSettings.name)) {
			return ackError({
				title: `[Settings]`,
				text: `'name' must be a string.`,
			});
		}
		settings.name = parsedSettings.name;
	}

	if ("layouts" in parsedSettings) {
		const layouts: Record<string, PackLayout> = {};

		if (!isRecord(isString, isRecord(isString, isUnknown))(parsedSettings.layouts)) {
			return ackError({
				title: `[Settings]`,
				text: `'layouts' must be an object.`,
			});
		}
		for (const [key, value] of Object.entries(parsedSettings.layouts)) {
			if (!("weight" in value)) {
				return ackError({
					title: `[Settings]`,
					text: `Layout '${key}'  must have a 'weight' property.`,
				});
			}
			if (!isInteger(value.weight)) {
				return ackError({
					title: `[Settings]`,
					text: `'weight' must be an integer.`,
				});
			}
			if (!("slots" in value)) {
				return ackError({
					title: `[Settings]`,
					text: `Layout '${key}' must have a 'slots' property.`,
				});
			}
			if (!isRecord(isString, isInteger)(value["slots"])) {
				return ackError({
					title: `[Settings]`,
					text: `'slots' must be a Record<string, number>.`,
				});
			}
			layouts[key] = {
				weight: value.weight,
				slots: value.slots,
			};
		}

		customCardList.layouts = layouts;
	}

	if ("withReplacement" in parsedSettings) {
		if (!isBoolean(parsedSettings.withReplacement)) {
			return ackError({
				title: `[Settings]`,
				text: `'withReplacement' must be a boolean.`,
			});
		}
		settings.withReplacement = parsedSettings.withReplacement;
	}

	if ("showSlots" in parsedSettings) {
		if (!isBoolean(parsedSettings.showSlots)) {
			return ackError({
				title: `[Settings]`,
				text: `'showSlots' must be a boolean.`,
			});
		}
		settings.showSlots = parsedSettings.showSlots;
	}

	if ("predeterminedLayouts" in parsedSettings) {
		if (isArrayOf(isString)(parsedSettings.predeterminedLayouts)) {
			settings.predeterminedLayouts = parsedSettings.predeterminedLayouts.map((name) => {
				return [{ name: name, weight: 1 }];
			});
		} else if (isArrayOf(isArrayOf(isString))(parsedSettings.predeterminedLayouts)) {
			if (!customCardList.layouts) {
				return ackError({
					title: `[Settings]`,
					text: `'layouts' must be declared before being referenced in 'predeterminedLayouts'.`,
				});
			}
			settings.predeterminedLayouts = [];
			for (const list of parsedSettings.predeterminedLayouts) {
				const layouts = [];
				for (const name of list) {
					if (!(name in customCardList.layouts))
						return ackError({
							title: `[Settings]`,
							text: `Layout '${name}' must be declared before being referenced in 'predeterminedLayouts'.`,
						});
					layouts.push({ name: name, weight: customCardList.layouts[name].weight });
				}
				settings.predeterminedLayouts.push(layouts);
			}
		} else if (isArrayOf(isRecord(isString, isInteger))(parsedSettings.predeterminedLayouts)) {
			settings.predeterminedLayouts = [];
			for (const list of parsedSettings.predeterminedLayouts) {
				const layouts = [];
				for (const [name, weight] of Object.entries(list)) layouts.push({ name: name, weight: weight });
				settings.predeterminedLayouts.push(layouts);
			}
		} else {
			return ackError({
				title: `[Settings]`,
				text: `'predeterminedLayouts' must be an string[] | string[][] | Record<string, number>[], .`,
			});
		}
	}

	if ("boosterSettings" in parsedSettings) {
		if (!isArrayOf(isRecord(isString, isUnknown))(parsedSettings.boosterSettings)) {
			return ackError({
				title: `[Settings]`,
				text: `Invalid 'boosterSettings' format.`,
			});
		}
		const boosterSettings = [];
		for (const boosterSetting of parsedSettings.boosterSettings) {
			if (
				!hasOptionalProperty("picks", isInteger)(boosterSetting) &&
				!hasOptionalProperty("picks", isArrayOf(isInteger))(boosterSetting)
			)
				return ackError({
					title: `[Settings]`,
					text: `'boosterSettings.picks' must be a positive integer, or an array of positive integers.`,
				});
			if (
				!hasOptionalProperty("burns", isInteger)(boosterSetting) &&
				!hasOptionalProperty("burns", isArrayOf(isInteger))(boosterSetting)
			)
				return ackError({
					title: `[Settings]`,
					text: `'boosterSettings.burns' must be a positive integer, or an array of positive integers.`,
				});

			let picks = [1];
			let burns = [0];
			if (boosterSetting.picks)
				if (isNumber(boosterSetting.picks)) picks = [boosterSetting.picks];
				else picks = boosterSetting.picks;
			if (boosterSetting.burns)
				if (isNumber(boosterSetting.burns)) burns = [boosterSetting.burns];
				else burns = boosterSetting.burns;

			if (picks.some((pick) => pick < 1))
				return ackError({
					title: `[Settings]`,
					text: `'boosterSettings.picks' must be a strictly positive integer, or an array of strictly positive integers.`,
				});
			if (burns.some((burn) => burn < 0))
				return ackError({
					title: `[Settings]`,
					text: `'boosterSettings.burns' must be a positive integer, or an array of positive integers.`,
				});

			boosterSettings.push({
				picks,
				burns,
			});
		}

		settings.boosterSettings = boosterSettings;
	}

	if ("layoutWithReplacement" in parsedSettings) {
		if (!isBoolean(parsedSettings.layoutWithReplacement)) {
			return ackError({
				title: `[Settings]`,
				text: `'layoutWithReplacement' must be a boolean.`,
			});
		}
		settings.layoutWithReplacement = parsedSettings.layoutWithReplacement;
	}

	if ("boostersPerPlayer" in parsedSettings) {
		if (!isInteger(parsedSettings.boostersPerPlayer)) {
			return ackError({
				title: `[Settings]`,
				text: `'boostersPerPlayer' must be a integer.`,
			});
		}
		settings.boostersPerPlayer = parsedSettings.boostersPerPlayer;
	}

	if ("duplicateProtection" in parsedSettings) {
		if (!isBoolean(parsedSettings.duplicateProtection)) {
			return ackError({
				title: `[Settings]`,
				text: `'duplicateProtection' must be a boolean.`,
			});
		}
		settings.duplicateProtection = parsedSettings.duplicateProtection;
	}

	if ("colorBalance" in parsedSettings) {
		if (!isBoolean(parsedSettings.colorBalance)) {
			return ackError({
				title: `[Settings]`,
				text: `'colorBalance' must be a boolean.`,
			});
		}
		settings.colorBalance = parsedSettings.colorBalance;
	}

	if (settings.predeterminedLayouts) {
		if (!customCardList.layouts) {
			return ackError({
				title: `[Settings]`,
				text: `Layouts must be declared before setting 'predeterminedLayouts'.`,
			});
		}
		for (const list of settings.predeterminedLayouts) {
			for (const layout of list) {
				if (!(layout.name in customCardList.layouts)) {
					return ackError({
						title: `[Settings]`,
						text: `Layout '${layout.name}' in 'predeterminedLayouts' has not been declared.`,
					});
				}
			}
		}
		// If not explicitly declared, infer boostersPerPlayer from predeterminedLayouts count.
		if (!settings.boostersPerPlayer && settings.predeterminedLayouts.length !== 3)
			settings.boostersPerPlayer = settings.predeterminedLayouts.length;
	}

	return {
		advance: (settingsStr.match(/\r?\n/g)?.length ?? 0) + 1, // Skip this section's lines
		settings: settings,
	};
}

function parseCustomCards(lines: string[], startIdx: number, txtcardlist: string) {
	const lineIdx = startIdx;
	if (lines.length <= lineIdx)
		return ackError({
			title: `[CustomCards]`,
			text: `Expected a list of custom cards, got end-of-file.`,
		});
	// Custom cards must be a JSON array
	if (lines[lineIdx][0] !== "[") {
		return ackError({
			title: `[CustomCards]`,
			text: `Custom cards section must be a JSON Array. Line ${lineIdx + 1}: Expected '[', got '${
				lines[lineIdx + 1]
			}'.`,
		});
	}
	// Search for the section (matching closing bracket)
	let index = findNthLine(txtcardlist, lineIdx);
	while (txtcardlist[index] !== "[") ++index;
	const start = index;
	const end = findMatching(txtcardlist, "[", "]", start);
	if (end === -1)
		return ackError({
			title: `[CustomCards]`,
			text: `Expected ']', got end-of-file.`,
		});
	let parsedCustomCards = [];
	const customCardsStr = removeJSONTrailingCommas(txtcardlist.substring(start, end + 1));
	try {
		parsedCustomCards = JSON.parse(customCardsStr);
		// eslint-disable-next-line @typescript-eslint/no-explicit-any
	} catch (e: any) {
		return ackError({
			title: `[CustomCards]`,
			html: jsonParsingErrorMessage(e, customCardsStr),
		});
	}

	if (!isArrayOf(isRecord(isString, isAny))(parsedCustomCards)) {
		return ackError({
			title: `[CustomCards]`,
			html: `Custom cards must be an array of card objects. Refer to <a href="https://draftmancer.com/cubeformat.html">the documentation</a> for more information.`,
		});
	}

	const customCards: Card[] = [];
	const customCardsIDs: Record<CardID, Card> = {};
	const inputsByName = new Map<string, object>(); // Track declared card names to spot duplicates (and inherit properties between printings).
	const customCardsNameCache = new Map<string, Card>();
	for (const input of parsedCustomCards) {
		// When a second printing of a card (with the same name) is detected, copies all information from the first one.
		// This allows users to only specify a full card once and only update the related fields in other printings.
		const c = inputsByName.has(input.name) ? Object.assign({ ...inputsByName.get(input.name) }, input) : input;

		const cardOrError = validateCustomCard(c);
		if (isSocketError(cardOrError)) return cardOrError;
		if (cardOrError.id in customCardsIDs)
			return ackError({
				title: `Duplicate Custom Card`,
				text: `Duplicate card ID '${cardOrError.id}'. Each card must have a unique name. To define alternate printings of a card, specify a different set and/or collector number.`,
			});
		customCardsIDs[cardOrError.id] = cardOrError;
		if (!inputsByName.has(cardOrError.name)) inputsByName.set(cardOrError.name, input);
		if (!customCardsNameCache.has(cardOrError.name)) customCardsNameCache.set(cardOrError.name, cardOrError);
		customCards.push(cardOrError);
	}

	// Validate related card references.
	for (const card of customCards) {
		if (card.related_cards) {
			for (let i = 0; i < card.related_cards.length; ++i) {
				const rc = card.related_cards[i];
				// We're dealing with a card name (with optional set/collector number), or a CardID, not a card object.
				if (isString(rc)) {
					// This is an 'official' CardID, we're good.
					if (isValidCardID(rc)) continue;
					// Check if it's a valid (potentially custom) card name and replace it with the corresponding Card ID.
					const result = parseLine(rc, {
						customCards: { cards: customCardsIDs, nameCache: customCardsNameCache },
					});
					if (isSocketError(result))
						return ackError({
							title: `[CustomCards]`,
							text: `'${rc}', referenced in '${card.name}' related cards, is not a valid card.`,
						});
					card.related_cards[i] = result.cardID;
				}
			}
		}

		if (card.draft_effects) {
			for (const effect of card.draft_effects) {
				if (effect.type === "AddCards") {
					for (let i = 0; i < effect.cards.length; ++i) {
						const cid = effect.cards[i];
						// This is a valid card ID, nothing more to do.
						if (isValidCardID(cid)) continue;
						// Otherwise, treat it as a card line and replace it with the corresponding Card ID.
						const result = parseLine(cid, {
							customCards: { cards: customCardsIDs, nameCache: customCardsNameCache },
						});
						if (isSocketError(result))
							return ackError({
								title: `[CustomCards]`,
								text: `'${cid}', referenced in '${card.name}' AddCards draft effect, is not a valid card.`,
							});
						effect.cards[i] = result.cardID;
					}
				}
			}
		}
	}

	return {
		advance: (customCardsStr.match(/\r?\n/g)?.length ?? 0) + 1, // Skip this section's lines
		customCards: customCards,
	};
}

function parsePackLayoutsDeprecated(
	lines: string[],
	startIdx: number
): { advance: number; layouts: Record<string, PackLayout> } | SocketError {
	const layouts: Record<string, PackLayout> = {};
	let lineIdx = startIdx;
	while (lineIdx < lines.length && lines[lineIdx][0] !== "[") {
		const match = lines[lineIdx].match(/-\s*([a-zA-Z]+)\s*\((\d+)\)/);
		if (!match) {
			return ackError({
				title: `Parsing Error`,
				text: `Expected layout declaration (' - LayoutName (Weight)'), got '${lines[lineIdx]}' (line ${
					lineIdx + 1
				}).`,
			});
		}
		const layoutName = match[1];
		const layoutWeight = parseInt(match[2]);
		layouts[layoutName] = { weight: layoutWeight, slots: {} };
		++lineIdx;
		while (lineIdx < lines.length && lines[lineIdx][0] !== "-" && lines[lineIdx][0] !== "[") {
			const slotMatch = lines[lineIdx].match(/(\d+)\s+([a-zA-Z]+)/);
			if (!slotMatch) {
				return ackError({
					title: `Parsing Error`,
					text: `Expected slot specification (' CardCount SlotName'), got '${lines[lineIdx]}' (line ${
						lineIdx + 1
					}).`,
				});
			}
			layouts[layoutName].slots[slotMatch[2]] = parseInt(slotMatch[1]);
			++lineIdx;
		}
	}
	return { advance: lineIdx - startIdx, layouts };
}

// options:
//   - name: string, specify name of returned card list.
//   - fallbackToCardName: boolean
//   - ignoreUnknownCards: boolean, If true, don't error on unknown cards, report the unknown card by mutating the 'outIgnoredCards' parameter and continue.
export function parseCardList(
	txtcardlist: string,
	options: { name?: string; fallbackToCardName?: boolean; ignoreUnknownCards?: boolean },
	outIgnoredCards?: string[]
): CustomCardList | SocketError {
	try {
		// FIXME: Doesn't handle MacOS line endings (\r). Note that we can't remove empty lines at this stage as other functions rely on the line index matching the original text.
		const lines = txtcardlist.split(/\r?\n/).map((s) => s.trim());
		const cardList: CustomCardList = {
			customCards: null,
			layouts: false,
			slots: {},
		};
		let lineIdx = 0;
		while (lines[lineIdx] === "") ++lineIdx; // Skip heading empty lines
		// List has to start with a header if it has custom slots
		if (lines[lineIdx][0] === "[") {
			const localOptions: typeof options & {
				customCards?: {
					cards: Record<string, Card>;
					nameCache: Map<string, Card>; // Quick lookup using the name only as key
				};
			} = { ...options };
			while (lineIdx < lines.length) {
				if (!lines[lineIdx].startsWith("[") || !lines[lineIdx].endsWith("]")) {
					return ackError({
						title: `Parsing Error`,
						text: `Expected header (for section or slot), got '${lines[lineIdx]}' (line ${lineIdx + 1}).`,
					});
				}
				const header = lines[lineIdx].substring(1, lines[lineIdx].length - 1).trim();
				const lowerCaseHeader = header.toLowerCase();
				++lineIdx;
				if (lowerCaseHeader === "settings") {
					const settingsOrError = parseSettings(lines, lineIdx, txtcardlist, cardList);
					if (isSocketError(settingsOrError)) return settingsOrError;
					cardList.settings = settingsOrError.settings;
					if (settingsOrError.settings.name) cardList.name = settingsOrError.settings.name;
					lineIdx += settingsOrError.advance;
				} else if (lowerCaseHeader === "customcards") {
					const cardsOrError = parseCustomCards(lines, lineIdx, txtcardlist);
					if (isSocketError(cardsOrError)) return cardsOrError;
					if (!cardList.customCards) cardList.customCards = {};

					// Use localOptions to supply the custom cards to parseLine
					if (!localOptions.customCards)
						localOptions.customCards = { cards: cardList.customCards, nameCache: new Map() };

					for (const customCard of cardsOrError.customCards) {
						if (customCard.id in cardList.customCards)
							return ackError({
								title: `[CustomCards]`,
								text: `Duplicate card '${customCard.name}' (Full id: ${customCard.id}).`,
							});
						cardList.customCards[customCard.id] = customCard;
						if (!localOptions.customCards.nameCache.has(customCard.name))
							// Set the first printing as the canonical one
							localOptions.customCards.nameCache.set(customCard.name, customCard);
					}
					lineIdx += cardsOrError.advance;
				} else if (lowerCaseHeader === "layouts") {
					if (cardList.layouts) {
						return ackError({
							title: `Parsing Error`,
							text: `Layouts already defined, redefined on line ${lineIdx}.`,
						});
					}
					const layoutsOrError = parsePackLayoutsDeprecated(lines, lineIdx);
					if (isSocketError(layoutsOrError)) return layoutsOrError;
					lineIdx += layoutsOrError.advance;
					cardList.layouts = layoutsOrError.layouts;
				} else {
					let slotName = header;
					// Header with card count: Default layout.
					const match = header.match(/([a-zA-Z]+)\s*\((\d+)\)/);
					if (match) {
						if (cardList.layouts && !cardList.layouts["default"]) {
							return ackError({
								title: `Parsing Error`,
								text: `Default layout (defining slot sizes in their headers) and custom layouts should not be mixed.`,
							});
						}
						if (!cardList.layouts) cardList.layouts = {};
						if (!cardList.layouts["default"]) cardList.layouts["default"] = { weight: 1, slots: {} };
						slotName = match[1];
						cardList.layouts["default"].slots[slotName] = parseInt(match[2]);
					}
					cardList.slots[slotName] = {};
					while (lineIdx < lines.length && lines[lineIdx][0] !== "[") {
						if (lines[lineIdx]) {
							const result = parseLine(lines[lineIdx], localOptions);
							if (isSocketError(result)) {
								// Just ignore the missing card and add it to the list of errors
								if (localOptions?.ignoreUnknownCards) outIgnoredCards?.push(lines[lineIdx]);
								else return result;
							} else {
								const { count, cardID } = result;
								// Merge duplicate declarations
								if (Object.prototype.hasOwnProperty.call(cardList.slots[slotName], cardID))
									cardList.slots[slotName][cardID] += count;
								else cardList.slots[slotName][cardID] = count;
							}
						}
						++lineIdx;
					}
				}
			}
			// Check layout declarations
			if (cardList.layouts) {
				for (const layoutName in cardList.layouts) {
					let packSize = 0;
					for (const slotName in cardList.layouts[layoutName].slots) {
						if (!Object.prototype.hasOwnProperty.call(cardList.slots, slotName))
							return ackError({
								title: `Parsing Error`,
								text: `Layout '${layoutName}' refers to slot '${slotName}' which is not defined.`,
							});
						if (
							!isInteger(cardList.layouts[layoutName].slots[slotName]) ||
							cardList.layouts[layoutName].slots[slotName] <= 0
						)
							return ackError({
								title: `Parsing Error`,
								text: `Layout '${layoutName}' slot '${slotName}' value is invalid, must be a positive integer (got '${cardList.layouts[layoutName].slots[slotName]}').`,
							});
						packSize += cardList.layouts[layoutName].slots[slotName];
					}
					if (packSize <= 0)
						return ackError({
							title: `Parsing Error`,
							text: `Layout '${layoutName}' is empty.`,
						});
				}
			} else {
				// No explicit or default (via slot sizes) layout, expect a single slot.
				if (Object.keys(cardList.slots).length === 0)
					return ackError({
						title: `Parsing Error`,
						text: `No slot defined.`,
					});
				else if (Object.keys(cardList.slots).length !== 1)
					return ackError({
						title: `Parsing Error`,
						text: `Multiple 'default' slots defined. Merge them into a single one, or use layouts (you can define a default layout by explicitly setting slot sizes).`,
					});
			}
		} else {
			// Simple list (one card name per line)
			cardList.slots["default"] = {};
			for (const line of lines) {
				if (line) {
					const result = parseLine(line, options);
					if (isSocketError(result)) {
						// Just ignore the missing card and add it to the list of errors
						if (options?.ignoreUnknownCards) outIgnoredCards?.push(line);
						else return result; // Return error from parseLine
					} else {
						const { count, cardID } = result;
						// Merge duplicate declarations
						if (Object.prototype.hasOwnProperty.call(cardList.slots["default"], cardID))
							cardList.slots["default"][cardID] += count;
						else cardList.slots["default"][cardID] = count;
					}
				}
			}
			cardList.layouts = false;
		}
		if (options?.name) cardList.name = options.name;
		if (Object.keys(cardList.slots).every((key) => cardList.slots[key].length === 0))
			return ackError({
				title: "Empty List",
				text: `Supplied card list is empty.`,
			});
		return cardList;
	} catch (e) {
		return ackError({
			title: "Parsing Error",
			text: "An error occurred during parsing, please check you input file.",
			footer: "Full error: " + e,
		});
	}
}

const XMageLine = /(\d+) \[([^:]+):([^\]]+)\] (.*)/i;
export function XMageToArena(txt: string) {
	let r = "";
	for (const line of txt.split("\n")) {
		if (line === "") {
			r += "\n";
		} else {
			const match = XMageLine.exec(line);
			if (!match) return false;
			else r += `${match[1]} ${match[4]} (${match[2]}) ${match[3]}\n`;
		}
	}
	return r;
}

export default parseCardList;

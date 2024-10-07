import { genCustomCardID } from "./CustomCardID.js";
import { validateCustomCard } from "./CustomCards.js";
import { Card, CardID, ParameterizedDraftEffectType } from "./CardTypes.js";
import { CardsByName, CardVersionsByName, getCard, isValidCardID } from "./Cards.js";
import { CCLSettings, CustomCardList, PackLayout, Sheet, SheetName } from "./CustomCardList.js";
import { escapeHTML } from "./utils.js";
import { ackError, isSocketError, SocketError } from "./Message.js";
import {
	hasOptionalProperty,
	hasProperty,
	isAny,
	isArrayOf,
	isBoolean,
	isInteger,
	isNumber,
	isObject,
	isRecord,
	isString,
	isUnknown,
} from "./TypeChecks.js";

const lineRegex =
	/^(?:(?<count>\d+)\s+)?(?<name>[^\v\n]+?)(?:\s\((?<set>\w+)\)(?:\s+(?<number>[^+\s()]+))?)?(?:\s+\+?(F))?$/;

const CommentDelimiter = "#";
const commentRegex = /^\s*#.*$/gm;
const trailingCommasRegex = /(?<=(true|false|null|["\d}\]])\s*),(?=\s*[\]}])/g;

// Turn JSON with # comments and trailing commas into a valid JSON string.
function cleanLooseJSON(str: string): string {
	// Remove comments
	const noComments = str.replaceAll(commentRegex, "");
	// Remove trailing commas
	return noComments.replaceAll(trailingCommasRegex, "");
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

function findMatchingIgnoringComments(
	lines: string[],
	opening: string,
	closing: string
): { str: string; linesToSkip: number } | null {
	let start: { line: number; cidx: number } = { line: 0, cidx: 0 };
	let line = 0;
	let opened = 0;
	while (line < lines.length) {
		if (lines[line].startsWith(CommentDelimiter)) {
			line++;
			continue;
		}
		for (let cidx = opened === 0 ? lines[0].indexOf(opening) : 0; cidx < lines[line].length; cidx++) {
			if (lines[line][cidx] === opening) {
				if (opened === 0) {
					start = { line: line, cidx };
				}
				opened++;
			} else if (lines[line][cidx] === closing) {
				opened--;
				if (opened < 0) return null;
				if (opened === 0) {
					if (start.line === line)
						return { str: lines[start.line].substring(start.cidx, cidx + 1), linesToSkip: 1 };
					return {
						str: [
							lines[start.line].substring(start.cidx, lines[start.line].length),
							...lines.slice(start.line + 1, line).filter((l) => !l.startsWith(CommentDelimiter)),
							lines[line].substring(0, cidx + 1), // NOTE: Here we assume there's nothing else of interest on this line.
						].join("\n"),
						linesToSkip: line + 1,
					};
				}
			}
		}
		line++;
	}
	return null;
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

function extractJSON(
	lines: string[],
	startIdx: number,
	opening: string,
	closing: string
): { json: unknown; linesToSkip: number } | SocketError {
	if (lines.length <= startIdx)
		return ackError({
			title: `Unexpected End-of-File`,
			text: `Expected a JSON ${opening === "[" ? "Array" : "Object"}, got end-of-file.`,
		});
	if (lines[startIdx][0] !== opening) {
		return ackError({
			title: `Unexpected Character`,
			text: `Expected a JSON ${opening === "[" ? "Array" : "Object"}. Line ${startIdx + 1}: Expected '${opening}', got '${
				lines[startIdx + 1]
			}'.`,
		});
	}
	// Search for the section (matching closing bracket)
	const r = findMatchingIgnoringComments(lines.slice(startIdx), opening, closing);
	if (!r)
		return ackError({
			title: `Unexpected End-of-File`,
			text: `Expected '${closing}', got end-of-file.`,
		});
	const str = cleanLooseJSON(r.str);
	try {
		return { json: JSON.parse(str), linesToSkip: r.linesToSkip };
	} catch (e) {
		return ackError({
			title: `JSON Parsing Error`,
			html: jsonParsingErrorMessage(e as { message: string }, r.str),
		});
	}
}

function parseSettings(
	lines: string[],
	startIdx: number,
	customCardList: CustomCardList
): SocketError | { advance: number; settings: CCLSettings } {
	const r = extractJSON(lines, startIdx, "{", "}");
	if (isSocketError(r)) return r;
	const parsedSettings = r.json;

	const err = (text: string) => ackError({ title: `[Settings]`, text });

	if (!isObject(parsedSettings))
		return err(
			`Settings must be an object. Refer to <a href="https://draftmancer.com/cubeformat.html" target="_blank">the documentation</a> for more information.`
		);

	const settings: CCLSettings = {};

	if ("name" in parsedSettings) {
		if (!isString(parsedSettings.name)) return err(`'name' must be a string.`);
		settings.name = parsedSettings.name;
	}

	if ("cardBack" in parsedSettings) {
		if (!isString(parsedSettings.cardBack)) return err(`'cardBack' must be a string.`);
		settings.cardBack = parsedSettings.cardBack;
	}

	if ("cardTitleHeightFactor" in parsedSettings) {
		if (!isNumber(parsedSettings.cardTitleHeightFactor)) return err(`'cardTitleHeightFactor' must be a number.`);
		settings.cardTitleHeightFactor = parsedSettings.cardTitleHeightFactor;
	}

	if ("layouts" in parsedSettings) {
		const layouts: Record<string, PackLayout> = {};

		if (!isRecord(isString, isRecord(isString, isUnknown))(parsedSettings.layouts))
			return err(`'layouts' must be an object.`);

		for (const [key, value] of Object.entries(parsedSettings.layouts)) {
			if (!("weight" in value)) err(`Layout '${key}' must have a 'weight' property.`);
			if (!isInteger(value.weight)) return err(`Layout '${key}': 'weight' must be an integer.`);
			if (!("slots" in value)) return err(`Layout '${key}' must have a 'slots' property.`);

			const slots: {
				name: string;
				count: number;
				sheets: { name: SheetName; weight: number }[];
			}[] = [];

			if (isArrayOf(isObject)(value.slots)) {
				for (const slot of value.slots) {
					if (!("name" in slot)) return err(`Layout '${key}': Missing required property 'name' in slot.`);
					if (!isString(slot.name)) return err(`Layout '${key}': slot 'name' must be a string.`);
					if (!("count" in slot)) return err(`Layout '${key}': Missing required property 'count' in slot.`);
					if (!isInteger(slot.count)) return err(`Layout '${key}': slot 'count' must be an integer.`);

					const sheets: { name: SheetName; weight: number }[] = [];
					if (hasProperty("sheets", isArrayOf(isObject))(slot)) {
						for (const sheet of slot.sheets) {
							if (!("name" in sheet))
								return err(`Layout '${key}': Missing required property 'name' in sheet.`);
							if (!isString(sheet.name)) return err(`Layout '${key}': sheet 'name' must be a string.`);

							let weight = 1;
							if (hasProperty("weight", isNumber)(sheet)) {
								if (!isInteger(sheet.weight))
									return err(`Layout '${key}': sheet 'weight' must be an integer.`);
								weight = sheet.weight;
							}
							sheets.push({ name: sheet.name, weight });
						}
					} else {
						sheets.push({ name: slot.name, weight: 1 });
					}
					slots.push({ name: slot.name, count: slot.count, sheets });
				}
			} else if (isRecord(isString, isInteger)(value.slots)) {
				for (const [name, count] of Object.entries(value.slots)) {
					slots.push({ name: name, count: count, sheets: [{ name: name, weight: 1 }] });
				}
			} else {
				return err(`'slots' must be a Record<string, number> or Array<{ name: string; count: number }>.`);
			}

			layouts[key] = {
				weight: value.weight,
				slots: slots,
			};
		}

		customCardList.layouts = layouts;
	}

	if ("withReplacement" in parsedSettings) {
		if (!isBoolean(parsedSettings.withReplacement)) return err(`'withReplacement' must be a boolean.`);
		settings.withReplacement = parsedSettings.withReplacement;
	}

	if ("showSlots" in parsedSettings) {
		if (!isBoolean(parsedSettings.showSlots)) return err(`'showSlots' must be a boolean.`);
		settings.showSlots = parsedSettings.showSlots;
	}

	if ("predeterminedLayouts" in parsedSettings) {
		if (isArrayOf(isString)(parsedSettings.predeterminedLayouts)) {
			settings.predeterminedLayouts = parsedSettings.predeterminedLayouts.map((name) => {
				return [{ name: name, weight: 1 }];
			});
		} else if (isArrayOf(isArrayOf(isString))(parsedSettings.predeterminedLayouts)) {
			if (!customCardList.layouts)
				return err(`'layouts' must be declared before being referenced in 'predeterminedLayouts'.`);
			settings.predeterminedLayouts = [];
			for (const list of parsedSettings.predeterminedLayouts) {
				const layouts = [];
				for (const name of list) {
					if (!(name in customCardList.layouts))
						return err(
							`Layout '${name}' must be declared before being referenced in 'predeterminedLayouts'.`
						);
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
		} else if (isArrayOf(isArrayOf(isObject))(parsedSettings.predeterminedLayouts)) {
			settings.predeterminedLayouts = [];
			for (const list of parsedSettings.predeterminedLayouts) {
				const layouts = [];
				for (const layout of list) {
					if (!hasProperty("name", isString)(layout) || !hasProperty("weight", isInteger)(layout))
						return err(
							`Invalid entry in 'predeterminedLayouts': each entry must be of type {name: string, weight: number}.`
						);
					layouts.push({ name: layout.name, weight: layout.weight });
				}
				settings.predeterminedLayouts.push(layouts);
			}
		} else {
			return err(
				`'predeterminedLayouts' must be a (string[] | string[][] | Record<string, number>[] | {name: string, weight: number}[][]).`
			);
		}
	}

	if ("boosterSettings" in parsedSettings) {
		if (!isArrayOf(isRecord(isString, isUnknown))(parsedSettings.boosterSettings))
			return err(`Invalid 'boosterSettings' format.`);
		const boosterSettings = [];
		for (const boosterSetting of parsedSettings.boosterSettings) {
			if (
				!hasOptionalProperty("picks", isInteger)(boosterSetting) &&
				!hasOptionalProperty("picks", isArrayOf(isInteger))(boosterSetting)
			)
				return err(`'boosterSettings.picks' must be a positive integer, or an array of positive integers.`);
			if (
				!hasOptionalProperty("burns", isInteger)(boosterSetting) &&
				!hasOptionalProperty("burns", isArrayOf(isInteger))(boosterSetting)
			)
				return err(`'boosterSettings.burns' must be a positive integer, or an array of positive integers.`);

			let picks = [1];
			let burns = [0];
			if (boosterSetting.picks)
				if (isNumber(boosterSetting.picks)) picks = [boosterSetting.picks];
				else picks = boosterSetting.picks;
			if (boosterSetting.burns)
				if (isNumber(boosterSetting.burns)) burns = [boosterSetting.burns];
				else burns = boosterSetting.burns;

			if (picks.some((pick) => pick < 1))
				return err(
					`'boosterSettings.picks' must be a strictly positive integer, or an array of strictly positive integers.`
				);
			if (burns.some((burn) => burn < 0))
				return err(`'boosterSettings.burns' must be a positive integer, or an array of positive integers.`);

			boosterSettings.push({
				picks,
				burns,
			});
		}

		settings.boosterSettings = boosterSettings;
	}

	if ("layoutWithReplacement" in parsedSettings) {
		if (!isBoolean(parsedSettings.layoutWithReplacement)) return err(`'layoutWithReplacement' must be a boolean.`);
		settings.layoutWithReplacement = parsedSettings.layoutWithReplacement;
	}

	if ("boostersPerPlayer" in parsedSettings) {
		if (!isInteger(parsedSettings.boostersPerPlayer)) return err(`'boostersPerPlayer' must be a integer.`);
		settings.boostersPerPlayer = parsedSettings.boostersPerPlayer;
	}

	if ("duplicateProtection" in parsedSettings) {
		if (!isBoolean(parsedSettings.duplicateProtection)) return err(`'duplicateProtection' must be a boolean.`);
		settings.duplicateProtection = parsedSettings.duplicateProtection;
	}

	if ("colorBalance" in parsedSettings) {
		if (!isBoolean(parsedSettings.colorBalance)) return err(`'colorBalance' must be a boolean.`);
		settings.colorBalance = parsedSettings.colorBalance;
	}

	if (settings.predeterminedLayouts) {
		if (!customCardList.layouts) return err(`Layouts must be declared before setting 'predeterminedLayouts'.`);
		for (const list of settings.predeterminedLayouts) {
			for (const layout of list) {
				if (!(layout.name in customCardList.layouts)) {
					return err(`Layout '${layout.name}' in 'predeterminedLayouts' has not been declared.`);
				}
			}
		}
		// If not explicitly declared, infer boostersPerPlayer from predeterminedLayouts count.
		if (!settings.boostersPerPlayer && settings.predeterminedLayouts.length !== 3)
			settings.boostersPerPlayer = settings.predeterminedLayouts.length;
	}

	return {
		advance: r.linesToSkip,
		settings: settings,
	};
}

function parseCustomCards(lines: string[], startIdx: number) {
	const r = extractJSON(lines, startIdx, "[", "]");
	if (isSocketError(r)) return r;

	const parsedCustomCards = r.json;

	if (!isArrayOf(isRecord(isString, isAny))(parsedCustomCards))
		return ackError({
			title: `[CustomCards]`,
			html: `Custom cards must be an array of card objects. Refer to <a href="https://draftmancer.com/cubeformat.html" target="_blank">the documentation</a> for more information.`,
		});

	const customCards: Card[] = [];
	const customCardsIDs: Record<CardID, Card> = {};
	const inputsByName = new Map<string, object>(); // Track declared card names to spot duplicates (and inherit properties between printings).
	const customCardsNameCache = new Map<string, Card>();
	for (const input of parsedCustomCards) {
		let c = input;
		if (inputsByName.has(input.name)) {
			// When a second printing of a card (with the same name) is detected, copies all information from the first one.
			// This allows users to only specify a full card once and only update the related fields in other printings.
			const prev = { ...inputsByName.get(input.name) };
			// "image" and "image_uris" map to the same property. If both are present, use the updated one (i.e. ignore the previous one).
			if ("image" in input && "image_uris" in prev) delete prev.image_uris;
			if ("image_uris" in input && "image" in prev) delete prev.image;
			c = Object.assign(prev, input);
		}
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
				if (effect.type === ParameterizedDraftEffectType.AddCards) {
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
								text: `'${cid}', referenced in '${card.name}' ${effect.type} draft effect, is not a valid card.`,
							});
						effect.cards[i] = result.cardID;
						// Insert additional copies of the card if needed.
						for (let count = 1; count < result.count; ++count) {
							effect.cards.splice(++i, 0, result.cardID);
						}
					}
					// Actual card count is now known, update the 'count' field if unspecified and validate it.
					if (effect.count <= 0) effect.count = effect.cards.length;
					if (effect.count <= 0 || effect.count > effect.cards.length) {
						return ackError({
							title: `Invalid Parameter`,
							text: `Invalid 'AddCards' entry in 'draft_effects' of '${card.name}'. 'count' (${effect.count}) must be strictly positive and less than or equal to the number of cards in 'cards' (${effect.cards.length}).`,
						});
					}
				}
			}
		}
	}

	return {
		advance: r.linesToSkip,
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
		layouts[layoutName] = { weight: layoutWeight, slots: [] };
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
			layouts[layoutName].slots.push({
				name: slotMatch[2],
				count: parseInt(slotMatch[1]),
				sheets: [{ name: slotMatch[2], weight: 1 }],
			});
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
			sheets: {},
		};
		let lineIdx = 0;

		const skipEmptyLinesAndComments = () => {
			while (lines[lineIdx] === "" || lines[lineIdx].startsWith(CommentDelimiter)) {
				++lineIdx;
				if (lineIdx >= lines.length) throw new Error(`Unexpected end-of-file.`);
			}
		};
		skipEmptyLinesAndComments();

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
				skipEmptyLinesAndComments();

				if (lowerCaseHeader === "settings") {
					const settingsOrError = parseSettings(lines, lineIdx, cardList);
					if (isSocketError(settingsOrError)) return settingsOrError;
					cardList.settings = settingsOrError.settings;
					if (settingsOrError.settings.name) cardList.name = settingsOrError.settings.name;
					lineIdx += settingsOrError.advance;
					skipEmptyLinesAndComments();
				} else if (lowerCaseHeader === "customcards") {
					const cardsOrError = parseCustomCards(lines, lineIdx);
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
					skipEmptyLinesAndComments();
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
					skipEmptyLinesAndComments();
				} else {
					let sheet: Sheet = { cards: {} };
					let sheetName = header;
					const match =
						/(?<name>[a-zA-Z0-9# ]*[a-zA-Z0-9#])\s*(?<count>\(\d+\))?\s*(?<settings>\{.*\})?/.exec(header);
					if (match) {
						const { name, count, settings } = match.groups!;
						sheetName = name;
						// Header with card count: Default layout.
						if (count) {
							if (cardList.layouts && !cardList.layouts["default"]) {
								return ackError({
									title: `Parsing Error`,
									text: `Default layout (defining slot sizes in sheet headers) and custom layouts should not be mixed.`,
								});
							}
							if (!cardList.layouts) cardList.layouts = {};
							if (!cardList.layouts["default"]) cardList.layouts["default"] = { weight: 1, slots: [] };
							cardList.layouts["default"].slots.push({
								name: sheetName,
								count: parseInt(count.substring(1, count.length - 1)),
								sheets: [{ name: sheetName, weight: 1 }],
							});
						}
						// Additional options
						if (settings) {
							const parsed = JSON.parse(settings);
							if (!hasOptionalProperty("collation", isString)(parsed))
								return ackError({
									title: `Parsing Error`,
									text: `Invalid 'collation' setting for slot '${sheetName}'.`,
								});
							if (parsed.collation === "printRun") {
								if (!hasOptionalProperty("groupSize", isNumber)(parsed))
									return ackError({
										title: `Parsing Error`,
										text: `Invalid 'groupSize' setting for slot '${sheetName}'.`,
									});
								sheet = { collation: "printRun", printRun: [], groupSize: parsed.groupSize ?? 1 };
							}
						}
					}
					while (lineIdx < lines.length && lines[lineIdx][0] !== "[") {
						if (lines[lineIdx] && lines[lineIdx] !== "" && !lines[lineIdx].startsWith(CommentDelimiter)) {
							const result = parseLine(lines[lineIdx], localOptions);
							if (isSocketError(result)) {
								// Just ignore the missing card and add it to the list of errors
								if (localOptions?.ignoreUnknownCards) outIgnoredCards?.push(lines[lineIdx]);
								else return result;
							} else {
								const { count, cardID } = result;
								if (sheet.collation === "printRun") {
									for (let i = 0; i < count; ++i) sheet.printRun.push(cardID);
								} else {
									// Merge duplicate declarations
									if (Object.prototype.hasOwnProperty.call(sheet.cards, cardID))
										sheet.cards[cardID] += count;
									else sheet.cards[cardID] = count;
								}
							}
						}
						++lineIdx;
					}
					cardList.sheets[sheetName] = sheet;
				}
			}
			// Check layout declarations
			if (cardList.layouts) {
				for (const layoutName in cardList.layouts) {
					let packSize = 0;
					for (const slot of cardList.layouts[layoutName].slots) {
						for (const sheet of slot.sheets) {
							if (!Object.prototype.hasOwnProperty.call(cardList.sheets, sheet.name))
								return ackError({
									title: `Parsing Error`,
									text: `Layout '${layoutName}' refers to slot '${sheet.name}' which is not defined.`,
								});
						}
						if (!isInteger(slot.count) || slot.count <= 0)
							return ackError({
								title: `Parsing Error`,
								text: `Layout '${layoutName}' slot '${slot.name}' value is invalid, must be a positive integer (got '${slot.count}').`,
							});
						packSize += slot.count;
					}
					if (packSize <= 0)
						return ackError({
							title: `Parsing Error`,
							text: `Layout '${layoutName}' is empty.`,
						});
				}
			} else {
				// No explicit or default (via slot sizes) layout, expect a single slot.
				if (Object.keys(cardList.sheets).length === 0)
					return ackError({
						title: `Parsing Error`,
						text: `No slot defined.`,
					});
				else if (Object.keys(cardList.sheets).length !== 1)
					return ackError({
						title: `Parsing Error`,
						text: `Multiple 'default' slots defined. Merge them into a single one, or use layouts (you can define a default layout by explicitly setting slot sizes).`,
					});
			}
		} else {
			// Simple list (one card name per line)
			cardList.sheets["default"] = {
				cards: {},
			};
			for (const line of lines) {
				if (line) {
					if (line.startsWith(CommentDelimiter)) {
						// Ignore everything after maybeboard header output by CubeCobra exporter.
						if (line === "# maybeboard") break;
						// Otherwise just skip the line.
						continue;
					}

					const result = parseLine(line, options);
					if (isSocketError(result)) {
						// Just ignore the missing card and add it to the list of errors
						if (options?.ignoreUnknownCards) outIgnoredCards?.push(line);
						else return result; // Return error from parseLine
					} else {
						const { count, cardID } = result;
						// Merge duplicate declarations
						if (Object.prototype.hasOwnProperty.call(cardList.sheets["default"].cards, cardID))
							cardList.sheets["default"].cards[cardID] += count;
						else cardList.sheets["default"].cards[cardID] = count;
					}
				}
			}
			cardList.layouts = false;
		}
		if (options?.name) cardList.name = options.name;
		if (
			Object.values(cardList.sheets).every(
				(slot) =>
					(slot.collation === "printRun" && slot.printRun.length === 0) ||
					(slot.collation !== "printRun" && Object.keys(slot.cards).length === 0)
			)
		)
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

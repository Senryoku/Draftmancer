import { validateCustomCard } from "./CustomCards.js";
import { Card, CardID, Cards, CardsByName, CardVersionsByName } from "./Cards.js";
import { CustomCardList } from "./CustomCardList.js";
import { escapeHTML, Options } from "./utils.js";
import { ackError, SocketError } from "./Message.js";

const lineRegex = /^(?:(\d+)\s+)?([^(\v\n]+)??(?:\s\((\w+)\)(?:\s+([^\+\s]+))?)?(?:\s+\+?(F))?$/;

// Returns an array with either an error as the first element or [count(int), cardID(str), foilModifier(bool)]
// Possible options:
//  - fallbackToCardName: Allow fallback to only a matching card name if exact set and/or collector number cannot be found.
export function parseLine(line: string, options: Options = { fallbackToCardName: false }) {
	line = line.trim();
	const match = line.match(lineRegex);
	if (!match) {
		return [
			ackError({
				title: `Syntax Error`,
				text: `The line '${line}' doesn't match the card syntax.`,
				footer: `Full line: '${line}'`,
			}),
			undefined,
		];
	}

	let [, countStr, name, set, number, foil] = match;
	let count = parseInt(countStr);
	if (!Number.isInteger(count)) count = 1;

	// Override with custom cards if available
	if (options.customCards && name in options.customCards) {
		return [count, name, !!foil];
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
			`You should not specify a collector number without also specifying a set: '${line}'.`
		);
	}

	// Only the name is supplied, get the prefered version of the card
	if (!set && !number && name in CardsByName) return [count, CardsByName[name], !!foil];

	// Search for the correct set and collector number
	let candidates: CardID[] = [];

	if (name in CardVersionsByName) {
		candidates = CardVersionsByName[name];
	} else if (name.split(" //")[0] in CardVersionsByName) {
		// If not found, try doubled faced cards before giving up!
		candidates = CardVersionsByName[name.split(" //")[0]];
	}

	let cardIDs = candidates.filter(
		(id) => (!set || Cards[id].set === set) && (!number || Cards[id].collector_number === number)
	);

	if (cardIDs.length > 0) {
		return [
			count,
			cardIDs.reduce((best, cid) => {
				if (parseInt(Cards[cid].collector_number) < parseInt(Cards[best].collector_number)) return cid;
				return best;
			}, cardIDs[0]),
			!!foil,
		];
	} else if (options && options.fallbackToCardName && name in CardsByName) return [count, CardsByName[name], !!foil];

	const message =
		(name in CardsByName
			? `Could not find this exact version of '${name}' (${set}) in our database, but other printings are available.`
			: `Could not find '${name}' in our database.`) +
		` If you think it should be there, please contact us via email or our Discord server.`;

	return [
		ackError({
			title: `Card not found`,
			text: message,
			footer: `Full line: '${line}'`,
		}),
		undefined,
		undefined,
	];
}

export function parseCardList(txtcardlist: string, options: { [key: string]: any }) {
	try {
		const lines = txtcardlist.split(/\r?\n/).map((s) => s.trim());
		let cardList: CustomCardList = {
			customCards: null,
			layouts: false,
			slots: {},
		};
		// Custom slots
		let lineIdx = 0;
		while (lines[lineIdx] === "") ++lineIdx; // Skip heading empty lines
		if (lines[lineIdx][0] === "[") {
			// Detect Custom Card section (must be the first section of the file.)
			if (lines[lineIdx] === "[CustomCards]") {
				if (lines.length - lineIdx < 2)
					return ackError({
						title: `[CustomCards]`,
						text: `Expected a list of custom cards, got end-of-file.`,
					});
				// Custom cards must be a JSON array
				if (lines[lineIdx + 1][0] !== "[") {
					return ackError({
						title: `[CustomCards]`,
						text: `Custom cards section must be a JSON Array. Line ${lineIdx + 1}: Expected '[', got '${
							lines[lineIdx + 1]
						}'.`,
					});
				}
				// Search for the section (matching closing bracket)
				let opened = 1;
				let index = "[CustomCards]".length + 1;
				while (txtcardlist[index] !== "[") ++index;
				const start = index;
				++index;
				while (index < txtcardlist.length && opened > 0) {
					if (txtcardlist[index] === "[") ++opened;
					else if (txtcardlist[index] === "]") --opened;
					++index;
				}
				if (opened !== 0) {
					return ackError({
						title: `[CustomCards]`,
						text: `Line ${index}: Expected ']', got end-of-file.`,
					});
				}
				let customCards = [];
				const customCardsStr = txtcardlist.substring(start, index);
				try {
					customCards = JSON.parse(customCardsStr);
				} catch (e: any) {
					let msg = `Error parsing custom cards: ${e.message}.`;
					let position = e.message.match(/at position (\d+)/);
					if (position) {
						position = parseInt(position[1]);
						msg += `<pre>${escapeHTML(
							customCardsStr.slice(Math.max(0, position - 50), Math.max(0, position - 1))
						)}<span style="color: red; text-decoration: underline red;">${escapeHTML(
							customCardsStr[position]
						)}</span>${escapeHTML(
							customCardsStr.slice(
								Math.min(position + 1, customCardsStr.length),
								Math.min(position + 50, customCardsStr.length)
							)
						)}</pre>`;
					}
					return ackError({
						title: `[CustomCards]`,
						html: msg,
					});
				}
				cardList.customCards = {};
				for (let c of customCards) {
					const cardOrError = validateCustomCard(c);
					if ((cardOrError as SocketError).error) return cardOrError as SocketError;
					const customCard = cardOrError as Card;
					if (customCard.name in cardList.customCards)
						return ackError({
							title: `[CustomCards]`,
							text: `Duplicate card '${customCard.name}'.`,
						});
					cardList.customCards[customCard.name] = customCard;
				}
				lineIdx += (customCardsStr.match(/\r\n|\n/g)?.length ?? 0) + 2; // Skip this section's lines
			}
			// List has to start with a header if it has custom slots
			while (lineIdx < lines.length) {
				if (!lines[lineIdx].startsWith("[") || !lines[lineIdx].endsWith("]")) {
					return ackError({
						title: `Parsing Error`,
						text: `Expected header (for section or slot), got '${lines[lineIdx]}' (line ${lineIdx + 1}).`,
					});
				}
				const header = lines[lineIdx].substring(1, lines[lineIdx].length - 1).trim();
				if (header === "Layouts") {
					if (cardList.layouts) {
						return ackError({
							title: `Parsing Error`,
							text: `Layouts already defined, redefined on line ${lineIdx + 1}.`,
						});
					}
					cardList.layouts = {};
					++lineIdx;
					while (lineIdx < lines.length && lines[lineIdx][0] !== "[") {
						let match = lines[lineIdx].match(/-\s*([a-zA-Z]+)\s*\((\d+)\)/);
						if (!match) {
							return ackError({
								title: `Parsing Error`,
								text: `Expected layout declaration (' - LayoutName (Weight)'), got '${
									lines[lineIdx]
								}' (line ${lineIdx + 1}).`,
							});
						}
						const layoutName = match[1];
						const layoutWeight = parseInt(match[2]);
						cardList.layouts[layoutName] = { weight: layoutWeight, slots: {} };
						++lineIdx;
						while (lineIdx < lines.length && lines[lineIdx][0] !== "-" && lines[lineIdx][0] !== "[") {
							let slotMatch = lines[lineIdx].match(/(\d+)\s+([a-zA-Z]+)/);
							if (!slotMatch) {
								return ackError({
									title: `Parsing Error`,
									text: `Expected slot specification (' CardCount SlotName'), got '${
										lines[lineIdx]
									}' (line ${lineIdx + 1}).`,
								});
							}
							cardList.layouts[layoutName].slots[slotMatch[2]] = parseInt(slotMatch[1]);
							++lineIdx;
						}
					}
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
					cardList.slots[slotName] = [];
					++lineIdx;
					const parseLineOptions = Object.assign({ customCards: cardList.customCards }, options);
					while (lineIdx < lines.length && lines[lineIdx][0] !== "[") {
						if (lines[lineIdx]) {
							let [countOrError, cardID] = parseLine(lines[lineIdx], parseLineOptions);
							if (typeof cardID !== "undefined") {
								for (let i = 0; i < countOrError; ++i) cardList.slots[slotName].push(cardID);
							} else return countOrError; // Return error from parseLine
						}
						++lineIdx;
					}
				}
			}
			// Check layout declarations
			if (cardList.layouts) {
				for (let layoutName in cardList.layouts) {
					for (let slotName in cardList.layouts[layoutName].slots) {
						if (!cardList.slots.hasOwnProperty(slotName)) {
							return ackError({
								title: `Parsing Error`,
								text: `Layout ${layoutName} refers to slot ${slotName} which is not defined.`,
							});
						}
					}
				}
			}
		} else {
			const cards: CardID[] = [];
			for (let line of lines) {
				if (line) {
					let [count, cardID] = parseLine(line, options);
					if (typeof cardID !== "undefined") {
						for (let i = 0; i < count; ++i) cards.push(cardID as CardID);
					} else return count; // Return error from parseLine
				}
			}
			cardList.slots["default"] = cards;
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
	for (let line of txt.split("\n")) {
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

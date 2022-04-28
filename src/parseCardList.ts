import { validateCustomCard } from "./CustomCards.js";
import { Card, CardID, Cards, CardsByName, CardVersionsByName } from "./Cards.js";
import { CustomCardList } from "./CustomCardList.js";
import { Options, APIResponse, ackError } from "./utils.js";

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
		id => (!set || Cards[id].set === set) && (!number || Cards[id].collector_number === number)
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
		const lines = txtcardlist.split(/\r\n|\n/).map(s => s.trim());
		let cardList: CustomCardList = {
			customSheets: false,
			customCards: null,
			cardsPerBooster: {},
			cards: [],
			length: 0,
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
						text: `Custom cards section must be a JSON Array. Line ${lineIdx}: Expected '[', got '${lines[lineIdx]}'.`,
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
				} catch (e) {
					let msg = `Error parsing custom cards: ${e.message}.`;
					let position = e.message.match(/at position (\d+)/);
					if (position) {
						position = parseInt(position[1]);
						msg += `<pre>${customCardsStr.slice(
							Math.max(0, position - 50),
							Math.max(0, position - 1)
						)}<span style="color: red; text-decoration: underline red;">${
							customCardsStr[position]
						}</span>${customCardsStr.slice(
							Math.min(position + 1, customCardsStr.length),
							Math.min(position + 50, customCardsStr.length)
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
					if ((cardOrError as APIResponse).error) return cardOrError as APIResponse;
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
			let cardCount = 0;
			cardList.customSheets = true;
			cardList.cards = {};
			// Groups: SlotName, '(Count)', Count
			let headerRegex = new RegExp(String.raw`\[([^\(\]]+)(\((\d+)\))?\]`);
			while (lineIdx < lines.length) {
				let header = lines[lineIdx].match(headerRegex);
				if (!header) {
					return ackError({
						title: `Slot`,
						text: `Error parsing slot '${lines[lineIdx]}' (line ${lineIdx + 1}).`,
					});
				}
				cardList.cardsPerBooster[header[1]] = parseInt(header[3]);
				cardList.cards[header[1]] = [];
				++lineIdx;
				const parseLineOptions = Object.assign({ customCards: cardList.customCards }, options);
				while (lineIdx < lines.length && lines[lineIdx][0] !== "[") {
					if (lines[lineIdx]) {
						let [count, cardID] = parseLine(lines[lineIdx], parseLineOptions);
						if (typeof cardID !== "undefined") {
							for (let i = 0; i < count; ++i) cardList.cards[header[1]].push(cardID);
							cardCount += count;
						} else return count; // Return error from parseLine
					}
					++lineIdx;
				}
			}
			cardList.length = cardCount;
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
			cardList.cards = cards;
			cardList.length = cards.length;
		}
		if (options && options.name) cardList.name = options.name;
		if (cardList.cards?.length === 0)
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

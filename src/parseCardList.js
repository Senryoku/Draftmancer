import { Cards, CardsByName, CardVersionsByName } from "./Cards.js";

const lineRegex = /^(?:(\d+)\s+)?([^(\v\n]+)??(?:\s\((\w+)\)(?:\s+(\w+))?)?\s*$/;

export const parseLine = line => {
	line = line.trim();
	const match = line.match(lineRegex);
	if(!match) {
		return [
			{
				error: {
					type: "error",
					title: `Syntax Error`,
					text: `The line '${line}' doesn't match the card syntax.`,
					footer: `Full line: '${line}'`,
				},
			},
			undefined,
		];
	}

	let [, count, name, set, number] = match;
	count = parseInt(count);
	if (!Number.isInteger(count)) count = 1;

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
	if(!set && !number && name in CardsByName)
		return [count, CardsByName[name]];

	// Search for the correct set and collector number
	let candidates = [];

	if(name in CardVersionsByName) {
		candidates = CardVersionsByName[name]
	} else if (name.split(" //")[0] in CardVersionsByName) { // If not found, try doubled faced cards before giving up!
		candidates = CardVersionsByName[name.split(" //")[0]];
	}

	let cardIDs = candidates.filter(
		id =>
			(!set || Cards[id].set === set) &&
			(!number || Cards[id].collector_number === number)
	);

	if (cardIDs.length > 0) {
		return [count, cardIDs.reduce((best, cid) => {
			if(parseInt(Cards[cid].collector_number) < parseInt(Cards[best].collector_number))
				return cid;
			return best;
		}, cardIDs[0])];
	}
	
	const message = (name in CardsByName ? `Could not find this exact version of '${name}' (${set}) in our database, but other printings are available.` : `Could not find '${name}' in our database.`) + ` If you think it should be there, please contact us via email or our Discord server.`;

	return [
		{
			error: {
				type: "error",
				title: `Card not found`,
				text: message,
				footer: `Full line: '${line}'`,
			},
		},
		undefined,
	];
};

export function parseCardList(cardlist, options) {	
	try {
		const lines = cardlist.split(/\r\n|\n/);
		let cardList = {};
		// Custom rarity sheets
		if (lines[0].trim()[0] === "[") {
			let line = 0;
			let cardCount = 0;
			cardList = {
				customSheets: true,
				cardsPerBooster: {},
				cards: {},
			};
			// Groups: SlotName, '(Count)', Count
			let headerRegex = new RegExp(String.raw`\[([^\(\]]+)(\((\d+)\))?\]`);
			while (line < lines.length) {
				let header = lines[line].match(headerRegex);
				if (!header) {
					return {
						error: {
							type: "error",
							title: `Slot`,
							text: `Error parsing slot '${lines[line]}'.`,
						},
					};
				}
				cardList.cardsPerBooster[header[1]] = parseInt(header[3]);
				cardList.cards[header[1]] = [];
				line += 1;
				while (line < lines.length && lines[line].trim()[0] !== "[") {
					if (lines[line]) {
						let [count, cardID] = parseLine(lines[line].trim());
						if (typeof cardID !== "undefined") {
							for (let i = 0; i < count; ++i) cardList.cards[header[1]].push(cardID);
							cardCount += count;
						} else return count; // Return error from parseLine
					}
					line += 1;
				}
			}
			cardList.length = cardCount;
		} else {
			cardList = {
				customSheets: false,
				cards: [],
			};
			for (let line of lines) {
				if (line) {
					let [count, cardID] = parseLine(line);
					if (typeof cardID !== "undefined") {
						for (let i = 0; i < count; ++i) cardList.cards.push(cardID);
					} else return count; // Return error from parseLine
				}
			}
			cardList.length = cardList.cards.length;
		}
		if (options && options.name) cardList.name = options.name;
		if (cardList.cards.length === 0)
			return {
				error: {
					type: "error",
					title: "Empty List",
					text: `Supplied card list is empty.`,
				},
			};
		return cardList;
	} catch (e) {
		return {
			error: {
				type: "error",
				title: "Parsing Error",
				text: "An error occurred during parsing, please check you input file.",
				footer: "Full error: " + e,
			},
		};
	}
}

export default parseCardList;
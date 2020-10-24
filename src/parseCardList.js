export default function(cards, cardlist, options) {
	const lineRegex = /^(?:(\d+)\s+)?([^(\v\n]+)??(?:\s\((\w+)\)(?:\s+(\d+))?)?\s*$/;
	const CardsIds = Object.keys(cards);
	const parseLine = line => {
		line = line.trim();
		let [, count, name, set, number] = line.match(lineRegex);
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
		let cardIDs = CardsIds.filter(
			id =>
				cards[id].name == name &&
				(!set || cards[id].set === set) &&
				(!number || cards[id].collector_number === number)
		);
		if (cardIDs.length === 0) {
			// If not found, try doubled faced cards before giving up!
			cardIDs = CardsIds.filter(
				id =>
					cards[id].name.startsWith(name + " //") &&
					(!set || cards[id].set === set) &&
					(!number || cards[id].collector_number === number)
			);
		}
		if (cardIDs.length > 0) {
			return [count, cardIDs.reduce((best, cid) => {
				if(parseInt(cards[cid].collector_number) < parseInt(cards[best].collector_number))
					return cid;
				return best;
			}, cardIDs[0])];
		}

		return [
			{
				error: {
					type: "error",
					title: `Card not found`,
					text: `Could not find '${name}' in our database. (Note: this app only supports cards from MTG Arena.)`,
					footer: `Full line: '${line}'`,
				},
			},
			undefined,
		];
	};

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

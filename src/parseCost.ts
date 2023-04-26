import { CardColor } from "./CardTypes";
import ManaSymbolsJSON from "./data/mana_symbols.json" assert { type: "json" };
import { MessageError } from "./Message.js";

type parseCostReturnType = { cmc: number; colors: CardColor[]; normalizedCost: string };
const ManaSymbols: { [key: string]: { cmc: number | null; colors: string[] } } = ManaSymbolsJSON;

const ManaSymbolMaxLength = Object.keys(ManaSymbols).reduce((max, key) => Math.max(max, key.length), 0);

export default function parseCost(cost: string): MessageError | parseCostReturnType {
	const r: parseCostReturnType = {
		cmc: 0,
		colors: [],
		normalizedCost: "",
	};
	if (!cost || cost === "") return r;

	// Use only the first part of split cards
	const frontCost = cost.includes("//") ? cost.split("//")[0].trim() : cost;

	const symbols = [];

	let index = 0;
	while (index < frontCost.length) {
		if (frontCost[index] === "{") {
			const endIdx = frontCost.indexOf("}", index);
			symbols.push(frontCost.slice(index, endIdx + 1));
			index = endIdx + 1;
		} else {
			// Not using the scryfall syntax, try to match symbols using a greedy approach
			let l = ManaSymbolMaxLength;
			while (l > 0) {
				const s = `{${frontCost.slice(index, index + l)}}`;
				if (s in ManaSymbols) {
					symbols.push(s);
					index += l;
					break;
				} else --l;
			}
			if (l === 0) {
				return new MessageError(
					"Invalid Mana Cost",
					`Error parsing mana cost '${cost}': No valid mana symbol starting by '${frontCost[index]}'. Refer to https://scryfall.com/docs/api/colors for a list of valid symbols.`
				);
			}
		}
	}

	for (const s of symbols) {
		if (!(s in ManaSymbols))
			return new MessageError(
				"Invalid Mana Cost",
				`Error parsing mana cost '${cost}': '${s}' is not a valid mana symbol. Refer to https://scryfall.com/docs/api/colors for a list of valid symbols.`
			);
		r.cmc += ManaSymbols[s].cmc ?? 0;
		r.colors = r.colors.concat(ManaSymbols[s].colors as CardColor[]);
	}

	r.normalizedCost = symbols.join("");
	r.colors = [...new Set(r.colors)]; // Remove duplicates

	return r;
}

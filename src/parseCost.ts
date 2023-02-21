import { CardColor } from "./CardTypes";
import ManaSymbolsJSON from "./data/mana_symbols.json" assert { type: "json" };
import { MessageError } from "./Message.js";

type parseCostReturnType = { cmc: number; colors: CardColor[] };
const ManaSymbols: { [key: string]: { cmc: number | null; colors: string[] } } = ManaSymbolsJSON;

export default function parseCost(cost: string): MessageError | parseCostReturnType {
	const r: parseCostReturnType = {
		cmc: 0,
		colors: [],
	};
	if (!cost || cost === "") return r;
	// Use only the first part of split cards
	const frontCost = cost.includes("//") ? cost.split("//")[0].trim() : cost;
	const symbols = frontCost.match(/({[^}]+})/g) ?? [];
	for (const s of symbols) {
		if (!(s in ManaSymbols))
			return new MessageError(
				"Invalid Mana Cost",
				`Error parsing mana cost '${cost}': '${s}' is not a valid mana symbol.`
			);
		r.cmc += ManaSymbols[s].cmc ?? 0;
		r.colors = r.colors.concat(ManaSymbols[s].colors as CardColor[]);
	}
	r.colors = [...new Set(r.colors)]; // Remove duplicates
	return r;
}

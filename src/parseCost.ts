import ManaSymbolsJSON from "./data/mana_symbols.json";

type parseCostReturnType = { cmc: number; colors: string[] };
const ManaSymbols: { [key: string]: { cmc: number | null; colors: string[] } } = ManaSymbolsJSON;

export default function parseCost(cost: string) {
	const r: parseCostReturnType = {
		cmc: 0,
		colors: [],
	};
	if (!cost || cost === "") return r;
	// Use only the first part of split cards
	if (cost.includes("//")) cost = cost.split("//")[0].trim();
	const symbols = cost.match(/({[^}]+})/g) ?? [];
	for (const s of symbols) {
		r.cmc += ManaSymbols[s].cmc ?? 0;
		r.colors = r.colors.concat(ManaSymbols[s].colors);
	}
	r.colors = [...new Set(r.colors)]; // Remove duplicates
	return r;
}

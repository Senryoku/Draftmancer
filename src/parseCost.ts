import ManaSymbols from "./data/mana_symbols.json";

export default function parseCost(cost: string) {
	let r = {
		cmc: 0,
		colors: [],
	};
	if (!cost || cost === "") return r;
	// Use only the first part of split cards
	if (cost.includes("//")) cost = cost.split("//")[0].trim();
	let symbols = cost.match(/({[^}]+})/g) ?? [];
	for (let s of symbols) {
		r.cmc += (ManaSymbols as any)[s].cmc;
		r.colors = r.colors.concat((ManaSymbols as any)[s].colors);
	}
	r.colors = [...new Set(r.colors)]; // Remove duplicates
	return r;
}

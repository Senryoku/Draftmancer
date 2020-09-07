import ManaSymbols from "../client/src/data/mana_symbols.json";

export default function parseCost(cost) {
	let r = {
		cmc: 0,
		colors: [],
	};
	// Use only the first part of split cards
	if (cost.includes("//")) cost = cost.split("//")[0].trim();
	if (!cost || cost === "") return r;
	let symbols = cost.match(/({[^}]+})/g);
	for (let s of symbols) {
		r.cmc += ManaSymbols[s].cmc;
		r.colors = r.colors.concat(ManaSymbols[s].colors);
	}
	r.colors = [...new Set(r.colors)]; // Remove duplicates
	return r;
}

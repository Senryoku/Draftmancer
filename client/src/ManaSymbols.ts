import ManaSymbolsList from "../../data/symbology.json" with { type: "json" };

const ManaRegex = /{([^}]+)}/g;

type ManaSymbol = {
	object: string;
	symbol: string;
	svg_uri: string;
	loose_variant: string | null;
	english: string;
	transposable: boolean;
	represents_mana: boolean;
	appears_in_mana_costs: boolean;
	cmc: number | null;
	funny: boolean;
	colors: string[];
	gatherer_alternates: string[] | null;
};

const ManaSymbols: { [key: string]: ManaSymbol } = {};
for (const symbol of ManaSymbolsList.data) ManaSymbols[symbol.symbol] = symbol;

function genManaSymbol(str: string) {
	if ("{" + str + "}" in ManaSymbols) {
		const el = new Image();
		el.src = ManaSymbols["{" + str + "}"].svg_uri;
		el.className = "mana-symbol";
		return el;
	}
	return null;
}

export function replaceManaSymbols(str: string) {
	return str.replace(ManaRegex, (match, group) => genManaSymbol(group)?.outerHTML.trim() ?? match);
}

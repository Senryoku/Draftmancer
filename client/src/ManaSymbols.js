const ManaRegex = /{([^}]+)}/g;
const ManaSymbols = {};
import ManaSymbolsList from "../../data/symbology.json";
for (let symbol of ManaSymbolsList.data) ManaSymbols[symbol.symbol] = symbol;

function genManaSymbol(str) {
	if ("{" + str + "}" in ManaSymbols) {
		let el = new Image();
		el.src = ManaSymbols["{" + str + "}"].svg_uri;
		el.className = "mana-symbol";
		return el;
	}
	return null;
}

export function replaceManaSymbols(str) {
	return str.replace(ManaRegex, (match, group) => genManaSymbol(group)?.outerHTML.trim() ?? match);
}

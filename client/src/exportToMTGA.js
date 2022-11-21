import Constant from "../../src/data/constants.json";

import J21MTGACollectorNumber from "../../data/J21MTGACollectorNumbers.json";

const MTGASetConversions = {
	DOM: "DAR", // DOM is called DAR in MTGA
	CON: "CONF", // CON is called CONF in MTGA
	AJMP: "JMP", // AJMP is a Scryfall only set containing cards from Jumpstart modified for Arena
};

export function fixSetCode(set) {
	let r = set.toUpperCase();
	if (r in MTGASetConversions) r = MTGASetConversions[r];
	return r;
}

function exportCardToMTGA(c, language, full) {
	let set = fixSetCode(c.set);
	let name = c.name;
	if (language in c.printed_names) name = c.printed_names[language];
	let idx = name.indexOf("//");
	// Ravnica Splits cards needs both names to be imported, others don't
	if (idx != -1) {
		if (c.set === "akr") name = name.replace("//", "///");
		else if (c.set != "grn" && c.set != "rna") name = name.substr(0, idx - 1);
	}

	// FIXME: Translate J21 Collector Numbers to MTGA, this should be avoidable
	let collector_number =
		c.set === "j21" && c.name in J21MTGACollectorNumber ? J21MTGACollectorNumber[c.name] : c.collector_number;
	if (collector_number?.startsWith("A-")) collector_number = collector_number.substr(2);

	if (full) return `1 ${name} (${set}) ${collector_number}\n`;
	else return `1 ${name}\n`;
}

const MTGAExportDefaultOptions = { preferedBasics: "", sideboardBasics: 0, full: true };

export function exportToMTGA(deck, sideboard, language, lands = null, options = MTGAExportDefaultOptions) {
	for (let key in MTGAExportDefaultOptions)
		if (!Object.prototype.hasOwnProperty.call(options, key)) options[key] = MTGAExportDefaultOptions[key];

	// Note: The importer requires the collector number, but it can be wrong and the import will succeed        ↓
	const basicsSet =
		options.full && options.preferedBasics && options.preferedBasics !== ""
			? ` (${fixSetCode(options.preferedBasics)}) 1`
			: "";

	let str = options.full ? "Deck\n" : "";
	for (let c of deck) str += exportCardToMTGA(c, language, options.full);
	if (lands) {
		for (let c in lands)
			if (lands[c] > 0) str += `${lands[c]} ${Constant.BasicLandNames[language][c]}${basicsSet}\n`;
	}
	if (sideboard && sideboard.length > 0) {
		str += options.full ? "\nSideboard\n" : "\n";
		sideboard = [...sideboard].sort((a, b) =>
			a.subtypes.includes("Lesson")
				? b.subtypes.includes("Lesson")
					? 0
					: -1
				: b.subtypes.includes("Lesson")
				? 1
				: 0
		);
		for (let c of sideboard) str += exportCardToMTGA(c, language, options.full);
		// Add some basic lands to the sideboard
		if (options.sideboardBasics && options.sideboardBasics > 0)
			for (let c of ["W", "U", "B", "R", "G"])
				str += `${options.sideboardBasics} ${Constant.BasicLandNames[language][c]}${basicsSet}\n`;
	}
	return str;
}

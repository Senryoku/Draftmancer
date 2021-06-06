import Constant from "../../src/data/constants.json";

function exportCardToMTGA(c, language, full) {
	let set = c.set.toUpperCase();
	if (set == "DOM") set = "DAR"; // DOM is called DAR in MTGA
	if (set == "CON") set = "CONF"; // CON is called CONF in MTGA
	if (set == "AJMP") set = "JMP"; // AJMP is a Scryfall only set containing cards from Jumpstart modified for Arena
	let name = c.name;
	if (language in c.printed_names) name = c.printed_names[language];
	let idx = name.indexOf("//");
	// Ravnica Splits cards needs both names to be imported, others don't
	if (idx != -1) {
		if (c.set === "akr") name = name.replace("//", "///");
		else if (c.set != "grn" && c.set != "rna") name = name.substr(0, idx - 1);
	}

	if (full) return `1 ${name} (${set}) ${c.collector_number}\n`;
	else return `1 ${name}\n`;
}

export default function exportToMTGA(deck, sideboard, language, lands, full = true) {
	let str = full ? "Deck\n" : "";
	for (let c of deck) str += exportCardToMTGA(c, language, full);
	if (lands) {
		for (let c in lands) if (lands[c] > 0) str += `${lands[c]} ${Constant.BasicLandNames[language][c]}\n`;
	}
	if (sideboard && sideboard.length > 0) {
		str += full ? "\nSideboard\n" : "\n";
		sideboard = [...sideboard].sort((a, b) =>
			a.subtypes.includes("Lesson")
				? b.subtypes.includes("Lesson")
					? 0
					: -1
				: b.subtypes.includes("Lesson")
				? 1
				: 0
		);
		for (let c of sideboard) str += exportCardToMTGA(c, language, full);
		// Add some basic lands to the sideboard
		for (let c of ["W", "U", "B", "R", "G"]) str += `10 ${Constant.BasicLandNames[language][c]}\n`;
	}
	return str;
}

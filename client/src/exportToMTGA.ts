import Constants from "../../src/Constants";

import J21MTGACollectorNumber from "../../data/J21MTGACollectorNumbers.json" assert { type: "json" };
import { Card, CardColor } from "@/CardTypes";
import { Language, SetCode } from "@/Types";

const MTGASetConversions: { [key: string]: string } = {
	DOM: "DAR", // DOM is called DAR in MTGA
	CON: "CONF", // CON is called CONF in MTGA
	AJMP: "JMP", // AJMP is a Scryfall only set containing cards from Jumpstart modified for Arena
	YMID: "Y22",
	YVOW: "Y22",
	YNEO: "Y22",
	YSNC: "Y22",
	YDMU: "Y23",
	YBRO: "Y23",
	YONE: "Y23",
	YMOM: "Y23",
	YMAT: "Y23",
};

export function fixSetCode(set: SetCode) {
	let r = set.toUpperCase();
	if (r in MTGASetConversions) r = MTGASetConversions[r];
	return r;
}

function exportCardToMTGA(c: Card, language: Language, full: boolean) {
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
		c.set === "j21" && c.name in J21MTGACollectorNumber
			? J21MTGACollectorNumber[c.name as keyof typeof J21MTGACollectorNumber]
			: c.collector_number;
	if (collector_number?.startsWith("A-")) collector_number = collector_number.substr(2);

	if (full) return `1 ${name} (${set}) ${collector_number}\n`;
	else return `1 ${name}\n`;
}

class MTGAExportOptions {
	preferredBasics: SetCode = "";
	sideboardBasics: number = 0;
	full: boolean = true;
}

export function exportToMTGA(
	deck: Card[],
	sideboard: Card[],
	language: Language,
	lands: { [c in CardColor]: number } | null = null,
	options: MTGAExportOptions = new MTGAExportOptions()
) {
	// Note: The importer requires the collector number, but it can be wrong and the import will succeed        ↓
	const basicsSet =
		options.full && options.preferredBasics && options.preferredBasics !== ""
			? ` (${fixSetCode(options.preferredBasics)}) 1`
			: "";

	let str = options.full ? "Deck\n" : "";
	for (let c of deck) str += exportCardToMTGA(c, language, options.full);
	if (lands) {
		for (let c in lands)
			if (lands[c as CardColor] > 0)
				str += `${lands[c as CardColor]} ${Constants.BasicLandNames[language][c as CardColor]}${basicsSet}\n`;
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
				str += `${options.sideboardBasics} ${Constants.BasicLandNames[language][c as CardColor]}${basicsSet}\n`;
	}
	return str;
}

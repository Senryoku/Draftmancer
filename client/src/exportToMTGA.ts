import Constants from "../../src/Constants";

import J21MTGACollectorNumber from "../../data/J21MTGACollectorNumbers.json" with { type: "json" };
import { Card, CardColor } from "@/CardTypes";
import { Language, SetCode } from "@/Types";

const MTGASetConversions: { [key: string]: string } = {
	DOM: "DAR", // DOM is called DAR in MTGA
	// CON: "CONF", // CON is called CONF in MTGA. NOTE: It seems like the Arena importer now understands 'CON', removing this conversion to improve compatibility with other software.
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
	YWOE: "Y24",
	YLCI: "Y24",
	YOTJ: "Y24",
	YBLB: "Y24",
	YDSK: "Y24",
	YFDN: "Y24",
	YDFT: "Y25",
	YTDM: "Y25",
	YEOE: "Y25",
};

export function fixSetCode(set: SetCode) {
	let r = set.toUpperCase();
	if (r in MTGASetConversions) r = MTGASetConversions[r];
	return r;
}

function MTGACardLine(c: Card, language: Language, full: boolean) {
	const set = fixSetCode(c.set);
	let name = c.name;
	if (language in c.printed_names) name = c.printed_names[language];
	const idx = name.indexOf("//");
	// Split cards need both names to be imported, but DFCs and Adventures only use the first one.
	if (idx != -1) {
		const setsWithSplitCards = ["grn", "rna", "mh2", "akr", "mkm", "dsk"];
		if (c.set === "akr") name = name.replace("//", "///");
		else if (!setsWithSplitCards.includes(c.set)) name = name.substring(0, idx - 1);
	}

	// FIXME: Translate J21 Collector Numbers to MTGA, this should be avoidable
	let collector_number =
		c.set === "j21" && c.name in J21MTGACollectorNumber
			? J21MTGACollectorNumber[c.name as keyof typeof J21MTGACollectorNumber]
			: c.collector_number;
	if (collector_number?.startsWith("A-")) collector_number = collector_number.substr(2);

	if (full) return `${name} (${set}) ${collector_number}`;
	else return `${name}`;
}

class MTGAExportOptions {
	preferredBasics: SetCode = "";
	sideboardBasics = 0;
	full = true;
}

export function exportToMTGA(
	deck: Card[],
	sideboard: Card[],
	language: Language,
	lands: { [c in CardColor]: number } | null = null,
	options: MTGAExportOptions = new MTGAExportOptions()
) {
	// Note: The importer requires the collector number, but it can be wrong and the import will succeed
	const basicsSet =
		options.full && options.preferredBasics && options.preferredBasics !== ""
			? ` (${fixSetCode(options.preferredBasics)}) 1`
			: "";

	let str = options.full ? "Deck\n" : "";

	const deckLines = new Map<string, number>();
	for (const c of deck) {
		const line = MTGACardLine(c, language, options.full);
		if (deckLines.has(line)) deckLines.set(line, deckLines.get(line)! + 1);
		else deckLines.set(line, 1);
	}
	str += [...deckLines].map((l) => `${l[1]} ${l[0]}`).join("\n");
	str += "\n";

	if (lands) {
		for (const c in lands)
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

		const sideboardLines = new Map<string, number>();
		for (const c of sideboard) {
			const line = MTGACardLine(c, language, options.full);
			if (sideboardLines.has(line)) sideboardLines.set(line, sideboardLines.get(line)! + 1);
			else sideboardLines.set(line, 1);
		}
		str += [...sideboardLines].map((l) => `${l[1]} ${l[0]}`).join("\n");
		str += "\n";

		// Add some basic lands to the sideboard
		if (options.sideboardBasics && options.sideboardBasics > 0)
			for (const c of ["W", "U", "B", "R", "G"])
				str += `${options.sideboardBasics} ${Constants.BasicLandNames[language][c as CardColor]}${basicsSet}\n`;
	}
	return str;
}

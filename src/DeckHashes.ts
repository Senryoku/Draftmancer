import crypto from "crypto";
import { CardID, DeckList, getCard } from "./Cards.js";
import constants from "./data/constants.json";

const basicNames: { [color: string]: string } = constants.BasicLandNames["en"];

function decklistToArray(decklist: DeckList, sidePrefix: string, nameFilter: (name: string) => string) {
	// Keep only the first face for two sided cards
	const filter = (name: string) => {
		const idx = name.indexOf(" //");
		if (idx !== -1) name = name.substring(0, idx);
		return nameFilter(name);
	};

	const main = [...decklist.main.map((cid: CardID) => filter(getCard(cid).name))];
	for (let c in decklist.lands) for (let i = 0; i < decklist.lands[c]; ++i) main.push(filter(basicNames[c]));

	const side = [...decklist.side.map((cid: CardID) => sidePrefix + filter(getCard(cid).name))];
	if (side.length > 0)
		for (let c of ["W", "U", "B", "R", "G"])
			for (let i = 0; i < 10; ++i) side.push(sidePrefix + filter(basicNames[c]));

	return main.concat(side).sort();
}

export function hashCockatrice(decklist: DeckList) {
	const sha1 = crypto.createHash("sha1");
	const hash = sha1.update(decklistToArray(decklist, "SB:", (n) => n.toLowerCase()).join(";")).digest("hex");
	return parseInt(hash.slice(0, 10), 16).toString(32);
}

// Magic WorkStation (Untested!)
export function hashMWS(decklist: DeckList) {
	const md5 = crypto.createHash("md5");
	const hash = md5
		.update(decklistToArray(decklist, "#", (n) => n.toUpperCase().replace(/[^A-Z]/g, "")).join(""))
		.digest("hex");
	return hash.slice(0, 8);
}

export function computeHashes(decklist: DeckList) {
	decklist.hashes = {
		cockatrice: hashCockatrice(decklist),
		mws: hashMWS(decklist),
	};
	return decklist;
}

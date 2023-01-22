import crypto from "crypto";
import { Card, CardID, DeckList } from "./Cards.js";
import constants from "./data/constants.json";

const basicNames: { [color: string]: string } = constants.BasicLandNames["en"];

function decklistToArray(
	decklist: DeckList,
	sidePrefix: string,
	nameFilter: (name: string) => string,
	options: { getCard: (cid: CardID) => Card }
) {
	// Keep only the first face for two sided cards
	const filter = (name: string) => {
		const idx = name.indexOf(" //");
		if (idx !== -1) name = name.substring(0, idx);
		return nameFilter(name);
	};

	const main = [...decklist.main.map((cid: CardID) => filter(options.getCard(cid).name))];
	if (decklist.lands)
		for (let c in decklist.lands) for (let i = 0; i < decklist.lands[c]; ++i) main.push(filter(basicNames[c]));

	const side = [...decklist.side.map((cid: CardID) => sidePrefix + filter(options.getCard(cid).name))];
	// Front-end might add some basic lands to the sideboard, but we don't have access to this information.

	return main.concat(side).sort();
}

export function hashCockatrice(decklist: DeckList, options: { getCard: (cid: CardID) => Card }) {
	const sha1 = crypto.createHash("sha1");
	const hash = sha1.update(decklistToArray(decklist, "SB:", (n) => n.toLowerCase(), options).join(";")).digest("hex");
	return parseInt(hash.slice(0, 10), 16).toString(32);
}

// Magic WorkStation (Untested!)
export function hashMWS(decklist: DeckList, options: { getCard: (cid: CardID) => Card }) {
	const md5 = crypto.createHash("md5");
	const hash = md5
		.update(decklistToArray(decklist, "#", (n) => n.toUpperCase().replace(/[^A-Z]/g, ""), options).join(""))
		.digest("hex");
	return hash.slice(0, 8);
}

export function computeHashes(decklist: DeckList, options: { getCard: (cid: CardID) => Card }) {
	decklist.hashes = {
		cockatrice: hashCockatrice(decklist, options),
		mws: hashMWS(decklist, options),
	};
	return decklist;
}

import crypto from "crypto";
import Cards from "./Cards.js";
import constants from "../client/src/data/constants.json";

function decklistToArray(decklist, sidePrefix, nameFilter) {
	// Keep only the first face for two sided cards
	const filter = name => {
		const idx = name.indexOf(" //");
		if (idx !== -1) name = name.substring(0, idx);
		return nameFilter(name);
	};

	const main = [...decklist.main.map(cid => filter(Cards[cid].name))];
	for (let c in decklist.lands)
		for (let i = 0; i < decklist.lands[c]; ++i) main.push(filter(constants.BasicLandNames["en"][c]));

	const side = [...decklist.side.map(cid => sidePrefix + filter(Cards[cid].name))];
	if (side.length > 0)
		for (let c of ["W", "U", "B", "R", "G"])
			for (let i = 0; i < 10; ++i) side.push(sidePrefix + filter(constants.BasicLandNames["en"][c]));

	return main.concat(side).sort();
}

export function hashCockatrice(decklist) {
	const sha1 = crypto.createHash("sha1");
	const hash = sha1.update(decklistToArray(decklist, "SB:", n => n.toLowerCase()).join(";")).digest("hex");
	return parseInt(hash.slice(0, 10), 16).toString(32);
}

// Magic WorkStation (Untested!)
export function hashMWS(decklist) {
	const md5 = crypto.createHash("md5");
	const hash = md5
		.update(decklistToArray(decklist, "#", n => n.toUpperCase().replace(/[^A-Z]/g, "")).join(""))
		.digest("hex");
	return hash.slice(0, 8);
}

export function computeHashes(decklist) {
	decklist.hashes = {
		cockatrice: hashCockatrice(decklist),
		mws: hashMWS(decklist),
	};
	return decklist;
}

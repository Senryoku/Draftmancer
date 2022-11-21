import axios from "axios";
import vueCardCache from "./vueCardCache.js";
import Constant from "../../src/data/constants.json";
import { fireToast } from "./alerts.js";
import { download } from "./helper.js";

// FIXME: These are copied from MTGA, no idea if they are valid.
const MTGOSetConversions = {
	DOM: "DAR",
	CON: "CONF",
	AJMP: "JMP",
};

function fixSetCode(set) {
	let r = set.toUpperCase();
	if (r in MTGOSetConversions) r = MTGOSetConversions[r];
	return r;
}

export async function exportToMTGO(deck, sideboard, options = {}) {
	fireToast("info", `Preparing MTGO deck list...`);
	const basics = {
		W: { mtgo_id: 104600, name: "Plains" },
		U: { mtgo_id: 104604, name: "Island" },
		B: { mtgo_id: 104608, name: "Swamp" },
		R: { mtgo_id: 104612, name: "Mountain" },
		G: { mtgo_id: 104616, name: "Forest" },
	};
	try {
		await vueCardCache.requestBulk([...new Set(deck.map((card) => card.id))]);
		if (sideboard) await vueCardCache.requestBulk([...new Set(sideboard.map((card) => card.id))]);
		if (options?.preferedBasics && options.preferedBasics !== "") {
			const basicsIdentifiers = ["W", "U", "B", "R", "G"].map((c) => {
				return { name: Constant.BasicLandNames["en"][c], set: fixSetCode(options.preferedBasics) };
			});
			let basicsRequest = await axios
				.post(`https://api.scryfall.com/cards/collection`, {
					identifiers: basicsIdentifiers,
				})
				.catch(() => {
					console.warn("exportDeckMTGO: Could not get requested basics, reverting to default ones.");
				});
			if (basicsRequest?.status === 200) {
				let idx = 0;
				for (let c of ["W", "U", "B", "R", "G"]) basics[c] = basicsRequest.data.data[idx++];
			}
		}
	} catch (e) {
		fireToast("error", `An error occured while requesting card information. Please try again later.`);
		console.error("exportDeckMTGO Error: ", e);
		return;
	}

	let cardsStr = "";
	const addCard = (mtgo_id, name, count = 1, sideboard = false) => {
		cardsStr += `\n  <Cards CatID="${mtgo_id}" Quantity="${count ?? 1}" Sideboard="${
			sideboard ? "true" : "false"
		}" Name="${name}" Annotation="0"/>`;
	};

	for (let card of deck) {
		let scryfall_card = vueCardCache.get(card.id);
		if (!scryfall_card.mtgo_id) {
			fireToast("error", `Card ${card.name} (${card.set}) cannot be exported to MTGO (no MTGO id).`);
			return;
		}
		addCard(scryfall_card.mtgo_id, scryfall_card.name, 1, false);
	}
	if (options?.lands)
		for (let c in options.lands)
			if (options.lands[c] > 0) addCard(basics[c].mtgo_id, basics[c].name, options.lands[c], false);

	if (sideboard && sideboard.length > 0) {
		for (let card of sideboard) {
			let scryfall_card = vueCardCache.get(card.id);
			if (!scryfall_card.mtgo_id) {
				fireToast("error", `Card ${card.name} (${card.set}) cannot be exported to MTGO (no MTGO id).`);
				return;
			}
			addCard(scryfall_card.mtgo_id, scryfall_card.name, 1, true);
		}
		if (options?.sideboardBasics > 0)
			for (let c in ["W", "U", "B", "R", "G"])
				addCard(basics[c].mtgo_id, basics[c].name, options.sideboardBasics[c], false);
	}

	let exportStr = `<?xml version="1.0" encoding="UTF-8"?>
<Deck xmlns:xsd="http://www.w3.org/2001/XMLSchema" xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance">
<NetDeckID>0</NetDeckID>
<PreconstructedDeckID>0</PreconstructedDeckID>
${cardsStr}
</Deck>
`;
	download(`DraftDeck.dek`, exportStr);
	fireToast("success", `MTGO export ready!`);
}

export default exportToMTGO;

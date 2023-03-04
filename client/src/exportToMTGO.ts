import axios from "axios";
import vueCardCache, { isReady, ScryfallCard } from "./vueCardCache";
import Constants from "../../src/Constants";
import { Alert, fireToast, loadingToast, SwalCustomClasses } from "./alerts";
import { download, escapeHTML } from "./helper";
import { Card, CardColor } from "../../src/CardTypes.js";

export async function exportToMTGO(
	deck: Card[],
	sideboard: Card[],
	options: {
		preferredBasics?: string;
		lands?: { [color in CardColor]: number };
		sideboardBasics?: number;
		filename?: string;
	} = {}
) {
	loadingToast(`Preparing MTGO deck list...`);
	const basics: { [color in CardColor]: { mtgo_id: number; name: string } } = {
		W: { mtgo_id: 104600, name: "Plains" },
		U: { mtgo_id: 104604, name: "Island" },
		B: { mtgo_id: 104608, name: "Swamp" },
		R: { mtgo_id: 104612, name: "Mountain" },
		G: { mtgo_id: 104616, name: "Forest" },
	};
	try {
		await vueCardCache.requestBulk([...new Set(deck.map((card) => card.id))]);
		if (sideboard) await vueCardCache.requestBulk([...new Set(sideboard.map((card) => card.id))]);
		if (options?.preferredBasics && options.preferredBasics !== "") {
			const basicsIdentifiers = ["W", "U", "B", "R", "G"].map((c) => {
				return { name: Constants.BasicLandNames["en"][c as CardColor], set: options.preferredBasics };
			});
			let basicsRequest = await axios
				.post(
					`https://api.scryfall.com/cards/collection`,
					{
						identifiers: basicsIdentifiers,
					},
					{ timeout: 10000 }
				)
				.catch(() => {
					console.warn("exportDeckMTGO: Could not get requested basics, reverting to default ones.");
				});

			if (basicsRequest?.status === 200) {
				let idx = 0;
				for (let c of ["W", "U", "B", "R", "G"]) basics[c as CardColor] = basicsRequest.data.data[idx++];
			}
		}
	} catch (e) {
		fireToast("error", `An error occured while requesting card information. Please try again later.`);
		console.error("exportDeckMTGO Error: ", e);
		return;
	}

	const cardsLines: string[] = [];
	const addCard = (mtgo_id: number, name: string, count = 1, sideboard = false) => {
		cardsLines.push(
			`  <Cards CatID="${mtgo_id}" Quantity="${count ?? 1}" Sideboard="${
				sideboard ? "true" : "false"
			}" Name="${name}" Annotation="0"/>`
		);
	};

	const missingCards: string[] = [];
	const addMatchingCard = async (card: Card, toSideboard: boolean) => {
		const cached_card = vueCardCache.get(card.id);
		// All cards should be available at this point.
		if (!isReady(cached_card)) {
			missingCards.push(card.name);
			return;
		}
		let scryfall_card = cached_card as ScryfallCard;

		// Exact match doesn't have an associated MTGO id, check other printings.
		if (!scryfall_card.mtgo_id) {
			const allPrintings = await axios.get(
				`https://api.scryfall.com/cards/search?q=!"${card.name}"&unique=prints`,
				{ timeout: 5000 }
			);
			if (allPrintings.status === 200 && allPrintings.data.object === "list") {
				for (const candidate of allPrintings.data.data)
					if (candidate.mtgo_id) {
						scryfall_card = candidate as ScryfallCard;
						break;
					}
			} else {
				console.error(`exportToMTGO: Unexpected response from Scryfall API for card '${card.name}'. Response:`);
				console.error(allPrintings);
			}
		}

		if (scryfall_card.mtgo_id) addCard(scryfall_card.mtgo_id, scryfall_card.name, 1, toSideboard);
		else missingCards.push(card.name); // If we were still unable to find an MTGO id, skip it and report it as missing.
	};

	// The order do not matter and we may have to issue multiple requests to find out all MTGO ids.
	// We'll avoid awaiting for each addMatchingCard call and allow firing multiple requests simultaneously.
	const addMatchingCardPromises = [];

	for (let card of deck) addMatchingCardPromises.push(addMatchingCard(card, false));

	if (options?.lands)
		for (let c in options.lands)
			if (options.lands[c as CardColor] > 0)
				addCard(
					basics[c as CardColor].mtgo_id,
					basics[c as CardColor].name,
					options.lands[c as CardColor],
					false
				);

	if (sideboard && sideboard.length > 0) {
		for (let card of sideboard) addMatchingCardPromises.push(addMatchingCard(card, true));
		if (options?.sideboardBasics && options?.sideboardBasics > 0)
			for (let c of ["W", "U", "B", "R", "G"])
				addCard(basics[c as CardColor].mtgo_id, basics[c as CardColor].name, options.sideboardBasics, false);
	}

	await Promise.all(addMatchingCardPromises); // Wait for all addMatchingCard calls to return.

	const exportStr = `<?xml version="1.0" encoding="UTF-8"?>
<Deck xmlns:xsd="http://www.w3.org/2001/XMLSchema" xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance">
  <NetDeckID>0</NetDeckID>
  <PreconstructedDeckID>0</PreconstructedDeckID>
${cardsLines.join("\n")}
</Deck>
`;
	download(options?.filename ?? `DraftDeck.dek`, exportStr);

	if (missingCards.length === 0) fireToast("success", `MTGO export ready!`);
	else
		Alert.fire(
			"Missing cards",
			"Deck partially exported to .dek format.<br />We were unable to find a suitable MTGO id for the following cards:<ul><li>" +
				missingCards.map((str) => escapeHTML(str)).join("</li><li>") +
				"</li></ul>",
			"warning"
		);
}

export default exportToMTGO;

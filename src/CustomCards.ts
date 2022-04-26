import parseCost from "./parseCost.js";
import { APIResponse, ackError } from "./utils.js";

function checkProperty(card: any, prop: string) {
	if (!(prop in card))
		return ackError({
			title: `Missing Card Property`,
			html: `Missing mandatory property '${prop}' in custom card: <pre>${JSON.stringify(card, null, 2)}</pre>`,
		});
	return null;
}

let CustomCardAutoCollectorNumber = 0;

export function validateCustomCard(card: any): APIResponse | null {
	// Check mandatory fields
	let missing =
		checkProperty(card, "name") ??
		checkProperty(card, "mana_cost") ??
		checkProperty(card, "type") ??
		checkProperty(card, "image_uris");
	if (missing) return missing;
	if (typeof card["image_uris"] !== "object" || Object.keys(card["image_uris"]).length === 0)
		return ackError({
			title: `Invalid Property`,
			html: `Invalid mandatory property 'image_uris' in custom card: <pre>${JSON.stringify(card, null, 2)}</pre>`,
		});
	// Assign default value to optional fields if missing
	if (!("id" in card)) card["id"] = card.name;
	if (!("oracle_id" in card)) card["oracle_id"] = card.name;
	if (!("colors" in card)) Object.assign(card, parseCost(card.mana_cost));
	if (!("set" in card)) card["set"] = "custom";
	if (!("collector_number" in card)) card["collector_number"] = ++CustomCardAutoCollectorNumber;
	if (!("rarity" in card)) card["rarity"] = "rare";
	if (!("subtypes" in card)) card["subtypes"] = [];
	if (!("rating" in card)) card["rating"] = 1;
	if (!("in_booster" in card)) card["in_booster"] = true;
	if (!("printed_names" in card)) card["printed_names"] = { en: card.name };
	return null;
}

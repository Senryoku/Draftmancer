import parseCost from "./parseCost.js";
import { escapeHTML } from "./utils.js";
import { Card, CardColor } from "./Cards.js";
import { ackError, SocketError } from "./Message.js";

function checkProperty(card: any, prop: string) {
	if (!(prop in card))
		return ackError({
			title: `Missing Card Property`,
			html: `Missing mandatory property '${prop}' in custom card: <pre>${escapeHTML(
				JSON.stringify(card, null, 2)
			)}</pre>`,
		});
	return null;
}

function checkPropertyType(card: any, prop: string, type: string) {
	if (typeof card[prop] !== type)
		return ackError({
			title: `Invalid Card Property`,
			html: `Property '${prop}' should be of type '${type}': <pre>${JSON.stringify(card, null, 2)}</pre>`,
		});
	return null;
}

function checkPropertyTypeOrUndefined(card: any, prop: string, type: string) {
	if (!("prop" in card)) return null;
	return checkPropertyType(card, prop, type);
}

function checkPropertyIsArrayOrUndefined(card: any, prop: string) {
	if (prop in card && !Array.isArray(card.subtypes)) {
		return ackError({
			title: `Invalid Property`,
			html: `Invalid property 'subtypes' in custom card, must be an Array. <pre>${JSON.stringify(
				card,
				null,
				2
			)}</pre>`,
		});
	}
	return null;
}

let CustomCardAutoCollectorNumber = 0;

export function validateCustomCard(inputCard: any): SocketError | Card {
	let card = new Card();
	// Check mandatory fields
	let missing =
		checkProperty(inputCard, "name") ??
		checkProperty(inputCard, "mana_cost") ??
		checkProperty(inputCard, "type") ??
		checkProperty(inputCard, "image_uris");
	if (missing) return missing;
	let typeError =
		checkPropertyType(inputCard, "name", "string") ??
		checkPropertyType(inputCard, "mana_cost", "string") ??
		checkPropertyType(inputCard, "type", "string") ??
		checkPropertyType(inputCard, "image_uris", "object") ??
		checkPropertyTypeOrUndefined(inputCard, "set", "string") ??
		checkPropertyTypeOrUndefined(inputCard, "rarity", "string") ??
		checkPropertyTypeOrUndefined(inputCard, "rating", "number") ??
		checkPropertyTypeOrUndefined(inputCard, "in_booster", "boolean") ??
		checkPropertyTypeOrUndefined(inputCard, "layout", "string") ??
		checkPropertyTypeOrUndefined(inputCard, "printed_names", "object");
	if (typeError) return typeError;
	if (Object.keys(inputCard["image_uris"]).length === 0)
		return ackError({
			title: `Invalid Property`,
			html: `Invalid mandatory property 'image_uris' in custom card: Should have at least one entry. <pre>${JSON.stringify(
				inputCard,
				null,
				2
			)}</pre>`,
		});
	if ("colors" in inputCard) {
		if (!Array.isArray(inputCard.colors) || inputCard.colors.some((c: CardColor) => !"WUBRG".includes(c))) {
			return ackError({
				title: `Invalid Property`,
				html: `Invalid mandatory property 'colors' in custom card, 'colors' should be an Array of inputCard colors (W, U, B, R or G). Leave blank to let it be automatically infered from the mana cost. <pre>${JSON.stringify(
					inputCard,
					null,
					2
				)}</pre>`,
			});
		}
	}
	if ("rarity" in inputCard) {
		const acceptedValues = ["common", "uncommon", "rare", "mythic", "special"];
		if (!acceptedValues.includes(inputCard.rarity))
			return ackError({
				title: `Invalid Property`,
				html: `Invalid mandatory property 'rarity' in custom card, must be one of [${acceptedValues.join(
					", "
				)}]. <pre>${JSON.stringify(inputCard, null, 2)}</pre>`,
			});
	}

	let arrayCheck = checkPropertyIsArrayOrUndefined(inputCard, "subtypes");
	if (arrayCheck) return arrayCheck;

	// Create the final Card object,
	// Assign default value to missing optional fields
	card.name = card.id = card.oracle_id = inputCard.name;
	let { cmc, colors } = parseCost(inputCard.mana_cost);
	card.cmc = cmc;
	card.colors = inputCard.colors ?? colors;
	card.set = inputCard.set ?? "custom";
	card.collector_number = inputCard.collector_number ?? `${++CustomCardAutoCollectorNumber}`;
	card.rarity = inputCard.rarity ?? "rare";
	card.type = inputCard.type;
	card.subtypes = inputCard.subtypes ?? [];
	card.rating = inputCard.rating ?? 0;
	card.in_booster = inputCard.in_booster ?? true;
	card.layout = inputCard.layout;
	card.printed_names = inputCard.printed_names ?? { en: inputCard.name };
	card.image_uris = inputCard.image_uris;

	if ("back" in inputCard) {
		let missing =
			checkProperty(inputCard.back, "name") ??
			checkProperty(inputCard.back, "type") ??
			checkProperty(inputCard.back, "image_uris");
		if (missing) return missing;
		let arrayCheck = checkPropertyIsArrayOrUndefined(inputCard.back, "subtypes");
		if (arrayCheck) return arrayCheck;
		card.back = {
			name: inputCard.back.name,
			type: inputCard.back.type,
			image_uris: inputCard.back.image_uris,
			printed_names: inputCard.back.printed_names ?? { en: inputCard.back.name },
			subtypes: inputCard.back.subtypes ?? [],
		};
	}

	return card;
}

import parseCost from "./parseCost.js";
import { escapeHTML } from "./utils.js";
import { Card, CardColor, CardFace, ParameterizedDraftEffectType } from "./CardTypes.js";
import { ackError, isMessageError, isSocketError, SocketAck, SocketError } from "./Message.js";
import { isCard, isDraftEffectType, isSimpleDraftEffectType } from "./CardTypeCheck.js";
import {
	hasOptionalProperty,
	hasProperty,
	isArrayOf,
	isInteger,
	isNumber,
	isObject,
	isRecord,
	isString,
	isUnion,
	isUnknown,
} from "./TypeChecks.js";
import { genCustomCardID } from "./CustomCardID.js";

function errorWithJSON(title: string, msg: string, json: unknown) {
	return ackError({
		title: title,
		html: `${msg}: <pre>${escapeHTML(JSON.stringify(json, null, 2))}</pre>`,
	});
}

function checkProperty(card: object, prop: string) {
	if (!(prop in card))
		return errorWithJSON(`Missing Card Property`, `Missing mandatory property '${prop}' in custom card`, card);
	return null;
}

function checkPropertyType(card: Record<string, unknown>, prop: string, type: string) {
	if (typeof card[prop] !== type)
		return errorWithJSON(`Invalid Card Property`, `Property '${prop}' should be of type '${type}'`, card);
	return null;
}

function checkPropertyTypeOrUndefined(card: Record<string, unknown>, prop: string, type: string | string[]) {
	if (!Object.hasOwn(card, prop)) return null;

	if (isString(type)) return checkPropertyType(card, prop, type as string);

	for (const t of type) if (checkPropertyType(card, prop, t)) return null;
	return errorWithJSON(
		`Invalid Card Property`,
		`Property '${prop}' should be of one of the following types: '${type}'`,
		card
	);
}

function checkPropertyIsArrayOrUndefined(card: Record<string, unknown>, prop: string) {
	if (Object.hasOwn(card, prop) && !Array.isArray(card[prop]))
		return errorWithJSON(`Invalid Property`, `Invalid property '${prop}' in custom card, must be an Array`, card);
	return null;
}

export function validateCustomCardFace(face: unknown): SocketError | CardFace {
	if (!isObject(face)) return errorWithJSON(`Invalid Face`, `Should be an object`, face);
	if (!hasProperty("name", isString)(face))
		return errorWithJSON(`Invalid Name`, `Face property 'name' should be a string`, face);
	if (!hasProperty("type", isString)(face))
		return errorWithJSON(`Invalid Type`, `Face property 'type' should be a string`, face);
	if (!hasProperty("image_uris", isRecord(isString, isString))(face))
		return errorWithJSON(`Invalid Images`, `Face property 'image_uris' should be a Record<string, string>`, face);
	const printed_names = hasProperty("printed_names", isRecord(isString, isString))(face)
		? face.printed_names
		: { en: face.name };
	const subtypes = hasProperty("subtypes", isArrayOf(isString))(face) ? face.subtypes : [];
	return {
		name: face.name,
		type: face.type,
		image_uris: face.image_uris,
		printed_names: printed_names,
		subtypes: subtypes,
	};
}

function validationError(inputCard: unknown, title: string, msg: string) {
	return ackError({ title: title, html: `${msg}<pre>${escapeHTML(JSON.stringify(inputCard, null, 2))}</pre>` });
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export function validateCustomCard(inputCard: any): SocketError | Card {
	// Check mandatory fields
	const missing =
		checkProperty(inputCard, "name") ??
		checkProperty(inputCard, "mana_cost") ??
		checkProperty(inputCard, "type") ??
		checkProperty(inputCard, "image_uris");
	if (missing) return missing;
	const typeError =
		checkPropertyType(inputCard, "name", "string") ??
		checkPropertyType(inputCard, "mana_cost", "string") ??
		checkPropertyType(inputCard, "type", "string") ??
		checkPropertyType(inputCard, "image_uris", "object") ??
		checkPropertyTypeOrUndefined(inputCard, "set", "string") ??
		checkPropertyTypeOrUndefined(inputCard, "rarity", "string") ??
		checkPropertyTypeOrUndefined(inputCard, "rating", "number") ??
		checkPropertyTypeOrUndefined(inputCard, "in_booster", "boolean") ??
		checkPropertyTypeOrUndefined(inputCard, "layout", "string") ??
		checkPropertyTypeOrUndefined(inputCard, "printed_names", "object") ??
		checkPropertyTypeOrUndefined(inputCard, "collector_number", "string") ??
		checkPropertyTypeOrUndefined(inputCard, "foil", "boolean") ??
		checkPropertyTypeOrUndefined(inputCard, "oracle_text", "string") ??
		checkPropertyTypeOrUndefined(inputCard, "power", ["number", "string"]) ??
		checkPropertyTypeOrUndefined(inputCard, "toughness", ["number", "string"]) ??
		checkPropertyTypeOrUndefined(inputCard, "loyalty", ["number", "string"]);
	if (typeError) return typeError;

	const valErr = validationError.bind(null, inputCard);

	if (Object.keys(inputCard["image_uris"]).length === 0)
		return valErr(
			`Invalid Property`,
			`Invalid mandatory property 'image_uris' in custom card: Should have at least one entry.`
		);
	if (!Object.keys(inputCard["image_uris"]).includes("en")) {
		return valErr(
			`Invalid Property`,
			`Invalid mandatory property 'image_uris' in custom card: Missing 'en' property.`
		);
	}
	if ("colors" in inputCard) {
		if (!Array.isArray(inputCard.colors) || inputCard.colors.some((c: CardColor) => !"WUBRG".includes(c))) {
			return valErr(
				`Invalid Property`,
				`Invalid optional property 'colors' in custom card, 'colors' should be an Array of inputCard colors (W, U, B, R or G). Leave blank to let it be automatically infered from the mana cost.`
			);
		}
	}
	if ("rarity" in inputCard) {
		const acceptedValues = ["common", "uncommon", "rare", "mythic", "special"];
		if (!acceptedValues.includes(inputCard.rarity))
			return valErr(
				`Invalid Property`,
				`Invalid mandatory property 'rarity' in custom card, must be one of [${acceptedValues.join(", ")}].`
			);
	}

	const arrayCheck = checkPropertyIsArrayOrUndefined(inputCard, "subtypes");
	if (arrayCheck) return arrayCheck;

	// Create the final Card object,
	// Assign default value to missing optional fields
	const card = new Card();
	card.is_custom = true;
	card.name = card.oracle_id = inputCard.name;
	card.set = inputCard.set ?? "custom";
	card.collector_number = inputCard.collector_number ?? "";
	card.id = genCustomCardID(card.name, card.set, card.collector_number);
	const ret = parseCost(inputCard.mana_cost);
	if (isMessageError(ret)) return new SocketAck(ret);
	const { cmc, colors, normalizedCost } = ret;
	card.mana_cost = normalizedCost;
	card.cmc = cmc;
	card.colors = inputCard.colors ?? colors;
	card.rarity = inputCard.rarity ?? "rare";
	card.type = inputCard.type;
	card.subtypes = inputCard.subtypes ?? [];
	card.rating = inputCard.rating ?? 0;
	card.in_booster = inputCard.in_booster ?? true;
	card.layout = inputCard.layout;
	card.printed_names = inputCard.printed_names ?? { en: inputCard.name };
	card.image_uris = inputCard.image_uris;
	card.foil = inputCard.foil;
	card.oracle_text = inputCard.oracle_text;
	card.power = inputCard.power;
	card.toughness = inputCard.toughness;
	card.loyalty = inputCard.loyalty;

	if ("back" in inputCard) {
		const ret = validateCustomCardFace(inputCard.back);
		if (isSocketError(ret)) return ret;
		card.back = ret;
	}

	if ("related_cards" in inputCard) {
		const arrayCheck = checkPropertyIsArrayOrUndefined(inputCard, "related_cards");
		if (arrayCheck) return arrayCheck;
		card.related_cards = [];
		for (const entry of inputCard.related_cards) {
			if (isString(entry)) {
				card.related_cards.push(entry);
			} else if (isObject(entry)) {
				const ret = validateCustomCardFace(entry);
				if (isSocketError(ret)) return ret;
				card.related_cards.push(ret);
			} else
				return valErr(
					`Invalid Property`,
					`Invalid entry in 'related_cards' of custom card, must be a string or an object.`
				);
		}
	}

	if ("draft_effects" in inputCard) {
		const arrayCheck = checkPropertyIsArrayOrUndefined(inputCard, "draft_effects");
		if (arrayCheck) return arrayCheck;
		card.draft_effects = [];
		for (const entry of inputCard.draft_effects) {
			if (isString(entry)) {
				if (!isSimpleDraftEffectType(entry))
					return valErr(
						`Invalid Property`,
						`Invalid entry '${entry}' in 'draft_effects' of custom card, must be a valid DraftEffect.`
					);
				card.draft_effects.push({ type: entry });
			} else {
				if (!hasProperty("type", isUnknown)(entry))
					return valErr(`Invalid Property`, `Missing 'type' entry in 'draft_effects' of custom card.`);
				if (!hasProperty("type", isDraftEffectType)(entry))
					return valErr(
						`Invalid Property`,
						`Invalid 'type' entry in 'draft_effects' of custom card. '${entry.type}' is not a valid Draft Effect.`
					);
				if (entry.type === ParameterizedDraftEffectType.AddCards) {
					if (!hasProperty("cards", isArrayOf(isString))(entry)) {
						return valErr(
							`Invalid Parameter`,
							`Invalid 'AddCards' entry in 'draft_effects' of custom card. Missing or invalid 'cards' parameter.`
						);
					}
					if (!hasOptionalProperty("count", isInteger)(entry)) {
						return valErr(
							`Invalid Parameter`,
							`Invalid 'AddCards' entry in 'draft_effects' of custom card. Missing or invalid 'count' parameter.`
						);
					}
					if (entry.count) {
						if (entry.count <= 0 || entry.count > entry.cards.length) {
							return valErr(
								`Invalid Parameter`,
								`Invalid 'AddCards' entry in 'draft_effects' of custom card. 'count' must be strictly positive and less than or equal to the number of cards in 'cards'.`
							);
						}
					}
					// NOTE: Full verification of the cards will be done later, once the rest of the file is parsed.
					card.draft_effects.push({
						type: entry.type,
						count: entry.count ?? entry.cards.length,
						cards: entry.cards,
					});
				} else {
					return valErr(
						`Invalid Property`,
						`Invalid entry in 'draft_effects' of custom card. Valid but unhandled type '${entry.type}'. This is probably my fault, please get in touch :)`
					);
				}
			}
		}
	}

	if (!isCard(card)) {
		console.error("Error: Invalid Custom Card after validation: ", card);
		return valErr(`Invalid Card`, `Unknown error in custom card.`);
	}
	return card;
}

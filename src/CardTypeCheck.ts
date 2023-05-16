import {
	Card,
	CardFace,
	DraftEffect,
	OnPickDraftEffect,
	OptionalOnPickDraftEffect,
	UniqueCard,
	UsableDraftEffect,
} from "./CardTypes.js";
import {
	hasOptionalProperty,
	hasProperty,
	isArrayOf,
	isBoolean,
	isObject,
	isRecord,
	isString,
	isNumber,
	isUnion,
	isSomeEnum,
} from "./TypeChecks.js";

export function isDraftEffect(str: unknown): str is DraftEffect {
	return (
		isString(str) &&
		(isSomeEnum(OnPickDraftEffect)(str) ||
			isSomeEnum(OptionalOnPickDraftEffect)(str) ||
			isSomeEnum(UsableDraftEffect)(str) ||
			["AnimusOfPredation", "CogworkGrinder"].includes(str))
	);
}

export function isCardFace(obj: unknown): obj is CardFace {
	return (
		isObject(obj) &&
		hasProperty("name", isString)(obj) &&
		hasProperty("type", isString)(obj) &&
		hasProperty("subtypes", isArrayOf(isString))(obj) &&
		hasProperty("printed_names", isRecord(isString, isString))(obj) &&
		hasProperty("image_uris", isRecord(isString, isString))(obj)
	);
}

export function isCard(obj: unknown): obj is Card {
	return (
		isObject(obj) &&
		hasProperty("id", isString)(obj) &&
		hasOptionalProperty("arena_id", isNumber)(obj) &&
		hasProperty("oracle_id", isString)(obj) &&
		hasProperty("name", isString)(obj) &&
		hasProperty("mana_cost", isString)(obj) &&
		hasProperty("cmc", isNumber)(obj) &&
		hasProperty("colors", isArrayOf(isString))(obj) &&
		hasProperty("set", isString)(obj) &&
		hasProperty("collector_number", isString)(obj) &&
		hasProperty("rarity", isString)(obj) &&
		hasProperty("type", isString)(obj) &&
		hasProperty("subtypes", isArrayOf(isString))(obj) &&
		hasProperty("rating", isNumber)(obj) &&
		hasProperty("in_booster", isBoolean)(obj) &&
		hasOptionalProperty("layout", isString)(obj) &&
		hasProperty("printed_names", isRecord(isString, isString))(obj) &&
		hasProperty("image_uris", isRecord(isString, isString))(obj) &&
		hasOptionalProperty("back", isCardFace)(obj) &&
		hasOptionalProperty("is_custom", isBoolean)(obj) &&
		hasOptionalProperty("related_cards", isArrayOf(isUnion(isString, isCardFace)))(obj) &&
		hasOptionalProperty("draft_effects", isArrayOf(isDraftEffect))(obj)
	);
}

export function isUniqueCard(obj: unknown): obj is UniqueCard {
	return isCard(obj) && hasProperty("uniqueID", isNumber)(obj);
}

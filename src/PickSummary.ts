import { UniqueCard } from "./CardTypes";
import { isUniqueCard } from "./CardTypeCheck.js";
import { hasProperty, isArrayOf, isNumber, isObject, isString } from "./TypeChecks.js";

export type PickSummary = { userName: string; round: number; cards: UniqueCard[] };

export function isPickSummary(data: unknown): data is PickSummary {
	return (
		isObject(data) &&
		hasProperty("userName", isString)(data) &&
		hasProperty("round", isNumber)(data) &&
		hasProperty("cards", isArrayOf(isUniqueCard))(data)
	);
}

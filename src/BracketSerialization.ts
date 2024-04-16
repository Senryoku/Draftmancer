import { copyPODProps } from "./Persistence.js";
import { isObject, hasProperty, isSomeEnum, isArrayOf, isString, isInteger } from "./TypeChecks.js";
import {
	BracketPlayer,
	BracketType,
	DoubleBracket,
	IBracket,
	Match,
	SingleBracket,
	SwissBracket,
	TeamBracket,
} from "./Brackets.js";

export function isBracketPlayer(obj: unknown): obj is BracketPlayer {
	return isObject(obj) && hasProperty("userID", isString)(obj) && hasProperty("userName", isString)(obj);
}

export function isMatch(obj: unknown): obj is Match {
	return (
		isObject(obj) &&
		hasProperty("players", isArrayOf(isInteger))(obj) &&
		hasProperty("results", isArrayOf(isInteger))(obj)
	);
}

export function isSwissBracket(obj: IBracket): obj is SwissBracket {
	return obj.type === BracketType.Swiss;
}

export function isDoubleBracket(obj: IBracket): obj is DoubleBracket {
	return obj.type === BracketType.Double;
}

export function isSingleBracket(obj: IBracket): obj is SingleBracket {
	return obj.type === BracketType.Single;
}

export function isTeamBracket(obj: IBracket): obj is TeamBracket {
	return obj.type === BracketType.Team;
}

export function deserializeBracket(data: unknown): IBracket | undefined {
	if (!isObject(data)) return;
	if (!hasProperty("type", isSomeEnum(BracketType))(data)) return;
	if (!hasProperty("players", isArrayOf(isBracketPlayer))(data)) return;
	if (!hasProperty("matches", isArrayOf(isArrayOf(isMatch)))(data)) return;
	switch (data.type) {
		case BracketType.Single: {
			const b = new SingleBracket(data.players);
			copyPODProps(data, b);
			return b;
		}
		case BracketType.Team: {
			const b = new TeamBracket(data.players);
			copyPODProps(data, b);
			return b;
		}
		case BracketType.Swiss: {
			const b = new SwissBracket(data.players);
			copyPODProps(data, b);
			return b;
		}
		case BracketType.Double: {
			const b = new DoubleBracket(data.players);
			copyPODProps(data, b);
			return b;
		}
	}
	return undefined;
}

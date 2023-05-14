import { Constants } from "../Constants.js";
import { isArrayOf, isBoolean, isInteger, isObject, isString } from "../TypeChecks.js";
import { SetCode } from "../Types";
import { DistributionMode, DraftLogRecipients } from "./SessionTypes";

// Validate session settings types and values.
export const SessionsSettingsProps: { [propName: string]: (val: unknown) => boolean } = {
	ownerIsPlayer: isBoolean,
	setRestriction(val: unknown): val is SetCode[] {
		if (!isArrayOf(isString)(val)) return false;
		for (const s of val)
			if (Constants.PrimarySets.indexOf(s) === -1) {
				console.error(`Error: Set ${s} in not marked as primary.`);
				return false;
			}
		return true;
	},
	isPublic: isBoolean,
	description: isString,
	ignoreCollections: isBoolean,
	boostersPerPlayer(val: unknown) {
		if (!isInteger(val)) return false;
		return val >= 1;
	},
	cardsPerBooster(val: unknown) {
		if (!isInteger(val)) return false;
		return val >= 1;
	},
	teamDraft: isBoolean,
	randomizeSeatingOrder: isBoolean,
	disableBotSuggestions: isBoolean,
	bots(val: unknown) {
		if (!isInteger(val)) return false;
		return val >= 0;
	},
	maxTimer(val: unknown) {
		if (!isInteger(val)) return false;
		return val >= 0;
	},
	maxPlayers(val: unknown) {
		if (!isInteger(val)) return false;
		return val >= 1;
	},
	mythicPromotion: isBoolean,
	useBoosterContent: isBoolean,
	boosterContent(val: unknown) {
		// Validate input (a value for each rarity and at least one card)
		if (!isObject(val)) return false;
		if (!["common", "uncommon", "rare", "bonus"].every((r) => r in val)) return false;
		if (Object.values(val).some((i: unknown) => !isInteger(i) || i < 0)) return false;
		if (Object.values(val).reduce((acc, val) => acc + val) <= 0) return false;
		return true;
	},
	usePredeterminedBoosters: isBoolean,
	colorBalance: isBoolean,
	maxDuplicates(val: unknown) {
		if (!isObject(val)) return false;
		if (Object.values(val).some((i) => !Number.isInteger(i))) return false;
		return true;
	},
	foil: isBoolean,
	preferredCollation(val: unknown): val is "Paper" | "MTGA" {
		if (!isString(val)) return false;
		return ["Paper", "MTGA"].includes(val);
	},
	useCustomCardList: isBoolean,
	customCardListWithReplacement: isBoolean,
	customCardList: isObject,
	distributionMode(val: unknown): val is DistributionMode {
		if (!isString(val)) return false;
		return ["regular", "shufflePlayerBoosters", "shuffleBoosterPool"].includes(val);
	},
	customBoosters: isArrayOf(isString),
	doubleMastersMode: isBoolean,
	pickedCardsPerRound(val: unknown) {
		if (!isInteger(val)) return false;
		return val >= 1;
	},
	burnedCardsPerRound(val: unknown) {
		if (!isInteger(val)) return false;
		return val >= 0;
	},
	discardRemainingCardsAt(val: unknown) {
		if (!isInteger(val)) return false;
		return val >= 0;
	},
	personalLogs: isBoolean,
	draftLogRecipients(val: unknown): val is DraftLogRecipients {
		if (!isString(val)) return false;
		return ["everyone", "delayed", "owner", "none"].includes(val);
	},
	bracketLocked: isBoolean,
	draftPaused: isBoolean,
};

export default SessionsSettingsProps;

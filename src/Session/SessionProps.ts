import Constants from "../Constants.js";
import { isBoolean, isObject, isString } from "../TypeChecks.js";

// Validate session settings types and values.
export const SessionsSettingsProps: { [propName: string]: (val: any) => boolean } = {
	ownerIsPlayer: isBoolean,
	setRestriction(val: any) {
		if (!Array.isArray(val)) return false;
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
	boostersPerPlayer(val: any) {
		if (!Number.isInteger(val)) return false;
		return val >= 1;
	},
	cardsPerBooster(val: any) {
		if (!Number.isInteger(val)) return false;
		return val >= 1;
	},
	teamDraft: isBoolean,
	randomizeSeatingOrder: isBoolean,
	disableBotSuggestions: isBoolean,
	bots(val: any) {
		if (!Number.isInteger(val)) return false;
		return val >= 0;
	},
	maxTimer(val: any) {
		if (!Number.isInteger(val)) return false;
		return val >= 0;
	},
	maxPlayers(val: any) {
		if (!Number.isInteger(val)) return false;
		return val >= 1;
	},
	mythicPromotion: isBoolean,
	useBoosterContent: isBoolean,
	boosterContent(val: any) {
		// Validate input (a value for each rarity and at least one card)
		if (!isObject(val)) return false;
		if (!["common", "uncommon", "rare", "bonus"].every((r) => r in val)) return false;
		if (Object.values(val).some((i: any) => !Number.isInteger(i) || i < 0)) return false;
		if (Object.values(val).reduce((acc, val) => acc + val) <= 0) return false;
		return true;
	},
	usePredeterminedBoosters: isBoolean,
	colorBalance: isBoolean,
	maxDuplicates(val: any) {
		if (!isObject(val)) return false;
		if (Object.values(val).some((i) => !Number.isInteger(i))) return false;
		return true;
	},
	foil: isBoolean,
	preferredCollation(val: any) {
		return ["Paper", "MTGA"].includes(val);
	},
	useCustomCardList: isBoolean,
	customCardListWithReplacement: isBoolean,
	customCardList: isObject,
	distributionMode(val: any) {
		return ["regular", "shufflePlayerBoosters", "shuffleBoosterPool"].includes(val);
	},
	customBoosters: Array.isArray,
	doubleMastersMode: isBoolean,
	pickedCardsPerRound(val: any) {
		if (!Number.isInteger(val)) return false;
		return val >= 1;
	},
	burnedCardsPerRound(val: any) {
		if (!Number.isInteger(val)) return false;
		return val >= 0;
	},
	discardRemainingCardsAt(val: any) {
		if (!Number.isInteger(val)) return false;
		return val >= 0;
	},
	personalLogs: isBoolean,
	draftLogRecipients(val: any) {
		return ["everyone", "delayed", "owner", "none"].includes(val);
	},
	bracketLocked: isBoolean,
	draftPaused: isBoolean,
};

export default SessionsSettingsProps;

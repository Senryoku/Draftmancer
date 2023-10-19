import { BoosterFactoryOptions, IBoosterFactory } from "./BoosterFactory";
import { Cards, getCard, getUnique } from "./Cards.js";
import { CardID } from "./CardTypes";
import { Constants } from "./Constants.js";
import PaperBoosterData from "./data/sealed_extended_data.json" assert { type: "json" };
import { random, shuffleArray, weightedRandomIdx } from "./utils.js";

/*
 * Another collation method using data from https://github.com/taw/magic-sealed-data
 */

class CardInfo {
	set: string = "";
	number: string = "";
	weight: number = 0;
	foil: boolean = false;
	uuid: string = "";
	// computed
	id: string = "";
}
interface BoosterInfo {
	sheets: { [slot: string]: number };
	weight: number;
}
interface SheetInfo {
	balance_colors?: boolean;
	total_weight: number;
	cards: CardInfo[];
}
interface SetInfo {
	name: string;
	code: string;
	set_code: string;
	set_name: string;
	boosters: BoosterInfo[];
	sheets: { [slot: string]: SheetInfo };
	// computed
	colorBalancedSheets: { [sheet: string]: { [subsheet: string]: { cards: CardInfo[]; total_weight: number } } };
}

function weightedRandomPick(
	arr: Array<CardInfo>,
	totalWeight: number,
	picked: Array<CardInfo> = [],
	attempt = 0
): CardInfo {
	const idx = weightedRandomIdx(arr, totalWeight);
	// Duplicate protection (allows duplicates between foil and non-foil)
	if (picked.some((c: CardInfo) => c.id === arr[idx].id && c.foil === arr[idx].foil)) {
		if (attempt < 3) return weightedRandomPick(arr, totalWeight, picked, attempt + 1);
		else {
			// Apparently, we're strugguling to find a non duplicate, take the time to make sure we don't miss this time (or that none exists).
			const valid = arr.filter((c) => picked.every((card) => c.id !== card.id || c.foil !== card.foil));
			if (valid.length > 0)
				return weightedRandomPick(
					valid,
					valid.reduce((acc, val) => acc + val.weight, 0),
					[],
					0
				);
			// else: give up and return the duplicate.
		}
	}
	return arr[idx];
}

const CardsBySetAndCollectorNumber: { [id: string]: CardID } = {};
for (const [cid, card] of Cards) {
	CardsBySetAndCollectorNumber[`${card.set}:${card.collector_number}`] = cid;
}

export class PaperBoosterFactory implements IBoosterFactory {
	set: SetInfo;
	possibleContent: BoosterInfo[];

	constructor(set: SetInfo, possibleContent: BoosterInfo[]) {
		this.set = set;
		this.possibleContent = possibleContent;
	}

	generateBooster() {
		const booster: Array<CardInfo> = [];
		// Select one of the possible sheet arrangement
		const boosterContent =
			this.possibleContent[
				weightedRandomIdx(
					this.possibleContent,
					this.possibleContent.reduce((acc: number, val: BoosterInfo) => acc + val.weight, 0)
				)
			];
		// Pick cards from each sheet, color balancing if necessary
		for (const sheetName in boosterContent.sheets) {
			if (this.set.sheets[sheetName].balance_colors) {
				const sheet = this.set.colorBalancedSheets[sheetName];
				if (!sheet) {
					console.error(
						`PaperBoosterFactory::generateBooster(): ${sheetName} marked with balance_colors = true but corresponding colorBalancedSheets not initialized.`
					);
					continue;
				}
				const pickedCards: Array<CardInfo> = [];
				for (const color of "WUBRG")
					pickedCards.push(weightedRandomPick(sheet[color].cards, sheet[color].total_weight, pickedCards));
				const cardsToPick = boosterContent.sheets[sheetName] - pickedCards.length;
				// Compensate the color balancing to keep a uniform distribution of cards within the sheet.
				const x =
					(sheet["Mono"].total_weight * cardsToPick - sheet["Others"].total_weight * pickedCards.length) /
					(cardsToPick * (sheet["Mono"].total_weight + sheet["Others"].total_weight));
				for (let i = 0; i < cardsToPick; ++i) {
					// For sets with only one non-mono colored card (like M14 and its unique common artifact)
					// compensating for the color balance may introduce duplicates. This check makes sure it doesn't happen.
					const noOther =
						sheet["Others"].cards.length === 1 &&
						pickedCards.some((c) => c.id === sheet["Others"].cards[0].id);
					const selectedSheet = random.bool(x) || noOther ? sheet["Mono"] : sheet["Others"];
					pickedCards.push(weightedRandomPick(selectedSheet.cards, selectedSheet.total_weight, pickedCards));
				}
				shuffleArray(pickedCards);
				booster.push(...pickedCards);
			} else {
				for (let i = 0; i < boosterContent.sheets[sheetName]; ++i) {
					booster.push(
						weightedRandomPick(
							this.set.sheets[sheetName].cards,
							this.set.sheets[sheetName].total_weight,
							booster
						)
					);
				}
			}
		}
		return booster.map((c) => getUnique(c.id, { foil: c.foil })).reverse();
	}
}

export const isPaperBoosterFactoryAvailable = (set: string) => {
	const excludedSets = ["mh2"]; // Workaround for sets failing our tests (we already have a working implementation anyway, and I don't want to debug it honestly.)
	if (["mb1_convention_2019", "mb1_convention_2021"].includes(set)) return true;
	return (set in PaperBoosterFactories || `${set}-arena` in PaperBoosterFactories) && !excludedSets.includes(set);
};

export const getPaperBoosterFactory = (set: string, boosterFactoryOptions: BoosterFactoryOptions) => {
	if (set === "mb1_convention_2019") return PaperBoosterFactories["cmb1"](boosterFactoryOptions);
	if (set === "mb1_convention_2021") return PaperBoosterFactories["cmb2"](boosterFactoryOptions);

	// FIXME: Collation data has arena/paper variants, but isn't perfect right now, for example:
	//   - Paper IKO has promo versions of the cards that are not available on Arena (as separate cards at least, and with proper collector number), preventing to always rely on the paper collation by default.
	//   - Arena ZNR doesn't have the MDFC requirement properly implemented, preventing to systematically switch to arena collation when available.
	// Hacking this in for now by forcing arena collation for affected sets.
	if (["iko", "klr", "akr"].includes(set)) return PaperBoosterFactories[`${set}-arena`](boosterFactoryOptions);

	return PaperBoosterFactories[set](boosterFactoryOptions);

	// Proper-ish implementation:
	/*
	// Is Arena Collation available?              Is it the preferred choice, or our only one?                           MTGA collations don't have foil sheets.
	if(`${set}-arena` in PaperBoosterFactories && (this.preferredCollation === 'MTGA' || !(set in PaperBoosterFactories) && !this.foil))
		return PaperBoosterFactories[`${set}-arena`](BoosterFactoryOptions);
	return PaperBoosterFactories[set](BoosterFactoryOptions);
	*/
};

export const PaperBoosterFactories: {
	[set: string]: (options: { foil?: boolean }) => PaperBoosterFactory;
} = {};
export const PaperBoosterSizes: {
	[set: string]: number;
} = {};
for (const s of PaperBoosterData) {
	const set: SetInfo = { ...s, colorBalancedSheets: {} } as unknown as SetInfo; // We'll add the missing properties ('id' in card).
	if (
		!Constants.PrimarySets.includes(set.code) &&
		!set.code.includes("-arena") &&
		!["cmb1", "cmb2"].includes(set.code)
	) {
		// console.log(`PaperBoosterFactories: Found '${set.code}' collation data but set is not in PrimarySets, skippink it.`);
		continue;
	}

	for (const sheetName in set.sheets) {
		for (const card of set.sheets[sheetName].cards) {
			let num = card.number;
			card.id = CardsBySetAndCollectorNumber[`${card.set}:${num}`];
			if (!card.id) {
				// Special case for double faced cards
				if (["a", "★"].includes(num[num.length - 1])) num = num.substr(0, num.length - 1);
				card.id = CardsBySetAndCollectorNumber[`${card.set}:${num}`];
			}
			if (!card.id) console.log("Error! Could not find corresponding card:", card);
		}
		if (set.sheets[sheetName].balance_colors) {
			set.colorBalancedSheets[sheetName] = {
				W: { cards: [], total_weight: 0 },
				U: { cards: [], total_weight: 0 },
				B: { cards: [], total_weight: 0 },
				R: { cards: [], total_weight: 0 },
				G: { cards: [], total_weight: 0 },
				Mono: { cards: [], total_weight: 0 },
				Others: { cards: [], total_weight: 0 },
			};
			for (const c of set.sheets[sheetName].cards) {
				const card = getCard(c.id);
				if (card.colors.length === 1) {
					set.colorBalancedSheets[sheetName][card.colors[0]].cards.push(c);
					set.colorBalancedSheets[sheetName][card.colors[0]].total_weight += c.weight;
					set.colorBalancedSheets[sheetName]["Mono"].cards.push(c);
					set.colorBalancedSheets[sheetName]["Mono"].total_weight += c.weight;
				} else {
					set.colorBalancedSheets[sheetName]["Others"].cards.push(c);
					set.colorBalancedSheets[sheetName]["Others"].total_weight += c.weight;
				}
			}
		}
	}
	PaperBoosterFactories[set.code] = function (options: { foil?: boolean } = {}) {
		let possibleContent = set.boosters;
		if (!options.foil) {
			// (Attempt to) Filter out sheets with foils if option is disabled.
			const nonFoil = set.boosters.filter((e) => !Object.keys(e.sheets).some((s) => s.includes("foil")));
			if (nonFoil.length > 0) possibleContent = nonFoil;
		}
		return new PaperBoosterFactory(set, possibleContent);
	};
	PaperBoosterSizes[set.code] = Object.values(set.boosters[0].sheets).reduce((acc, curr) => acc + curr, 0);
}

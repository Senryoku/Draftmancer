import { Card, CardID } from "./CardTypes";

export type SlotName = string;
export type SheetName = string;
export type LayoutName = string;

export type Sheet =
	| { collation: "random"; cards: Record<CardID, number> }
	| { collation: "printRun"; printRun: CardID[]; groupSize: number }
	| { collation: "striped"; sheet: CardID[]; length: number; weights: number[] };

export function getSheetCardIDs(sheet: Sheet): CardID[] {
	switch (sheet.collation) {
		case "printRun":
			return sheet.printRun;
		case "striped":
			return sheet.sheet;
		case "random":
			return Object.keys(sheet.cards);
	}
}

export type Slot = {
	name: string;
	count: number;
	foil: boolean;
	sheets: { name: SheetName; weight: number }[];
};

export type PackLayout = {
	weight: number;
	slots: Slot[];
};

export type CCLSettings = {
	cardBack?: string;
	cardTitleHeightFactor?: number;
	showSlots?: boolean;
	boosterSettings?: { picks: number[]; burns: number[] }[];
	predeterminedLayouts?: { name: LayoutName; weight: number }[][];
	layoutWithReplacement?: boolean;
	duplicateProtection?: boolean;
	// Default values for session settings when using this list. Can still be overridden by the user.
	boostersPerPlayer?: number;
	withReplacement?: boolean;
	colorBalance?: boolean;
	allowReplenishing: boolean;
};

export type CollationType = "random" | "printRun" | "striped";

export type CustomCardList = {
	name?: string;
	cubeCobraID?: string;
	sheets: Record<SheetName, Sheet>;
	layouts: Record<LayoutName, PackLayout> | false;
	customCards: Record<CardID, Card> | null;
	settings?: CCLSettings;
};

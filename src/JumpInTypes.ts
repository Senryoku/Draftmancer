import { CardID, UniqueCard } from "./CardTypes.js";

export type JumpInBoosterPattern = {
	name: string;
	colors: string[];
	cycling_land?: boolean;
	cards: CardID[];
	image?: string | null;
	alts?: {
		name: string;
		id: CardID;
		weight: number;
	}[][];
};

export type JumpInBooster = { name: string; colors: Array<string>; image?: string | null; cards: UniqueCard[] };

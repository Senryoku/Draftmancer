import { CardID } from "./Cards";

export type CustomCardList = {
	name?: string;
	cards: Array<CardID> | { [slot: string]: Array<CardID> } | null;
	length: number | null;
	cardsPerBooster: { [slot: string]: number };
	customSheets: boolean | null;
	customCards: { [cardID: string]: string } | null;
};

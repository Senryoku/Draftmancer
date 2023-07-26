import { SetCode } from "../Types";

export type QueueID = string;

export type QueueDescription = {
	id: QueueID;
	name: string;
	playerCount: number;
	description?: string;
	setCode: SetCode;
	settings?: { pickedCardsPerRound?: number };
};

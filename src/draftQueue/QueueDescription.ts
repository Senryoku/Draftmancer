import { SetCode } from "../Types";

export type QueueID = string;

export type QueueDescription = {
	id: QueueID;
	name: string;
	playerCount: number;
	description?: string;
	setCode: SetCode;
};

export const AvailableQueues: readonly QueueDescription[] = [
	{ id: "mom", name: "March of the Machine", playerCount: 8, setCode: "mom" },
	{
		id: "sir",
		name: "Shadows over Innistrad Remastered",
		playerCount: 8,
		setCode: "sir",
	},
	{ id: "one", name: "Phyrexia: All Will Be One", playerCount: 8, setCode: "one" },
];

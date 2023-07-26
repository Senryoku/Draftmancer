import { QueueDescription } from "./QueueDescription";

export const AvailableQueues: readonly QueueDescription[] = [
	{ id: "cmm", name: "Commander Masters", playerCount: 8, setCode: "cmm", settings: { pickedCardsPerRound: 2 } },
	{ id: "ltr", name: "The Lord of the Rings: Tales of Middle-earth", playerCount: 8, setCode: "ltr" },
	{ id: "mom", name: "March of the Machine", playerCount: 8, setCode: "mom" },
	// { id: "one", name: "Phyrexia: All Will Be One", playerCount: 8, setCode: "one" },
	// { id: "mat", name: "March of the Machine: the Aftermath", playerCount: 8, setCode: "mat" },
	// { id: "mid", name: "Innistrad: Midnight Hunt", playerCount: 8, setCode: "mid" },
	// { id: "sir", name: "Shadows over Innistrad Remastered", playerCount: 8, setCode: "sir", },
	// { id: "dmu", name: "Dominaria United", playerCount: 8, setCode: "dmu" },
];

if (process.env.NODE_ENV !== "production") {
	AvailableQueues[AvailableQueues.length - 1].name = "Test Queue";
	AvailableQueues[AvailableQueues.length - 1].playerCount = 2;
}

export default AvailableQueues;

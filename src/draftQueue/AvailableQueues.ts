import { QueueDescription } from "./QueueDescription";

export const AvailableQueues: readonly QueueDescription[] = [
	{ id: "blb", name: "Bloomburrow", playerCount: 8, setCode: "blb" },
	{ id: "mh3", name: "Modern Horizons 3", playerCount: 8, setCode: "mh3" },
	{ id: "otj", name: "Outlaws of Thunder Junction", playerCount: 8, setCode: "otj" },
	// { id: "mkm", name: "Murders at Karlov Manor", playerCount: 8, setCode: "mkm" },
	// { id: "ktk", name: "Khans of Tarkir", playerCount: 8, setCode: "ktk" },
	// { id: "lci", name: "The Lost Caverns of Ixalan", playerCount: 8, setCode: "lci" },
	// { id: "woe", name: "Wilds of Eldraine", playerCount: 8, setCode: "woe" },
	// { id: "cmm", name: "Commander Masters", playerCount: 8, setCode: "cmm", settings: { pickedCardsPerRound: 2 } },
	// { id: "ltr", name: "The Lord of the Rings: Tales of Middle-earth", playerCount: 8, setCode: "ltr" },
	// { id: "mom", name: "March of the Machine", playerCount: 8, setCode: "mom" },
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

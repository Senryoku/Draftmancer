export type MTGDraftBotParameters = {
	wantedModel: string;
};

export type RequestParameters = {
	pack: string[];
	picked: string[];
	seen: { packNum: number; pickNum: number; numPicks: number; pack: string[] }[];
	packNum: number;
	numPacks: number;
	pickNum: number;
	numPicks: number;
};

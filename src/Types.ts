export enum Language {
	de = "de",
	en = "en",
	es = "es",
	fr = "fr",
	it = "it",
	pt = "pt",
	ru = "ru",
	ja = "ja",
	ko = "ko",
	zhs = "zhs",
	zht = "zht",
}

export type SetCode = string;

export interface IIndexable {
	[key: string]: any;
}

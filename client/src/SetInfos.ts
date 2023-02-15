export type SetInfo = {
	code: string;
	fullName: string;
	cardCount: number;
	isPrimary: boolean;
	block?: string;
	icon: string;
	commonCount?: number;
	rareCount?: number;
	uncommonCount?: number;
};

import _setsInfos from "../public/data/SetsInfos.json";

export const SetsInfos = _setsInfos as { [code: string]: SetInfo };

export default SetsInfos;

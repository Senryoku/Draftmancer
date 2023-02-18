import { SetCode } from "../../src/Types";
import _setsInfos from "./data/SetsInfos.json";

export type SetInfo = {
	code: SetCode;
	fullName: string;
	cardCount: number;
	isPrimary: boolean;
	block?: string;
	icon: string;
	commonCount?: number;
	rareCount?: number;
	uncommonCount?: number;
};

export const SetsInfos = Object.freeze(_setsInfos) as { [code: string]: SetInfo };

export default SetsInfos;

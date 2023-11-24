import { SetCode } from "./Types";
import _setsInfos from "./data/SetsInfos.json" assert { type: "json" };

export type SetInfo = {
	code: SetCode;
	fullName: string;
	block?: string;
	icon?: string;
};

export const SetsInfos = Object.freeze(_setsInfos) as { [code: string]: SetInfo };

export default SetsInfos;

import { CardColor } from "./CardTypes";
import { SetCode } from "./Types";
import _constants from "./data/constants.json" assert { type: "json" };

export type CubeDescription = {
	name: string;
	filename?: string;
	description: string;
	cubeCobraID?: string;
	cubeArtisanID?: string;
};

export const Constants = _constants as {
	Languages: { code: string; name: string }[];
	MTGASets: SetCode[];
	AlchemySets: SetCode[];
	StandardSets: SetCode[];
	BasicLandNames: { [lang: string]: { [color in CardColor]: string } };
	CubeLists: CubeDescription[];
	PrimarySets: SetCode[];
};

export const EnglishBasicLandNames = [...Object.values(Constants.BasicLandNames["en"])];

export default Constants;

import { CardColor } from "./CardTypes";
import { SetCode } from "./Types";
import _constants from "./data/constants.json";

const Constants = _constants as {
	Languages: { code: string; name: string }[];
	MTGASets: SetCode[];
	AlchemySets: SetCode[];
	StandardSets: SetCode[];
	BasicLandNames: { [lang: string]: { [color in CardColor]: string } };
	CubeLists: {
		name: string;
		filename?: string;
		description: string;
		cubeCobraID?: string;
	}[];
	PrimarySets: SetCode[];
};

export default Constants;

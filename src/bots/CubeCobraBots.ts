import axios from "axios";
import { RequestParameters } from "./ExternalBotInterface.js";
import { hasProperty, isArrayOf, isNumber, isObject, isString } from "../TypeChecks.js";
import { OracleID } from "../CardTypes";

export const CubeCobraBots = {
	available: process.env.CUBECOBRA_BOTS_ENDPOINT !== undefined,
	endpoint: process.env.CUBECOBRA_BOTS_ENDPOINT,
};

interface PredictBody {
	pack: OracleID[]; // oracle id
	picks: OracleID[];
}

interface Response {
	prediction: { oracle: OracleID; rating: number }[];
}

function isResponse(res: unknown): res is Response {
	if (!isObject(res)) return false;
	if (!hasProperty("prediction", isArrayOf(isObject))(res)) return false;
	return res.prediction.every((p) => hasProperty("oracle", isString)(p) && hasProperty("rating", isNumber)(p));
}

export async function getScores(request: RequestParameters): Promise<number[]> {
	if (!CubeCobraBots.available || !CubeCobraBots.endpoint) throw Error("Cube Cobra bots not available.");

	const body: PredictBody = {
		pack: request.pack,
		picks: request.picked,
	};

	const response = await axios.post(CubeCobraBots.endpoint, body, { timeout: 5000 });
	if (response.status === 200) {
		const data = response.data;
		if (isResponse(data)) {
			return request.pack.map((oid) => 10.0 * (data.prediction.find((p) => p.oracle === oid)?.rating ?? 0));
		} else {
			console.error("Unexpected response from Cube Cobra bots: ", response.data);
			throw Error("Unexpected response from Cube Cobra bots.");
		}
	} else throw Error(`Error reaching Cube Cobra bots: (${response.status}) ${response.statusText}.`);
}

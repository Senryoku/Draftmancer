import axios, { AxiosError } from "axios";
import { RequestParameters } from "./ExternalBotInterface.js";
import { hasProperty, isArrayOf, isNumber, isObject, isString } from "../TypeChecks.js";
import { OracleID } from "../CardTypes";
import util from "util";
import assert from "assert";
import { chunks } from "../utils.js";

const BatchSizeLimit = 20;
const BotRequestTimeout = 10000; // ms

export const CubeCobraBots = {
	available:
		process.env.CUBECOBRA_BOTS_ENDPOINT !== undefined || process.env.CUBECOBRA_BOTS_BATCH_ENDPOINT !== undefined,
	endpoint: process.env.CUBECOBRA_BOTS_ENDPOINT,
	batchEndpoint: process.env.CUBECOBRA_BOTS_BATCH_ENDPOINT,
};

const EnableBatchRequests = CubeCobraBots.batchEndpoint !== undefined && (process.env.CUBECOBRA_BOTS_BATCH ?? true);

type Prediction = {
	oracle: OracleID;
	rating: number;
};

interface PredictBody {
	pack: OracleID[]; // oracle id
	picks: OracleID[];
}

interface PredictResponse {
	prediction: Prediction[];
}

interface BatchPredictBody {
	inputs: {
		pack: string[]; // oracle id
		picks: string[]; // oracle id
	}[];
}

interface BatchPredictResponse {
	prediction: Prediction[][];
}

function isPrediction(p: unknown): p is Prediction {
	return isObject(p) && hasProperty("oracle", isString)(p) && hasProperty("rating", isNumber)(p);
}

function isPredictResponse(res: unknown): res is PredictResponse {
	return isObject(res) && hasProperty("prediction", isArrayOf(isPrediction))(res);
}

function isBatchPredictResponse(res: unknown): res is BatchPredictResponse {
	return isObject(res) && hasProperty("prediction", isArrayOf(isArrayOf(isPrediction)))(res);
}

const requestQueue: { body: PredictBody; resolve: (res: Prediction[]) => void; reject: (err: Error) => void }[] = [];

function reportBatchError(e: unknown, chunk: typeof requestQueue) {
	if (e instanceof AxiosError) {
		console.error(`Error batch (${chunk.length}) requesting Cube Cobra bots scores: (${e.status}) ${e.message}.`);
	} else {
		console.error(`Error batch (${chunk.length}) requesting Cube Cobra bots scores: ${e}`);
	}
	for (const r of chunk) r.reject(e as Error);
}

// Process requests enqueued by requestScores.
// This is overly cautious of exceptions as it's running asynchronously.
async function processQueue() {
	if (requestQueue.length === 0) return;
	const queue = requestQueue.splice(0, requestQueue.length); // Take ownership of pending requests.
	try {
		// Revert to single request mode if we have only one request.
		if (queue.length === 1 && CubeCobraBots.endpoint)
			return singleRequest(queue[0].body).then(queue[0].resolve).catch(queue[0].reject);

		assert(CubeCobraBots.batchEndpoint);
		// Respect the batch size limit by chopping the queue into chunks.
		// We could easily send these requests in parallel, but there's no point in hammering the server.
		for (const chunk of chunks(queue, BatchSizeLimit)) {
			// If this chunk fails, the next one might still succeed.
			try {
				const body: BatchPredictBody = { inputs: chunk.map((r) => r.body) };
				const response = await axios.post(CubeCobraBots.batchEndpoint!, body, { timeout: BotRequestTimeout });
				if (!isBatchPredictResponse(response.data))
					throw new Error(
						`Unexpected response from Cube Cobra bots: ${util.inspect(response.data, false, 20)}`
					);
				for (let i = 0; i < chunk.length; i++) chunk[i].resolve(response.data.prediction[i]);
			} catch (e) {
				reportBatchError(e, chunk);
			}
		}
	} catch (e) {
		reportBatchError(e, queue);
	}
}

async function singleRequest(body: PredictBody): Promise<Prediction[]> {
	assert(CubeCobraBots.endpoint);
	const response = await axios.post(CubeCobraBots.endpoint, body, { timeout: BotRequestTimeout });
	if (!isPredictResponse(response.data))
		throw new Error(`Unexpected response from Cube Cobra bots: ${util.inspect(response.data, false, 20)}`);
	return response.data.prediction;
}

async function requestScores(body: PredictBody): Promise<Prediction[]> {
	if (EnableBatchRequests && CubeCobraBots.batchEndpoint) {
		// First request this tick: schedule their processing "soonish".
		//   Using setImmediate to allow some more requests to come in. nextTick works fine too, but
		//   would limit batching to a single session basically (all calls from a draft start for example).
		//   setImmediate is more lenient, at the cost of some latency.
		if (requestQueue.length === 0) setImmediate(processQueue);
		return new Promise<Prediction[]>((resolve, reject) => requestQueue.push({ body, resolve, reject }));
	} else if (CubeCobraBots.endpoint) {
		return singleRequest(body);
	}
	throw Error("Cube Cobra bots unavailable.");
}

export async function getScores(request: RequestParameters): Promise<number[]> {
	assert(CubeCobraBots.available);

	const body: PredictBody = {
		pack: request.pack,
		picks: request.picked,
	};

	const prediction = await requestScores(body);

	return request.pack.map((oid) => 10.0 * (prediction.find((p) => p.oracle === oid)?.rating ?? 0));
}

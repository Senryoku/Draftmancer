import { CardPool } from "./CardPool.js";
import { CardID, Card, UniqueCard } from "./CardTypes.js";
import { getUnique } from "./Cards.js";
import { cumulativeSum, random } from "./utils.js";

// TODO: Prevent multiples by name?
export function pickCard(
	cardPool: CardPool,
	booster: Array<Card> = [],
	options?: {
		withReplacement?: boolean;
		uniformAll?: boolean;
		foil?: boolean;
		duplicateProtection?: boolean;
		getCard?: (cid: CardID) => Card;
		onEmpty?: () => void; // Expected to refill the card pool
	}
): UniqueCard {
	if (cardPool.size === 0) {
		if (options?.onEmpty) {
			options.onEmpty();
			if (cardPool.size === 0) {
				console.trace(`pickCard: Card pool still empty after onEmpty() call.`);
				throw new Error(`pickCard: Card pool still empty after onEmpty() call.`);
			}
		} else {
			console.trace(`Called pickCard on an empty card pool.`);
			throw new Error(`Called pickCard on an empty card pool.`);
		}
	}
	// if uniformAll is false, distribution will be uniform across UNIQUE cards
	// (the probability of picking a card with a given ID is the same for any ID, regardeless of the number of copies)
	// if it is true, distribution will be uniform across ALL cards (for a given card ID, more copies means a higher chance to be picked).
	const uniformAll = options?.uniformAll ?? false;
	let cid = cardPool.pick(uniformAll)!;
	if (booster && options?.duplicateProtection !== false) {
		let prevention_attempts = 0;
		while (booster.findIndex((card) => cid === card.id) !== -1 && prevention_attempts < 3) {
			cid = cardPool.pick(uniformAll);
			++prevention_attempts;
		}
		// Still duplicated, don't rely on random chance anymore. Slow, but should be extremely rare (expect for pathological cases, like a cube with a single card.).
		if (booster.findIndex((card) => cid === card.id) !== -1) {
			const candidates = [...cardPool.keys()].filter(
				(cid) => booster.findIndex((card) => cid === card.id) === -1
			);
			if (candidates.length > 0) {
				const tmpPool = new CardPool();
				for (const cid of candidates) tmpPool.set(cid, cardPool.get(cid)!);
				cid = tmpPool.pick(uniformAll);
			}
		}
	}
	if (options?.withReplacement !== true) cardPool.removeCard(cid);
	return getUnique(cid, options);
}

export function pickPrintRun(
	count: number,
	printRun: CardID[],
	groupSize: number,
	options?: {
		getCard?: (cid: CardID) => Card;
	}
): UniqueCard[] {
	const startIdx = groupSize * random.integer(0, (printRun.length - 1) / groupSize);
	const cids: CardID[] = [];
	for (let i = 0; i < count; ++i) {
		const idx = (startIdx + i) % printRun.length;
		cids.push(printRun[idx]);
	}
	return cids.map((cid) => getUnique(cid, options));
}

function randomWeightedIndex(cumsumWeights: number[]): number {
	if (cumsumWeights.length <= 1 || cumsumWeights[cumsumWeights.length - 1] === 0) return 0;

	const pick = random.integer(0, cumsumWeights[cumsumWeights.length - 1] - 1);
	let index = 0;
	while (pick >= cumsumWeights[index]) ++index;
	return index;
}

// Longer stripes last longer - we're more likely to start a pack in one of them.
function pickInitialStripWidth(weights: number[]): number {
	if (weights.length <= 1) return 0;
	const adjusted: number[] = [weights[0]];
	for (let idx = 1; idx < weights.length; ++idx) adjusted.push(adjusted[idx - 1] + (1 + idx) * weights[idx]);
	return randomWeightedIndex(adjusted);
}

// https://www.lethe.xyz/mtg/collation/striped-collation.html
export function pickStriped(
	count: number,
	sheet: CardID[],
	length: number,
	weights: number[],
	options?: {
		getCard?: (cid: CardID) => Card;
	}
): UniqueCard[] {
	const cumsumWeights = cumulativeSum(weights);

	const sequence: number[] = [];
	let idx = random.integer(0, sheet.length - 1);
	let width = pickInitialStripWidth(weights) + 1;
	let depth = random.integer(1, width); // Start at a random point in sequence
	sequence.push(idx);
	for (let i = 1; i < count; ++i) {
		if (depth < width) {
			++depth;
			idx -= length; // Go up a row
		} else {
			depth = 1;
			if (idx % length > 0) {
				// Back down 'width' rows
				idx += (width - 1) * length;
			} else {
				// Unless we're at the leftmost column already, restart the sequence
				width = randomWeightedIndex(cumsumWeights) + 1;
			}
			--idx; // Go back a column
		}
		if (idx < 0) idx += sheet.length;
		idx = idx % sheet.length;
		sequence.push(idx);
	}

	return sequence.map((idx) => sheet[idx]).map((cid) => getUnique(cid, options));
}

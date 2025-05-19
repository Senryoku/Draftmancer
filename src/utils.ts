import assert from "node:assert";
import { Random, nodeCrypto } from "random-js";
export const random = new Random(nodeCrypto);

export function isEmpty(obj: object) {
	for (const _ in obj) return false;
	return true;
}

export function negMod(m: number, n: number) {
	return ((m % n) + n) % n;
}

export function sum(arr: number[]): number {
	return arr.reduce((a, b) => a + b, 0);
}

export function cumulativeSum(arr: number[]): number[] {
	const res = [arr[0]];
	for (let i = 1; i < arr.length; ++i) res.push(arr[i] + res[i - 1]);
	return res;
}

export function sumValues<T extends string | number | symbol>(obj: Record<T, number>): number {
	return sum(Object.values(obj));
}

export function getRandom<Type>(arr: Array<Type>): Type {
	return arr[random.integer(0, arr.length - 1)];
}

// Returns a random element and removes it from the array
export function pickRandom<Type>(arr: Array<Type>): Type {
	const idx = random.integer(0, arr.length - 1);
	const r = arr[idx];
	arr.splice(idx, 1);
	return r;
}

export function getNDisctinctRandom<Type>(arr: Type[], n: number): Type[] {
	return random.sample(arr, n);
}

export function getRandomMapKey<K, V>(map: Map<K, V>): K {
	let idx = random.integer(0, map.size - 1);
	for (const k of map.keys()) {
		if (idx-- === 0) return k;
	}
	return map.keys().next().value!;
}

export function getRandomKey(obj: object) {
	const keys = Object.keys(obj);
	return keys[random.integer(0, keys.length - 1)];
}

// totalWeight: Precomputed sum of all weights. Will be computed internally from arr if left undefined.
export function weightedRandomIdx<T extends { weight: number }>(arr: Array<T>, totalWeight?: number) {
	if (arr.length < 2) return 0;
	const max = totalWeight ?? arr.reduce((acc, val) => acc + val.weight, 0);
	const pick = random.integer(1, max);
	let idx = 0;
	let acc = arr[idx].weight;
	while (acc < pick) {
		++idx;
		acc += arr[idx].weight;
	}
	return idx;
}

export function chooseWeighted<T>(weights: number[], arr: T[]): T {
	assert(weights.length === arr.length);
	const cumsum = cumulativeSum(weights);
	const rarityRoll = random.real(0, cumsum[cumsum.length - 1], true);
	let idx = 0;
	while (rarityRoll > cumsum[idx]) idx += 1;
	return arr[idx];
}

// Returns [start, start + step, ..., end]
export function range(start: number, end: number, step: number = 1) {
	const len = Math.floor((end - start) / step) + 1;
	return Array(len)
		.fill(0)
		.map((_, idx) => start + idx * step);
}

// https://bl.ocks.org/lovasoa/3361645; modified to take an array of arrays as argument
export function arrayIntersect<T>(args: Array<Array<T>>) {
	if (!args.length) return [];
	if (args.length === 1) return args[0];
	let a, c, d, e, f;
	const g = [];
	const h: any = {};
	const i = args.length - 1;
	d = args[0].length;
	c = 0;
	for (a = 0; a <= i; a++) {
		e = args[a].length;
		if (e < d) {
			c = a;
			d = e;
		}
	}
	for (a = 0; a <= i; a++) {
		e = a === c ? 0 : a || c;
		f = args[e].length;
		for (let j = 0; j < f; j++) {
			const k = args[e][j];
			if (h[k] === a - 1) {
				if (a === i) {
					g.push(k);
					h[k] = 0;
				} else {
					h[k] = a;
				}
			} else if (a === 0) {
				h[k] = 0;
			}
		}
	}
	return g;
}

export function* chunks<T>(arr: T[], n: number): Generator<T[], void> {
	for (let i = 0; i < arr.length; i += n) yield arr.slice(i, i + n);
}

// From https://stackoverflow.com/a/12646864
// Modified to optionaly work only on the [start, end[ slice of array.
export function shuffleArray<T>(array: Array<T>, start = 0, end = array.length) {
	for (let i = end - 1; i > start; i--) {
		const j = start + Math.floor(random.realZeroToOneExclusive() * (i - start + 1));
		[array[i], array[j]] = [array[j], array[i]];
	}
}

export function bytesToMB(bytes: number) {
	return Math.round((bytes / 1024 / 1024) * 100) / 100;
}

export function memoryReport() {
	const mem = process.memoryUsage();
	console.log(`Memory usage`);
	console.log(`	RSS         ${bytesToMB(mem.rss)} MB`);
	console.log(`	Heap used   ${bytesToMB(mem.heapUsed)} MB`);
	console.log(`	Heap total  ${bytesToMB(mem.heapTotal)} MB`);
}

export function escapeHTML(str: string) {
	return str
		.replace(/&/g, "&amp;")
		.replace(/</g, "&lt;")
		.replace(/>/g, "&gt;")
		.replace(/"/g, "&quot;")
		.replace(/'/g, "&#39;");
}

export type Options = { [key: string]: any };

"use strict";

import randomjs from "random-js";
const random = new randomjs.Random(randomjs.nodeCrypto);

export function isEmpty(obj) {
	return obj && Object.keys(obj).length === 0 && obj.constructor === Object;
}

export function negMod(m, n) {
	return ((m % n) + n) % n;
}

export function getRandom(arr) {
	return arr[random.integer(0, arr.length - 1)];
}

export function getRandomKey(dict) {
	const keys = Object.keys(dict);
	return keys[random.integer(0, keys.length - 1)];
}

// Returns [start, start + step, ..., end]
export function range(start, end, step = 1) {
	const len = Math.floor((end - start) / step) + 1;
	return Array(len)
		.fill()
		.map((_, idx) => start + idx * step);
}

// https://bl.ocks.org/lovasoa/3361645; modified to take an array of arrays as argument
export function arrayIntersect(args) {
	if (!args.length) return [];
	if (args.length === 1) return args[0];
	var a,
		c,
		d,
		e,
		f,
		g = [],
		h = {},
		i;
	i = args.length - 1;
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
		for (var j = 0; j < f; j++) {
			var k = args[e][j];
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

// From https://stackoverflow.com/a/12646864
// Modified to optionaly work only on the [start, end[ slice of array.
export function shuffleArray(array, start = 0, end = array.length) {
	for (let i = end - 1; i > start; i--) {
		const j = start + Math.floor(Math.random() * (i - start + 1));
		[array[i], array[j]] = [array[j], array[i]];
	}
}

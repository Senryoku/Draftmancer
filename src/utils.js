"use strict";

const randomjs = require("random-js");
const random = new randomjs.Random(randomjs.nodeCrypto);

function isEmpty(obj) {
	return obj && Object.keys(obj).length === 0 && obj.constructor === Object;
}

function negMod(m, n) {
	return ((m % n) + n) % n;
}

function getRandom(arr) {
	return arr[random.integer(0, arr.length - 1)];
}

function getRandomKey(dict) {
	return Object.keys(dict)[random.integer(0, Object.keys(dict).length - 1)];
}

// Returns [start, start + step, ..., end]
function range(start, end, step = 1) {
	const len = Math.floor((end - start) / step) + 1;
	return Array(len)
		.fill()
		.map((_, idx) => start + idx * step);
}

// https://bl.ocks.org/lovasoa/3361645; modified to take an array of arrays as argument
function arrayIntersect(args) {
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
function shuffleArray(array, start = 0, end = array.length) {
	for (let i = end - 1; i > start; i--) {
		const j = start + Math.floor(Math.random() * (i - start + 1));
		[array[i], array[j]] = [array[j], array[i]];
	}
}

module.exports = {
	isEmpty: isEmpty,
	negMod: negMod,
	getRandom: getRandom,
	getRandomKey: getRandomKey,
	range: range,
	arrayIntersect: arrayIntersect,
	shuffleArray: shuffleArray,
};

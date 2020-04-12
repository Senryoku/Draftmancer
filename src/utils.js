"use strict";

const randomjs = require("random-js");
const random = new randomjs.Random(randomjs.nodeCrypto);

function isEmpty(obj) {
	return obj && Object.entries(obj).length === 0 && obj.constructor === Object;
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

// Returns [start, start + 1, ..., end]
function range(start, end) {
	return Array(end - start + 1)
		.fill()
		.map((_, idx) => start + idx);
}

module.exports = {
	isEmpty: isEmpty,
	negMod: negMod,
	getRandom: getRandom,
	getRandomKey: getRandomKey,
	range: range,
};

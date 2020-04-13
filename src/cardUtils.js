"use strict";

const removeCardFromDict = function (c, dict) {
	if (!dict || !c || !Object.keys(dict).includes(c)) {
		// FIXME: Should not be useful!
		console.error(`removeCardFromDict: ${c} not in dictionary! Dict. dump:`);
		console.error(dict);
		return;
	}
	dict[c] -= 1;
	if (dict[c] == 0) delete dict[c];
};

module.exports.removeCardFromDict = removeCardFromDict;

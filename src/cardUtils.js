"use strict";

const removeCardFromDict = function (c, dict) {
	/* // Debug
	if (!dict || !c || !Object.keys(dict).includes(c)) {
		console.error(`removeCardFromDict: ${c} not in dictionary! Dict. dump:`);
		console.error(dict);
		return;
	}
	*/
	dict[c] -= 1;
	if (dict[c] == 0) delete dict[c];
};

module.exports.removeCardFromDict = removeCardFromDict;

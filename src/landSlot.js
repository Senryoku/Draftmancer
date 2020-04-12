"use strict";

const cardUtils = require("./cardUtils");
const removeCardFromDict = cardUtils.removeCardFromDict;
const utils = require("./utils");
const getRandomKey = utils.getRandomKey;
const getRandom = utils.getRandom;
const range = utils.range;

function landSlotHandler(basicLandsIds, commonLandsIds, rate) {
	return {
		basicLandsIds: basicLandsIds,
		commonLandsIds: commonLandsIds,
		rate: rate,
		landsToDistribute: {},
		setup: function (commons) {
			for (let c of this.commonLandsIds) {
				if (c in commons) {
					this.landsToDistribute[c] = commons[c];
					delete commons[c];
				}
			}
		},
		pick: function () {
			if (Math.random() <= this.rate && Object.keys(this.landsToDistribute).length > 0) {
				let c = getRandomKey(this.landsToDistribute);
				removeCardFromDict(c, this.landsToDistribute);
				return c;
			} else {
				return getRandom(this.basicLandsIds);
			}
		},
	};
}

// Eldraine common lands appears in the standard common slot, no need for a special rule.
const LandSlot = {
	grn: landSlotHandler(
		range(68741, 68745),
		[68724, 68725, 68726, 68727, 68729, 68730, 68732, 68733, 68736, 68737],
		1
	), // Gateway Plaza (68728) appear in the common slot.
	rna: landSlotHandler(
		range(69408, 69412),
		[69391, 69392, 69397, 69398, 69400, 69401, 69403, 69404, 69405, 69406],
		1
	), // Gateway Plaza (69395) appear in the common slot.
	m19: landSlotHandler(
		range(68204, 68242, 2),
		[68178, 68182, 68184, 68186, 68188].concat(range(68194, 68202, 2)),
		1 / 2
	),
	m20: landSlotHandler(
		range(70046, 70065),
		[70027, 70028, 70029, 70030, 70033, 70053, 70036, 70037, 70044, 70045, 70031],
		1 / 2
	), // Gain Lands and Evoling Wilds (70031)
	iko: landSlotHandler(
		range(73121, 73135),
		[71314, 71310, 71311, 71313, 71316, 71319].concat(range(71321, 71325)),
		1 / 2
	), // Evoling Wilds (71314) and Gain Lands
};

module.exports = LandSlot;

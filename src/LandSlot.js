"use strict";

const cardUtils = require("./cardUtils");
const removeCardFromDict = cardUtils.removeCardFromDict;
const utils = require("./utils");
const getRandomKey = utils.getRandomKey;
const getRandom = utils.getRandom;
const range = utils.range;
const BasicLandIDs = require("../public/data/BasicLandIDs.json");

function genBasicLandSlot(set) {
	return {
		basicLandsIds: BasicLandIDs[set],
		setup: () => {},
		pick: function () {
			return getRandom(this.basicLandsIds);
		},
	};
}

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
const SpecialLandSlots = {
	grn: landSlotHandler(
		BasicLandIDs["grn"],
		[68724, 68725, 68726, 68727, 68729, 68730, 68732, 68733, 68736, 68737],
		1
	), // Gateway Plaza (68728) appear in the common slot.
	rna: landSlotHandler(
		BasicLandIDs["rna"],
		[69391, 69392, 69397, 69398, 69400, 69401, 69403, 69404, 69405, 69406],
		1
	), // Gateway Plaza (69395) appear in the common slot.
	m19: landSlotHandler(
		BasicLandIDs["m19"],
		[68178, 68182, 68184, 68186, 68188].concat(range(68194, 68202, 2)),
		1 / 2
	),
	m20: landSlotHandler(
		BasicLandIDs["m20"],
		[70027, 70028, 70030, 70033, 70035, 70036, 70037, 70043, 70044, 70045, 70031],
		1 / 2
	), // Gain Lands and Evoling Wilds (70031)
	iko: landSlotHandler(
		BasicLandIDs["iko"],
		[71314, 71310, 71311, 71313, 71316, 71319].concat(range(71321, 71325)),
		1 / 2
	), // Evoling Wilds (71314) and Gain Lands
  m21: landSlotHandler(
    BasicLandIDs["m21"],
    [72243, 72244, 72245, 72247, 72248, 72249, 72250, 72251, 72257, 72258, 72259]
    1 / 2
  ), // Gain Lands and Radiant Fountain
};

const BasicLandSlots = {};
for (let set in BasicLandIDs) BasicLandSlots[set] = genBasicLandSlot(set);

module.exports.SpecialLandSlots = SpecialLandSlots;
module.exports.BasicLandSlots = BasicLandSlots;

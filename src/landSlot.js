"use strict";

const cardUtils = require("./cardUtils");
const removeCardFromDict = cardUtils.removeCardFromDict;
const utils = require("./utils");
const getRandomKey = utils.getRandomKey;
const getRandom = utils.getRandom;
const range = utils.range;

const LandSlot = {
	iko: {
		basicLandsIds: range(73121, 73135),
		gainLandsIds: [71310, 71311, 71313, 71316, 71319].concat(range(71321, 71325)),
		gainLandsToDistribute: {},
		rate: 1 / 2,
		setup: function (commons) {
			for (let c of this.gainLandsIds) {
				if (c in commons) {
					this.gainLandsToDistribute[c] = commons[c];
					delete commons[c];
				}
			}
		},
		pick: function () {
			if (Math.random() <= this.rate && Object.keys(this.gainLandsToDistribute).length > 0) {
				let c = getRandomKey(this.gainLandsToDistribute);
				removeCardFromDict(c, this.gainLandsToDistribute);
				return c;
			} else {
				return getRandom(this.basicLandsIds);
			}
		},
	},
};

module.exports = LandSlot;

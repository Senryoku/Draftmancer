"use strict";

const Cards = require("./Cards");
const { removeCardFromDict, pickCard } = require("./cardUtils");

// Set specific rules.
// Neither DOM or WAR have specific rules for commons, so we don't have to worry about color balancing (colorBalancedSlot)
const SetBoosterRules = {
	// Exactly one Planeswalker per booster
	war: (cardpool, genericBoosterFunc) => {
		let planeswalkers = {};
		let filteredCardPool = {};
		for (let slot in cardpool) {
			filteredCardPool[slot] = {};
			for (let cid in cardpool[slot]) {
				if (Cards[cid].type.includes("Planeswalker")) planeswalkers[cid] = cardpool[slot][cid];
				else filteredCardPool[slot][cid] = cardpool[slot][cid];
			}
		}
		return {
			genericBoosterFunc: genericBoosterFunc,
			planeswalkers: planeswalkers,
			cardPool: filteredCardPool,
			// Not using the supllied cardpool here
			generateBooster: function(cardpool, colorBalancedSlot, targets, landSlot) {
				// Ignore the rule if suitable rarities are ignored, or there's no planeswalker left
				if (
					((!("uncommon" in targets) || targets["uncommon"] <= 0) &&
						(!("rare" in targets) || targets["rare"] <= 0)) ||
					Object.values(planeswalkers).length === 0 ||
					Object.values(planeswalkers).every(arr => arr.length === 0)
				) {
					return this.genericBoosterFunc(this.cardPool, colorBalancedSlot, targets, landSlot);
				} else {
					let updatedTargets = Object.assign({}, targets);
					let pickedCID = pickCard(this.planeswalkers, []);
					if (Cards[pickedCID].rarity === "mythic") --updatedTargets["rare"];
					else --updatedTargets[Cards[pickedCID].rarity];
					let booster = this.genericBoosterFunc(this.cardPool, colorBalancedSlot, updatedTargets, landSlot);
					// Insert the card in the appropriate slot (FIXME: Not perfect if there's a foil...)
					if (Cards[pickedCID].rarity === "rare" || Cards[pickedCID].rarity === "mythic")
						booster.unshift(pickedCID);
					else
						booster.splice(
							booster.findIndex(c => Cards[c].rarity === Cards[pickedCID].rarity),
							0,
							pickedCID
						);
					return booster;
				}
			},
		};
	},
	// Exactly one Legendary Creature per booster
	dom: (cardpool, genericBoosterFunc) => {
		let legendaryCreatures = {};
		let filteredCardPool = {};
		const regex = /Legendary.*Creature/;
		for (let slot in cardpool) {
			filteredCardPool[slot] = {};
			for (let cid in cardpool[slot])
				if (Cards[cid].type.match(regex)) legendaryCreatures[cid] = cardpool[slot][cid];
				else filteredCardPool[slot][cid] = cardpool[slot][cid];
		}
		return {
			genericBoosterFunc: genericBoosterFunc,
			legendaryCreatures: legendaryCreatures,
			cardPool: filteredCardPool,
			// Not using the supllied cardpool here
			generateBooster: function(cardpool, colorBalancedSlot, targets, landSlot) {
				// Ignore the rule if there's no legendary creatures left
				if (
					Object.values(legendaryCreatures).length === 0 ||
					Object.values(legendaryCreatures).every(arr => arr.length === 0)
				) {
					return this.genericBoosterFunc(this.cardPool, colorBalancedSlot, targets, landSlot);
				} else {
					let updatedTargets = Object.assign({}, targets);
					let pickedCID = pickCard(this.legendaryCreatures, []);
					removeCardFromDict(pickedCID, this.cardPool[Cards[pickedCID].rarity]);
					if (Cards[pickedCID].rarity === "mythic") --updatedTargets["rare"];
					else --updatedTargets[Cards[pickedCID].rarity];
					let booster = this.genericBoosterFunc(this.cardPool, colorBalancedSlot, updatedTargets, landSlot);
					// Insert the card in the appropriate slot
					booster.unshift(pickedCID);
					return booster;
				}
			},
		};
	},
};

module.exports = SetBoosterRules;

"use strict";

import Cards from "./Cards.js";
import { isEmpty, shuffleArray } from "./utils.js";
import { removeCardFromDict, pickCard } from "./cardUtils.js";

// Generates booster for regular MtG Sets

const mythicRate = 1.0 / 8.0;
const foilRate = 15.0 / 63.0;
// 1/16 chances of a foil basic land added to the common slot. Mythic to common
const foilRarityRates = {
	mythic: 1.0 / 128,
	rare: 1.0 / 128 + 7.0 / 128,
	uncommon: 1.0 / 16 + 3.0 / 16,
	common: 1.0,
};

export function BoosterFactory(cardPool, landSlot, options) {
	this.cardPool = cardPool;
	this.landSlot = landSlot;
	if (this.landSlot && this.landSlot.setup) this.landSlot.setup(this.cardPool["common"]);
	this.options = options;
	// Generate cache object for color balancing of the common slot
	if (this.options.colorBalance) {
		this.commonsByColor = {};
		for (let card in this.cardPool["common"]) {
			if (!(Cards[card].colors in this.commonsByColor)) this.commonsByColor[Cards[card].colors] = {};
			this.commonsByColor[Cards[card].colors][card] = this.cardPool["common"][card];
		}
	}

	this.onError = function(...args) {
		if (this.options.onError) this.options.onError(...args);
	};

	/* Returns a standard draft booster
	 *   targets: Card count for each slot (e.g. {common:10, uncommon:3, rare:1})
	 */
	this.generateBooster = function(targets) {
		let booster = [];

		let addedFoils = 0;
		if (this.options.foil && Math.random() <= foilRate) {
			const rarityCheck = Math.random();
			for (let r in foilRarityRates)
				if (rarityCheck <= foilRarityRates[r] && !isEmpty(cardPool[r])) {
					let pickedCard = pickCard(cardPool[r]);
					// Synchronize color balancing dictionary
					if (this.options.colorBalance && Cards[pickedCard].rarity == "common")
						removeCardFromDict(pickedCard, this.commonsByColor[Cards[pickedCard].colors]);
					booster.push(pickedCard);
					addedFoils += 1;
					break;
				}
		}

		for (let i = 0; i < targets["rare"]; ++i) {
			// 1 Rare/Mythic
			if (isEmpty(cardPool["mythic"]) && isEmpty(cardPool["rare"])) {
				const msg = `Not enough rare or mythic cards in collection.`;
				this.onError("Error generating boosters", msg);
				console.error(msg);
				return false;
			} else if (isEmpty(cardPool["mythic"])) {
				booster.push(pickCard(cardPool["rare"]));
			} else if (this.options.mythicPromotion && isEmpty(cardPool["rare"])) {
				booster.push(pickCard(cardPool["mythic"]));
			} else {
				if (this.options.mythicPromotion && Math.random() <= mythicRate)
					booster.push(pickCard(cardPool["mythic"]));
				else booster.push(pickCard(cardPool["rare"]));
			}
		}

		for (let i = 0; i < targets["uncommon"]; ++i) booster.push(pickCard(cardPool["uncommon"], booster));

		// Color balance the booster by adding one common of each color if possible
		let pickedCommons = [];
		if (this.options.colorBalance && targets["common"] >= 5) {
      let seededCommons = 0;
			for (let c of "WUBRG") {
				if (this.commonsByColor[c] && !isEmpty(this.commonsByColor[c])) {
					let pickedCard = pickCard(this.commonsByColor[c], pickedCommons);
					removeCardFromDict(pickedCard, cardPool["common"]);
          removeCardFromDict(pickedCard, this.commonsByColor[Cards[pickedCard].colors]);
					pickedCommons.push(pickedCard);
          seededCommons += 1;
				}
			}
      // a is the number of non-monocolor commons (often artifacts)
      // c is the number of monocolored commons including the ones seeded already
      // s is the number of commons seeded by color balancing
      // r is the remaining commons to pick
      // We want to maintain normal expected number of monocolored cards from not color balanciing:
      // (r+s) * c / (c+a)
      // We have s already and will take the remaining r with p(monocolored) = x
      // s + r * x = (r+s) * c / (c + a)
      // x = (cr - as) / (r * (c + a))
      // If cr < as, x = 0 is the best we can do.
      // If c or a are small, we need to ignore x and use remaning cards. Negative x acts like 0.
      let monocolored = Object.keys(this.commonsByColor).filter(k => k.length === 1).map(k => this.commonsByColor[k]).flat()
      let c = monocolored.length + seededCommons;
      let others = Object.keys(this.commonsByColor).filter(k => k.length !== 1).map(k => this.commonsByColor[k]).flat()
      let a = others.length;
      let remainingCommons = targets["common"] - addedFoils - seededCommons;
      let x = (c * remainingCommons - a * seededCommons) / (remainingCommons * (c + a));
      for (let i = pickedCommons.length; i < targets["common"] - addedFoils; ++i) {
        if (Math.random() < x && monocolored.length !== 0 || others.length === 0) {
          let pickedCard = pickCard(monocolored, pickedCommons);
        } else {
          let pickedCard = pickCard(others, pickedCommons);
        }
        pickedCommons.push(pickedCard);
      }
		} else {
      for (let i = pickedCommons.length; i < targets["common"] - addedFoils; ++i) {
        let pickedCard = pickCard(cardPool["common"], pickedCommons);
        pickedCommons.push(pickedCard);
      }
    }

		// Shuffle commons to avoid obvious signals to other players when color balancing
		shuffleArray(pickedCommons);
		booster = booster.concat(pickedCommons);

		if (this.landSlot) booster.push(this.landSlot.pick());

		// Last resort safety check
		if (booster.some(v => typeof v === "undefined" || v === null)) {
			const msg = `Unspecified error.`;
			this.onError("Error generating boosters", msg);
			console.error(msg, booster);
			return false;
		}

		return booster;
	};
}

function filterCardPool(cardPool, predicate) {
	const specialCards = {};
	const filteredCardPool = {};
	for (let slot in cardPool) {
		specialCards[slot] = {};
		filteredCardPool[slot] = {};
		for (let cid in cardPool[slot]) {
			if (predicate(cid)) specialCards[slot][cid] = cardPool[slot][cid];
			else filteredCardPool[slot][cid] = cardPool[slot][cid];
		}
	}
	return [specialCards, filteredCardPool];
}

function rollSpecialCardRarity(cardCounts, targets, options) {
	let pickedRarity = "uncommon";
	if (
		cardCounts["uncommon"] === 0 ||
		(cardCounts["rare"] + cardCounts["mythic"] > 0 &&
			Math.random() < targets.rare / (targets.rare + targets.uncommon))
	) {
		if (
			cardCounts["rare"] === 0 ||
			(cardCounts["mythic"] > 0 && options.mythicPromotion && Math.random() <= mythicRate)
		)
			pickedRarity = "mythic";
		else pickedRarity = "rare";
	}
	return pickedRarity;
}

function countBySlot(cardPool) {
	const counts = {};
	for (let slot in cardPool) counts[slot] = Object.values(cardPool[slot]).reduce((acc, c) => acc + c, 0);
	return counts;
}

// Set specific rules.
// Neither DOM, WAR or ZNR have specific rules for commons, so we don't have to worry about color balancing (colorBalancedSlot)
export const SetSpecificFactories = {
	// Exactly one Planeswalker per booster
	war: (cardPool, landSlot, options) => {
		const [planeswalkers, filteredCardPool] = filterCardPool(cardPool, cid =>
			Cards[cid].type.includes("Planeswalker")
		);
		const factory = new BoosterFactory(filteredCardPool, landSlot, options);
		factory.planeswalkers = planeswalkers;
		factory.originalGenBooster = factory.generateBooster;
		// Not using the suplied cardpool here
		factory.generateBooster = function(targets) {
			const plwCounts = countBySlot(this.planeswalkers);
			// Ignore the rule if suitable rarities are ignored, or there's no planeswalker left
			if (
				((!("uncommon" in targets) || targets["uncommon"] <= 0) &&
					(!("rare" in targets) || targets["rare"] <= 0)) ||
				Object.values(plwCounts).every(c => c === 0)
			) {
				return this.originalGenBooster(targets);
			} else {
				const pickedRarity = rollSpecialCardRarity(plwCounts, targets, options);
				const pickedCID = pickCard(this.planeswalkers[pickedRarity], []);

				const updatedTargets = Object.assign({}, targets);
				if (pickedRarity === "mythic") --updatedTargets["rare"];
				else --updatedTargets[pickedRarity];

				const booster = this.originalGenBooster(updatedTargets);
				// Insert the card in the appropriate slot (FIXME: Not perfect if there's a foil...)
				if (pickedRarity === "rare" || pickedRarity === "mythic") booster.unshift(pickedCID);
				else
					booster.splice(
						booster.findIndex(c => Cards[c].rarity === pickedRarity),
						0,
						pickedCID
					);
				return booster;
			}
		};
		return factory;
	},
	// At least one Legendary Creature per booster
	// https://www.lethe.xyz/mtg/collation/dom.html
	dom: (cardPool, landSlot, options) => {
		const regex = /Legendary.*Creature/;
		const [legendaryCreatures, filteredCardPool] = filterCardPool(cardPool, cid => Cards[cid].type.match(regex));
		const factory = new BoosterFactory(filteredCardPool, landSlot, options);
		factory.originalGenBooster = factory.generateBooster;
		factory.legendaryCreatures = legendaryCreatures;
		// Not using the suplied cardpool here
		factory.generateBooster = function(targets) {
			const legendaryCounts = countBySlot(this.legendaryCreatures);
			// Ignore the rule if there's no legendary creatures left
			if (Object.values(legendaryCounts).every(c => c === 0)) {
				return this.originalGenBooster(targets);
			} else {
				// Roll for legendary rarity
				const pickedRarity = rollSpecialCardRarity(legendaryCounts, targets, options);
				const pickedCID = pickCard(this.legendaryCreatures[pickedRarity], []);
				removeCardFromDict(pickedCID, this.cardPool[Cards[pickedCID].rarity]);

				const updatedTargets = Object.assign({}, targets);
				if (pickedRarity === "mythic") --updatedTargets["rare"];
				else --updatedTargets[pickedRarity];

				const booster = this.originalGenBooster(updatedTargets);
				// Insert the card in the appropriate slot, for Dominaria, the added Legendary is always the last card
				booster.unshift(pickedCID);
				return booster;
			}
		};
		return factory;
	},
	// Exactly one MDFC per booster
	znr: (cardPool, landSlot, options) => {
		const [mdfcByRarity, filteredCardPool] = filterCardPool(cardPool, cid => Cards[cid].name.includes("//"));
		const factory = new BoosterFactory(filteredCardPool, landSlot, options);
		factory.mdfcByRarity = mdfcByRarity;
		factory.originalGenBooster = factory.generateBooster;
		// Not using the suplied cardpool here
		factory.generateBooster = function(targets) {
			const mdfcCounts = countBySlot(this.mdfcByRarity);
			// Ignore the rule if suitable rarities are ignored, or there's no mdfc left
			if (
				((!("uncommon" in targets) || targets["uncommon"] <= 0) &&
					(!("rare" in targets) || targets["rare"] <= 0)) ||
				Object.values(mdfcCounts).every(c => c === 0)
			) {
				return this.originalGenBooster(targets);
			} else {
				// Roll for MDFC rarity
				const pickedRarity = rollSpecialCardRarity(mdfcCounts, targets, options);
				const pickedCID = pickCard(this.mdfcByRarity[pickedRarity], []);

				let updatedTargets = Object.assign({}, targets);
				if (pickedRarity === "mythic") --updatedTargets["rare"];
				else --updatedTargets[pickedRarity];

				let booster = this.originalGenBooster(updatedTargets);
				// Insert the card in the appropriate slot (FIXME: Not perfect if there's a foil...)
				if (pickedRarity === "rare" || pickedRarity === "mythic") booster.unshift(pickedCID);
				else
					booster.splice(
						booster.findIndex(c => Cards[c].rarity === pickedRarity),
						0,
						pickedCID
					);
				return booster;
			}
		};
		return factory;
	},
};

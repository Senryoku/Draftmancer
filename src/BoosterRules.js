"use strict";

const Cards = require("./Cards");
const { isEmpty, shuffleArray } = require("./utils");
const { removeCardFromDict, pickCard } = require("./cardUtils");

function BoosterFactory(cardPool, landSlot, options) {
	this.cardPool = cardPool;
	this.landSlot = landSlot;
	if (this.landSlot && this.landSlot.setup) this.landSlot.setup(this.cardPool);
	this.options = options;
	if (this.options.colorBalance) {
		this.commonsByColor = {};
		for (let card in this.cardPool["common"]) {
			if (!(Cards[card].colors in this.commonsByColor)) this.commonsByColor[Cards[card].colors] = {};
			this.commonsByColor[Cards[card].colors][card] = this.cardPool["common"][card];
		}
	}

	/* Returns a standard draft booster (Do NOT use for custom list/sets)
	 *   targets: Card count for each slot
	 */
	this.generateBooster = function(targets) {
		const mythicRate = 1.0 / 8.0;
		const foilRate = 15.0 / 63.0;
		// 1/16 chances of a foil basic land added to the common slot. Mythic to common
		const foilRarityRates = {
			mythic: 1.0 / 128,
			rare: 1.0 / 128 + 7.0 / 128,
			uncommon: 1.0 / 16 + 3.0 / 16,
			common: 1.0,
		};

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
				this.emitMessage("Error generating boosters", msg);
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
			for (let c of "WUBRG") {
				if (this.commonsByColor[c] && !isEmpty(this.commonsByColor[c])) {
					let pickedCard = pickCard(this.commonsByColor[c], pickedCommons);
					removeCardFromDict(pickedCard, cardPool["common"]);
					pickedCommons.push(pickedCard);
				}
			}
		}

		for (let i = pickedCommons.length; i < targets["common"] - addedFoils; ++i) {
			let pickedCard = pickCard(cardPool["common"], pickedCommons);
			if (this.options.colorBalance)
				removeCardFromDict(pickedCard, this.commonsByColor[Cards[pickedCard].colors]);
			pickedCommons.push(pickedCard);
		}

		// Shuffle commons to avoid obvious signals to other players when color balancing
		shuffleArray(pickedCommons);
		booster = booster.concat(pickedCommons);

		if (this.landSlot) booster.push(this.landSlot.pick());

		// Last resort safety check
		if (booster.some(v => typeof v === "undefined" || v === null)) {
			const msg = `Unspecified error.`;
			this.emitMessage("Error generating boosters", msg);
			console.error(msg, booster);
			return false;
		}

		return booster;
	};
}

// Set specific rules.
// Neither DOM or WAR have specific rules for commons, so we don't have to worry about color balancing (colorBalancedSlot)
const SetSpecificFactories = {
	// Exactly one Planeswalker per booster
	war: (cardPool, landSlot, options) => {
		let planeswalkers = {};
		let filteredCardPool = {};
		for (let slot in cardPool) {
			filteredCardPool[slot] = {};
			for (let cid in cardPool[slot]) {
				if (Cards[cid].type.includes("Planeswalker")) planeswalkers[cid] = cardPool[slot][cid];
				else filteredCardPool[slot][cid] = cardPool[slot][cid];
			}
		}
		const factory = new BoosterFactory(filteredCardPool, landSlot, options);
		factory.planeswalkers = planeswalkers;
		factory.originalGenBooster = factory.generateBooster;
		// Not using the supllied cardpool here
		factory.generateBooster = function(targets) {
			// Ignore the rule if suitable rarities are ignored, or there's no planeswalker left
			if (
				((!("uncommon" in targets) || targets["uncommon"] <= 0) &&
					(!("rare" in targets) || targets["rare"] <= 0)) ||
				Object.values(this.planeswalkers).length === 0 ||
				Object.values(this.planeswalkers).every(arr => arr.length === 0)
			) {
				return this.originalGenBooster(targets);
			} else {
				let updatedTargets = Object.assign({}, targets);
				let pickedCID = pickCard(this.planeswalkers, []);
				if (Cards[pickedCID].rarity === "mythic") --updatedTargets["rare"];
				else --updatedTargets[Cards[pickedCID].rarity];
				let booster = this.originalGenBooster(updatedTargets);
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
		};
		return factory;
	},
	// Exactly one Legendary Creature per booster
	dom: (cardPool, landSlot, options) => {
		let legendaryCreatures = {};
		let filteredCardPool = {};
		const regex = /Legendary.*Creature/;
		for (let slot in cardPool) {
			filteredCardPool[slot] = {};
			for (let cid in cardPool[slot])
				if (Cards[cid].type.match(regex)) legendaryCreatures[cid] = cardPool[slot][cid];
				else filteredCardPool[slot][cid] = cardPool[slot][cid];
		}
		const factory = new BoosterFactory(filteredCardPool, landSlot, options);
		factory.originalGenBooster = factory.generateBooster;
		factory.legendaryCreatures = legendaryCreatures;
		// Not using the supllied cardpool here
		factory.generateBooster = function(targets) {
			// Ignore the rule if there's no legendary creatures left
			if (
				Object.values(legendaryCreatures).length === 0 ||
				Object.values(legendaryCreatures).every(arr => arr.length === 0)
			) {
				return this.originalGenBooster(targets);
			} else {
				let updatedTargets = Object.assign({}, targets);
				let pickedCID = pickCard(this.legendaryCreatures, []);
				removeCardFromDict(pickedCID, this.cardPool[Cards[pickedCID].rarity]);
				if (Cards[pickedCID].rarity === "mythic") --updatedTargets["rare"];
				else --updatedTargets[Cards[pickedCID].rarity];
				let booster = this.originalGenBooster(updatedTargets);
				// Insert the card in the appropriate slot
				booster.unshift(pickedCID);
				return booster;
			}
		};
		return factory;
	},
};

module.exports.BoosterFactory = BoosterFactory;
module.exports.SetSpecificFactories = SetSpecificFactories;

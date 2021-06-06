"use strict";

import fs from "fs";
import chai from "chai";
const expect = chai.expect;
import randomjs from "random-js";
import { Cards } from "./../../dist/Cards.js";
import { Session } from "../../dist/Session.js";
import { SetSpecificFactories } from "../../dist/BoosterFactory.js";
import parseCardList from "../../dist/parseCardList.js";
import { getRandomKey, getRandom } from "../../dist/utils.js";
import { SpecialLandSlots } from "../../dist/LandSlot.js";

const ArenaCube = parseCardList(fs.readFileSync(`data/cubes/ArenaHistoricCube1.txt`, "utf8"));
const CustomSheetsTestFile = fs.readFileSync(`./test/data/CustomSheets.txt`, "utf8");
import constants from "../../src/data/constants.json";

describe("Statistical color balancing tests", function() {
	it(`Boosters have <=20% difference in a common artifact's count vs colored common's count while color balancing`, function(done) {
		this.timeout(4000);
		const trials = 10000;
		const landSlot = null;
		const BoosterFactoryOptions = {
			foil: false,
			colorBalance: true,
		};
		const cardPoolByRarity = {
			common: {},
			uncommon: {},
			rare: {},
			mythic: {},
		};
		for (let cid in Cards) {
			if (Cards[cid].in_booster && Cards[cid].set === "znr") {
				cardPoolByRarity[Cards[cid].rarity][cid] = trials;
			}
		}
		const factory = SetSpecificFactories["znr"](cardPoolByRarity, landSlot, BoosterFactoryOptions);
		let kitesails = 0;
		let brutes = 0;
		for (let i = 0; i < trials; i++) {
			let booster = factory.generateBooster({ common: 10, uncommon: 3, rare: 1 });
			booster.forEach(card => {
				if (card.name === "Cliffhaven Kitesail") {
					kitesails += 1;
				}
				if (card.name === "Murasa Brute") {
					brutes += 1;
				}
			});
		}
		const relativeDifference = 2 * Math.abs((kitesails - brutes) / (kitesails + brutes));
		console.log("Relative Difference: ", relativeDifference);
		expect(relativeDifference).to.be.at.most(0.2);
		done();
	});

	function runTrials(SessionInst, trials, trackedCards) {
		const all = trackedCards === null;
		if (trackedCards === null) trackedCards = {};
		for (let i = 0; i < trials; i++) {
			SessionInst.generateBoosters(3 * 8);
			SessionInst.boosters.forEach(booster =>
				booster.forEach(card => {
					if (card.id in trackedCards) ++trackedCards[card.id];
					else if (all) trackedCards[card.id] = 1;
				})
			);
		}
		return trackedCards;
	}

	function compareRandomCards(trackedCards) {
		// Select 10 pairs of cards and compare their rates
		const logTable = [];
		let maxRelativeDifference = 0;
		for (let i = 0; i < 10; ++i) {
			let id0 = getRandomKey(trackedCards);
			let id1 = getRandomKey(trackedCards);
			while (id1 === id0) id1 = getRandomKey(trackedCards);
			const relativeDifference =
				2 * Math.abs((trackedCards[id1] - trackedCards[id0]) / (trackedCards[id1] + trackedCards[id0]));
			logTable.push({
				"1st Card Name": Cards[id0].name,
				"1st Card Count": trackedCards[id0],
				"2nd Card Name": Cards[id1].name,
				"2nd Card Count": trackedCards[id1],
				"Relative Difference (%)": Math.round(10000.0 * relativeDifference) / 100.0,
			});
			maxRelativeDifference = Math.max(maxRelativeDifference, relativeDifference);
		}
		console.table(logTable);
		expect(maxRelativeDifference).to.be.at.most(0.2);
	}

	{
		// Random set, or all of them
		//let s = getRandom(constants.MTGASets);
		for (let s of constants.MTGASets) {
			it(`Every common of a set (${s}) should have similar (<=20% relative difference) apparition rate while color balancing`, function(done) {
				this.timeout(8000);
				const trials = 500;
				const SessionInst = new Session("UniqueID");
				SessionInst.colorBalance = true;
				SessionInst.useCustomCardList = false;
				SessionInst.setRestriction = [s];
				const trackedCards = Object.keys(SessionInst.cardPoolByRarity().common)
					.filter(cid => !(s in SpecialLandSlots && SpecialLandSlots[s].commonLandsIds.includes(cid)))
					.reduce((o, key) => ({ ...o, [key]: 0 }), {});
				runTrials(SessionInst, trials, trackedCards);
				compareRandomCards(trackedCards);
				done();
			});
		}
	}

	it(`Every card of a singleton Cube should have similar (<=20% relative difference) apparition rate WITHOUT color balancing`, function(done) {
		this.timeout(80000);
		const trials = 500;
		const SessionInst = new Session("UniqueID");
		SessionInst.useCustomCardList = true;
		SessionInst.colorBalance = false;
		SessionInst.customCardList = ArenaCube;
		const trackedCards = runTrials(SessionInst, trials, null);
		compareRandomCards(trackedCards);
		done();
	});

	it(`Every card of a singleton Cube should have similar (<=20% relative difference) apparition rate while color balancing`, function(done) {
		this.timeout(8000);
		const trials = 500;
		const SessionInst = new Session("UniqueID");
		SessionInst.useCustomCardList = true;
		SessionInst.colorBalance = true;
		SessionInst.customCardList = ArenaCube;
		const trackedCards = runTrials(SessionInst, trials, null);
		compareRandomCards(trackedCards);
		done();
	});

	it(`Every card in the color balanced slot of a Cube using custom sheets should have similar (<=20% relative difference) apparition rate`, function(done) {
		this.timeout(8000);
		const trials = 200;
		const SessionInst = new Session("UniqueID");
		SessionInst.useCustomCardList = true;
		SessionInst.colorBalance = true;
		SessionInst.setCustomCardList(parseCardList(CustomSheetsTestFile));
		const trackedCards = SessionInst.customCardList.cards.Common.reduce((o, key) => ({ ...o, [key]: 0 }), {});
		runTrials(SessionInst, trials, trackedCards);
		compareRandomCards(trackedCards);
		done();
	});

	for (let rarity of ["uncommon", "rare"]) {
		it(`Modal Double Faced ${rarity}s of Zendikar Rising should have an apparition rate similar to Single Faced ${rarity}s' (<= 20% relative difference)`, function(done) {
			this.timeout(8000);
			const trials = 10000;
			const SessionInst = new Session("UniqueID");
			SessionInst.colorBalance = true;
			SessionInst.setRestriction = ["znr"];
			const trackedCards = Object.keys(SessionInst.cardPoolByRarity()[rarity]).reduce(
				(o, key) => ({ ...o, [key]: 0 }),
				{}
			);
			runTrials(SessionInst, trials, trackedCards);

			const logTable = [];
			let maxRelativeDifference = 0;
			const MDFCs = Object.keys(trackedCards).filter(cid => Cards[cid].name.includes("//"));
			for (let id0 of MDFCs) {
				let id1 = getRandomKey(trackedCards);
				while (MDFCs.includes(id1) || id1 === id0) id1 = getRandomKey(trackedCards);
				const relativeDifference =
					2 * Math.abs((trackedCards[id1] - trackedCards[id0]) / (trackedCards[id1] + trackedCards[id0]));
				logTable.push({
					"1st Card Name": Cards[id0].name,
					"1st Card Count": trackedCards[id0],
					"2nd Card Name": Cards[id1].name,
					"2nd Card Count": trackedCards[id1],
					"Relative Difference (%)": Math.round(10000.0 * relativeDifference) / 100.0,
				});
				maxRelativeDifference = Math.max(maxRelativeDifference, relativeDifference);
			}
			console.table(logTable);
			expect(maxRelativeDifference).to.be.at.most(0.2);
			done();
		});
	}

	it(`Lessons of STX should have an apparition rate similar to other cards of the same rarity (<= 20% relative difference)`, function(done) {
		this.timeout(8000);
		const trials = 5000;
		const SessionInst = new Session("UniqueID");
		SessionInst.colorBalance = true;
		SessionInst.setRestriction = ["stx"];
		const trackedCards = SessionInst.cardPool();
		runTrials(SessionInst, trials, trackedCards);

		for (let rarity of ["common", "uncommon", "rare", "mythic"]) {
			const logTable = [];
			let maxRelativeDifference = 0;
			let candidates = Object.keys(trackedCards).filter(cid => Cards[cid].rarity === rarity);
			const Lessons = candidates.filter(cid => Cards[cid].subtypes.includes("Lesson"));
			candidates = candidates.filter(cid => !Cards[cid].subtypes.includes("Lesson"));
			for (let id0 of Lessons) {
				let id1 = getRandom(candidates);
				while (Lessons.includes(id1) || id1 === id0) id1 = getRandom(candidates);
				const relativeDifference =
					2 * Math.abs((trackedCards[id1] - trackedCards[id0]) / (trackedCards[id1] + trackedCards[id0]));
				logTable.push({
					"1st Card Name": Cards[id0].name,
					"1st Card Count": trackedCards[id0],
					"2nd Card Name": Cards[id1].name,
					"2nd Card Count": trackedCards[id1],
					"Relative Difference (%)": Math.round(10000.0 * relativeDifference) / 100.0,
				});
				maxRelativeDifference = Math.max(maxRelativeDifference, relativeDifference);
			}
			console.table(logTable);
			expect(maxRelativeDifference).to.be.at.most(0.2);
		}
		done();
	});

	function mean(arr) {
		return arr.reduce((a, b) => a + b) / arr.length;
	}

	function chiSquare(observed, expected) {
		while (observed.length < expected.length) observed.push(0);
		while (expected.length < observed.length) expected.push(0);
		let x2 = 0;
		for (let i = 0; i < observed.length; ++i) {
			const n = observed[i] - expected[i];
			x2 += (n * n) / expected[i];
		}
		return x2;
	}

	function chiSquareUniformTest(observed) {
		let x2 = 0;
		const total = observed.reduce((a, b) => a + b);
		const expected = total / observed.length;
		for (let i = 0; i < observed.length; ++i) {
			const n = observed[i] - expected;
			x2 += (n * n) / expected;
		}
		return x2;
	}

	describe("Uniformity of rares tests", function() {
		const trials = 10000;
		const SessionInst = new Session("UniqueID");
		SessionInst.colorBalance = true;
		SessionInst.setRestriction = ["znr"];
		const rares = Object.keys(SessionInst.cardPoolByRarity().rare); // 64
		const chiSquareCriticalValue63 = 82.529; // For 63 Degrees of Freedom and Significance Level 0.05

		function checkUniformity(done, func) {
			const results = rares.reduce((o, key) => ({ ...o, [key]: 0 }), {});
			for (let r of rares) results[r] = 0;
			func(results);
			//console.table(results)
			const countMean = mean(Object.values(results));
			const diffFromMean = [...Object.values(results)];
			for (let i = 0; i < diffFromMean.length; ++i) diffFromMean[i] = Math.abs(diffFromMean[i] - countMean);
			//console.table(diffFromMean)
			const meanDeviation = mean(diffFromMean);
			const chiSquareResult = chiSquareUniformTest(Object.values(results));
			console.table([
				["Mean: ", countMean],
				["Mean Deviation:", meanDeviation],
				["Chi Squared Uniformity Test: ", chiSquareResult],
			]);
			expect(chiSquareResult).lte(chiSquareCriticalValue63);
			done();
		}

		it(`Basic uniform distribution using Math.random()`, function(done) {
			checkUniformity(done, results => {
				for (let i = 0; i < trials; ++i) {
					results[rares[Math.floor(Math.random() * rares.length)]] += 1;
				}
			});
		});
		it(`Basic uniform distribution using randomjs(nodeCrypto) integer`, function(done) {
			checkUniformity(done, results => {
				const random = new randomjs.Random(randomjs.nodeCrypto);
				for (let i = 0; i < trials; ++i) {
					results[rares[random.integer(0, rares.length - 1)]] += 1;
				}
			});
		});
		it(`Basic uniform distribution using randomjs(MersenneTwister19937) integer`, function(done) {
			checkUniformity(done, results => {
				const engine = randomjs.MersenneTwister19937.autoSeed();
				const distribution = randomjs.integer(0, rares.length - 1);
				for (let i = 0; i < trials; ++i) {
					results[rares[distribution(engine)]] += 1;
				}
			});
		});
		it(`Uniform distribution test using generateBooster`, function(done) {
			this.timeout(8000);
			checkUniformity(done, results => {
				runTrials(SessionInst, trials, results);
			});
		});
	});

	describe("Duplicate tests.", function() {
		const trials = 2000;
		function countDuplicates(populate) {
			const results = [0];
			let totalDupes = 0;
			for (let i = 0; i < trials; i++) {
				let cards = populate();
				if (typeof cards[0] === "number") cards = cards.sort((a, b) => a - b);
				else cards = cards.sort();
				let duplicates = 0;
				for (let i = 0; i < cards.length - 1; ++i) if (cards[i] === cards[i + 1]) ++duplicates;
				while (results.length <= duplicates) results.push(0);
				++results[duplicates];
				totalDupes += duplicates;
			}
			console.table(results);
			console.error("Mean: ", totalDupes / trials);
			return results;
		}

		describe("Without mythic.", function() {
			for (let set of ["znr", "eld", "thb", "iko", "m21"]) {
				let Expected;
				let Observed;
				const SessionInst = new Session("UniqueID");
				SessionInst.colorBalance = true;
				SessionInst.setRestriction = [set];
				SessionInst.mythicPromotion = false; // Disable promotion to mythic for easier analysis
				const rares = Object.values(SessionInst.cardPoolByRarity().rare);
				describe(`Using ${set} (${rares.length} rares)`, function() {
					it(`Count duplicate rares in uniform distribution (${set}, ${rares.length} rares).`, function(done) {
						const engine = randomjs.nodeCrypto;
						const distribution = randomjs.integer(0, rares.length - 1);
						Expected = countDuplicates(() => {
							let cards = [];
							for (let j = 0; j < 3 * 8; ++j) cards.push(distribution(engine));
							expect(cards.length).equal(3 * 8);
							return cards;
						});
						done();
					});
					it(`Count duplicate rares in 24 boosters (${set}, ${rares.length} rares).`, function(done) {
						this.timeout(80000);
						Observed = countDuplicates(() => {
							SessionInst.generateBoosters(3 * 8);
							const cards = SessionInst.boosters
								.flat()
								.filter(c => c.rarity === "rare")
								.map(c => c.name);
							expect(cards.length).equal(3 * 8);
							return cards;
						});
						done();
					});
					it(`Check distribution fitness (${set}, ${rares.length} rares).`, function(done) {
						const cs = chiSquare(Observed, Expected);
						console.error("Chi-Square: ", cs);
						done();
					});
				});
			}
		});

		describe("Accounting for mythics.", function() {
			for (let set of ["znr", "eld", "thb", "iko", "m21"]) {
				let Expected;
				let Observed;
				const SessionInst = new Session("UniqueID");
				SessionInst.colorBalance = true;
				SessionInst.setRestriction = [set];
				const rares = Object.values(SessionInst.cardPoolByRarity().rare);
				describe(`Using ${set} (${rares.length} rares)`, function() {
					it(`Count duplicate rares in uniform distribution (${set}, ${rares.length} rares).`, function(done) {
						const engine = randomjs.nodeCrypto;
						const distribution = randomjs.integer(0, rares.length - 1);
						const mythicDistribution = randomjs.integer(0, 7);
						Expected = countDuplicates(() => {
							let cards = [];
							for (let j = 0; j < 3 * 8; ++j)
								if (mythicDistribution(engine) > 0) cards.push(distribution(engine));
							return cards;
						});
						done();
					});
					it(`Count duplicate rares in 24 boosters (${set}, ${rares.length} rares).`, function(done) {
						this.timeout(80000);
						Observed = countDuplicates(() => {
							SessionInst.generateBoosters(3 * 8);
							return SessionInst.boosters
								.flat()
								.filter(c => c.rarity === "rare")
								.map(c => c.name);
						});
						done();
					});
					it(`Check distribution fitness (${set}, ${rares.length} rares).`, function(done) {
						const cs = chiSquare(Observed, Expected);
						console.error("Chi-Square: ", cs);
						done();
					});
				});
			}
		});
	});
});

"use strict";

import fs from "fs";
import chai from "chai";
const expect = chai.expect;
import * as randomjs from "random-js";
import { Cards, getCard } from "../../src/Cards.js";
import { Session } from "../../src/Session.js";
import { SetSpecificFactories } from "../../src/BoosterFactory.js";
import { parseCardList } from "../../src/parseCardList.js";
import { getRandomKey, getRandom } from "../../src/utils.js";
import { SpecialLandSlots } from "../../src/LandSlot.js";
import { isMessageError, isSocketError, MessageError } from "../../src/Message.js";

const ArenaCube = parseCardList(fs.readFileSync(`data/cubes/ArenaHistoricCube1.txt`, "utf8"), {});
if (isSocketError(ArenaCube)) {
	process.exit(1);
}

const CustomSheetsTestFile = fs.readFileSync(`./test/data/CustomSheets.txt`, "utf8");
import { CardID, CardPool } from "../../src/CardTypes.js";
import { isNumber } from "../../src/TypeChecks.js";

describe("Statistical color balancing tests", function () {
	it(`Boosters have <=20% difference in a common artifact's count vs colored common's count while color balancing`, function (done) {
		this.timeout(1000);
		const trials = 10000;
		const landSlot = null;
		const BoosterFactoryOptions = {
			foil: false,
			colorBalance: true,
		};
		const cardPoolByRarity = {
			common: new CardPool(),
			uncommon: new CardPool(),
			rare: new CardPool(),
			mythic: new CardPool(),
		};
		for (const [cid, card] of Cards) {
			if (card.in_booster && card.set === "znr") {
				cardPoolByRarity[card.rarity as keyof typeof cardPoolByRarity].set(cid, trials);
			}
		}
		const factory = new SetSpecificFactories["znr"](cardPoolByRarity, landSlot, BoosterFactoryOptions);
		let kitesails = 0;
		let brutes = 0;
		for (let i = 0; i < trials; i++) {
			const booster = factory.generateBooster({ common: 10, uncommon: 3, rare: 1 });
			if (isMessageError(booster)) {
				expect(false, "Error generating booster").to.be.true;
				return;
			}
			booster.forEach((card) => {
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

	function runTrials(SessionInst: Session, trials: number, trackedCards: { [cid: CardID]: number } | null) {
		const all = trackedCards === null;
		if (trackedCards === null) trackedCards = {} as { [cid: CardID]: number };
		for (let i = 0; i < trials; i++) {
			const boosters = SessionInst.generateBoosters(3 * 8);
			if (isMessageError(boosters)) {
				expect(false, "Error generating boosters").to.be.true;
				return trackedCards;
			}
			boosters.forEach((booster) =>
				booster.forEach((card) => {
					if (card.id in trackedCards!) ++trackedCards![card.id];
					else if (all) trackedCards![card.id] = 1;
				})
			);
		}
		return trackedCards;
	}

	function compareRandomCards(trackedCards: { [cid: CardID]: number }) {
		// Select 10 pairs of cards and compare their rates
		const logTable = [];
		let maxRelativeDifference = 0;
		for (let i = 0; i < 10; ++i) {
			const id0 = getRandomKey(trackedCards);
			let id1 = getRandomKey(trackedCards);
			while (id1 === id0) id1 = getRandomKey(trackedCards);
			const relativeDifference =
				2 * Math.abs((trackedCards[id1] - trackedCards[id0]) / (trackedCards[id1] + trackedCards[id0]));
			logTable.push({
				"1st Card Name": getCard(id0).name,
				"1st Card Count": trackedCards[id0],
				"2nd Card Name": getCard(id1).name,
				"2nd Card Count": trackedCards[id1],
				"Relative Difference (%)": Math.round(10000.0 * relativeDifference) / 100.0,
			});
			maxRelativeDifference = Math.max(maxRelativeDifference, relativeDifference);
		}
		console.table(logTable);
		expect(maxRelativeDifference).to.be.at.most(0.2);
	}

	for (const s of Object.keys(SetSpecificFactories)) {
		it(`Every common of a set (${s}) should have similar (<=20% relative difference) apparition rate while color balancing`, function (done) {
			this.timeout(1000);
			const trials = 500;
			const SessionInst = new Session("UniqueID", "ownerID");
			SessionInst.colorBalance = true;
			SessionInst.useCustomCardList = false;
			SessionInst.setRestriction = [s];
			const trackedCards = [...SessionInst.cardPoolByRarity().common.keys()]
				.filter((cid) => !(s in SpecialLandSlots && SpecialLandSlots[s].commonLandsIds.includes(cid)))
				.reduce((o, key) => ({ ...o, [key]: 0 }), {});
			runTrials(SessionInst, trials, trackedCards);
			compareRandomCards(trackedCards);
			done();
		});
	}

	it(`Every card of a singleton Cube should have similar (<=20% relative difference) apparition rate WITHOUT color balancing`, function (done) {
		this.timeout(2000);
		const trials = 500;
		const SessionInst = new Session("UniqueID", "ownerID");
		SessionInst.useCustomCardList = true;
		SessionInst.colorBalance = false;
		SessionInst.customCardList = ArenaCube;
		const trackedCards = runTrials(SessionInst, trials, null);
		compareRandomCards(trackedCards);
		done();
	});

	it(`Every card of a singleton Cube should have similar (<=20% relative difference) apparition rate while color balancing`, function (done) {
		this.timeout(8000);
		const trials = 500;
		const SessionInst = new Session("UniqueID", "ownerID");
		SessionInst.useCustomCardList = true;
		SessionInst.colorBalance = true;
		SessionInst.customCardList = ArenaCube;
		const trackedCards = runTrials(SessionInst, trials, null);
		compareRandomCards(trackedCards);
		done();
	});

	it(`Every card in the color balanced slot of a Cube using custom sheets should have similar (<=20% relative difference) apparition rate`, function (done) {
		this.timeout(8000);
		const trials = 200;
		const SessionInst = new Session("UniqueID", "ownerID");
		SessionInst.useCustomCardList = true;
		SessionInst.colorBalance = true;
		const list = parseCardList(CustomSheetsTestFile, {});
		if (isSocketError(list)) {
			expect(false, "Couldn't load cube.");
			return;
		}
		SessionInst.setCustomCardList(list);
		const trackedCards = Object.keys(SessionInst.customCardList.slots.Common).reduce(
			(o, key) => ({ ...o, [key]: 0 }),
			{}
		);
		runTrials(SessionInst, trials, trackedCards);
		compareRandomCards(trackedCards);
		done();
	});

	for (const rarity of ["uncommon", "rare"]) {
		it(`Modal Double Faced ${rarity}s of Zendikar Rising should have an apparition rate similar to Single Faced ${rarity}s' (<= 20% relative difference)`, function (done) {
			this.timeout(20000);
			const trials = 10000;
			const SessionInst = new Session("UniqueID", "ownerID");
			SessionInst.colorBalance = true;
			SessionInst.setRestriction = ["znr"];
			const trackedCards: { [cid: CardID]: number } = [...SessionInst.cardPoolByRarity()[rarity].keys()].reduce(
				(o, key) => ({ ...o, [key]: 0 }),
				{}
			);
			runTrials(SessionInst, trials, trackedCards);

			const logTable = [];
			let maxRelativeDifference = 0;
			const MDFCs = Object.keys(trackedCards).filter((cid) => getCard(cid).name.includes("//"));
			for (const id0 of MDFCs) {
				let id1 = getRandomKey(trackedCards);
				while (MDFCs.includes(id1) || id1 === id0) id1 = getRandomKey(trackedCards);
				const relativeDifference =
					2 * Math.abs((trackedCards[id1] - trackedCards[id0]) / (trackedCards[id1] + trackedCards[id0]));
				logTable.push({
					"1st Card Name": getCard(id0).name,
					"1st Card Count": trackedCards[id0],
					"2nd Card Name": getCard(id1).name,
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

	it(`Lessons of STX should have an apparition rate similar to other cards of the same rarity (<= 20% relative difference)`, function (done) {
		this.timeout(8000);
		const trials = 5000;
		const SessionInst = new Session("UniqueID", "ownerID");
		SessionInst.colorBalance = true;
		SessionInst.setRestriction = ["stx"];
		const trackedCards = Object.fromEntries(SessionInst.cardPool());
		runTrials(SessionInst, trials, trackedCards);

		for (const rarity of ["common", "uncommon", "rare", "mythic"]) {
			const logTable = [];
			let maxRelativeDifference = 0;
			let candidates = Object.keys(trackedCards).filter((cid) => getCard(cid).rarity === rarity);
			const Lessons = candidates.filter((cid) => getCard(cid).subtypes.includes("Lesson"));
			candidates = candidates.filter((cid) => !getCard(cid).subtypes.includes("Lesson"));
			for (const id0 of Lessons) {
				let id1 = getRandom(candidates);
				while (Lessons.includes(id1) || id1 === id0) id1 = getRandom(candidates);
				const relativeDifference =
					2 * Math.abs((trackedCards[id1] - trackedCards[id0]) / (trackedCards[id1] + trackedCards[id0]));
				logTable.push({
					"1st Card Name": getCard(id0).name,
					"1st Card Count": trackedCards[id0],
					"2nd Card Name": getCard(id1).name,
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

	function mean(arr: number[]): number {
		return arr.reduce((a, b) => a + b) / arr.length;
	}

	function chiSquare(observed: number[], expected: number[]) {
		while (observed.length < expected.length) observed.push(0);
		while (expected.length < observed.length) expected.push(0);
		let x2 = 0;
		for (let i = 0; i < observed.length; ++i) {
			const n = observed[i] - expected[i];
			x2 += (n * n) / (expected[i] > 0 ? expected[i] : 1);
		}
		return x2;
	}

	function chiSquareUniformTest(observed: number[]) {
		let x2 = 0;
		const total = observed.reduce((a, b) => a + b);
		const expected = total / observed.length;
		for (let i = 0; i < observed.length; ++i) {
			const n = observed[i] - expected;
			x2 += (n * n) / expected;
		}
		return x2;
	}

	describe("Uniformity of rares tests", function () {
		const trials = 10000;
		const SessionInst = new Session("UniqueID", "ownerID");
		SessionInst.colorBalance = true;
		SessionInst.setRestriction = ["war"];
		const rares = [...SessionInst.cardPoolByRarity().rare.keys()]; // 53
		expect(rares.length).equal(53);
		const chiSquareCriticalValue52 = 69.832; // For 52 Degrees of Freedom and Significance Level 0.05

		function checkUniformity(done: Mocha.Done, func: (results: { [cid: CardID]: number }) => void) {
			const results: { [cid: CardID]: number } = rares.reduce((o, key) => ({ ...o, [key]: 0 }), {});
			for (const r of rares) results[r] = 0;
			func(results);
			//console.table(results);
			const countMean = mean(Object.values(results));
			const diffFromMean = [...Object.values(results)];
			for (let i = 0; i < diffFromMean.length; ++i) diffFromMean[i] = Math.abs(diffFromMean[i] - countMean);
			//console.table(diffFromMean);
			const meanDeviation = mean(diffFromMean);
			const chiSquareResult = chiSquareUniformTest(Object.values(results));
			console.table([
				["Mean: ", countMean],
				["Mean Deviation:", meanDeviation],
				["Chi Squared Uniformity Test: ", chiSquareResult],
			]);
			expect(chiSquareResult).lte(chiSquareCriticalValue52);
			done();
		}

		it(`Basic uniform distribution using Math.random()`, function (done) {
			checkUniformity(done, (results: { [cid: CardID]: number }) => {
				for (let i = 0; i < trials; ++i) {
					results[rares[Math.floor(Math.random() * rares.length)]] += 1;
				}
			});
		});
		it(`Basic uniform distribution using randomjs(nodeCrypto) integer`, function (done) {
			checkUniformity(done, (results: { [cid: CardID]: number }) => {
				const random = new randomjs.Random(randomjs.nodeCrypto);
				for (let i = 0; i < trials; ++i) {
					results[rares[random.integer(0, rares.length - 1)]] += 1;
				}
			});
		});
		it(`Basic uniform distribution using randomjs(MersenneTwister19937) integer`, function (done) {
			checkUniformity(done, (results: { [cid: CardID]: number }) => {
				const engine = randomjs.MersenneTwister19937.autoSeed();
				const distribution = randomjs.integer(0, rares.length - 1);
				for (let i = 0; i < trials; ++i) {
					results[rares[distribution(engine)]] += 1;
				}
			});
		});
		it(`Uniform distribution test using generateBooster`, function (done) {
			this.timeout(20000);
			checkUniformity(done, (results: { [cid: CardID]: number }) => {
				runTrials(SessionInst, trials, results);
			});
		});
	});

	describe("Duplicate tests.", function () {
		const trials = 4000;
		const random = new randomjs.Random(randomjs.nodeCrypto);

		function countTotalDupes<T>(data: T[], res: number[]) {
			let duplicates = 0;
			for (let i = 0; i < data.length - 1; ++i) if (data[i] === data[i + 1]) ++duplicates;
			while (res.length <= duplicates) res.push(0);
			++res[duplicates];
			return duplicates;
		}

		function countMaxDupes<T>(data: T[], res: number[]) {
			let maxDuplicates = 0;
			const maxDuplicatesValues = [];
			for (let i = 0; i < data.length - 1; ++i)
				if (data[i] === data[i + 1]) ++maxDuplicates;
				else {
					maxDuplicatesValues.push(maxDuplicates);
					maxDuplicates = 0;
				}
			maxDuplicates = maxDuplicatesValues.reduce((a, b) => Math.max(a, b), 0);
			while (res.length <= maxDuplicates) res.push(0);
			++res[maxDuplicates];
			return maxDuplicates;
		}

		const isArrayOfNumber = (arr: unknown[]): arr is number[] => arr.every((v) => isNumber(v));

		function countDuplicates<T>(populate: () => T[], distinctResults?: number) {
			const results = [0];
			const controlResults = [0];
			const maxResults = [0];
			const controlMaxResults = [0];
			let totalDupes = 0;
			let controlTotalDupes = 0;
			let totalMaxDupes = 0;
			let controlTotalMaxDupes = 0;
			for (let i = 0; i < trials; i++) {
				let cards = populate();
				if (isArrayOfNumber(cards)) cards = cards.sort((a: number, b: number) => a - b);
				else cards = cards.sort();
				totalDupes += countTotalDupes(cards, results);
				totalMaxDupes += countMaxDupes(cards, maxResults);

				if (distinctResults) {
					const control: number[] = [];
					for (let i = 0; i < cards.length; i++) control.push(random.integer(0, distinctResults - 1));
					control.sort((a, b) => a - b);
					controlTotalDupes += countTotalDupes(control, controlResults);
					controlTotalMaxDupes += countMaxDupes(control, controlMaxResults);
				}
			}
			if (distinctResults) {
				console.table({
					Duplicates: results,
					"Control Duplicates": controlResults,
					"Max Duplicates": maxResults,
					"Control Max Duplicates": controlMaxResults,
				});
				console.error(
					"Mean: ",
					totalDupes / trials,
					"(Expected:",
					controlTotalDupes / trials,
					"Chi Squared:",
					chiSquare(results, controlResults),
					"); Max Mean: ",
					totalMaxDupes / trials,
					"(Expected:",
					controlTotalMaxDupes / trials,
					"Chi Squared:",
					chiSquare(maxResults, controlMaxResults),
					")"
				);
			} else {
				console.table({
					Duplicates: results,
					"Max Duplicates": maxResults,
				});
				console.error("Mean: ", totalDupes / trials, "; Max Mean: ", totalMaxDupes / trials);
			}
			return results;
		}

		describe("Without mythic.", function () {
			for (const set of ["znr", "eld", "thb", "iko", "m21", "neo"]) {
				const SessionInst = new Session("UniqueID", "ownerID");
				SessionInst.colorBalance = true;
				SessionInst.setRestriction = [set];
				SessionInst.mythicPromotion = false; // Disable promotion to mythic for easier analysis
				const rares = [...SessionInst.cardPoolByRarity().rare.values()];
				describe(`Using ${set} (${rares.length} rares)`, function () {
					it(`Count duplicate rares in 24 boosters (${set}, ${rares.length} rares).`, function (done) {
						this.timeout(8000);
						countDuplicates(() => {
							const boosters = SessionInst.generateBoosters(3 * 8);
							if (isMessageError(boosters)) {
								expect(boosters).to.not.be.instanceOf(MessageError);
								return [];
							}
							const cards = boosters
								.flat()
								.filter((c) => c.rarity === "rare")
								.map((c) => c.name);
							expect(cards.length).equal(3 * 8);
							return cards;
						}, rares.length);
						done();
					});
				});
			}
		});

		describe("Accounting for mythics.", function () {
			for (const set of ["znr", "eld", "thb", "iko", "m21", "neo"]) {
				let Expected: number[];
				let Observed: number[];
				const SessionInst = new Session("UniqueID", "ownerID");
				SessionInst.colorBalance = true;
				SessionInst.setRestriction = [set];
				const rares = [...SessionInst.cardPoolByRarity().rare.keys()];
				describe(`Using ${set} (${rares.length} rares)`, function () {
					it(`Count duplicate rares in uniform distribution (${set}, ${rares.length} rares).`, function (done) {
						const engine = randomjs.nodeCrypto;
						const distribution = randomjs.integer(0, rares.length - 1);
						const mythicDistribution = randomjs.integer(0, 7);
						Expected = countDuplicates(() => {
							const cards = [];
							for (let j = 0; j < 3 * 8; ++j)
								if (mythicDistribution(engine) > 0) cards.push(distribution(engine));
							return cards;
						});
						done();
					});
					it(`Count duplicate rares in 24 boosters (${set}, ${rares.length} rares).`, function (done) {
						this.timeout(8000);
						Observed = countDuplicates(() => {
							const boosters = SessionInst.generateBoosters(3 * 8);
							if (isMessageError(boosters)) {
								expect(boosters).to.not.be.instanceOf(MessageError);
								return [];
							}
							return boosters
								.flat()
								.filter((c) => c.rarity === "rare")
								.map((c) => c.name);
						});
						done();
					});
					it(`Check distribution fitness (${set}, ${rares.length} rares).`, function (done) {
						const cs = chiSquare(Observed, Expected);
						console.error("Chi-Square: ", cs);
						done();
					});
				});
			}
		});
	});
});

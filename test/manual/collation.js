"use strict";

import fs from "fs";
import chai from "chai";
const expect = chai.expect;
import { Cards } from "./../../src/Cards.js";
//import server from "../../server.js";
import { Session } from "../../src/Session.js";
import { SetSpecificFactories } from "../../src/BoosterFactory.js";
import parseCardList from "../../src/parseCardList.js";
import { getRandom, getRandomKey } from "../../src/utils.js";
import { SpecialLandSlots } from "../../src/LandSlot.js";

const ArenaCube = parseCardList(fs.readFileSync(`data/cubes/ArenaHistoricCube1.txt`, "utf8"));
const CustomSheetsTestFile = fs.readFileSync(`./test/data/CustomSheets.txt`, "utf8");
import constants from "../../client/src/data/constants.json";

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

	{
		// Random set, or all of them
		//let s = getRandom(constants.MTGASets);
		for (let s of constants.MTGASets)
		{
			it(`Every common of a set (${s}) should have similar (<=20% relative difference) apparition rate while color balancing`, function(done) {
				this.timeout(8000);
				const trials = 500;
				const SessionInst = new Session("UniqueID");
				SessionInst.colorBalance = true;
				SessionInst.useCustomCardList = false;
				SessionInst.setRestriction = [s];
				const trackedCards = {};
				for (let cid of Object.keys(SessionInst.cardPoolByRarity().common))
					if (!(s in SpecialLandSlots && SpecialLandSlots[s].commonLandsIds.includes(cid)))
						trackedCards[cid] = 0;
				for (let i = 0; i < trials; i++) {
					SessionInst.generateBoosters(3 * 8);
					SessionInst.boosters.forEach(booster =>
						booster.forEach(card => {
							if (card.id in trackedCards) ++trackedCards[card.id];
						})
					);
				}
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
						"Relative Difference": relativeDifference,
					});
					maxRelativeDifference = Math.max(maxRelativeDifference, relativeDifference);
				}
				console.table(logTable);
				expect(maxRelativeDifference).to.be.at.most(0.2);
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
		const trackedCards = {};
		for (let i = 0; i < trials; i++) {
			SessionInst.generateBoosters(3 * 8);
			let boosters = SessionInst.boosters;
			boosters.forEach(booster =>
				booster.forEach(card => {
					trackedCards[card.id] = trackedCards[card.id] ? trackedCards[card.id] + 1 : 1;
				})
			);
		}
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
				"Relative Difference": relativeDifference,
			});
			maxRelativeDifference = Math.max(maxRelativeDifference, relativeDifference);
		}
		console.table(logTable);
		expect(maxRelativeDifference).to.be.at.most(0.2);
		done();
	});

	it(`Every card of a singleton Cube should have similar (<=20% relative difference) apparition rate while color balancing`, function(done) {
		this.timeout(8000);
		const trials = 500;
		const SessionInst = new Session("UniqueID");
		SessionInst.useCustomCardList = true;
		SessionInst.colorBalance = true;
		SessionInst.customCardList = ArenaCube;
		const trackedCards = {};
		for (let i = 0; i < trials; i++) {
			SessionInst.generateBoosters(3 * 8);
			let boosters = SessionInst.boosters;
			boosters.forEach(booster =>
				booster.forEach(card => {
					trackedCards[card.id] = trackedCards[card.id] ? trackedCards[card.id] + 1 : 1;
				})
			);
		}
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
				"Relative Difference": relativeDifference,
			});
			maxRelativeDifference = Math.max(maxRelativeDifference, relativeDifference);
		}
		console.table(logTable);
		expect(maxRelativeDifference).to.be.at.most(0.2);
		done();
	});

	it(`Every card in the color balanced slot of a Cube using custom sheets should have similar (<=20% relative difference) apparition rate`, function(done) {
		this.timeout(8000);
		const trials = 200;
		const SessionInst = new Session("UniqueID");
		SessionInst.useCustomCardList = true;
		SessionInst.colorBalance = true;
		SessionInst.setCustomCardList(parseCardList(CustomSheetsTestFile));
		const trackedCards = {};
		for (let cid of SessionInst.customCardList.cards.Common) trackedCards[cid] = 0;
		for (let i = 0; i < trials; i++) {
			SessionInst.generateBoosters(3 * 8);
			let boosters = SessionInst.boosters;
			boosters.forEach(booster =>
				booster.forEach(card => {
					if (card.id in trackedCards) ++trackedCards[card.id];
				})
			);
		}
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
				"Relative Difference": relativeDifference,
			});
			maxRelativeDifference = Math.max(maxRelativeDifference, relativeDifference);
		}
		console.table(logTable);
		expect(maxRelativeDifference).to.be.at.most(0.2);
		done();
	});

	it(`Modal Double Faced Uncommons of Zendikar Rising should have an apparition rate similar to Single Faced Uncommons' (<= 20% relative difference)`, function(done) {
		this.timeout(8000);
		const trials = 10000;
		const SessionInst = new Session("UniqueID");
		SessionInst.colorBalance = true;
		SessionInst.setRestriction = ["znr"];
		//SessionInst.foil = true;
		const trackedCards = {};
		for (let cid of Object.keys(SessionInst.cardPoolByRarity().uncommon))
			trackedCards[cid] = 0;
		for (let i = 0; i < trials; i++) {
			SessionInst.generateBoosters(3 * 8);
			SessionInst.boosters.forEach(booster =>
				booster.forEach(card => {
					if (card.id in trackedCards) ++trackedCards[card.id];
				})
			);
		}
		// Select 10 pairs of cards and compare their rates
		const logTable = [];
		let maxRelativeDifference = 0;
		const MDFCs = Object.keys(trackedCards).filter(cid => Cards[cid].name.includes("//"));
		for(let id0 of MDFCs) {
			let id1 = getRandomKey(trackedCards);
			while (MDFCs.includes(id1) || id1 === id0) id1 = getRandomKey(trackedCards);
			const relativeDifference =
				2 * Math.abs((trackedCards[id1] - trackedCards[id0]) / (trackedCards[id1] + trackedCards[id0]));
			logTable.push({
				"1st Card Name": Cards[id0].name,
				"1st Card Count": trackedCards[id0],
				"2nd Card Name": Cards[id1].name,
				"2nd Card Count": trackedCards[id1],
				"Relative Difference": relativeDifference,
			});
			maxRelativeDifference = Math.max(maxRelativeDifference, relativeDifference);
		}
		console.table(logTable);
		expect(maxRelativeDifference).to.be.at.most(0.2);
		done();
	});

	it(`Modal Double Faced Rares of Zendikar Rising should have an apparition rate similar to Single Faced Rares' (<= 20% relative difference)`, function(done) {
		this.timeout(8000);
		const trials = 10000;
		const SessionInst = new Session("UniqueID");
		SessionInst.colorBalance = true;
		SessionInst.setRestriction = ["znr"];
		//SessionInst.foil = true;
		const trackedCards = {};
		for (let cid of Object.keys(SessionInst.cardPoolByRarity().rare))
			trackedCards[cid] = 0;
		for (let i = 0; i < trials; i++) {
			SessionInst.generateBoosters(3 * 8);
			SessionInst.boosters.forEach(booster =>
				booster.forEach(card => {
					if (card.id in trackedCards) ++trackedCards[card.id];
				})
			);
		}
		// Select 10 pairs of cards and compare their rates
		const logTable = [];
		let maxRelativeDifference = 0;
		const MDFCs = Object.keys(trackedCards).filter(cid => Cards[cid].name.includes("//"));
		for(let id0 of MDFCs) {
			let id1 = getRandomKey(trackedCards);
			while (MDFCs.includes(id1) || id1 === id0) id1 = getRandomKey(trackedCards);
			const relativeDifference =
				2 * Math.abs((trackedCards[id1] - trackedCards[id0]) / (trackedCards[id1] + trackedCards[id0]));
			logTable.push({
				"1st Card Name": Cards[id0].name,
				"1st Card Count": trackedCards[id0],
				"2nd Card Name": Cards[id1].name,
				"2nd Card Count": trackedCards[id1],
				"Relative Difference": relativeDifference,
			});
			maxRelativeDifference = Math.max(maxRelativeDifference, relativeDifference);
		}
		console.table(logTable);
		expect(maxRelativeDifference).to.be.at.most(0.2);
		done();
	});
});

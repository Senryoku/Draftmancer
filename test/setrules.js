import { before, after, beforeEach, afterEach, describe, it } from "mocha";
import chai from "chai";
const expect = chai.expect;
import { Sessions } from "../dist/Session.js";
import { makeClients, waitForClientDisconnects, enableLogs, disableLogs } from "./src/common.js";

describe("Set Specific Booster Rules", function () {
	let clients = [];
	let sessionID = "SessionID";

	const validateColorBalance = (booster) => {
		const colors = "WUBRG";
		const commons = booster.filter((card) => card.rarity == "common");
		for (let color of colors) {
			let count = commons.filter((card) => card.colors.includes(color)).length;
			expect(count).to.be.at.least(1);
		}
	};

	const validateDOMBooster = function (booster) {
		const regex = /Legendary.*Creature/;
		expect(booster.map((c) => c.set).every((s) => s === "dom")).to.be.true;
		let LCCount = booster.reduce((acc, val) => {
			return acc + val.type.match(regex) ? 1 : 0;
		}, 0);
		expect(LCCount).to.gte(1);
	};

	const validateWARBooster = function (booster) {
		expect(booster.map((c) => c.set).every((s) => s === "war")).to.be.true;
		let PLCount = booster.reduce((acc, val) => {
			return acc + val.type.includes("Planeswalker") ? 1 : 0;
		}, 0);
		expect(PLCount).to.equal(1);
	};

	const validateZNRBooster = function (booster) {
		expect(booster.map((c) => c.set).every((s) => s === "znr")).to.be.true;
		const PLCount = booster.reduce((acc, val) => {
			return acc + val.name.includes("//") ? 1 : 0;
		}, 0);
		expect(PLCount).to.equal(1);
	};

	const validateSTXBooster = function (booster) {
		expect(booster.map((c) => c.set).every((s) => s === "stx" || s === "sta")).to.be.true;
		const ArchiveCount = booster.reduce((acc, val) => {
			return acc + (val.set === "sta" ? 1 : 0);
		}, 0);
		expect(ArchiveCount).to.equal(1);
		const LessonCount = booster.reduce((acc, val) => {
			return acc + val.subtypes.includes("Lesson") ? 1 : 0;
		}, 0);
		expect(LessonCount).to.be.within(1, 2);
	};

	const validateMH2Booster = function (booster) {
		expect(booster.map((c) => c.set).every((s) => s === "mh2")).to.be.true;
		const newToModernCount = booster.reduce((acc, val) => {
			return acc + (val.collector_number >= 261 && val.collector_number <= 303 ? 1 : 0);
		}, 0);
		expect(newToModernCount).to.equal(1);
	};

	const validateMIDBooster = function (booster) {
		expect(booster.map((c) => c.set).every((s) => s === "mid")).to.be.true;
		const CommonDFC = booster.reduce((acc, val) => {
			return acc + (val.rarity === "common" && val.name.includes("//")) ? 1 : 0;
		}, 0);
		expect(CommonDFC).to.equal(1);
		const UncommonDFC = booster.reduce((acc, val) => {
			return acc +
				((val.rarity === "uncommon" || val.rarity === "rare" || val.rarity === "mythic") &&
					val.name.includes("//"))
				? 1
				: 0;
		}, 0);
		expect(UncommonDFC).to.equal(1);
	};

	const validateVOWBooster = function (booster) {
		expect(booster.map((c) => c.set).every((s) => s === "vow")).to.be.true;
		const CommonDFC = booster.reduce((acc, val) => {
			return acc + (val.rarity === "common" && val.name.includes("//")) ? 1 : 0;
		}, 0);
		expect(CommonDFC).to.equal(1);
		const UncommonDFC = booster.reduce((acc, val) => {
			return acc +
				((val.rarity === "uncommon" || val.rarity === "rare" || val.rarity === "mythic") &&
					val.name.includes("//"))
				? 1
				: 0;
		}, 0);
		expect(UncommonDFC).to.equal(1);
	};

	const validateCLBBooster = function (booster) {
		expect(booster.map((c) => c.set).every((s) => s === "clb")).to.be.true;
		const Legend = booster.reduce((acc, val) => {
			return acc +
				(val.type === "Legendary Creature" ||
					(val.type === "Legendary Planeswalker" &&
						!["Vivien, Champion of the Wilds", "Xenagos, the Reveler", "Faceless One"].includes(val.name)))
				? 1
				: 0;
		}, 0);
		expect(Legend).to.equal(1);
		const LegendBG = booster.reduce((acc, val) => {
			return acc + (val.type === "Legendary Enchantment" && val.subtypes.includes("Background")) ? 1 : 0;
		}, 0);
		expect(LegendBG).to.equal(1);
		const Foil = booster.reduce((acc, val) => {
			return acc + val.foil ? 1 : 0;
		}, 0);
		expect(Foil).to.equal(1);
	};

	beforeEach(function (done) {
		disableLogs();
		done();
	});

	afterEach(function (done) {
		enableLogs(this.currentTest.state == "failed");
		done();
	});

	before(function (done) {
		let queries = [];
		for (let i = 0; i < 8; ++i)
			queries.push({
				sessionID: sessionID,
				userName: "DontCare",
			});
		clients = makeClients(queries, done);
	});

	after(function (done) {
		disableLogs();
		for (let c of clients) {
			c.disconnect();
		}

		waitForClientDisconnects(done);
	});

	const testSet = function (set, validationFunc, desc) {
		it(`${set} boosters should have ${desc} (Single set restriction).`, function (done) {
			let ownerIdx = clients.findIndex((c) => c.query.userID == Sessions[sessionID].owner);
			clients[ownerIdx].emit("ignoreCollections", true);
			clients[ownerIdx].emit("setRestriction", [set]);
			clients[ownerIdx].emit("setCustomBoosters", ["", "", ""]);
			clients[ownerIdx].once("nextBooster", function () {
				for (let b of Sessions[sessionID].draftState.boosters) validationFunc(b);
				clients[ownerIdx].once("endDraft", function () {
					done();
				});
				clients[ownerIdx].emit("stopDraft");
			});
			clients[ownerIdx].emit("startDraft");
		});

		it(`${set} boosters should have ${desc} (Custom boosters).`, function (done) {
			let ownerIdx = clients.findIndex((c) => c.query.userID == Sessions[sessionID].owner);
			clients[ownerIdx].emit("ignoreCollections", true);
			clients[ownerIdx].emit("setRestriction", []);
			clients[ownerIdx].emit("setCustomBoosters", [set, set, set]);
			clients[ownerIdx].once("nextBooster", function () {
				for (let b of Sessions[sessionID].draftState.boosters) validationFunc(b);
				clients[ownerIdx].once("endDraft", function () {
					done();
				});
				clients[ownerIdx].emit("stopDraft");
			});
			clients[ownerIdx].emit("startDraft");
		});
	};

	testSet("dom", validateDOMBooster, "at least one legendary creature per pack");
	testSet("war", validateWARBooster, "exactly one planeswalker per pack");
	testSet("znr", validateZNRBooster, "exactly one MDFC per pack");
	testSet("stx", validateSTXBooster, "exactly one STA and 1 or 2 lesson(s) per pack");
	testSet("mh2", validateMH2Booster, "exactly one New-to-Modern card per pack");
	testSet("mid", validateMIDBooster, "exactly one common DFC and at most one uncommon DFC per pack");
	testSet("vow", validateVOWBooster, "exactly one common DFC and at most one uncommon DFC per pack");
	testSet("clb", validateCLBBooster, "one legendary creature or planeswalker, one legendary background");

	testSet("vow", validateColorBalance, "at least one common of each color.");
	it(`VOW boosters should have at least one common of each color, even with foil on.`, function (done) {
		let ownerIdx = clients.findIndex((c) => c.query.userID == Sessions[sessionID].owner);
		clients[ownerIdx].emit("ignoreCollections", true);
		clients[ownerIdx].emit("setRestriction", ["vow"]);
		clients[ownerIdx].emit("setFoil", true);
		clients[ownerIdx].emit("setCustomBoosters", ["", "", ""]);
		clients[ownerIdx].once("nextBooster", function () {
			for (let b of Sessions[sessionID].draftState.boosters) validateColorBalance(b);
			clients[ownerIdx].once("endDraft", function () {
				done();
			});
			clients[ownerIdx].emit("stopDraft");
		});
		clients[ownerIdx].emit("startDraft");
	});

	it(`Validate mixed Custom boosters.`, function (done) {
		let ownerIdx = clients.findIndex((c) => c.query.userID == Sessions[sessionID].owner);
		clients[ownerIdx].emit("ignoreCollections", true);
		clients[ownerIdx].emit("setRestriction", []);
		clients[ownerIdx].emit("setCustomBoosters", ["dom", "war", "dom"]);
		clients[ownerIdx].once("nextBooster", function () {
			for (let idx = 0; idx < Sessions[sessionID].boosters.length; ++idx)
				if (Math.floor(idx / 8) === 1) validateWARBooster(Sessions[sessionID].boosters[idx]);
				else validateDOMBooster(Sessions[sessionID].boosters[idx]);
			clients[ownerIdx].once("endDraft", function () {
				done();
			});
			clients[ownerIdx].emit("stopDraft");
		});
		clients[ownerIdx].emit("startDraft");
	});

	it(`Validate mixed Custom boosters with regular set restriction.`, function (done) {
		let ownerIdx = clients.findIndex((c) => c.query.userID == Sessions[sessionID].owner);
		clients[ownerIdx].emit("ignoreCollections", true);
		clients[ownerIdx].emit("setRestriction", ["dom"]);
		clients[ownerIdx].emit("setCustomBoosters", ["", "war", "dom"]);
		clients[ownerIdx].once("nextBooster", function () {
			for (let idx = 0; idx < Sessions[sessionID].boosters.length; ++idx)
				if (Math.floor(idx / 8) === 1) validateWARBooster(Sessions[sessionID].boosters[idx]);
				else validateDOMBooster(Sessions[sessionID].boosters[idx]);
			clients[ownerIdx].once("endDraft", function () {
				done();
			});
			clients[ownerIdx].emit("stopDraft");
		});
		clients[ownerIdx].emit("startDraft");
	});
});

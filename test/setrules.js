import chai from "chai";
const expect = chai.expect;
import { Sessions } from "../src/Session.js";
import { makeClients, waitForClientDisconnects, enableLogs, disableLogs } from "./src/common.js";

describe("Set Specific Booster Rules", function() {
	let clients = [];
	let sessionID = "SessionID";

	const validateDOMBooster = function(booster) {
		const regex = /Legendary.*Creature/;
		expect(booster.map(c => c.set).every(s => s === "dom")).to.be.true;
		let LCCount = booster.reduce((acc, val) => {
			return acc + val.type.match(regex) ? 1 : 0;
		}, 0);
		expect(LCCount).to.gte(1);
	};

	const validateWARBooster = function(booster) {
		expect(booster.map(c => c.set).every(s => s === "war")).to.be.true;
		let PLCount = booster.reduce((acc, val) => {
			return acc + val.type.includes("Planeswalker") ? 1 : 0;
		}, 0);
		expect(PLCount).to.equal(1);
	};

	const validateZNRBooster = function(booster) {
		expect(booster.map(c => c.set).every(s => s === "znr")).to.be.true;
		let PLCount = booster.reduce((acc, val) => {
			return acc + val.name.includes("//") ? 1 : 0;
		}, 0);
		expect(PLCount).to.equal(1);
	};

	const validateSTXBooster = function(booster) {
		expect(booster.map(c => c.set).every(s => s === "stx" || s === "sta")).to.be.true;
		let ArchiveCount = booster.reduce((acc, val) => {
			return acc + (val.set === "sta" ? 1 : 0);
		}, 0);
		expect(ArchiveCount).to.equal(1);
		let LessonCount = booster.reduce((acc, val) => {
			return acc + val.subtypes.includes("Lesson") ? 1 : 0;
		}, 0);
		expect(LessonCount).to.be.within(1, 2);
	};

	beforeEach(function(done) {
		disableLogs();
		done();
	});

	afterEach(function(done) {
		enableLogs(this.currentTest.state == "failed");
		done();
	});

	before(function(done) {
		let queries = [];
		for (let i = 0; i < 8; ++i)
			queries.push({
				sessionID: sessionID,
				userName: "DontCare",
			});
		clients = makeClients(queries, done);
	});

	after(function(done) {
		disableLogs();
		for (let c of clients) {
			c.disconnect();
		}

		waitForClientDisconnects(done);
	});

	const testSet = function(set, validationFunc, desc) {
		it(`${set} boosters should have ${desc} (Single set restriction).`, function(done) {
			let ownerIdx = clients.findIndex(c => c.query.userID == Sessions[sessionID].owner);
			clients[ownerIdx].emit("ignoreCollections", true);
			clients[ownerIdx].emit("setRestriction", [set]);
			clients[ownerIdx].emit("setCustomBoosters", ["", "", ""]);
			clients[ownerIdx].once("startDraft", function() {
				for (let b of Sessions[sessionID].boosters) validationFunc(b);
				clients[ownerIdx].once("endDraft", function() {
					done();
				});
				clients[ownerIdx].emit("stopDraft");
			});
			clients[ownerIdx].emit("startDraft");
		});

		it(`${set} boosters should have ${desc} (Custom boosters).`, function(done) {
			let ownerIdx = clients.findIndex(c => c.query.userID == Sessions[sessionID].owner);
			clients[ownerIdx].emit("ignoreCollections", true);
			clients[ownerIdx].emit("setRestriction", []);
			clients[ownerIdx].emit("setCustomBoosters", [set, set, set]);
			clients[ownerIdx].once("startDraft", function() {
				for (let b of Sessions[sessionID].boosters) validationFunc(b);
				clients[ownerIdx].once("endDraft", function() {
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

	it(`Validate mixed Custom boosters.`, function(done) {
		let ownerIdx = clients.findIndex(c => c.query.userID == Sessions[sessionID].owner);
		clients[ownerIdx].emit("ignoreCollections", true);
		clients[ownerIdx].emit("setRestriction", []);
		clients[ownerIdx].emit("setCustomBoosters", ["dom", "war", "dom"]);
		clients[ownerIdx].once("startDraft", function() {
			for (let idx = 0; idx < Sessions[sessionID].boosters.length; ++idx)
				if (Math.floor(idx / 8) === 1) validateWARBooster(Sessions[sessionID].boosters[idx]);
				else validateDOMBooster(Sessions[sessionID].boosters[idx]);
			clients[ownerIdx].once("endDraft", function() {
				done();
			});
			clients[ownerIdx].emit("stopDraft");
		});
		clients[ownerIdx].emit("startDraft");
	});

	it(`Validate mixed Custom boosters with regular set restriction.`, function(done) {
		let ownerIdx = clients.findIndex(c => c.query.userID == Sessions[sessionID].owner);
		clients[ownerIdx].emit("ignoreCollections", true);
		clients[ownerIdx].emit("setRestriction", ["dom"]);
		clients[ownerIdx].emit("setCustomBoosters", ["", "war", "dom"]);
		clients[ownerIdx].once("startDraft", function() {
			for (let idx = 0; idx < Sessions[sessionID].boosters.length; ++idx)
				if (Math.floor(idx / 8) === 1) validateWARBooster(Sessions[sessionID].boosters[idx]);
				else validateDOMBooster(Sessions[sessionID].boosters[idx]);
			clients[ownerIdx].once("endDraft", function() {
				done();
			});
			clients[ownerIdx].emit("stopDraft");
		});
		clients[ownerIdx].emit("startDraft");
	});
});

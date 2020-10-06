import fs from "fs";
import chai from "chai";
const expect = chai.expect;
import Cards from "./../src/Cards.js";
import { Sessions } from "../src/Session.js";
import { makeClients, waitForClientDisconnects, enableLogs, disableLogs } from "./src/common.js";

describe("Set Specific Booster Rules", function() {
	let clients = [];
	let sessionID = "SessionID";

	const validateDOMBooster = function(booster) {
		const regex = /Legendary.*Creature/;
		expect(booster.map(cid => Cards[cid].set).every(s => s === "dom")).to.be.true;
		let LCCount = booster.reduce((acc, val) => {
			return acc + Cards[val].type.match(regex) ? 1 : 0;
		}, 0);
		expect(LCCount).to.gte(1);
	};

	const validateWARBooster = function(booster) {
		expect(booster.map(cid => Cards[cid].set).every(s => s === "war")).to.be.true;
		let PLCount = booster.reduce((acc, val) => {
			return acc + Cards[val].type.includes("Planeswalker") ? 1 : 0;
		}, 0);
		expect(PLCount).to.equal(1);
	};

	const validateZNRBooster = function(booster) {
		expect(booster.map(cid => Cards[cid].set).every(s => s === "znr")).to.be.true;
		let PLCount = booster.reduce((acc, val) => {
			return acc + Cards[val].name.includes("//") ? 1 : 0;
		}, 0);
		expect(PLCount).to.equal(1);
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
				userID: "sameID",
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

	it(`Validate mixed Custom boosters.`, function(done) {
		let ownerIdx = clients.findIndex(c => c.query.userID == Sessions[sessionID].owner);
		clients[ownerIdx].emit("ignoreCollections", true);
		clients[ownerIdx].emit("setRestriction", []);
		clients[ownerIdx].emit("setCustomBoosters", ["dom", "war", "dom"]);
		clients[ownerIdx].once("startDraft", function() {
			for (let idx = 0; idx < Sessions[sessionID].boosters.length; ++idx)
				if (Math.floor(idx / 8) == 1) validateWARBooster(Sessions[sessionID].boosters[idx]);
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
				if (Math.floor(idx / 8) == 1) validateWARBooster(Sessions[sessionID].boosters[idx]);
				else validateDOMBooster(Sessions[sessionID].boosters[idx]);
			clients[ownerIdx].once("endDraft", function() {
				done();
			});
			clients[ownerIdx].emit("stopDraft");
		});
		clients[ownerIdx].emit("startDraft");
	});
});

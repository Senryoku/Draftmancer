"use strict";

import fs from "fs";
import chai from "chai";
const expect = chai.expect;
import { Cards } from "./../src/Cards.js";
import { Connections } from "../src/Connection.js";
import { Sessions } from "../src/Session.js";
import randomjs from "random-js";
import {
	connectClient,
	makeClients,
	enableLogs,
	disableLogs,
	waitForSocket,
	waitForClientDisconnects,
} from "./src/common.js";
import Constants from "../client/src/data/constants.json";

const checkColorBalance = function(booster) {
	for (let color of "WUBRG")
		expect(booster.filter(card => card.rarity === "common" && card.colors.includes(color)).length).to.be.at.least(
			1
		);
};

const checkDuplicates = function(booster) {
	// Foils can be duplicates
	let sorted = [...booster].sort((lhs, rhs) => (lhs.id < rhs.id ? -1 : 1));
	for (let idx = 0; idx < sorted.length - 1; ++idx) {
		const test = sorted[idx].id === sorted[idx + 1].id && sorted[idx].foil === sorted[idx + 1].foil;
		if (test) {
			console.error("Duplicates found: ");
			console.error(sorted[idx]);
			console.error(sorted[idx + 1]);
		}
		expect(test).to.be.false;
	}
};

const CustomSheetsTestFile = fs.readFileSync(`./test/data/CustomSheets.txt`, "utf8");

describe("Inter client communication", function() {
	const sessionID = "sessionID";
	let sender, receiver;

	beforeEach(function(done) {
		disableLogs();
		done();
	});

	afterEach(function(done) {
		enableLogs(this.currentTest.state == "failed");
		done();
	});

	before(function(done) {
		disableLogs();
		expect(Object.keys(Connections).length).to.equal(0);
		sender = connectClient({
			userID: "sender",
			sessionID: sessionID,
			userName: "sender",
		});
		receiver = connectClient({
			userID: "receiver",
			sessionID: sessionID,
			userName: "receiver",
		});
		enableLogs(false);
		done();
	});

	after(function(done) {
		disableLogs();
		sender.disconnect();
		receiver.disconnect();

		waitForClientDisconnects(done);
	});

	describe("Chat Events", function() {
		const text = "Text Value";
		it("Clients should receive a message when the `chatMessage` event is emited.", function(done) {
			receiver.on("chatMessage", function(msg) {
				expect(msg.text).to.equal(text);
				done();
			});
			sender.emit("chatMessage", { text: text });
		});
	});

	describe("Personal options updates", function() {
		it("Clients should receive the updated userName when a user changes it.", function(done) {
			receiver.once("updateUser", function(data) {
				expect(data.userID).to.equal("sender");
				expect(data.updatedProperties.userName).to.equal("senderUpdatedUserName");
				done();
			});
			sender.emit("setUserName", "senderUpdatedUserName");
		});
		it("Clients should receive the updated useCollection status.", function(done) {
			receiver.once("updateUser", function(data) {
				expect(data.userID).to.equal("sender");
				expect(data.updatedProperties.useCollection).to.equal(false);
				done();
			});
			sender.emit("useCollection", false);
		});
		it("Clients should NOT receive an update if the option is not actually changed.", function(done) {
			let timeout = setTimeout(() => {
				receiver.removeListener("updateUser");
				done();
			}, 200);
			receiver.once("updateUser", () => {
				clearTimeout(timeout);
				done(new Error("Unexpected Call"));
			});
			sender.emit("useCollection", false);
		});
		it("Clients should receive the updated useCollection status.", function(done) {
			receiver.once("updateUser", function(data) {
				expect(data.userID).to.equal("sender");
				expect(data.updatedProperties.useCollection).to.equal(true);
				done();
			});
			sender.emit("useCollection", true);
		});
		it("Clients should receive the updated userName.", function(done) {
			receiver.once("updateUser", function(data) {
				expect(data.userID).to.equal("sender");
				expect(data.updatedProperties.userName).to.equal("Sender New UserName");
				done();
			});
			sender.emit("setUserName", "Sender New UserName");
		});
		it("Clients should receive the updated maxDuplicates.", function(done) {
			const newMaxDuplicates = { common: 5, uncommon: 4, rare: 1, mythic: 1 };
			receiver.once("sessionOptions", function(options) {
				expect(options.maxDuplicates).to.eql(newMaxDuplicates);
				done();
			});
			sender.emit("setMaxDuplicates", newMaxDuplicates);
		});
		it("Removing non-owner.", function(done) {
			receiver.once("setSession", function(newID) {
				expect(Sessions[sessionID].users.size).to.equal(1);
				expect(Sessions[sessionID].users).to.not.include(receiver.query.userID);
				expect(newID).to.not.equal(sessionID);
				done();
			});
			sender.emit("removePlayer", receiver.query.userID);
		});
	});
});

describe("Sets content", function() {
	let clients = [];
	let sessionID = "sessionID";

	let sets = {
		dom: { common: 101, uncommon: 80, rare: 53, mythic: 15 },
		grn: { common: 111, uncommon: 80, rare: 53, mythic: 15 },
		rna: { common: 111, uncommon: 80, rare: 53, mythic: 15 },
		war: { common: 101, uncommon: 80, rare: 53, mythic: 15 },
		eld: { common: 101, uncommon: 80, rare: 53, mythic: 15 },
		thb: { common: 101, uncommon: 80, rare: 53, mythic: 15 },
		iko: { common: 111, uncommon: 80, rare: 53, mythic: 15 },
		m21: { common: 111, uncommon: 80, rare: 53, mythic: 15 },
		akr: { common: 108, uncommon: 90, rare: 74, mythic: 31 },
		znr: { common: 101, uncommon: 80, rare: 64, mythic: 20 },
		klr: { common: 104, uncommon: 97, rare: 63, mythic: 23 - 1 }, // Exclude the Buy-a-Box mythic
		khm: { common: 111, uncommon: 80, rare: 64, mythic: 20 },
		tsr: { common: 121, uncommon: 100, rare: 53, mythic: 15 },
		stx: { common: 105, uncommon: 80, rare: 69, mythic: 21 },
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
		clients = makeClients(
			[
				{
					userID: "id1",
					sessionID: sessionID,
					userName: "Client1",
				},
				{
					userID: "id2",
					sessionID: sessionID,
					userName: "Client2",
				},
			],
			done
		);
	});

	after(function(done) {
		disableLogs();
		for (let c of clients) {
			c.disconnect();
		}
		waitForClientDisconnects(done);
	});

	it("2 clients with different userID should be connected.", function(done) {
		expect(Object.keys(Connections)).to.have.lengthOf(2);
		done();
	});

	for (let set in sets) {
		it(`Checking ${set}`, function(done) {
			let ownerIdx = clients.findIndex(c => c.query.userID == Sessions[sessionID].owner);
			let nonOwnerIdx = 1 - ownerIdx;
			clients[nonOwnerIdx].once("setRestriction", function(sR) {
				const localCollection = Sessions[sessionID].cardPoolByRarity();
				for (let r in sets[set]) {
					expect(
						Object.keys(localCollection[r])
							.map(cid => Cards[cid].set)
							.every(s => s === set)
					).to.be.true;
					expect(Object.keys(localCollection[r])).to.have.lengthOf(sets[set][r]);
				}
				done();
			});
			clients[ownerIdx].emit("ignoreCollections", true);
			clients[ownerIdx].emit("setRestriction", [set]);
			// Wait for request to arrive
		});
	}
});

describe("Single Draft (Two Players)", function() {
	let clients = [];
	let sessionID = "sessionID";
	let ownerIdx;
	let nonOwnerIdx;
	let boosters = [];

	beforeEach(function(done) {
		disableLogs();
		done();
	});

	afterEach(function(done) {
		enableLogs(this.currentTest.state == "failed");
		done();
	});

	function connect() {
		it("2 clients with different userIDs should be connected.", function(done) {
			clients = makeClients(
				[
					{
						userID: "id1",
						sessionID: sessionID,
						userName: "Client1",
					},
					{
						userID: "id2",
						sessionID: sessionID,
						userName: "Client2",
					},
				],
				() => {
					expect(Connections).to.have.property("id1");
					expect(Connections).to.have.property("id2");
					expect(Object.keys(Connections).length).to.equal(2);
					ownerIdx = clients.findIndex(c => c.query.userID == Sessions[sessionID].owner);
					nonOwnerIdx = 1 - ownerIdx;
					done();
				}
			);
		});
	}

	function disconnect() {
		it("Clients should disconnect.", function(done) {
			disableLogs();
			for (let c of clients) {
				c.disconnect();
			}

			waitForClientDisconnects(done);
		});
	}

	function startDraft() {
		it("When session owner launches draft, everyone should receive a startDraft event", function(done) {
			let connectedClients = 0;
			let receivedBoosters = 0;
			for (let c in clients) {
				clients[c].once("startDraft", function() {
					connectedClients += 1;
					if (connectedClients == clients.length && receivedBoosters == clients.length) done();
				});

				const _idx = c;
				(() => {
					clients[c].once("nextBooster", function(data) {
						expect(boosters).not.include(data.booster);
						boosters[_idx] = data.booster;
						receivedBoosters += 1;
						if (connectedClients == clients.length && receivedBoosters == clients.length) done();
					});
				})();
			}
			clients[ownerIdx].emit("startDraft");
		});
	}

	function singlePick() {
		it("Once everyone in a session has picked a card, receive next boosters.", function(done) {
			let receivedBoosters = 0;
			for (let c = 0; c < clients.length; ++c) {
				clients[c].once("nextBooster", function(data) {
					const idx = c;
					receivedBoosters += 1;
					expect(data.booster.length).to.equal(boosters[idx].length - 1);
					boosters[idx] = data.booster;
					if (receivedBoosters == clients.length) done();
				});
				clients[c].emit("pickCard", { pickedCards: [0] }, () => {});
			}
		});
	}

	function endDraft() {
		it("Pick enough times, and the draft should end.", function(done) {
			let draftEnded = 0;
			for (let c = 0; c < clients.length; ++c) {
				const idx = c;
				clients[c].on("nextBooster", function(data) {
					boosters[idx] = data.booster;
					this.emit(
						"pickCard",
						{ pickedCards: [Math.floor(Math.random() * boosters[idx].length)] },
						() => {}
					);
				});
				clients[c].once("endDraft", function() {
					draftEnded += 1;
					this.removeListener("nextBooster");
					if (draftEnded == clients.length) {
						boosters = [];
						done();
					}
				});
			}
			for (let c = 0; c < clients.length; ++c) {
				clients[c].emit(
					"pickCard",
					{ pickedCards: [Math.floor(Math.random() * boosters[c].length)] },
					() => {}
				);
			}
		});
	}

	describe("With a third player and color balance", function() {
		connect();
		it("3 clients with different userID should be connected.", function(done) {
			let idx = clients.push(
				connectClient({
					userID: "id3",
					sessionID: sessionID,
					userName: "Client3",
				})
			);

			clients[idx - 1].on("connect", function() {
				expect(Object.keys(Connections).length).to.equal(3);
				done();
			});
		});

		it(`Card Pool should be all of THB set`, function(done) {
			ownerIdx = clients.findIndex(c => c.query.userID == Sessions[sessionID].owner);
			nonOwnerIdx = 1 - ownerIdx;
			clients[ownerIdx].emit("setColorBalance", true);
			clients[ownerIdx].emit("ignoreCollections", true);
			clients[nonOwnerIdx].once("setRestriction", () => {
				const localCollection = Sessions[sessionID].cardPoolByRarity();
				expect(Object.keys(localCollection["common"])).to.have.lengthOf(101);
				expect(Object.keys(localCollection["uncommon"])).to.have.lengthOf(80);
				expect(Object.keys(localCollection["rare"])).to.have.lengthOf(53);
				expect(Object.keys(localCollection["mythic"])).to.have.lengthOf(15);
				done();
			});
			clients[ownerIdx].emit("setRestriction", ["thb"]);
		});
		startDraft();
		it("Boosters are color balanced and contain no duplicate.", function(done) {
			for (let b of Sessions[sessionID].boosters) {
				checkColorBalance(b);
				checkDuplicates(b);
			}
			done();
		});
		singlePick();
		endDraft();
		disconnect();
	});

	for (let set of Constants.PrimarySets) {
		describe(`Drafting ${set}`, function() {
			connect();
			it("Clients should receive the updated setRestriction status.", function(done) {
				let ownerIdx = clients.findIndex(c => c.query.userID == Sessions[sessionID].owner);
				let nonOwnerIdx = 1 - ownerIdx;
				clients[nonOwnerIdx].once("setRestriction", function(setRestriction) {
					expect(setRestriction).to.have.lengthOf(1);
					expect(setRestriction[0]).to.be.equal(set);
					done();
				});
				clients[ownerIdx].emit("ignoreCollections", true);
				clients[ownerIdx].emit("setRestriction", [set]);
			});
			startDraft();
			it("All cards in booster should be of the desired set.", function(done) {
				for (let b of Sessions[sessionID].boosters) {
					checkDuplicates(b);
					expect(
						b.every(
							c =>
								c.set === set ||
								(set === "mb1" && c.set === "fmb1") ||
								(set === "tsp" && c.set === "tsb") ||
								(set === "frf" && c.set === "ktk") ||
								(set === "dgm" && (c.set === "gtc" || c.set === "rtr")) ||
								(set === "stx" && c.set === "sta")
						)
					).to.be.true;
				}
				done();
			});
			endDraft();
			disconnect();
		});
	}

	describe(`Drafting without set restriction`, function() {
		connect();
		it("Clients should receive the updated setRestriction status.", function(done) {
			let ownerIdx = clients.findIndex(c => c.query.userID == Sessions[sessionID].owner);
			let nonOwnerIdx = 1 - ownerIdx;
			clients[nonOwnerIdx].once("setRestriction", function(setRestriction) {
				expect(setRestriction).to.have.lengthOf(0);
				done();
			});
			clients[ownerIdx].emit("ignoreCollections", true);
			clients[ownerIdx].emit("setRestriction", []);
		});
		startDraft();
		endDraft();
		disconnect();
	});

	describe("Without color balance", function() {
		connect();
		it("Clients should receive the updated colorBalance status.", function(done) {
			ownerIdx = clients.findIndex(c => c.query.userID == Sessions[sessionID].owner);
			nonOwnerIdx = 1 - ownerIdx;
			clients[nonOwnerIdx].once("sessionOptions", function(options) {
				expect(options.colorBalance).to.equal(false);
				done();
			});
			clients[ownerIdx].emit("setColorBalance", false);
		});
		startDraft();
		endDraft();
		disconnect();
	});

	describe("With Bots", function() {
		connect();
		it("Clients should receive the updated bot count.", function(done) {
			ownerIdx = clients.findIndex(c => c.query.userID == Sessions[sessionID].owner);
			nonOwnerIdx = 1 - ownerIdx;
			clients[nonOwnerIdx].once("bots", function(bots) {
				expect(bots).to.equal(6);
				done();
			});
			clients[ownerIdx].emit("bots", 6);
		});
		startDraft();
		endDraft();
		disconnect();
	});

	describe("With Bots and foils", function() {
		connect();
		it("Clients should receive the updated bot count.", function(done) {
			clients[nonOwnerIdx].once("bots", function(bots) {
				expect(bots).to.equal(6);
				done();
			});
			clients[ownerIdx].emit("bots", 6);
		});
		it("Clients should receive the updated session option (foil).", function(done) {
			clients[nonOwnerIdx].once("sessionOptions", function(val) {
				expect(val.foil).to.equal(true);
				done();
			});
			clients[ownerIdx].emit("setFoil", true);
		});
		startDraft();
		endDraft();
		disconnect();
	});

	describe("With Bots and Disconnect", function() {
		connect();
		it("Clients should receive the updated bot count.", function(done) {
			clients[nonOwnerIdx].once("bots", function(bots) {
				expect(bots).to.equal(6);
				done();
			});
			clients[ownerIdx].emit("bots", 6);
		});

		startDraft();

		it("Non-owner disconnects, Owner receives updated user infos.", function(done) {
			clients[ownerIdx].once("userDisconnected", function() {
				waitForSocket(clients[nonOwnerIdx], done);
			});
			clients[nonOwnerIdx].disconnect();
		});

		it("Non-owner reconnects, draft restarts.", function(done) {
			clients[ownerIdx].on("resumeOnReconnection", function() {
				done();
			});
			clients[nonOwnerIdx].connect();
		});

		endDraft();
		disconnect();
	});

	describe("With Disconnect and replacing by a bot.", function() {
		connect();
		startDraft();

		it("Non-owner disconnects, owner receives a warning.", function(done) {
			clients[ownerIdx].once("userDisconnected", () => {
				waitForSocket(clients[nonOwnerIdx], () => {
					clients.splice(nonOwnerIdx, 1);
					done();
				});
			});
			clients[nonOwnerIdx].disconnect();
			boosters.splice(nonOwnerIdx, 1);
			ownerIdx = 0;
		});

		it("Owner chooses to replace by bots.", function(done) {
			clients[ownerIdx].once("resumeOnReconnection", function() {
				done();
			});
			clients[ownerIdx].emit("replaceDisconnectedPlayers");
		});

		endDraft();
		disconnect();
	});

	describe("With custom boosters and bots", function() {
		const CustomBoosters = ["xln", "rix", ""];
		connect();
		it("Clients should receive the updated bot count.", function(done) {
			ownerIdx = clients.findIndex(c => c.query.userID == Sessions[sessionID].owner);
			nonOwnerIdx = 1 - ownerIdx;
			clients[nonOwnerIdx].once("bots", function(bots) {
				expect(bots).to.equal(6);
				done();
			});
			clients[ownerIdx].emit("bots", 6);
		});

		it("Clients should receive the updated booster spec.", function(done) {
			clients[nonOwnerIdx].once("sessionOptions", function(data) {
				expect(data.customBoosters).to.eql(CustomBoosters);
				done();
			});
			clients[ownerIdx].emit("setCustomBoosters", CustomBoosters);
		});

		for (let distributionMode of ["regular", "shufflePlayerBoosters", "shuffleBoosterPool"]) {
			it(`Setting distributionMode to ${distributionMode}.`, function(done) {
				clients[nonOwnerIdx].once("sessionOptions", function(data) {
					expect(data.distributionMode).to.eql(distributionMode);
					done();
				});
				clients[ownerIdx].emit("setDistributionMode", distributionMode);
			});

			startDraft();
			if (distributionMode === "regular") {
				it("Boosters should be in specified order.", function(done) {
					for (let idx = 0; idx < Sessions[sessionID].boosters.length; ++idx)
						expect(
							Sessions[sessionID].boosters[idx].every(
								c => CustomBoosters[idx] === "" || c.set === CustomBoosters[idx]
							)
						);
					done();
				});
			}
			endDraft();
		}
		disconnect();
	});

	describe("Using Arena Cube", function() {
		connect();
		it("Clients should receive the updated useCustomCardList.", function(done) {
			clients[nonOwnerIdx].once("sessionOptions", function(val) {
				expect(val.useCustomCardList).to.equal(true);
				done();
			});
			clients[ownerIdx].emit("setUseCustomCardList", true);
		});
		it("Clients should receive the updated customCardList.", function(done) {
			clients[nonOwnerIdx].once("sessionOptions", function() {
				done();
			});
			clients[ownerIdx].emit("loadLocalCustomCardList", "Arena Historic Cube #1");
		});
		startDraft();
		endDraft();
		disconnect();
	});

	describe("Using cube with custom sheets", function() {
		connect();
		it("Clients should receive the updated useCustomCardList.", function(done) {
			clients[nonOwnerIdx].once("sessionOptions", function(val) {
				expect(val.useCustomCardList).to.equal(true);
				done();
			});
			clients[ownerIdx].emit("setUseCustomCardList", true);
		});
		it("Clients should receive the updated customCardList.", function(done) {
			clients[nonOwnerIdx].once("sessionOptions", function() {
				done();
			});
			clients[ownerIdx].emit("parseCustomCardList", CustomSheetsTestFile);
		});
		startDraft();
		endDraft();
		disconnect();
	});

	describe("Using an observer and bots.", function() {
		connect();
		it("Clients should receive the updated ownerIsPlayer.", function(done) {
			clients[nonOwnerIdx].once("sessionOptions", function(val) {
				expect(val.ownerIsPlayer).to.equal(false);
				done();
			});
			clients[ownerIdx].emit("setOwnerIsPlayer", false);
		});
		it("Clients should receive the updated bot count.", function(done) {
			clients[nonOwnerIdx].once("bots", function(bots) {
				expect(bots).to.equal(6);
				done();
			});
			clients[ownerIdx].emit("bots", 6);
		});

		it("When session owner launches draft, players should receive a startDraft event", function(done) {
			let connectedClients = 0;
			let receivedBoosters = 0;
			for (let c = 0; c < clients.length; ++c) {
				if (c === ownerIdx) continue; // Owner doesn't play in this mode

				clients[c].once("startDraft", function() {
					connectedClients += 1;
					if (connectedClients == clients.length - 1 && receivedBoosters == clients.length - 1) done();
				});

				const _idx = nonOwnerIdx;
				(() => {
					clients[c].once("nextBooster", function(data) {
						expect(boosters).not.include(data.booster);
						boosters[_idx] = data.booster;
						receivedBoosters += 1;
						if (connectedClients == clients.length - 1 && receivedBoosters == clients.length - 1) done();
					});
				})();
			}
			clients[ownerIdx].emit("startDraft");
		});

		it("Pick until the draft ends.", function(done) {
			let draftEnded = 0;
			for (let c = 0; c < clients.length; ++c) {
				if (c === ownerIdx) continue; // Owner doesn't play in this mode

				const idx = c;
				clients[c].on("nextBooster", function(data) {
					boosters[idx] = data.booster;
					this.emit(
						"pickCard",
						{ pickedCards: [Math.floor(Math.random() * boosters[idx].length)] },
						() => {}
					);
				});
				clients[c].once("endDraft", function() {
					draftEnded += 1;
					this.removeListener("nextBooster");
					if (draftEnded == clients.length - 1) {
						boosters = [];
						done();
					}
				});
			}
			for (let c = 0; c < clients.length; ++c) {
				if (c === ownerIdx) continue; // Owner doesn't play in this mode
				clients[c].emit(
					"pickCard",
					{ pickedCards: [Math.floor(Math.random() * boosters[c].length)] },
					() => {}
				);
			}
		});

		disconnect();
	});

	describe("Single Draft with Bots and burning", function() {
		const burnedCardsPerRound = 2;

		connect();
		it("Clients should receive the updated bot count.", function(done) {
			ownerIdx = clients.findIndex(c => c.query.userID == Sessions[sessionID].owner);
			nonOwnerIdx = 1 - ownerIdx;
			clients[nonOwnerIdx].once("bots", function(bots) {
				expect(bots).to.equal(6);
				done();
			});
			clients[ownerIdx].emit("bots", 6);
		});

		it("Clients should receive the updated burn count.", function(done) {
			clients[nonOwnerIdx].once("sessionOptions", function(sessionOptions) {
				expect(sessionOptions.burnedCardsPerRound).to.equal(burnedCardsPerRound);
				done();
			});
			clients[ownerIdx].emit("setBurnedCardsPerRound", burnedCardsPerRound);
		});

		it("When session owner launch draft, everyone should receive a startDraft event", function(done) {
			let connectedClients = 0;
			let receivedBoosters = 0;
			let index = 0;
			for (let c of clients) {
				c.once("startDraft", function() {
					connectedClients += 1;
					if (connectedClients == clients.length && receivedBoosters == clients.length) done();
				});

				(() => {
					const _idx = index;
					c.once("nextBooster", function(data) {
						expect(boosters).not.include(data);
						boosters[_idx] = data;
						receivedBoosters += 1;
						if (connectedClients == clients.length && receivedBoosters == clients.length) done();
					});
				})();
				++index;
			}
			clients[ownerIdx].emit("startDraft");
		});

		it("Pick enough times, and the draft should end.", function(done) {
			this.timeout(20000);
			let draftEnded = 0;
			for (let c = 0; c < clients.length; ++c) {
				clients[c].on("nextBooster", function(data) {
					let idx = c;
					boosters[idx] = data.booster;
					let burned = [];
					for (let cidx = 1; cidx < 1 + burnedCardsPerRound && cidx < data.booster.length; ++cidx)
						burned.push(cidx);
					this.emit("pickCard", { pickedCards: [0], burnedCards: burned }, () => {});
				});
				clients[c].once("endDraft", function() {
					draftEnded += 1;
					this.removeListener("nextBooster");
					if (draftEnded == clients.length) done();
				});
			}
			for (let c = 0; c < clients.length; ++c) {
				let burned = [];
				for (let cidx = 1; cidx < 1 + burnedCardsPerRound && cidx < boosters[c].booster.length; ++cidx)
					burned.push(cidx);
				clients[c].emit("pickCard", { pickedCards: [0], burnedCards: burned }, () => {});
			}
		});
		disconnect();
	});

	describe("Draft mixing multiple picks and burning", function() {
		connect();
		it("Clients should receive the updated bot count.", function(done) {
			ownerIdx = clients.findIndex(c => c.query.userID == Sessions[sessionID].owner);
			nonOwnerIdx = 1 - ownerIdx;
			clients[nonOwnerIdx].once("bots", function(bots) {
				expect(bots).to.equal(6);
				done();
			});
			clients[ownerIdx].emit("bots", 6);
		});

		for (let pickPerRound = 1; pickPerRound < 5; ++pickPerRound) {
			for (let burnPerRound = 0; burnPerRound < 5; ++burnPerRound) {
				it(`Clients should receive the updated pick count (${pickPerRound}).`, function(done) {
					clients[nonOwnerIdx].once("sessionOptions", function(sessionOptions) {
						expect(sessionOptions.pickedCardsPerRound).to.equal(pickPerRound);
						done();
					});
					clients[ownerIdx].emit("setPickedCardsPerRound", pickPerRound);
				});

				it(`Clients should receive the updated burn count (${burnPerRound}).`, function(done) {
					clients[nonOwnerIdx].once("sessionOptions", function(sessionOptions) {
						expect(sessionOptions.burnedCardsPerRound).to.equal(burnPerRound);
						done();
					});
					clients[ownerIdx].emit("setBurnedCardsPerRound", burnPerRound);
				});

				it("When session owner launch draft, everyone should receive a startDraft event", function(done) {
					let connectedClients = 0;
					let receivedBoosters = 0;
					let index = 0;
					for (let c of clients) {
						c.once("startDraft", function() {
							connectedClients += 1;
							if (connectedClients == clients.length && receivedBoosters == clients.length) done();
						});

						(() => {
							const _idx = index;
							c.once("nextBooster", function(data) {
								expect(boosters).not.include(data);
								boosters[_idx] = data;
								receivedBoosters += 1;
								if (connectedClients == clients.length && receivedBoosters == clients.length) done();
							});
						})();
						++index;
					}
					clients[ownerIdx].emit("startDraft");
				});

				it("Pick enough times, and the draft should end.", function(done) {
					this.timeout(20000);
					let draftEnded = 0;
					for (let c = 0; c < clients.length; ++c) {
						clients[c].on("nextBooster", function(data) {
							let idx = c;
							boosters[idx] = data.booster;
							let cidx = 0;
							let picked = [];
							while (cidx < pickPerRound && cidx < data.booster.length) picked.push(cidx++);
							let burned = [];
							while (burned.length < burnPerRound && cidx < data.booster.length) burned.push(cidx++);
							this.emit("pickCard", { pickedCards: picked, burnedCards: burned }, () => {});
						});
						clients[c].once("endDraft", function() {
							draftEnded += 1;
							this.removeListener("nextBooster");
							if (draftEnded == clients.length) done();
						});
					}
					for (let c = 0; c < clients.length; ++c) {
						let cidx = 0;
						let picked = [];
						while (cidx < pickPerRound && cidx < boosters[c].booster.length) picked.push(cidx++);
						let burned = [];
						while (burned.length < burnPerRound && cidx < boosters[c].booster.length) burned.push(cidx++);
						clients[c].emit("pickCard", { pickedCards: picked, burnedCards: burned }, () => {});
					}
				});
			}
		}
		disconnect();
	});

	describe("Pre-Determined Boosters", function() {
		connect();
		it("Receive error on invalid card list.", function(done) {
			clients[ownerIdx].emit("setBoosters", "Invalid Card!", r => {
				if (r.error) done();
			});
		});
		it("Receive error on invalid card list.", function(done) {
			clients[ownerIdx].emit("setBoosters", "Another\n\nInvalid Cards!\n", r => {
				if (r.error) done();
			});
		});

		it("Expect error on valid booster list but with wrong booster count.", function(done) {
			clients[ownerIdx].emit("setBoosters", "15 Forest\n\n15 Forest", r => {
				expect(r.code === 0);
				expect(!r.error);
				clients[ownerIdx].on("message", r => {
					if (r.icon === "error") {
						clients[ownerIdx].removeListener("message");
						expect(!Sessions[sessionID].drafting);
						done();
					}
				});
				clients[ownerIdx].emit("startDraft");
			});
		});

		it("Expect error on valid booster list but with inconsistent sizes.", function(done) {
			clients[ownerIdx].emit(
				"setBoosters",
				"15 Forest\n\n18 Forest\n\n18 Forest\n\n18 Forest\n\n18 Forest\n\n18 Forest",
				r => {
					expect(r.error);
					done();
				}
			);
		});

		it("Sumbit valid booster list", function(done) {
			clients[ownerIdx].emit(
				"setBoosters",
				"15 Forest\n\n15 Forest\n\n15 Forest\n\n15 Forest\n\n15 Forest\n\n15 Forest",
				r => {
					expect(r.code === 0);
					expect(!r.error);
					expect(Sessions[sessionID].usePredeterminedBoosters);
					done();
				}
			);
		});

		startDraft();
		endDraft();

		it("Turn off usePredeterminedBoosters", function(done) {
			expect(Sessions[sessionID].usePredeterminedBoosters);
			clients[ownerIdx].emit("setUsePredeterminedBoosters", false, r => {
				expect(r.code === 0);
				expect(!Sessions[sessionID].usePredeterminedBoosters);
				done();
			});
		});

		startDraft();
		endDraft();

		disconnect();
	});
});

describe("Multiple Drafts", function() {
	let clients = [];
	let sessionIDs = [];
	const sessionCount = 4;
	const playersPerSession = 8;
	let boosters = [];

	beforeEach(function(done) {
		disableLogs();
		done();
	});

	afterEach(function(done) {
		enableLogs(this.currentTest.state == "failed");
		done();
	});

	before(function(done) {
		disableLogs();
		expect(Object.keys(Connections).length).to.equal(0);
		for (let sess = 0; sess < sessionCount; ++sess) {
			sessionIDs[sess] = `Session ${sess}`;
			clients[sess] = [];
			for (let i = 0; i < playersPerSession; ++i) {
				clients[sess].push(
					connectClient({
						sessionID: sessionIDs[sess],
						userName: `Client ${sess * playersPerSession + i}`,
					})
				);
			}
		}

		// Wait for all clients to be connected
		let connectedClients = 0;
		for (let s of clients) {
			for (let c of s) {
				c.on("connect", function() {
					connectedClients += 1;
					if (connectedClients == playersPerSession * clients.length) {
						enableLogs(false);
						done();
					}
				});
			}
		}
	});

	after(function(done) {
		disableLogs();
		for (let s of clients)
			for (let c of s) {
				c.disconnect();
			}

		waitForClientDisconnects(done);
	});

	it(`${sessionCount} sessions should be live.`, function(done) {
		expect(Object.keys(Sessions).length).to.equal(sessionCount);
		done();
	});

	it(`${playersPerSession * sessionCount} players should be connected.`, function(done) {
		expect(Object.keys(Connections).length).to.equal(playersPerSession * sessionCount);
		done();
	});

	it("When session owner launch draft, everyone in session should receive a startDraft event, and a unique booster", function(done) {
		let sessionsCorrectlyStartedDrafting = 0;
		let boostersReceived = 0;
		for (let [sessionIdx, sessionClients] of clients.entries()) {
			boosters.push(null);
			(() => {
				let connectedClients = 0;
				for (let c of sessionClients) {
					c.on("startDraft", function() {
						connectedClients += 1;
						if (connectedClients == sessionClients.length) {
							for (let b of Sessions[sessionIDs[sessionIdx]].boosters) checkColorBalance(b);
							sessionsCorrectlyStartedDrafting += 1;
						}
					});

					c.once("nextBooster", function(data) {
						expect(boosters).not.include(data);
						boosters[playersPerSession * sessionIdx + sessionClients.findIndex(cl => cl == c)] = data;
						++boostersReceived;
						if (
							sessionsCorrectlyStartedDrafting == sessionCount &&
							boostersReceived == playersPerSession * sessionCount
						) {
							it("Boosters are color balanced and contain no duplicate.", function(done) {
								for (let b of Sessions[sessionIDs[sessionIdx]].boosters) {
									checkColorBalance(b);
									checkDuplicates(b);
								}
								done();
							});
							done();
						}
					});
				}
				let ownerIdx = sessionClients.findIndex(c => c.query.userID == Sessions[sessionIDs[sessionIdx]].owner);
				sessionClients[ownerIdx].emit("setColorBalance", true);
				sessionClients[ownerIdx].emit("startDraft");
			})();
		}
	});

	it("New players should not be able to join once drafting has started", function(done) {
		let newClient = connectClient({
			sessionID: sessionIDs[0],
			userName: `New Client`,
		});

		newClient.on("setSession", function(newSessionID) {
			expect(newSessionID).to.not.equal(sessionIDs[0]);
			expect(Sessions[sessionIDs[0]].users.size).to.equal(playersPerSession);
			newClient.disconnect();
			waitForSocket(newClient, done);
		});
	});

	it("Once everyone in a session has picked a card, receive next boosters.", function(done) {
		let receivedBoosters = 0;
		expect(boosters.length).to.equal(playersPerSession * sessionCount);
		for (let sess = 0; sess < clients.length; ++sess) {
			for (let c = 0; c < clients[sess].length; ++c) {
				clients[sess][c].once(
					"nextBooster",
					(function() {
						let idx = playersPerSession * sess + c;
						return function(data) {
							receivedBoosters += 1;
							expect(data.booster.length).to.equal(boosters[idx].booster.length - 1);
							boosters[idx] = data;
							if (receivedBoosters == playersPerSession * sessionCount) done();
						};
					})()
				);
				clients[sess][c].emit("pickCard", { pickedCards: [0] }, () => {});
			}
		}
	});

	it("Do it enough times, and all the drafts should end.", function(done) {
		this.timeout(20000);
		let draftEnded = 0;
		for (let sess = 0; sess < clients.length; ++sess) {
			for (let c = 0; c < clients[sess].length; ++c) {
				clients[sess][c].on("nextBooster", function(data) {
					let idx = playersPerSession * sess + c;
					boosters[idx] = data.booster;
					this.emit("pickCard", { pickedCards: [0] }, () => {});
				});
				clients[sess][c].once("endDraft", function() {
					draftEnded += 1;
					this.removeListener("nextBooster");
					if (draftEnded == playersPerSession * sessionCount) done();
				});
			}
		}
		for (let sess = 0; sess < clients.length; ++sess) {
			for (let c = 0; c < clients[sess].length; ++c) {
				clients[sess][c].emit("pickCard", { pickedCards: [0] }, () => {});
			}
		}
	});
});

describe("Sealed", function() {
	let clients = [];
	let sessionID = "sessionID";
	const random = new randomjs.Random(randomjs.nodeCrypto);
	const boosterCount = random.integer(1, 10);

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

	it(`Owner launch a sealed (${boosterCount} boosters), clients should receive their card selection.`, function(done) {
		const ownerIdx = clients.findIndex(c => c.query.userID == Sessions[sessionID].owner);
		let receivedPools = 0;
		for (let client of clients)
			client.once("setCardSelection", boosters => {
				expect(boosters.length).to.equal(boosterCount);
				++receivedPools;
				if (receivedPools === clients.length) done();
			});
		clients[ownerIdx].emit("distributeSealed", boosterCount);
	});

	const CustomBoosters = ["m19", "m20", "m21"];

	it(`Clients should receive the updated booster spec. (${CustomBoosters})`, function(done) {
		const ownerIdx = clients.findIndex(c => c.query.userID == Sessions[sessionID].owner);
		clients[(ownerIdx + 1) % 2].once("sessionOptions", function(data) {
			expect(data.customBoosters).to.eql(CustomBoosters);
			done();
		});
		clients[ownerIdx].emit("setCustomBoosters", CustomBoosters);
	});

	it(`Clients should receive a card pool with the correct boosters.`, function(done) {
		const ownerIdx = clients.findIndex(c => c.query.userID == Sessions[sessionID].owner);
		let receivedPools = 0;
		for (let client of clients)
			client.once("setCardSelection", boosters => {
				expect(boosters.length).to.equal(boosterCount);
				for (let idx = 0; idx < boosters.length; ++idx)
					expect(boosters[idx].every(c => c.set === CustomBoosters[idx]));
				++receivedPools;
				if (receivedPools === clients.length) done();
			});
		clients[ownerIdx].emit("distributeSealed", boosterCount);
	});
});

import JumpstartBoosters from "../data/JumpstartBoosters.json";

describe("Jumpstart", function() {
	let clients = [];
	let sessionID = "JumpStartSession";

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

	it("Each booster contains 20 valid cards", function(done) {
		for (let b of JumpstartBoosters) {
			expect(b.cards.length).to.equals(20);
			for (let c of b.cards) {
				expect(Cards).to.have.deep.property(c);
			}
		}
		done();
	});

	it(`Owner launches a Jumpstart game, clients should receive their card selection (2*20 cards).`, function(done) {
		const ownerIdx = clients.findIndex(c => c.query.userID == Sessions[sessionID].owner);
		let receivedPools = 0;
		for (let client of clients) {
			client.once("setCardSelection", function(boosters) {
				expect(boosters.length).to.equal(2);
				for (let b of boosters) expect(b.length).to.equal(20);
				++receivedPools;
				if (receivedPools === clients.length) done();
			});
		}
		clients[ownerIdx].emit("distributeJumpstart");
	});
});

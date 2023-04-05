import { before, after, beforeEach, afterEach, describe, it } from "mocha";
import chai from "chai";
const expect = chai.expect;
import { Sessions } from "../src/Session.js";
import { makeClients, waitForClientDisconnects, enableLogs, disableLogs, ackNoError } from "./src/common.js";
import { CardColor, UniqueCard } from "../src/CardTypes.js";
import { SetCode } from "../src/Types.js";

describe("Set Specific Booster Rules", function () {
	let clients: ReturnType<typeof makeClients> = [];
	let pickNumber: { [id: string]: number } = {};
	let sessionID = "SessionID";

	const validateColorBalance = (booster: UniqueCard[]) => {
		const colors = "WUBRG";
		const commons = booster.filter((card) => card.rarity == "common");
		for (let color of colors) {
			let count = commons.filter((card) => card.colors.includes(color as CardColor)).length;
			expect(count).to.be.at.least(1);
		}
	};

	const validateDOMBooster = function (booster: UniqueCard[]) {
		const regex = /Legendary.*Creature/;
		expect(booster.map((c) => c.set).every((s) => s === "dom")).to.be.true;
		let LCCount = booster.reduce((acc, val) => {
			return acc + (val.type.match(regex) ? 1 : 0);
		}, 0);
		expect(LCCount).to.gte(1);
	};

	const validateWARBooster = function (booster: UniqueCard[]) {
		expect(
			booster.map((c) => c.set).every((s) => s === "war"),
			"All cards should be from the set 'war'"
		).to.be.true;
		let PLCount = booster.reduce((acc, val) => {
			return acc + (val.type.includes("Planeswalker") && !val.foil ? 1 : 0);
		}, 0);
		expect(
			PLCount,
			`A WAR pack should contain exactly one Planeswalker, got: ${booster
				.map((c) => {
					return `${c.name} - ${c.type}`;
				})
				.join(", ")}`
		).to.equal(1);
	};

	const validateZNRBooster = function (booster: UniqueCard[]) {
		expect(booster.map((c) => c.set).every((s) => s === "znr")).to.be.true;
		const PLCount = booster.reduce((acc, val) => {
			return acc + (val.name.includes("//") ? 1 : 0);
		}, 0);
		expect(PLCount).to.equal(1);
	};

	const validateSTXBooster = function (booster: UniqueCard[]) {
		expect(booster.map((c) => c.set).every((s) => s === "stx" || s === "sta")).to.be.true;
		const ArchiveCount = booster.reduce((acc, val) => {
			return acc + (val.set === "sta" ? 1 : 0);
		}, 0);
		expect(ArchiveCount).to.equal(1);
		const LessonCount = booster.reduce((acc, val) => {
			return acc + (val.subtypes.includes("Lesson") && val.rarity !== "uncommon" && !val.foil ? 1 : 0);
		}, 0);
		expect(LessonCount).to.equal(1);
	};

	const validateMH2Booster = function (booster: UniqueCard[]) {
		expect(booster.map((c) => c.set).every((s) => s === "mh2")).to.be.true;
		const newToModernCount = booster.reduce((acc, val) => {
			return acc + (parseInt(val.collector_number)! >= 261 && parseInt(val.collector_number)! <= 303 ? 1 : 0);
		}, 0);
		expect(newToModernCount).to.equal(1);
	};

	const validateMIDBooster = function (booster: UniqueCard[]) {
		expect(booster.map((c) => c.set).every((s) => s === "mid")).to.be.true;
		const CommonDFC = booster.reduce((acc, val) => {
			return acc + (val.rarity === "common" && val.name.includes("//") ? 1 : 0);
		}, 0);
		expect(CommonDFC).to.equal(1);
		const UncommonDFC = booster.reduce((acc, val) => {
			return (
				acc +
				((val.rarity === "uncommon" || val.rarity === "rare" || val.rarity === "mythic") &&
				val.name.includes("//")
					? 1
					: 0)
			);
		}, 0);
		expect(UncommonDFC).to.equal(1);
	};

	const validateVOWBooster = function (booster: UniqueCard[]) {
		expect(booster.map((c) => c.set).every((s) => s === "vow")).to.be.true;
		const CommonDFC = booster.reduce((acc, val) => {
			return acc + (val.rarity === "common" && val.name.includes("//") ? 1 : 0);
		}, 0);
		expect(CommonDFC).to.equal(1);
		const UncommonDFC = booster.reduce((acc, val) => {
			return (
				acc +
				((val.rarity === "uncommon" || val.rarity === "rare" || val.rarity === "mythic") &&
				val.name.includes("//")
					? 1
					: 0)
			);
		}, 0);
		expect(UncommonDFC).to.equal(1);
	};

	const validateCLBBooster = function (booster: UniqueCard[]) {
		expect(booster.map((c) => c.set).every((s) => s === "clb")).to.be.true;
		const RareLegend = booster.reduce((acc, val) => {
			return (
				acc +
				(!val.foil &&
				(val.rarity === "rare" || val.rarity === "mythic") &&
				val.type.includes("Legendary") &&
				(val.type.includes("Creature") ||
					(val.type.includes("Planeswalker") &&
						!["Vivien, Champion of the Wilds", "Xenagos, the Reveler", "Faceless One"].includes(val.name)))
					? 1
					: 0)
			);
		}, 0);
		const UncommonLegend = booster.reduce((acc, val) => {
			return (
				acc +
				(!val.foil &&
				val.rarity === "uncommon" &&
				val.type.includes("Legendary") &&
				val.type.includes("Creature")
					? 1
					: 0)
			);
		}, 0);
		expect(UncommonLegend, "0, 1 or 2 uncommon legendary creature(s).").to.be.oneOf([0, 1, 2]);
		expect(RareLegend, "0 or 1 rare or mythic legendary creature or planeswalker.").to.be.oneOf([0, 1]);
		expect(UncommonLegend + RareLegend, "1 or 2 legendaries of any rarity (other than the background)").to.be.oneOf(
			[1, 2]
		);
		const LegendBG = booster.reduce((acc, val) => {
			return (
				acc + (val.type === "Legendary Enchantment" && val.subtypes.includes("Background") && !val.foil ? 1 : 0)
			);
		}, 0);
		expect(LegendBG).to.equal(1);
		const Foil = booster.reduce((acc, val) => {
			return acc + (val.foil ? 1 : 0);
		}, 0);
		expect(Foil).to.equal(1);
	};

	const validate2X2Booster = function (booster: UniqueCard[]) {
		expect(booster.map((c) => c.set).every((s) => s === "2x2")).to.be.true;
		const foils = booster.reduce((acc, val) => {
			return acc + (val.foil ? 1 : 0);
		}, 0);
		expect(foils).to.equal(2);
		const crypticSpires = booster.reduce((acc, val) => {
			return acc + (val.name === "Cryptic Spires" ? 1 : 0);
		}, 0);
		expect(crypticSpires).to.equal(1);
	};

	const validateDMRBooster = function (booster: UniqueCard[]) {
		expect(booster.map((c) => c.set).every((s) => s === "dmr")).to.be.true;
		const retro = booster.reduce((acc, val) => {
			return acc + (parseInt(val.collector_number) >= 262 && parseInt(val.collector_number) <= 401 ? 1 : 0);
		}, 0);
		expect(retro).to.equal(1);
	};

	const validateSIRBooster = function (booster: UniqueCard[]) {
		expect(booster.map((c) => c.set).every((s) => s === "sir" || s === "sis")).to.be.true;
		const sis = booster.reduce((acc, val) => {
			return acc + (val.set === "sis" ? 1 : 0);
		}, 0);
		expect(sis, "Exactly one 'Shadow of the Past' card").to.equal(1);
	};

	const validateMOMBooster = function (booster: UniqueCard[]) {
		expect(booster.map((c) => c.set).every((s) => s === "mom" || s === "mul")).to.be.true;
		const mul = booster.reduce((acc, val) => {
			return acc + (val.set === "mul" ? 1 : 0);
		}, 0);
		expect(mul, "Exactly one 'Multiverse Legend' card").to.equal(1);
		expect(
			booster.reduce((acc, val) => {
				return acc + (val.type.includes("Battle") ? 1 : 0);
			}, 0),
			"Exactly one 'Battle' card"
		).to.equal(1);
		expect(
			booster.reduce((acc, val) => {
				return acc + (!!val.back && !val.type.includes("Battle") ? 1 : 0);
			}, 0),
			"Exactly one non-Battle transform card"
		).to.equal(1);
	};

	beforeEach(function (done) {
		disableLogs();
		done();
	});

	afterEach(function (done) {
		enableLogs(this.currentTest!.state == "failed");
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

	const collectBoosters = () => {
		return new Promise<UniqueCard[][]>((resolve) => {
			let endDraftReceived = 0;
			const boosters: UniqueCard[][] = [];
			for (const client of clients) {
				pickNumber[client.id] = -1;
				client.on("draftState", (data) => {
					const state = data as {
						booster: UniqueCard[];
						boosterCount: number;
						boosterNumber: number;
						pickNumber: number;
					};
					if (state.boosterCount > 0 && state.pickNumber != pickNumber[client.id]) {
						if (state.pickNumber === 0) boosters.push(state.booster);
						pickNumber[client.id] = state.pickNumber;
						client.emit("pickCard", { pickedCards: [0], burnedCards: [] }, ackNoError);
					}
				});
				client.once("endDraft", () => {
					++endDraftReceived;
					if (endDraftReceived === clients.length) {
						for (const c of clients) c.removeListener("draftState");
						resolve(boosters);
					}
				});
			}
		});
	};

	const testSet = function (set: SetCode, validationFunc: (booster: UniqueCard[]) => void, desc: string) {
		it(`${set} boosters should have ${desc} (Single set restriction).`, async () => {
			let ownerIdx = clients.findIndex((c) => (c as any).query.userID == Sessions[sessionID].owner);
			clients[ownerIdx].emit("ignoreCollections", true);
			clients[ownerIdx].emit("setRestriction", [set]);
			clients[ownerIdx].emit("setCustomBoosters", ["", "", ""]);
			clients[ownerIdx].emit("startDraft", ackNoError);
			const boosters = await collectBoosters();
			for (let b of boosters) validationFunc(b);
		});

		it(`${set} boosters should have ${desc} (Custom boosters).`, async () => {
			let ownerIdx = clients.findIndex((c) => (c as any).query.userID == Sessions[sessionID].owner);
			clients[ownerIdx].emit("ignoreCollections", true);
			clients[ownerIdx].emit("setRestriction", []);
			clients[ownerIdx].emit("setCustomBoosters", [set, set, set]);
			clients[ownerIdx].emit("startDraft", ackNoError);
			const boosters = await collectBoosters();
			for (let b of boosters) validationFunc(b);
		});
	};

	testSet("dom", validateDOMBooster, "at least one legendary creature per pack");
	testSet("war", validateWARBooster, "exactly one planeswalker per pack");
	testSet("znr", validateZNRBooster, "exactly one MDFC per pack");
	testSet("stx", validateSTXBooster, "exactly one STA and one common or rare lesson per pack");
	testSet("mh2", validateMH2Booster, "exactly one New-to-Modern card per pack");
	testSet("mid", validateMIDBooster, "exactly one common DFC and at most one uncommon DFC per pack");
	testSet("vow", validateVOWBooster, "exactly one common DFC and at most one uncommon DFC per pack");
	testSet("clb", validateCLBBooster, "one legendary creature or planeswalker, one legendary background");
	testSet("2x2", validate2X2Booster, "two foils and one Cryptic Spires");
	testSet("dmr", validateDMRBooster, "one retro frame card");
	testSet("vow", validateColorBalance, "at least one common of each color.");
	testSet("sir", validateSIRBooster, "exactly one 'sis' (Shadow of the Past) card.");
	testSet("mom", validateMOMBooster, "the correct MOM collation.");

	it(`VOW boosters should have at least one common of each color, even with foil on.`, async function () {
		let ownerIdx = clients.findIndex((c) => (c as any).query.userID == Sessions[sessionID].owner);
		clients[ownerIdx].emit("ignoreCollections", true);
		clients[ownerIdx].emit("setRestriction", ["vow"]);
		clients[ownerIdx].emit("setFoil", true);
		clients[ownerIdx].emit("setCustomBoosters", ["", "", ""]);
		clients[ownerIdx].emit("startDraft", ackNoError);
		const boosters = await collectBoosters();
		for (let b of boosters) validateColorBalance(b);
	});

	it(`Validate mixed Custom boosters.`, async () => {
		let ownerIdx = clients.findIndex((c) => (c as any).query.userID == Sessions[sessionID].owner);
		clients[ownerIdx].emit("ignoreCollections", true);
		clients[ownerIdx].emit("setRestriction", []);
		clients[ownerIdx].emit("setCustomBoosters", ["dom", "war", "dom"]);
		clients[ownerIdx].emit("startDraft", ackNoError);
		const boosters = await collectBoosters();
		for (let idx = 0; idx < boosters.length; ++idx)
			if (Math.floor(idx / clients.length) === 1) validateWARBooster(boosters[idx]);
			else validateDOMBooster(boosters[idx]);
	});

	it(`Validate mixed Custom boosters with regular set restriction.`, async () => {
		let ownerIdx = clients.findIndex((c) => (c as any).query.userID == Sessions[sessionID].owner);
		clients[ownerIdx].emit("ignoreCollections", true);
		clients[ownerIdx].emit("setRestriction", ["dom"]);
		clients[ownerIdx].emit("setCustomBoosters", ["", "war", "dom"]);
		clients[ownerIdx].emit("startDraft", ackNoError);
		const boosters = await collectBoosters();
		for (let idx = 0; idx < boosters.length; ++idx)
			if (Math.floor(idx / clients.length) === 1) validateWARBooster(boosters[idx]);
			else validateDOMBooster(boosters[idx]);
	});
});

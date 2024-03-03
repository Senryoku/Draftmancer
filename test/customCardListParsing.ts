import { expect } from "chai";
import fs from "fs";

import { parseCardList } from "../src/parseCardList.js";

import { ValidCubes, InvalidCubes } from "./src/common.js";
import { SocketError, isMessageError, isSocketError } from "../src/Message.js";
import { Session } from "../src/Session.js";

describe("Custom Card List Parsing", function () {
	for (const [name, cube] of Object.entries(ValidCubes)) {
		it(`should parse ${name}`, function () {
			const r = parseCardList(cube, {});
			expect(isSocketError(r), `Got ${JSON.stringify((r as SocketError).error)}`).to.be.false;
		});
	}

	for (const [name, cube] of Object.entries(InvalidCubes)) {
		it(`should not parse ${name}`, function () {
			const r = parseCardList(cube, {});
			if (isSocketError(r))
				console.error(`\tGot Error: ${r.error?.title} - ${r.error?.text}${r.error?.html?.split("\n")[0]}`);
			expect(isSocketError(r)).to.be.true;
		});
	}

	it(`should respect the 'predeterminedLayouts' setting.`, () => {
		const session = new Session("sessionid", "clientid");
		const list = parseCardList(fs.readFileSync(`./test/data/PredeterminedLayouts.txt`, "utf8"), {});
		if (isSocketError(list)) {
			expect(isSocketError(list), `Got ${JSON.stringify((list as SocketError).error)}`).to.be.false;
			return;
		}
		session.setCustomCardList(list);
		const boosters = session.generateBoosters(3 * 8, { playerCount: 8 });
		if (isMessageError(boosters)) {
			expect(isMessageError(boosters), `Got ${JSON.stringify(boosters)}`).to.be.false;
			return;
		}
		for (let i = 0; i < boosters.length; i++) {
			expect(boosters[i][0].name).to.be.equal(
				["Adventure Awaits", "Akoum Hellhound", "Angelheart Protector"][Math.floor(i / 8) % 3]
			);
			// Checking that slots did not leak out if showSlots not explicitly set to true.
			expect(boosters[i][0].slot).to.be.undefined;
		}
	});

	it(`should respect the 'predeterminedLayouts' & 'showSlots' setting.`, () => {
		const session = new Session("sessionid", "clientid");
		const list = parseCardList(fs.readFileSync(`./test/data/PredeterminedLayouts_ShowSlots.txt`, "utf8"), {});
		if (isSocketError(list)) {
			expect(isSocketError(list), `Got ${JSON.stringify((list as SocketError).error)}`).to.be.false;
			return;
		}
		session.setCustomCardList(list);
		const boosters = session.generateBoosters(3 * 8, { playerCount: 8 });
		if (isMessageError(boosters)) {
			expect(isMessageError(boosters), `Got ${JSON.stringify(boosters)}`).to.be.false;
			return;
		}
		for (let i = 0; i < boosters.length; i++) {
			expect(boosters[i][0].name).to.be.equal(
				["Adventure Awaits", "Akoum Hellhound", "Angelheart Protector"][Math.floor(i / 8) % 3]
			);
			expect(boosters[i][0].slot).to.be.equal(["SheetA", "SheetB", "SheetC"][Math.floor(i / 8) % 3]);
		}
	});

	it(`should respect the 'showSlots' setting, using Pillar of the Paruns Master cube.`, () => {
		const session = new Session("sessionid", "clientid");
		const list = parseCardList(fs.readFileSync(`./test/data/PotPMaster_0.3.txt`, "utf8"), {});
		if (isSocketError(list)) {
			expect(isSocketError(list), `Got ${JSON.stringify((list as SocketError).error)}`).to.be.false;
			return;
		}
		session.setCustomCardList(list);
		const boosters = session.generateBoosters(3 * 8, { playerCount: 8 });
		if (isMessageError(boosters)) {
			expect(isMessageError(boosters), `Got ${JSON.stringify(boosters)}`).to.be.false;
			return;
		}
		for (let i = 0; i < boosters.length; i++) expect(boosters[i][0].slot).not.to.be.undefined;
	});

	it(`should respect the 'predeterminedLayouts' setting using arrays.`, () => {
		const session = new Session("sessionid", "clientid");
		const list = parseCardList(fs.readFileSync(`./test/data/PredeterminedLayouts_Arrays.txt`, "utf8"), {});
		if (isSocketError(list)) {
			expect(isSocketError(list), `Got ${JSON.stringify((list as SocketError).error)}`).to.be.false;
			return;
		}
		session.setCustomCardList(list);
		const boosters = session.generateBoosters(3 * 8, { playerCount: 8 });
		if (isMessageError(boosters)) {
			expect(isMessageError(boosters), `Got ${JSON.stringify(boosters)}`).to.be.false;
			return;
		}
		for (let i = 0; i < boosters.length; i++) {
			expect(
				[
					["Adventure Awaits", "Stomping Ground"],
					["Akoum Hellhound", "Sulfur Falls"],
					["Angelheart Protector", "Sulfurous Springs"],
				][Math.floor(i / 8) % 3]
			).to.include(boosters[i][0].name);
		}
	});

	it(`should respect the 'predeterminedLayouts' setting using objects.`, () => {
		const session = new Session("sessionid", "clientid");
		const list = parseCardList(fs.readFileSync(`./test/data/PredeterminedLayouts_Objects.txt`, "utf8"), {});
		if (isSocketError(list)) {
			expect(isSocketError(list), `Got ${JSON.stringify((list as SocketError).error)}`).to.be.false;
			return;
		}
		session.setCustomCardList(list);
		const boosters = session.generateBoosters(3 * 8, { playerCount: 8 });
		if (isMessageError(boosters)) {
			expect(isMessageError(boosters), `Got ${JSON.stringify(boosters)}`).to.be.false;
			return;
		}
		for (let i = 0; i < boosters.length; i++) {
			expect(
				[
					["Adventure Awaits", "Stomping Ground"],
					["Akoum Hellhound", "Sulfur Falls"],
					["Angelheart Protector", "Sulfurous Springs"],
				][Math.floor(i / 8) % 3]
			).to.include(boosters[i][0].name);
		}
	});

	it(`should respect the 'predeterminedLayouts' setting using objects, without replacement.`, () => {
		const session = new Session("sessionid", "clientid");
		const list = parseCardList(
			fs.readFileSync(`./test/data/PredeterminedLayouts_Objects_WithoutReplacement.txt`, "utf8"),
			{}
		);
		if (isSocketError(list)) {
			expect(isSocketError(list), `Got ${JSON.stringify((list as SocketError).error)}`).to.be.false;
			return;
		}
		session.setCustomCardList(list);
		const boosters = session.generateBoosters(3 * 8, { playerCount: 8 });
		if (isMessageError(boosters)) {
			expect(isMessageError(boosters), `Got ${JSON.stringify(boosters)}`).to.be.false;
			return;
		}
		const cardCounts: Record<string, number> = {};
		for (const b of boosters) for (const c of b) cardCounts[c.name] = (cardCounts[c.name] ?? 0) + 1;
		for (const cardName of [
			"Adventure Awaits",
			"Stomping Ground",
			"Akoum Hellhound",
			"Sulfur Falls",
			"Angelheart Protector",
			"Sulfurous Springs",
		])
			expect(cardCounts[cardName]).to.equal(4);
	});

	describe("layoutWithoutReplacement.txt", () => {
		const session = new Session("sessionid", "clientid");
		it(`should parse without error.`, () => {
			const list = parseCardList(fs.readFileSync(`./test/data/LayoutWithoutReplacement.txt`, "utf8"), {});
			if (isSocketError(list)) {
				expect(isSocketError(list), `Got ${JSON.stringify((list as SocketError).error)}`).to.be.false;
				return;
			}
			session.setCustomCardList(list);
		});
		it(`should respect the 'withReplacement': true setting and be able to generate boosters.`, () => {
			const boosters = session.generateBoosters(3 * 8, { playerCount: 8 });
			expect(isMessageError(boosters), `Got ${JSON.stringify(boosters)}`).to.be.false;
		});
		it(`should respect the 'layoutWithReplacement': false setting.`, () => {
			const boosters = session.generateBoosters(3 * 8, { playerCount: 8 });
			if (isMessageError(boosters)) return;
			const firstLayouts = new Set(boosters.slice(0, 8).map((b) => b[0].name));
			expect(firstLayouts.size, "Player should not all get the same layout at the size time.").to.be.greaterThan(
				1
			);
			const counts: Record<string, number> = {};
			for (const name of boosters.map((b) => b[0].name)) counts[name] = counts[name] ? counts[name] + 1 : 1;
			expect(Object.values(counts)[0]).to.equal(8);
			for (const cardname in counts)
				expect(counts[cardname], "All layouts should appear exactly 8 times.").to.be.equal(
					Object.values(counts)[0]
				);
		});
	});

	describe("Custom Cards Multiple Printings", () => {
		it(`should parse without error.`, () => {
			const list = parseCardList(fs.readFileSync(`./test/data/CustomCards_MultiplePrintings.txt`, "utf8"), {});
			if (isSocketError(list)) {
				expect(isSocketError(list), `Got ${JSON.stringify((list as SocketError).error)}`).to.be.false;
				return;
			}
		});
	});

	describe("Custom Cards - Relative cards specified in any order", () => {
		it(`should parse without error.`, () => {
			const list = parseCardList(
				fs.readFileSync(`./test/data/CustomCards_RelatedCards_AnyOrder.txt`, "utf8"),
				{}
			);
			if (isSocketError(list)) {
				expect(isSocketError(list), `Got ${JSON.stringify((list as SocketError).error)}`).to.be.false;
				return;
			}
		});
	});

	describe("Trailing commas in settings and custom cards.", () => {
		it(`should parse without error.`, () => {
			const list = parseCardList(fs.readFileSync(`./test/data/TrailingCommas.txt`, "utf8"), {});
			if (isSocketError(list)) {
				expect(isSocketError(list), `Got ${JSON.stringify((list as SocketError).error)}`).to.be.false;
				return;
			}
		});
	});

	it(`should apply the provided default session settings.`, () => {
		const session = new Session("sessionid", "clientid");
		const list = parseCardList(fs.readFileSync(`./test/data/SessionSettingsDefaults.txt`, "utf8"), {});
		if (isSocketError(list)) {
			expect(isSocketError(list), `Got ${JSON.stringify((list as SocketError).error)}`).to.be.false;
			return;
		}
		session.setCustomCardList(list);
		expect(session.customCardListWithReplacement).to.be.true;
		expect(session.boostersPerPlayer).to.be.equal(42);
		expect(session.colorBalance).to.be.false;
	});
});

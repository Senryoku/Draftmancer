import chai from "chai";
const expect = chai.expect;
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
		}
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
			for (let name of boosters.map((b) => b[0].name)) counts[name] = counts[name] ? counts[name] + 1 : 1;
			expect(Object.values(counts)[0]).to.equal(8);
			for (const cardname in counts)
				expect(counts[cardname], "All layouts should appear exactly 8 times.").to.be.equal(
					Object.values(counts)[0]
				);
		});
	});
});

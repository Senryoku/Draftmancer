import chai from "chai";
const expect = chai.expect;

import { parseCardList } from "../src/parseCardList.js";

import { ValidCubes, InvalidCubes } from "./src/common.js";
import { SocketError, isSocketError } from "../src/Message.js";

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
});

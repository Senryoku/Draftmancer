import { expect } from "chai";
import { setupBrowsers, pages, replaceInput, waitAndClickSelector } from "./src/common.js";
import { Sessions } from "../../src/Session.js";
import { Connections } from "../../src/Connection.js";
import { simulateMTGOResult } from "../src/MTGOResult.js";

function waitFor(ms: number) {
	return new Promise((resolve) => setTimeout(resolve, ms));
}

async function checkResult(matchID: number, index: number, result: number) {
	for (const page of pages) {
		const input = await page.waitForSelector(`#result-input-${matchID}-${index}`);
		expect(input).to.exist;
		const value = await input!.evaluate((el: Element) => parseInt((el as HTMLInputElement).value));
		expect(value).to.equal(result);
	}
}

describe("Front End - MTGO Bracket", function () {
	this.timeout(200000);
	setupBrowsers(4);
	it(`Setup player names`, async function () {
		const promises = [];
		for (let i = 0; i < pages.length; i++)
			promises.push(replaceInput(`Player_${i}`)(await pages[i].$("#user-name")));
		await Promise.all(promises);
		// Wait for propagation
		await Promise.all(
			pages.map((p) =>
				Promise.all(
					[...Array(pages.length).keys()].map((i) =>
						p.waitForSelector(`xpath/.//div[contains(., 'Player_${i}')]`)
					)
				)
			)
		);
	});

	it(`Fix player order`, async function () {
		expect(Object.keys(Sessions).length).to.equal(1);
		const sessionID = Object.keys(Sessions)[0];
		const UserIDs = [...Sessions[sessionID].users].sort((a, b) =>
			Connections[a].userName < Connections[b].userName ? -1 : 1
		);
		Sessions[sessionID].setSeating(UserIDs);
		await waitFor(200);
	});

	it(`Generate Bracket`, async function () {
		waitAndClickSelector(pages[0], "#bracket-button");
		await pages[0].waitForSelector("xpath/.//h2[contains(., 'Bracket')]");
	});

	it(`Open Bracket`, async function () {
		const promises = [];
		for (let i = 1; i < pages.length; i++) promises.push(waitAndClickSelector(pages[i], "#bracket-button"));
		await Promise.all(promises);
		await Promise.all(pages.map((p) => p.waitForSelector("xpath/.//h2[contains(., 'Bracket')]")));
	});

	it(`Activate MTGO sync.`, async function () {
		await waitAndClickSelector(pages[0], "#mtgo-sync");
		await waitFor(200);
	});

	it(`Simulate receiving a match result from MTGO.`, async function () {
		simulateMTGOResult(["Player_0", "Player_2"], [2, 0]);

		await waitFor(200);

		checkResult(4, 0, 2);
		checkResult(4, 1, 0);
	});

	it(`Simulate receiving a match result from MTGO.`, async function () {
		simulateMTGOResult(["Player_3", "Player_1"], [2, 1]);

		await waitFor(200);

		checkResult(5, 0, 1);
		checkResult(5, 1, 2);
	});

	it(`Simulate receiving a match result from MTGO.`, async function () {
		simulateMTGOResult(["Player_0", "Player_3"], [2, 1]);

		await waitFor(200);

		checkResult(6, 0, 1);
		checkResult(6, 1, 2);
	});
});

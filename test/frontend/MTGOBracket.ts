import { ElementHandle } from "puppeteer";
import { expect } from "chai";
import { setupBrowsers, pages, replaceInput, waitAndClickSelector } from "./src/common.js";

describe.only("Front End - MTGO Bracket", function () {
	this.timeout(200000);
	setupBrowsers(4);
	it(`Setup player names`, async function () {
		const promises = [];
		for (let i = 0; i < pages.length; i++)
			promises.push(replaceInput(`Player_${i}`)(await pages[i].$("#user-name")));
		await Promise.all(promises);
		// Wait for propagation
		await Promise.all(pages.map((p) => p.waitForXPath("//div[contains(., 'Player_3')]")));
	});

	it(`Generate Bracket`, async function () {
		waitAndClickSelector(pages[0], "#bracket-button");
		await pages[0].waitForXPath("//h2[contains(., 'Bracket')]");
	});

	it(`Open Bracket`, async function () {
		const promises = [];
		for (let i = 1; i < pages.length; i++) promises.push(waitAndClickSelector(pages[i], "#bracket-button"));
		await Promise.all(promises);
		await Promise.all(pages.map((p) => p.waitForXPath("//h2[contains(., 'Bracket')]")));
	});
});

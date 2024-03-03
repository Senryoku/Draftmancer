import { describe, it } from "mocha";
import { expect } from "chai";
import { dismissToast, launchMode, pages, PickResult, setupBrowsers, waitAndClickXpath } from "./src/common.js";
import { Page } from "puppeteer";

async function pickMinesweeper(page: Page): Promise<PickResult> {
	const done = await page.$$("xpath///h2[contains(., 'Done drafting!')]");
	if (done.length > 0) return PickResult.Done;
	const waiting = await page.$$("xpath///div[contains(., 'Waiting for')]");
	if (waiting.length > 0) return PickResult.Waiting;
	const cards = await page.$$(".minesweeper-grid .card:not(.picked)");
	if (cards.length === 0) return PickResult.Waiting;

	const card = cards[Math.floor(Math.random() * cards.length)];
	expect(card).to.exist;
	try {
		await card.click();
	} catch (e) {
		// FIXME: IDK why this randomly fails.
		return PickResult.Waiting;
	}
	return PickResult.Picked;
}

describe("Minesweeper Draft", function () {
	this.timeout(5000);
	setupBrowsers(2);

	it(`Select Cube`, async function () {
		await waitAndClickXpath(pages[0], "//button[contains(., 'Settings')]");
		await waitAndClickXpath(pages[0], "//button[contains(., 'Load Cube')]");
		await dismissToast(pages[0]);
		await pages[0].keyboard.press("Escape"); // Close settings modal
		await pages[0].waitForXPath("//h2[contains(., 'Session Settings')]", {
			hidden: true,
		});
	});

	it(`Launch Minesweeper Draft`, async function () {
		await launchMode("Minesweeper");
		await waitAndClickXpath(pages[0], "//button[contains(., 'Start Minesweeper Draft')]");

		for (let i = 0; i < pages.length; ++i)
			await pages[i].waitForXPath("//h2[contains(., 'Minesweeper Draft')]", {
				visible: true,
			});
		for (let i = 0; i < pages.length; ++i)
			await pages[i].waitForXPath("//div[contains(., 'Draft Started!')]", {
				hidden: true,
			});
	});

	it(`Pick until done.`, async function () {
		this.timeout(100000);
		const done = [false, false];
		while (done.some((d) => !d))
			for (let i = 0; i < pages.length; i++)
				if (!done[i]) done[i] = (await pickMinesweeper(pages[i])) === PickResult.Done;
	});
});

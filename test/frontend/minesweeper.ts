import { describe, it } from "mocha";
import chai from "chai";
const expect = chai.expect;
import { dismissToast, pages, setupBrowsers, waitAndClickXpath } from "./src/common.js";
import { Page } from "puppeteer";

async function pickMinesweeper(page: Page) {
	let next = await page.waitForXPath(
		"//div[contains(., 'Done drafting!')] | //span[contains(., 'Pick a card')] | //span[contains(., 'Waiting for')]"
	);
	let text = await page.evaluate((next) => (next as HTMLElement).innerText, next);
	if (text === "Done drafting!") return true;
	if (text.includes("Waiting for")) return false;

	const cards = await page.$$(".minesweeper-grid .card:not(.picked)");
	if (cards.length === 0) return false;
	const card = cards[Math.floor(Math.random() * cards.length)];
	expect(card).to.exist;
	await card.click();
	return false;
}

describe("Minesweeper Draft", function () {
	this.timeout(5000);
	setupBrowsers(2);

	it(`Select Cube`, async function () {
		await waitAndClickXpath(pages[0], "//button[contains(., 'Settings')]");
		await waitAndClickXpath(pages[0], "//button[contains(., 'Load Cube')]");
		await pages[0].keyboard.press("Escape");
		await dismissToast(pages[0]);
	});

	it(`Launch Minesweeper Draft`, async function () {
		await pages[0].hover(".handle"); // Hover over "Other Game Modes"
		await waitAndClickXpath(pages[0], "//button[contains(., 'Minesweeper')]");
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
		let done = false;
		while (!done) {
			let ownerPromise = pickMinesweeper(pages[0]);
			let otherPromise = pickMinesweeper(pages[1]);
			done = (await ownerPromise) && (await otherPromise);
		}
	});
});

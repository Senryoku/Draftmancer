import { describe, it } from "mocha";
import chai from "chai";
const expect = chai.expect;
import { waitAndClickXpath, waitAndClickSelector, join } from "./src/common.js";
import { Browser, Page } from "puppeteer";

async function pickRochester(page: Page) {
	let next = await page.waitForXPath(
		"//div[contains(., 'Done drafting!')] | //span[contains(., 'Pick a card')] | //span[contains(., 'Waiting for')]"
	);
	let text = await page.evaluate((next) => (next as HTMLElement).innerText, next);
	if (text === "Done drafting!") return true;
	if (text.includes("Waiting for")) return false;

	const cards = await page.$$(".booster-card");
	if (cards.length === 0) return false;
	const card = cards[Math.floor(Math.random() * cards.length)];
	expect(card).to.exist;
	await card.click();
	await waitAndClickSelector(page, 'input[value="Confirm Pick"]');
	return false;
}

describe("Rochester", function () {
	let browsers: Browser[];
	let pages: Page[];
	this.timeout(5000);
	it("Launch and Join", async () => {
		[browsers, pages] = await join(2);
	});

	it(`Launch Draft`, async function () {
		await pages[0].hover(".handle"); // Hover over "Other Game Modes"
		await waitAndClickXpath(pages[0], "//button[contains(., 'Rochester')]");

		for (let i = 0; i < pages.length; ++i)
			await pages[i].waitForXPath("//h2[contains(., 'Rochester Draft')]", {
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
			let ownerPromise = pickRochester(pages[0]);
			let otherPromise = pickRochester(pages[1]);
			done = (await ownerPromise) && (await otherPromise);
		}

		await Promise.all(browsers.map((b) => b.close()));
		browsers = pages = [];
	});
});

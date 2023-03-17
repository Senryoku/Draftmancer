import { describe, it } from "mocha";
import chai from "chai";
const expect = chai.expect;
import { waitAndClickXpath, waitAndClickSelector, pages, setupBrowsers, PickResult } from "./src/common.js";
import { Page } from "puppeteer";
import { getRandom } from "../../src/utils.js";

export async function pickRochester(page: Page): Promise<PickResult> {
	const done = await page.$$("xpath///h2[contains(., 'Done drafting!')]");
	if (done.length > 0) return PickResult.Done;
	const waiting = await page.$$("xpath///div[contains(., 'Waiting for')]");
	if (waiting.length > 0) return PickResult.Waiting;
	const cards = await page.$$(".booster:not(.booster-waiting) .booster-card");
	if (cards.length === 0) return PickResult.Waiting;

	const card = getRandom(cards);
	expect(card).to.exist;
	try {
		await card.click();
	} catch (e) {
		// FIXME: IDK why this randomly fails.
		return PickResult.Waiting;
	}
	while (await (await card.toElement("div")).evaluate((el) => !el.classList.contains("selected"))) await card.click();
	await waitAndClickSelector(page, 'input[value="Confirm Pick"]');
	return PickResult.Picked;
}

describe("Rochester", function () {
	this.timeout(5000);
	setupBrowsers(2);

	it(`Launch Draft`, async function () {
		await pages[0].hover(".handle"); // Hover over "Other Game Modes"
		await waitAndClickXpath(pages[0], "//button[contains(., 'Rochester')]");

		await Promise.all(
			pages.map((p) =>
				p.waitForXPath("//h2[contains(., 'Rochester Draft')]", {
					visible: true,
				})
			)
		);
		await Promise.all(
			pages.map((p) =>
				p.waitForXPath("//div[contains(., 'Draft Started!')]", {
					hidden: true,
				})
			)
		);
	});

	it(`Pick until done.`, async function () {
		this.timeout(100000);
		let done = [false, false];
		while (done.some((d) => !d))
			for (let i = 0; i < pages.length; i++)
				if (!done[i]) done[i] = (await pickRochester(pages[i])) === PickResult.Done;
	});
});

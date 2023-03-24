import { Page } from "puppeteer";
import chai from "chai";
const expect = chai.expect;
import { waitAndClickSelector, waitAndClickXpath, setupBrowsers, pages } from "./src/common.js";

async function pickCard(page: Page) {
	let next = await page.waitForXPath("//div[contains(., 'Done drafting!')] | //div[contains(., 'Pick a card')]");
	let text = await page.evaluate((next) => (next as HTMLElement).innerText, next);
	if (text === "Done drafting!") return true;

	const cards = await page.$$(".rotisserie-draft-container .card:not(.card-picked)");
	const card = cards[Math.floor(Math.random() * cards.length)];
	expect(card).to.exist;
	await card.click();
	await waitAndClickXpath(page, "//button[not(@disabled)][contains(., 'Confirm Pick')]");
	return false;
}

describe("Rotisserie Draft - Singleton", function () {
	this.timeout(10000);
	setupBrowsers(4);

	it(`Launch Draft`, async function () {
		await pages[0].hover(".handle"); // Hover over "Other Game Modes"
		await waitAndClickXpath(pages[0], "//button[contains(., 'Rotisserie')]");
		await waitAndClickSelector(pages[0], "button.confirm");

		await Promise.all(
			pages.map((page) =>
				page.waitForXPath("//div[contains(., 'Draft Started!')]", {
					hidden: true,
				})
			)
		);
	});

	it("Each player picks a card", async function () {
		this.timeout(100000);
		let done = [];
		for (let i = 0; i < pages.length; i++) {
			done.push(false);
		}
		while (done.some((d) => !d)) {
			let promises = [];
			for (let i = 0; i < pages.length; i++) {
				if (done[i]) promises.push(true);
				else promises.push(pickCard(pages[i]));
			}
			await Promise.all(promises);
			for (let i = 0; i < pages.length; i++) {
				done[i] = await promises[i];
			}
		}
	});
});

describe("Rotisserie Draft - Standard", function () {
	this.timeout(10000);
	setupBrowsers(6);

	it(`Launch Draft`, async function () {
		await pages[0].hover(".handle"); // Hover over "Other Game Modes"
		await waitAndClickXpath(pages[0], "//button[contains(., 'Rotisserie')]");
		await pages[0].select("select.swal2-input", "standard");
		await waitAndClickSelector(pages[0], "button.confirm");

		await Promise.all(
			pages.map((page) =>
				page.waitForXPath("//div[contains(., 'Draft Started!')]", {
					hidden: true,
				})
			)
		);
	});

	it("Each player picks a card", async function () {
		this.timeout(100000);
		let done = [];
		for (let i = 0; i < pages.length; i++) {
			done.push(false);
		}
		while (done.some((d) => !d)) {
			let promises = [];
			for (let i = 0; i < pages.length; i++) {
				if (done[i]) promises.push(true);
				else promises.push(pickCard(pages[i]));
			}
			await Promise.all(promises);
			for (let i = 0; i < pages.length; i++) {
				done[i] = await promises[i];
			}
		}
	});
});

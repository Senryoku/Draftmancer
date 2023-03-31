import { describe, it } from "mocha";
import chai from "chai";
const expect = chai.expect;
import { getSessionLink, pages, setupBrowsers, waitAndClickXpath } from "./src/common.js";
import { Page } from "puppeteer";
import { getRandom } from "../../src/utils.js";

async function pickHousman(page: Page) {
	const drafting = await page.$$("#draft-in-progress");
	if (drafting.length === 0) return true;

	let next = await page.waitForXPath("//span[contains(., 'Your turn')] | //span[contains(., 'Waiting for')]");
	let text = await page.evaluate((next) => (next as HTMLElement).innerText, next);
	if (text.includes("Waiting for")) return false;

	const revealedChoices = await page.$$(".housman-revealed-cards .card");
	if (revealedChoices.length === 0) return false;
	const revealedChoice = getRandom(revealedChoices);
	revealedChoice.click();
	const handChoices = await page.$$(".housman-hand .card");
	if (handChoices.length === 0) return false;
	const handChoice = getRandom(handChoices);
	handChoice.click();

	(await page.$(".housman-confirm"))!.click();

	return false;
}

describe.only("Housman Draft", function () {
	describe("Housman Draft - Simple", function () {
		this.timeout(20000);
		setupBrowsers(2);

		it(`Launch Housman Draft`, async function () {
			await pages[0].hover(".handle"); // Hover over "Other Game Modes"
			await waitAndClickXpath(pages[0], "//button[contains(., 'Housman')]");
			// FIXME: Update when the settings modal is implemented
			// await waitAndClickXpath(pages[0], "//button[contains(., 'Start Housman Draft')]");

			await Promise.all([
				...pages.map((page) =>
					page.waitForXPath("//*[contains(., 'Draft Started!')]", {
						hidden: true,
					})
				),
			]);
		});

		it(`Pick until done.`, async function () {
			this.timeout(100000);
			let done = false;
			while (!done) {
				done = (await pickHousman(pages[0])) || (await pickHousman(pages[1]));
			}
		});
	});

	describe("Housman Draft - 4 Players", function () {
		this.timeout(20000);
		setupBrowsers(4);

		it(`Launch Housman Draft`, async function () {
			await pages[0].hover(".handle"); // Hover over "Other Game Modes"
			await waitAndClickXpath(pages[0], "//button[contains(., 'Housman')]");
			await waitAndClickXpath(pages[0], "//button[contains(., 'Start Housman Draft')]");

			await Promise.all([
				...pages.map((page) =>
					page.waitForXPath("//*[contains(., 'Draft Started')]", {
						hidden: true,
					})
				),
			]);
		});

		it(`Pick until done.`, async function () {
			this.timeout(100000);
			let done = false;
			while (!done) {
				done = (await Promise.all(pages.map(async (p) => await pickHousman(p)))).some((v) => v);
			}
			await new Promise((r) => setTimeout(r, 10000));
		});
	});

	describe("Housman Draft - With disconnects", function () {
		let sessionLink: string;
		this.timeout(20000);
		setupBrowsers(2);

		it(`Launch Housman Draft`, async function () {
			sessionLink = await getSessionLink(pages[0]);
			await pages[0].hover(".handle"); // Hover over "Other Game Modes"
			await waitAndClickXpath(pages[0], "//button[contains(., 'Housman')]");
			await waitAndClickXpath(pages[0], "//button[contains(., 'Start Housman Draft')]");

			await Promise.all([
				...pages.map((page) =>
					page.waitForXPath("//*[contains(., 'Draft Started')]", {
						hidden: true,
					})
				),
			]);
		});

		it(`Couple of picks.`, async function () {
			await Promise.all(pages.map(pickHousman));
			await new Promise((resolve) => setTimeout(resolve, 25));
			await Promise.all(pages.map(pickHousman));
			await new Promise((resolve) => setTimeout(resolve, 25));
			await Promise.all(pages.map(pickHousman));
		});

		it("Player 0 refreshes the page", async function () {
			await pages[0].goto("about:blank", { waitUntil: ["domcontentloaded"] });
			await pages[0].goto(sessionLink, { waitUntil: ["domcontentloaded"] });
			await pages[0].waitForXPath("//*[contains(., 'Reconnected')]", {
				hidden: true,
			});
		});

		it(`Couple of picks.`, async function () {
			await Promise.all(pages.map(pickHousman));
			await new Promise((resolve) => setTimeout(resolve, 25));
			await Promise.all(pages.map(pickHousman));
			await new Promise((resolve) => setTimeout(resolve, 25));
			await Promise.all(pages.map(pickHousman));
		});

		it("Player 1 refreshes the page", async function () {
			await pages[1].reload({ waitUntil: ["domcontentloaded"] });
			await pages[1].waitForXPath("//*[contains(., 'Reconnected')]", {
				hidden: true,
			});
		});

		it(`Couple of picks.`, async function () {
			await Promise.all(pages.map(pickHousman));
			await new Promise((resolve) => setTimeout(resolve, 25));
			await Promise.all(pages.map(pickHousman));
			await new Promise((resolve) => setTimeout(resolve, 25));
			await Promise.all(pages.map(pickHousman));
		});

		it("Both player disconnect at the same time", async function () {
			await pages[0].goto("about:blank", { waitUntil: ["domcontentloaded"] });
			await pages[1].goto("about:blank", { waitUntil: ["domcontentloaded"] });
			await new Promise((r) => setTimeout(r, 100));

			await pages[0].goto(sessionLink, { waitUntil: ["domcontentloaded"] });
			await pages[1].goto(sessionLink, { waitUntil: ["domcontentloaded"] });
			await Promise.all(
				pages.map((p) =>
					p.waitForXPath("//*[contains(., 'Reconnected')]", {
						hidden: true,
					})
				)
			);
		});

		it(`Pick until done.`, async function () {
			this.timeout(100000);
			let done = false;
			while (!done) {
				done = (await pickHousman(pages[0])) || (await pickHousman(pages[1]));
			}
		});
	});
});

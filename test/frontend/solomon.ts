import { describe, it } from "mocha";
import chai from "chai";
const expect = chai.expect;
import {
	getSessionLink,
	pages,
	setupBrowsers,
	waitAndClickXpath,
	expectNCardsInTotal,
	replaceInput,
	launchMode,
} from "./src/common.js";
import { ElementHandle, Page } from "puppeteer";
import { getRandom } from "../../src/utils.js";
import { off } from "process";
import { Ignore } from "glob/dist/mjs/ignore";

async function pickSolomon(page: Page) {
	await new Promise((r) => setTimeout(r, 10));
	const drafting = await page.$$("#draft-in-progress");
	if (drafting.length === 0) return true;

	let next = await page.$$("xpath///*[contains(., 'Your turn')] | //*[contains(., 'Waiting for')]");
	if (next.length === 0) return false;
	let text = await next[0].evaluate((el) => (el as HTMLElement).innerText);
	if (text.includes("Waiting for")) return false;

	if (text.includes("pick")) {
		const pileChoices = await page.$$(".solomon-pile");
		if (pileChoices.length === 0) return false;
		const pileChoice = getRandom(pileChoices);
		await pileChoice.click();
	} else if (text.includes("reorder")) {
		// TODO
	}

	const confirmButton = await page.$(".solomon-confirm:not(:disabled)");
	if (!confirmButton) return false;
	await confirmButton!.click();

	return false;
}

let sessionLink: string;

function launch(cardCount: number = 8, roundCount: number = 10) {
	it(`Launch Solomon Draft`, async function () {
		sessionLink = await getSessionLink(pages[0]);

		await launchMode("Solomon");
		await replaceInput(cardCount.toString())(await pages[0].$("#card-input"));
		await replaceInput(roundCount.toString())(await pages[0].$("#rounds-input"));
		await waitAndClickXpath(pages[0], "//button[contains(., 'Start Solomon Draft')]");

		await Promise.all([
			...pages.map((page) =>
				page.waitForXPath("//*[contains(., 'Draft Started!')]", {
					hidden: true,
				})
			),
		]);
	});
}

describe("Solomon Draft", function () {
	describe("Solomon Draft - Simple", function () {
		this.timeout(20000);
		setupBrowsers(2);

		launch();

		it(`Pick until done.`, async function () {
			this.timeout(100000);
			let done = false;
			while (!done) {
				done = (await pickSolomon(pages[0])) || (await pickSolomon(pages[1]));
			}
		});

		expectNCardsInTotal(8 * 10);
	});

	for (const settings of [
		{
			cardCount: 9,
			roundCount: 8,
		},
	]) {
		describe(`Solomon Draft - Settings ${JSON.stringify(settings)}`, function () {
			this.timeout(20000);
			setupBrowsers(2);

			launch(settings.cardCount, settings.roundCount);

			it(`Pick until done.`, async function () {
				this.timeout(100000);
				let done = false;
				while (!done) {
					done = (await pickSolomon(pages[0])) || (await pickSolomon(pages[1]));
				}
			});

			expectNCardsInTotal(settings.cardCount * settings.roundCount);
		});
	}

	describe("Solomon Draft - With disconnects", function () {
		this.timeout(20000);
		setupBrowsers(2);

		launch();

		it(`Couple of picks.`, async function () {
			await Promise.all(pages.map(pickSolomon));
			await new Promise((resolve) => setTimeout(resolve, 25));
			await Promise.all(pages.map(pickSolomon));
			await new Promise((resolve) => setTimeout(resolve, 25));
			await Promise.all(pages.map(pickSolomon));
		});

		it("Player 0 refreshes the page", async function () {
			await pages[0].goto("about:blank", { waitUntil: ["domcontentloaded"] });
			await pages[0].goto(sessionLink, { waitUntil: ["domcontentloaded"] });
			await pages[0].waitForXPath("//*[contains(., 'Reconnected')]", {
				hidden: true,
			});
		});

		it(`Couple of picks.`, async function () {
			await Promise.all(pages.map(pickSolomon));
			await new Promise((resolve) => setTimeout(resolve, 25));
			await Promise.all(pages.map(pickSolomon));
			await new Promise((resolve) => setTimeout(resolve, 25));
			await Promise.all(pages.map(pickSolomon));
		});

		it("Player 1 refreshes the page", async function () {
			await pages[1].reload({ waitUntil: ["domcontentloaded"] });
			await pages[1].waitForXPath("//*[contains(., 'Reconnected')]", {
				hidden: true,
			});
		});

		it(`Couple of picks.`, async function () {
			await Promise.all(pages.map(pickSolomon));
			await new Promise((resolve) => setTimeout(resolve, 25));
			await Promise.all(pages.map(pickSolomon));
			await new Promise((resolve) => setTimeout(resolve, 25));
			await Promise.all(pages.map(pickSolomon));
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
				done = (await pickSolomon(pages[0])) || (await pickSolomon(pages[1]));
			}
		});

		expectNCardsInTotal(8 * 10);
	});
});

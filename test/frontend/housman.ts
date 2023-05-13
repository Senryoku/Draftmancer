import { describe, it } from "mocha";
import chai from "chai";
const expect = chai.expect;
import {
	getSessionLink,
	pages,
	setupBrowsers,
	waitAndClickXpath,
	expectNCardsInDeck,
	replaceInput,
	launchMode,
} from "./src/common.js";
import { Page } from "puppeteer";
import { getRandom } from "../../src/utils.js";

async function pickHousman(page: Page) {
	await new Promise((r) => setTimeout(r, 10));
	const drafting = await page.$$("#draft-in-progress");
	if (drafting.length === 0) return true;

	const next = await page.$$("xpath///span[contains(., 'Your turn')] | //span[contains(., 'Waiting for')]");
	if (next.length === 0) return false;
	const text = await next[0].evaluate((el) => (el as HTMLElement).innerText);
	if (text.includes("Waiting for")) return false;

	const revealedChoices = await page.$$(".housman-revealed-cards .card");
	if (revealedChoices.length === 0) return false;
	const revealedChoice = getRandom(revealedChoices);
	await revealedChoice.click();
	const handChoices = await page.$$(".housman-hand .card");
	if (handChoices.length === 0) return false;
	const handChoice = getRandom(handChoices);
	await handChoice.click();

	await (await page.$(".housman-confirm"))!.click();

	return false;
}

let sessionLink: string;

function launch(
	handSize: number = 5,
	revealedCardsCount: number = 9,
	exchangeCount: number = 3,
	roundCount: number = 9
) {
	it(`Launch Housman Draft`, async function () {
		sessionLink = await getSessionLink(pages[0]);

		await launchMode("Housman");

		await replaceInput(handSize.toString())(await pages[0].$("#hand-input"));
		await replaceInput(revealedCardsCount.toString())(await pages[0].$("#revealed-input"));
		await replaceInput(exchangeCount.toString())(await pages[0].$("#exchanges-input"));
		await replaceInput(roundCount.toString())(await pages[0].$("#rounds-input"));
		await waitAndClickXpath(pages[0], "//button[contains(., 'Start Housman Draft')]");

		await Promise.all([
			...pages.map((page) =>
				page.waitForXPath("//*[contains(., 'Draft Started!')]", {
					hidden: true,
				})
			),
		]);
	});
}

describe("Housman Draft", function () {
	describe("Housman Draft - Simple", function () {
		this.timeout(20000);
		setupBrowsers(2);

		launch();

		it(`Pick until done.`, async function () {
			this.timeout(100000);
			let done = false;
			while (!done) {
				done = (await pickHousman(pages[0])) || (await pickHousman(pages[1]));
			}
		});

		expectNCardsInDeck(45);
	});

	for (const settings of [
		{
			handSize: 6,
			revealedCardsCount: 8,
			exchangeCount: 2,
			roundCount: 8,
		},
	]) {
		describe(`Housman Draft - Settings ${JSON.stringify(settings)}`, function () {
			this.timeout(20000);
			setupBrowsers(2);

			launch(settings.handSize, settings.revealedCardsCount, settings.exchangeCount, settings.roundCount);

			it(`Pick until done.`, async function () {
				this.timeout(100000);
				let done = false;
				while (!done) {
					done = (await pickHousman(pages[0])) || (await pickHousman(pages[1]));
				}
			});

			expectNCardsInDeck(settings.handSize * settings.roundCount);
		});
	}

	describe("Housman Draft - 4 Players", function () {
		this.timeout(20000);
		setupBrowsers(4);

		launch();

		it(`Pick until done.`, async function () {
			this.timeout(100000);
			let done = false;
			while (!done) {
				done = (await Promise.all(pages.map(async (p) => await pickHousman(p)))).some((v) => v);
			}
		});

		expectNCardsInDeck(45);
	});

	describe("Housman Draft - With disconnects", function () {
		this.timeout(20000);
		setupBrowsers(2);

		launch();

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

		expectNCardsInDeck(45);
	});
});

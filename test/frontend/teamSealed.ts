import { Browser, Page } from "puppeteer";
import chai from "chai";
const expect = chai.expect;
import { join, waitAndClickXpath } from "./src/common.js";

let browsers: Browser[] = [];
let pages: Page[] = [];

async function closeBrowsers() {
	await Promise.all(browsers.map((b) => b.close()));
	browsers = pages = [];
}

async function pickCard(page: Page, random = false) {
	let next = await page.waitForXPath("//div[contains(., 'Team Sealed stopped!')] | //span[contains(., 'Card Pool')]");
	let text = await page.evaluate((next) => (next as HTMLElement).innerText, next);
	if (text === "Team Sealed stopped!") return true;

	const cards = await page.$$(".team-sealed-container .card:not(.card-picked)");
	const card = cards[random ? Math.floor(Math.random() * cards.length) : 0];
	expect(card).to.exist;
	await card.click();
	await page.waitForFunction(
		(el) => {
			return el.classList.contains("card-picked");
		},
		{},
		card
	);
	return false;
}

describe("Front End - Team Sealed", function () {
	this.timeout(100000);
	it("Starts Browsers", async function () {
		[browsers, pages] = await join(6);
	});

	it(`Launch Draft`, async function () {
		await pages[0].hover(".handle"); // Hover over "Other Game Modes"
		await waitAndClickXpath(pages[0], "//button[contains(., 'Team Sealed')]");
		await waitAndClickXpath(pages[0], "//button[contains(., 'Distribute Boosters')]");

		await Promise.all(
			pages.map((page) =>
				page.waitForXPath("//h2[contains(., 'Card Pool')]", {
					visible: true,
				})
			)
		);
		await Promise.all(
			pages.map((page) =>
				page.waitForXPath("//div[contains(., 'Team Sealed started!')]", {
					hidden: true,
				})
			)
		);
	});

	it("Each player picks the first card available", async function () {
		for (const page of pages) await pickCard(page);
	});

	it("Each player picks 9 more cards randomly", async function () {
		for (let c = 0; c < 9; c++) for (const page of pages) await pickCard(page, true);
	});

	it("Player 0 tries to pick an unavailable card, receives an error.", async function () {
		const cards = await pages[0].$$(".team-sealed-container .card.card-picked");
		const card = cards[1]; // Should have been picked by the next player
		expect(card).to.exist;
		await card.click();
		await pages[0].waitForXPath("//h2[contains(., 'Card Unavailable')]", {
			visible: true,
		});
		await waitAndClickXpath(pages[0], "//button[contains(., 'OK')]");
		await pages[0].waitForXPath("//h2[contains(., 'Card Unavailable')]", {
			hidden: true,
		});
	});

	it("Player 0 returns a card.", async function () {
		const cards = await pages[0].$$(".team-sealed-container .card.card-picked");
		const card = cards[0]; // Should have been picked by player 0
		expect(card).to.exist;
		await card.click();
		await pages[0].waitForFunction(
			(el) => {
				return !el.classList.contains("card-picked");
			},
			{},
			card
		);
	});

	it("Owner stops the event", async function () {
		await waitAndClickXpath(pages[0], "//button[contains(., 'Stop')]");
		await waitAndClickXpath(pages[0], "//button[contains(., 'Stop the game!')]");
		let promises = [];
		for (let i = 0; i < pages.length; i++) {
			promises.push(
				pages[i].waitForXPath("//div[contains(., 'Team Sealed stopped!')]", {
					visible: true,
				})
			);
		}
		await Promise.all(promises);
	});

	it("Close Browsers", async function () {
		await closeBrowsers();
	});
});

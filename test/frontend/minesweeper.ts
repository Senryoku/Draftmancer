import { describe, it } from "mocha";
import chai from "chai";
const expect = chai.expect;
import { sessionOwnerPage, otherPlayerPage } from "./src/twoPages.js";
import { getSessionLink, waitAndClickXpath } from "./src/common.js";
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
	this.timeout(100000);
	it("Owner joins", async function () {
		await sessionOwnerPage.goto(`http://localhost:${process.env.PORT}`);
	});

	it(`Another Player joins the session`, async function () {
		const clipboard = await getSessionLink(sessionOwnerPage);
		await otherPlayerPage.goto(clipboard);
	});

	it(`Select Cube`, async function () {
		await waitAndClickXpath(sessionOwnerPage, "//button[contains(., 'Settings')]");
		await waitAndClickXpath(sessionOwnerPage, "//button[contains(., 'Load Cube')]");
		await sessionOwnerPage.keyboard.press("Escape");
	});

	it(`Launch Minesweeper Draft`, async function () {
		await sessionOwnerPage.hover(".handle"); // Hover over "Other Game Modes"
		await waitAndClickXpath(sessionOwnerPage, "//button[contains(., 'Minesweeper')]");
		await waitAndClickXpath(sessionOwnerPage, "//button[contains(., 'Start Minesweeper Draft')]");

		await sessionOwnerPage.waitForXPath("//h2[contains(., 'Minesweeper Draft')]", {
			visible: true,
		});
		await otherPlayerPage.waitForXPath("//h2[contains(., 'Minesweeper Draft')]", {
			visible: true,
		});
		await sessionOwnerPage.waitForXPath("//div[contains(., 'Draft Started!')]", {
			hidden: true,
		});
		await otherPlayerPage.waitForXPath("//div[contains(., 'Draft Started!')]", {
			hidden: true,
		});
	});

	it(`Pick until done.`, async function () {
		let done = false;
		while (!done) {
			let ownerPromise = pickMinesweeper(sessionOwnerPage);
			let otherPromise = pickMinesweeper(otherPlayerPage);
			done = (await ownerPromise) && (await otherPromise);
		}
	});
});

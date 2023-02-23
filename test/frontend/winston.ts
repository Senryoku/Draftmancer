import { describe, it } from "mocha";
import chai from "chai";
const expect = chai.expect;
import { sessionOwnerPage, otherPlayerPage } from "./src/twoPages.js";
import { waitAndClickXpath } from "./src/common.js";
import { ElementHandle, Page } from "puppeteer";
import exp from "constants";

async function pickWinston(page: Page) {
	let next = await page.waitForXPath(
		"//div[contains(., 'Done drafting!')] | //span[contains(., 'Your turn to pick a pile of cards!')] | //span[contains(., 'Waiting for')]"
	);
	let text = await page.evaluate((next) => (next as HTMLElement).innerText, next);
	if (text === "Done drafting!") return true;
	if (text.includes("Waiting for")) return false;

	const pickXPath = "//button[contains(., 'Take Pile')]";
	const skipXPath = "//button[contains(., 'Skip Pile')]";

	const pickOrSkip = async (depth = 0) => {
		let pick = await page.waitForXPath(pickXPath);
		expect(pick).to.be.not.null;
		let skip = await page.$x(skipXPath);
		if (skip.length === 0 || Math.random() < 0.33) {
			await (pick as ElementHandle<HTMLElement>).click();
		} else {
			expect(skip[0]).to.be.not.null;
			await (skip[0] as ElementHandle<HTMLElement>).click();
			if (depth < 2) {
				await pickOrSkip(++depth);
			} else {
				await waitAndClickXpath(page, "//button[contains(., 'OK')]"); // Dismiss card
			}
		}
	};
	await pickOrSkip();

	return false;
}

describe("Winston Draft", function () {
	this.timeout(100000);
	it("Owner joins", async function () {
		await sessionOwnerPage.goto(`http://localhost:${process.env.PORT}`);
	});

	it(`Another Player joins the session`, async function () {
		// Get session link
		await sessionOwnerPage.$$(".fa-share-square");
		await sessionOwnerPage.click(".fa-share-square");
		let clipboard = await sessionOwnerPage.evaluate(() => navigator.clipboard.readText());
		expect(clipboard).to.match(/^http:\/\/localhost:3001\/\?session=/);

		await otherPlayerPage.goto(clipboard);
	});

	it(`Launch Winston Draft`, async function () {
		await waitAndClickXpath(sessionOwnerPage, "//button[contains(., 'Winston')]");
		await waitAndClickXpath(sessionOwnerPage, "//button[contains(., 'Winston')]");
		await waitAndClickXpath(sessionOwnerPage, "//button[contains(., 'Start Winston Draft')]");

		await sessionOwnerPage.waitForXPath("//h2[contains(., 'Winston Draft')]", {
			visible: true,
		});
		await otherPlayerPage.waitForXPath("//h2[contains(., 'Winston Draft')]", {
			visible: true,
		});
	});

	it(`Pick until done.`, async function () {
		let done = false;
		while (!done) {
			let ownerPromise = pickWinston(sessionOwnerPage);
			let otherPromise = pickWinston(otherPlayerPage);
			done = (await ownerPromise) && (await otherPromise);
		}
	});
});

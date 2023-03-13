import { describe, it } from "mocha";
import chai from "chai";
const expect = chai.expect;
import { getSessionLink, join, waitAndClickXpath } from "./src/common.js";
import { Browser, ElementHandle, Page } from "puppeteer";

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
	let browsers: Browser[] = [];
	let pages: Page[] = [];
	this.timeout(100000);

	it("Launch And Join", async function () {
		[browsers, pages] = await join(2);
	});

	it(`Another Player joins the session`, async function () {
		const clipboard = await getSessionLink(pages[0]);
		await pages[1].goto(clipboard);
	});

	it(`Launch Winston Draft`, async function () {
		await waitAndClickXpath(pages[0], "//button[contains(., 'Winston')]");
		await waitAndClickXpath(pages[0], "//button[contains(., 'Winston')]");
		await waitAndClickXpath(pages[0], "//button[contains(., 'Start Winston Draft')]");

		await pages[0].waitForXPath("//h2[contains(., 'Winston Draft')]", {
			visible: true,
		});
		await pages[1].waitForXPath("//h2[contains(., 'Winston Draft')]", {
			visible: true,
		});
	});

	it(`Pick until done.`, async function () {
		let done = false;
		while (!done) {
			let ownerPromise = pickWinston(pages[0]);
			let otherPromise = pickWinston(pages[1]);
			done = (await ownerPromise) && (await otherPromise);
		}

		browsers.map((b) => b.close());
	});
});

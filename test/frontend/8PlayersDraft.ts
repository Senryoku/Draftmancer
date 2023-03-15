import { beforeEach, afterEach } from "mocha";
import { Browser, ElementHandle, Page } from "puppeteer";
import chai from "chai";
const expect = chai.expect;
import { enableLogs, disableLogs } from "../src/common.js";
import { waitAndClickSelector, join } from "./src/common.js";

let browsers: Browser[] = [];
let pages: Page[] = [];

beforeEach(function (done) {
	disableLogs();
	done();
});

afterEach(function (done) {
	enableLogs(this.currentTest!.state == "failed");
	done();
});

after(async () => {
	await Promise.all(browsers.map((b) => b.close()));
});

async function pickCard(page: Page) {
	let next = await page.waitForXPath("//div[contains(., 'Done drafting!')] | //span[contains(., 'Pick a card')]");
	let text = await page.evaluate((next) => (next as HTMLElement).innerText, next);
	if (text === "Done drafting!") return true;

	await page.waitForSelector(".booster:not(.booster-waiting) .booster-card");
	const cards = await page.$$(".booster-card");
	const card = cards[Math.floor(Math.random() * cards.length)];
	expect(card).to.exist;
	await card.click();
	await waitAndClickSelector(page, 'input[value="Confirm Pick"]');
	return false;
}

describe("Front End - 8 Players Draft", function () {
	this.timeout(200000);
	it("Starts Browsers", async function () {
		[browsers, pages] = await join(8);
	});

	it(`Launch Draft`, async function () {
		const [button] = (await pages[0].$x("//button[contains(., 'Start')]")) as ElementHandle<Element>[];
		expect(button).to.exist;
		await button!.click();

		let promises = [];
		for (let i = 0; i < pages.length; i++) {
			promises.push(
				pages[i].waitForXPath("//h2[contains(., 'Your Booster')]", {
					visible: true,
				})
			);
			promises.push(
				pages[i].waitForXPath("//div[contains(., 'Draft Started!')]", {
					hidden: true,
				})
			);
		}
		await Promise.all(promises);
		await new Promise((r) => setTimeout(r, 10000));
	});

	it("Each player picks a card", async function () {
		let done = [];
		for (let i = 0; i < pages.length; i++) done.push(false);
		while (done.some((d) => !d)) {
			let promises = [];
			for (let i = 0; i < pages.length; i++) {
				if (done[i]) promises.push(true);
				else promises.push(pickCard(pages[i]));
			}
			await Promise.all(promises);
			for (let i = 0; i < pages.length; i++) done[i] = await promises[i];
		}

		await Promise.all(browsers.map((b) => b.close()));
		browsers = pages = [];
	});
});

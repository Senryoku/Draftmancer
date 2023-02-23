import { beforeEach, afterEach } from "mocha";
import puppeteer, { Browser, ElementHandle, Page } from "puppeteer";
import chai from "chai";
const expect = chai.expect;
import { enableLogs, disableLogs } from "../src/common.js";
import { waitAndClickSelector, startBrowsers, waitAndClickXpath } from "./src/common.js";

const testDebug = true; // Display tests for debugging
const debugWindowWidth = 2560 / 4;
const debugWindowHeight = 1440 / 2;

let browsers: Browser[];
let pages: Page[];

async function closeBrowsers() {
	for (const browser of browsers) browser.close();
	browsers = [];
	pages = [];
}

beforeEach(function (done) {
	disableLogs();
	done();
});

afterEach(function (done) {
	enableLogs(this.currentTest!.state == "failed");
	done();
});

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
	it("Starts Browsers", async function () {
		[browsers, pages] = await startBrowsers(4);
	});

	it("Owner joins", async function () {
		await pages[0].goto(`http://localhost:${process.env.PORT}`);
	});

	it(`Other Players joins the session`, async function () {
		// Get session link
		await pages[0].$$(".fa-share-square");
		await pages[0].click(".fa-share-square");
		let clipboard = await pages[0].evaluate(() => navigator.clipboard.readText());
		expect(clipboard).to.match(/^http:\/\/localhost:3001\/\?session=/);

		let promises = [];
		for (const page of pages) promises.push(page.goto(clipboard));
		await Promise.all(promises);
	});

	it(`Launch Draft`, async function () {
		await pages[0].hover(".handle"); // Hover over "Other Game Modes"
		await waitAndClickXpath(pages[0], "//button[contains(., 'Rotisserie')]");
		await waitAndClickSelector(pages[0], "button.confirm");

		let promises = [];
		for (const page of pages)
			promises.push(
				page.waitForXPath("//div[contains(., 'Draft Started!')]", {
					hidden: true,
				})
			);
		await Promise.all(promises);
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

	it("Close Browsers", async function () {
		await closeBrowsers();
	});
});

describe("Rotisserie Draft - Standard", function () {
	this.timeout(10000);
	it("Starts Browsers", async function () {
		[browsers, pages] = await startBrowsers(6);
	});

	it("Owner joins", async function () {
		await pages[0].goto(`http://localhost:${process.env.PORT}`);
	});

	it(`Other Players joins the session`, async function () {
		// Get session link
		await pages[0].$$(".fa-share-square");
		await pages[0].click(".fa-share-square");
		let clipboard = await pages[0].evaluate(() => navigator.clipboard.readText());
		expect(clipboard).to.match(/^http:\/\/localhost:3001\/\?session=/);

		let promises = [];
		for (const page of pages) promises.push(page.goto(clipboard));
		await Promise.all(promises);
	});

	it(`Launch Draft`, async function () {
		await pages[0].hover(".handle"); // Hover over "Other Game Modes"
		await waitAndClickXpath(pages[0], "//button[contains(., 'Rotisserie')]");
		await pages[0].select("select.swal2-input", "standard");
		await waitAndClickSelector(pages[0], "button.confirm");

		let promises = [];
		for (const page of pages)
			promises.push(
				page.waitForXPath("//div[contains(., 'Draft Started!')]", {
					hidden: true,
				})
			);
		await Promise.all(promises);
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

	it("Close Browsers", async function () {
		await closeBrowsers();
	});
});

import { beforeEach, afterEach } from "mocha";
import { Browser, Page } from "puppeteer";
import chai from "chai";
const expect = chai.expect;
import { enableLogs, disableLogs } from "../src/common.js";
import { waitAndClickSelector, startBrowsers, waitAndClickXpath, getSessionLink } from "./src/common.js";
import { getRandom } from "../../src/utils.js";

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
	let next = await page.waitForXPath(
		"//div[contains(., 'Done drafting!')] | //span[contains(., 'your turn')] | //span[contains(., 'Advancing')]"
	);
	let text = await page.evaluate((next) => (next as HTMLElement).innerText, next);
	if (text === "Done drafting!") return true;
	if (text.includes("Advancing")) {
		await new Promise((r) => setTimeout(r, 10));
		return false; // Waiting for the next pack
	}
	let choices = [];
	// Yuk.
	do {
		choices = await page.$$(`.pick-col i:not([style*="display: none"])`);
		choices.push(...(await page.$$(`.pick-row i:not([style*="display: none"])`)));
	} while (choices.length === 0);
	const choice = getRandom(choices);
	expect(choice).to.exist;
	await choice.click();
	return false;
}

describe("Grid Draft", () => {
	describe("Grid Draft - 2 Players", function () {
		this.timeout(10000);
		it("Starts Browsers", async () => {
			[browsers, pages] = await startBrowsers(2);
		});

		it("Owner joins", async () => {
			await pages[0].goto(`http://localhost:${process.env.PORT}`);
		});

		it(`Other Players joins the session`, async () => {
			const clipboard = await getSessionLink(pages[0]);
			let promises = [];
			for (let idx = 1; idx < pages.length; ++idx) promises.push(pages[idx].goto(clipboard));
			await Promise.all(promises);
		});

		it(`Launch Draft`, async () => {
			await pages[0].hover(".handle"); // Hover over "Other Game Modes"
			await waitAndClickXpath(pages[0], "//button[contains(., 'Grid')]");
			await waitAndClickSelector(pages[0], "button.swal2-confirm");

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
			const done = Array(pages.length).fill(false);
			while (done.some((d) => !d)) {
				let promises = [];
				for (let i = 0; i < pages.length; i++) {
					if (done[i]) promises.push(true);
					else promises.push(pickCard(pages[i]));
				}
				await Promise.all(promises);
				for (let i = 0; i < pages.length; i++) done[i] = done[i] || (await promises[i]);
			}
		});

		it("Close Browsers", async () => {
			await closeBrowsers();
		});
	});

	describe("Grid Draft - 3 Players", function () {
		this.timeout(10000);
		it("Starts Browsers", async () => {
			[browsers, pages] = await startBrowsers(3);
		});

		it("Owner joins", async () => {
			await pages[0].goto(`http://localhost:${process.env.PORT}`);
		});

		it(`Other Players joins the session`, async () => {
			const clipboard = await getSessionLink(pages[0]);
			let promises = [];
			for (let idx = 1; idx < pages.length; ++idx) promises.push(pages[idx].goto(clipboard));
			await Promise.all(promises);
		});

		it(`Launch Draft`, async () => {
			await pages[0].hover(".handle"); // Hover over "Other Game Modes"
			await waitAndClickXpath(pages[0], "//button[contains(., 'Grid')]");
			await waitAndClickSelector(pages[0], "button.swal2-confirm");

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
			const done = Array(pages.length).fill(false);
			while (done.some((d) => !d)) {
				let promises = [];
				for (let i = 0; i < pages.length; i++) {
					if (done[i]) promises.push(true);
					else promises.push(pickCard(pages[i]));
				}
				await Promise.all(promises);
				for (let i = 0; i < pages.length; i++) done[i] = done[i] || (await promises[i]);
			}
		});

		it("Close Browsers", async () => {
			await closeBrowsers();
		});
	});
});

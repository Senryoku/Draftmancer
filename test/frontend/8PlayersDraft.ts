import { beforeEach, afterEach } from "mocha";
import puppeteer, { Browser, ElementHandle, Page } from "puppeteer";
import chai from "chai";
const expect = chai.expect;
import { enableLogs, disableLogs } from "../src/common.js";
import { waitAndClickSelector, disableAnimations, testDebug } from "./src/common.js";

const debugWindowWidth = 2560 / 4;
const debugWindowHeight = 1440 / 2;

let browsers: Browser[] = [];
let pages: Page[] = [];

async function startBrowsers() {
	let promises = [];
	for (let i = 0; i < 8; i++) {
		promises.push(
			puppeteer.launch({
				headless: !testDebug,
				args: testDebug
					? [
							`--window-size=${debugWindowWidth},${debugWindowHeight}`,
							`--window-position=${(i % 4) * debugWindowWidth},${Math.floor(i / 4) * debugWindowHeight}`,
							"--mute-audio",
					  ]
					: [],
			})
		);
	}
	await Promise.all(promises);
	for (let i = 0; i < 8; i++) {
		browsers.push(await promises[i]);
		let [page] = await browsers[i].pages();
		disableAnimations(page);
		pages.push(page);
	}
	const context = browsers[0].defaultBrowserContext();
	context.overridePermissions(`http://localhost:${process.env.PORT}`, ["clipboard-read"]);
	if (testDebug) {
		for (let i = 0; i < 8; i++) {
			pages[i].setViewport({ width: debugWindowWidth, height: debugWindowHeight });
		}
	}
}

async function closeBrowsers() {
	for (let i = 0; i < 8; i++) {
		browsers[i].close();
	}
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

describe.only("Front End - 8 Players Draft", function () {
	this.timeout(100000);
	it("Starts Browsers", async function () {
		await startBrowsers();
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
		for (let i = 1; i < 8; i++) {
			promises.push(pages[i].goto(clipboard));
		}
		await Promise.all(promises);
	});

	it(`Launch Draft`, async function () {
		const [button] = (await pages[0].$x("//button[contains(., 'Start')]")) as ElementHandle<Element>[];
		expect(button).to.exist;
		await button!.click();

		let promises = [];
		for (let i = 0; i < 8; i++) {
			promises.push(
				pages[i].waitForXPath("//h2[contains(., 'Your Booster')]", {
					visible: true,
				})
			);
		}
		await Promise.all(promises);
		promises = [];
		for (let i = 0; i < 8; i++) {
			promises.push(
				pages[i].waitForXPath("//div[contains(., 'Draft Started!')]", {
					hidden: true,
				})
			);
		}
		await Promise.all(promises);
	});

	it("Each player picks a card", async function () {
		let done = [];
		for (let i = 0; i < 8; i++) {
			done.push(false);
		}
		while (done.some((d) => !d)) {
			let promises = [];
			for (let i = 0; i < 8; i++) {
				if (done[i]) promises.push(true);
				else promises.push(pickCard(pages[i]));
			}
			await Promise.all(promises);
			for (let i = 0; i < 8; i++) {
				done[i] = await promises[i];
			}
		}
	});

	it("Close Browsers", async function () {
		await closeBrowsers();
	});
});

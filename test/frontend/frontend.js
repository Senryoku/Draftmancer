import { before, after, beforeEach, afterEach, describe, it } from "mocha";
import puppeteer from "puppeteer";
import chai from "chai";
const expect = chai.expect;
import { enableLogs, disableLogs } from "../src/common.js";

let ownerBrowser;
let sessionOwnerPage;
let otherBrowser;
let otherPlayerPage;

const testDebug = true; // Display tests for debugging
const debugWindowWidth = 960;
const debugWindowHeight = 1080;

async function waitAndClickXpath(page, xpath) {
	await page.waitForXPath(xpath, {
		visible: true,
	});
	const [element] = await page.$x(xpath);
	expect(element).to.exist;
	await element.click();
}

async function waitAndClickSelector(page, selector) {
	await page.waitForSelector(selector, {
		visible: true,
	});
	const [element] = await page.$$(selector);
	expect(element).to.exist;
	await element.click();
}

function disableAnimations(page) {
	page.on("load", () => {
		const content = `
		*,
		*::after,
		*::before {
			transition-delay: 0s !important;
			transition-duration: 0s !important;
			animation-delay: -0.0001s !important;
			animation-duration: 0s !important;
			animation-play-state: paused !important;
			caret-color: transparent !important;
		}`;

		page.addStyleTag({ content });
	});
}

before(async function () {
	ownerBrowser = await puppeteer.launch({
		headless: !testDebug,
		args: testDebug
			? [`--window-size=${debugWindowWidth},${debugWindowHeight}`, `--window-position=0,0`, "--mute-audio"]
			: [],
	});
	otherBrowser = await puppeteer.launch({
		headless: !testDebug,
		args: testDebug
			? [
					`--window-size=${debugWindowWidth},${debugWindowHeight}`,
					`--window-position=${debugWindowWidth},0`,
					"--mute-audio",
			  ]
			: [],
	});
	const context = ownerBrowser.defaultBrowserContext();
	context.overridePermissions(`http://localhost:${process.env.PORT}`, ["clipboard-read"]);
	[sessionOwnerPage] = await ownerBrowser.pages();
	[otherPlayerPage] = await otherBrowser.pages();
	if (testDebug) {
		sessionOwnerPage.setViewport({ width: debugWindowWidth, height: debugWindowHeight });
		otherPlayerPage.setViewport({ width: debugWindowWidth, height: debugWindowHeight });
	}
	disableAnimations(sessionOwnerPage);
	disableAnimations(otherPlayerPage);
});

after(async function () {
	await ownerBrowser.close();
	await otherBrowser.close();
});

beforeEach(function (done) {
	disableLogs();
	done();
});

afterEach(function (done) {
	enableLogs(this.currentTest.state == "failed");
	done();
});

async function clickDraft() {
	// Click 'Draft' button
	const [button] = await sessionOwnerPage.$x("//button[contains(., 'Draft')]");
	expect(button).to.exist;
	await button.click();
}

// Returns true if the draft ended
async function pickCard(page) {
	let next = await page.waitForXPath("//div[contains(., 'Done drafting!')] | //span[contains(., 'Pick a card')]");
	let text = await page.evaluate((next) => next.innerText, next);
	if (text === "Done drafting!") return true;

	const cards = await page.$$(".booster-card");
	const card = cards[Math.floor(Math.random() * cards.length)];
	expect(card).to.exist;
	await card.click();
	await waitAndClickSelector(page, 'input[value="Confirm Pick"]');
	return false;
}

describe("Front End - Solo", function () {
	this.timeout(100000);
	it("Owner joins", async function () {
		await sessionOwnerPage.goto(`http://localhost:${process.env.PORT}`);
	});

	it(`Launch Draft with Bots`, async function () {
		await clickDraft();

		// On popup, choose 'Draft alone with bots'
		const [button2] = await sessionOwnerPage.$x("//button[contains(., 'Draft alone with bots')]");
		expect(button2).to.exist;
		await button2.click();

		await sessionOwnerPage.waitForXPath("//h2[contains(., 'Your Booster')]", {
			visible: true,
		});
		await sessionOwnerPage.waitForXPath("//div[contains(., 'Now drafting!')]", {
			hidden: true,
		});
	});

	it(`Owner picks a card`, async function () {
		await pickCard(sessionOwnerPage);
	});

	it(`...Until draft if done.`, async function () {
		while (!(await pickCard(sessionOwnerPage)));
	});
});

describe("Front End - Multi", function () {
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

	it(`Launch Draft`, async function () {
		await clickDraft();
		await sessionOwnerPage.waitForXPath("//h2[contains(., 'Your Booster')]", {
			visible: true,
		});
		await otherPlayerPage.waitForXPath("//h2[contains(., 'Your Booster')]", {
			visible: true,
		});
		await sessionOwnerPage.waitForXPath("//div[contains(., 'Now drafting!')]", {
			hidden: true,
		});
		await otherPlayerPage.waitForXPath("//div[contains(., 'Now drafting!')]", {
			hidden: true,
		});
	});

	it("Each player picks a card", async function () {
		let done = false;
		while (!done) {
			let ownerPromise = pickCard(sessionOwnerPage);
			let otherPromise = pickCard(otherPlayerPage);
			done = (await ownerPromise) && (await otherPromise);
		}
	});
});

async function pickMinesweeper(page) {
	let next = await page.waitForXPath(
		"//div[contains(., 'Done drafting!')] | //span[contains(., 'Pick a card')] | //span[contains(., 'Waiting for')]"
	);
	let text = await page.evaluate((next) => next.innerText, next);
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
		// Get session link
		await sessionOwnerPage.$$(".fa-share-square");
		await sessionOwnerPage.click(".fa-share-square");
		let clipboard = await sessionOwnerPage.evaluate(() => navigator.clipboard.readText());
		expect(clipboard).to.match(/^http:\/\/localhost:3001\/\?session=/);

		await otherPlayerPage.goto(clipboard);
	});

	it(`Select Cube`, async function () {
		await waitAndClickXpath(sessionOwnerPage, "//button[contains(., 'Settings')]");
		await waitAndClickXpath(sessionOwnerPage, "//button[contains(., 'Load Cube')]");
		await sessionOwnerPage.keyboard.press("Escape");
	});

	it(`Launch Minesweeper Draft`, async function () {
		await waitAndClickXpath(sessionOwnerPage, "//button[contains(., 'Minesweeper')]");
		await waitAndClickXpath(sessionOwnerPage, "//button[contains(., 'Minesweeper')]");
		await waitAndClickXpath(sessionOwnerPage, "//button[contains(., 'Start Minesweeper Draft')]");

		await sessionOwnerPage.waitForXPath("//h2[contains(., 'Minesweeper Draft')]", {
			visible: true,
		});
		await otherPlayerPage.waitForXPath("//h2[contains(., 'Minesweeper Draft')]", {
			visible: true,
		});
		await sessionOwnerPage.waitForXPath("//div[contains(., 'Now drafting!')]", {
			hidden: true,
		});
		await otherPlayerPage.waitForXPath("//div[contains(., 'Now drafting!')]", {
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

async function pickWinston(page) {
	let next = await page.waitForXPath(
		"//div[contains(., 'Done drafting!')] | //span[contains(., 'Your turn to pick a pile of cards!')] | //span[contains(., 'Waiting for')]"
	);
	let text = await page.evaluate((next) => next.innerText, next);
	if (text === "Done drafting!") return true;
	if (text.includes("Waiting for")) return false;

	const pickXPath = "//button[contains(., 'Take Pile')]";
	const skipXPath = "//button[contains(., 'Skip Pile')]";

	const pickOrSkip = async (depth = 0) => {
		let pick = await page.waitForXPath(pickXPath);
		let skip = await page.$x(skipXPath);
		if (skip.length === 0 || Math.random() < 0.33) {
			await pick.click();
		} else {
			await skip[0].click();
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

	it(`Launch Minesweeper Draft`, async function () {
		await waitAndClickXpath(sessionOwnerPage, "//button[contains(., 'Winston')]");
		await waitAndClickXpath(sessionOwnerPage, "//button[contains(., 'Winston')]");
		await waitAndClickXpath(sessionOwnerPage, "//button[contains(., 'Start Winston Draft')]");

		await sessionOwnerPage.waitForXPath("//h2[contains(., 'Winston Draft')]", {
			visible: true,
		});
		await otherPlayerPage.waitForXPath("//h2[contains(., 'Winston Draft')]", {
			visible: true,
		});
		await sessionOwnerPage.waitForXPath("//div[contains(., 'Now drafting!')]", {
			hidden: true,
		});
		await otherPlayerPage.waitForXPath("//div[contains(., 'Now drafting!')]", {
			hidden: true,
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

import puppeteer from "puppeteer";
import chai from "chai";
const expect = chai.expect;
import { enableLogs, disableLogs } from "./src/common.js";

let ownerBrowser;
let sessionOwnerPage;
let otherBrowser;
let otherPlayerPage;

const testDebug = true; // Display tests for debugging
const debugWindowWidth = 960;
const debugWindowHeight = 1080;

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
		args: testDebug ? [`--window-size=${debugWindowWidth},${debugWindowHeight}`, `--window-position=0,0`] : [],
	});
	otherBrowser = await puppeteer.launch({
		headless: !testDebug,
		args: testDebug
			? [`--window-size=${debugWindowWidth},${debugWindowHeight}`, `--window-position=${debugWindowWidth},0`]
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

after(function () {
	ownerBrowser.close();
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

	const [card] = await page.$$(".booster-card");
	expect(card).to.exist;
	await card.click();
	await page.waitForSelector('input[value="Confirm Pick"]', {
		visible: true,
	});
	const [button] = await page.$$('input[value="Confirm Pick"]');
	expect(button).to.exist;
	await button.click();
	return false;
}

async function pickFirstCard(page) {
	const [boosterH2] = await page.$x("//h2[contains(., 'Your Booster')]");
	expect(boosterH2).to.exist;

	await pickCard(page);
}

describe.only("Front End - Solo", function () {
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
		await pickFirstCard(sessionOwnerPage);
	});

	it(`...Until draft if done.`, async function () {
		while (!(await pickCard(sessionOwnerPage)));
	});
});

describe.only("Front End - Multi", function () {
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

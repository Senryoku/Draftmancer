import { before, after, beforeEach, afterEach } from "mocha";
import puppeteer from "puppeteer";
import chai from "chai";
const expect = chai.expect;
import { enableLogs, disableLogs } from "../../src/common.js";

export let ownerBrowser;
export let sessionOwnerPage;
export let otherBrowser;
export let otherPlayerPage;

const testDebug = true; // Display tests for debugging
const debugWindowWidth = 960;
const debugWindowHeight = 1080;

export async function waitAndClickXpath(page, xpath) {
	const element = await page.waitForXPath(xpath, {
		visible: true,
	});
	expect(element).to.exist;
	await element.click();
}

export async function waitAndClickSelector(page, selector) {
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

async function startBrowsers() {
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
}

before(async function () {
	await startBrowsers();
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

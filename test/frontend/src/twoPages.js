import { before, after, beforeEach, afterEach } from "mocha";
import puppeteer from "puppeteer";
import { enableLogs, disableLogs } from "../../src/common.js";
import { disableAnimations } from "./common.js";

export let ownerBrowser;
export let sessionOwnerPage;
export let otherBrowser;
export let otherPlayerPage;

const testDebug = true; // Display tests for debugging
const debugWindowWidth = 960;
const debugWindowHeight = 1080;

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
	// Skip the confirmation dialog when exiting/refreshing while there's a pending call to storeDraftLogs
	sessionOwnerPage.on("dialog", async (dialog) => {
		await dialog.accept();
	});
	otherPlayerPage.on("dialog", async (dialog) => {
		await dialog.accept();
	});
	disableAnimations(sessionOwnerPage);
	disableAnimations(otherPlayerPage);
}

async function closeBrowsers() {
	await ownerBrowser.close();
	await otherBrowser.close();
}

before(async function () {
	await startBrowsers();
});

after(async function () {
	await closeBrowsers();
});

beforeEach(function (done) {
	disableLogs();
	done();
});

afterEach(function (done) {
	enableLogs(this.currentTest.state == "failed");
	done();
});

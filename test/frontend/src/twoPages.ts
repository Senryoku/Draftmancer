import { before, after, beforeEach, afterEach } from "mocha";
import puppeteer, { Browser, Page } from "puppeteer";
import { enableLogs, disableLogs } from "../../src/common.js";
import { startBrowsers } from "./common.js";

export let ownerBrowser: Browser;
export let sessionOwnerPage: Page;
export let otherBrowser: Browser;
export let otherPlayerPage: Page;

async function closeBrowsers() {
	await ownerBrowser.close();
	await otherBrowser.close();
}

before(async function () {
	[[ownerBrowser, otherBrowser], [sessionOwnerPage, otherPlayerPage]] = await startBrowsers(2);
});

after(async function () {
	await closeBrowsers();
});

beforeEach(function (done) {
	disableLogs();
	done();
});

afterEach(function (done) {
	enableLogs(this.currentTest!.state == "failed");
	done();
});

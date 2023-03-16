import { beforeEach, afterEach } from "mocha";
import { Browser, ElementHandle, Page } from "puppeteer";
import chai from "chai";
const expect = chai.expect;
import { enableLogs, disableLogs } from "../src/common.js";
import { join, pickCard, PickResult } from "./src/common.js";

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
	});

	it("Each player picks a card", async function () {
		let done = [];
		for (let i = 0; i < pages.length; i++) done.push(false);
		while (done.some((d) => !d)) {
			let promises = [];
			for (let i = 0; i < pages.length; i++) {
				if (!done[i])
					promises.push(
						(async () => {
							let r: PickResult = PickResult.Waiting;
							while ((r = await pickCard(pages[i])) === PickResult.Waiting);
							return r === PickResult.Done;
						})()
					);
			}
			await Promise.all(promises);
			for (let i = 0; i < pages.length; i++) done[i] = await promises[i];
		}

		await Promise.all(browsers.map((b) => b.close()));
		browsers = pages = [];
	});
});

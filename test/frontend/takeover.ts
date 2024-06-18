import { ElementHandle } from "puppeteer";
import { expect } from "chai";
import { setupBrowsers, pages } from "./src/common.js";

describe("Takeover request", function () {
	describe("Successful takeover request", function () {
		this.timeout(200000);
		setupBrowsers(6);

		it(`User 1 takes ownership and previous owner is removed from the session.`, async function () {
			const button = await pages[1].$(".takeover");
			expect(button).to.exist;
			await button!.click();

			for (let i = 2; i < pages.length; i++) {
				const yes = (await pages[i].waitForSelector("xpath/.//*[text() = 'Yes']", {
					visible: true,
				})) as ElementHandle<Element>;
				yes?.click();
			}

			await pages[0].waitForSelector("xpath/.//*[text()[contains(., 'Removed from session')]]");
			await pages[1].waitForSelector("xpath/.//*[text()[contains(., 'Takeover request succeeded!')]]");
		});
	});

	describe("Denied takeover request", function () {
		this.timeout(200000);
		setupBrowsers(6);

		it(`Request is denied.`, async function () {
			const button = await pages[1].$(".takeover");
			expect(button).to.exist;
			await button!.click();

			const no = (await pages[2].waitForSelector("xpath/.//*[text() = 'No']", {
				visible: true,
			})) as ElementHandle<Element>;
			no?.click();

			for (let i = 3; i < pages.length; i++) {
				const yes = (await pages[i].waitForSelector("xpath/.//*[text() = 'Yes']", {
					visible: true,
				})) as ElementHandle<Element>;
				yes?.click();
			}

			await pages[1].waitForSelector("xpath/.//*[text()[contains(., 'Takeover request refused')]]");
		});
	});
});

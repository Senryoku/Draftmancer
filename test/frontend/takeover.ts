import { ElementHandle } from "puppeteer";
import chai from "chai";
const expect = chai.expect;
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
				const yes = (await pages[i].waitForXPath("//*[text() = 'Yes']", {
					visible: true,
				})) as ElementHandle<Element>;
				yes?.click();
			}

			await pages[0].waitForXPath("//*[text()[contains(., 'Removed from session')]]");
			await pages[1].waitForXPath("//*[text()[contains(., 'Takeover request succeeded!')]]");
		});
	});

	describe("Denied takeover request", function () {
		this.timeout(200000);
		setupBrowsers(6);

		it(`Request is denied.`, async function () {
			const button = await pages[1].$(".takeover");
			expect(button).to.exist;
			await button!.click();

			const no = (await pages[2].waitForXPath("//*[text() = 'No']", {
				visible: true,
			})) as ElementHandle<Element>;
			no?.click();

			for (let i = 3; i < pages.length; i++) {
				const yes = (await pages[i].waitForXPath("//*[text() = 'Yes']", {
					visible: true,
				})) as ElementHandle<Element>;
				yes?.click();
			}

			await pages[1].waitForXPath("//*[text()[contains(., 'Takeover request refused')]]");
		});
	});
});

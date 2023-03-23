import { describe, it } from "mocha";
import chai from "chai";
const expect = chai.expect;
import { getSessionLink, pages, setupBrowsers, waitAndClickXpath } from "./src/common.js";
import { Page } from "puppeteer";
import { getRandom } from "../../src/utils.js";

async function pickWinchester(page: Page) {
	let next = await page.waitForXPath(
		"//span[contains(., 'Your turn to pick a pile of cards!')] | //span[contains(., 'Waiting for')]"
	);
	let text = await page.evaluate((next) => (next as HTMLElement).innerText, next);
	if (text.includes("Waiting for")) return false;

	const choices = await page.$$(".winchester-pick");
	if (choices.length === 0) return false;
	const choice = getRandom(choices);
	choice.click();

	return choices.length === 1;
}

describe("Winchester Draft", function () {
	describe("Winchester Draft - Simple", function () {
		this.timeout(20000);
		setupBrowsers(2);

		it(`Launch Winchester Draft`, async function () {
			await pages[0].hover(".handle"); // Hover over "Other Game Modes"
			await waitAndClickXpath(pages[0], "//button[contains(., 'Winchester')]");
			await waitAndClickXpath(pages[0], "//button[contains(., 'Start Winchester Draft')]");

			await Promise.all([
				...pages.map((page) =>
					page.waitForXPath("//h2[contains(., 'Winchester Draft')]", {
						visible: true,
					})
				),
				...pages.map((page) =>
					page.waitForXPath("//*[contains(., 'Draft Started')]", {
						hidden: true,
					})
				),
			]);
		});

		it(`Pick until done.`, async function () {
			this.timeout(100000);
			let done = false;
			while (!done) {
				done = (await pickWinchester(pages[0])) || (await pickWinchester(pages[1]));
			}
		});
	});

	describe("Winchester Draft - 4 Players", function () {
		this.timeout(20000);
		setupBrowsers(4);

		it(`Launch Winchester Draft`, async function () {
			await pages[0].hover(".handle"); // Hover over "Other Game Modes"
			await waitAndClickXpath(pages[0], "//button[contains(., 'Winchester')]");
			await waitAndClickXpath(pages[0], "//button[contains(., 'Start Winchester Draft')]");

			await Promise.all([
				...pages.map((page) =>
					page.waitForXPath("//h2[contains(., 'Winchester Draft')]", {
						visible: true,
					})
				),
				...pages.map((page) =>
					page.waitForXPath("//*[contains(., 'Draft Started')]", {
						hidden: true,
					})
				),
			]);
		});

		it(`Pick until done.`, async function () {
			this.timeout(100000);
			let done = false;
			while (!done) {
				done = (await Promise.all(pages.map(async (p) => await pickWinchester(p)))).some((v) => v);
			}
			await new Promise((r) => setTimeout(r, 10000));
		});
	});

	describe("Winchester Draft - With disconnects", function () {
		let sessionLink: string;
		this.timeout(20000);
		setupBrowsers(2);

		it(`Launch Winchester Draft`, async function () {
			sessionLink = await getSessionLink(pages[0]);
			await pages[0].hover(".handle"); // Hover over "Other Game Modes"
			await waitAndClickXpath(pages[0], "//button[contains(., 'Winchester')]");
			await waitAndClickXpath(pages[0], "//button[contains(., 'Start Winchester Draft')]");

			await Promise.all([
				...pages.map((page) =>
					page.waitForXPath("//h2[contains(., 'Winchester Draft')]", {
						visible: true,
					})
				),
				...pages.map((page) =>
					page.waitForXPath("//*[contains(., 'Draft Started')]", {
						hidden: true,
					})
				),
			]);
		});

		it(`Couple of picks.`, async function () {
			await Promise.all(pages.map(pickWinchester));
			await new Promise((resolve) => setTimeout(resolve, 25));
			await Promise.all(pages.map(pickWinchester));
			await new Promise((resolve) => setTimeout(resolve, 25));
			await Promise.all(pages.map(pickWinchester));
		});

		it("Player 0 refreshes the page", async function () {
			await pages[0].goto("about:blank", { waitUntil: ["domcontentloaded"] });
			await pages[0].goto(sessionLink, { waitUntil: ["domcontentloaded"] });
			await pages[0].waitForXPath("//*[contains(., 'Reconnected')]", {
				hidden: true,
			});
		});

		it(`Couple of picks.`, async function () {
			await Promise.all(pages.map(pickWinchester));
			await new Promise((resolve) => setTimeout(resolve, 25));
			await Promise.all(pages.map(pickWinchester));
			await new Promise((resolve) => setTimeout(resolve, 25));
			await Promise.all(pages.map(pickWinchester));
		});

		it("Player 1 refreshes the page", async function () {
			await pages[1].reload({ waitUntil: ["domcontentloaded"] });
			await pages[1].waitForXPath("//*[contains(., 'Reconnected')]", {
				hidden: true,
			});
		});

		it(`Couple of picks.`, async function () {
			await Promise.all(pages.map(pickWinchester));
			await new Promise((resolve) => setTimeout(resolve, 25));
			await Promise.all(pages.map(pickWinchester));
			await new Promise((resolve) => setTimeout(resolve, 25));
			await Promise.all(pages.map(pickWinchester));
		});

		it("Both player disconnect at the same time", async function () {
			await pages[0].goto("about:blank", { waitUntil: ["domcontentloaded"] });
			await pages[1].goto("about:blank", { waitUntil: ["domcontentloaded"] });
			await new Promise((r) => setTimeout(r, 100));

			await pages[0].goto(sessionLink, { waitUntil: ["domcontentloaded"] });
			await pages[1].goto(sessionLink, { waitUntil: ["domcontentloaded"] });
			await Promise.all(
				pages.map((p) =>
					p.waitForXPath("//*[contains(., 'Reconnected')]", {
						hidden: true,
					})
				)
			);
		});

		it(`Pick until done.`, async function () {
			this.timeout(100000);
			let done = false;
			while (!done) {
				done = (await pickWinchester(pages[0])) || (await pickWinchester(pages[1]));
			}
		});
	});
});

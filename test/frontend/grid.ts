import { Browser, Page } from "puppeteer";
import chai from "chai";
const expect = chai.expect;
import {
	waitAndClickSelector,
	startBrowsers,
	waitAndClickXpath,
	getSessionLink,
	join,
	setupBrowsers,
	pages,
} from "./src/common.js";
import { getRandom } from "../../src/utils.js";

async function pickCard(page: Page) {
	let next = await page.waitForXPath(
		"//div[contains(., 'Done drafting!')] | //span[contains(., 'your turn')] | //span[contains(., 'Advancing')]"
	);
	let text = await page.evaluate((next) => (next as HTMLElement).innerText, next);
	if (text === "Done drafting!") return true;
	while (text.includes("Advancing")) {
		await new Promise((r) => setTimeout(r, 10));
		next = await page.waitForXPath(
			"//div[contains(., 'Done drafting!')] | //span[contains(., 'your turn')] | //span[contains(., 'Advancing')]"
		);
		text = await page.evaluate((next) => (next as HTMLElement).innerText, next);
	}
	if (text === "Done drafting!") return true;
	let choices = [];
	// Yuk.
	do {
		choices = await page.$$(`.pick-col i:not([style*="display: none"])`);
		choices.push(...(await page.$$(`.pick-row i:not([style*="display: none"])`)));
		await new Promise((r) => setTimeout(r, 20));
	} while (choices.length === 0);
	const choice = await getRandom(choices);
	expect(choice).to.exist;
	await choice.click();
	return false;
}

describe("Grid Draft", () => {
	describe("Grid Draft - 2 Players", function () {
		this.timeout(20000);
		setupBrowsers(2);

		it(`Launch Draft`, async () => {
			await pages[0].hover(".handle"); // Hover over "Other Game Modes"
			console.error("Hovered");
			await new Promise((r) => setTimeout(r, 250));
			await waitAndClickXpath(pages[0], "//button[contains(., 'Grid')]");
			console.error("Clicked");
			await new Promise((r) => setTimeout(r, 250));
			await waitAndClickSelector(pages[0], "button.swal2-confirm");
			console.error("Confirmed");

			await Promise.all(
				pages.map((page) => page.waitForXPath("//h2[contains(., 'Grid Draft')]", { timeout: 3000 }))
			);
			let promises = [];
			for (const page of pages) {
				if ((await page.$x("//div[contains(., 'Draft Started!')]")).length > 0)
					promises.push(
						page.waitForXPath("//div[contains(., 'Draft Started!')]", {
							hidden: true,
							timeout: 10000,
						})
					);
			}
			await Promise.all(promises);
		});

		it("Each player picks a card", async function () {
			this.timeout(50000);
			const done = Array(pages.length).fill(false);
			while (done.some((d) => !d)) {
				let promises = [];
				for (let i = 0; i < pages.length; i++) {
					if (done[i]) promises.push(true);
					else promises.push(pickCard(pages[i]));
				}
				await Promise.all(promises);
				for (let i = 0; i < pages.length; i++) done[i] = done[i] || (await promises[i]);
			}
		});
	});

	describe("Grid Draft - 3 Players", function () {
		this.timeout(10000);
		setupBrowsers(2);

		it(`Launch Draft`, async () => {
			await pages[0].hover(".handle"); // Hover over "Other Game Modes"
			await waitAndClickXpath(pages[0], "//button[contains(., 'Grid')]");
			await waitAndClickSelector(pages[0], "button.swal2-confirm");

			let promises = [];
			for (const page of pages)
				promises.push(
					page.waitForXPath("//div[contains(., 'Draft Started!')]", {
						hidden: true,
						timeout: 10000,
					})
				);
			await Promise.all(promises);
		});

		it("Each player picks a card", async function () {
			this.timeout(100000);
			const done: boolean[] = Array(pages.length).fill(false);
			while (done.some((d) => !d)) {
				let promises = [];
				for (let i = 0; i < pages.length; i++) {
					if (done[i]) promises.push(true);
					else promises.push(pickCard(pages[i]));
				}
				await Promise.all(promises);
				for (let i = 0; i < pages.length; i++) done[i] = done[i] || (await promises[i]);
			}
		});
	});
});

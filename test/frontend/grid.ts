import { Page } from "puppeteer";
import { expect } from "chai";
import { waitAndClickSelector, waitAndClickXpath, setupBrowsers, pages, launchMode } from "./src/common.js";
import { getRandom } from "../../src/utils.js";

async function pickCard(page: Page) {
	const draftInProgress = await page.$x("//div[contains(., 'Grid Draft')]");
	if (draftInProgress.length === 0) return true;

	let next;
	try {
		next = await page.waitForXPath(
			"//div[contains(., 'Done drafting!')] | //span[contains(., 'your turn')] | //span[contains(., 'Advancing')]",
			{ timeout: 1000 }
		);
	} catch (e) {
		return false;
	}

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
		choices = await page.$$(`.pick-col svg:not([style*="display: none"])`);
		choices.push(...(await page.$$(`.pick-row svg:not([style*="display: none"])`)));
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
			await launchMode("Grid");
			await waitAndClickXpath(pages[0], "//button[contains(., 'Start Grid Draft')]");

			await Promise.all(
				pages.map((page) => page.waitForXPath("//h2[contains(., 'Grid Draft')]", { timeout: 3000 }))
			);
			const promises = [];
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
				const promises = [];
				for (let i = 0; i < pages.length; i++) {
					if (done[i]) promises.push(true);
					else promises.push(pickCard(pages[i]));
				}
				await Promise.all(promises);
				for (let i = 0; i < pages.length; i++) done[i] = done[i] || (await promises[i]);
			}
		});
	});

	describe("Grid Draft - 2 Players with Two Picks per Grid", function () {
		this.timeout(20000);
		setupBrowsers(2);

		it(`Launch Draft`, async () => {
			await launchMode("Grid");
			await waitAndClickSelector(pages[0], "#two-picks-input");
			await waitAndClickXpath(pages[0], "//button[contains(., 'Start Grid Draft')]");

			await Promise.all(
				pages.map((page) => page.waitForXPath("//h2[contains(., 'Grid Draft')]", { timeout: 3000 }))
			);
			const promises = [];
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
				const promises = [];
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
		setupBrowsers(3);

		it(`Launch Draft`, async () => {
			await launchMode("Grid");
			await waitAndClickXpath(pages[0], "//button[contains(., 'Start Grid Draft')]");

			const promises = [];
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
				const promises = [];
				for (let i = 0; i < pages.length; i++) {
					if (done[i]) promises.push(true);
					else promises.push(pickCard(pages[i]));
				}
				await Promise.all(promises);
				for (let i = 0; i < pages.length; i++) done[i] = done[i] || (await promises[i]);
			}
		});
	});

	describe("Grid Draft - 4 Players", function () {
		this.timeout(10000);
		setupBrowsers(4);

		it(`Launch Draft`, async () => {
			await launchMode("Grid");
			await waitAndClickXpath(pages[0], "//button[contains(., 'Start Grid Draft')]");

			const promises = [];
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
				const promises = [];
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

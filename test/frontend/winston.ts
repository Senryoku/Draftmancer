import { describe, it } from "mocha";
import chai from "chai";
const expect = chai.expect;
import { getSessionLink, join, waitAndClickXpath } from "./src/common.js";
import { Browser, ElementHandle, Page } from "puppeteer";

async function pickWinston(page: Page) {
	let next = await page.waitForXPath(
		"//div[contains(., 'Done drafting!')] | //span[contains(., 'Your turn to pick a pile of cards!')] | //span[contains(., 'Waiting for')]"
	);
	let text = await page.evaluate((next) => (next as HTMLElement).innerText, next);
	if (text === "Done drafting!") return true;
	if (text.includes("Waiting for")) return false;

	const pickOrSkip = async (depth = 0) => {
		const pickXPath = "//button[contains(., 'Take Pile')]";
		const skipXPath = "//button[contains(., 'Skip Pile')]";
		let pick = await page.waitForXPath(pickXPath);
		expect(pick).to.be.not.null;
		let skip = await page.$x(skipXPath);
		if (skip.length === 0 || Math.random() < 0.33) {
			await (pick as ElementHandle<HTMLElement>).click();
		} else {
			expect(skip[0]).to.be.not.null;
			await (skip[0] as ElementHandle<HTMLElement>).click();
			if (depth < 2) {
				await pickOrSkip(++depth);
			} else {
				await waitAndClickXpath(page, "//button[contains(., 'OK')]"); // Dismiss card
			}
		}
	};
	await pickOrSkip();

	return false;
}

describe("Winston Draft", function () {
	let browsers: Browser[] = [];
	let pages: Page[] = [];
	this.timeout(20000);

	it("Launch And Join", async function () {
		[browsers, pages] = await join(2);
	});

	it(`Launch Winston Draft`, async function () {
		await waitAndClickXpath(pages[0], "//button[contains(., 'Winston')]");
		await waitAndClickXpath(pages[0], "//button[contains(., 'Winston')]");
		await waitAndClickXpath(pages[0], "//button[contains(., 'Start Winston Draft')]");

		await Promise.all(
			pages.map((page) =>
				page.waitForXPath("//h2[contains(., 'Winston Draft')]", {
					visible: true,
				})
			)
		);
	});

	it(`Pick until done.`, async function () {
		this.timeout(100000);
		let done = false;
		while (!done) {
			let ownerPromise = pickWinston(pages[0]);
			let otherPromise = pickWinston(pages[1]);
			done = (await ownerPromise) && (await otherPromise);
		}

		await Promise.all(browsers.map((b) => b.close()));
		browsers = pages = [];
	});
});

describe("Winston Draft with disconnects", function () {
	let browsers: Browser[] = [];
	let pages: Page[] = [];
	let sessionLink: string;
	this.timeout(20000);

	it("Launch And Join", async function () {
		[browsers, pages] = await join(2);
		sessionLink = await getSessionLink(pages[0]);
	});

	it(`Launch Winston Draft`, async function () {
		await waitAndClickXpath(pages[0], "//button[contains(., 'Winston')]");
		await waitAndClickXpath(pages[0], "//button[contains(., 'Winston')]");
		await waitAndClickXpath(pages[0], "//button[contains(., 'Start Winston Draft')]");

		await Promise.all(
			pages.map((page) =>
				page.waitForXPath("//h2[contains(., 'Winston Draft')]", {
					visible: true,
				})
			)
		);
	});

	it(`Couple of picks.`, async function () {
		await Promise.all(pages.map((page) => pickWinston(page)));
		await Promise.all(pages.map((page) => pickWinston(page)));
		await Promise.all(pages.map((page) => pickWinston(page)));
	});

	it("Player 0 refreshes the page", async function () {
		await pages[0].goto("about:blank", { waitUntil: ["domcontentloaded"] });
		await pages[0].goto(sessionLink, { waitUntil: ["domcontentloaded"] });
		await pages[0].waitForXPath("//div[contains(., 'Reconnected')]", {
			hidden: true,
		});
	});

	it(`Couple of picks.`, async function () {
		await Promise.all(pages.map((page) => pickWinston(page)));
		await Promise.all(pages.map((page) => pickWinston(page)));
		await Promise.all(pages.map((page) => pickWinston(page)));
	});

	it("Player 1 refreshes the page", async function () {
		await pages[1].reload({ waitUntil: ["domcontentloaded"] });
		await pages[1].waitForXPath("//div[contains(., 'Reconnected')]", {
			hidden: true,
		});
	});

	it(`Couple of picks.`, async function () {
		await Promise.all(pages.map((page) => pickWinston(page)));
		await Promise.all(pages.map((page) => pickWinston(page)));
		await Promise.all(pages.map((page) => pickWinston(page)));
	});

	it("Both player disconnect at the same time", async function () {
		await pages[0].goto("about:blank", { waitUntil: ["domcontentloaded"] });
		await pages[1].goto("about:blank", { waitUntil: ["domcontentloaded"] });
		await new Promise((r) => setTimeout(r, 100));

		await pages[0].goto(sessionLink, { waitUntil: ["domcontentloaded"] });
		await pages[0].waitForXPath("//div[contains(., 'Reconnected')]", {
			hidden: true,
		});
		await pages[1].goto(sessionLink, { waitUntil: ["domcontentloaded"] });
		await pages[1].waitForXPath("//div[contains(., 'Reconnected')]", {
			hidden: true,
		});
	});

	it(`Pick until done.`, async function () {
		this.timeout(100000);
		let done = false;
		while (!done) {
			let ownerPromise = pickWinston(pages[0]);
			let otherPromise = pickWinston(pages[1]);
			done = (await ownerPromise) && (await otherPromise);
		}

		await Promise.all(browsers.map((b) => b.close()));
		browsers = pages = [];
	});
});

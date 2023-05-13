import { describe, it } from "mocha";
import chai from "chai";
const expect = chai.expect;
import { getSessionLink, launchMode, pages, setupBrowsers, waitAndClickXpath } from "./src/common.js";
import { ElementHandle, Page } from "puppeteer";

async function pickWinston(page: Page, forceDepth?: number) {
	const next = await page.waitForXPath(
		"//div[contains(., 'Done drafting!')] | //span[contains(., 'Your turn to pick a pile of cards!')] | //span[contains(., 'Waiting for')]"
	);
	const text = await page.evaluate((next) => (next as HTMLElement).innerText, next);
	if (text === "Done drafting!") return true;
	if (text.includes("Waiting for")) return false;

	const pickOrSkip = async (depth = 0) => {
		const pickXPath = "//button[contains(., 'Take Pile')]";
		const skipXPath = "//button[contains(., 'Skip Pile')]";
		const pick = await page.waitForXPath(pickXPath);
		expect(pick).to.be.not.null;
		const skip = await page.$x(skipXPath);
		if (
			skip.length === 0 ||
			(forceDepth !== undefined && forceDepth === depth) ||
			(forceDepth === undefined && Math.random() < 0.33)
		) {
			await (pick as ElementHandle<HTMLElement>).click();
		} else {
			expect(skip[0]).to.be.not.null;
			await (skip[0] as ElementHandle<HTMLElement>).click();
			if (depth < 2) {
				await pickOrSkip(++depth);
			} else {
				const swalOK = await page.$x("//button[contains(., 'OK')]");
				if (swalOK.length > 0) (swalOK[0] as ElementHandle<HTMLElement>).click(); // Dismiss card popup
			}
		}
	};
	await pickOrSkip();

	return false;
}

describe("Winston Draft", function () {
	this.timeout(20000);
	setupBrowsers(2);

	it(`Launch Winston Draft`, async function () {
		await launchMode("Winston");
		await waitAndClickXpath(pages[0], "//button[contains(., 'Start Winston Draft')]");

		await Promise.all(
			pages.map((page) =>
				page.waitForXPath("//h2[contains(., 'Winston Draft')]", {
					visible: true,
				})
			)
		);
	});

	it(`should be able to pick the first pile.`, async function () {
		const ownerPromise = pickWinston(pages[0], 0);
		const otherPromise = pickWinston(pages[1], 0);
		await Promise.all([ownerPromise, otherPromise]);
	});

	it(`should be able to pick the second pile.`, async function () {
		const ownerPromise = pickWinston(pages[0], 1);
		const otherPromise = pickWinston(pages[1], 1);
		await Promise.all([ownerPromise, otherPromise]);
	});

	it(`should be able to pick the third pile.`, async function () {
		const ownerPromise = pickWinston(pages[0], 2);
		const otherPromise = pickWinston(pages[1], 2);
		await Promise.all([ownerPromise, otherPromise]);
	});

	it(`should be able to skip all piles and draw.`, async function () {
		const ownerPromise = pickWinston(pages[0], -1);
		const otherPromise = pickWinston(pages[1], -1);
		await Promise.all([ownerPromise, otherPromise]);
	});

	it(`Pick until done.`, async function () {
		this.timeout(100000);
		let done = false;
		while (!done) {
			const ownerPromise = pickWinston(pages[0]);
			const otherPromise = pickWinston(pages[1]);
			done = (await ownerPromise) && (await otherPromise);
		}
	});
});

describe("Winston Draft with disconnects", function () {
	let sessionLink: string;
	this.timeout(20000);
	setupBrowsers(2);

	it(`Launch Winston Draft`, async function () {
		sessionLink = await getSessionLink(pages[0]);
		await launchMode("Winston");
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
			const ownerPromise = pickWinston(pages[0]);
			const otherPromise = pickWinston(pages[1]);
			done = (await ownerPromise) && (await otherPromise);
		}
	});
});

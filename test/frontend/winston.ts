import { describe, it } from "mocha";
import { expect } from "chai";
import { getSessionLink, launchMode, pages, setupBrowsers, waitAndClickXpath } from "./src/common.js";
import { ElementHandle, Page } from "puppeteer";

async function pickWinston(page: Page, forceDepth?: number) {
	const drafting = await page.$x("//h2[contains(., 'Winston Draft')]");
	if (drafting.length === 0) return true;

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
			await new Promise((resolve) => setTimeout(resolve, 100));
			if (depth < 2) {
				await pickOrSkip(depth + 1);
			} else {
				const swalOK = await page.waitForXPath("//button[contains(., 'OK')]");
				(swalOK as ElementHandle<HTMLElement>).click(); // Dismiss card popup
			}
		}
	};
	await pickOrSkip();

	return false;
}

describe("Winston Draft", function () {
	for (let playerCount = 2; playerCount <= 4; ++playerCount)
		describe(`Winston Draft - ${playerCount} players`, function () {
			this.timeout(20000);
			setupBrowsers(playerCount);

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
				await Promise.all(pages.map((p) => pickWinston(p, 0)));
			});

			it(`should be able to pick the second pile.`, async function () {
				await Promise.all(pages.map((p) => pickWinston(p, 1)));
			});

			it(`should be able to pick the third pile.`, async function () {
				await Promise.all(pages.map((p) => pickWinston(p, 2)));
			});

			it(`should be able to skip all piles and draw.`, async function () {
				await Promise.all(pages.map((p) => pickWinston(p, -1)));
			});

			it(`Pick until done.`, async function () {
				this.timeout(100000);
				let done = false;
				while (!done) {
					done = (await Promise.all(pages.map((p) => pickWinston(p)))).every((b) => b);
					await new Promise((resolve) => setTimeout(resolve, 100));
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
				await new Promise((resolve) => setTimeout(resolve, 100));
			}
		});
	});
});

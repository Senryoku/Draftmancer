import { describe, it } from "mocha";
import { expect } from "chai";
import { getSessionLink, launchMode, pages, setupBrowsers, waitAndClickXpath } from "./src/common.js";
import { ElementHandle, Page } from "puppeteer";

async function pickWinston(page: Page, forceDepth?: number) {
	const drafting = await page.$$("xpath/.//h2[contains(., 'Winston Draft')]");
	if (drafting.length === 0) return true;

	const next = await page.waitForSelector(
		"xpath/.//div[contains(., 'Done drafting!')] | //span[contains(., 'Your turn to pick a pile of cards!')] | //span[contains(., 'Waiting for')]"
	);
	const text = await page.evaluate((next) => (next as HTMLElement).innerText, next);
	if (text === "Done drafting!") return true;
	if (text.includes("Waiting for")) return false;

	const pileCount = (await page.$$(".winston-pile")).length;

	const pickOrSkip = async (depth = 0) => {
		const pickXPath = "xpath/.//button[contains(., 'Take Pile')]";
		const skipXPath = "xpath/.//button[contains(., 'Skip Pile')]";
		const pick = await page.waitForSelector(pickXPath);
		expect(pick).to.be.not.null;
		const skip = await page.$$(skipXPath);
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
			if (depth < pileCount - 1) {
				await pickOrSkip(depth + 1);
			} else {
				const swalOK = await page.waitForSelector("xpath/.//button[contains(., 'OK')]");
				(swalOK as ElementHandle<HTMLElement>).click(); // Dismiss card popup
			}
		}
	};
	await pickOrSkip();

	return false;
}

describe("Winston Draft", function () {
	for (let pileCount = 2; pileCount <= 4; ++pileCount)
		for (let playerCount = 2; playerCount <= 4; ++playerCount)
			describe(`Winston Draft - ${playerCount} players, ${pileCount} piles`, function () {
				this.timeout(20000);
				setupBrowsers(playerCount);

				it(`Launch Winston Draft`, async function () {
					await launchMode("Winston");
					await waitAndClickXpath(pages[0], "//button[contains(., 'Start Winston Draft')]");

					await Promise.all(
						pages.map((page) =>
							page.waitForSelector("xpath/.//h2[contains(., 'Winston Draft')]", {
								visible: true,
							})
						)
					);
				});

				for (let pile = 0; pile < pileCount; ++pile) {
					it(`should be able to pick the pile ${pile}.`, async function () {
						await Promise.all(pages.map((p) => pickWinston(p, pile)));
					});
				}

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
					page.waitForSelector("xpath/.//h2[contains(., 'Winston Draft')]", {
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
			await pages[0].waitForSelector("xpath/.//div[contains(., 'Reconnected')]", {
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
			await pages[1].waitForSelector("xpath/.//div[contains(., 'Reconnected')]", {
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
			await pages[0].waitForSelector("xpath/.//div[contains(., 'Reconnected')]", {
				hidden: true,
			});
			await pages[1].goto(sessionLink, { waitUntil: ["domcontentloaded"] });
			await pages[1].waitForSelector("xpath/.//div[contains(., 'Reconnected')]", {
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

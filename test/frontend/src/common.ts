import chai from "chai";
import fs from "fs";
const expect = chai.expect;
import puppeteer, { Browser, ElementHandle, Page } from "puppeteer";

export const Headless = process.env.HEADLESS === "TRUE" ? true : false;
const DebugScreenWidth = 2560;
const DebugScreenHeight = 1440;

export async function waitAndClickXpath(page: Page, xpath: string) {
	const element = await page.waitForXPath(xpath, {
		visible: true,
	});
	expect(element).to.exist;
	await (element as ElementHandle<Element>).click();
}

export async function waitAndClickSelector(page: Page, selector: string) {
	await page.waitForSelector(selector, {
		visible: true,
	});
	const [element] = await page.$$(selector);
	expect(element).to.exist;
	await element.click();
}

export function disableAnimations(page: Page) {
	page.on("load", () => {
		const content = `
		*,
		*::after,
		*::before {
			transition-delay: 0s !important;
			transition-duration: 0s !important;
			animation-delay: -0.0001s !important;
			animation-duration: 0s !important;
			animation-play-state: paused !important;
			caret-color: transparent !important;
		}`;

		page.addStyleTag({ content });
	});
}

const cardbackImage = fs.readFileSync("./client/src/assets/img/cardback.webp");

export async function startBrowsers(count: number): Promise<[Browser[], Page[]]> {
	const rows = count > 2 ? 2 : 1;
	const cols = Math.ceil(count / rows);
	const debugWindowWidth = Math.floor(DebugScreenWidth / cols);
	const debugWindowHeight = Math.floor(DebugScreenHeight / rows);

	let promises = [];
	const puppeteerArgs = ["--mute-audio"];
	if (Headless) puppeteerArgs.push(`--window-size=1366,768`);
	else puppeteerArgs.push(`--window-size=${debugWindowWidth},${debugWindowHeight}`);

	for (let i = 0; i < count; i++) {
		promises.push(
			puppeteer.launch({
				headless: Headless,
				args: Headless
					? puppeteerArgs
					: [
							...puppeteerArgs,
							`--window-position=${(i % cols) * debugWindowWidth},${
								Math.floor(i / cols) * debugWindowHeight
							}`,
					  ],
			})
		);
	}
	await Promise.all(promises);
	const browsers: Browser[] = [];
	const pages: Page[] = [];
	for (let i = 0; i < count; i++) {
		browsers.push(await promises[i]);
		let [page] = await browsers[i].pages();
		disableAnimations(page);
		pages.push(page);
	}
	const context = browsers[0].defaultBrowserContext();
	context.overridePermissions(`http://localhost:${process.env.PORT}`, ["clipboard-read"]);

	if (!Headless) for (const page of pages) page.setViewport({ width: debugWindowWidth, height: debugWindowHeight });
	else for (const page of pages) page.setViewport({ width: 1366, height: 768 });

	for (const page of pages) {
		// Skip the confirmation dialog when exiting/refreshing while there's a pending call to storeDraftLogs
		page.on("dialog", async (dialog) => {
			await dialog.accept();
		});

		// Avoid requests to scryfall in headless mode by proxying all card images to the local cardback image
		if (Headless) {
			await page.setRequestInterception(true);
			page.on("request", (request) => {
				if (["image"].indexOf(request.resourceType()) !== -1 && request.url().indexOf("scryfall.io") !== -1) {
					request.respond({
						status: 200,
						body: cardbackImage,
					});
					return;
				}
				request.continue();
			});
		}
	}
	return [browsers, pages];
}

export async function dismissToast(page: Page) {
	// Dismiss toast notification by clicking on it.
	await waitAndClickSelector(page, ".swal2-toast");
}

export async function getSessionLink(page: Page): Promise<string> {
	await page.$$(".fa-share-square");
	await page.click(".fa-share-square");
	const clipboard = await page.evaluate(() => navigator.clipboard.readText());
	expect(clipboard).to.match(/^http:\/\/localhost:3001\/\?session=/);
	await dismissToast(page);
	await page.waitForXPath("//div[contains(., 'Session link copied to clipboard!')]", {
		hidden: true,
	});
	return clipboard;
}

export async function join(players: number): Promise<[Browser[], Page[]]> {
	const [browsers, pages] = await startBrowsers(players);
	await pages[0].goto(`http://localhost:${process.env.PORT}`);
	const clipboard = await getSessionLink(pages[0]);
	let promises = [];
	for (let idx = 1; idx < pages.length; ++idx) promises.push(pages[idx].goto(clipboard));
	await Promise.all(promises);
	return [browsers, pages];
}

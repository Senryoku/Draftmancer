import chai from "chai";
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

export async function startBrowsers(count: number): Promise<[Browser[], Page[]]> {
	const rows = count > 2 ? 2 : 1;
	const cols = Math.ceil(count / rows);
	const debugWindowWidth = Math.floor(DebugScreenWidth / cols);
	const debugWindowHeight = Math.floor(DebugScreenHeight / rows);

	let promises = [];
	for (let i = 0; i < count; i++) {
		promises.push(
			puppeteer.launch({
				headless: Headless,
				args: !Headless
					? [
							`--window-size=${debugWindowWidth},${debugWindowHeight}`,
							`--window-position=${(i % cols) * debugWindowWidth},${
								Math.floor(i / cols) * debugWindowHeight
							}`,
							"--mute-audio",
					  ]
					: [],
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
	for (const page of pages) {
		// Skip the confirmation dialog when exiting/refreshing while there's a pending call to storeDraftLogs
		page.on("dialog", async (dialog) => {
			await dialog.accept();
		});
	}
	return [browsers, pages];
}

export async function getSessionLink(page: Page): Promise<string> {
	await page.$$(".fa-share-square");
	await page.click(".fa-share-square");
	const clipboard = await page.evaluate(() => navigator.clipboard.readText());
	expect(clipboard).to.match(/^http:\/\/localhost:3001\/\?session=/);
	// Dismiss toast notification by clicking on it.
	await waitAndClickSelector(page, ".swal2-toast");
	await page.waitForXPath("//div[contains(., 'Session link copied to clipboard!')]", {
		hidden: true,
	});
	return clipboard;
}

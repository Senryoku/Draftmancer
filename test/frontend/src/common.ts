import chai from "chai";
import fs from "fs";
const expect = chai.expect;
import puppeteer, { Browser, ElementHandle, Page, BoundingBox } from "puppeteer";

export const Headless = process.env.HEADLESS === "TRUE" ? true : false;
const DebugScreenWidth = 2560;
const DebugScreenHeight = 1440;

import installMouseHelper from "./mouse-helper.js";

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
		} else {
			// Display mouse position for debugging.
			await installMouseHelper(page);
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

// Built-in drag & drop function of puppeteer do not fire all necessary events. So, yeah.
export async function dragAndDrop(
	page: Page,
	sourceSelector: string,
	destinationSelector: string,
	waitTime: number = 0
) {
	const sourceElement = (await page.waitForSelector(sourceSelector))!;
	const destinationElement = (await page.waitForSelector(destinationSelector))!;

	const sourceBox = (await sourceElement.boundingBox())!;
	const destinationBox = (await destinationElement.boundingBox())!;

	await page.evaluate(
		async (ss: string, ds: string, sb: BoundingBox, db: BoundingBox, waitTime: number) => {
			const sleep = (milliseconds: number) => {
				return new Promise((resolve) => setTimeout(resolve, milliseconds));
			};
			const source = document.querySelector(ss)!;
			const destination = document.querySelector(ds)!;

			const sourceX = sb.x + sb.width / 2;
			const sourceY = sb.y + sb.height / 2;
			const destinationX = db.x + db.width / 2;
			const destinationY = db.y + db.height / 2;

			const srcEvt = {
				bubbles: true,
				cancelable: true,
				screenX: sourceX,
				screenY: sourceY,
				clientX: sourceX,
				clientY: sourceY,
			};

			source.dispatchEvent(new MouseEvent("mousemove", srcEvt));
			await sleep(waitTime);
			source.dispatchEvent(new MouseEvent("mousedown", srcEvt));
			await sleep(waitTime);
			const dataTransfer = new DataTransfer();
			dataTransfer.effectAllowed = "all";
			dataTransfer.dropEffect = "none";
			(dataTransfer.files as any) = [];
			source.dispatchEvent(
				new DragEvent("dragstart", {
					dataTransfer,
					...srcEvt,
				})
			);

			await sleep(waitTime);

			const dstEvt = {
				bubbles: true,
				cancelable: true,
				screenX: destinationX,
				screenY: destinationY,
				clientX: destinationX,
				clientY: destinationY,
			};

			await sleep(waitTime);
			destination.dispatchEvent(
				new DragEvent("dragover", {
					...dstEvt,
					dataTransfer,
				})
			);
			await sleep(waitTime);
			destination.dispatchEvent(
				new DragEvent("drop", {
					...dstEvt,
					dataTransfer,
				})
			);
			await sleep(waitTime);
			source.dispatchEvent(new DragEvent("dragend", dstEvt));
		},
		sourceSelector,
		destinationSelector,
		sourceBox,
		destinationBox,
		waitTime
	);
}

// Returns true if the draft ended
export async function pickCard(page: Page) {
	const done = await page.$$("xpath///h2[contains(., 'Done drafting!')]");
	if (done.length > 0) return true;
	const waiting = await page.$$(".booster-waiting");
	if (waiting.length > 0) return false;
	const cards = await page.$$(".booster:not(.booster-waiting) .booster-card");
	if (cards.length === 0) return false;

	const card = cards[Math.floor(Math.random() * cards.length)];
	expect(card).to.exist;
	await card.click();
	await waitAndClickSelector(page, 'input[value="Confirm Pick"]');
	return false;
}

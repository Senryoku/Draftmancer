import { beforeEach, afterEach } from "mocha";
import puppeteer from "puppeteer";
import chai from "chai";
const expect = chai.expect;
import { enableLogs, disableLogs } from "../src/common.js";
import { disableAnimations, waitAndClickXpath } from "./src/common.js";

const testDebug = true; // Display tests for debugging
const debugWindowWidth = Math.floor(2560 / 3);
const debugWindowHeight = 1440 / 2;

let browsers = [];
let pages = [];

async function startBrowsers(count = 6) {
	let promises = [];
	for (let i = 0; i < count; i++) {
		promises.push(
			puppeteer.launch({
				headless: !testDebug,
				args: testDebug
					? [
							`--window-size=${debugWindowWidth},${debugWindowHeight}`,
							`--window-position=${(i % (count / 2)) * debugWindowWidth},${
								Math.floor(i / (count / 2)) * debugWindowHeight
							}`,
							"--mute-audio",
					  ]
					: [],
			})
		);
	}
	await Promise.all(promises);
	for (let i = 0; i < promises.length; i++) {
		browsers.push(await promises[i]);
		let [page] = await browsers[i].pages();
		disableAnimations(page);
		pages.push(page);
	}
	const context = browsers[0].defaultBrowserContext();
	context.overridePermissions(`http://localhost:${process.env.PORT}`, ["clipboard-read"]);
	if (testDebug) {
		for (let i = 0; i < pages.length; i++) {
			pages[i].setViewport({ width: debugWindowWidth, height: debugWindowHeight });
		}
	}
}

async function closeBrowsers() {
	for (let i = 0; i < browsers.length; i++) {
		browsers[i].close();
	}
}

beforeEach(function (done) {
	disableLogs();
	done();
});

afterEach(function (done) {
	enableLogs(this.currentTest.state == "failed");
	done();
});

async function pickCard(page, random = false) {
	let next = await page.waitForXPath("//div[contains(., 'Team Sealed stopped!')] | //span[contains(., 'Card Pool')]");
	let text = await page.evaluate((next) => next.innerText, next);
	if (text === "Team Sealed stopped!") return true;

	const cards = await page.$$(".team-sealed-container .card:not(.team-sealed-picked)");
	const card = cards[random ? Math.floor(Math.random() * cards.length) : 0];
	expect(card).to.exist;
	await card.click();
	await page.waitForFunction(
		(el) => {
			return el.classList.contains("team-sealed-picked");
		},
		{},
		card
	);
	return false;
}

describe("Front End - Team Sealed", function () {
	this.timeout(100000);
	it("Starts Browsers", async function () {
		await startBrowsers();
	});

	it("Owner joins", async function () {
		await pages[0].goto(`http://localhost:${process.env.PORT}`);
	});

	it(`Other Players joins the session`, async function () {
		// Get session link
		await pages[0].$$(".fa-share-square");
		await pages[0].click(".fa-share-square");
		let clipboard = await pages[0].evaluate(() => navigator.clipboard.readText());
		expect(clipboard).to.match(/^http:\/\/localhost:3001\/\?session=/);

		let promises = [];
		for (let i = 1; i < pages.length; i++) {
			promises.push(pages[i].goto(clipboard));
		}
		await Promise.all(promises);
	});

	it(`Launch Draft`, async function () {
		await waitAndClickXpath(pages[0], "//button[contains(., 'Team Sealed')]");
		await waitAndClickXpath(pages[0], "//button[contains(., 'Team Sealed')]");
		await waitAndClickXpath(pages[0], "//button[contains(., 'Distribute Boosters')]");

		let promises = [];
		for (let i = 0; i < pages.length; i++) {
			promises.push(
				pages[i].waitForXPath("//h2[contains(., 'Card Pool')]", {
					visible: true,
				})
			);
		}
		await Promise.all(promises);
		promises = [];
		for (let i = 0; i < pages.length; i++) {
			promises.push(
				pages[i].waitForXPath("//div[contains(., 'Team Sealed started!')]", {
					hidden: true,
				})
			);
		}
		await Promise.all(promises);
	});

	it("Each player picks the first card available", async function () {
		for (let i = 0; i < pages.length; i++) await pickCard(pages[i]);
	});

	it("Each player picks 9 more cards randomly", async function () {
		for (let c = 0; c < 9; c++) for (let i = 0; i < pages.length; i++) await pickCard(pages[i], true);
	});

	it("Player 0 tries to pick an unavailable card, receives an error.", async function () {
		const cards = await pages[0].$$(".team-sealed-container .card.team-sealed-picked");
		const card = cards[1]; // Should have been picked by the next player
		expect(card).to.exist;
		await card.click();
		await pages[0].waitForXPath("//h2[contains(., 'Card Unavailable')]", {
			visible: true,
		});
		await waitAndClickXpath(pages[0], "//button[contains(., 'OK')]");
		await pages[0].waitForXPath("//h2[contains(., 'Card Unavailable')]", {
			hidden: true,
		});
	});

	it("Player 0 returns a card.", async function () {
		const cards = await pages[0].$$(".team-sealed-container .card.team-sealed-picked");
		const card = cards[0]; // Should have been picked by player 0
		expect(card).to.exist;
		await card.click();
		await pages[0].waitForFunction(
			(el) => {
				return !el.classList.contains("team-sealed-picked");
			},
			{},
			card
		);
	});

	it("Owner stops the event", async function () {
		await waitAndClickXpath(pages[0], "//button[contains(., 'Stop')]");
		await waitAndClickXpath(pages[0], "//button[contains(., 'Stop the game!')]");
		let promises = [];
		for (let i = 0; i < pages.length; i++) {
			promises.push(
				pages[i].waitForXPath("//div[contains(., 'Team Sealed stopped!')]", {
					visible: true,
				})
			);
		}
		await Promise.all(promises);
	});

	it("Close Browsers", async function () {
		await closeBrowsers();
	});
});

import { describe, it } from "mocha";
import chai from "chai";
const expect = chai.expect;
import { waitAndClickXpath, waitAndClickSelector, getSessionLink, join } from "./src/common.js";
import { Browser, ElementHandle, Page } from "puppeteer";

async function clickDraft(page: Page) {
	// Click 'Start' button
	const [button] = (await page.$x("//button[contains(., 'Start')]")) as ElementHandle<Element>[];
	expect(button).to.exist;
	await button.click();
}

// Returns true if the draft ended
async function pickCard(page: Page) {
	let next = await page.waitForXPath("//div[contains(., 'Done drafting!')] | //span[contains(., 'Pick a card')]");
	let text = await page.evaluate((next) => (next as HTMLElement).innerText, next);
	if (text === "Done drafting!") return true;

	const waiting = await page.$(".booster-waiting");
	if (waiting) return false;

	await page.waitForSelector(".booster:not(.booster-waiting) .booster-card");
	const cards = await page.$$(".booster-card");
	const card = cards[Math.floor(Math.random() * cards.length)];
	expect(card).to.exist;
	await card.click();
	await waitAndClickSelector(page, 'input[value="Confirm Pick"]');
	return false;
}

describe("Front End - Solo", function () {
	this.timeout(100000);
	let browsers: Browser[];
	let pages: Page[];
	it("Owner joins", async function () {
		[browsers, pages] = await join(1);
	});

	it(`Launch Draft with Bots`, async function () {
		await clickDraft(pages[0]);

		// On popup, choose 'Draft alone with bots'
		const [button2] = (await pages[0].$x(
			"//button[contains(., 'Draft alone with 7 bots')]"
		)) as ElementHandle<Element>[];
		expect(button2).to.exist;
		await button2.click();

		await pages[0].waitForXPath("//h2[contains(., 'Your Booster')]", {
			visible: true,
		});
		await pages[0].waitForXPath("//div[contains(., 'Draft Started!')]", {
			hidden: true,
		});
	});

	it(`Owner picks a card`, async function () {
		await pickCard(pages[0]);
	});

	it(`...Until draft if done.`, async function () {
		while (!(await pickCard(pages[0])));

		await Promise.all(browsers.map((b) => b.close()));
	});
});

describe("Front End - Multi", function () {
	this.timeout(100000);

	let browsers: Browser[];
	let pages: Page[];
	it("Launch and Join", async function () {
		[browsers, pages] = await join(2);
	});

	it(`Launch Draft`, async function () {
		await clickDraft(pages[0]);
		await pages[0].waitForXPath("//h2[contains(., 'Your Booster')]", {
			visible: true,
		});
		await pages[1].waitForXPath("//h2[contains(., 'Your Booster')]", {
			visible: true,
		});
		await pages[0].waitForXPath("//div[contains(., 'Draft Started!')]", {
			hidden: true,
		});
		await pages[1].waitForXPath("//div[contains(., 'Draft Started!')]", {
			hidden: true,
		});
	});

	it("Each player picks a card", async function () {
		let done = false;
		while (!done) {
			let ownerPromise = pickCard(pages[0]);
			let otherPromise = pickCard(pages[1]);
			done = (await ownerPromise) && (await otherPromise);
		}

		await Promise.all(browsers.map((b) => b.close()));
	});
});

describe("Front End - Multi, with bots", function () {
	this.timeout(100000);
	let browsers: Browser[];
	let pages: Page[];
	it("Launch and Join", async function () {
		[browsers, pages] = await join(2);
	});

	it("Owner sets the bot count to 6", async function () {
		await pages[0].focus("#bots");
		await pages[0].keyboard.type("6");
		await pages[0].keyboard.press("Enter");
	});

	it(`Launch Draft`, async function () {
		await clickDraft(pages[0]);
		await pages[0].waitForXPath("//h2[contains(., 'Your Booster')]", {
			visible: true,
		});
		await pages[1].waitForXPath("//h2[contains(., 'Your Booster')]", {
			visible: true,
		});
		await pages[0].waitForXPath("//div[contains(., 'Draft Started!')]", {
			hidden: true,
		});
		await pages[1].waitForXPath("//div[contains(., 'Draft Started!')]", {
			hidden: true,
		});
	});

	it("Each player picks cards until the end.", async function () {
		let done = false;
		while (!done) {
			const ownerPromise = pickCard(pages[0]);
			const otherPromise = pickCard(pages[1]);
			done = (await ownerPromise) && (await otherPromise);
		}

		await Promise.all(browsers.map((b) => b.close()));
	});
});

describe("Front End - Multi, with Spectator", function () {
	this.timeout(100000);
	let browsers: Browser[];
	let pages: Page[];
	it("Launch and Join", async function () {
		[browsers, pages] = await join(2);
	});

	it(`Select Spectator mode and adds a bot`, async function () {
		await waitAndClickXpath(pages[0], "//button[contains(., 'Settings')]");
		await waitAndClickSelector(pages[0], "#is-owner-player");
		await pages[0].keyboard.press("Escape");

		let input = await pages[0].waitForSelector("#bots");
		expect(input, "Could not find bots input").to.exist;
		await input!.click({ clickCount: 3 }); // Focus and select all text
		await pages[0].keyboard.type("1");
		await pages[0].keyboard.press("Enter");
	});

	it(`Launch Draft`, async function () {
		await clickDraft(pages[0]);
		await pages[1].waitForXPath("//h2[contains(., 'Your Booster')]", {
			visible: true,
		});
		await pages[1].waitForXPath("//div[contains(., 'Draft Started!')]", {
			hidden: true,
		});
	});

	it(`Spectator clicks on a player`, async function () {
		await waitAndClickSelector(pages[0], ".player-name");
	});

	it("Active player picks cards until the end of the draft.", async function () {
		while (!(await pickCard(pages[1])));

		await Promise.all(browsers.map((b) => b.close()));
	});
});

describe("Front End - Multi, with disconnects", function () {
	this.timeout(100000);
	let sessionLink: string;
	let browsers: Browser[];
	let pages: Page[];
	it("Launch and Join", async function () {
		[browsers, pages] = await join(2);
		sessionLink = await getSessionLink(pages[0]);
	});

	it("Owner joins and set the bot count to 6", async function () {
		await pages[0].focus("#bots");
		await pages[0].keyboard.type("6");
		await pages[0].keyboard.press("Enter");
	});

	it(`Launch Draft`, async function () {
		await clickDraft(pages[0]);
		await Promise.all(
			pages.map((page) =>
				page.waitForXPath("//h2[contains(., 'Your Booster')]", {
					visible: true,
				})
			)
		);
		await Promise.all(
			pages.map((page) =>
				page.waitForXPath("//div[contains(., 'Draft Started!')]", {
					hidden: true,
				})
			)
		);
	});

	it("Each player picks a card", async function () {
		await pickCard(pages[0]);
		await pickCard(pages[1]);
	});

	it("Owner refreshes the page", async function () {
		await pages[0].goto(sessionLink, { waitUntil: ["networkidle0", "domcontentloaded"] });
		await pages[0].waitForXPath("//div[contains(., 'Reconnected')]", {
			hidden: true,
		});
	});

	it("Each player picks a card", async function () {
		await pickCard(pages[0]);
		await pickCard(pages[1]);
	});

	it("Player refreshes the page", async function () {
		await pages[1].reload({ waitUntil: ["networkidle0", "domcontentloaded"] });
		await pages[1].waitForXPath("//div[contains(., 'Reconnected')]", {
			hidden: true,
		});
	});

	it("Each player picks a card", async function () {
		await pickCard(pages[0]);
		await pickCard(pages[1]);
	});

	it("Both players disconnect", async function () {
		await pages[0].goto("about:blank", { waitUntil: ["networkidle0", "domcontentloaded"] });
		await pages[1].goto("about:blank", { waitUntil: ["networkidle0", "domcontentloaded"] });

		await new Promise((r) => setTimeout(r, 250));

		await pages[0].goto(sessionLink, { waitUntil: ["networkidle0", "domcontentloaded"] });
		await pages[1].goto(sessionLink, { waitUntil: ["networkidle0", "domcontentloaded"] });

		await pages[0].waitForXPath("//div[contains(., 'Reconnected')]", {
			hidden: true,
		});
		await pages[1].waitForXPath("//div[contains(., 'Reconnected')]", {
			hidden: true,
		});
	});

	it("Each player picks a card", async function () {
		await pickCard(pages[0]);
		await pickCard(pages[1]);
	});

	it("Other player disconnects, and owner replaces them with a bot.", async function () {
		await pages[1].goto("about:blank", { waitUntil: ["networkidle0", "domcontentloaded"] });
		await new Promise((r) => setTimeout(r, 100));
		await waitAndClickXpath(pages[0], "//button[contains(., 'Replace')]");
	});

	it("Owner picks a couple of cards", async function () {
		await pickCard(pages[0]);
		await pickCard(pages[0]);
		await pickCard(pages[0]);
		await pickCard(pages[0]);
	});

	it("Player reconnects", async function () {
		await pages[1].goto(sessionLink, { waitUntil: ["networkidle0", "domcontentloaded"] });
		await pages[1].waitForXPath("//div[contains(., 'Reconnected')]", {
			hidden: true,
		});
	});

	it("Each player picks a card", async function () {
		await pickCard(pages[0]);
		await pickCard(pages[1]);
	});

	it("Owner disconnects, new owner replaces them with a bot.", async function () {
		await pages[0].goto("about:blank", { waitUntil: ["networkidle0", "domcontentloaded"] });
		await new Promise((r) => setTimeout(r, 100));
		await waitAndClickXpath(pages[1], "//button[contains(., 'Replace')]");
	});

	it("New owner finished the draft alone.", async function () {
		while (!(await pickCard(pages[1])));

		await Promise.all(browsers.map((b) => b.close()));
		browsers = pages = [];
	});
});

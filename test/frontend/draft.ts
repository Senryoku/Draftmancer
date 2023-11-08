import { describe, it } from "mocha";
import chai from "chai";
const expect = chai.expect;
import {
	waitAndClickXpath,
	waitAndClickSelector,
	getSessionLink,
	dragAndDrop,
	dismissToast,
	pickCard,
	PickResult,
	setupBrowsers,
	pages,
	replaceInput,
} from "./src/common.js";
import { ElementHandle, Page } from "puppeteer";
import { simulateRestart } from "../../src/Persistence.js";
import { latestSetCardPerBooster } from "../src/common.js";

async function clickDraft(page: Page) {
	// Click 'Start' button
	const [button] = (await page.$x("//button[contains(., 'Start')]")) as ElementHandle<Element>[];
	expect(button).to.exist;
	await button.click();
}

async function deckHasNCard(page: Page | ElementHandle<Element>, n: number) {
	await page.waitForXPath(`//h2[contains(., 'Deck (${n}')]`, { timeout: 2000 });
}

async function sideHasNCard(page: Page | ElementHandle<Element>, n: number) {
	await page.waitForXPath(`//h2[contains(., 'Sideboard (${n})')]`, { timeout: 2000 });
}

describe("Front End - Solo", function () {
	this.timeout(100000);
	setupBrowsers(1);

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

	let expectedCardsInDeck = 0;
	let expectedCardsInSideboard = 0;

	it(`Owner picks a card`, async function () {
		while ((await pickCard(pages[0])) !== PickResult.Picked);
		++expectedCardsInDeck;
	});

	it(`Owner picks cards by drag drop`, async function () {
		const deckColumns = await pages[0].$$(".deck .card-column.drag-column");
		await deckHasNCard(pages[0], expectedCardsInDeck);
		for (let i = 0; i < deckColumns.length; ++i) {
			await pages[0].waitForSelector(".booster:not(.booster-waiting) .booster-card");
			const cards = await pages[0].$$(".booster-card");
			const card = cards[Math.floor(Math.random() * cards.length)];
			expect(card).to.exist;
			await dragAndDrop(pages[0], `.booster-card`, `.deck .card-column.drag-column:nth-child(${i + 1})`);
			++expectedCardsInDeck;
			await deckHasNCard(pages[0], expectedCardsInDeck);
		}
	});

	it(`Owner picks cards by drag drop into collapsed sideboard`, async function () {
		await pages[0].waitForSelector(".booster:not(.booster-waiting) .booster-card");
		await sideHasNCard(pages[0], expectedCardsInSideboard);
		await dragAndDrop(pages[0], `.booster-card`, `.collapsed-sideboard .card-column.drag-column`);
		++expectedCardsInSideboard;
		await sideHasNCard(pages[0], expectedCardsInSideboard);
	});

	it(`Owner picks cards by drag drop into sideboard`, async function () {
		const maximize = await pages[0].waitForSelector(".collapsed-sideboard .controls .fa-window-maximize");
		expect(maximize).to.exist;
		await maximize!.click();
		await sideHasNCard(pages[0], expectedCardsInSideboard);
		await dragAndDrop(pages[0], `.booster-card`, `.sideboard .card-column.drag-column:nth-child(1)`);
		++expectedCardsInSideboard;
		await sideHasNCard(pages[0], expectedCardsInSideboard);
		await dragAndDrop(pages[0], `.booster-card`, `.sideboard .card-column.drag-column:nth-child(2)`);
		++expectedCardsInSideboard;
		await sideHasNCard(pages[0], expectedCardsInSideboard);
		const minimize = await pages[0].waitForSelector(".sideboard .controls .fa-table-columns");
		expect(minimize).to.exist;
		await minimize!.click();
	});

	it(`Owner moves cards from sideboard to deck by click`, async function () {
		const card = await pages[0].waitForSelector(`.collapsed-sideboard .card`);
		expect(card).to.exist;
		card!.click();
		++expectedCardsInDeck;
		--expectedCardsInSideboard;
		await deckHasNCard(pages[0], expectedCardsInDeck);
		await sideHasNCard(pages[0], expectedCardsInSideboard);
	});

	it(`Owner moves cards from deck to sideboard by click`, async function () {
		const card = await pages[0].waitForSelector(`.deck .card-column.drag-column:nth-child(1) .card`);
		expect(card).to.exist;
		card!.click();
		--expectedCardsInDeck;
		++expectedCardsInSideboard;
		await deckHasNCard(pages[0], expectedCardsInDeck);
		await sideHasNCard(pages[0], expectedCardsInSideboard);
	});

	// FIXME: I don't know why the drag & drop doesn't work there.
	it.skip(`Owner moves cards from sideboard to deck by drag & drop`, async function () {
		await dragAndDrop(pages[0], `.collapsed-sideboard .card`, `.deck .card-column.drag-column:nth-child(1)`, 500);
		++expectedCardsInDeck;
		--expectedCardsInSideboard;
		await deckHasNCard(pages[0], expectedCardsInDeck);
		await sideHasNCard(pages[0], expectedCardsInSideboard);
	});
	// FIXME: I don't know why the drag & drop doesn't work there.
	it.skip(`Owner moves cards from deck to sideboard by drag & drop`, async function () {
		await dragAndDrop(
			pages[0],
			`.deck .card-column.drag-column:nth-child(2) .card`,
			`.collapsed-sideboard .card-column.drag-column`
		);
		--expectedCardsInDeck;
		++expectedCardsInSideboard;
		await deckHasNCard(pages[0], expectedCardsInDeck);
		await sideHasNCard(pages[0], expectedCardsInSideboard);
	});

	it(`...Until draft if done.`, async function () {
		let r: PickResult = PickResult.Waiting;
		while (r !== PickResult.Done) {
			r = await pickCard(pages[0]);
			if (r === PickResult.Picked) {
				++expectedCardsInDeck;
				await deckHasNCard(pages[0], expectedCardsInDeck);
			}
		}
		await dismissToast(pages[0]);
	});

	it(`Should have received a game log.`, async function () {
		const gameLogs = (await pages[0].waitForXPath(`//button[contains(., 'Game Logs')]`)) as ElementHandle<Element>;
		expect(gameLogs).to.exist;
		await gameLogs.click();

		const log = await pages[0].waitForSelector(".log");
		expect(log).to.exist;
		const logControls = await log!.waitForSelector(".log-controls");
		expect(logControls).to.exist;
		logControls!.click();
		await sideHasNCard(log!, expectedCardsInSideboard);
	});

	// FIXME: For some reason the last pick isn't there while testing, but I can't replicate
	//        this problem outside of puppeteer.
	it.skip(`Check number of cards in deck in draft log.`, async function () {
		const log = await pages[0].waitForSelector(".log");
		await deckHasNCard(log!, expectedCardsInDeck);
	});
});

describe("Front End - Multi", function () {
	this.timeout(100000);
	setupBrowsers(2);

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
			const ownerPromise = pickCard(pages[0]);
			const otherPromise = pickCard(pages[1]);
			done = (await ownerPromise) === PickResult.Done && (await otherPromise) === PickResult.Done;
		}
	});
});

describe("Front End - Multi, Tournament Timer", function () {
	this.timeout(100000);
	setupBrowsers(2);

	it(`Select the Tournament Timer Setting`, async function () {
		await waitAndClickXpath(pages[0], "//button[contains(., 'Settings')]");
		await waitAndClickSelector(pages[0], "#tournament-timer");
		await pages[0].keyboard.press("Escape");
	});

	it(`Launch Draft`, async function () {
		await clickDraft(pages[0]);
		await pages[0].waitForXPath("//h2[contains(., 'Your Booster')]", {
			visible: true,
		});
		await pages[1].waitForXPath("//h2[contains(., 'Your Booster')]", {
			visible: true,
		});
		// Timer should start at 40
		await pages[0].waitForXPath("//span[contains(., '40')]", {
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
			const ownerPromise = pickCard(pages[0]);
			const otherPromise = pickCard(pages[1]);
			done = (await ownerPromise) === PickResult.Done && (await otherPromise) === PickResult.Done;
		}
	});
});

describe("Front End - Multi, Review Timer", function () {
	let sessionLink: string;
	this.timeout(100000);
	setupBrowsers(2);

	it(`Adjust the Review Timer Setting`, async function () {
		sessionLink = await getSessionLink(pages[0]);
		await waitAndClickXpath(pages[0], "//button[contains(., 'Settings')]");
		await replaceInput("5")(await pages[0].waitForSelector("#review-timer"));
		await replaceInput("5")(await pages[0].waitForSelector("#boosters-per-player"));
		await waitAndClickSelector(pages[0], "#hide-picks");
		await pages[0].keyboard.press("Escape");
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

	it(`Each player picks ${latestSetCardPerBooster} cards`, async function () {
		const picks = [0, 0];
		while (picks[0] !== latestSetCardPerBooster && picks[1] !== latestSetCardPerBooster) {
			if ((await pickCard(pages[0])) === PickResult.Picked) picks[0]++;
			if ((await pickCard(pages[1])) === PickResult.Picked) picks[1]++;
		}
	});

	it("We should now be in a review phase", async function () {
		this.timeout(10000);
		await pages[1].waitForXPath("//*[contains(., 'Review Phase')]", {
			hidden: false,
		});
		// Wait for it to end
		await pages[1].waitForXPath("//*[contains(., 'Review Phase')]", {
			hidden: true,
		});
	});

	it(`Each player picks ${latestSetCardPerBooster} cards`, async function () {
		const picks = [0, 0];
		while (picks[0] !== latestSetCardPerBooster && picks[1] !== latestSetCardPerBooster) {
			if ((await pickCard(pages[0])) === PickResult.Picked) picks[0]++;
			if ((await pickCard(pages[1])) === PickResult.Picked) picks[1]++;
		}
	});

	it("We should now be in a review phase", async function () {
		await pages[1].waitForXPath("//*[contains(., 'Review Phase')]", {
			hidden: false,
		});
	});

	it("One player disconnects and reconnects", async function () {
		await pages[1].goto("about:blank", { waitUntil: ["networkidle0", "domcontentloaded"] });
		await new Promise((r) => setTimeout(r, 250));
		await pages[1].goto(sessionLink, { waitUntil: ["networkidle0", "domcontentloaded"] });
		await pages[1].waitForXPath("//div[contains(., 'Reconnected')]", {
			hidden: true,
		});
	});

	it("We should still be in a review phase", async function () {
		this.timeout(10000);
		await pages[1].waitForXPath("//*[contains(., 'Review Phase')]", {
			hidden: false,
		});
		// Wait for it to end
		await pages[1].waitForXPath("//*[contains(., 'Review Phase')]", {
			hidden: true,
		});
	});

	it(`Each player picks ${latestSetCardPerBooster} cards`, async function () {
		const picks = [0, 0];
		while (picks[0] !== latestSetCardPerBooster && picks[1] !== latestSetCardPerBooster) {
			if ((await pickCard(pages[0])) === PickResult.Picked) picks[0]++;
			if ((await pickCard(pages[1])) === PickResult.Picked) picks[1]++;
		}
	});

	it("We should now be in a review phase", async function () {
		await pages[1].waitForXPath("//*[contains(., 'Review Phase')]", {
			hidden: false,
		});
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

	it("We should still be in a review phase", async function () {
		this.timeout(10000);
		await pages[1].waitForXPath("//*[contains(., 'Review Phase')]", {
			hidden: false,
		});
		// Wait for it to end
		await pages[1].waitForXPath("//*[contains(., 'Review Phase')]", {
			hidden: true,
		});
	});

	it(`Each player picks ${latestSetCardPerBooster} cards`, async function () {
		const picks = [0, 0];
		while (picks[0] !== latestSetCardPerBooster && picks[1] !== latestSetCardPerBooster) {
			if ((await pickCard(pages[0])) === PickResult.Picked) picks[0]++;
			if ((await pickCard(pages[1])) === PickResult.Picked) picks[1]++;
		}
	});

	it("We should now be in a review phase", async function () {
		await pages[1].waitForXPath("//*[contains(., 'Review Phase')]", {
			hidden: false,
		});
	});

	it("Simulate server restart", async function () {
		await simulateRestart();
		await pages[0].goto(sessionLink, { waitUntil: ["networkidle0", "domcontentloaded"] });
		await pages[1].goto(sessionLink, { waitUntil: ["networkidle0", "domcontentloaded"] });
	});

	it("We should still be in a review phase", async function () {
		this.timeout(10000);
		await pages[1].waitForXPath("//*[contains(., 'Review Phase')]", {
			hidden: false,
		});
		// Wait for it to end
		await pages[1].waitForXPath("//*[contains(., 'Review Phase')]", {
			hidden: true,
		});
	});

	it("Draft should end normally", async function () {
		let done = false;
		while (!done) {
			const ownerPromise = pickCard(pages[0]);
			const otherPromise = pickCard(pages[1]);
			done = (await ownerPromise) === PickResult.Done && (await otherPromise) === PickResult.Done;
		}
	});
});

describe("Front End - Multi, with bots", function () {
	this.timeout(100000);
	setupBrowsers(2);

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
			done = (await ownerPromise) === PickResult.Done && (await otherPromise) === PickResult.Done;
		}
	});
});

describe("Front End - Multi, with Spectator", function () {
	this.timeout(100000);
	setupBrowsers(2);

	it(`Select Spectator mode and adds a bot`, async function () {
		await waitAndClickXpath(pages[0], "//button[contains(., 'Settings')]");
		await waitAndClickSelector(pages[0], "#is-owner-player");
		await pages[0].keyboard.press("Escape");

		const input = await pages[0].waitForSelector("#bots");
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
		while ((await pickCard(pages[1])) !== PickResult.Done);
	});
});

describe("Front End - Multi, with disconnects", function () {
	this.timeout(100000);
	let sessionLink: string;
	setupBrowsers(2);

	it("Owner joins and set the bot count to 6", async function () {
		sessionLink = await getSessionLink(pages[0]);
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
		while ((await pickCard(pages[0])) !== PickResult.Picked);
		while ((await pickCard(pages[1])) !== PickResult.Picked);
	});

	it("Owner refreshes the page", async function () {
		await pages[0].goto(sessionLink, { waitUntil: ["networkidle0", "domcontentloaded"] });
		await pages[0].waitForXPath("//div[contains(., 'Reconnected')]", {
			hidden: true,
		});
	});

	it("Each player picks a card", async function () {
		while ((await pickCard(pages[0])) !== PickResult.Picked);
		while ((await pickCard(pages[1])) !== PickResult.Picked);
	});

	it("Player refreshes the page", async function () {
		await pages[1].reload({ waitUntil: ["networkidle0", "domcontentloaded"] });
		await pages[1].waitForXPath("//div[contains(., 'Reconnected')]", {
			hidden: true,
		});
	});

	it("Each player picks a card", async function () {
		while ((await pickCard(pages[0])) !== PickResult.Picked);
		while ((await pickCard(pages[1])) !== PickResult.Picked);
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
		while ((await pickCard(pages[0])) !== PickResult.Picked);
		while ((await pickCard(pages[1])) !== PickResult.Picked);
	});

	it("Other player disconnects, and owner replaces them with a bot.", async function () {
		await pages[1].goto("about:blank", { waitUntil: ["networkidle0", "domcontentloaded"] });
		await new Promise((r) => setTimeout(r, 100));
		await waitAndClickXpath(pages[0], "//button[contains(., 'Replace')]");
	});

	it("Owner picks a couple of cards", async function () {
		while ((await pickCard(pages[0])) !== PickResult.Picked);
		while ((await pickCard(pages[0])) !== PickResult.Picked);
		while ((await pickCard(pages[0])) !== PickResult.Picked);
		while ((await pickCard(pages[0])) !== PickResult.Picked);
	});

	it("Player reconnects", async function () {
		await pages[1].goto(sessionLink, { waitUntil: ["networkidle0", "domcontentloaded"] });
		await pages[1].waitForXPath("//div[contains(., 'Reconnected')]", {
			hidden: true,
		});
	});

	it("Each player picks a card", async function () {
		while ((await pickCard(pages[0])) !== PickResult.Picked);
		while ((await pickCard(pages[1])) !== PickResult.Picked);
	});

	it("Owner disconnects, new owner replaces them with a bot.", async function () {
		await pages[0].goto("about:blank", { waitUntil: ["networkidle0", "domcontentloaded"] });
		await new Promise((r) => setTimeout(r, 100));
		await waitAndClickXpath(pages[1], "//button[contains(., 'Replace')]");
	});

	it("New owner finished the draft alone.", async function () {
		while ((await pickCard(pages[1])) !== PickResult.Done);
	});
});

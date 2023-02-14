import { describe, it } from "mocha";
import chai from "chai";
const expect = chai.expect;
import { sessionOwnerPage, otherPlayerPage } from "./src/twoPages.js";
import { waitAndClickXpath, waitAndClickSelector } from "./src/common.js";

async function clickDraft() {
	// Click 'Start' button
	const [button] = await sessionOwnerPage.$x("//button[contains(., 'Start')]");
	expect(button).to.exist;
	await button.click();
}

// Returns true if the draft ended
async function pickCard(page) {
	let next = await page.waitForXPath("//div[contains(., 'Done drafting!')] | //span[contains(., 'Pick a card')]");
	let text = await page.evaluate((next) => next.innerText, next);
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
	it("Owner joins", async function () {
		await sessionOwnerPage.goto(`http://localhost:${process.env.PORT}`);
	});

	it(`Launch Draft with Bots`, async function () {
		await clickDraft();

		// On popup, choose 'Draft alone with bots'
		const [button2] = await sessionOwnerPage.$x("//button[contains(., 'Draft alone with 7 bots')]");
		expect(button2).to.exist;
		await button2.click();

		await sessionOwnerPage.waitForXPath("//h2[contains(., 'Your Booster')]", {
			visible: true,
		});
		await sessionOwnerPage.waitForXPath("//div[contains(., 'Now drafting!')]", {
			hidden: true,
		});
	});

	it(`Owner picks a card`, async function () {
		await pickCard(sessionOwnerPage);
	});

	it(`...Until draft if done.`, async function () {
		while (!(await pickCard(sessionOwnerPage)));
	});
});

describe("Front End - Multi", function () {
	this.timeout(100000);
	it("Owner joins", async function () {
		await sessionOwnerPage.goto(`http://localhost:${process.env.PORT}`);
	});

	it(`Another Player joins the session`, async function () {
		// Get session link
		await sessionOwnerPage.$$(".fa-share-square");
		await sessionOwnerPage.click(".fa-share-square");
		let clipboard = await sessionOwnerPage.evaluate(() => navigator.clipboard.readText());
		expect(clipboard).to.match(/^http:\/\/localhost:3001\/\?session=/);

		await otherPlayerPage.goto(clipboard);
	});

	it(`Launch Draft`, async function () {
		await clickDraft();
		await sessionOwnerPage.waitForXPath("//h2[contains(., 'Your Booster')]", {
			visible: true,
		});
		await otherPlayerPage.waitForXPath("//h2[contains(., 'Your Booster')]", {
			visible: true,
		});
		await sessionOwnerPage.waitForXPath("//div[contains(., 'Now drafting!')]", {
			hidden: true,
		});
		await otherPlayerPage.waitForXPath("//div[contains(., 'Now drafting!')]", {
			hidden: true,
		});
	});

	it("Each player picks a card", async function () {
		let done = false;
		while (!done) {
			let ownerPromise = pickCard(sessionOwnerPage);
			let otherPromise = pickCard(otherPlayerPage);
			done = (await ownerPromise) && (await otherPromise);
		}
	});
});

describe("Front End - Multi, with bots", function () {
	this.timeout(100000);
	it("Owner joins and set the bot count to 6", async function () {
		await sessionOwnerPage.goto(`http://localhost:${process.env.PORT}`);
		await sessionOwnerPage.focus("#bots");
		await sessionOwnerPage.keyboard.type("6");
		await sessionOwnerPage.keyboard.press("Enter");
	});

	it(`Another Player joins the session`, async function () {
		// Get session link
		await sessionOwnerPage.$$(".fa-share-square");
		await sessionOwnerPage.click(".fa-share-square");
		let clipboard = await sessionOwnerPage.evaluate(() => navigator.clipboard.readText());
		expect(clipboard).to.match(/^http:\/\/localhost:3001\/\?session=/);

		await otherPlayerPage.goto(clipboard);
	});

	it(`Launch Draft`, async function () {
		await clickDraft();
		await sessionOwnerPage.waitForXPath("//h2[contains(., 'Your Booster')]", {
			visible: true,
		});
		await otherPlayerPage.waitForXPath("//h2[contains(., 'Your Booster')]", {
			visible: true,
		});
		await sessionOwnerPage.waitForXPath("//div[contains(., 'Now drafting!')]", {
			hidden: true,
		});
		await otherPlayerPage.waitForXPath("//div[contains(., 'Now drafting!')]", {
			hidden: true,
		});
	});

	it("Each player picks a card", async function () {
		let done = false;
		while (!done) {
			let ownerPromise = pickCard(sessionOwnerPage);
			let otherPromise = pickCard(otherPlayerPage);
			done = (await ownerPromise) && (await otherPromise);
			await sessionOwnerPage.waitForTimeout(150);
		}
	});
});

describe("Front End - Multi, with Spectator", function () {
	this.timeout(100000);
	it("Owner joins", async function () {
		await sessionOwnerPage.goto(`http://localhost:${process.env.PORT}`);
	});

	it(`Another Player joins the session`, async function () {
		// Get session link
		await sessionOwnerPage.$$(".fa-share-square");
		await sessionOwnerPage.click(".fa-share-square");
		let clipboard = await sessionOwnerPage.evaluate(() => navigator.clipboard.readText());
		expect(clipboard).to.match(/^http:\/\/localhost:3001\/\?session=/);

		await otherPlayerPage.goto(clipboard);
	});

	it(`Select Spectator mode and adds a bot`, async function () {
		await waitAndClickXpath(sessionOwnerPage, "//button[contains(., 'Settings')]");
		await waitAndClickSelector(sessionOwnerPage, "#is-owner-player");
		await sessionOwnerPage.keyboard.press("Escape");

		let input = await sessionOwnerPage.waitForSelector("#bots");
		await input.click({ clickCount: 3 }); // Focus and select all text
		await sessionOwnerPage.keyboard.type("1");
		await sessionOwnerPage.keyboard.press("Enter");
	});

	it(`Launch Draft`, async function () {
		await clickDraft();
		await otherPlayerPage.waitForXPath("//h2[contains(., 'Your Booster')]", {
			visible: true,
		});
		await otherPlayerPage.waitForXPath("//div[contains(., 'Now drafting!')]", {
			hidden: true,
		});
	});

	it(`Spectator clicks on a player`, async function () {
		await waitAndClickSelector(sessionOwnerPage, ".player-name");
	});

	it("Active player picks cards until the end of the draft.", async function () {
		while (!(await pickCard(otherPlayerPage)));
	});
});

describe("Front End - Multi, with disconnects", function () {
	let sessionLink;

	this.timeout(100000);
	it("Owner joins and set the bot count to 6", async function () {
		await sessionOwnerPage.goto(`http://localhost:${process.env.PORT}?session=${Math.random()}`);
		await sessionOwnerPage.focus("#bots");
		await sessionOwnerPage.keyboard.type("6");
		await sessionOwnerPage.keyboard.press("Enter");
	});

	it(`Another Player joins the session`, async function () {
		// Get session link
		await sessionOwnerPage.$$(".fa-share-square");
		await sessionOwnerPage.click(".fa-share-square");
		sessionLink = await sessionOwnerPage.evaluate(() => navigator.clipboard.readText());
		expect(sessionLink).to.match(/^http:\/\/localhost:3001\/\?session=/);

		await otherPlayerPage.goto(sessionLink);
	});

	it(`Launch Draft`, async function () {
		await clickDraft();
		await sessionOwnerPage.waitForXPath("//h2[contains(., 'Your Booster')]", {
			visible: true,
		});
		await otherPlayerPage.waitForXPath("//h2[contains(., 'Your Booster')]", {
			visible: true,
		});
		await sessionOwnerPage.waitForXPath("//div[contains(., 'Now drafting!')]", {
			hidden: true,
		});
		await otherPlayerPage.waitForXPath("//div[contains(., 'Now drafting!')]", {
			hidden: true,
		});
	});

	it("Each player picks a card", async function () {
		await pickCard(sessionOwnerPage);
		await pickCard(otherPlayerPage);
	});

	it("Owner refreshes the page", async function () {
		await sessionOwnerPage.goto(sessionLink, { waitUntil: ["networkidle0", "domcontentloaded"] });
		await sessionOwnerPage.waitForXPath("//div[contains(., 'Reconnected')]", {
			hidden: true,
		});
	});

	it("Each player picks a card", async function () {
		await pickCard(sessionOwnerPage);
		await pickCard(otherPlayerPage);
	});

	it("Player refreshes the page", async function () {
		await otherPlayerPage.reload({ waitUntil: ["networkidle0", "domcontentloaded"] });
		await otherPlayerPage.waitForXPath("//div[contains(., 'Reconnected')]", {
			hidden: true,
		});
	});

	it("Each player picks a card", async function () {
		await pickCard(sessionOwnerPage);
		await pickCard(otherPlayerPage);
	});

	it("Both players disconnect", async function () {
		await sessionOwnerPage.goto("about:blank", { waitUntil: ["networkidle0", "domcontentloaded"] });
		await otherPlayerPage.goto("about:blank", { waitUntil: ["networkidle0", "domcontentloaded"] });

		sessionOwnerPage.waitForTimeout(250);
		await sessionOwnerPage.goto(sessionLink, { waitUntil: ["networkidle0", "domcontentloaded"] });
		await otherPlayerPage.goto(sessionLink, { waitUntil: ["networkidle0", "domcontentloaded"] });

		await sessionOwnerPage.waitForXPath("//div[contains(., 'Reconnected')]", {
			hidden: true,
		});
		await otherPlayerPage.waitForXPath("//div[contains(., 'Reconnected')]", {
			hidden: true,
		});
	});

	it("Each player picks a card", async function () {
		await pickCard(sessionOwnerPage);
		await pickCard(otherPlayerPage);
	});

	it("Other player disconnects, and owner replaces them with a bot.", async function () {
		await otherPlayerPage.goto("about:blank", { waitUntil: ["networkidle0", "domcontentloaded"] });
		await sessionOwnerPage.waitForTimeout(100);
		await waitAndClickXpath(sessionOwnerPage, "//button[contains(., 'Replace')]");
	});

	it("Owner picks a couple of cards", async function () {
		await pickCard(sessionOwnerPage);
		await pickCard(sessionOwnerPage);
		await pickCard(sessionOwnerPage);
		await pickCard(sessionOwnerPage);
	});

	it("Player reconnects", async function () {
		await otherPlayerPage.goto(sessionLink, { waitUntil: ["networkidle0", "domcontentloaded"] });
		await otherPlayerPage.waitForXPath("//div[contains(., 'Reconnected')]", {
			hidden: true,
		});
	});

	it("Each player picks a card", async function () {
		await pickCard(sessionOwnerPage);
		await pickCard(otherPlayerPage);
	});

	it("Owner disconnects, new owner replaces them with a bot.", async function () {
		await sessionOwnerPage.goto("about:blank", { waitUntil: ["networkidle0", "domcontentloaded"] });
		await otherPlayerPage.waitForTimeout(100);
		await waitAndClickXpath(otherPlayerPage, "//button[contains(., 'Replace')]");
	});

	it("New owner finished the draft alone.", async function () {
		while (!(await pickCard(otherPlayerPage)));
	});
});

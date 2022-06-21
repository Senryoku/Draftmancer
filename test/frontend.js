import puppeteer from "puppeteer";
import chai from "chai";
const expect = chai.expect;
import server from "../dist/server.js"; // Launch Server

let browser;
let sessionOwnerPage;
let otherPlayerPage;

before(async function () {
	browser = await puppeteer.launch({
		headless: false, // For testing only
	});
	const context = browser.defaultBrowserContext();
	context.overridePermissions(`http://localhost:${process.env.PORT}`, ["clipboard-read"]);
	sessionOwnerPage = await browser.newPage();

	// Disable animations
	sessionOwnerPage.on("load", () => {
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

		sessionOwnerPage.addStyleTag({ content });
	});
});

after(function () {
	browser.close();
});

async function clickDraft() {
	// Click 'Draft' button
	const [button] = await sessionOwnerPage.$x("//button[contains(., 'Draft')]");
	expect(button).to.exist;
	await button.click();
}

async function pickCard(page) {
	await page.waitForXPath("//span[contains(., 'Pick a card')]");

	const [card] = await page.$$(".booster-card");
	expect(card).to.exist;
	//await sessionOwnerPage.waitForTimeout(200);
	await card.click();
	await page.waitForSelector('input[value="Confirm Pick"]', {
		visible: true,
	});
	const [button] = await page.$$('input[value="Confirm Pick"]');
	expect(button).to.exist;
	await button.click();
}

async function pickFirstCard(page) {
	const [boosterH2] = await page.$x("//h2[contains(., 'Your Booster')]");
	expect(boosterH2).to.exist;

	await pickCard(page);
}

describe.only("Front End - Solo", function () {
	this.timeout(100000);
	it("Owner joins", async function () {
		await sessionOwnerPage.goto(`http://localhost:${process.env.PORT}`);
	});

	it(`Launch Draft with Bots`, async function () {
		await clickDraft();

		// On popup, choose 'Draft alone with bots'
		const [button2] = await sessionOwnerPage.$x("//button[contains(., 'Draft alone with bots')]");
		expect(button2).to.exist;
		await button2.click();

		await sessionOwnerPage.waitForXPath("//h2[contains(., 'Your Booster')]", {
			visible: true,
		});

		await sessionOwnerPage.waitForTimeout(1500); // Wait for the "Now drafting!" popup to go.
	});

	it(`Owner picks a card`, async function () {
		await pickFirstCard(sessionOwnerPage);
	});

	it(`...Until draft if done.`, async function () {
		let draftDone = false;
		//await sessionOwnerPage.waitForTimeout(250); // Animation
		while (!draftDone) {
			//await sessionOwnerPage.waitForTimeout(250); // Animation
			await pickCard(sessionOwnerPage);
			//await sessionOwnerPage.waitForTimeout(250); // Animation
			let popup = await sessionOwnerPage.$x("//*[contains(., 'Done drafting!')]");
			if (popup.length > 0) draftDone = true;
		}
	});
});

describe("Front End - Multi", function () {
	it("Owner joins", async function () {
		await sessionOwnerPage.goto(`http://localhost:${process.env.PORT}`);
	});

	it(`Another Player joins the session`, async function () {
		// Get session link
		await sessionOwnerPage.$$(".fa-share-square");
		await sessionOwnerPage.click(".fa-share-square");
		let clipboard = await sessionOwnerPage.evaluate(() => navigator.clipboard.readText());
		expect(clipboard).to.match(/^http:\/\/localhost:3001\/\?session=/);

		otherPlayerPage = await browser.newPage();
		await otherPlayerPage.goto(clipboard);
	});

	it(`Launch Draft`, async function () {
		await clickDraft();
		await sessionOwnerPage.waitForXPath("//h2[contains(., 'Your Booster')]", {
			visible: true,
		});
		await sessionOwnerPage.waitFor(1500); // Wait for the "Now drafting!" popup to go.
	});

	it("Owner picks a card", async function () {
		await pickFirstCard(sessionOwnerPage);
	});
});

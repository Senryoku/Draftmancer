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
} from "./src/common.js";
import { ElementHandle, Page } from "puppeteer";
import { cwd } from "node:process";
async function clickDraft(page: Page) {
	// Click 'Start' button
	const [button] = (await page.$x("//button[contains(., 'Start')]")) as ElementHandle<Element>[];
	expect(button).to.exist;
	await button.click();
}

function selectCube(name: string) {
	it(`Select Cube`, async function () {
		await waitAndClickXpath(pages[0], "//button[contains(., 'Settings')]");
		const cardListInput = (await pages[0].$("#card-list-input")) as ElementHandle<HTMLInputElement>;

		await cardListInput.uploadFile(`./test/data/${name}.txt`);
		await pages[0].waitForXPath("//*[contains(., 'Card list uploaded')]");
		await dismissToast(pages[0]);
		await pages[0].keyboard.press("Escape");
	});
}

function launchDraft() {
	it(`Launch Draft with Bots`, async function () {
		await clickDraft(pages[0]);

		// On popup, choose 'Draft alone with bots'
		const [button2] = (await pages[0].$x(
			"//button[contains(., 'Draft alone with 7 bots')]"
		)) as ElementHandle<Element>[];
		expect(button2).to.exist;
		await button2.click();

		await pages[0].waitForXPath("//h2[contains(., 'Your Booster')]");
		await pages[0].waitForXPath("//div[contains(., 'Draft Started!')]", {
			hidden: true,
		});
	});
}

describe("Cogwork Librarian", function () {
	this.timeout(10000);
	setupBrowsers(1);

	selectCube("CogworkLibrarian");
	launchDraft();

	it(`Pick Cogwork Librarian, pick effect selector should appear`, async function () {
		const card = await pages[0].$(".card");
		await card!.click();
		await waitAndClickSelector(pages[0], 'input[value="Confirm Pick"]');
		const pickSelector = await pages[0].waitForSelector("#pick-effect");
		expect(pickSelector).to.exist;
		const options = await pickSelector!.$$("option");
		expect(options).to.have.lengthOf(2);
		expect(await options![0]!.evaluate((el) => el.innerText)).to.contain("Cogwork Librarian");
	});

	it(`Should be able to pick two cards and still have only two in deck afterwards.`, async function () {
		const pickSelector = (await pages[0].waitForSelector("#pick-effect")) as ElementHandle<HTMLSelectElement>;
		pickSelector.select("Cogwork Librarian");
		await pages[0].waitForXPath("//span[contains(., 'Pick 2')]");
		const cards = await pages[0].$$(".card");
		await cards![0]!.click();
		await cards![1]!.click();
		await waitAndClickSelector(pages[0], 'input[value="Confirm Pick"]');
		await pages[0].waitForXPath("//h2[contains(., 'Deck (2')]");
	});
});

describe("Lore Seeker", function () {
	this.timeout(10000);
	setupBrowsers(1);

	selectCube("LoreSeeker");
	launchDraft();

	it(`Click on Lore Seeker, pick effect selector should appear`, async function () {
		const card = await pages[0].$(".card");
		await card!.click();
		const pickSelector = (await pages[0].waitForSelector(
			"#optional-pick-effect"
		)) as ElementHandle<HTMLSelectElement>;
		expect(pickSelector).to.exist;
		const options = await pickSelector!.$$("option");
		expect(options).to.have.lengthOf(2);
		expect(await options[0]!.evaluate((el) => el.innerText)).to.contain("Lore Seeker");
	});

	it(`Pick the Lore Seeker, next pack should be brand new`, async function () {
		await waitAndClickSelector(pages[0], 'input[value="Confirm Pick"]');
		await pages[0].waitForXPath("//h2[contains(., 'Deck (1')]");
		await pages[0].waitForXPath("//h2[contains(., 'Booster (10')]");
	});

	it(`Pick the Lore Seeker, but don't activate effect.`, async function () {
		const card = await pages[0].$(".card");
		await card!.click();
		const pickSelector = (await pages[0].waitForSelector(
			"#optional-pick-effect"
		)) as ElementHandle<HTMLSelectElement>;
		pickSelector.select("Do not use");
		await waitAndClickSelector(pages[0], 'input[value="Confirm Pick"]');
		await pages[0].waitForXPath("//h2[contains(., 'Deck (2')]");
		await pages[0].waitForXPath("//h2[contains(., 'Booster (9')]");
	});
});

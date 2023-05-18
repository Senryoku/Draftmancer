import { describe, it } from "mocha";
import chai from "chai";
const expect = chai.expect;
import {
	waitAndClickXpath,
	waitAndClickSelector,
	dismissToast,
	setupBrowsers,
	pages,
	replaceInput,
} from "./src/common.js";
import { ElementHandle, Page } from "puppeteer";
import { getRandom } from "../../src/utils.js";

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

describe("Conspiracy", function () {
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

	describe("Agent of Acquisitions", function () {
		this.timeout(10000);
		setupBrowsers(1);

		selectCube("AgentOfAcquisitions");
		launchDraft();

		it(`Pick Agent of Acquisitions, pick effect selector should appear`, async function () {
			const card = await pages[0].$(".card");
			await card!.click();
			await waitAndClickSelector(pages[0], 'input[value="Confirm Pick"]');
			const pickSelector = await pages[0].waitForSelector("#pick-effect");
			expect(pickSelector).to.exist;
			const options = await pickSelector!.$$("option");
			expect(options).to.have.lengthOf(2);
			expect(await options![0]!.evaluate((el) => el.innerText)).to.contain("Agent of Acquisitions");
		});

		it(`Pick, should have 10 cards and still have to pass 8 times.`, async function () {
			const cards = await pages[0].$$(".card");
			await cards![0]!.click();
			const pickSelector = (await pages[0].waitForSelector("#pick-effect")) as ElementHandle<HTMLSelectElement>;
			pickSelector.select("Agent of Acquisitions");
			await waitAndClickSelector(pages[0], 'input[value="Confirm Pick"]');
			await pages[0].waitForXPath("//h2[contains(., 'Deck (10')]");
			for (let i = 0; i < 8; ++i) {
				await pages[0].waitForXPath(`//*[contains(., 'Pick #${i + 3}')]`);
				await waitAndClickXpath(pages[0], '//button[contains(., "Pass Booster")]');
			}
		});

		it(`Next booster; should be able to pick again.`, async function () {
			await pages[0].waitForXPath("//*[contains(., 'Pick a card')]");
			const card = await pages[0].$(".card");
			await card!.click();
			await waitAndClickSelector(pages[0], 'input[value="Confirm Pick"]');
		});
	});

	describe("Choose Colors", function () {
		this.timeout(10000);
		setupBrowsers(3);

		selectCube("ChooseColors");

		it(`Reorder players`, async function () {
			for (let i = 0; i < 3; i++) {
				const nameInput = await pages[i].$(`#user-name`);
				await replaceInput(`Player ${i}`)(nameInput);
				await nameInput!.press("Enter");
				const el = (await pages[0].$x(`//li[div[contains(., 'Player ${i}')]]`))[0];
				let pos = await el.evaluate((e) => Array.prototype.indexOf.call(e.parentNode!.children, e));
				while (pos !== i) {
					(await el.$(".move-player-left"))!.click();
					await new Promise((resolve) => setTimeout(resolve, 50));
					pos = await el.evaluate((e) => Array.prototype.indexOf.call(e.parentNode!.children, e));
				}
			}
		});

		it(`Launch Draft`, async function () {
			await clickDraft(pages[0]);
			await pages[0].waitForXPath("//h2[contains(., 'Your Booster')]");
			await pages[0].waitForXPath("//div[contains(., 'Draft Started!')]", {
				hidden: true,
			});
		});

		it(`Center player pick a ChooseColors card`, async function () {
			const card = await pages[1].$(".card");
			await card!.click();
			await waitAndClickSelector(pages[1], 'input[value="Confirm Pick"]');
			await new Promise((resolve) => setTimeout(resolve, 1000));
		});

		it(`Left Player should be asked a color.`, async function () {
			const dialog = await pages[0].waitForSelector("#ask-color-dialog");
			const choices = await dialog!.$$(".choice");
			await getRandom(choices).click();
			await new Promise((resolve) => setTimeout(resolve, 1000));
		});

		it(`Center Player should be asked a color.`, async function () {
			const dialog = await pages[1].waitForSelector("#ask-color-dialog");
			const choices = await dialog!.$$(".choice");
			await getRandom(choices).click();
			await new Promise((resolve) => setTimeout(resolve, 1000));
		});

		it(`Right Player should be asked a color.`, async function () {
			const dialog = await pages[2].waitForSelector("#ask-color-dialog");
			const choices = await dialog!.$$(".choice");
			await getRandom(choices).click();
			await new Promise((resolve) => setTimeout(resolve, 1000));
		});
	});
});

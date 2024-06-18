import { ElementHandle } from "puppeteer";
import { expect } from "chai";
import { pickCard, PickResult, setupBrowsers, pages } from "./src/common.js";

describe("Front End - 8 Players Draft", function () {
	this.timeout(200000);
	setupBrowsers(8);

	it(`Launch Draft`, async function () {
		const [button] = (await pages[0].$$("xpath/.//button[contains(., 'Start')]")) as ElementHandle<Element>[];
		expect(button).to.exist;
		await button!.click();

		const promises = [];
		for (let i = 0; i < pages.length; i++) {
			promises.push(
				pages[i].waitForSelector("xpath/.//h2[contains(., 'Your Booster')]", {
					visible: true,
				})
			);
			promises.push(
				pages[i].waitForSelector("xpath/.//div[contains(., 'Draft Started!')]", {
					hidden: true,
				})
			);
		}
		await Promise.all(promises);
	});

	it("Each player picks a card", async function () {
		await Promise.all(
			pages.map((page) =>
				(async () => {
					while ((await pickCard(page)) !== PickResult.Picked);
				})()
			)
		);
	});

	it("...and continues until the draft is done.", async function () {
		const done = [];
		for (let i = 0; i < pages.length; i++) done.push(false);
		while (done.some((d) => !d)) {
			const promises = [];
			for (let i = 0; i < pages.length; i++) {
				if (!done[i])
					promises.push(
						(async () => {
							let r: PickResult = PickResult.Waiting;
							while ((r = await pickCard(pages[i])) === PickResult.Waiting);
							return r === PickResult.Done;
						})()
					);
				else promises.push(true);
			}
			await Promise.all(promises);
			for (let i = 0; i < pages.length; i++) done[i] = await promises[i];
		}
	});
});

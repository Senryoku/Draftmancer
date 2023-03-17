import { ElementHandle } from "puppeteer";
import chai from "chai";
const expect = chai.expect;
import { pickCard, PickResult, setupBrowsers, pages } from "./src/common.js";

describe("Front End - 8 Players Draft", function () {
	this.timeout(200000);
	setupBrowsers(8);

	it(`Launch Draft`, async function () {
		const [button] = (await pages[0].$x("//button[contains(., 'Start')]")) as ElementHandle<Element>[];
		expect(button).to.exist;
		await button!.click();

		let promises = [];
		for (let i = 0; i < pages.length; i++) {
			promises.push(
				pages[i].waitForXPath("//h2[contains(., 'Your Booster')]", {
					visible: true,
				})
			);
			promises.push(
				pages[i].waitForXPath("//div[contains(., 'Draft Started!')]", {
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
		let done = [];
		for (let i = 0; i < pages.length; i++) done.push(false);
		while (done.some((d) => !d)) {
			let promises = [];
			for (let i = 0; i < pages.length; i++) {
				if (!done[i])
					promises.push(
						(async () => {
							let r: PickResult = PickResult.Waiting;
							while ((r = await pickCard(pages[i])) === PickResult.Waiting);
							return r === PickResult.Done;
						})()
					);
			}
			await Promise.all(promises);
			for (let i = 0; i < pages.length; i++) done[i] = await promises[i];
		}
	});
});

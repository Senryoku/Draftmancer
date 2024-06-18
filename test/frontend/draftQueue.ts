import {
	pickCard,
	PickResult,
	startBrowsers,
	pages,
	setBrowsersAndPages,
	waitAndClickSelector,
	browsersCleanup,
} from "./src/common.js";

describe("Draft Queue", function () {
	describe("Single Queue", function () {
		this.timeout(200000);

		after("Close browsers", async function () {
			await browsersCleanup();
		});

		it("Start browsers", async () => {
			const [browsers, pages] = await startBrowsers(8);
			setBrowsersAndPages(browsers, pages);
			await Promise.all(pages.map((page) => page.goto(`http://localhost:${process.env.PORT}/draftqueue`)));
		});

		it(`All join the same queue`, async function () {
			// Avoid the CMM queue and its 2 cards per pick for testing purpose.
			await Promise.all(pages.map((page) => waitAndClickSelector(page, ".set-card:nth-child(2)")));
			await Promise.all(pages.map((page) => page.waitForSelector(".ready-check")));
		});

		it(`All accept`, async function () {
			await Promise.all(pages.map((page) => waitAndClickSelector(page, ".ready-button")));
		});

		it("Each player picks a card", async function () {
			await Promise.all(
				pages.map(async (page) => {
					while ((await pickCard(page)) !== PickResult.Picked);
				})
			);
		});

		it("Player 0 disconnects", async function () {
			await pages[0].goto("about:blank");
		});

		it("Everyone one else continues", async function () {
			for (let i = 1; i < 8; ++i) while ((await pickCard(pages[i])) !== PickResult.Picked);
		});

		it("Player 0 reconnects and picks", async function () {
			await pages[0].goto(`http://localhost:${process.env.PORT}`);
			while ((await pickCard(pages[0])) !== PickResult.Picked);
		});

		it("Player 0 disconnects", async function () {
			await pages[0].goto("about:blank");
		});

		it("Everyone one else continues", async function () {
			await Promise.all(
				pages.slice(1).map(async (p) => {
					while ((await pickCard(p)) !== PickResult.Picked);
				})
			);
		});

		it("Player 0 is eventually replaced by a bot", async function () {
			for (let p = 0; p < 6; ++p)
				await Promise.all(
					pages.slice(1).map(async (p) => {
						while ((await pickCard(p)) !== PickResult.Picked);
					})
				);
		});

		it("Player 0 reconnects", async function () {
			await pages[0].goto(`http://localhost:${process.env.PORT}`);
		});

		it("Everyone one else continues", async function () {
			await Promise.all(
				pages.slice(1).map(async (p) => {
					while ((await pickCard(p)) !== PickResult.Picked);
				})
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

	describe("Multiple Queues", function () {
		this.timeout(200000);

		after("Close browsers", async function () {
			await browsersCleanup();
		});

		it("Start browsers", async () => {
			const [browsers, pages] = await startBrowsers(16);
			setBrowsersAndPages(browsers, pages);
			await Promise.all(pages.map((page) => page.goto(`http://localhost:${process.env.PORT}/draftqueue`)));
		});

		it(`All join the same queue`, async function () {
			// Avoid the CMM queue and its 2 cards per pick for testing purpose.
			await Promise.all(pages.map((page) => waitAndClickSelector(page, ".set-card:nth-child(2)")));
			await Promise.all(pages.map((page) => page.waitForSelector(".ready-check")));
		});

		it(`All accept`, async function () {
			await Promise.all(pages.map((page) => waitAndClickSelector(page, ".ready-button")));
			await Promise.all(
				pages.map((page) =>
					page.waitForSelector("xpath/.//div[contains(., 'Draft Started!')]", {
						hidden: true,
					})
				)
			);
		});

		it("Each player picks a card", async function () {
			await Promise.all(
				pages.map(async (page) => {
					while ((await pickCard(page)) !== PickResult.Picked);
				})
			);
		});

		it("...and drafts until done.", async function () {
			const done = [];
			for (let i = 0; i < pages.length; i++) done.push(false);
			while (done.some((d) => !d)) {
				const promises = [];
				for (let i = 0; i < pages.length; i++) {
					if (!done[i])
						promises.push(
							(async () => {
								return (await pickCard(pages[i])) === PickResult.Done;
							})()
						);
					else promises.push(true);
				}
				await Promise.all(promises);
				for (let i = 0; i < pages.length; i++) done[i] = await promises[i];
			}
			for (const page of pages)
				await page.waitForSelector(
					"xpath/.//*[contains(., 'Deck (45') or contains(., 'Deck (42') or contains(., 'Deck (39')]"
				);
		});
	});
});

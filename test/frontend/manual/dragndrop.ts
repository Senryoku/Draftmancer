import { expect } from "chai";
import {
	waitAndClickSelector,
	waitAndClickXpath,
	setupBrowsers,
	pages,
	replaceInput,
	launchMode,
} from "../src/common.js";
import { getRandom, random } from "../../../src/utils.js";

// Not part of the test suite.
// Ongoing investigation :)

async function cardsInPool() {
	return (await pages[0].$$(".card")).length;
}

describe("Drag and Drop", () => {
	describe("Card Pool", function () {
		this.timeout(10000);
		setupBrowsers(1);
		let cardCount = 0;

		it(`Distribute Sealed`, async () => {
			pages[0]
				.on("console", (message) =>
					console.log(
						`${message.type().substr(0, 3).toUpperCase()} ${message.text()}, ${message.stackTrace()}`
					)
				)
				.on("pageerror", ({ message }) => console.log(message));

			await launchMode("Sealed");
			await replaceInput("1")(await pages[0].$("#input-boostersPerPlayer"));
			await waitAndClickSelector(pages[0], "button.confirm");

			await Promise.all(
				pages.map((page) => page.waitForSelector("xpath/.//h2[contains(., 'Deck')]", { timeout: 3000 }))
			);
			cardCount = await cardsInPool();
		});

		it("Drag and Drop", async function () {
			this.timeout(500000);
			const viewport = (await pages[0].viewport())!;
			for (let i = 0; i < 1000; ++i) {
				const cards = await pages[0].$$(".card");
				const card = getRandom(cards);
				const start = await card.boundingBox();
				if (!start) {
					console.error("??", card, start);
					continue;
				}

				const from = [start.x + 1, start.y + 1];
				const target = [random.integer(0, viewport.width), random.integer(0, viewport.height)];

				await pages[0].mouse.move(from[0], from[1]);
				await pages[0].mouse.down();
				await new Promise((r) => setTimeout(r, 32));
				await pages[0].mouse.move(target[0], target[1], { steps: 20 });
				await pages[0].mouse.up();
				await new Promise((r) => setTimeout(r, 100));
				console.error(from, target);
				if ((await cardsInPool()) !== cardCount) {
					console.error(card, target);
					await new Promise((r) => setTimeout(r, 1000)); // Is it really an error?... :(
					if ((await cardsInPool()) !== cardCount) {
						await pages[0].evaluate(
							(from, to) => {
								{
									const div = document.createElement("div");
									div.style.position = "fixed";
									div.style.top = `${from[1] - 5}px`;
									div.style.left = `${from[0] - 5}px`;
									div.style.backgroundColor = "blue";
									div.style.width = "10px";
									div.style.height = "10px";
									div.style.borderRadius = "5px";
									div.style.zIndex = "1000000";
									document.body.appendChild(div);
								}
								{
									const div = document.createElement("div");
									div.style.position = "fixed";
									div.style.top = `${to[1] - 5}px`;
									div.style.left = `${to[0] - 5}px`;
									div.style.backgroundColor = "red";
									div.style.width = "10px";
									div.style.height = "10px";
									div.style.borderRadius = "5px";
									div.style.zIndex = "1000000";
									document.body.appendChild(div);
								}
							},
							from,
							target
						);
						await pages[0].screenshot({ path: `tmp/DragAndDropError.png` });
					}
				}
				expect(await cardsInPool()).to.equal(cardCount);
			}
		});
	});
});

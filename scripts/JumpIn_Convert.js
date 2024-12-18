import fs from "fs";

const final = [];

async function requestCard(c) {
	const r = await fetch(`https://api.scryfall.com/cards/${c}`);
	const json = await r.json();
	return json;
}

async function asyncAppendJumpIn(jumpIn) {
	const val = { name: jumpIn.title, cards: [], alts: [], image: "/img/cardback.webp" };

	const colors = new Set();

	for (const s of jumpIn.spells) {
		if (Array.isArray(s)) {
			const arr = [];
			for (const c of s) {
				const card = await requestCard(c.s);
				arr.push({
					name: card.name,
					id: card.id,
					weight: c.odds,
				});
				for (const color of card.colors) colors.add(color);
			}
			val.alts.push(arr);
		} else {
			const card = await requestCard(s);
			val.cards.push(card.id);
			for (const color of card.colors) colors.add(color);
		}
	}
	val.colors = Array.from(colors);
	final.push(val);
}

let promises = [];
function appendJumpIn(jumpIn) {
	promises.push(asyncAppendJumpIn(jumpIn));
}

// appendJumpIn(...);
// ...

await Promise.all(promises);
console.log(final);

fs.writeFileSync("JumpInBoosters_set.json", JSON.stringify(final, null, 4));

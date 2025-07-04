import fs from "fs";

const final = [];

async function requestCard(c) {
	const r = await fetch(`https://api.scryfall.com/cards/${c}`);
	if (r.status != 200) {
		console.log(`Error requesting ${c}: ${r.status} ${r.statusText}`);
		if (r.status == 429) {
			await new Promise((resolve) => setTimeout(resolve, 60 * 1000));
		} else {
			throw new Error(`Error requesting ${c}: ${r.status} ${r.statusText}`);
		}
	}
	const json = await r.json();
	return json;
}

const DefaultImage = "/img/cardback.webp";

async function asyncAppendJumpIn(jumpIn) {
	const val = { name: jumpIn.title, cards: [], alts: [], image: DefaultImage };

	const colors = new Set();

	for (const s of jumpIn.spells) {
		if (s === null) {
			console.warn("Skipping null spell");
			continue;
		}
		if (Array.isArray(s)) {
			const arr = [];
			for (const c of s) {
				const card = await requestCard(c.s);
				arr.push({
					name: card.name,
					id: card.id,
					weight: c.odds,
				});
				if (card.colors) for (const color of card.colors) colors.add(color);
				if (val.image === DefaultImage && card.rarity === "rare" && card.image_uris?.border_crop)
					val.image = card.image_uris.border_crop;
			}
			val.alts.push(arr);
		} else {
			const card = await requestCard(s);
			val.cards.push(card.id);
			if (card.colors) for (const color of card.colors) colors.add(color);
			else if (card.color_identity) for (const color of card.color_identity) colors.add(color);
			else {
				console.error(`Could not find colors for card: ${card.name}`);
				console.log(card);
				throw new Error(`Could not find colors for card: ${card.name}`);
			}
			if (val.image === DefaultImage && card.rarity === "rare") val.image = card.image_uris.border_crop;
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

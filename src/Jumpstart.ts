import { getNDisctinctRandom, getRandom, weightedRandomIdx } from "./utils.js";
import { CardID } from "./CardTypes.js";
import { getUnique } from "./Cards.js";

import JumpstartHHBoosters from "./data/JumpstartHHBoosters.json" with { type: "json" };
import { JumpInBooster, JumpInBoosterPattern } from "./JumpInTypes.js";

import _JumpstartBoosters from "./data/JumpstartBoosters.json" with { type: "json" };
import _Jumpstart2022Boosters from "./data/Jumpstart2022Boosters.json" with { type: "json" };
import _SuperJumpBoosters from "./data/SuperJumpBoosters.json" with { type: "json" };

Object.freeze(_JumpstartBoosters);
Object.freeze(_Jumpstart2022Boosters);
Object.freeze(_SuperJumpBoosters);

export const JumpstartBoosters = _JumpstartBoosters;
export const Jumpstart2022Boosters = _Jumpstart2022Boosters;
export const SuperJumpBoosters = _SuperJumpBoosters;

import JumpInBLB from "./data/JumpInBoosters_blb.json" with { type: "json" };
import JumpInOTJ from "./data/JumpInBoosters_otj.json" with { type: "json" };
import JumpInMKM from "./data/JumpInBoosters_mkm.json" with { type: "json" };
import JumpInLCI from "./data/JumpInBoosters_lci.json" with { type: "json" };
import JumpInWOE from "./data/JumpInBoosters_woe.json" with { type: "json" };
import JumpInLTR from "./data/JumpInBoosters_ltr.json" with { type: "json" };
import JumpInONE from "./data/JumpInBoosters_one.json" with { type: "json" };
import JumpInBRO from "./data/JumpInBoosters_bro.json" with { type: "json" };

const JumpInBoosters: Record<string, JumpInBoosterPattern[]> = {
	blb: JumpInBLB,
	otj: JumpInOTJ,
	mkm: JumpInMKM,
	lci: JumpInLCI,
	woe: JumpInWOE,
	ltr: JumpInLTR,
	one: JumpInONE,
	bro: JumpInBRO,
};

for (const [, value] of Object.entries(JumpInBoosters)) {
	Object.freeze(value);
}

export const JumpInSets = Object.keys(JumpInBoosters);

export function generateJumpInBooster(boosterPattern: JumpInBoosterPattern): JumpInBooster {
	const booster: JumpInBooster = {
		name: boosterPattern.name,
		colors: boosterPattern.colors,
		image: boosterPattern.image,
		cards: [],
	};
	// Immutable part of the pack
	booster.cards = boosterPattern.cards.map((cid: CardID) => getUnique(cid));
	// Random variations
	if (boosterPattern.alts) {
		for (const slot of boosterPattern.alts) {
			const totalWeight = slot.map((o) => o.weight).reduce((p, c) => p + c, 0); // FIXME: Should always be 100, but since cards are still missing from the database, we'll compute it correctly.
			const pickIdx = weightedRandomIdx(slot, totalWeight);
			booster.cards.push(getUnique(slot[pickIdx].id));
		}
	}
	return booster;
}

export function genJHHPackChoices(): [JumpInBooster[], JumpInBooster[][]] {
	const choices: [JumpInBooster[], JumpInBooster[][]] = [[], []];
	choices[0] = getNDisctinctRandom(JumpstartHHBoosters, 3).map(generateJumpInBooster);
	const secondchoice: JumpInBooster[][] = [];
	for (let i = 0; i < 3; ++i) {
		const candidates: JumpInBoosterPattern[] = JumpstartHHBoosters.filter((p) => {
			if (p.name === choices[0][i].name) return false; // Prevent duplicates
			if (p.colors.length === 5) return true; // WUBRG can always be picked
			// If first pack is mono-colored: Mono colored, Dual colored than contains the first pack's color, or WUBRG
			if (choices[0][i].colors.length === 1) return p.colors.includes(choices[0][i].colors[0]);
			// If first pack is dual-colored: Mono colored of one of these colors, Dual colored of the same colors, or WUBRG
			return (
				p.colors === choices[0][i].colors ||
				(p.colors.length === 1 && choices[0][i].colors.includes(p.colors[0]))
			);
		});
		secondchoice.push(getNDisctinctRandom(candidates, 3).map(generateJumpInBooster));
	}
	choices[1] = secondchoice;
	return choices;
}

export function genJumpInPackChoices(set: string): [JumpInBooster[], JumpInBooster[][]] {
	const choices: [JumpInBooster[], JumpInBooster[][]] = [[], []];
	// https://mtg.fandom.com/wiki/Jump_In!
	const Boosters = JumpInBoosters[set];
	// At least one packet will be a mono-colored option and at least one will be a multicolored option. None of the three packets will have the same color identity as any other.
	{
		const first: JumpInBoosterPattern[] = [];
		const mono = Boosters.filter((p) => p.colors.length === 1);
		const multi = Boosters.filter((p) => p.colors.length > 1);
		first.push(getRandom(mono.length > 0 ? mono : Boosters));
		first.push(getRandom(multi.length > 0 ? multi : Boosters.filter((p) => p.name !== first[0].name)));
		const thirdChoice = Boosters.filter((p) => {
			const colors = new Set(p.colors);
			return (
				!first.includes(p) &&
				colors.intersection(new Set(first[0].colors)).size !== colors.size &&
				colors.intersection(new Set(first[1].colors)).size !== colors.size
			);
		});
		first.push(getRandom(thirdChoice.length > 0 ? thirdChoice : Boosters.filter((p) => !first.includes(p))));
		choices[0] = first.map(generateJumpInBooster);
	}
	for (let i = 0; i < 3; ++i) {
		const firstColors = choices[0][i].colors;

		const second: JumpInBoosterPattern[] = [];
		// Prevent duplicates
		let mono = Boosters.filter((p) => p.colors.length === 1).filter((p) => p.name !== choices[0][i].name);
		if (mono.length === 0) mono = Boosters.filter((p) => p.name !== choices[0][i].name);
		let multi = Boosters.filter((p) => p.colors.length > 1).filter((p) => p.name !== choices[0][i].name);
		if (multi.length === 0) multi = Boosters.filter((p) => p.name !== choices[0][i].name);

		if (firstColors.length == 1) {
			// At least one mono-color option and at least one multicolor option.
			second.push(getRandom(mono));
			// All multicolor options will include the color of the first packet.
			multi = multi.filter((p) => p.colors.includes(firstColors[0]));
			second.push(getRandom(multi));
			second.push(getRandom([...mono, ...multi].filter((p) => !second.includes(p))));
		} else if (firstColors.length == 2) {
			// At least two mono-color options - one of each color in the first packet.
			const one = mono.filter((p) => p.colors.includes(firstColors[0]));
			second.push(getRandom(one.length > 0 ? one : mono));
			const two = mono.filter((p) => p.name !== second[0].name && p.colors.includes(firstColors[1]));
			second.push(getRandom(two.length > 0 ? two : mono));
			// If there is a multicolor option, either its colors will be the same as the first packet selected or it will contain both of those colors plus a third color.
			multi = multi.filter((p) => p.colors.includes(firstColors[0]) && p.colors.includes(firstColors[1]));
			second.push(getRandom([...mono, ...multi].filter((p) => !second.includes(p))));
		} else {
			// At least two mono-color options, covering two of the three colors.
			const pickedColors = getNDisctinctRandom(firstColors, 2);
			second.push(getRandom(mono.filter((p) => p.colors.includes(pickedColors[0]))));
			second.push(getRandom(mono.filter((p) => p.colors.includes(pickedColors[1]))));
			// If there is a multicolor option, it will only contain colors within the first packet selection's color. Note - there are not currently any three-color packets available.
			multi = multi.filter(
				(p) =>
					p.colors.includes(firstColors[0]) &&
					p.colors.includes(firstColors[1]) &&
					p.colors.includes(firstColors[2])
			);
			second.push(getRandom([...mono, ...multi].filter((p) => !second.includes(p))));
		}
		choices[1].push(second.map(generateJumpInBooster));
	}
	return choices;
}

export function genSuperJumpPackChoices(): [JumpInBooster[], JumpInBooster[][]] {
	const choices: [JumpInBooster[], JumpInBooster[][]] = [[], []];
	choices[0] = getNDisctinctRandom(SuperJumpBoosters, 3).map(generateJumpInBooster);
	// Second choice does not depend on the first one in this case, but we'll keep the same interface for simplicity.
	choices[1] = [];
	const secondChoice = getNDisctinctRandom(SuperJumpBoosters, 3).map(generateJumpInBooster);
	for (let i = 0; i < 3; ++i) choices[1].push(secondChoice);
	return choices;
}

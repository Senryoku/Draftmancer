import { DraftLog, DraftPick, DeprecatedDraftPick } from "@/DraftLog";
import { Card, CardID, DeckList } from "@/CardTypes";

export const FABLAZING_ENDPOINT = "https://api.fablazingdata.com/api/draft/import";

type FablazingCard = {
	name: string;
	set: string;
	collector_number: string;
	rarity?: string;
	mana_cost?: string;
	type?: string;
	image_uris?: { [lang: string]: string };
};

type FablazingUser = {
	userID: string;
	userName: string;
	isBot: boolean;
	picks: DraftPick[];
	cards: CardID[];
	decklist?: DeckList;
};

export type FablazingPayload = {
	source: "draftmancer";
	sessionID: string;
	time: number;
	type: string;
	setRestriction: string[];
	customBoosters: string[];
	teamDraft: boolean;
	boosters: CardID[][];
	carddata: { [cid: string]: FablazingCard };
	users: { [userID: string]: FablazingUser };
};

function normalizePicks(picks: (DraftPick | DeprecatedDraftPick)[]): DraftPick[] {
	if (picks.length === 0) return [];
	// v2.1 picks already carry packNum/pickNum.
	if ("packNum" in picks[0]) return picks as DraftPick[];

	// v2.0: derive packNum/pickNum from booster-length transitions, same logic as
	// the v2.0 branch of exportToMagicProTools in client/src/helper.ts.
	const out: DraftPick[] = [];
	let packNum = -1;
	let pickNum = 0;
	let lastLength = 0;
	for (const p of picks as DeprecatedDraftPick[]) {
		if (p.booster.length > lastLength) {
			packNum += 1;
			pickNum = 0;
		}
		lastLength = p.booster.length;
		out.push({
			packNum,
			pickNum,
			pick: p.pick,
			burn: p.burn,
			booster: p.booster,
		});
		pickNum += 1;
	}
	return out;
}

function trimCard(card: Card): FablazingCard {
	const out: FablazingCard = {
		name: card.name,
		set: card.set,
		collector_number: card.collector_number,
	};
	if (card.rarity) out.rarity = card.rarity;
	if (card.mana_cost) out.mana_cost = card.mana_cost;
	if (card.type) out.type = card.type;
	if (card.image_uris) out.image_uris = card.image_uris;
	return out;
}

export function buildFablazingPayload(draftlog: DraftLog): FablazingPayload {
	const users: { [userID: string]: FablazingUser } = {};
	const referenced = new Set<CardID>();

	for (const booster of draftlog.boosters) for (const cid of booster) referenced.add(cid);

	for (const uid in draftlog.users) {
		const u = draftlog.users[uid];
		const picks = normalizePicks(u.picks as (DraftPick | DeprecatedDraftPick)[]);
		for (const p of picks) for (const cid of p.booster) referenced.add(cid);
		for (const cid of u.cards) referenced.add(cid);
		users[uid] = {
			userID: u.userID,
			userName: u.userName,
			isBot: u.isBot,
			picks,
			cards: u.cards,
			decklist: u.decklist,
		};
	}

	const carddata: { [cid: string]: FablazingCard } = {};
	for (const cid of referenced) carddata[cid] = trimCard(draftlog.carddata[cid]);

	return {
		source: "draftmancer",
		sessionID: draftlog.sessionID,
		time: draftlog.time,
		type: draftlog.type,
		setRestriction: draftlog.setRestriction,
		customBoosters: draftlog.customBoosters,
		teamDraft: draftlog.teamDraft,
		boosters: draftlog.boosters,
		carddata,
		users,
	};
}

//Same regex check done on Fabrary export
export function isFleshAndBloodDraftLog(draftlog: DraftLog): boolean {
	if (draftlog.type !== "Draft") return false;
	for (const cid in draftlog.carddata) {
		const c = draftlog.carddata[cid];
		if (c.is_custom && /^[A-Z]{3}\d{3}$/.test(c.collector_number)) return true;
	}
	return false;
}

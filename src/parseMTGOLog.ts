import { Card, CardID } from "./CardTypes";
import { UserID } from "./IDTypes";
import { UsersData } from "./Session/SessionTypes";
import { Constants } from "./Constants.js";
import { DraftLog, DraftPick } from "./DraftLog.js";
import { parseLine } from "./parseCardList.js";
import { CardsByName, getCard } from "./Cards.js";
import { isSocketError } from "./Message.js";

function parseListWithPick(lines: string[], lineIndex: number) {
	let i = lineIndex;
	let pickIndex = 0;
	const values: string[] = [];
	while (i < lines.length && lines[i] !== "") {
		if (lines[i].startsWith("--> ")) {
			pickIndex = values.length;
			values.push(lines[i].substring("--> ".length, lines[i].length).trim());
		} else values.push(lines[i].trim());
		++i;
	}
	return { lineIndex: i, values, pickIndex };
}

function searchCardRec(cardName: string, setHint: string | null): CardID | null {
	let cid: CardID | null = null;
	if (setHint) {
		const r = parseLine(`${cardName} (${setHint})`); // FIXME: Split up parseLine into a helper function matching a card by name, set and collector number rather than re-parsing a string.
		if (!isSocketError(r)) cid = r.cardID;
	}
	if (!cid) cid = CardsByName[cardName];
	return cid;
}

function searchCard(cardName: string, setHint: string | null): CardID {
	let cid = searchCardRec(cardName, setHint);
	if (!cid) {
		// Convert double face cards MTGO syntax to MTGA syntax.
		if (cardName.includes("/")) {
			cid = searchCardRec(cardName.replace("/", " // "), setHint);
			if (!cid) cid = searchCardRec(cardName.replace("/", " // "), setHint);
		}
	}
	if (!cid) throw Error(`Card not found: ${cardName}`);
	return cid;
}

export function parseMTGOLog(userID: UserID, txt: string) {
	const lines = txt.split(/\r?\n|\r|\n/g);

	const session = {
		id: "",
		setRestriction: [],
		customBoosters: [],
		personalLogs: false,
		teamDraft: false,
	};

	let time = Date.now();
	let playerName = "Player";
	let setHint: string | null = null;
	const picks: DraftPick[] = [];

	for (let i = 0; i < lines.length; ++i) {
		if (lines[i].startsWith("Event #:")) {
			session.id = lines[i].substring("Event #: ".length, lines[i].length);
		} else if (lines[i].startsWith("Time:")) {
			try {
				time = Date.parse(lines[i].substring("Time: ".length, lines[i].length));
			} catch {
				console.warn("Error parsing time from MTGO log: ", lines[i]);
			}
		} else if (lines[i].startsWith("Players:")) {
			const r = parseListWithPick(lines, i + 1);
			i = r.lineIndex;
			playerName = r.values[r.pickIndex];
		} else if (lines[i].startsWith("------ Pack 1: ")) {
			// Logs seem bugged, this pack header is repeated for almost each pick in pack 1 and absent in subsequent packs.
			// We can still sometimes extract some set hints from it.
			if (!setHint) {
				const m = lines[i].match(/------ Pack 1: (?<set>[\w ]+) ------/);
				if (m) {
					const set = m.groups?.set.toLowerCase();
					if (set && set in Constants.PrimarySets) setHint = set;
				}
			}
		} else if (lines[i].startsWith("Pack ")) {
			// Logs are bugged: Pick numbers are completely wrong, we have to ignore them and rely on their order in the file.
			const m = lines[i].match(/Pack (?<pack>\d+) pick (?<pick>\d+):/);
			if (m && m.groups) {
				const pack = parseInt(m.groups.pack) - 1;
				const r = parseListWithPick(lines, i + 1);
				picks.push({
					packNum: pack,
					pickNum:
						picks.length === 0 || picks[picks.length - 1].packNum !== pack
							? 0
							: picks[picks.length - 1].pickNum + 1,
					pick: [r.pickIndex],
					burn: [],
					booster: r.values.map((cardName) => searchCard(cardName, setHint)),
				});
				i = r.lineIndex;
			}
		}
	}
	console.error(picks);
	const carddata: Record<string, Card> = {};
	for (const pick of picks) for (const cid of pick.booster) if (!carddata[cid]) carddata[cid] = getCard(cid);

	const players: UsersData = {};
	players[userID] = {
		userID: userID,
		userName: playerName,
		isBot: false,
		isReplaced: false,
		isDisconnected: false,
	};
	const draftLog = new DraftLog("Draft", session, carddata, [], players);

	draftLog.time = time;
	draftLog.lastUpdated = time;

	draftLog.users[userID].picks = picks;

	return draftLog;
}

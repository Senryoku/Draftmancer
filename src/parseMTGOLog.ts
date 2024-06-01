import { Card, CardID } from "./CardTypes";
import { UserID } from "./IDTypes";
import { UserData } from "./Session/SessionTypes";
import { Constants } from "./Constants.js";
import { DraftLog, DraftPick } from "./DraftLog.js";
import { matchCardVersion } from "./parseCardList.js";
import { getCard } from "./Cards.js";
import { SocketError } from "./Message.js";
import { SetsInfos } from "./SetInfos.js";

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

function searchMTGOCard(cardName: string, setHint?: string): CardID {
	let cid = matchCardVersion(cardName, setHint, undefined, true);
	if (!cid) {
		// Convert double face cards MTGO syntax to MTGA syntax.
		if (cardName.includes("/")) {
			cid = matchCardVersion(cardName.replace("/", " // "), setHint, undefined, true);
			if (!cid) cid = matchCardVersion(cardName.replace("/", " /// "), setHint, undefined, true);
		}
	}
	if (!cid) throw Error(`Card not found: ${cardName}`);
	return cid;
}

export function parseMTGOLog(userID: UserID, txt: string): SocketError | DraftLog {
	try {
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
		let setHint: string | undefined = undefined;
		const picks: DraftPick[] = [];
		const cards: CardID[] = [];

		for (let i = 0; i < lines.length; ++i) {
			if (lines[i].startsWith("Event #:")) {
				session.id = "MTGO " + lines[i].substring("Event #: ".length, lines[i].length);
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
						const setName = m.groups?.set;
						const setCode = Object.values(SetsInfos).find((setInfo) => setInfo.fullName === setName)?.code;
						if (setCode && setCode in Constants.PrimarySets) setHint = setCode;
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
						booster: r.values.map((cardName) => searchMTGOCard(cardName, setHint)),
					});
					cards.push(picks[picks.length - 1].booster[r.pickIndex]);
					i = r.lineIndex;
				}
			}
		}

		const carddata: Record<string, Card> = {};
		for (const pick of picks) for (const cid of pick.booster) if (!carddata[cid]) carddata[cid] = getCard(cid);

		const players: Record<UserID, UserData> = {};
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
		draftLog.users[userID].cards = cards;

		return draftLog;
	} catch (e: unknown) {
		if (e instanceof Error) return new SocketError("Error parsing MTGO log", e.message);
		return new SocketError("Error parsing MTGO log");
	}
}

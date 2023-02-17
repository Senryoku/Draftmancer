import { Card, CardID, DeckList, UniqueCard } from "./CardTypes.js";
import { SessionID, UserID } from "./IDTypes.js";
import { Session, UsersData } from "./Session.js";

export type DraftPick = { pick: number[]; burn?: number[]; booster: CardID[] };
export type GridDraftPick = { pick: number[]; burn?: number[]; booster: (CardID | null)[] };
export type WinstonDraftPick =
	| {
			randomCard: CardID;
			piles: UniqueCard[][];
	  }
	| {
			pickedPile: number;
			piles: UniqueCard[][];
	  };

export type GenericDraftPick = DraftPick | GridDraftPick | WinstonDraftPick;

export type DraftLogUserData = {
	userID: UserID;
	userName: string;
	isBot: boolean;
	picks: GenericDraftPick[];
	cards: CardID[];
	decklist?: DeckList;
};

export type DraftLogUsersData = {
	[uid: UserID]: DraftLogUserData;
};

export class DraftLog {
	version: string = "2.0";
	type: string;
	users: DraftLogUsersData = {};
	sessionID: SessionID;
	time: number;
	setRestriction: string[];
	useCustomBoosters: boolean;
	customBoosters: string[] = [];
	boosters: CardID[][];
	carddata: { [cid: string]: Card };

	delayed: boolean = false;
	personalLogs: boolean = true; // Necessary for the front-end to know when not to show the owner its own draft log
	teamDraft: boolean = false;

	constructor(type: string, session: Session, carddata: { [cid: string]: Card }, virtualPlayers: UsersData) {
		this.type = type;
		this.sessionID = session.id;
		this.time = Date.now();
		this.setRestriction = session.setRestriction;
		this.useCustomBoosters = session.customBoosters.some((v: string) => v !== "");
		this.customBoosters = this.useCustomBoosters ? session.customBoosters : [];
		this.boosters = session.boosters.map((b: Card[]) => b.map((c: Card) => c.id));
		this.carddata = carddata;
		this.personalLogs = session.personalLogs;
		this.teamDraft = type === "Draft" && session.teamDraft;

		for (const uid in virtualPlayers)
			this.users[uid] = {
				...(({ userID, userName, isBot }) => ({ userID, userName, isBot }))(virtualPlayers[uid]),
				picks: [],
				cards: [],
			};
	}
}

import { Card, CardID } from "./Cards.js";
import { Connections } from "./Connection.js";
import { SessionID } from "./IDTypes.js";
import { Session, UserInfo } from "./Session.js";

export class DraftLog {
	version: string = "2.0";
	type: string;
	users: any = {};
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

	constructor(type: string, session: Session, carddata: { [cid: string]: Card }, virtualPlayers: UserInfo) {
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

		for (let userID in virtualPlayers) {
			if (virtualPlayers[userID].isBot) {
				this.users[userID] = {
					isBot: true,
					userName: virtualPlayers[userID].instance?.name,
					userID: virtualPlayers[userID].instance?.id,
				};
			} else {
				this.users[userID] = {
					userName: Connections[userID].userName,
					userID: userID,
				};
			}
		}
	}
}

import { Connections } from "./Connection.js";
export class DraftLog {
    version = "2.0";
    type;
    users = {};
    sessionID;
    time;
    setRestriction;
    useCustomBoosters;
    customBoosters = [];
    boosters;
    carddata;
    delayed = false;
    teamDraft = false;
    constructor(type, session, carddata, virtualPlayers) {
        this.type = type;
        this.sessionID = session.id;
        this.time = Date.now();
        this.setRestriction = session.setRestriction;
        this.useCustomBoosters = session.customBoosters.some((v) => v !== "");
        this.boosters = session.boosters.map((b) => b.map((c) => c.id));
        this.carddata = carddata;
        for (let userID in virtualPlayers) {
            if (virtualPlayers[userID].isBot) {
                this.users[userID] = {
                    isBot: true,
                    userName: virtualPlayers[userID].instance?.name,
                    userID: virtualPlayers[userID].instance?.id,
                };
            }
            else {
                this.users[userID] = {
                    userName: Connections[userID].userName,
                    userID: userID,
                };
            }
        }
    }
}

import { UniqueCard } from "./CardTypes.js";
import { IDraftState } from "./IDraftState.js";
import { UserID } from "./IDTypes";

export class TeamSealedCard extends UniqueCard {
	owner: UserID | null = null;
}

export type TeamSealedPool = { cards: TeamSealedCard[]; team: Array<UserID> };

export class TeamSealedState extends IDraftState {
	teamPools: TeamSealedPool[] = [];

	constructor() {
		super("teamSealed");
	}

	syncData(userID: UserID) {
		for (const teamPool of this.teamPools) if (teamPool.team.includes(userID)) return teamPool;
		return null;
	}
}

export type TeamSealedSyncData = ReturnType<TeamSealedState["syncData"]>;

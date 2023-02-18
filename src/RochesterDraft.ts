import { UniqueCard } from "./CardTypes.js";
import { IDraftState, TurnBased } from "./IDraftState.js";
import { UserID } from "./IDTypes.js";
import { PickSummary } from "./PickSummary.js";
import { negMod } from "./utils.js";

export class RochesterDraftState extends IDraftState implements TurnBased {
	players: Array<UserID>;
	pickNumber = 0;
	boosterNumber = 0;
	boosters: Array<Array<UniqueCard>> = [];
	boosterCount: number;
	lastPicks: PickSummary[] = [];
	constructor(players: Array<UserID>, boosters: Array<Array<UniqueCard>>) {
		super("rochester");
		this.players = players;
		this.boosters = boosters;
		this.boosterCount = this.boosters.length;
	}

	currentPlayer() {
		const startingDirection = Math.floor(this.boosterNumber / this.players.length) % 2;
		const direction = Math.floor(this.pickNumber / this.players.length) % 2;
		const offset = direction
			? this.players.length - 1 - (this.pickNumber % this.players.length)
			: this.pickNumber % this.players.length;
		return this.players[negMod(this.boosterNumber + (startingDirection ? 1 : -1) * offset, this.players.length)];
	}

	syncData() {
		return {
			pickNumber: this.pickNumber,
			boosterNumber: this.boosterNumber,
			currentPlayer: this.currentPlayer(),
			booster: this.boosters[0],
			boosterCount: this.boosterCount,
			lastPicks: this.lastPicks,
		};
	}
}

export type RochesterDraftSyncDataType = ReturnType<RochesterDraftState["syncData"]>;

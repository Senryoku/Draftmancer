import { UniqueCard } from "./CardTypes.js";
import { IDraftState, TurnBased } from "./IDraftState.js";
import { UserID } from "./IDTypes.js";
import { PickSummary } from "./PickSummary.js";
import { shuffleArray } from "./utils.js";

export type GridDraftSyncData = {
	round: number;
	currentPlayer: string;
	booster: (UniqueCard | null)[];
	boosterCount: number;
	lastPicks: PickSummary[];
};

export class GridDraftState extends IDraftState implements TurnBased {
	round = 0;
	boosters: Array<Array<UniqueCard | null>> = []; // Array of [3x3 Grid, Row-Major order]
	players: Array<UserID>;
	error: any;
	boosterCount: number;
	lastPicks: PickSummary[] = [];
	constructor(players: Array<UserID>, boosters: Array<Array<UniqueCard>>) {
		super("grid");
		this.players = players;
		if (boosters) {
			for (const booster of boosters) {
				if (booster.length > 9) booster.length = 9;
				if (booster.length < 9)
					this.error = {
						title: "Not enough cards in boosters.",
						text: "At least one booster has less than 9 cards.",
					};
				shuffleArray(booster);
				this.boosters.push(booster);
			}
		}
		this.boosterCount = this.boosters.length;
	}

	currentPlayer() {
		return this.players[[0, 1, 1, 0][this.round % 4]];
	}

	syncData(): GridDraftSyncData {
		return {
			round: this.round,
			currentPlayer: this.currentPlayer(),
			booster: this.boosters[0],
			boosterCount: this.boosterCount,
			lastPicks: this.lastPicks,
		};
	}
}

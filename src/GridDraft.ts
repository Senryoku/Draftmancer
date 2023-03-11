import { UniqueCard } from "./CardTypes.js";
import { IDraftState, TurnBased } from "./IDraftState.js";
import { UserID } from "./IDTypes.js";
import { MessageError } from "./Message.js";
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
	error?: MessageError;
	boosterCount: number;
	lastPicks: PickSummary[] = [];
	constructor(players: Array<UserID>, boosters: Array<Array<UniqueCard>>) {
		super("grid");
		this.players = players;
		const cardsPerBooster = this.players.length === 3 ? 12 : 9;
		for (const booster of boosters) {
			if (booster.length > cardsPerBooster) booster.length = cardsPerBooster;
			if (booster.length < cardsPerBooster)
				this.error = new MessageError(
					"Not enough cards in boosters.",
					`At least one booster has less than ${cardsPerBooster} cards.`
				);
			shuffleArray(booster);
			this.boosters.push(booster);
		}
		this.boosterCount = this.boosters.length;
	}

	currentPlayer() {
		if (this.players.length === 3)
			return this.players[[0, 1, 2, 1, 2, 0, 2, 0, 1, 0, 2, 1, 2, 1, 0, 1, 0, 2][this.round % (3 * 3 * 2)]];
		return this.players[[0, 1, 1, 0][this.round % 4]];
	}

	syncData(): GridDraftSyncData {
		return {
			round: this.round,
			currentPlayer: this.currentPlayer(),
			booster: this.boosters[0].length > 0 ? this.boosters[0].slice(0, 9) : this.boosters[0],
			boosterCount: this.boosterCount,
			lastPicks: this.lastPicks,
		};
	}
}

export function isGridDraftState(obj: IDraftState): obj is GridDraftState {
	return obj instanceof GridDraftState;
}

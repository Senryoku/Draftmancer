import { UniqueCard } from "./CardTypes.js";
import { IDraftState, TurnBased } from "./IDraftState.js";
import { UserID } from "./IDTypes.js";
import { MessageError } from "./Message.js";
import { PickSummary } from "./PickSummary.js";
import { shuffleArray } from "./utils.js";

export type GridDraftSyncData = {
	round: number;
	currentPlayer: string | null;
	booster: (UniqueCard | null)[];
	boosterCount: number;
	lastPicks: PickSummary[];
	twoPicksPerGrid: boolean;
};

export class GridDraftState extends IDraftState implements TurnBased {
	round = 0;
	boosters: (UniqueCard | null)[][] = []; // Array of [3x3 Grid, Row-Major order]
	players: UserID[];
	error?: MessageError;
	twoPicksPerGrid: boolean;
	boosterCount: number;
	lastPicks: PickSummary[] = [];
	constructor(players: UserID[], boosters: UniqueCard[][], twoPicksPerGrid: boolean) {
		super("grid");
		this.players = players;
		const cardsPerBooster = this.players.length > 2 || twoPicksPerGrid ? 12 : 9;
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
		this.twoPicksPerGrid = twoPicksPerGrid;
	}

	currentPlayer() {
		if (this.players.length === 4)
			return this.players[
				[
					[0, 1, 2, 3],
					[1, 2, 3, 0],
					[2, 3, 0, 1],
					[3, 0, 1, 2],
					[0, 3, 2, 1],
					[3, 2, 1, 0],
					[2, 1, 0, 3],
					[1, 0, 3, 2],
				][Math.floor(this.round / 4) % 8][this.round % 4]
			];
		if (this.players.length === 3)
			return this.players[[0, 1, 2, 1, 2, 0, 2, 0, 1, 0, 2, 1, 2, 1, 0, 1, 0, 2][this.round % (3 * 3 * 2)]];
		if (this.twoPicksPerGrid)
			return this.players[
				[
					[0, 1, 0, 1],
					[1, 0, 1, 0],
				][Math.floor(this.round / 4) % 2][this.round % 4]
			];

		return this.players[[0, 1, 1, 0][this.round % 4]];
	}

	syncData(): GridDraftSyncData {
		return {
			round: this.round,
			currentPlayer: this.currentPlayer(),
			booster: this.boosters[0].length > 0 ? this.boosters[0].slice(0, 9) : this.boosters[0],
			boosterCount: this.boosterCount,
			lastPicks: this.lastPicks,
			twoPicksPerGrid: this.twoPicksPerGrid,
		};
	}
}

export function isGridDraftState(obj: unknown): obj is GridDraftState {
	return obj instanceof GridDraftState;
}

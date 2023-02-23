import { UniqueCard } from "./CardTypes.js";
import { PickSummary } from "./PickSummary.js";

export enum MinesweeperCellState {
	Hidden = 0,
	Revealed = 1,
	Picked = 2,
}

export type MinesweeperSyncData = {
	gridCount: number;
	gridNumber: number;
	picksPerGrid: number;
	pickNumber: number;
	currentPlayer: string;
	grid: { state: MinesweeperCellState; card: UniqueCard | undefined }[][];
	lastPicks: PickSummary[];
};

export type MinesweeperGridUpdate = {
	coords: [number, number];
	state: MinesweeperCellState;
	card?: UniqueCard | undefined;
};

export type MinesweeperSyncDataDiff = {
	pickNumber: number;
	currentPlayer: string;
	lastPicks: PickSummary[];
	gridUpdates: MinesweeperGridUpdate[];
};

export function minesweeperApplyDiff(state: MinesweeperSyncData, diff: MinesweeperSyncDataDiff) {
	state.currentPlayer = diff.currentPlayer;
	state.lastPicks = diff.lastPicks;
	state.pickNumber = diff.pickNumber;
	for (const update of diff.gridUpdates) {
		state.grid[update.coords[0]][update.coords[1]].state = update.state;
		if (update.card) state.grid[update.coords[0]][update.coords[1]].card = update.card;
	}
}

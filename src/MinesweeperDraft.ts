import { isUniqueCard } from "./CardTypeCheck.js";
import { UniqueCard } from "./CardTypes.js";
import { IDraftState, TurnBased } from "./IDraftState.js";
import { UserID } from "./IDTypes.js";
import { MinesweeperCellState, MinesweeperSyncData, MinesweeperSyncDataDiff } from "./MinesweeperDraftTypes.js";
import { PickSummary, isPickSummary } from "./PickSummary.js";
import { hasProperty, isArray, isArrayOf, isNumber, isObject, isSomeEnum, isString } from "./TypeChecks.js";
import { negMod } from "./utils.js";

export class MinesweeperCell {
	state: MinesweeperCellState = MinesweeperCellState.Hidden;
	card: UniqueCard;

	reveal(): boolean {
		if (this.state === MinesweeperCellState.Hidden) {
			this.state = MinesweeperCellState.Revealed;
			return true;
		}
		return false;
	}

	pick() {
		if (this.state === MinesweeperCellState.Revealed) this.state = MinesweeperCellState.Picked;
	}

	constructor(card: UniqueCard) {
		this.card = card;
	}

	static deserialize(data: unknown): MinesweeperCell | undefined {
		if (!isObject(data)) return;
		if (!hasProperty("state", isSomeEnum(MinesweeperCellState))(data)) return;
		if (!hasProperty("card", isUniqueCard)(data)) return;

		const r = new MinesweeperCell(data.card);
		r.state = data.state;
		return r;
	}
}

export class MinesweeperGrid {
	state: Array<Array<MinesweeperCell>> = []; // Row-Major order

	constructor(cards: Array<UniqueCard>, width: number, height: number, options: { revealBorders?: boolean } = {}) {
		if (cards.length === 0 || width <= 0 || height <= 0) return;

		for (let i = 0; i < height; i++) {
			this.state.push([]);
			for (let j = 0; j < width; j++) {
				this.state[i].push(new MinesweeperCell(cards.pop()!));
			}
		}
		if (options.revealBorders) {
			for (let j = 0; j < width; j++) {
				this.state[0][j].reveal();
				this.state[height - 1][j].reveal();
			}
			for (let i = 0; i < height; i++) {
				this.state[i][0].reveal();
				this.state[i][width - 1].reveal();
			}
		}
		// Reveal the middle card(s)
		let rowStart = Math.floor(height / 2);
		const rowEnd = rowStart + 1;
		if (height % 2 === 0) --rowStart;
		let colStart = Math.floor(width / 2);
		const colEnd = colStart + 1;
		if (width % 2 === 0) --colStart;

		for (let i = rowStart; i < rowEnd; i++) {
			for (let j = colStart; j < colEnd; j++) {
				this.state[i][j].reveal();
			}
		}
		if (height % 2 === 1 && width % 2 === 1) {
			this.get(rowStart - 1, colStart)?.reveal();
			this.get(rowStart + 1, colStart)?.reveal();
			this.get(rowStart, colStart - 1)?.reveal();
			this.get(rowStart, colStart + 1)?.reveal();
		}
	}

	pick(row: number, col: number) {
		const cellUpdates: { coords: [number, number]; state: MinesweeperCellState; card?: UniqueCard }[] = [
			{ coords: [row, col], state: MinesweeperCellState.Picked },
		];
		this.get(row, col)?.pick();
		for (const [r, c] of [
			[row - 1, col],
			[row + 1, col],
			[row, col - 1],
			[row, col + 1],
		]) {
			if (this.get(r, c)?.reveal())
				cellUpdates.push({
					coords: [r, c],
					state: this.get(r, c)!.state,
					card: this.get(r, c)!.card,
				});
		}
		return cellUpdates;
	}

	get(row: number, col: number) {
		if (row < 0 || row >= this.state.length || col < 0 || col >= this.state[row].length) return null;
		return this.state[row][col];
	}

	width() {
		return this.state[0].length;
	}
	height() {
		return this.state.length;
	}

	static deserialize(data: unknown): MinesweeperGrid | undefined {
		if (!isObject(data)) return;
		if (!hasProperty("state", isArrayOf(isArray))(data)) return;
		const r = new MinesweeperGrid([], 0, 0);
		for (const row of data.state) {
			r.state.push([]);
			for (const cell of row) {
				const deserialized = MinesweeperCell.deserialize(cell);
				if (deserialized === undefined) return;
				r.state[r.state.length - 1].push(deserialized);
			}
		}
		return r;
	}
}

export class MinesweeperDraftState extends IDraftState implements TurnBased {
	players: Array<UserID>;
	grids: Array<MinesweeperGrid> = [];
	gridWidth = 1;
	gridHeight = 1;
	pickNumber = 0;
	gridNumber = 0;
	picksPerGrid = 2;
	lastPicks: PickSummary[] = [];

	// Warning: this will empty the packs.
	constructor(
		players: Array<UserID>,
		packs: Array<Array<UniqueCard>>,
		gridWidth: number,
		gridHeight: number,
		picksPerGrid: number,
		options: { revealBorders?: boolean } = {}
	) {
		super("minesweeper");
		this.players = players;
		this.gridWidth = gridWidth;
		this.gridHeight = gridHeight;
		this.picksPerGrid = picksPerGrid;
		for (const p of packs) this.grids.push(new MinesweeperGrid(p, gridWidth, gridHeight, options));
	}

	grid() {
		return this.grids[this.gridNumber];
	}

	currentPlayer() {
		const startingDirection = Math.floor(this.gridNumber / this.players.length) % 2;
		const direction = Math.floor(this.pickNumber / this.players.length) % 2;
		const offset = direction
			? this.players.length - 1 - (this.pickNumber % this.players.length)
			: this.pickNumber % this.players.length;
		return this.players[negMod(this.gridNumber + (startingDirection ? -1 : 1) * offset, this.players.length)];
	}

	pick(row: number, col: number, userName: string): MinesweeperSyncDataDiff {
		const gridUpdated = this.grid().pick(row, col);
		++this.pickNumber;

		this.lastPicks.unshift({
			userName: userName,
			round: this.lastPicks.length === 0 ? 0 : this.lastPicks[0].round + 1,
			cards: [this.grid().get(row, col)!.card],
		});
		if (this.lastPicks.length > 2) this.lastPicks.pop();

		return {
			pickNumber: this.pickNumber,
			currentPlayer: this.currentPlayer(),
			lastPicks: this.lastPicks,
			gridUpdates: gridUpdated,
		};
	}

	// Should be called after every pick
	// Will move to the next grid and return true if necessary.
	advance() {
		if (this.pickNumber == this.picksPerGrid) {
			this.pickNumber = 0;
			++this.gridNumber;
			return true;
		}
		return false;
	}

	// Should be checked if advance() returned true.
	// Returns true if the game is over.
	done() {
		return this.gridNumber >= this.grids.length;
	}

	// Remove unnecessary card information from the grid before sharing it with players
	strippedGrid() {
		const ret: { state: MinesweeperCellState; card: UniqueCard | undefined }[][] = [];
		for (const row of this.grid().state) {
			ret.push([]);
			for (const cell of row) {
				ret[ret.length - 1].push({
					state: cell.state,
					card: cell.state === MinesweeperCellState.Hidden ? undefined : cell.card,
				});
			}
		}
		return ret;
	}

	syncData(): MinesweeperSyncData {
		const grid = this.strippedGrid();
		return {
			gridCount: this.grids.length,
			gridNumber: this.gridNumber,
			picksPerGrid: this.picksPerGrid,
			pickNumber: this.pickNumber,
			currentPlayer: this.currentPlayer(),
			grid: grid,
			lastPicks: this.lastPicks,
		};
	}

	static deserialize(data: unknown): MinesweeperDraftState | undefined {
		if (!isObject(data)) return;
		if (!hasProperty("players", isArrayOf(isString))(data)) return;
		if (!hasProperty("grids", isArray)(data)) return;
		if (!hasProperty("gridWidth", isNumber)(data)) return;
		if (!hasProperty("gridHeight", isNumber)(data)) return;
		if (!hasProperty("pickNumber", isNumber)(data)) return;
		if (!hasProperty("gridNumber", isNumber)(data)) return;
		if (!hasProperty("picksPerGrid", isNumber)(data)) return;
		if (!hasProperty("lastPicks", isArrayOf(isPickSummary))(data)) return;

		const r = new MinesweeperDraftState([], [], 0, 0, 0);
		r.players = data.players;
		r.grids = [];
		for (const grid of data.grids) {
			const deserialized = MinesweeperGrid.deserialize(grid);
			if (!deserialized) return;
			r.grids.push(deserialized);
		}
		r.gridWidth = data.gridWidth;
		r.gridHeight = data.gridHeight;
		r.pickNumber = data.pickNumber;
		r.gridNumber = data.gridNumber;
		r.picksPerGrid = data.picksPerGrid;
		r.lastPicks = data.lastPicks;
		return r;
	}
}

export function isMinesweeperDraftState(state: unknown): state is MinesweeperDraftState {
	return state instanceof MinesweeperDraftState;
}

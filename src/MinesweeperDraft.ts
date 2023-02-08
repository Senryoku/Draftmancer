import { Card } from "./Cards.js";
import { IDraftState, TurnBased } from "./IDraftState.js";
import { UserID } from "./IDTypes.js";
import { negMod, Options } from "./utils.js";

export enum MinesweeperCellState {
	Hidden = 0,
	Revealed = 1,
	Picked = 2,
}

export class MinesweeperCell {
	state: MinesweeperCellState = MinesweeperCellState.Hidden;
	card: Card | undefined;

	reveal() {
		if (this.state === MinesweeperCellState.Hidden) {
			this.state = MinesweeperCellState.Revealed;
		}
	}

	pick() {
		if (this.state === MinesweeperCellState.Revealed) {
			this.state = MinesweeperCellState.Picked;
		}
	}

	constructor(card: Card) {
		this.card = card;
	}
}

export class MinesweeperGrid {
	state: Array<Array<MinesweeperCell>> = []; // Row-Major order

	constructor(cards: Array<Card>, width: number, height: number, options: Options = {}) {
		for (let i = 0; i < height; i++) {
			this.state.push([]);
			for (let j = 0; j < width; j++) {
				this.state[i].push(new MinesweeperCell(cards.pop() as Card));
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
		if (height % 2 === 1 && width % 2 === 1) {
		}

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
		this.get(row, col)?.pick();
		this.get(row - 1, col)?.reveal();
		this.get(row + 1, col)?.reveal();
		this.get(row, col - 1)?.reveal();
		this.get(row, col + 1)?.reveal();
	}

	get(row: number, col: number) {
		if (row < 0 || row >= this.state.length || col < 0 || col >= this.state[row].length) return null;
		return this.state[row][col];
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
	lastPicks: { userName: string; round: number; cards: Card[] }[] = [];

	// Warning: this will empty the packs.
	constructor(
		players: Array<UserID>,
		packs: Array<Array<Card>>,
		gridWidth: number,
		gridHeight: number,
		picksPerGrid: number,
		options: Options = {}
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

	pick(row: number, col: number) {
		this.grid().pick(row, col);
		++this.pickNumber;
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
		const ret: any = [];
		let rowIdx = 0;
		for (const row of this.grid().state) {
			ret.push([]);
			for (const cell of row) {
				ret[rowIdx].push({ ...cell });
				if (cell.state === MinesweeperCellState.Hidden) ret[rowIdx][ret[rowIdx].length - 1].card = undefined;
			}
			++rowIdx;
		}
		return ret;
	}

	syncData() {
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
}

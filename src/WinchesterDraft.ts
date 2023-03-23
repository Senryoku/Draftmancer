import { UniqueCard } from "./CardTypes.js";
import { IDraftState, TurnBased } from "./IDraftState.js";
import { UserID } from "./IDTypes.js";
import { shuffleArray } from "./utils.js";

export class WinchesterDraftState extends IDraftState implements TurnBased {
	players: UserID[];
	round = 0;
	cardPool: UniqueCard[] = [];
	piles: UniqueCard[][] = [];

	constructor(players: UserID[], boosters: UniqueCard[][], pilesCount: number = 4) {
		super("winchester");
		this.players = players;
		for (const booster of boosters) this.cardPool.push(...booster);
		shuffleArray(this.cardPool);
		for (let i = 0; i < pilesCount; i++) this.piles.push([]);
		this.refill();
	}

	refill() {
		for (const pile of this.piles) if (this.cardPool.length > 0) pile.push(this.cardPool.pop()!);
	}

	done(): boolean {
		return this.cardPool.length === 0 && this.piles.every((pile) => pile.length === 0);
	}

	currentPlayer() {
		return this.players[this.round % this.players.length];
	}

	syncData() {
		return {
			round: this.round,
			currentPlayer: this.currentPlayer(),
			piles: this.piles,
			remainingCards: this.cardPool.length,
		};
	}
}

export type WinchesterDraftSyncData = ReturnType<WinchesterDraftState["syncData"]>;

export function isWinchesterDraftState(s: IDraftState): s is WinchesterDraftState {
	return s instanceof WinchesterDraftState;
}

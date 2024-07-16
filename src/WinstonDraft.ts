import { UniqueCard, UniqueCardID } from "./CardTypes.js";
import { IDraftState, TurnBased } from "./IDraftState.js";
import { UserID } from "./IDTypes.js";
import { shuffleArray } from "./utils.js";

export class WinstonDraftState extends IDraftState implements TurnBased {
	players: Array<UserID>;
	round = -1; // Will be immediately incremented
	cardPool: Array<UniqueCard> = [];
	piles: UniqueCard[][] = [];
	currentPile: number = 0;

	constructor(players: Array<UserID>, boosters: UniqueCard[][], pileCount: number) {
		super("winston");
		this.players = players;
		if (boosters) {
			for (const booster of boosters) this.cardPool.push(...booster);
			shuffleArray(this.cardPool);
		}
		for (let i = 0; i < pileCount; ++i) this.piles.push([]);
		if (this.cardPool.length >= pileCount) {
			for (let i = 0; i < pileCount; ++i) {
				this.piles[i].push(this.cardPool.pop()!);
			}
		}
	}

	currentPlayer() {
		return this.players[this.round % this.players.length];
	}

	syncData(uid: UserID) {
		const currentPlayer = this.currentPlayer();
		// Strip useless card information
		const piles: ({ uniqueID: UniqueCardID } | UniqueCard)[][] = this.piles.map((p) =>
			p.map((c) => {
				return {
					uniqueID: c.uniqueID,
				};
			})
		);
		// Only send full information of the current pile if we're the current player
		if (uid === currentPlayer) piles[this.currentPile] = this.piles[this.currentPile];
		return {
			round: this.round,
			currentPlayer,
			piles,
			currentPile: this.currentPile,
			remainingCards: this.cardPool.length,
		};
	}
}

export type WinstonDraftSyncData = ReturnType<WinstonDraftState["syncData"]>;

export function isWinstonDraftState(s: unknown): s is WinstonDraftState {
	return s instanceof WinstonDraftState;
}

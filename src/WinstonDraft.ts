import { UniqueCard, UniqueCardID } from "./CardTypes.js";
import { IDraftState, TurnBased } from "./IDraftState.js";
import { UserID } from "./IDTypes.js";
import { shuffleArray } from "./utils.js";

export class WinstonDraftState extends IDraftState implements TurnBased {
	players: Array<UserID>;
	round = -1; // Will be immediately incremented
	cardPool: Array<UniqueCard> = [];
	piles: [Array<UniqueCard>, Array<UniqueCard>, Array<UniqueCard>] = [[], [], []];
	currentPile: number = 0;

	constructor(players: Array<UserID>, boosters: Array<Array<UniqueCard>>) {
		super("winston");
		this.players = players;
		if (boosters) {
			for (const booster of boosters) this.cardPool.push(...booster);
			shuffleArray(this.cardPool);
		}
		if (this.cardPool.length >= 3)
			this.piles = [
				[this.cardPool.pop() as UniqueCard],
				[this.cardPool.pop() as UniqueCard],
				[this.cardPool.pop() as UniqueCard],
			];
	}

	currentPlayer() {
		return this.players[this.round % 2];
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

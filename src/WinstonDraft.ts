import { UniqueCard } from "./CardTypes.js";
import { IDraftState, TurnBased } from "./IDraftState.js";
import { UserID } from "./IDTypes.js";
import { shuffleArray } from "./utils.js";

export class WinstonDraftState extends IDraftState implements TurnBased {
	players: Array<UserID>;
	round = -1; // Will be immedialty incremented
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

	syncData() {
		return {
			round: this.round,
			currentPlayer: this.currentPlayer(),
			piles: this.piles,
			currentPile: this.currentPile,
			remainingCards: this.cardPool.length,
		};
	}
}

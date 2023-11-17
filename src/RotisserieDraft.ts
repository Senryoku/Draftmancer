import { UniqueCard, UniqueCardID } from "./CardTypes.js";
import { IDraftState, TurnBased } from "./IDraftState.js";
import { UserID } from "./IDTypes";
import { SocketError } from "./Message.js";

export type RotisserieDraftStartOptions = {
	singleton?: { cardsPerPlayer: number; exactCardCount: boolean };
	standard?: { boostersPerPlayer: number };
};

export class RotisserieDraftCard extends UniqueCard {
	owner: UserID | null = null;
}

export class RotisserieDraftState extends IDraftState implements TurnBased {
	readonly players: UserID[];
	readonly cards: RotisserieDraftCard[];
	readonly cardsPerPlayer: number;

	pickNumber = 0;
	lastPicks: UniqueCardID[] = [];

	constructor(players: UserID[], cards: UniqueCard[], cardsPerPlayer: number) {
		super("rotisserie");
		this.players = players;
		this.cards = cards.map((card) => {
			return { ...card, owner: null };
		});
		this.cardsPerPlayer = cardsPerPlayer;
	}

	syncData(userID: UserID) {
		return {
			cards: this.cards,
			pickNumber: this.pickNumber,
			currentPlayer: this.currentPlayer(),
			lastPicks: this.lastPicks,
		};
	}

	currentPlayer(): UserID {
		const idx = this.pickNumber % (2 * this.players.length);
		if (idx < this.players.length) return this.players[idx];
		return this.players[this.players.length - 1 - (idx - this.players.length)];
	}

	pick(uniqueID: UniqueCardID): (UniqueCard & { owner: UserID }) | SocketError {
		const card = this.cards.find((c) => c.uniqueID === uniqueID);
		if (!card) return new SocketError("Invalid Card", "Card not found.");
		if (card.owner !== null) return new SocketError("Invalid Card", "Card already picked.");
		card.owner = this.currentPlayer();

		++this.pickNumber;

		this.lastPicks.push(card.uniqueID);
		if (this.lastPicks.length > 8) this.lastPicks.shift();

		return card as UniqueCard & { owner: UserID };
	}

	// Returns true when the last card has been picked
	done(): boolean {
		return this.pickNumber >= Math.min(this.players.length * this.cardsPerPlayer, this.cards.length);
	}
}

export function isRotisserieDraftState(obj: unknown): obj is RotisserieDraftState {
	return obj instanceof RotisserieDraftState;
}

export type RotisserieDraftSyncData = ReturnType<RotisserieDraftState["syncData"]>;

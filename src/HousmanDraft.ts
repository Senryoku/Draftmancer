import { UniqueCard } from "./CardTypes.js";
import { IDraftState, TurnBased } from "./IDraftState.js";
import { UserID } from "./IDTypes.js";
import { shuffleArray } from "./utils.js";

export class HousmanDraftState extends IDraftState implements TurnBased {
	// Settings
	readonly players: UserID[];
	readonly handSize: number;
	readonly revealedCardsCount: number;
	readonly exchangeCount: number; // Exchange per player each round
	readonly roundCount: number;
	// State
	exchangeNum = 0; // Number of current exchange this round ([0, exchangeCount*players.length[)
	roundNum = 0; // [0, roundCount[
	cardPool: UniqueCard[] = [];
	revealedCards: UniqueCard[] = [];
	playerHands: Record<UserID, UniqueCard[]> = {};

	constructor(
		players: UserID[],
		cardPool: UniqueCard[],
		handSize: number = 5,
		revealedCardsCount: number = 9,
		exchangeCount: number = 3,
		roundCount: number = 9
	) {
		super("housman");
		this.players = players;
		this.cardPool = cardPool;
		shuffleArray(this.cardPool);
		this.handSize = handSize;
		this.revealedCardsCount = revealedCardsCount;
		this.exchangeCount = exchangeCount;
		this.roundCount = roundCount;
		this.nextRound();
	}

	// Returns true if this was the last exchange of this round
	exchange(handIndex: number, revealedCardsIndex: number): boolean {
		[this.revealedCards[revealedCardsIndex], this.playerHands[this.currentPlayer()][handIndex]] = [
			this.playerHands[this.currentPlayer()][handIndex],
			this.revealedCards[revealedCardsIndex],
		];
		++this.exchangeNum;
		return this.exchangeNum >= this.exchangeCount * this.players.length;
	}

	// Returns true if this was the last round
	nextRound(): boolean {
		++this.roundNum;
		if (this.roundNum >= this.roundCount) return true;
		this.exchangeNum = 0;
		for (const uid of this.players) this.playerHands[uid] = this.cardPool.splice(0, this.handSize);
		this.revealedCards = this.cardPool.splice(0, this.revealedCardsCount);
		return false;
	}

	done(): boolean {
		return this.roundNum >= this.roundCount;
	}

	currentPlayer(): UserID {
		return this.players[(this.roundNum + this.exchangeNum) % this.players.length];
	}

	syncData(uid: UserID) {
		return {
			exchangeNum: this.exchangeNum,
			roundNum: this.roundNum,
			hand: this.playerHands[uid],
			currentPlayer: this.currentPlayer(),
			revealedCards: this.revealedCards,
			remainingCards: this.cardPool.length,
		};
	}
}

export type HousmanDraftSyncData = ReturnType<HousmanDraftState["syncData"]>;

export function isHousmanDraftState(s: IDraftState): s is HousmanDraftState {
	return s instanceof HousmanDraftState;
}

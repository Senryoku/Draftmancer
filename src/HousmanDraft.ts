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
	roundNum = -1; // [0, roundCount[ Will be immediately incremented.
	cardPool: UniqueCard[] = [];
	revealedCards: UniqueCard[] = [];
	playerHands: Record<UserID, UniqueCard[]> = {};
	lastPicks: { userID: UserID; round: number; exchange: number; cards: [UniqueCard, UniqueCard] }[] = [];

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
		this.cardPool.length = roundCount * (handSize * this.players.length + revealedCardsCount);
		this.handSize = handSize;
		this.revealedCardsCount = revealedCardsCount;
		this.exchangeCount = exchangeCount;
		this.roundCount = roundCount;
		this.nextRound();
	}

	// Returns true if this was the last exchange of this round
	exchange(handIndex: number, revealedCardsIndex: number): boolean {
		const card = this.revealedCards[revealedCardsIndex];
		const currentPlayer = this.currentPlayer();
		this.lastPicks.unshift({
			userID: currentPlayer,
			round: this.roundNum,
			exchange: this.exchangeNum,
			cards: [this.playerHands[currentPlayer][handIndex], card],
		});
		if (this.lastPicks.length > 2) this.lastPicks.length = 2;
		this.revealedCards[revealedCardsIndex] = this.playerHands[currentPlayer][handIndex];
		this.playerHands[currentPlayer][handIndex] = card;
		++this.exchangeNum;
		return this.exchangeNum >= this.exchangeCount * this.players.length;
	}

	// Returns true if this was the last round
	nextRound(): boolean {
		++this.roundNum;
		if (this.roundNum >= this.roundCount) return true;
		this.exchangeNum = 0;
		const drawnCards = this.cardPool.splice(0, this.players.length * this.handSize + this.revealedCardsCount);
		let index = 0;
		for (const uid of this.players) {
			this.playerHands[uid] = drawnCards.slice(index * this.handSize, (index + 1) * this.handSize);
			++index;
		}
		this.revealedCards = drawnCards.slice(-this.revealedCardsCount);
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
			exchangeCount: this.exchangeCount,
			roundCount: this.roundCount,
			exchangeNum: this.exchangeNum,
			roundNum: this.roundNum,
			hand: this.playerHands[uid],
			currentPlayer: this.currentPlayer(),
			revealedCards: this.revealedCards,
			lastPicks: this.lastPicks,
		};
	}
}

export type HousmanDraftSyncData = ReturnType<HousmanDraftState["syncData"]>;

export function isHousmanDraftState(s: unknown): s is HousmanDraftState {
	return s instanceof HousmanDraftState;
}

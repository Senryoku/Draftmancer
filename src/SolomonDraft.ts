import { isUniqueCard } from "./CardTypeCheck.js";
import { UniqueCard } from "./CardTypes.js";
import { IDraftState, TurnBased } from "./IDraftState.js";
import { UserID } from "./IDTypes.js";
import { hasProperty, isArrayOf, isNumber, isObject, isSomeEnum, isString } from "./TypeChecks";
import { shuffleArray } from "./utils.js";

export enum SolomonDraftStep {
	Dividing = "dividing",
	Picking = "picking",
}

export class SolomonDraftState extends IDraftState implements TurnBased {
	// Settings
	readonly players: UserID[];
	readonly cardCount: number;
	readonly roundCount: number;
	// State
	cardPool: UniqueCard[] = [];
	roundNum = -1; // [0, roundCount[ Will be immediately incremented.
	step: SolomonDraftStep = SolomonDraftStep.Dividing;
	piles: [UniqueCard[], UniqueCard[]] = [[], []];
	lastPicks: {
		userID: UserID;
		round: number;
		picks: [{ playerName: string; cards: UniqueCard[] }, { playerName: string; cards: UniqueCard[] }];
	}[] = [];

	constructor(players: UserID[], cardPool: UniqueCard[], cardCount: number = 8, roundCount: number = 10) {
		super("solomon");
		this.players = players;
		this.cardCount = cardCount;
		this.roundCount = roundCount;
		this.cardPool = cardPool;
		shuffleArray(this.cardPool);
		this.cardPool.length = cardCount * roundCount; // Truncate card pool
		this.nextRound();
	}

	// Returns true if this was the last round
	nextRound(): boolean {
		++this.roundNum;
		if (this.roundNum >= this.roundCount || this.cardPool.length < this.cardCount) return true;
		this.piles = [this.cardPool.splice(0, this.cardCount), []];
		return false;
	}

	done(): boolean {
		return this.roundNum >= this.roundCount;
	}

	currentPlayer(): UserID {
		return this.players[
			((this.roundNum % 2) + this.step === SolomonDraftStep.Picking ? 1 : 0) % this.players.length
		];
	}

	syncData(uid: UserID) {
		return {
			roundCount: this.roundCount,
			roundNum: this.roundNum,
			piles: this.piles,
			currentPlayer: this.currentPlayer(),
			lastPicks: this.lastPicks,
		};
	}

	static deserialize(data: unknown): SolomonDraftState | undefined {
		if (!isObject(data)) return undefined;
		if (!hasProperty("players", isArrayOf(isString))(data)) return undefined;
		if (!hasProperty("cardPool", isArrayOf(isUniqueCard))(data)) return undefined;
		if (!hasProperty("cardCount", isNumber)(data)) return undefined;
		if (!hasProperty("roundCount", isNumber)(data)) return undefined;
		if (!hasProperty("roundNum", isNumber)(data)) return undefined;
		if (!hasProperty("step", isSomeEnum(SolomonDraftStep))(data)) return undefined;
		if (
			!hasProperty(
				"piles",
				(x: unknown): x is [UniqueCard[], UniqueCard[]] =>
					isArrayOf(isArrayOf(isUniqueCard))(x) && x.length === 2
			)(data)
		)
			return undefined;
		if (
			!hasProperty(
				"lastPicks",
				isArrayOf(
					(
						x: unknown
					): x is {
						userID: UserID;
						round: number;
						picks: [
							{ playerName: string; cards: UniqueCard[] },
							{ playerName: string; cards: UniqueCard[] }
						];
					} =>
						isObject(x) &&
						hasProperty("userID", isString)(x) &&
						hasProperty("round", isNumber)(x) &&
						hasProperty(
							"picks",
							(
								picks: unknown
							): picks is [
								{ playerName: string; cards: UniqueCard[] },
								{ playerName: string; cards: UniqueCard[] }
							] =>
								isArrayOf(
									(p: unknown): p is { playerName: string; cards: UniqueCard[] } =>
										isObject(p) &&
										hasProperty("playerName", isString)(p) &&
										hasProperty("cards", isArrayOf(isUniqueCard))(p)
								)(picks) && picks.length === 2
						)(x)
				)
			)(data)
		)
			return undefined;

		const s = new SolomonDraftState(data.players, data.cardPool, data.cardCount, data.roundCount);
		s.roundNum = data.roundNum;
		s.step = data.step;
		s.piles = data.piles;
		s.lastPicks = data.lastPicks;
		return s;
	}
}

export type SolomonDraftSyncData = ReturnType<SolomonDraftState["syncData"]>;

export function isSolomonDraftState(s: IDraftState): s is SolomonDraftState {
	return s instanceof SolomonDraftState;
}

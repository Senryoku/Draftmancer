import { isUniqueCard } from "./CardTypeCheck.js";
import { UniqueCard, UniqueCardID } from "./CardTypes.js";
import { IDraftState, TurnBased } from "./IDraftState.js";
import { UserID } from "./IDTypes.js";
import { MessageError } from "./Message.js";
import { hasProperty, isArrayOf, isNumber, isObject, isString } from "./TypeChecks.js";
import { shuffleArray } from "./utils.js";

export type SolomonDraftStep = "dividing" | "picking";

export class SolomonDraftState extends IDraftState implements TurnBased {
	// Settings
	readonly players: [UserID, UserID];
	readonly cardCount: number;
	readonly roundCount: number;
	// State
	cardPool: UniqueCard[] = [];
	roundNum = -1; // [0, roundCount[ Will be immediately incremented.
	step: SolomonDraftStep = "dividing";
	piles: [UniqueCard[], UniqueCard[]] = [[], []];
	lastPicks: {
		round: number;
		picks: [UniqueCard[], UniqueCard[]];
	}[] = [];

	constructor(players: [UserID, UserID], cardCount: number = 8, roundCount: number = 10) {
		super("solomon");
		this.players = players;
		this.cardCount = cardCount;
		this.roundCount = roundCount;
	}

	init(cardPool: UniqueCard[]) {
		if (cardPool.length < this.cardCount * this.roundCount) throw new Error("Not enough cards");
		this.cardPool = cardPool;
		shuffleArray(this.cardPool);
		// Truncate card pool
		if (this.cardPool.length > this.cardCount * this.roundCount)
			this.cardPool.length = this.cardCount * this.roundCount;
		this.nextRound();
	}

	// Returns true if this was the last round
	nextRound(): boolean {
		++this.roundNum;
		if (this.done()) return true;
		const cards = this.cardPool.splice(0, this.cardCount);
		this.piles = [cards.splice(0, Math.ceil(cards.length / 2)), cards];
		this.step = "dividing";
		return false;
	}

	done(): boolean {
		return this.roundNum >= this.roundCount;
	}

	currentPlayer(): UserID {
		return this.players[((this.roundNum % 2) + (this.step === "picking" ? 1 : 0)) % this.players.length];
	}

	dividingPlayer(): UserID {
		return this.players[(this.roundNum % 2) % this.players.length];
	}
	pickingPlayer(): UserID {
		return this.players[((this.roundNum % 2) + 1) % this.players.length];
	}

	reorganize(piles: [UniqueCardID[], UniqueCardID[]]): MessageError | undefined {
		if (this.step !== "dividing") return new MessageError("Not in Dividing step.");
		if (piles[0].length + piles[1].length !== this.cardCount) return new MessageError("Not enough cards in piles.");

		const cards = this.piles[0].concat(this.piles[1]);
		const uniqueIDs = cards.map((card) => card.uniqueID);
		const submittedUIDs = [...new Set(piles[0].concat(piles[1]))];
		if (submittedUIDs.length !== uniqueIDs.length || submittedUIDs.some((uid) => !uniqueIDs.includes(uid)))
			return new MessageError("Invalid unique card ids.");

		this.piles = [
			piles[0].map((uid) => cards.find((card) => card.uniqueID === uid)!),
			piles[1].map((uid) => cards.find((card) => card.uniqueID === uid)!),
		];
		return;
	}

	confirmPiles(): MessageError | undefined {
		if (this.step !== "dividing") return new MessageError("Not in Dividing step.");
		this.step = "picking";
		return;
	}

	pick(pileIdx: 0 | 1) {
		if (this.step !== "picking") return new MessageError("Not in Picking step.");
		const r: { [uid: UserID]: UniqueCard[] } = {};
		r[this.pickingPlayer()] = this.piles[pileIdx];
		r[this.dividingPlayer()] = this.piles[(pileIdx + 1) % 2];

		this.lastPicks.push({
			round: this.roundNum,
			picks: [r[this.players[0]], r[this.players[1]]],
		});
		this.nextRound();
		return r;
	}

	syncData() {
		return {
			players: this.players,
			roundCount: this.roundCount,
			roundNum: this.roundNum,
			step: this.step,
			piles: this.piles,
			currentPlayer: this.currentPlayer(),
			lastPicks: this.lastPicks,
		};
	}

	static deserialize(data: unknown): SolomonDraftState | undefined {
		if (!isObject(data)) return;
		if (!hasProperty("type", isString)(data)) return;
		if (data.type !== "solomon") return;
		if (
			!hasProperty(
				"players",
				(p: unknown): p is [UserID, UserID] => isArrayOf(isString)(p) && p.length === 2
			)(data)
		)
			return;
		if (!hasProperty("cardPool", isArrayOf(isUniqueCard))(data)) return;
		if (!hasProperty("cardCount", isNumber)(data)) return;
		if (!hasProperty("roundCount", isNumber)(data)) return;
		if (!hasProperty("roundNum", isNumber)(data)) return;
		if (
			!hasProperty(
				"step",
				(x: unknown): x is SolomonDraftStep => isString(x) && (x === "dividing" || x === "picking")
			)(data)
		)
			return;
		if (
			!hasProperty(
				"piles",
				(x: unknown): x is [UniqueCard[], UniqueCard[]] =>
					isArrayOf(isArrayOf(isUniqueCard))(x) && x.length === 2
			)(data)
		)
			return;
		if (
			!hasProperty(
				"lastPicks",
				isArrayOf(
					(
						x: unknown
					): x is {
						round: number;
						picks: [UniqueCard[], UniqueCard[]];
					} =>
						isObject(x) &&
						hasProperty("round", isNumber)(x) &&
						hasProperty(
							"picks",
							(picks: unknown): picks is [UniqueCard[], UniqueCard[]] =>
								isArrayOf(isArrayOf(isUniqueCard))(picks) && picks.length === 2
						)(x)
				)
			)(data)
		)
			return;
		if (data.piles[0].length + data.piles[1].length !== data.cardCount) return;
		if (data.cardPool.length < data.cardCount * (data.roundCount - data.roundNum - 1)) return;

		const s = new SolomonDraftState(data.players, data.cardCount, data.roundCount);
		s.cardPool = data.cardPool;
		s.roundNum = data.roundNum;
		s.step = data.step;
		s.piles = data.piles;
		s.lastPicks = data.lastPicks;
		return s;
	}
}

export type SolomonDraftSyncData = ReturnType<SolomonDraftState["syncData"]>;

export function isSolomonDraftState(s: unknown): s is SolomonDraftState {
	return s instanceof SolomonDraftState;
}

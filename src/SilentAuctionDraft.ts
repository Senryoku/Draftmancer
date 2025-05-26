import { UniqueCard } from "./CardTypes.js";
import { IDraftState } from "./IDraftState.js";
import { UserID } from "./IDTypes.js";
import { random, shuffleArray, sum } from "./utils.js";
import { MessageError } from "./Message.js";
import { Connections } from "./Connection.js";

export class SilentAuctionDraftState extends IDraftState {
	readonly packCount: number;
	readonly pricePaid: "first" | "second"; // See "sealed-bid first-price auction" / "sealed-bid second-price auction"
	readonly reservePrice: number;
	packs: UniqueCard[][];
	players: { userID: UserID; bids: number[] | null; funds: number }[];
	currentPack: UniqueCard[] | null = null;

	constructor(
		players: UserID[],
		packs: UniqueCard[][],
		options: { startingFunds: number; pricePaid: "first" | "second"; reservePrice: number }
	) {
		super("silentAuction");
		this.players = players.map((uid) => ({ userID: uid, bids: null, funds: options.startingFunds }));
		this.packs = packs;
		this.packCount = packs.length;
		this.pricePaid = options.pricePaid;
		this.reservePrice = options.reservePrice;
		shuffleArray(this.packs);
		this.nextRound();
	}

	// Returns true if everyone bid for this round
	bid(userID: UserID, bids: number[]): boolean | MessageError {
		if (bids.length !== this.currentPack!.length) return new MessageError("Invalid number of bids.");
		const player = this.players.find((p) => p.userID === userID);
		if (!player) return new MessageError("Invalid userID.");
		if (sum(bids) > player.funds) return new MessageError(`Insufficient funds (${sum(bids)} > ${player.funds}).`);
		if (player.bids != null) return new MessageError("You have already bid this round.");
		player.bids = bids;
		return this.players.filter((p) => p.bids === null).length === 0;
	}

	solveBids() {
		const results: { winner: UserID | null; bids: { userID: UserID; bid: number; won: boolean }[] }[] = [];
		const playerCardCounts: Record<UserID, number> = this.players.reduce(
			(acc, p) => ({
				...acc,
				[p.userID]:
					Connections[p.userID].pickedCards.main.length + Connections[p.userID].pickedCards.side.length,
			}),
			{}
		);
		for (let i = 0; i < this.currentPack!.length; ++i) {
			const bids = this.players.map((p) => ({
				userID: p.userID,
				bid: p.bids![i],
				funds: p.funds,
				won: false,
			}));
			bids.sort((lhs, rhs) => {
				const lhsFunded = lhs.funds >= lhs.bid;
				const rhsFunded = rhs.funds >= rhs.bid;
				if (lhsFunded && !rhsFunded) return -1;
				else if (!lhsFunded && rhsFunded) return 1;
				else {
					if (lhs.bid !== rhs.bid) return rhs.bid - lhs.bid;
					else {
						// Tiebreakers:
						//  Funds
						if (lhs.funds !== rhs.funds) return rhs.funds - lhs.funds;
						else {
							// Current card count: Lower card count wins.
							const lCount = playerCardCounts[lhs.userID];
							const rCount = playerCardCounts[rhs.userID];
							if (lCount !== rCount) return lCount - rCount;
							else {
								// Everything else failed: Random.
								if (random.bool()) return -1;
								else return 1;
							}
						}
					}
				}
			});
			const result: (typeof results)[number] = {
				winner: null,
				bids,
			};
			if (bids[0].bid >= this.reservePrice) {
				bids[0].won = true;
				result.winner = bids[0].userID;
				const winner = this.players.find((p) => p.userID === bids[0].userID)!;
				switch (this.pricePaid) {
					default:
					case "first":
						winner.funds -= bids[0].bid;
						break;
					case "second":
						if (bids.length < 2) {
							if (this.reservePrice > 0) winner.funds = Math.max(0, winner.funds - this.reservePrice);
							else winner.funds -= bids[0].bid;
						} else if (bids[1].bid < this.reservePrice) {
							winner.funds = Math.max(0, winner.funds - this.reservePrice);
						} else {
							winner.funds -= bids[1].bid;
						}
						break;
				}
				playerCardCounts[bids[0].userID]++;
			}
			results.push(result);
		}
		return results;
	}

	// Returns true if this was the last round
	nextRound(): boolean {
		for (const p of this.players) p.bids = null;
		this.currentPack = null;
		if (this.packs.length === 0) return true;
		this.currentPack = this.packs.pop()!;
		return false;
	}

	syncData() {
		return {
			currentPack: this.currentPack,
			packCount: this.packCount,
			remainingPacks: this.packs.length,
			reservePrice: this.reservePrice,
			players: this.players.map((p) => ({ userID: p.userID, funds: p.funds, bidCast: p.bids !== null })),
		};
	}
}

export type SilentAuctionDraftSyncData = ReturnType<SilentAuctionDraftState["syncData"]>;
export type SilentAuctionDraftResults = ReturnType<SilentAuctionDraftState["solveBids"]>;

export function isSilentAuctionDraftState(s: unknown): s is SilentAuctionDraftState {
	return s instanceof SilentAuctionDraftState;
}

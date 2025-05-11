import { UniqueCard } from "./CardTypes.js";
import { IDraftState } from "./IDraftState.js";
import { UserID } from "./IDTypes.js";
import { random, shuffleArray, sum } from "./utils.js";
import { MessageError } from "./Message.js";
import { Connections } from "./Connection.js";

export class SilentAuctionDraftState extends IDraftState {
	packs: UniqueCard[][];
	players: { userID: UserID; bids: number[] | null; funds: number }[];
	currentPack: UniqueCard[] | null = null;

	constructor(players: UserID[], packs: UniqueCard[][], startingFunds: number) {
		super("silentAuction");
		this.players = players.map((uid) => ({ userID: uid, bids: null, funds: startingFunds }));
		this.packs = packs;
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
		const results = [];
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
							const lCount =
								Connections[lhs.userID].pickedCards.main.length +
								Connections[lhs.userID].pickedCards.side.length;
							const rCount =
								Connections[rhs.userID].pickedCards.main.length +
								Connections[rhs.userID].pickedCards.side.length;
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
			bids[0].won = true;
			results.push({
				winner: bids[0].userID,
				bids,
			});
			const winner = this.players.find((p) => p.userID === bids[0].userID)!;
			winner.funds -= winner.bids![i];
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
			players: this.players.map((p) => ({ userID: p.userID, funds: p.funds, bidCast: p.bids !== null })),
		};
	}
}

export type SilentAuctionDraftSyncData = ReturnType<SilentAuctionDraftState["syncData"]>;
export type SilentAuctionDraftResults = ReturnType<SilentAuctionDraftState["solveBids"]>;

export function isSilentAuctionDraftState(s: unknown): s is SilentAuctionDraftState {
	return s instanceof SilentAuctionDraftState;
}

import { UniqueCard } from "./CardTypes.js";
import { IDraftState } from "./IDraftState.js";
import { UserID } from "./IDTypes.js";
import { random, shuffleArray, sum } from "./utils.js";
import { SocketError } from "./Message.js";
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
	bid(userID: UserID, bids: number[]): boolean | SocketError {
		if (bids.length !== this.currentPack!.length) return new SocketError("Invalid number of bids.");
		const player = this.players.find((p) => p.userID === userID);
		if (!player) return new SocketError("Invalid userID.");
		if (sum(bids) > player.funds) return new SocketError("Insufficient funds.");
		if (player.bids != null) return new SocketError("You have already bid this round.");
		player.bids = bids;
		return this.players.filter((p) => p.bids === null).length === 0;
	}

	solveBids() {
		const results = [];
		for (let i = 0; i < this.currentPack!.length; ++i) {
			const insufficientFunds: UserID[] = [];
			let highestBidder = 0;
			while (
				highestBidder < this.players.length &&
				this.players[highestBidder].bids![i] > this.players[highestBidder].funds
			) {
				// NOTE: This should not be possible: Players cannot bid more than they have accross the whole round.
				//       Let's call this future proofing.
				insufficientFunds.push(this.players[highestBidder].userID);
				highestBidder++;
			}
			const bids = this.players.map((p) => p.bids![i]);
			if (highestBidder >= this.players.length) {
				results.push({ winner: null, bids, insufficientFunds });
				continue;
			}
			for (let pidx = highestBidder + 1; pidx < this.players.length; ++pidx) {
				const player = this.players[pidx];
				const winningPlayer = this.players[highestBidder];
				if (player.funds < player.bids![i]) {
					insufficientFunds.push(player.userID);
				} else {
					if (player.bids![i] > winningPlayer.bids![i]) {
						highestBidder = pidx;
					} else if (player.bids![i] === winningPlayer.bids![i]) {
						// Tiebreakers:
						//  Funds
						if (player.funds > winningPlayer.funds) {
							highestBidder = pidx;
						} else if (player.funds === winningPlayer.funds) {
							// Current card count
							const candidate =
								Connections[player.userID].pickedCards.main.length +
								Connections[player.userID].pickedCards.side.length;
							const highest =
								Connections[winningPlayer.userID].pickedCards.main.length +
								Connections[winningPlayer.userID].pickedCards.side.length;
							if (candidate < highest) {
								highestBidder = pidx;
							} else if (candidate === highest) {
								// Everything else failed: Random.
								if (random.bool()) highestBidder = pidx;
							}
						}
					}
				}
			}
			results.push({
				winner: this.players[highestBidder].userID,
				bids,
				insufficientFunds,
			});
			this.players[highestBidder].funds -= this.players[highestBidder].bids![i];
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

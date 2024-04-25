import { UserID } from "./IDTypes";

export type BracketPlayer = { userID: UserID; userName: string } | null;

export enum BracketType {
	Team = "Team",
	Swiss = "Swiss",
	Single = "Single",
	Double = "Double",
}

export type PlayerIndex = number;

export const enum PlayerPlaceholder {
	TBD = -1,
	Empty = -2,
}

export type MatchID = number;

export type Match = {
	id: number;
	players: [PlayerIndex | PlayerPlaceholder, PlayerIndex | PlayerPlaceholder];
	results: [number, number];
};

function winner(m: Match): PlayerIndex | PlayerPlaceholder {
	if (m.players[0] === PlayerPlaceholder.Empty && m.players[1] === PlayerPlaceholder.Empty)
		return PlayerPlaceholder.Empty;
	if (m.players[0] === PlayerPlaceholder.Empty) return m.players[1];
	if (m.players[1] === PlayerPlaceholder.Empty) return m.players[0];
	if (m.results[0] === m.results[1]) return PlayerPlaceholder.TBD;
	if (m.results[0] > m.results[1]) return m.players[0];
	return m.players[1];
}

function loser(m: Match): PlayerIndex | PlayerPlaceholder {
	if (m.players[0] === PlayerPlaceholder.Empty || m.players[1] === PlayerPlaceholder.Empty)
		return PlayerPlaceholder.Empty;
	if (m.results[0] === m.results[1]) return PlayerPlaceholder.TBD;
	if (m.results[0] > m.results[1]) return m.players[1];
	return m.players[0];
}

function reorder<T>(arr: T[], pairingOrder: number[]): (T | null)[] {
	const r = Array(Math.max(arr.length, pairingOrder.length)).fill(null);
	for (let i = 0; i < Math.min(arr.length, pairingOrder.length); ++i) r[pairingOrder[i]] = arr[i];
	return r;
}

export abstract class IBracket {
	type: BracketType;
	players: (BracketPlayer | null)[];
	matches: Match[] = [];
	bracket: MatchID[][] = [];

	MTGOSynced: boolean = false;

	constructor(type: BracketType, players: BracketPlayer[]) {
		this.type = type;
		this.players = players;
	}

	abstract generateMatches(results: Array<[number, number]>): void;
	abstract updatePairings(): void;

	addMatch(data: Omit<Match, "id" | "results">): MatchID {
		const id = this.matches.length;
		this.matches.push({ id: id, ...data, results: [0, 0] });
		for (let i = 0; i < this.matches[id].players.length; ++i)
			if (
				this.matches[id].players[i] >= 0 &&
				(this.matches[id].players[i] >= this.players.length || !this.players[this.matches[id].players[i]])
			)
				this.matches[id].players[i] = PlayerPlaceholder.Empty;
		return id;
	}
}

export class SingleBracket extends IBracket {
	constructor(players: (BracketPlayer | null)[]) {
		const orderedPlayers = reorder(players, [0, 4, 2, 6, 1, 5, 3, 7]);
		super(BracketType.Single, orderedPlayers);
		this.generateMatches();
	}

	generateMatches() {
		this.bracket = [[], [], []];
		for (let i = 0; i < 4; ++i)
			this.bracket[0].push(
				this.addMatch({
					players: [2 * i, 2 * i + 1],
				})
			);
		this.bracket[1].push(this.addMatch({ players: [PlayerPlaceholder.TBD, PlayerPlaceholder.TBD] }));
		this.bracket[1].push(this.addMatch({ players: [PlayerPlaceholder.TBD, PlayerPlaceholder.TBD] }));
		this.bracket[2].push(this.addMatch({ players: [PlayerPlaceholder.TBD, PlayerPlaceholder.TBD] }));
		this.updatePairings();
	}

	updatePairings() {
		this.matches[this.bracket[1][0]].players = [
			winner(this.matches[this.bracket[0][0]]),
			winner(this.matches[this.bracket[0][1]]),
		];
		this.matches[this.bracket[1][1]].players = [
			winner(this.matches[this.bracket[0][2]]),
			winner(this.matches[this.bracket[0][3]]),
		];
		this.matches[this.bracket[2][0]].players = [
			winner(this.matches[this.bracket[1][0]]),
			winner(this.matches[this.bracket[1][1]]),
		];
	}
}

export class TeamBracket extends IBracket {
	constructor(players: BracketPlayer[]) {
		super(BracketType.Team, players);
		this.generateMatches();
	}

	generateMatches() {
		if (this.players.length % 2 === 1) throw Error("TeamBracket: Odd number of players");
		const rounds = this.players.length / 2;
		this.bracket = [];

		let offset = this.players.length / 2;
		if (offset % 2 === 0) offset += 1; // Make sure we pair with an player from the other team (always odd).

		for (let round = 0; round < rounds; ++round) {
			this.bracket.push([]);
			for (let i = 0; i < rounds; ++i) {
				this.bracket[round].push(
					this.addMatch({ players: [2 * i, (2 * i + offset + 2 * round) % this.players.length] })
				);
			}
		}
	}

	updatePairings() {}
}

function* generatePairs<T>(arr: T[]): Generator<[T, T][]> {
	if (arr.length < 2) return [];
	// We assume arr length is even.
	const a = arr[0];
	for (let i = 1; i < arr.length; ++i) {
		const pair: [T, T] = [a, arr[i]];
		const rest = arr.slice(1, i).concat(arr.slice(i + 1, arr.length));
		const gen = generatePairs(rest);
		let val = gen.next();
		while (val.value) {
			yield [pair].concat(val.value);
			val = gen.next();
		}
	}
}

export class SwissBracket extends IBracket {
	constructor(players: BracketPlayer[]) {
		const pairings = { 6: [0, 3, 1, 4, 2, 5], 8: [0, 4, 2, 6, 1, 5, 3, 7], 10: [0, 5, 1, 6, 2, 7, 3, 8, 4, 9] }[
			players.length
		]!;
		const orderedPlayers = reorder(players, pairings);
		super(BracketType.Swiss, orderedPlayers);
		this.generateMatches();
	}

	generateMatches() {
		const playerCount = this.players.length;
		this.bracket = [[], [], []];
		for (let i = 0; i < playerCount / 2; ++i) this.bracket[0].push(this.addMatch({ players: [2 * i, 2 * i + 1] }));
		for (let i = 0; i < playerCount / 2; ++i)
			this.bracket[1].push(this.addMatch({ players: [PlayerPlaceholder.TBD, PlayerPlaceholder.TBD] }));
		for (let i = 0; i < playerCount / 2; ++i)
			this.bracket[2].push(this.addMatch({ players: [PlayerPlaceholder.TBD, PlayerPlaceholder.TBD] }));
	}

	updatePairings() {
		const playerCount = this.players.length;

		const rounds = this.bracket;

		const alreadyPaired = [];
		for (const matchID of this.bracket[0]) {
			const match = this.matches[matchID];
			alreadyPaired.push([match.players[0], match.players[1]]);
			alreadyPaired.push([match.players[1], match.players[0]]);
		}

		const records: number[] = [];
		const scores: number[] = [];

		for (let i = 0; i < playerCount; ++i) {
			scores[i] = 0;
			records[i] = 0;
		}

		let groupPairingFallback = playerCount !== 8;

		let firstUncompleteRound = -1;
		let lastCompleteRound = -1;
		for (let i = 0; i < rounds.length; ++i) {
			let complete = true;
			for (const matchID of rounds[i]) {
				const match = this.matches[matchID];
				// Accumulate results from previous round.
				if (match.results[0] === match.results[1]) {
					// We have a draw, group pairing might not be possible, we'll fallback to a single group pairing by score.
					groupPairingFallback = true;
				} else records[match.players[match.results[0] > match.results[1] ? 0 : 1]] += 1;

				const diff = match.results[0] - match.results[1];
				scores[match.players[0]] += diff;
				scores[match.players[1]] -= diff;

				if (match.results[0] === 0 && match.results[1] === 0) {
					complete = false;
					if (firstUncompleteRound === -1) {
						firstUncompleteRound = i;
					}
				}
			}
			if (complete) lastCompleteRound = i;
		}

		if (
			firstUncompleteRound > 0 &&
			firstUncompleteRound === lastCompleteRound + 1 &&
			// Do not recompute pairings for this round if results started coming in.
			rounds[firstUncompleteRound].every(
				(mID) => this.matches[mID].results[0] === 0 && this.matches[mID].results[1] === 0
			)
		) {
			// All previous matches have results, we can compute the next round.
			const playerIndices = [...Array(playerCount).keys()];

			const groups: number[][] = [];
			if (!groupPairingFallback) {
				for (const record of [...new Set(records)]) {
					groups[record] = playerIndices.filter((uid) => records[uid] === record);
				}
				groups.reverse();
			} else groups.push(playerIndices);

			for (const players of groups) {
				const alreadyPairedBackup = [...alreadyPaired]; // In case the fast algorithm fails and we have to start over.
				const sortedPlayers = structuredClone(players).sort((lhs, rhs) => scores[rhs] - scores[lhs]);

				let matchIdx = 0;
				while (sortedPlayers.length > 0) {
					const firstPlayer = sortedPlayers.shift()!;
					let index = 0;
					// Find the player with the closest score which firstPlayer did not encountered yet
					while (
						index < sortedPlayers.length &&
						alreadyPaired.find((el) => el[0] === firstPlayer && el[1] === sortedPlayers[index])
					)
						++index;
					if (index < sortedPlayers.length) {
						const secondPlayer = sortedPlayers[index];
						sortedPlayers.splice(index, 1);
						this.matches[rounds[firstUncompleteRound][matchIdx++]].players = [firstPlayer, secondPlayer];
						alreadyPaired.push([firstPlayer, secondPlayer]);
						alreadyPaired.push([secondPlayer, firstPlayer]);
					} else {
						// We are out of undisputed matches because of the order of assignments, revert to a failsafe but less optimal algorithm in this case.
						matchIdx = 0;
						const matchesMatrix: number[][] = [];
						for (let i = 0; i < players.length; ++i) {
							const row = [];
							for (let j = 0; j < players.length; ++j) {
								let val = alreadyPairedBackup.find((el) => el[0] === players[i] && el[1] === players[j])
									? 99999
									: 0;
								val += Math.abs(scores[players[i]] - scores[players[j]]);
								row.push(val);
							}
							matchesMatrix.push(row);
						}
						let minValue = 10000000;
						let bestPermutation = undefined;
						// Enumerate all possible permutations and keep the "best" one.
						const permutations = generatePairs([...Array(players.length).keys()]);
						let perm = permutations.next();
						while (perm.value) {
							const val = perm.value.reduce(
								(sum: number, pair: [number, number]) => sum + matchesMatrix[pair[0]][pair[1]],
								0
							);
							if (val < minValue) {
								minValue = val;
								bestPermutation = perm.value;
							}
							perm = permutations.next();
						}
						// Finally generate the matches
						for (const pair of bestPermutation) {
							this.matches[rounds[firstUncompleteRound][matchIdx++]].players = [pair[0], pair[1]];
						}
						break;
					}
				}
			}
		}

		for (let i = lastCompleteRound + 2; i < rounds.length; ++i) {
			for (let j = 0; j < rounds[i].length; ++j) {
				this.matches[rounds[i][j]].players = [PlayerPlaceholder.TBD, PlayerPlaceholder.TBD];
				this.matches[rounds[i][j]].results = [0, 0];
			}
		}
		return;
	}
}

export class DoubleBracket extends IBracket {
	lowerBracket: MatchID[][] = [];
	final: MatchID = -1;

	constructor(players: BracketPlayer[]) {
		const orderedPlayers = reorder(players, [0, 4, 2, 6, 1, 5, 3, 7]);
		super(BracketType.Double, orderedPlayers);
		this.generateMatches();
	}

	generateMatches() {
		{
			this.bracket = [[], [], []];
			for (let i = 0; i < 4; ++i) this.bracket[0].push(this.addMatch({ players: [2 * i, 2 * i + 1] }));
			this.bracket[1].push(
				this.addMatch({
					players: [winner(this.matches[this.bracket[0][0]]), winner(this.matches[this.bracket[0][1]])],
				})
			);
			this.bracket[1].push(
				this.addMatch({
					players: [winner(this.matches[this.bracket[0][2]]), winner(this.matches[this.bracket[0][3]])],
				})
			);
			this.bracket[2].push(
				this.addMatch({
					players: [winner(this.matches[this.bracket[1][0]]), winner(this.matches[this.bracket[1][1]])],
				})
			);
		}
		{
			this.lowerBracket = [[], [], [], []];
			for (let i = 0; i < 2; ++i) {
				this.lowerBracket[0].push(
					this.addMatch({
						players: [
							loser(this.matches[this.bracket[0][2 * i]]),
							loser(this.matches[this.bracket[0][2 * i + 1]]),
						],
					})
				);
				this.lowerBracket[1].push(
					this.addMatch({
						players: [
							winner(this.matches[this.lowerBracket[0][i]]),
							loser(this.matches[this.bracket[1][i]]),
						],
					})
				);
			}
			this.lowerBracket[2].push(
				this.addMatch({
					players: [
						winner(this.matches[this.lowerBracket[1][0]]),
						winner(this.matches[this.lowerBracket[1][1]]),
					],
				})
			);
			this.lowerBracket[3].push(
				this.addMatch({
					players: [winner(this.matches[this.lowerBracket[2][0]]), loser(this.matches[this.bracket[2][0]])],
				})
			);
		}

		this.final = this.addMatch({
			players: [winner(this.matches[this.bracket[2][0]]), winner(this.matches[this.lowerBracket[3][0]])],
		});

		this.updatePairings();
	}

	updatePairings() {
		// Upper Bracket
		this.matches[this.bracket[1][0]].players = [
			winner(this.matches[this.bracket[0][0]]),
			winner(this.matches[this.bracket[0][1]]),
		];
		this.matches[this.bracket[1][1]].players = [
			winner(this.matches[this.bracket[0][2]]),
			winner(this.matches[this.bracket[0][3]]),
		];
		this.matches[this.bracket[2][0]].players = [
			winner(this.matches[this.bracket[1][0]]),
			winner(this.matches[this.bracket[1][1]]),
		];

		// Lower Bracket
		for (let i = 0; i < 2; ++i) {
			this.matches[this.lowerBracket[0][i]].players = [
				loser(this.matches[this.bracket[0][2 * i]]),
				loser(this.matches[this.bracket[0][2 * i + 1]]),
			];
			this.matches[this.lowerBracket[1][i]].players = [
				winner(this.matches[this.lowerBracket[0][i]]),
				loser(this.matches[this.bracket[1][i]]),
			];
		}
		this.matches[this.lowerBracket[2][0]].players = [
			winner(this.matches[this.lowerBracket[1][0]]),
			winner(this.matches[this.lowerBracket[1][1]]),
		];

		this.matches[this.lowerBracket[3][0]].players = [
			winner(this.matches[this.lowerBracket[2][0]]),
			loser(this.matches[this.bracket[2][0]]),
		];

		// Final
		this.matches[this.final].players = [
			winner(this.matches[this.bracket[2][0]]),
			winner(this.matches[this.lowerBracket[3][0]]),
		];
	}
}

export function isSwissBracket(obj: IBracket): obj is SwissBracket {
	return obj.type === BracketType.Swiss;
}

export function isDoubleBracket(obj: IBracket): obj is DoubleBracket {
	return obj.type === BracketType.Double;
}

export function isSingleBracket(obj: IBracket): obj is SingleBracket {
	return obj.type === BracketType.Single;
}

export function isTeamBracket(obj: IBracket): obj is TeamBracket {
	return obj.type === BracketType.Team;
}

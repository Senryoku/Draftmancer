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
	if (m.players[0] === PlayerPlaceholder.Empty && m.players[1] === PlayerPlaceholder.Empty)
		return PlayerPlaceholder.Empty;
	if (m.results[0] === m.results[1]) return PlayerPlaceholder.TBD;
	if (m.results[0] > m.results[1]) return m.players[1];
	return m.players[0];
}

function reorder<T>(arr: T[], pairingOrder: number[]): (T | null)[] {
	const r = Array(Math.max(arr.length, pairingOrder.length)).fill(null);
	for (let i = 0; i < Math.min(arr.length, pairingOrder.length); ++i) r[i] = arr[pairingOrder[i]];
	return r;
}

export abstract class IBracket {
	type: BracketType;
	players: (BracketPlayer | null)[];
	matches: Match[][] = [];

	MTGOSynced: boolean = false;

	constructor(type: BracketType, players: BracketPlayer[]) {
		this.type = type;
		this.players = players;
	}

	abstract generateMatches(results: Array<[number, number]>): void;
}

export class SingleBracket extends IBracket {
	constructor(players: (BracketPlayer | null)[]) {
		const orderedPlayers = reorder(players, [0, 4, 2, 6, 1, 5, 3, 7]);
		super(BracketType.Single, orderedPlayers);
		this.generateMatches();
	}

	generateMatches() {
		const m: Match[][] = [[], [], []];
		let mID = 0;
		for (let i = 0; i < 4; ++i)
			m[0].push({
				id: mID++,
				players: [
					2 * i < this.players.length && this.players[2 * i] ? 2 * i : PlayerPlaceholder.Empty,
					2 * i + 1 < this.players.length && this.players[2 * i + 1] ? 2 * i + 1 : PlayerPlaceholder.Empty,
				],
				results: [0, 0],
			});
		m[1].push({ id: mID++, players: [winner(m[0][0]), winner(m[0][1])], results: [0, 0] });
		m[1].push({ id: mID++, players: [winner(m[0][2]), winner(m[0][3])], results: [0, 0] });
		m[2].push({ id: mID++, players: [winner(m[1][0]), winner(m[1][1])], results: [0, 0] });
		this.matches = m;
	}

	updatePairings() {
		this.matches[1][0].players = [winner(this.matches[0][0]), winner(this.matches[0][1])];
		this.matches[1][1].players = [winner(this.matches[0][2]), winner(this.matches[0][3])];
		this.matches[2][0].players = [winner(this.matches[1][0]), winner(this.matches[1][1])];
	}
}

export class TeamBracket extends IBracket {
	constructor(players: BracketPlayer[]) {
		const orderedPlayers = reorder(players, [0, 3, 2, 5, 4, 1]);
		super(BracketType.Team, orderedPlayers);
		this.generateMatches();
	}

	generateMatches() {
		const m: Match[][] = [[], [], []];
		let mID = 0;
		m[0].push({ id: mID++, players: [0, 3], results: [0, 0] });
		m[0].push({ id: mID++, players: [2, 5], results: [0, 0] });
		m[0].push({ id: mID++, players: [4, 1], results: [0, 0] });
		m[1].push({ id: mID++, players: [0, 5], results: [0, 0] });
		m[1].push({ id: mID++, players: [2, 1], results: [0, 0] });
		m[1].push({ id: mID++, players: [4, 3], results: [0, 0] });
		m[2].push({ id: mID++, players: [0, 1], results: [0, 0] });
		m[2].push({ id: mID++, players: [2, 3], results: [0, 0] });
		m[2].push({ id: mID++, players: [4, 5], results: [0, 0] });
		this.matches = m;
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
		const m: Match[][] = [[], [], []];
		let mID = 0;
		for (let i = 0; i < playerCount / 2; ++i)
			m[0].push({ id: mID++, players: [2 * i, 2 * i + 1], results: [0, 0] });
		for (let i = 0; i < playerCount / 2; ++i)
			m[1].push({ id: mID++, players: [PlayerPlaceholder.TBD, PlayerPlaceholder.TBD], results: [0, 0] });
		for (let i = 0; i < playerCount / 2; ++i)
			m[2].push({ id: mID++, players: [PlayerPlaceholder.TBD, PlayerPlaceholder.TBD], results: [0, 0] });
		this.matches = m;
	}

	updatePairings() {
		const playerCount = this.players.length;

		const rounds = structuredClone(this.matches);

		const alreadyPaired = [];
		for (const match of this.matches[0]) {
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
			for (const match of rounds[i]) {
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

		if (firstUncompleteRound === lastCompleteRound + 1) {
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
						rounds[firstUncompleteRound][matchIdx].players = [firstPlayer, secondPlayer];
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
							rounds[firstUncompleteRound][matchIdx++].players = [pair[0], pair[1]];
						}
						break;
					}
				}
			}

			this.matches = rounds;
		}
		return;
	}
}

export class DoubleBracket extends IBracket {
	lowerBracket: Match[][] = [];

	constructor(players: BracketPlayer[]) {
		const orderedPlayers = reorder(players, [0, 4, 2, 6, 1, 5, 3, 7]);
		super(BracketType.Double, orderedPlayers);
		this.generateMatches();
	}

	generateMatches() {
		let mID = 0;
		{
			const m: Match[][] = [[], [], []];
			for (let i = 0; i < 4; ++i) m[0].push({ id: mID++, players: [2 * i, 2 * i + 1], results: [0, 0] });
			m[1].push({ id: mID++, players: [winner(m[0][0]), winner(m[0][1])], results: [0, 0] });
			m[1].push({ id: mID++, players: [winner(m[0][2]), winner(m[0][3])], results: [0, 0] });
			m[2].push({ id: mID++, players: [winner(m[1][0]), winner(m[1][1])], results: [0, 0] });
			this.matches = m;
		}
		{
			const m: Match[][] = [[], [], [], []];
			for (let i = 0; i < 2; ++i) {
				m[0].push({
					id: mID++,
					players: [loser(this.matches[0][2 * i]), loser(this.matches[0][2 * i + 1])],
					results: [0, 0],
				});
				m[1].push({
					id: mID++,
					players: [winner(m[0][i]), loser(this.matches[1][i])],
					results: [0, 0],
				});
			}
			m[2].push({ id: mID++, players: [winner(m[1][0]), winner(m[1][1])], results: [0, 0] });
			m[3].push({ id: mID++, players: [winner(m[2][0]), loser(this.matches[2][0])], results: [0, 0] });
			this.lowerBracket = m;
		}

		this.matches.push([
			{ id: mID++, players: [winner(this.matches[2][0]), winner(this.lowerBracket[3][0])], results: [0, 0] },
		]);
	}
}

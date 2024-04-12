import { UserID } from "./IDTypes";
import { MessageError } from "./Message";
import { copyPODProps } from "./Persistence";
import { isObject, hasProperty, isSomeEnum, isArrayOf, isString, isArray, isInteger } from "./TypeChecks";

export type BracketPlayer = { userID: UserID; userName: string } | null;

export function isBracketPlayer(obj: unknown): obj is BracketPlayer {
	return isObject(obj) && hasProperty("userID", isString)(obj) && hasProperty("userName", isString)(obj);
}

export enum BracketType {
	Team = "Team",
	Swiss = "Swiss",
	Single = "Single",
	Double = "Double",
}

export type PlayerIndex = number;

export enum PlayerPlaceholder {
	TBD = -1,
	Empty = -2,
}

export type Match = {
	players: [PlayerIndex | PlayerPlaceholder, PlayerIndex | PlayerPlaceholder];
	results: [number, number];
};

export function isMatch(obj: unknown): obj is Match {
	return (
		isObject(obj) &&
		hasProperty("players", isArrayOf(isInteger))(obj) &&
		hasProperty("results", isArrayOf(isInteger))(obj)
	);
}

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

export abstract class IBracket {
	type: BracketType;
	players: BracketPlayer[];
	matches: Match[][] = [];

	MTGOSynced: boolean = false;

	constructor(type: BracketType, players: BracketPlayer[]) {
		this.type = type;
		this.players = players;
	}

	abstract generateMatches(results: Array<[number, number]>): void;
}

export class SingleBracket extends IBracket {
	constructor(players: BracketPlayer[]) {
		super(BracketType.Single, players);
		this.generateMatches([
			[0, 0],
			[0, 0],
			[0, 0],
			[0, 0],
			[0, 0],
			[0, 0],
			[0, 0],
		]);
	}

	generateMatches(results: Array<[number, number]>) {
		const m: Match[][] = [[], [], []];
		for (let i = 0; i < 4; ++i) m[0].push({ players: [2 * i, 2 * i + 1], results: results[i] });
		m[1].push({ players: [winner(m[0][0]), winner(m[0][1])], results: results[4] });
		m[1].push({ players: [winner(m[0][2]), winner(m[0][3])], results: results[5] });
		m[2].push({ players: [winner(m[1][0]), winner(m[1][1])], results: results[6] });
		this.matches = m;
	}
}

export function isSingleBracket(obj: IBracket): obj is SingleBracket {
	return obj.type === BracketType.Single;
}

export class TeamBracket extends IBracket {
	constructor(players: BracketPlayer[]) {
		super(BracketType.Team, players);
		this.generateMatches([
			[0, 0],
			[0, 0],
			[0, 0],
			[0, 0],
			[0, 0],
			[0, 0],
			[0, 0],
			[0, 0],
			[0, 0],
		]);
	}

	generateMatches(results: Array<[number, number]>) {
		const m: Match[][] = [[], [], []];
		m[0].push({ players: [0, 3], results: results[0] });
		m[0].push({ players: [2, 5], results: results[1] });
		m[0].push({ players: [4, 1], results: results[2] });
		m[1].push({ players: [0, 5], results: results[3] });
		m[1].push({ players: [2, 1], results: results[4] });
		m[1].push({ players: [4, 3], results: results[5] });
		m[2].push({ players: [0, 1], results: results[6] });
		m[2].push({ players: [2, 3], results: results[7] });
		m[2].push({ players: [4, 5], results: results[8] });
		this.matches = m;
	}
}

export function isTeamBracket(obj: IBracket): obj is TeamBracket {
	return obj.type === BracketType.Team;
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
		super(BracketType.Swiss, players);
		this.generateMatches([]);
	}

	generateMatches(_results: Array<[number, number]>) {
		const playerCount = this.players.length;
		if ([6, 8, 10].indexOf(playerCount) === -1) return new MessageError("Invalid player count");
		const matchCount = { 6: 9, 8: 12, 10: 15 }[playerCount]!;
		let results = _results;
		if (results.length === 0) results = Array(matchCount).fill([0, 0]);
		if (results.length !== matchCount) return new MessageError("Invalid result count");

		const m: Match[][] = [[], [], []];

		const alreadyPaired = [];
		for (let i = 0; i < playerCount / 2; ++i) {
			const match: Match = { players: [2 * i, 2 * i + 1], results: results[i] };
			m[0].push(match);
			alreadyPaired.push([match.players[0], match.players[1]]);
			alreadyPaired.push([match.players[1], match.players[0]]);
		}

		const records: number[] = [];
		const scores: number[] = [];

		for (let i = 0; i < playerCount; ++i) {
			scores[i] = 0;
			records[i] = 0;
		}

		let groupPairingFallback = playerCount != 8;

		for (let round = 0; round < 2; ++round) {
			for (let i = 0; i < m[round].length; ++i) {
				const match = m[round][i];
				const result = m[round][i].results;

				if (result[0] === result[1]) {
					// Match has not been played yet.
					if (result[0] === 0) return m;
					// We have a draw, group pairing might not be possible, we'll fallback to a single group pairing by score.
					groupPairingFallback = true;
				} else records[match.players[result[0] > result[1] ? 0 : 1]] += 1;
				// Compute fine scores
				for (let i = 0; i < m[round].length; ++i) {
					const match = m[round][i];
					const diff = match.results[0] - match.results[1];
					scores[match.players[0]] += diff;
					scores[match.players[1]] -= diff;
				}
			}

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

				let group_matches: Match[] = [];
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
						const matchIndex = m[0].length + m[1].length + m[2].length + group_matches.length;
						group_matches.push({
							players: [firstPlayer, secondPlayer],
							results: results[matchIndex],
						});
						alreadyPaired.push([firstPlayer, secondPlayer]);
						alreadyPaired.push([secondPlayer, firstPlayer]);
					} else {
						// We are out of undisputed matches because of the order of assignments, revert to a failsafe but less optimal algorithm in this case.
						group_matches = [];
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
							const matchIndex = m[0].length + m[1].length + m[2].length + group_matches.length;
							group_matches.push({ players: [pair[0], pair[1]], results: results[matchIndex] });
						}
						break;
					}
				}
				m[round + 1].push(...group_matches);
			}

			this.matches = m;
		}
		return undefined;
	}
}

export function isSwissBracket(obj: IBracket): obj is SwissBracket {
	return obj.type === BracketType.Swiss;
}

export class DoubleBracket extends IBracket {
	lowerBracket: Match[][] = [];

	constructor(players: BracketPlayer[]) {
		super(BracketType.Double, players);
		this.generateMatches([]);
	}

	generateMatches(results: Array<[number, number]>) {
		{
			const m: Match[][] = [[], [], []];
			for (let i = 0; i < 4; ++i) m[0].push({ players: [2 * i, 2 * i + 1], results: results[i] });
			m[1].push({ players: [winner(m[0][0]), winner(m[0][1])], results: results[4] });
			m[1].push({ players: [winner(m[0][2]), winner(m[0][3])], results: results[5] });
			m[2].push({ players: [winner(m[1][0]), winner(m[1][1])], results: results[6] });
			this.matches = m;
		}
		{
			const m: Match[][] = [[], [], [], []];
			for (let i = 0; i < 2; ++i) {
				m[0].push({
					players: [loser(this.matches[0][2 * i]), loser(this.matches[0][2 * i + 1])],
					results: results[7 + i],
				});
				m[1].push({ players: [winner(m[0][i]), loser(this.matches[1][i])], results: results[9 + i] });
			}
			m[2].push({ players: [winner(m[1][0]), winner(m[1][1])], results: results[11] });
			m[3].push({ players: [winner(m[2][0]), loser(this.matches[2][0])], results: results[12] });
			this.lowerBracket = m;
		}

		this.matches.push([
			{ players: [winner(this.matches[2][0]), winner(this.lowerBracket[3][0])], results: results[13] },
		]);
	}
}

export function isDoubleBracket(obj: IBracket): obj is DoubleBracket {
	return obj.type === BracketType.Double;
}

export function deserializeBracket(data: unknown): IBracket | undefined {
	if (!isObject(data)) return;
	if (!hasProperty("type", isSomeEnum(BracketType))(data)) return;
	if (!hasProperty("players", isArrayOf(isBracketPlayer))(data)) return;
	if (!hasProperty("matches", isArrayOf(isArrayOf(isMatch)))(data)) return;
	switch (data.type) {
		case BracketType.Single: {
			const b = new SingleBracket(data.players);
			copyPODProps(data, b);
			return b;
		}
		case BracketType.Team: {
			const b = new TeamBracket(data.players);
			copyPODProps(data, b);
			return b;
		}
		case BracketType.Swiss: {
			const b = new SwissBracket(data.players);
			copyPODProps(data, b);
			return b;
		}
		case BracketType.Double: {
			const b = new DoubleBracket(data.players);
			copyPODProps(data, b);
			return b;
		}
	}
	return undefined;
}

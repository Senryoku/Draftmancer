import { Game, MatchEndType, Result, handleEvent } from "../../src/MTGOAPI.js";

export function simulateMTGOResult(players: [string, string], result: [number, number]) {
	const games: Game[] = [];
	for (let i = 0; i < result[0]; i++) {
		games.push({
			playerRankings: [
				{
					ranking: Result.Win,
					loginID: 0,
					userInfo: { screenName: players[0] },
				},
				{
					ranking: Result.Loss,
					loginID: 1,
					userInfo: { screenName: players[1] },
				},
			],
		});
	}
	for (let i = 0; i < result[1]; i++) {
		games.push({
			playerRankings: [
				{
					ranking: Result.Loss,
					loginID: 0,
					userInfo: { screenName: players[0] },
				},
				{
					ranking: Result.Win,
					loginID: 1,
					userInfo: { screenName: players[1] },
				},
			],
		});
	}

	handleEvent({
		eventId: 0,
		eventToken: "fake-token",
		description: "description",
		parentChannel: 7,
		games: games,
		finalMatchResults: [
			{
				loginID: 0,
				userInfo: { screenName: players[0] },
				finalPlace: result[0] > result[1] ? Result.Win : Result.Loss,
				matchEndType: MatchEndType.CompletedConcede,
			},
			{
				loginID: 1,
				userInfo: { screenName: players[1] },
				finalPlace: result[0] < result[1] ? Result.Win : Result.Loss,
				matchEndType: MatchEndType.CompletedConcede,
			},
		],
	});
}

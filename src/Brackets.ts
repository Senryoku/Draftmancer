import { UserID } from "./IDTypes";

export class Bracket {
	players: { userID: UserID; userName: string }[];
	results: [number, number][];

	constructor(players: { userID: UserID; userName: string }[], matchCount = 7) {
		this.players = players;
		this.results = [];
		for (let i = 0; i < matchCount; ++i) this.results.push([0, 0]);
	}
}

export class TeamBracket extends Bracket {
	teamDraft: boolean = true;
	constructor(players: { userID: UserID; userName: string }[]) {
		super(players, 9);
	}
}

export function isTeamBracket(obj: Bracket): obj is TeamBracket {
	return (obj as TeamBracket).teamDraft === true;
}

export class SwissBracket extends Bracket {
	swiss: boolean = true;
	constructor(players: { userID: UserID; userName: string }[]) {
		super(players, players.length === 6 ? 9 : 12);
	}
}

export function isSwissBracket(obj: Bracket): obj is SwissBracket {
	return (obj as SwissBracket).swiss === true;
}

export class DoubleBracket extends Bracket {
	double: boolean = true;
	constructor(players: { userID: UserID; userName: string }[]) {
		super(players, 14);
	}
}

export function isDoubleBracket(obj: Bracket): obj is DoubleBracket {
	return (obj as DoubleBracket).double === true;
}

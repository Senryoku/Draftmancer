import { UserID } from "./IDTypes";

export type BracketPlayer = { userID: UserID; userName: string } | null;

export class Bracket {
	players: BracketPlayer[];
	results: [number, number][];

	constructor(players: BracketPlayer[], matchCount = 7) {
		this.players = players;
		this.results = [];
		for (let i = 0; i < matchCount; ++i) this.results.push([0, 0]);
	}
}

export class TeamBracket extends Bracket {
	teamDraft: boolean = true;
	constructor(players: BracketPlayer[]) {
		super(players, 9);
	}
}

export function isTeamBracket(obj: Bracket): obj is TeamBracket {
	return (obj as TeamBracket).teamDraft === true;
}

export class SwissBracket extends Bracket {
	swiss: boolean = true;
	constructor(players: BracketPlayer[]) {
		super(players, { 6: 9, 8: 12, 10: 15 }[players.length]);
	}
}

export function isSwissBracket(obj: Bracket): obj is SwissBracket {
	return (obj as SwissBracket).swiss === true;
}

export class DoubleBracket extends Bracket {
	double: boolean = true;
	constructor(players: BracketPlayer[]) {
		super(players, 14);
	}
}

export function isDoubleBracket(obj: Bracket): obj is DoubleBracket {
	return (obj as DoubleBracket).double === true;
}

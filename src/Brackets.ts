import { UserID } from "./IDTypes";

export class Bracket {
	players: UserID[];
	results: [number, number][];

	constructor(players: UserID[], matchCount = 7) {
		this.players = players;
		this.results = [];
		for (let i = 0; i < matchCount; ++i) this.results.push([0, 0]);
	}
}

export class TeamBracket extends Bracket {
	teamDraft: boolean = true;
	constructor(players: UserID[]) {
		super(players, 9);
	}
}

export class SwissBracket extends Bracket {
	swiss: boolean = true;
	constructor(players: UserID[]) {
		super(players, 12);
	}
}

export class DoubleBracket extends Bracket {
	double: boolean = true;
	constructor(players: UserID[]) {
		super(players, 14);
	}
}

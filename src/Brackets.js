export class Bracket {
	constructor(players, matchCount = 7) {
		this.players = players;
		this.results = [];
		for (let i = 0; i < matchCount; ++i) this.results.push([0, 0]);
	}
}

export class TeamBracket extends Bracket {
	constructor(players) {
		super(players, 9);
		this.teamDraft = true;
	}
}

export class SwissBracket extends Bracket {
	constructor(players) {
		super(players, 12);
		this.swiss = true;
	}
}

export class DoubleBracket extends Bracket {
	constructor(players) {
		super(players, 14);
		this.double = true;
	}
}

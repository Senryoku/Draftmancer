export class Bracket {
	constructor(players) {
		this.players = players;
		this.results = [
			[0, 0],
			[0, 0],
			[0, 0],
			[0, 0],
			[0, 0],
			[0, 0],
			[0, 0],
		];
	}
}

export class TeamBracket extends Bracket {
	constructor(players) {
		super(players);
		this.results = [
			[0, 0],
			[0, 0],
			[0, 0],
			[0, 0],
			[0, 0],
			[0, 0],
			[0, 0],
			[0, 0],
			[0, 0],
		];
		this.teamDraft = true;
	}
}

export class SwissBracket extends Bracket {
	constructor(players) {
		super(players);
		this.results = [
			[0, 0],
			[0, 0],
			[0, 0],
			[0, 0],
			[0, 0],
			[0, 0],
			[0, 0],
			[0, 0],
			[0, 0],
			[0, 0],
			[0, 0],
			[0, 0],
		];
		this.swiss = true;
	}
}

export class DoubleBracket extends Bracket {
	constructor(players) {
		super(players);
		this.results = [
			[0, 0],
			[0, 0],
			[0, 0],
			[0, 0],
			[0, 0],
			[0, 0],
			[0, 0],
			// Lower
			[0, 0],
			[0, 0],
			[0, 0],
			[0, 0],
			[0, 0],
			[0, 0],
			// Final
			[0, 0],
		];
		this.double = true;
	}
}

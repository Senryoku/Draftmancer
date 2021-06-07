export class Bracket {
    players;
    results;
    constructor(players, matchCount = 7) {
        this.players = players;
        this.results = [];
        for (let i = 0; i < matchCount; ++i)
            this.results.push([0, 0]);
    }
}
export class TeamBracket extends Bracket {
    teamDraft = true;
    constructor(players) {
        super(players, 9);
    }
}
export class SwissBracket extends Bracket {
    swiss = true;
    constructor(players) {
        super(players, 12);
    }
}
export class DoubleBracket extends Bracket {
    double = true;
    constructor(players) {
        super(players, 14);
    }
}

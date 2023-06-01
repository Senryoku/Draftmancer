import { v1 as uuidv1 } from "uuid";
import { negMod } from "./utils.js";
import { IBot, SimpleBot, Bot, MTGDraftBotParameters } from "./Bot.js";
import { UniqueCard } from "./CardTypes.js";
import { Connections } from "./Connection.js";
import { IDraftState } from "./IDraftState.js";
import { UserID } from "./IDTypes.js";

export class DraftState extends IDraftState {
	readonly pickedCardsPerRound: number;
	readonly burnedCardsPerRound: number;
	readonly doubleMastersMode: boolean;

	boosters: Array<Array<UniqueCard>>;
	boosterNumber = 0;
	numPicks = 0;
	players: {
		[userID: UserID]: {
			isBot: boolean;
			botPickInFlight: boolean; // Set to true if a call to doBotPick is already scheduled.
			botInstance: IBot; // If a human player, this will be used for pick recommendations.
			boosters: UniqueCard[][];
			pickNumber: number;
			countdownInterval: NodeJS.Timer | null;
			timer: number;
			effect?: {
				skipNPicks?: number;
				skipUntilNextRound?: boolean;
				randomPicks?: number;
				canalDredger?: boolean;
				aetherSearcher?: { card: UniqueCard };
			};
		};
	} = {};

	constructor(
		boosters: UniqueCard[][],
		players: UserID[],
		options: {
			pickedCardsPerRound: number;
			burnedCardsPerRound: number;
			doubleMastersMode: boolean;
			botCount: number;
			simpleBots: boolean;
			botParameters?: MTGDraftBotParameters;
		}
	) {
		super("draft");
		this.pickedCardsPerRound = options.pickedCardsPerRound;
		this.burnedCardsPerRound = options.burnedCardsPerRound;
		this.doubleMastersMode = options.doubleMastersMode;

		this.boosters = boosters;

		const playersToCreate = players.map((uid) => {
			return {
				isBot: false,
				userID: uid,
			};
		});

		// Distribute bots evenly around the table
		let idx = 0;
		for (let i = 0; i < options.botCount; ++i) {
			// Search next human player
			while (playersToCreate[idx].isBot) idx = (idx + 1) % playersToCreate.length;
			++idx;
			// Insert a bot right after
			playersToCreate.splice(idx, 0, { isBot: true, userID: uuidv1() });
		}

		let botIndex = 0;
		for (const user of playersToCreate) {
			const userName = user.isBot ? `Bot #${++botIndex}` : Connections[user.userID].userName;
			const botInstance = options.simpleBots
				? new SimpleBot(userName, user.userID)
				: new Bot(userName, user.userID, options.botParameters);

			this.players[user.userID] = {
				isBot: user.isBot,
				botPickInFlight: false,
				botInstance: botInstance,
				boosters: [],
				pickNumber: 0,
				countdownInterval: null,
				timer: 0,
			};
		}
	}

	picksAndBurnsThisRound(userID: UserID) {
		return {
			picksThisRound: Math.min(
				this.doubleMastersMode && this.players[userID].pickNumber > 0 ? 1 : this.pickedCardsPerRound,
				this.players[userID].boosters[0].length
			),
			burnsThisRound: this.burnedCardsPerRound,
		};
	}

	leftPlayer(userID: UserID) {
		const playerIds = Object.keys(this.players);
		let idx = playerIds.indexOf(userID) + 1;
		idx = negMod(idx, playerIds.length);
		return playerIds[idx];
	}
	rightPlayer(userID: UserID) {
		const playerIds = Object.keys(this.players);
		let idx = playerIds.indexOf(userID) - 1;
		idx = negMod(idx, playerIds.length);
		return playerIds[idx];
	}

	previousPlayer(userID: UserID) {
		const playerIds = Object.keys(this.players);
		let idx = playerIds.indexOf(userID);
		idx += this.boosterNumber % 2 ? 1 : -1;
		idx = negMod(idx, playerIds.length);
		return playerIds[idx];
	}

	nextPlayer(userID: UserID) {
		const playerIds = Object.keys(this.players);
		let idx = playerIds.indexOf(userID);
		idx += this.boosterNumber % 2 ? -1 : 1;
		idx = negMod(idx, playerIds.length);
		return playerIds[idx];
	}

	getPlayersWithCanalDredger() {
		return Object.entries(this.players)
			.filter((p) => p[1].effect?.canalDredger)
			.map((p) => p[0]);
	}

	syncData(userID: UserID) {
		return {
			booster: this.players[userID].boosters[0],
			boosterCount: this.players[userID].boosters.length,
			boosterNumber: this.boosterNumber,
			pickNumber: this.players[userID].pickNumber,
			skipPick:
				(this.players[userID].effect?.skipNPicks ?? 0) > 0 ||
				this.players[userID].effect?.skipUntilNextRound === true,
		};
	}
}

export function isDraftState(obj: unknown): obj is DraftState {
	return obj instanceof DraftState;
}

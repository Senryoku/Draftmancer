import { v1 as uuidv1 } from "uuid";
import { negMod } from "./utils.js";
import { IBot, SimpleBot, Bot } from "./Bot.js";
import { MTGDraftBotParameters } from "./bots/ExternalBotInterface.js";
import { UniqueCard } from "./CardTypes.js";
import { Connections } from "./Connection.js";
import { IDraftState } from "./IDraftState.js";
import { UserID } from "./IDTypes.js";

export type BoosterSettings = {
	readonly discardRemainingCardsAt: number;
	readonly picks: number[];
	readonly burns: number[];
};

export class DraftState extends IDraftState {
	readonly boosterSettings: BoosterSettings[];

	boosters: UniqueCard[][]; // Boosters waiting to be distributed
	boosterNumber = 0;
	numPicks = 0; // Number of picks in the current round. This is currently set to the number of cards in the first booster by doDistributeBoosters, which is correct for standard 1 pick/0 burn draft with all identical boosters and no special rules, and just a bad appromixation otherwise.
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

	pendingTimeout: NodeJS.Timeout | null = null;

	constructor(
		boosters: UniqueCard[][],
		players: UserID[],
		options: {
			boosterSettings: BoosterSettings[];
			botCount: number;
			simpleBots: boolean;
			botParameters?: MTGDraftBotParameters;
		}
	) {
		super("draft");
		this.boosterSettings = options.boosterSettings;

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

	getBoosterSettings() {
		return this.boosterSettings[this.boosterNumber % this.boosterSettings.length];
	}

	picksAndBurnsThisRound(userID: UserID) {
		const settings = this.getBoosterSettings();
		const picksThisRound = Math.min(
			settings.picks[Math.min(this.players[userID].pickNumber, settings.picks.length - 1)],
			this.players[userID].boosters[0]?.length ?? 0
		);
		return {
			picksThisRound,
			burnsThisRound: Math.min(
				settings.burns[Math.min(this.players[userID].pickNumber, settings.burns.length - 1)],
				Math.max(0, (this.players[userID].boosters[0]?.length ?? 0) - picksThisRound)
			),
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

	syncData(userID: UserID): DraftSyncData {
		const { picksThisRound, burnsThisRound } = this.picksAndBurnsThisRound(userID);
		return {
			booster: this.players[userID].boosters[0],
			boosterCount: this.players[userID].boosters.length,
			boosterNumber: this.boosterNumber,
			pickNumber: this.players[userID].pickNumber,
			picksThisRound,
			burnsThisRound,
			skipPick:
				(this.players[userID].effect?.skipNPicks ?? 0) > 0 ||
				this.players[userID].effect?.skipUntilNextRound === true,
		};
	}
}

export type DraftSyncData = {
	booster?: UniqueCard[];
	boosterCount: number;
	boosterNumber: number;
	pickNumber: number;
	picksThisRound: number;
	burnsThisRound: number;
	skipPick: boolean;
};

export function isDraftState(obj: unknown): obj is DraftState {
	return obj instanceof DraftState;
}

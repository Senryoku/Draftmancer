import { v1 as uuidv1 } from "uuid";
import { negMod } from "./utils.js";
import { IBot, SimpleBot, Bot, MTGDraftBotParameters } from "./Bot.js";
import { UniqueCard } from "./CardTypes.js";
import { Connections } from "./Connection.js";
import { IDraftState } from "./IDraftState.js";
import { UserID } from "./IDTypes.js";

export class DraftState extends IDraftState {
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
			countdownInterval: NodeJS.Timeout | null;
			timer: number;
		};
	} = {};

	constructor(
		boosters: UniqueCard[][],
		players: UserID[],
		options: { botCount: number; simpleBots: boolean; botParameters?: MTGDraftBotParameters }
	) {
		super("draft");
		this.boosters = boosters;
		let botIndex = 0;

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

	syncData(userID: UserID) {
		return {
			booster: this.players[userID].boosters[0],
			boosterCount: this.players[userID].boosters.length,
			boosterNumber: this.boosterNumber,
			pickNumber: this.players[userID].pickNumber,
		};
	}
}

export function isDraftState(obj: unknown): obj is DraftState {
	return obj instanceof DraftState;
}

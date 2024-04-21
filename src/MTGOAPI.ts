import { inspect } from "util";
import { WebSocket } from "ws";
import { createClient } from "graphql-ws";

const MTGBOT_GRAPHQL_ENDPOINT = process.env.MTGBOT_GRAPHQL_ENDPOINT;
const MTGBOT_APIKEY = process.env.MTGBOT_APIKEY;

let client: ReturnType<typeof createClient>;

type SubscriptionCallback = (e: EventCompleted) => void;

const Subscriptions: Map<string, SubscriptionCallback> = new Map<string, SubscriptionCallback>();

class WebSocketWithBearer extends WebSocket {
	constructor(
		address: string,
		protocols: ConstructorParameters<typeof WebSocket>[1],
		options: ConstructorParameters<typeof WebSocket>[2]
	) {
		const updatedOptions = options
			? structuredClone(options)
			: { headers: { Authorization: `Bearer ${MTGBOT_APIKEY}` } };
		if (!updatedOptions?.headers) updatedOptions.headers = { Authorization: `Bearer ${MTGBOT_APIKEY}` };
		else updatedOptions.headers.Authorization = `Bearer ${MTGBOT_APIKEY}`;
		super(address, protocols, updatedOptions);
	}
}

const ValidEvents = [
	5, // Constructed Games - Just Starting Out
	6, // Constructed Games - Just for Fun
	7, // Constructed Games - Anything Goes
	8, // Constructed Games - Tournament Practice
];

export enum MatchEndType {
	NotSet = "NS",
	CompletedNormal = "CN",
	CompletedConcede = "CC",
	CompletedDisconnect = "CD",
	CompletedDoubleDisconnect = "DD",
}

export enum Result {
	Win = 2,
	Loss = 3,
}

export type Game = {
	playerRankings: {
		ranking: Result;
		loginID: number;
		userInfo: {
			screenName: string;
		};
	}[];
};

export type EventCompleted = {
	eventId: number;
	eventToken: string;
	description: string;
	parentChannel: number;
	games: Game[];

	finalMatchResults?: {
		loginID: number;
		userInfo: {
			screenName: string;
		};
		finalPlace: Result;
		matchEndType: MatchEndType;
	}[];
};

export function handleEvent(e: EventCompleted) {
	if (ValidEvents.includes(e.parentChannel) && e.finalMatchResults && e.finalMatchResults.length > 0) {
		const callback = Subscriptions.get(e.finalMatchResults[0].userInfo.screenName);
		callback?.(e);
	}
}

export function init() {
	if (MTGBOT_GRAPHQL_ENDPOINT && MTGBOT_APIKEY) {
		// NOTE: Afaik, graphql-ws will reconnect and resubscribe automatically if the connection closes for any reason.
		//       However we may still miss some events in this case. We might want to handle this in the future (see activeEvents endpoint).
		client = createClient({
			webSocketImpl: WebSocketWithBearer,
			url: MTGBOT_GRAPHQL_ENDPOINT,
		});

		(async () => {
			try {
				const subscription = client.iterate({
					query: `subscription {
						eventCompleted {
							eventId
							eventToken
							description
							parentChannel

							... on Match {
								games {
									playerRankings {
										ranking
										loginID
										userInfo {
											screenName
										}
									}
								}

								finalMatchResults {
									loginID
									userInfo {
										screenName
									}
									finalPlace
									matchEndType
								}
							}
						}
					}`,
				});

				for await (const event of subscription) {
					const ev = event.data?.eventCompleted as EventCompleted;
					try {
						handleEvent(ev);
					} catch (e) {
						console.error("Error handling MTGO event:", e);
						console.error(inspect(ev));
					}
				}
			} catch (e) {
				console.error("Error subscribing to MTGO events:", e);
			}
		})();
	}
}

function subscribe(userName: string, callback: SubscriptionCallback) {
	Subscriptions.set(userName, callback);
}

function unsubscribe(userName: string) {
	Subscriptions.delete(userName);
}

export const MatchResults = {
	subscribe,
	unsubscribe,
};

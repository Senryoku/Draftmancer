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

type EventCompleted = {
	eventId: number;
	eventToken: string;
	description: string;
	parentChannel: number;
	gameStructure: string;

	finalMatchResults?: {
		loginID: number;
		userInfo: {
			screenName: string;
		};
		finalPlace: number;
		matchEndType: string;
	}[];
};

export function handleEvent(e: EventCompleted) {
	if (ValidEvents.includes(e.parentChannel) && e.finalMatchResults && e.finalMatchResults.length > 0) {
		const callback = Subscriptions.get(e.finalMatchResults[0].userInfo.screenName);
		callback?.(e);
	}
}

function init() {
	if (MTGBOT_GRAPHQL_ENDPOINT && MTGBOT_APIKEY) {
		// TODO: Reconnect on error, query list of events we may have missed during the disconnect.
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
								gameStructure {
									description
									gameStructureCd
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
					const e = event.data?.eventCompleted as EventCompleted;
					console.log(inspect(e, false, null, true));
					handleEvent(e);
				}
			} catch (e) {
				console.error(e);
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

export default {
	init,
	subscribe,
	unsubscribe,
};

"use strict";

import { Socket } from "socket.io";
import { UserID, SessionID } from "./IDTypes.js";
import { CardID, CardPool, UniqueCard } from "./CardTypes.js";
import { ClientToServerEvents, ServerToClientEvents, InterServerEvents, SocketData } from "./SocketType.js";
import { TestingOnly } from "./Context.js";

export const Connections: { [uid: string]: Connection } = {};
export class Connection {
	socket: Socket<ClientToServerEvents, ServerToClientEvents, InterServerEvents, SocketData>;
	userID: UserID;
	userName: string;

	sessionID?: SessionID = undefined;
	collection: CardPool = new Map();
	useCollection = true;

	pickedCards: { main: Array<UniqueCard>; side: Array<UniqueCard> } = { main: [], side: [] };

	constructor(
		socket: Socket<ClientToServerEvents, ServerToClientEvents, InterServerEvents, SocketData>,
		userID: UserID,
		userName: string
	) {
		this.socket = socket;
		this.userID = userID;
		this.userName = userName;
	}
}

// Used on server restart to restore state.
export function getPODConnection(conn: Connection): Omit<Connection, "socket" | "collection"> {
	return {
		userID: conn.userID,
		userName: conn.userName,
		sessionID: conn.sessionID,
		useCollection: conn.useCollection,
		pickedCards: conn.pickedCards, // This is mostly what we want to preserve.
	};
}

export function getPickedCardIds(pickedCards: { main: Array<UniqueCard>; side: Array<UniqueCard> }): CardID[] {
	return pickedCards.main.map((c) => c.id).concat(pickedCards.side.map((c) => c.id));
}

export const clearConnections = TestingOnly(() => {
	for (const uid in Connections) {
		Connections[uid].socket.disconnect();
		delete Connections[uid];
	}
});

"use strict";

import { Socket } from "socket.io";
import { UserID, SessionID } from "./IDTypes.js";
import { Card, CardID, CardPool, UniqueCard } from "./Cards";

export let Connections: { [uid: string]: Connection } = {};
export class Connection {
	socket: Socket;
	userID: UserID;
	userName: string;

	sessionID?: SessionID = undefined;
	collection: CardPool = new Map();
	useCollection = true;

	pickedCards: { main: Array<UniqueCard>; side: Array<UniqueCard> } = { main: [], side: [] };

	constructor(socket: Socket, userID: UserID, userName: string) {
		this.socket = socket;
		this.userID = userID;
		this.userName = userName;
	}
}

export function getPickedCardIds(pickedCards: { main: Array<UniqueCard>; side: Array<UniqueCard> }): CardID[] {
	return pickedCards.main.map((c) => c.id).concat(pickedCards.side.map((c) => c.id));
}

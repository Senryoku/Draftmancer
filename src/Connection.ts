"use strict";

import { Socket } from "socket.io";
import { UserID, SessionID } from "./IDTypes.js";
import { Card, CardID, CardPool } from "./Cards";

export let Connections: { [uid: string]: Connection } = {};
export class Connection {
	socket: Socket;
	userID: UserID;
	userName: string;

	sessionID?: SessionID = undefined;
	collection: CardPool = new Map();
	useCollection = true;

	pickedCards: { main: Array<Card>; side: Array<Card> } = { main: [], side: [] };

	constructor(socket: Socket, userID: UserID, userName: string) {
		this.socket = socket;
		this.userID = userID;
		this.userName = userName;
	}
}

export function getPickedCardIds(pickedCards: { main: Array<Card>; side: Array<Card> }): CardID[] {
	return pickedCards.main.map((c) => c.id).concat(pickedCards.side.map((c) => c.id));
}

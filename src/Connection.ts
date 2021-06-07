"use strict";

import { Socket } from "socket.io";
import { UserID, SessionID } from "./IDTypes.js";
import { Card, CardPool } from "./Cards";

export let Connections: { [uid: string]: Connection } = {};
export class Connection {
	socket: Socket;
	userID: UserID;
	userName: string;

	sessionID?: SessionID = undefined;
	collection: CardPool = new Map();
	useCollection = true;

	pickedThisRound = false;
	pickedCards: Array<Card> = [];
	boosterIndex = -1;

	constructor(socket: Socket, userID: UserID, userName: string) {
		this.socket = socket;
		this.userID = userID;
		this.userName = userName;
	}
}

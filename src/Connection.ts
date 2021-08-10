"use strict";

import { Socket } from "socket.io";
import { UserID, SessionID } from "./IDTypes.js";
import { Card, CardPool } from "./Cards";
import { IBot } from "./Bot.js";

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
	bot?: IBot;

	constructor(socket: Socket, userID: UserID, userName: string) {
		this.socket = socket;
		this.userID = userID;
		this.userName = userName;
	}
}

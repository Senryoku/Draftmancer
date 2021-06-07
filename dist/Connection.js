"use strict";
export let Connections = {};
export class Connection {
    socket;
    userID;
    userName;
    sessionID = undefined;
    collection = new Map();
    useCollection = true;
    pickedThisRound = false;
    pickedCards = [];
    boosterIndex = -1;
    constructor(socket, userID, userName) {
        this.socket = socket;
        this.userID = userID;
        this.userName = userName;
    }
}

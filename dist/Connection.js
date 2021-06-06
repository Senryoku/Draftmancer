"use strict";
export let Connections = {};
export function Connection(socket, userID, userName) {
    this.socket = socket;
    this.userID = userID;
    this.userName = userName;
    this.sessionID = null;
    this.collection = {};
    this.useCollection = true;
    this.pickedThisRound = false;
    this.pickedCards = [];
    this.boosterIndex = -1;
}

import { v1 as uuidv1 } from "uuid";
import { SessionID, UserID } from "../IDTypes";
import { SetCode } from "../Types";

import { Connections } from "../Connection.js";
import { Session, Sessions } from "../Session.js";
import { SocketAck, SocketError } from "../Message.js";
import { Socket } from "socket.io";
import { ClientToServerEvents, ServerToClientEvents, InterServerEvents, SocketData } from "../SocketType";

type QueueID = SetCode;

let ManagedSessions: SessionID[] = []; // Only used for statistics, I should probably get rid of it.
const PlayerQueues: Map<QueueID, UserID[]> = new Map<QueueID, UserID[]>();

function launchSession(setCode: QueueID, users: UserID[]) {
	let sessionID = `QuickDraft_${setCode.toUpperCase()}_${uuidv1()}`;
	// FIXME: this is a hack
	while (sessionID in Sessions) sessionID = `QuickDraft_${setCode.toUpperCase()}_${uuidv1()}`;

	const session = new Session(sessionID, undefined);

	////////////////////////////////////////////////////
	// FIXME: TEMP TEST
	{
		session.maxTimer = 1;
		session.boostersPerPlayer = 1;
	}
	////////////////////////////////////////////////////

	session.setRestriction = [setCode];
	for (const uid of users) {
		session.addUser(uid);
		Connections[uid].socket.emit("setSession", sessionID);
	}

	Sessions[sessionID] = session;
	ManagedSessions.push(sessionID);

	session.startDraft();
}

function searchPlayer(userID: UserID): QueueID | undefined {
	for (const entry of PlayerQueues) {
		const val = entry[1].find((uid) => uid === userID);
		if (val) return entry[0];
	}
	return undefined;
}

function onDisconnect(this: Socket<ClientToServerEvents, ServerToClientEvents, InterServerEvents, SocketData>) {
	const userID = this.data.userID;
	if (userID) {
		const previous = searchPlayer(userID);
		if (previous) unregisterPlayer(userID, previous);
	}
}

export function registerPlayer(userID: UserID, settings: QueueID): SocketAck {
	const conn = Connections[userID];
	if (!conn) return new SocketError("Internal Error.");
	if (conn.sessionID) return new SocketError("Already in a session.");
	console.log("Registering player...");

	unregisterPlayer(userID);

	if (!PlayerQueues.has(settings)) PlayerQueues.set(settings, []);
	PlayerQueues.get(settings)!.push(userID);

	console.log(`PlayerQueue.get(${JSON.stringify(settings)})`, PlayerQueues.get(settings));

	// TODO: Test
	conn.socket.once("disconnect", onDisconnect);

	// FIXME: Should be 8!
	if (PlayerQueues.get(settings)?.length === 2) {
		console.log("Starting managed session...");
		const users = PlayerQueues.get(settings)!;
		PlayerQueues.set(settings, []);
		launchSession(settings, users);
	}

	return new SocketAck();
}

export function unregisterPlayer(userID: UserID, settings?: QueueID): SocketAck {
	if (!settings) {
		settings = searchPlayer(userID);
		if (!settings) return new SocketError(`Player not found.`);
	}

	if (!PlayerQueues.has(settings)) return new SocketError(`Invalid set '${settings}'.`);
	const idx = PlayerQueues.get(settings)!.indexOf(userID);
	if (idx < 0) return new SocketError(`Player not found.`);
	PlayerQueues.get(settings)!.splice(idx, 1);
	Connections[userID].socket.off("disconnect", onDisconnect);
	return new SocketAck();
}

export function getQueueStatus() {
	const queues: Record<SetCode, { set: string; inQueue: number; playing: number }> = {};

	ManagedSessions = ManagedSessions.filter((sid) => sid in Sessions);

	for (const [k, v] of PlayerQueues.entries()) {
		queues[k] = {
			set: k,
			inQueue: v.length,
			playing: ManagedSessions.filter((sid) => Sessions[sid].setRestriction[0] === k)
				.map((sid) => Sessions[sid].users.size)
				.reduce((a, b) => a + b, 0),
		};
	}

	return {
		playing: ManagedSessions.map((sid) => Sessions[sid].users.size).reduce((a, b) => a + b, 0),
		queues,
	};
}

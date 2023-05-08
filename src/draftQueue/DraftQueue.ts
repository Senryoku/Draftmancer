import { v4 as uuidv4 } from "uuid";
import { SessionID, UserID } from "../IDTypes";
import { SetCode } from "../Types";

import { Connections } from "../Connection.js";
import { Session, Sessions } from "../Session.js";
import { SocketAck, SocketError } from "../Message.js";
import { Socket } from "socket.io";
import { ClientToServerEvents, ServerToClientEvents, InterServerEvents, SocketData } from "../SocketType";
import { ReadyState } from "../Session/SessionTypes.js";

export type QueueID = SetCode;

const PlayerQueues: Map<QueueID, UserID[]> = new Map<QueueID, UserID[]>();

function readyCheck(setCode: QueueID, users: UserID[]) {
	console.log(`Starting Draft Queue ready check: ${users}...`);
	const playersStatus: Record<UserID, { status: ReadyState; onDisconnect: () => void }> = {};

	const timeout = Date.now() + 35 * 1000;
	const cancelTimeout = setTimeout(() => {
		cancel(true);
	}, timeout - Date.now());

	const getTableStatus = () =>
		Object.values(playersStatus).map((p) => {
			return {
				status: p.status,
			};
		});

	const cancel = (timeout: boolean = false) => {
		console.log("Canceling queue ready check.");
		console.log(playersStatus);
		clearTimeout(cancelTimeout);
		for (const uid of users) {
			Connections[uid]?.socket?.emit("draftQueueReadyCheckUpdate", setCode, getTableStatus());
			Connections[uid]?.socket?.off("disconnect", playersStatus[uid].onDisconnect);
			Connections[uid]?.socket?.removeAllListeners("draftQueueSetReadyState");
			if (
				playersStatus[uid].status === ReadyState.Ready ||
				(!timeout && playersStatus[uid].status === ReadyState.Unknown)
			) {
				Connections[uid]?.socket?.emit("draftQueueReadyCheckCancel", setCode, true);
				registerPlayer(uid, setCode);
			} else Connections[uid]?.socket?.emit("draftQueueReadyCheckCancel", setCode, false);
		}
	};

	for (const uid of users)
		playersStatus[uid] = {
			status: ReadyState.Unknown,
			onDisconnect: () => {
				playersStatus[uid].status = ReadyState.NotReady;
				cancel();
			},
		};

	for (const uid of users) {
		Connections[uid]?.socket?.once("disconnect", playersStatus[uid].onDisconnect);
		Connections[uid]?.socket?.once("draftQueueSetReadyState", (status: ReadyState) => {
			console.log("draftQueueSetReadyState", uid, status);
			playersStatus[uid].status = status;
			console.log(playersStatus);

			if (status !== ReadyState.Ready) {
				cancel();
			} else {
				for (const uid of users)
					Connections[uid]?.socket?.emit("draftQueueReadyCheckUpdate", setCode, getTableStatus());
				if (Object.values(playersStatus).every((p) => p.status === ReadyState.Ready)) {
					clearTimeout(cancelTimeout);
					launchSession(setCode, users);
				}
			}
		});
		Connections[uid].socket.emit("draftQueueReadyCheck", setCode, timeout, Object.values(playersStatus));
	}
}

function launchSession(setCode: QueueID, users: UserID[]) {
	let sessionID = `DraftQueue-${setCode.toUpperCase()}-${uuidv4()}`;
	// FIXME: this is a hack
	while (sessionID in Sessions) sessionID = `DraftQueue-${setCode.toUpperCase()}-${uuidv4()}`;
	console.log("Starting managed session ${sessionID}...");

	const session = new Session(sessionID, undefined);

	////////////////////////////////////////////////////
	// FIXME: TEMP TEST
	{
		session.boostersPerPlayer = 1;
	}
	////////////////////////////////////////////////////

	session.setRestriction = [setCode];
	for (const uid of users) {
		session.addUser(uid);
		Connections[uid].socket.emit("setSession", sessionID);
	}

	Sessions[sessionID] = session;

	session.startDraft();
}

function searchPlayer(userID: UserID): QueueID | undefined {
	for (const [key, value] of PlayerQueues) {
		const val = value.find((uid) => uid === userID);
		if (val) return key;
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
		const users = PlayerQueues.get(settings)!.slice(0, 2);
		for (const uid of users) unregisterPlayer(uid, settings);
		readyCheck(settings, users);
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

	// NOTE: Might be worth optimizing/caching at some point.
	const managedSessions = Object.keys(Sessions).filter((sid) => Sessions[sid].managed);

	for (const [k, v] of PlayerQueues.entries()) {
		queues[k] = {
			set: k,
			inQueue: v.length,
			playing: managedSessions
				.filter((sid) => Sessions[sid].setRestriction[0] === k)
				.map((sid) => Sessions[sid].users.size)
				.reduce((a, b) => a + b, 0),
		};
	}

	return {
		playing: managedSessions.map((sid) => Sessions[sid].users.size).reduce((a, b) => a + b, 0),
		queues,
	};
}

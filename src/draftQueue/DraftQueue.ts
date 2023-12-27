import { v4 as uuidv4 } from "uuid";
import { UserID } from "../IDTypes";
import { SetCode } from "../Types";

import { Connections } from "../Connection.js";
import { Session, Sessions } from "../Session.js";
import { SocketAck, SocketError } from "../Message.js";
import { Socket } from "socket.io";
import { ClientToServerEvents, ServerToClientEvents, InterServerEvents, SocketData } from "../SocketType";
import { ReadyState } from "../Session/SessionTypes.js";

import { QueueID, QueueDescription } from "./QueueDescription.js";
import { AvailableQueues } from "./AvailableQueues.js";
import { DraftmancerAI } from "../Bot.js";

type PlayerQueue = { description: QueueDescription; users: UserID[]; botCount: number; noBotsUntil: number };

const PlayerQueues = new Map<QueueID, PlayerQueue>();

// Controls the frequency at which bots are added to inactive queues (ms).
const AddBotCheckInterval = 1000 * 10;
const AddBotPauseAfterBotAddition = 1000 * 60 * 2;
const AddBotPauseAfterPlayerJoin = 1000 * 60 * 3;
const AddBotPauseAfterDraftStart = 1000 * 60 * 10;

for (const queue of AvailableQueues) {
	PlayerQueues.set(queue.id, {
		description: queue,
		users: [],
		botCount: 0,
		noBotsUntil: Date.now() + AddBotPauseAfterPlayerJoin,
	});
}

function readyCheck(queueID: QueueID) {
	const queue = PlayerQueues.get(queueID);
	if (!queue) return new SocketError(`Invalid queue '${queueID}'.`);

	// This should not be possible, but if for some reason multiple bots were added at once and we actually don't
	// need all of them, reduce their count.
	if (queue.users.length + queue.botCount > queue.description.playerCount)
		queue.botCount = queue.description.playerCount - queue.users.length;

	const users = queue.users.slice(0, queue.description.playerCount);
	const botCount = queue.botCount;

	for (const uid of users) unregisterPlayer(uid, queueID);
	queue.botCount = 0;
	queue.noBotsUntil = Math.max(queue.noBotsUntil, Date.now() + AddBotPauseAfterDraftStart);

	const playersStatus: Record<UserID, { status: ReadyState; onDisconnect: () => void }> = {};

	const timeout = Date.now() + 45 * 1000;
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
		clearTimeout(cancelTimeout);
		for (const uid of users) {
			Connections[uid]?.socket?.emit("draftQueueReadyCheckUpdate", queueID, getTableStatus());
			Connections[uid]?.socket?.off("disconnect", playersStatus[uid].onDisconnect);
			Connections[uid]?.socket?.removeAllListeners("draftQueueSetReadyState");
			if (
				playersStatus[uid].status === ReadyState.Ready ||
				(!timeout && playersStatus[uid].status === ReadyState.Unknown)
			) {
				Connections[uid]?.socket?.emit("draftQueueReadyCheckCancel", queueID, true);
				registerPlayer(uid, queueID);
			} else Connections[uid]?.socket?.emit("draftQueueReadyCheckCancel", queueID, false);
		}
		// Also add the bots back.
		for (let i = 0; i < botCount; ++i) {
			addBot(queue);
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

	for (let botID = 0; botID < botCount; ++botID) {
		playersStatus["__bot_" + botID] = {
			status: ReadyState.Ready,
			onDisconnect: () => {},
		};
	}

	for (const uid of users) {
		// Make sure player is still connected. This shouldn't be needed, but the case comes up in tests, and I'm not sure how...
		if (!Connections[uid]) return playersStatus[uid].onDisconnect();

		Connections[uid].socket.once("disconnect", playersStatus[uid].onDisconnect);
		Connections[uid].socket.once("draftQueueSetReadyState", (status: ReadyState) => {
			playersStatus[uid].status = status;

			if (status !== ReadyState.Ready) {
				cancel();
			} else {
				for (const uid of users)
					Connections[uid]?.socket?.emit("draftQueueReadyCheckUpdate", queueID, getTableStatus());
				if (Object.values(playersStatus).every((p) => p.status === ReadyState.Ready)) {
					clearTimeout(cancelTimeout);
					launchSession(queue.description, users, botCount);
				}
			}
		});
		Connections[uid].socket.emit("draftQueueReadyCheck", queueID, timeout, getTableStatus());
	}
}

function launchSession(queueDescription: QueueDescription, users: UserID[], botCount: number) {
	let sessionID = `DraftQueue-${queueDescription.setCode.toUpperCase()}-${uuidv4()}`;
	while (sessionID in Sessions) sessionID = `DraftQueue-${queueDescription.setCode.toUpperCase()}-${uuidv4()}`;

	const session = new Session(sessionID, undefined);

	if (queueDescription.settings) {
		if (queueDescription.settings.pickedCardsPerRound)
			session.pickedCardsPerRound = queueDescription.settings.pickedCardsPerRound;
	}
	session.setRestriction = [queueDescription.setCode];
	session.maxTimer = 70;
	session.bots = botCount;
	for (const uid of users) {
		session.addUser(uid);
		Connections[uid].socket.emit("setSession", sessionID);
	}

	Sessions[sessionID] = session;

	session.startDraft();
}

function searchPlayer(userID: UserID): QueueID | undefined {
	for (const [key, value] of PlayerQueues) {
		const val = value.users.find((uid) => uid === userID);
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

function addBot(queue: PlayerQueue) {
	const now = Date.now();
	// Ensure we have at least two human players, and that we have adequate bots for this queue
	if (
		queue.botCount < queue.description.playerCount - 2 &&
		DraftmancerAI.models.includes(queue.description.setCode)
	) {
		queue.noBotsUntil = Math.max(queue.noBotsUntil, now + AddBotPauseAfterBotAddition);
		queue.botCount++;

		if (queue.users.length + queue.botCount >= queue.description.playerCount) {
			readyCheck(queue.description.id);
		}
	}
}

function addBotsToInactiveQueues() {
	const now = Date.now();
	for (const queue of PlayerQueues.values()) {
		if (queue.noBotsUntil < now) {
			addBot(queue);
		}
	}
}

setInterval(addBotsToInactiveQueues, AddBotCheckInterval);

export function registerPlayer(userID: UserID, queueID: QueueID): SocketAck {
	const conn = Connections[userID];
	if (!conn) return new SocketError("Internal Error.");
	if (conn.sessionID) return new SocketError("Already in a session.");

	unregisterPlayer(userID);

	const queue = PlayerQueues.get(queueID);
	if (!queue) return new SocketError(`Invalid queue '${queueID}'.`);

	queue.users.push(userID);
	queue.noBotsUntil = Math.max(queue.noBotsUntil, Date.now() + AddBotPauseAfterPlayerJoin);

	conn.socket.once("disconnect", onDisconnect);

	if (queue.users.length + queue.botCount >= queue.description.playerCount) {
		readyCheck(queueID);
	}

	return new SocketAck();
}

export function unregisterPlayer(userID: UserID, queueID?: QueueID): SocketAck {
	let qid = queueID;
	if (!qid) {
		qid = searchPlayer(userID);
		if (!qid) return new SocketError(`Player not found.`);
	}

	const queue = PlayerQueues.get(qid);
	if (!queue) return new SocketError(`Invalid queue '${qid}'.`);
	const idx = queue.users.indexOf(userID);
	if (idx < 0) return new SocketError(`Player not found.`);
	queue.users.splice(idx, 1);
	Connections[userID]?.socket.off("disconnect", onDisconnect);
	return new SocketAck();
}

export function getQueueStatus() {
	const queues: Record<SetCode, { set: string; inQueue: number; playing: number }> = {};

	// NOTE: Might be worth optimizing/caching at some point.
	const managedSessions = Object.keys(Sessions).filter((sid) => Sessions[sid].managed);

	for (const [k, v] of PlayerQueues.entries()) {
		queues[k] = {
			set: k,
			inQueue: v.users.length + v.botCount,
			playing: managedSessions
				.filter(
					(sid) =>
						Sessions[sid].setRestriction.length === 1 &&
						Sessions[sid].setRestriction[0] === v.description.setCode
				)
				.map((sid) => Sessions[sid].users.size)
				.reduce((a, b) => a + b, 0),
		};
	}

	return {
		playing: managedSessions.map((sid) => Sessions[sid].users.size).reduce((a, b) => a + b, 0),
		queues,
	};
}

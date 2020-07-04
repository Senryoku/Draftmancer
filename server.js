"use strict";

if (process.env.NODE_ENV !== "production") {
	require("dotenv").config();
}

const port = process.env.PORT || 3000;
const compression = require("compression");
const express = require("express");
const app = express();
const http = require("http").Server(app);
const io = require("socket.io")(http);
const cookieParser = require("cookie-parser");
const uuidv1 = require("uuid/v1");

const constants = require("./client/src/constants.json");
const Persistence = require("./src/Persistence");
const ConnectionModule = require("./src/Connection");
const Connections = ConnectionModule.Connections;
const SessionModule = require("./src/Session");
const Session = SessionModule.Session;
const Sessions = SessionModule.Sessions;
const Cards = require("./src/Cards");

app.use(compression());
app.use(cookieParser());

function shortguid() {
	function s4() {
		return Math.floor((1 + Math.random()) * 0x10000)
			.toString(16)
			.substring(1);
	}
	return s4() + s4() + s4();
}

function getPublicSessions() {
	let publicSessions = [];
	for (let s in Sessions) {
		if (Sessions[s].isPublic) {
			publicSessions.push(s);
		}
	}
	return publicSessions;
}

/////////////////////////////////////////////////////////////////
// Setup all websocket responses on client connection

io.on("connection", function(socket) {
	const query = socket.handshake.query;
	console.log(
		`${query.userName} [${query.userID}] connected. (${Object.keys(Connections).length + 1} players online)`
	);

	if (query.userID in Connections) {
		console.log(`${query.userName} [${query.userID}] already connected.`);
		query.userID = uuidv1();
		console.warn(`${query.userName} is now ${query.userID}.`);
		socket.emit("alreadyConnected", query.userID);
	}

	socket.userID = query.userID;
	if (query.userID in InactiveConnections) {
		// Restore previously saved connection
		// TODO: Front and Back end may be out of sync after this!
		InactiveConnections[query.userID].socket = socket;
		Connections[query.userID] = InactiveConnections[query.userID];
		delete InactiveConnections[query.userID];
	} else {
		Connections[query.userID] = new ConnectionModule.Connection(socket, query.userID, query.userName);
	}

	// Messages

	socket.on("disconnect", function() {
		const userID = this.userID;
		if (userID in Connections) {
			console.log(
				`${Connections[userID].userName} [${userID}] disconnected. (${Object.keys(Connections).length -
					1} players online)`
			);
			removeUserFromSession(userID);
			process.nextTick(() => {
				delete Connections[userID];
			});
		}
	});

	// Personnal options

	socket.on("setUserName", function(userName) {
		let userID = this.userID;
		let sessionID = Connections[userID].sessionID;

		Connections[userID].userName = userName;
		Sessions[sessionID].forUsers(user =>
			Connections[user].socket.emit("updateUser", {
				userID: userID,
				updatedProperties: {
					userName: userName,
				},
			})
		);
	});

	socket.on("setSession", function(sessionID) {
		let userID = this.userID;

		if (sessionID == Connections[userID].sessionID) return;

		joinSession(sessionID, userID);
	});

	socket.on("setCollection", function(collection) {
		let userID = this.userID;
		if (!Connections[userID]) return;
		let sessionID = Connections[userID].sessionID;

		if (typeof collection !== "object" || collection === null) return;

		// Remove unknown cards immediatly.
		for (let id in collection)
			if (!(id in Cards)) {
				//console.log("Unknow card ID: ", id);
				delete collection[id];
			}

		Connections[userID].collection = collection;
		if (Sessions[sessionID])
			Sessions[sessionID].forUsers(user =>
				Connections[user].socket.emit("updateUser", {
					userID: userID,
					updatedProperties: {
						collection: collection,
					},
				})
			);
	});

	socket.on("useCollection", function(useCollection) {
		let userID = this.userID;
		if (!Connections[userID]) return;
		let sessionID = Connections[userID].sessionID;

		if (typeof useCollection !== "boolean") return;

		if (useCollection == Connections[userID].useCollection) return;

		Connections[userID].useCollection = useCollection;
		if (Sessions[sessionID])
			Sessions[sessionID].forUsers(user =>
				Connections[user].socket.emit("updateUser", {
					userID: userID,
					updatedProperties: {
						useCollection: useCollection,
					},
				})
			);
	});

	socket.on("chatMessage", function(message) {
		let sessionID = Connections[this.userID].sessionID;

		// Limits chat message length
		message.text = message.text.substring(0, Math.min(255, message.text.length));

		Sessions[sessionID].forUsers(user => Connections[user].socket.emit("chatMessage", message));
	});

	socket.on("setOwnerIsPlayer", function(val) {
		const userID = this.userID;
		const sessionID = Connections[userID].sessionID;

		if (Sessions[sessionID].owner != userID || Sessions[sessionID].drafting) return;

		if (val) {
			Sessions[sessionID].ownerIsPlayer = true;
			Sessions[sessionID].addUser(userID);
		} else {
			Sessions[sessionID].ownerIsPlayer = false;
			Sessions[sessionID].users.delete(userID);
			Sessions[sessionID].notifyUserChange();
		}
		for (let user of Sessions[sessionID].users)
			if (user != userID)
				Connections[user].socket.emit("sessionOptions", { ownerIsPlayer: Sessions[sessionID].ownerIsPlayer });
	});

	socket.on("readyCheck", function(ack) {
		const userID = this.userID;
		const sessionID = Connections[userID].sessionID;

		if (Sessions[sessionID].owner != this.userID || Sessions[sessionID].drafting) {
			if (ack) ack({ code: 1 });
			return;
		}

		if (ack) ack({ code: 0 });
		for (let user of Sessions[sessionID].users) if (user != userID) Connections[user].socket.emit("readyCheck");
	});

	socket.on("setReady", function(readyState) {
		const userID = this.userID;
		const sessionID = Connections[userID].sessionID;
		Sessions[sessionID].forUsers(user => Connections[user].socket.emit("setReady", userID, readyState));
	});

	socket.on("startWinstonDraft", function(boosterCount) {
		const userID = this.userID;
		const sessionID = Connections[userID].sessionID;
		if (Sessions[sessionID].owner != this.userID || Sessions[sessionID].drafting) return;
		if (Sessions[sessionID].users.size == 2) {
			Sessions[sessionID].startWinstonDraft(boosterCount ? boosterCount : 6);
		} else {
			Connections[userID].socket.emit("message", {
				title: `2 Players Only`,
				text: `Winston Draft can only be played with exactly 2 players.`,
			});
		}
	});

	socket.on("winstonDraftTakePile", function(ack) {
		const userID = this.userID;
		const sessionID = Connections[userID].sessionID;
		if (!Sessions[sessionID].drafting || !Sessions[sessionID].winstonDraftState) {
			if (ack) ack({ code: 1, error: "Not drafting." });
			return;
		}

		if (userID != Sessions[sessionID].winstonDraftState.currentPlayer()) {
			if (ack) ack({ code: 1, error: "Not your turn." });
			return;
		}

		const r = Sessions[sessionID].winstonTakePile();

		if (ack) {
			if (!r) ack({ code: 1, error: "Internal error." });
			else ack({ code: 0 });
		}
	});

	socket.on("winstonDraftSkipPile", function(ack) {
		const userID = this.userID;
		const sessionID = Connections[userID].sessionID;
		if (!Sessions[sessionID].drafting || !Sessions[sessionID].winstonDraftState) {
			if (ack) ack({ code: 1, error: "Not drafting." });
			return;
		}

		if (userID != Sessions[sessionID].winstonDraftState.currentPlayer()) {
			if (ack) ack({ code: 1, error: "Not your turn." });
			return;
		}

		const r = Sessions[sessionID].winstonSkipPile();

		if (ack) {
			if (!r) ack({ code: 1, error: "This is your only choice!" });
			else ack({ code: 0 });
		}
	});

	socket.on("startDraft", function() {
		let userID = this.userID;
		let sessionID = Connections[userID].sessionID;
		if (Sessions[sessionID].owner != this.userID || Sessions[sessionID].drafting) return;

		if (Sessions[sessionID].users.size > 0 && Sessions[sessionID].users.size + Sessions[sessionID].bots >= 2) {
			Sessions[sessionID].startDraft();
		} else {
			Connections[userID].socket.emit("message", {
				title: `Not enough players`,
				text: `Can't start draft: Not enough players (min. 2 including bots).`,
			});
		}
	});

	socket.on("stopDraft", function() {
		let userID = this.userID;
		let sessionID = Connections[userID].sessionID;
		if (!(sessionID in Sessions) || Sessions[sessionID].owner != this.userID) return;
		if (!Sessions[sessionID].drafting) return;
		if (Sessions[sessionID].winstonDraftState) Sessions[sessionID].endWinstonDraft();
		else Sessions[sessionID].endDraft();
	});

	// Removes picked card from corresponding booster and notify other players.
	// Moves to next round when each player have picked a card.
	socket.on("pickCard", function(data, ack) {
		let userID = this.userID;
		let sessionID = Connections[userID].sessionID;

		if (!(sessionID in Sessions) || !(userID in Connections)) {
			if (ack) ack({ code: 1, error: "Invalid request" });
			return;
		}

		const r = Sessions[sessionID].pickCard(userID, data.selectedCard, data.burnedCards);
		if (ack) ack(r);
	});

	// Session options

	socket.on("setSessionOwner", function(newOwnerID) {
		const userID = this.userID;
		const sessionID = Connections[userID].sessionID;
		if (Sessions[sessionID].owner != userID) return;

		if (newOwnerID === Sessions[sessionID].owner || !Sessions[sessionID].users.has(newOwnerID)) return;

		if (!Sessions[sessionID].ownerIsPlayer) {
			// Prevent changing owner during drafting if owner is not playing
			if (Sessions[sessionID].drafting) return;

			Sessions[sessionID].users.delete(newOwnerID);
			Sessions[sessionID].owner = newOwnerID;
			Sessions[sessionID].addUser(userID);
		} else {
			Sessions[sessionID].owner = newOwnerID;
		}
		Sessions[sessionID].forUsers(user =>
			Connections[user].socket.emit(
				"sessionOwner",
				Sessions[sessionID].owner,
				Sessions[sessionID].owner in Connections ? Connections[Sessions[sessionID].owner].userName : null
			)
		);
	});

	socket.on("removePlayer", function(userID) {
		let sessionID = Connections[this.userID].sessionID;
		if (!(sessionID in Sessions) || Sessions[sessionID].owner != this.userID) return;

		if (userID === Sessions[sessionID].owner || !Sessions[sessionID].users.has(userID)) return;

		removeUserFromSession(userID);
		Sessions[sessionID].replaceDisconnectedPlayers();
		Sessions[sessionID].notifyUserChange();

		let newSession = shortguid();
		joinSession(newSession, userID);
		Connections[userID].socket.emit("setSession", newSession);
		Connections[userID].socket.emit("message", {
			title: "Removed from session",
			text: `You've been removed from session '${sessionID}' by its owner.`,
		});
	});

	socket.on("setSeating", function(seating) {
		let sessionID = Connections[this.userID].sessionID;
		if (!(sessionID in Sessions) || Sessions[sessionID].owner != this.userID) return;
		if (!Sessions[sessionID].setSeating(seating)) Sessions[sessionID].notifyUserChange(); // Something unexpected happened, notify to avoid any potential de-sync.
	});

	socket.on("randomizeSeating", function() {
		let sessionID = Connections[this.userID].sessionID;
		if (!(sessionID in Sessions) || Sessions[sessionID].owner != this.userID) return;
		if (!Sessions[sessionID].randomizeSeating()) Sessions[sessionID].notifyUserChange(); // Something unexpected happened, notify to avoid any potential de-sync.
	});

	socket.on("boostersPerPlayer", function(boostersPerPlayer) {
		let sessionID = Connections[this.userID].sessionID;
		if (!(sessionID in Sessions) || Sessions[sessionID].owner != this.userID) return;

		if (!Number.isInteger(boostersPerPlayer)) boostersPerPlayer = parseInt(boostersPerPlayer);
		if (!Number.isInteger(boostersPerPlayer)) return;

		if (boostersPerPlayer == Sessions[sessionID].boostersPerPlayer) return;

		Sessions[sessionID].setBoostersPerPlayer(boostersPerPlayer);

		Sessions[sessionID].boostersPerPlayer = boostersPerPlayer;

		for (let user of Sessions[sessionID].users) {
			if (user != this.userID) {
				Connections[user].socket.emit("sessionOptions", {
					boostersPerPlayer: Sessions[sessionID].boostersPerPlayer,
				});
			}
		}
	});

	socket.on("setDistributionMode", function(distributionMode) {
		let sessionID = Connections[this.userID].sessionID;
		if (!(sessionID in Sessions) || Sessions[sessionID].owner != this.userID) return;

		if (!["regular", "shufflePlayerBoosters", "shuffleBoosterPool"].includes(distributionMode)) return;

		Sessions[sessionID].distributionMode = distributionMode;
		for (let user of Sessions[sessionID].users) {
			if (user != this.userID)
				Connections[user].socket.emit("sessionOptions", { distributionMode: distributionMode });
		}
	});

	socket.on("setCustomBoosters", function(customBoosters) {
		let sessionID = Connections[this.userID].sessionID;
		if (!(sessionID in Sessions) || Sessions[sessionID].owner != this.userID) return;

		if (!Array.isArray(customBoosters)) return;

		Sessions[sessionID].customBoosters = customBoosters;
		for (let user of Sessions[sessionID].users) {
			if (user != this.userID)
				Connections[user].socket.emit("sessionOptions", { customBoosters: customBoosters });
		}
	});

	socket.on("bots", function(bots) {
		let sessionID = Connections[this.userID].sessionID;
		if (!(sessionID in Sessions) || Sessions[sessionID].owner != this.userID) return;

		if (!Number.isInteger(bots)) bots = parseInt(bots);
		if (!Number.isInteger(bots)) return;

		if (bots == Sessions[sessionID].bots) return;

		Sessions[sessionID].bots = bots;
		for (let user of Sessions[sessionID].users) {
			if (user != this.userID) Connections[user].socket.emit("bots", bots);
		}
	});

	socket.on("setRestriction", function(setRestriction) {
		let sessionID = Connections[this.userID].sessionID;
		if (!(sessionID in Sessions) || Sessions[sessionID].owner != this.userID) return;

		if (!Array.isArray(setRestriction)) return;

		if (setRestriction.length > 0) {
			for (let s of setRestriction) {
				if (constants.MTGSets.indexOf(s) === -1) return;
			}
		}

		if (setRestriction === Sessions[sessionID].setRestriction) return;

		Sessions[sessionID].setRestriction = setRestriction;
		for (let user of Sessions[sessionID].users) {
			if (user != this.userID) Connections[user].socket.emit("setRestriction", setRestriction);
		}
	});

	socket.on("customCardList", function(customCardList, ack) {
		let sessionID = Connections[this.userID].sessionID;
		if (!(sessionID in Sessions) || Sessions[sessionID].owner != this.userID) return;

		if (!customCardList.cards || (customCardList.customSheets && !customCardList.cardsPerBooster)) {
			if (ack) ack({ code: 1, error: "Invalid data" });
			return;
		}

		if (ack) ack({ code: 0 });

		Sessions[sessionID].customCardList = customCardList;
		for (let user of Sessions[sessionID].users) {
			if (user != this.userID)
				Connections[user].socket.emit("sessionOptions", {
					customCardList: customCardList,
				});
		}
	});

	socket.on("ignoreCollections", function(ignoreCollections) {
		let sessionID = Connections[this.userID].sessionID;
		if (!(sessionID in Sessions) || Sessions[sessionID].owner != this.userID) return;

		Sessions[sessionID].ignoreCollections = ignoreCollections;
		for (let user of Sessions[sessionID].users) {
			if (user != this.userID)
				Connections[user].socket.emit("ignoreCollections", Sessions[sessionID].ignoreCollections);
		}
	});

	socket.on("setPickTimer", function(timerValue) {
		let sessionID = Connections[this.userID].sessionID;
		if (!(sessionID in Sessions) || Sessions[sessionID].owner != this.userID) return;

		if (!Number.isInteger(timerValue)) timerValue = parseInt(timerValue);
		if (!Number.isInteger(timerValue) || timerValue < 0) return;

		Sessions[sessionID].maxTimer = timerValue;
		for (let user of Sessions[sessionID].users) {
			if (user != this.userID) Connections[user].socket.emit("setPickTimer", timerValue);
		}
	});

	socket.on("setMaxPlayers", function(maxPlayers) {
		let sessionID = Connections[this.userID].sessionID;
		if (!(sessionID in Sessions) || Sessions[sessionID].owner != this.userID) return;

		if (!Number.isInteger(maxPlayers)) maxPlayers = parseInt(maxPlayers);
		if (!Number.isInteger(maxPlayers) || maxPlayers < 0) return;

		Sessions[sessionID].maxPlayers = maxPlayers;
		for (let user of Sessions[sessionID].users) {
			if (user != this.userID) Connections[user].socket.emit("setMaxPlayers", maxPlayers);
		}
	});

	socket.on("setMythicPromotion", function(mythicPromotion) {
		let sessionID = Connections[this.userID].sessionID;
		if (!(sessionID in Sessions) || Sessions[sessionID].owner != this.userID) return;
		if (typeof mythicPromotion !== "boolean") return;

		Sessions[sessionID].mythicPromotion = mythicPromotion;
		for (let user of Sessions[sessionID].users) {
			if (user != this.userID)
				Connections[user].socket.emit("sessionOptions", { mythicPromotion: mythicPromotion });
		}
	});

	socket.on("setBoosterContent", function(boosterContent) {
		let sessionID = Connections[this.userID].sessionID;
		if (!(sessionID in Sessions) || Sessions[sessionID].owner != this.userID) return;
		// Validate input (a value for each rarity and at least one card)
		if (!["common", "uncommon", "rare"].every(r => r in boosterContent)) return;
		if (Object.values(boosterContent).reduce((acc, val) => acc + val) <= 0) return;

		Sessions[sessionID].boosterContent = boosterContent;
		for (let user of Sessions[sessionID].users) {
			if (user != this.userID)
				Connections[user].socket.emit("sessionOptions", { boosterContent: boosterContent });
		}
	});

	socket.on("setDraftLogRecipients", function(draftLogRecipients) {
		let sessionID = Connections[this.userID].sessionID;
		if (!(sessionID in Sessions) || Sessions[sessionID].owner != this.userID) return;
		if (typeof draftLogRecipients !== "string") return;
		draftLogRecipients = draftLogRecipients.toLowerCase();
		if (!["everyone", "owner", "delayed", "none"].includes(draftLogRecipients)) return;
		Sessions[sessionID].draftLogRecipients = draftLogRecipients;
		for (let user of Sessions[sessionID].users) {
			if (user != this.userID)
				Connections[user].socket.emit("sessionOptions", {
					draftLogRecipients: draftLogRecipients,
				});
		}
	});

	socket.on("shareDraftLog", function(draftLog) {
		let sessionID = Connections[this.userID].sessionID;
		if (!(sessionID in Sessions) || Sessions[sessionID].owner != this.userID) return;
		for (let user of Sessions[sessionID].users) {
			if (user != this.userID) Connections[user].socket.emit("draftLog", draftLog);
		}
	});

	socket.on("setMaxDuplicates", function(maxDuplicates) {
		let sessionID = Connections[this.userID].sessionID;
		if (!(sessionID in Sessions) || Sessions[sessionID].owner != this.userID) return;
		Sessions[sessionID].maxDuplicates = maxDuplicates;
		for (let user of Sessions[sessionID].users) {
			if (user != this.userID)
				Connections[user].socket.emit("sessionOptions", {
					maxDuplicates: maxDuplicates,
				});
		}
	});

	socket.on("setColorBalance", function(colorBalance) {
		let sessionID = Connections[this.userID].sessionID;
		if (!(sessionID in Sessions) || Sessions[sessionID].owner != this.userID) return;

		if (colorBalance == Sessions[sessionID].colorBalance) return;

		Sessions[sessionID].colorBalance = colorBalance;
		for (let user of Sessions[sessionID].users) {
			if (user != this.userID && user in Connections)
				Connections[user].socket.emit("sessionOptions", {
					colorBalance: Sessions[sessionID].colorBalance,
				});
		}
	});

	socket.on("setFoil", function(foil) {
		let sessionID = Connections[this.userID].sessionID;
		if (!(sessionID in Sessions) || Sessions[sessionID].owner != this.userID) return;

		if (foil == Sessions[sessionID].foil) return;

		Sessions[sessionID].foil = foil;
		for (let user of Sessions[sessionID].users) {
			if (user != this.userID && user in Connections)
				Connections[user].socket.emit("sessionOptions", {
					foil: Sessions[sessionID].foil,
				});
		}
	});

	socket.on("setUseCustomCardList", function(useCustomCardList) {
		let sessionID = Connections[this.userID].sessionID;
		if (!(sessionID in Sessions) || Sessions[sessionID].owner != this.userID) return;

		if (useCustomCardList == Sessions[sessionID].useCustomCardList) return;

		Sessions[sessionID].useCustomCardList = useCustomCardList;
		for (let user of Sessions[sessionID].users) {
			if (user != this.userID && user in Connections)
				Connections[user].socket.emit("sessionOptions", {
					useCustomCardList: Sessions[sessionID].useCustomCardList,
				});
		}
	});

	socket.on("setBurnedCardsPerRound", function(burnedCardsPerRound) {
		let sessionID = Connections[this.userID].sessionID;
		if (!(sessionID in Sessions) || Sessions[sessionID].owner != this.userID) return;

		if (!Number.isInteger(burnedCardsPerRound)) burnedCardsPerRound = parseInt(burnedCardsPerRound);
		if (!Number.isInteger(burnedCardsPerRound) || burnedCardsPerRound < 0) return;

		Sessions[sessionID].burnedCardsPerRound = burnedCardsPerRound;
		for (let user of Sessions[sessionID].users) {
			if (user != this.userID && user in Connections)
				Connections[user].socket.emit("sessionOptions", { burnedCardsPerRound: burnedCardsPerRound });
		}
	});

	socket.on("setPublic", function(isPublic) {
		let sessionID = Connections[this.userID].sessionID;
		if (!(sessionID in Sessions) || Sessions[sessionID].owner != this.userID) return;

		if (isPublic == Sessions[sessionID].isPublic) return;

		Sessions[sessionID].isPublic = isPublic;
		for (let user of Sessions[sessionID].users) {
			if (user != this.userID) Connections[user].socket.emit("isPublic", Sessions[sessionID].isPublic);
		}
		// Update all clients
		io.emit("publicSessions", getPublicSessions());
	});

	socket.on("replaceDisconnectedPlayers", function() {
		let sessionID = Connections[this.userID].sessionID;
		if (!(sessionID in Sessions) || Sessions[sessionID].owner != this.userID) return;
		Sessions[sessionID].replaceDisconnectedPlayers();
	});

	socket.on("distributeSealed", function(boostersPerPlayer) {
		let userID = this.userID;
		let sessionID = Connections[userID].sessionID;
		if (!(sessionID in Sessions) || Sessions[sessionID].owner != this.userID) return;

		if (isNaN(boostersPerPlayer)) return;
		Sessions[sessionID].distributeSealed(boostersPerPlayer);
	});

	socket.on("generateBracket", function(players, ack) {
		let userID = this.userID;
		let sessionID = Connections[userID].sessionID;
		if (!(sessionID in Sessions) || Sessions[sessionID].owner != this.userID) return;

		if (players.length !== 8) return;
		Sessions[sessionID].generateBracket(players);
		if (ack) ack({ code: 0 });
	});

	socket.on("generateSwissBracket", function(players, ack) {
		let userID = this.userID;
		let sessionID = Connections[userID].sessionID;
		if (!(sessionID in Sessions) || Sessions[sessionID].owner != this.userID) return;

		if (players.length !== 8) return;
		Sessions[sessionID].generateSwissBracket(players);
		if (ack) ack({ code: 0 });
	});

	socket.on("updateBracket", function(results) {
		let userID = this.userID;
		let sessionID = Connections[userID].sessionID;
		if (!(sessionID in Sessions) || Sessions[sessionID].owner != this.userID) return;

		Sessions[sessionID].updateBracket(results);
	});

	joinSession(query.sessionID, query.userID);
	socket.emit("publicSessions", getPublicSessions());
});

///////////////////////////////////////////////////////////////////////////////

function getUserID(req, res) {
	if (!req.cookies.userID) {
		let ID = uuidv1();
		res.cookie("userID", ID);
		return ID;
	} else {
		return req.cookies.userID;
	}
}

function joinSession(sessionID, userID) {
	if (sessionID in InactiveSessions) {
		console.log(`Restoring inactive session '${sessionID}'...`);
		// Always having a valid owner is more important than preserving the old one - probably.
		if (InactiveSessions[sessionID].ownerIsPlayer) InactiveSessions[sessionID].owner = userID;
		Sessions[sessionID] = InactiveSessions[sessionID];
		delete InactiveSessions[sessionID];
	}

	if (sessionID in Sessions) {
		let sess = Sessions[sessionID];
		// User was the owner, but not playing
		if (userID === sess.owner && !sess.ownerIsPlayer) {
			Connections[userID].socket.emit("message", {
				title: "Reconnected as Organizer",
			});
			sess.reconnectOwner(userID);
			return;
		}

		// Session exists and is drafting
		if (sess.drafting) {
			console.log(
				`${userID} wants to join drafting session '${sessionID}'... userID in sess.disconnectedUsers: ${userID in
					sess.disconnectedUsers}`
			);

			if (userID in sess.disconnectedUsers) {
				sess.reconnectUser(userID);
			} else {
				Connections[userID].socket.emit("message", {
					title: "Cannot join session",
					text: `This session (${sessionID}) is currently drafting. Please wait for them to finish.`,
				});
				// Fallback to previous session if possible, or generate a new one
				if (Connections[userID].sessionID === null) sessionID = shortguid();
				else sessionID = Connections[userID].sessionID;
				Connections[userID].socket.emit("setSession", sessionID);
			}
		} else if (sess.getHumanPlayerCount() >= sess.maxPlayers) {
			// Session exists and is full
			Connections[userID].socket.emit("message", {
				title: "Cannot join session",
				text: `This session (${sessionID}) is full (${sess.users.size}/${sess.maxPlayers} players).`,
			});
			if (Connections[userID].sessionID === null) sessionID = shortguid();
			else sessionID = Connections[userID].sessionID;
			Connections[userID].socket.emit("setSession", sessionID);
		} else {
			addUserToSession(userID, sessionID);
		}
	} else {
		addUserToSession(userID, sessionID);
	}
}

function addUserToSession(userID, sessionID) {
	if (Connections[userID].sessionID !== null) removeUserFromSession(userID);
	if (!(sessionID in Sessions)) Sessions[sessionID] = new Session(sessionID, userID);

	Sessions[sessionID].addUser(userID);
}

function deleteSession(sessionID) {
	const wasPublic = Sessions[sessionID].isPublic;
	process.nextTick(() => {
		delete Sessions[sessionID];
		if (wasPublic) io.emit("publicSessions", getPublicSessions());
	});
}

// Remove user from previous session and cleanup if empty
function removeUserFromSession(userID) {
	const sessionID = Connections[userID].sessionID;
	if (sessionID in Sessions) {
		let sess = Sessions[sessionID];
		if (sess.users.has(userID)) {
			sess.remUser(userID);

			Connections[userID].sessionID = null;
			// Keep session alive if the owner wasn't a player and is still connected.
			if ((sess.ownerIsPlayer || !(sess.owner in Connections)) && sess.users.size === 0) {
				deleteSession(sessionID);
			} else {
				// User was the owner of the session, transfer ownership to the first available users.
				if (sess.owner == userID) {
					sess.owner = sess.users.values().next().value;
				}
				sess.notifyUserChange();
			}
		} else if (userID === sess.owner && !sess.ownerIsPlayer && sess.users.size === 0) {
			// User was a non-playing owner and alone in this session
			deleteSession(sessionID);
		}
	}
}

///////////////////////////////////////////////////////////////////////////////
// Express server setup

// Serve files in the public directory
app.use(express.static(__dirname + "/client/public/"));

///////////////////////////////////////////////////////////////////////////////
// Endpoints
// (TODO: Should be cleaned up)

app.get("/getCollection", (req, res) => {
	if (!req.cookies.sessionID) {
		res.sendStatus(400);
	} else if (req.params.sessionID in Sessions) {
		res.send(Sessions[req.cookies.sessionID].collection());
	} else {
		res.sendStatus(404);
	}
});

app.get("/getCollection/:id", (req, res) => {
	if (!req.params.id) {
		res.sendStatus(400);
	} else if (req.params.sessionID in Sessions) {
		res.send(Sessions[req.params.id].collection());
	} else {
		res.sendStatus(404);
	}
});

app.get("/getUsers/:sessionID", (req, res) => {
	if (!req.params.sessionID) {
		res.sendStatus(400);
	} else if (req.params.sessionID in Sessions) {
		res.send(JSON.stringify([...Sessions[req.params.sessionID].users]));
	} else {
		res.sendStatus(404);
	}
});

// Debug endpoints

const secretKey = process.env.SECRET_KEY || "1234";

var express_json_cache = []; // Clear this before calling
app.set("json replacer", function(key, value) {
	// Deal with sets
	if (typeof value === "object" && value instanceof Set) {
		return [...value];
	}
	// Deal with circular references
	if (typeof value === "object" && value !== null) {
		if (express_json_cache.indexOf(value) !== -1) {
			// Circular reference found, discard key
			return;
		}
		// Store value in our collection
		express_json_cache.push(value);
	}
	return value;
});

function returnJSON(res, data) {
	express_json_cache = [];
	res.json(data);
	express_json_cache = null; // Enable garbage collection
}

app.get("/getSessions/:key", (req, res) => {
	if (req.params.key === secretKey) {
		returnJSON(res, Sessions);
	} else {
		res.sendStatus(401).end();
	}
});

app.get("/getConnections/:key", (req, res) => {
	if (req.params.key === secretKey) {
		returnJSON(res, Connections);
	} else {
		res.sendStatus(401).end();
	}
});

app.get("/getStatus/:key", (req, res) => {
	if (req.params.key === secretKey) {
		let draftingSessions = 0;
		for (let sID in Sessions) if (Sessions[sID].drafting) ++draftingSessions;
		let uptime = process.uptime();
		returnJSON(res, {
			uptime: uptime,
			sessionCount: Object.keys(Sessions).length,
			playerCount: Object.keys(Connections).length,
			draftingSessions: draftingSessions,
			canRestart: draftingSessions === 0,
		});
	} else {
		res.sendStatus(401).end();
	}
});

let InactiveConnections;
let InactiveSessions;

Promise.all([Persistence.InactiveConnections, Persistence.InactiveSessions]).then(values => {
	InactiveConnections = values[0];
	InactiveSessions = values[1];
	http.listen(port, err => {
		if (err) throw err;
		console.log("listening on port " + port);
	});
});

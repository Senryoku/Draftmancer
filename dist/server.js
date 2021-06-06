"use strict";
import dotenv from "dotenv";
if (process.env.NODE_ENV !== "production") {
    dotenv.config();
}
const port = process.env.PORT || 3000;
import fs from "fs";
import request from "request";
import compression from "compression";
import express from "express";
const app = express();
import http from "http";
const httpServer = new http.Server(app);
import socketIO from "socket.io";
const io = socketIO(httpServer);
import cookieParser from "cookie-parser";
import uuidv1 from "uuid/v1.js";
import { isEmpty, shuffleArray } from "./utils.js";
import constants from "../client/src/data/constants.json";
import { InactiveConnections, InactiveSessions, dumpError } from "./Persistence.js";
import { Connection, Connections } from "./Connection.js";
import { Session, Sessions, optionProps, instanceOfTurnBased } from "./Session.js";
import { Cards, MTGACards, getUnique } from "./Cards.js";
import { parseLine, parseCardList, XMageToArena } from "./parseCardList.js";
app.use(compression());
app.use(cookieParser());
app.use(express.json());
app.use(express.text({ type: "text/*" }));
function shortguid() {
    function s4() {
        return Math.floor((1 + Math.random()) * 0x10000)
            .toString(16)
            .substring(1);
    }
    return s4() + s4() + s4();
}
function getPublicSessionData(s) {
    return {
        id: s.id,
        description: s.description,
        players: s.users.size,
        maxPlayers: s.maxPlayers,
        cube: s.useCustomCardList,
        sets: s.setRestriction,
    };
}
function getPublicSessions() {
    return Object.values(Sessions)
        .filter(s => s.isPublic && !s.drafting)
        .map(s => getPublicSessionData(s));
}
function updatePublicSession(sid) {
    const s = Sessions[sid];
    if (!s || !s.isPublic || s.drafting) {
        io.emit("updatePublicSession", { id: sid, isPrivate: true });
    }
    else {
        io.emit("updatePublicSession", getPublicSessionData(s));
    }
}
// Set session to private once a draft is started and broadcast the new status.
function startPublicSession(s) {
    if (s.isPublic) {
        s.isPublic = false;
        updatePublicSession(s.id);
    }
}
// Prepare local custom card lists
console.log("Preparing local custom card lists...");
console.time("PrepareCustomCardLists");
const ParsedCubeLists = {};
for (let cube of constants.CubeLists) {
    if (cube.filename) {
        ParsedCubeLists[cube.name] = parseCardList(fs.readFileSync(`./data/cubes/${cube.filename}`, "utf8"), {
            name: cube.name,
        });
        if (ParsedCubeLists[cube.name].error) {
            console.error("An error occured while parsing local cube ", cube);
            console.error(ParsedCubeLists[cube.name].error);
        }
    }
}
console.timeEnd("PrepareCustomCardLists");
console.log("Done.");
/////////////////////////////////////////////////////////////////
// Setup all websocket responses on client connection
const useCustomCardList = function (session, list) {
    session.setCustomCardList(list);
    if (session.isPublic)
        updatePublicSession(session.id);
};
const parseCustomCardList = function (session, txtlist, options, ack) {
    let parsedList = null;
    try {
        parsedList = parseCardList(txtlist, options);
    }
    catch (e) {
        console.error(e);
        ack?.({ type: "error", title: "Internal Error" });
        return;
    }
    if (parsedList.error) {
        ack?.(parsedList.error);
        return;
    }
    useCustomCardList(session, parsedList);
    ack?.({ code: 0 });
};
const checkDraftAction = function (userID, sess, type, ack) {
    if (!sess.drafting || sess.draftState?.type !== type) {
        ack?.({ code: 2, error: "Not drafting." });
        return false;
    }
    if (instanceOfTurnBased(sess.draftState) && userID !== sess.draftState.currentPlayer()) {
        ack?.({ code: 3, error: "Not your turn." });
        return false;
    }
    return true;
};
const socketCallbacks = {
    // Personnal options
    setUserName(userID, sessionID, userName) {
        Connections[userID].userName = userName;
        Sessions[sessionID].forUsers((uid) => Connections[uid]?.socket.emit("updateUser", {
            userID: userID,
            updatedProperties: {
                userName: userName,
            },
        }));
    },
    setCollection(userID, sessionID, collection, ack) {
        if (typeof collection !== "object" || collection === null)
            return;
        let processedCollection = {};
        // Remove unknown cards immediatly.
        for (let aid in collection) {
            if (aid in MTGACards) {
                processedCollection[MTGACards[aid].id] = collection[aid];
            }
        }
        Connections[userID].collection = processedCollection;
        ack?.({ collection: processedCollection });
        const hasCollection = !isEmpty(processedCollection);
        Sessions[sessionID].forUsers(user => Connections[user]?.socket.emit("updateUser", {
            userID: userID,
            updatedProperties: {
                collection: hasCollection,
            },
        }));
    },
    useCollection(userID, sessionID, useCollection) {
        if (typeof useCollection !== "boolean" || useCollection === Connections[userID].useCollection)
            return;
        Connections[userID].useCollection = useCollection;
        Sessions[sessionID].forUsers(user => Connections[user]?.socket.emit("updateUser", {
            userID: userID,
            updatedProperties: {
                useCollection: useCollection,
            },
        }));
    },
    chatMessage(userID, sessionID, message) {
        message.text = message.text.substring(0, Math.min(255, message.text.length)); // Limits chat message length
        Sessions[sessionID].forUsers(user => Connections[user]?.socket.emit("chatMessage", message));
    },
    setReady(userID, sessionID, readyState) {
        Sessions[sessionID].forUsers(user => Connections[user]?.socket.emit("setReady", userID, readyState));
    },
    pickCard(userID, sessionID, data, ack) {
        // Removes picked card from corresponding booster and notify other players.
        // Moves to next round when each player have picked a card.
        try {
            const r = Sessions[sessionID].pickCard(userID, data.pickedCards, data.burnedCards);
            ack?.(r);
        }
        catch (err) {
            ack?.({ code: 500, error: "Internal server error." });
            console.error("Error in pickCard:", err);
            const data = {
                draftState: Sessions[sessionID].draftState,
                sessionProps: {},
            };
            for (let p of optionProps)
                data.sessionProps[p] = Sessions[sessionID][p];
            dumpError(`Error_PickCard_${sessionID}_${new Date().toISOString()}`, data);
        }
    },
    gridDraftPick(userID, sessionID, choice, ack) {
        if (!checkDraftAction(userID, Sessions[sessionID], "grid", ack))
            return;
        const r = Sessions[sessionID].gridDraftPick(choice);
        if (!r)
            ack?.({ code: 1, error: "Internal error." });
        else
            ack?.({ code: 0 });
    },
    rochesterDraftPick(userID, sessionID, choices, ack) {
        if (!checkDraftAction(userID, Sessions[sessionID], "rochester", ack))
            return;
        const r = Sessions[sessionID].rochesterDraftPick(choices[0]);
        if (!r)
            ack?.({ code: 1, error: "Internal error." });
        else
            ack?.({ code: 0 });
    },
    // Winston Draft
    winstonDraftTakePile(userID, sessionID, ack) {
        if (!checkDraftAction(userID, Sessions[sessionID], "winston", ack))
            return;
        const r = Sessions[sessionID].winstonTakePile();
        if (!r)
            ack?.({ code: 1, error: "Internal error." });
        else
            ack?.({ code: 0 });
    },
    winstonDraftSkipPile(userID, sessionID, ack) {
        if (!checkDraftAction(userID, Sessions[sessionID], "winston", ack))
            return;
        const r = Sessions[sessionID].winstonSkipPile();
        if (!r)
            ack?.({ code: 1, error: "This is your only choice!" });
        else
            ack?.({ code: 0 });
    },
    shareDecklist(userID, sessionID, decklist) {
        Sessions[sessionID].shareDecklist(userID, decklist);
    },
    updateBracket(userID, sessionID, results) {
        if (Sessions[sessionID].owner !== userID && Sessions[sessionID].bracketLock)
            return;
        Sessions[sessionID].updateBracket(results);
    },
};
// Socket callback available only to session owners
const ownerSocketCallbacks = {
    setOwnerIsPlayer(userID, sessionID, val) {
        const sess = Sessions[sessionID];
        if (sess.drafting)
            return;
        if (val) {
            sess.ownerIsPlayer = true;
            sess.addUser(userID);
        }
        else {
            sess.ownerIsPlayer = false;
            sess.users.delete(userID);
            sess.notifyUserChange();
        }
        for (let user of sess.users)
            if (user != userID)
                Connections[user]?.socket.emit("sessionOptions", { ownerIsPlayer: sess.ownerIsPlayer });
    },
    readyCheck(userID, sessionID, ack) {
        const sess = Sessions[sessionID];
        if (sess.drafting) {
            ack?.({ code: 1 });
            return;
        }
        ack?.({ code: 0 });
        for (let user of sess.users)
            if (user !== userID)
                Connections[user]?.socket.emit("readyCheck");
    },
    startDraft(userID, sessionID) {
        const sess = Sessions[sessionID];
        if (sess.drafting)
            return;
        if (sess.teamDraft && sess.users.size !== 6) {
            const verb = sess.users.size < 6 ? "add" : "remove";
            Connections[userID].socket.emit("message", {
                title: `Wrong player count`,
                text: `Team draft requires exactly 6 players. Please ${verb} players or disable Team Draft under Settings. Bots are not supported!`,
            });
        }
        else if (sess.users.size === 0 || sess.users.size + sess.bots < 2) {
            Connections[userID].socket.emit("message", {
                title: `Not enough players`,
                text: `Can't start draft: Not enough players (min. 2 including bots).`,
            });
        }
        else {
            sess.startDraft();
            startPublicSession(sess);
        }
    },
    stopDraft(userID, sessionID) {
        Sessions[sessionID].stopDraft();
    },
    pauseDraft(userID, sessionID) {
        Sessions[sessionID].pauseDraft();
    },
    resumeDraft(userID, sessionID) {
        Sessions[sessionID].resumeDraft();
    },
    startGridDraft(userID, sessionID, boosterCount) {
        const sess = Sessions[sessionID];
        if (sess.drafting)
            return;
        if (sess.users.size == 2) {
            if (typeof boosterCount === "string")
                boosterCount = parseInt(boosterCount);
            sess.startGridDraft(boosterCount && !isNaN(boosterCount) ? boosterCount : 18);
            startPublicSession(sess);
        }
        else {
            Connections[userID].socket.emit("message", {
                title: `2 Players Only`,
                text: `Grid Draft can only be played with exactly 2 players. Bots are not supported!`,
            });
        }
    },
    startRochesterDraft(userID, sessionID) {
        const sess = Sessions[sessionID];
        if (!sess || sess.owner != userID || sess.drafting)
            return;
        if (sess.users.size < 2) {
            Connections[userID].socket.emit("message", {
                title: `Not enough players`,
                text: `Rochester Draft can only be played with at least 2 players. Bots are not supported!`,
            });
        }
        else {
            sess.startRochesterDraft();
            startPublicSession(sess);
        }
    },
    startWinstonDraft(userID, sessionID, boosterCount) {
        const sess = Sessions[sessionID];
        if (!sess || sess.owner != userID || sess.drafting)
            return;
        if (sess.users.size == 2) {
            sess.startWinstonDraft(boosterCount ? boosterCount : 6);
            startPublicSession(sess);
        }
        else {
            Connections[userID].socket.emit("message", {
                title: `2 Players Only`,
                text: `Winston Draft can only be played with exactly 2 players. Bots are not supported!`,
            });
        }
    },
    // Session Settings
    setSessionOwner(userID, sessionID, newOwnerID) {
        const sess = Sessions[sessionID];
        if (newOwnerID === sess.owner || !sess.users.has(newOwnerID))
            return;
        if (!sess.ownerIsPlayer) {
            // Prevent changing owner during drafting if owner is not playing
            if (sess.drafting)
                return;
            sess.users.delete(newOwnerID);
            sess.owner = newOwnerID;
            sess.addUser(userID);
        }
        else {
            sess.owner = newOwnerID;
        }
        sess.forUsers(user => Connections[user]?.socket.emit("sessionOwner", sess.owner, sess.owner in Connections ? Connections[sess.owner].userName : null));
    },
    removePlayer(userID, sessionID, userToRemove) {
        if (userToRemove === Sessions[sessionID].owner || !Sessions[sessionID].users.has(userToRemove))
            return;
        removeUserFromSession(userToRemove);
        Sessions[sessionID].replaceDisconnectedPlayers();
        Sessions[sessionID].notifyUserChange();
        const newSession = shortguid();
        joinSession(newSession, userToRemove);
        Connections[userToRemove].socket.emit("setSession", newSession);
        Connections[userToRemove].socket.emit("message", {
            title: "Removed from session",
            text: `You've been removed from session '${sessionID}' by its owner.`,
        });
    },
    setSeating(userID, sessionID, seating) {
        if (!Sessions[sessionID].setSeating(seating))
            Sessions[sessionID].notifyUserChange(); // Something unexpected happened, notify to avoid any potential de-sync.
    },
    randomizeSeating(userID, sessionID) {
        if (!Sessions[sessionID].randomizeSeating())
            Sessions[sessionID].notifyUserChange(); // Something unexpected happened, notify to avoid any potential de-sync.
    },
    boostersPerPlayer(userID, sessionID, boostersPerPlayer) {
        if (!Number.isInteger(boostersPerPlayer))
            boostersPerPlayer = parseInt(boostersPerPlayer);
        if (!Number.isInteger(boostersPerPlayer) || boostersPerPlayer <= 0)
            return;
        if (boostersPerPlayer === Sessions[sessionID].boostersPerPlayer)
            return;
        Sessions[sessionID].setBoostersPerPlayer(boostersPerPlayer);
    },
    cardsPerBooster(userID, sessionID, cardsPerBooster) {
        if (!Number.isInteger(cardsPerBooster))
            cardsPerBooster = parseInt(cardsPerBooster);
        if (!Number.isInteger(cardsPerBooster) || cardsPerBooster <= 0)
            return;
        if (cardsPerBooster === Sessions[sessionID].cardsPerBooster)
            return;
        Sessions[sessionID].setCardsPerBooster(cardsPerBooster);
    },
    teamDraft(userID, sessionID, teamDraft) {
        if (!(typeof teamDraft === "boolean"))
            teamDraft = teamDraft === "true" || !!teamDraft;
        if (!(typeof teamDraft === "boolean"))
            return;
        if (teamDraft === Sessions[sessionID].teamDraft)
            return;
        Sessions[sessionID].setTeamDraft(teamDraft);
    },
    setDistributionMode(userID, sessionID, distributionMode) {
        if (!["regular", "shufflePlayerBoosters", "shuffleBoosterPool"].includes(distributionMode))
            return;
        Sessions[sessionID].distributionMode = distributionMode;
        for (let user of Sessions[sessionID].users) {
            if (user !== userID)
                Connections[user].socket.emit("sessionOptions", { distributionMode: distributionMode });
        }
    },
    setCustomBoosters(userID, sessionID, customBoosters) {
        if (!Array.isArray(customBoosters))
            return;
        Sessions[sessionID].customBoosters = customBoosters;
        for (let user of Sessions[sessionID].users) {
            if (user !== userID)
                Connections[user].socket.emit("sessionOptions", { customBoosters: customBoosters });
        }
    },
    bots(userID, sessionID, bots) {
        if (!Number.isInteger(bots))
            bots = parseInt(bots);
        if (!Number.isInteger(bots))
            return;
        if (bots == Sessions[sessionID].bots)
            return;
        Sessions[sessionID].bots = bots;
        for (let user of Sessions[sessionID].users) {
            if (user !== userID)
                Connections[user].socket.emit("bots", bots);
        }
    },
    setRestriction(userID, sessionID, setRestriction) {
        if (!Array.isArray(setRestriction))
            return;
        if (setRestriction.length > 0) {
            for (let s of setRestriction) {
                if (constants.PrimarySets.indexOf(s) === -1)
                    return;
            }
        }
        if (setRestriction === Sessions[sessionID].setRestriction)
            return;
        Sessions[sessionID].setRestriction = setRestriction;
        for (let user of Sessions[sessionID].users) {
            if (user !== userID)
                Connections[user].socket.emit("setRestriction", setRestriction);
        }
        if (Sessions[sessionID].isPublic)
            updatePublicSession(sessionID);
    },
    parseCustomCardList(userID, sessionID, customCardList, ack) {
        if (!customCardList) {
            ack?.({ code: 1, type: "error", title: "No list supplied." });
            return;
        }
        parseCustomCardList(Sessions[sessionID], customCardList, {}, ack);
    },
    loadFromCubeCobra(userID, sessionID, data, ack) {
        // Cube Infos: https://cubecobra.com/cube/api/cubeJSON/${data.cubeID} ; Cards are listed in the cards array and hold a scryfall id (cardID property), but this endpoint is extremely rate limited.
        // Plain text card list
        const fromTextList = (userID, sessionID, data, ack) => {
            request({ url: `https://cubecobra.com/cube/api/cubelist/${data.cubeID}`, timeout: 3000 }, (err, res, body) => {
                try {
                    if (err) {
                        ack?.({
                            type: "error",
                            title: "Error",
                            text: "Couldn't retrieve the card list from Cube Cobra.",
                            footer: `Full error: ${err}`,
                            error: err,
                        });
                        return;
                    }
                    else if (res.statusCode !== 200) {
                        ack?.({
                            type: "error",
                            title: "Error retrieving cube.",
                            text: `Cube Cobra responded '${res.statusCode}: ${body}'`,
                        });
                        return;
                    }
                    else if (body === "Cube not found.") {
                        ack?.({
                            type: "error",
                            title: "Cube not found.",
                            text: `Cube '${data.cubeID}' not found on Cube Cobra.`,
                            error: err,
                        });
                        return;
                    }
                    else {
                        parseCustomCardList(Sessions[sessionID], body, data, ack);
                    }
                }
                catch (e) {
                    ack?.({ type: "error", title: "Internal server error." });
                }
            });
        };
        if (data.matchVersions) {
            // Xmage (.dck) format
            request({ url: `https://cubecobra.com/cube/download/xmage/${data.cubeID}`, timeout: 3000 }, (err, res, body) => {
                try {
                    if (err) {
                        ack?.({
                            type: "error",
                            title: "Error",
                            text: "Couldn't retrieve the card list from Cube Cobra.",
                            footer: `Full error: ${err}`,
                            error: err,
                        });
                        return;
                    }
                    else if (res.statusCode !== 200) {
                        ack?.({
                            type: "error",
                            title: "Error retrieving cube.",
                            text: `Cube Cobra responded '${res.statusCode}: ${body}'`,
                        });
                        return;
                    }
                    else if (res.req.path.includes("404")) {
                        // Missing cube redirects to /404
                        ack?.({
                            type: "error",
                            title: "Cube not found.",
                            text: `Cube '${data.cubeID}' not found on Cube Cobra.`,
                            error: err,
                        });
                        return;
                    }
                    else {
                        let converted = XMageToArena(body);
                        if (!converted)
                            fromTextList(userID, sessionID, data, ack);
                        // Fallback to plain text list
                        else
                            parseCustomCardList(Sessions[sessionID], converted, Object.assign({ fallbackToCardName: true }, data), ack);
                    }
                }
                catch (e) {
                    ack?.({ type: "error", title: "Internal server error." });
                }
            });
        }
        else {
            fromTextList(userID, sessionID, data, ack);
        }
    },
    loadLocalCustomCardList(userID, sessionID, cubeName, ack) {
        if (!(cubeName in ParsedCubeLists)) {
            ack?.({ code: 1, type: "error", title: `Unknown cube '${cubeName}'` });
            return;
        }
        useCustomCardList(Sessions[sessionID], ParsedCubeLists[cubeName]);
        ack?.({ code: 0 });
    },
    ignoreCollections(userID, sessionID, ignoreCollections) {
        Sessions[sessionID].ignoreCollections = ignoreCollections;
        for (let user of Sessions[sessionID].users) {
            if (user != userID)
                Connections[user].socket.emit("ignoreCollections", Sessions[sessionID].ignoreCollections);
        }
    },
    setPickTimer(userID, sessionID, timerValue) {
        if (!Number.isInteger(timerValue))
            timerValue = parseInt(timerValue);
        if (!Number.isInteger(timerValue) || timerValue < 0)
            return;
        Sessions[sessionID].maxTimer = timerValue;
        for (let user of Sessions[sessionID].users) {
            if (user != userID)
                Connections[user].socket.emit("setPickTimer", timerValue);
        }
    },
    setMaxPlayers(userID, sessionID, maxPlayers) {
        if (!Number.isInteger(maxPlayers))
            maxPlayers = parseInt(maxPlayers);
        if (!Number.isInteger(maxPlayers) || maxPlayers < 0)
            return;
        Sessions[sessionID].maxPlayers = maxPlayers;
        for (let user of Sessions[sessionID].users) {
            if (user !== userID)
                Connections[user].socket.emit("setMaxPlayers", maxPlayers);
        }
    },
    setMythicPromotion(userID, sessionID, mythicPromotion) {
        if (typeof mythicPromotion !== "boolean")
            return;
        Sessions[sessionID].mythicPromotion = mythicPromotion;
        for (let user of Sessions[sessionID].users) {
            if (user !== userID)
                Connections[user].socket.emit("sessionOptions", { mythicPromotion: mythicPromotion });
        }
    },
    setBoosterContent(userID, sessionID, boosterContent) {
        // Validate input (a value for each rarity and at least one card)
        if (boosterContent === null || !(typeof boosterContent === "object"))
            return;
        if (!["common", "uncommon", "rare"].every(r => r in boosterContent))
            return;
        if (["common", "uncommon", "rare"].every(r => boosterContent[r] === Sessions[sessionID].boosterContent[r]))
            return;
        if (Object.values(boosterContent).some(i => !Number.isInteger(i) || i < 0))
            return;
        if (Object.values(boosterContent).reduce((acc, val) => acc + val) <= 0)
            return;
        Sessions[sessionID].boosterContent = boosterContent;
        for (let user of Sessions[sessionID].users) {
            if (user !== userID)
                Connections[user].socket.emit("sessionOptions", { boosterContent: boosterContent });
        }
    },
    setUsePredeterminedBoosters(userID, sessionID, value, ack) {
        Sessions[sessionID].usePredeterminedBoosters = value;
        Sessions[sessionID].forNonOwners(uid => Connections[uid].socket.emit("sessionOptions", { usePredeterminedBoosters: value }));
        ack?.({ code: 0 });
    },
    setBoosters(userID, sessionID, text, ack) {
        try {
            let boosters = [];
            let booster = [];
            for (let line of text.split("\n")) {
                if (!line || line === "") {
                    if (booster.length === 0)
                        continue;
                    boosters.push(booster);
                    booster = [];
                }
                else {
                    let [count, cardID, foil] = parseLine(line);
                    if (typeof cardID !== "undefined") {
                        for (let i = 0; i < count; ++i) {
                            let card = getUnique(cardID);
                            if (foil)
                                card.foil = true;
                            booster.push(card);
                        }
                    }
                    else {
                        ack?.(count);
                        return;
                    }
                }
            }
            if (booster.length > 0)
                boosters.push(booster);
            if (boosters.length === 0) {
                ack?.({ error: { title: "Empty list" } });
                return;
            }
            for (let i = 1; i < boosters.length; ++i) {
                if (boosters[i].length !== boosters[0].length) {
                    ack?.({
                        error: {
                            title: "Inconsistent booster sizes",
                            text: `All boosters must be of the same size. Booster #${i + 1} has ${boosters[i].length} cards, expected ${boosters[0].length}.`,
                        },
                    });
                    return;
                }
            }
            Sessions[sessionID].boosters = boosters;
            Sessions[sessionID].usePredeterminedBoosters = true;
            Sessions[sessionID].forUsers(uid => Connections[uid]?.socket.emit("sessionOptions", { usePredeterminedBoosters: true }));
            ack?.({ code: 0 });
        }
        catch (e) {
            ack?.({ error: { title: "Internal error." } });
        }
    },
    shuffleBoosters(userID, sessionID, ack) {
        if (!Sessions[sessionID].boosters || Sessions[sessionID].boosters.length === 0) {
            ack?.({ error: { type: "error", title: "No boosters to shuffle." } });
        }
        else {
            shuffleArray(Sessions[sessionID].boosters);
            ack?.({ code: 0 });
        }
    },
    setDraftLogRecipients(userID, sessionID, draftLogRecipients) {
        if (typeof draftLogRecipients !== "string")
            return;
        draftLogRecipients = draftLogRecipients.toLowerCase();
        if (!["everyone", "owner", "delayed", "none"].includes(draftLogRecipients))
            return;
        Sessions[sessionID].draftLogRecipients = draftLogRecipients;
        for (let user of Sessions[sessionID].users) {
            if (user !== userID)
                Connections[user].socket.emit("sessionOptions", {
                    draftLogRecipients: draftLogRecipients,
                });
        }
    },
    setMaxDuplicates(userID, sessionID, maxDuplicates) {
        if (maxDuplicates !== null && !(typeof maxDuplicates === "object"))
            return;
        if (maxDuplicates !== null &&
            typeof maxDuplicates === "object" &&
            Object.values(maxDuplicates).some(i => !Number.isInteger(i)))
            return;
        Sessions[sessionID].maxDuplicates = maxDuplicates;
        for (let user of Sessions[sessionID].users) {
            if (user !== userID)
                Connections[user].socket.emit("sessionOptions", {
                    maxDuplicates: maxDuplicates,
                });
        }
    },
    setColorBalance(userID, sessionID, colorBalance) {
        if (colorBalance === Sessions[sessionID].colorBalance)
            return;
        Sessions[sessionID].colorBalance = colorBalance;
        for (let user of Sessions[sessionID].users) {
            if (user !== userID && user in Connections)
                Connections[user].socket.emit("sessionOptions", {
                    colorBalance: Sessions[sessionID].colorBalance,
                });
        }
    },
    setFoil(userID, sessionID, foil) {
        if (foil === Sessions[sessionID].foil)
            return;
        Sessions[sessionID].foil = foil;
        for (let user of Sessions[sessionID].users) {
            if (user !== userID && user in Connections)
                Connections[user].socket.emit("sessionOptions", {
                    foil: Sessions[sessionID].foil,
                });
        }
    },
    setCollationType(userID, sessionID, preferedCollation) {
        if (preferedCollation === Sessions[sessionID].preferedCollation ||
            !["Paper", "MTGA"].includes(preferedCollation))
            return;
        Sessions[sessionID].preferedCollation = preferedCollation;
        for (let user of Sessions[sessionID].users) {
            if (user !== userID && user in Connections)
                Connections[user].socket.emit("sessionOptions", {
                    preferedCollation: Sessions[sessionID].preferedCollation,
                });
        }
    },
    setUseCustomCardList(userID, sessionID, useCustomCardList) {
        if (useCustomCardList == Sessions[sessionID].useCustomCardList)
            return;
        Sessions[sessionID].useCustomCardList = useCustomCardList;
        for (let user of Sessions[sessionID].users) {
            if (user !== userID && user in Connections)
                Connections[user].socket.emit("sessionOptions", {
                    useCustomCardList: Sessions[sessionID].useCustomCardList,
                });
        }
        if (Sessions[sessionID].isPublic)
            updatePublicSession(sessionID);
    },
    setPickedCardsPerRound(userID, sessionID, pickedCardsPerRound) {
        if (!Number.isInteger(pickedCardsPerRound))
            pickedCardsPerRound = parseInt(pickedCardsPerRound);
        if (!Number.isInteger(pickedCardsPerRound) || pickedCardsPerRound < 1)
            return;
        Sessions[sessionID].pickedCardsPerRound = pickedCardsPerRound;
        for (let user of Sessions[sessionID].users) {
            if (user !== userID && user in Connections)
                Connections[user].socket.emit("sessionOptions", { pickedCardsPerRound: pickedCardsPerRound });
        }
    },
    setBurnedCardsPerRound(userID, sessionID, burnedCardsPerRound) {
        if (!Number.isInteger(burnedCardsPerRound))
            burnedCardsPerRound = parseInt(burnedCardsPerRound);
        if (!Number.isInteger(burnedCardsPerRound) || burnedCardsPerRound < 0)
            return;
        Sessions[sessionID].burnedCardsPerRound = burnedCardsPerRound;
        for (let user of Sessions[sessionID].users) {
            if (user !== userID && user in Connections)
                Connections[user].socket.emit("sessionOptions", { burnedCardsPerRound: burnedCardsPerRound });
        }
    },
    setPublic(userID, sessionID, isPublic) {
        if (isPublic == Sessions[sessionID].isPublic)
            return;
        Sessions[sessionID].isPublic = isPublic;
        for (let user of Sessions[sessionID].users) {
            if (user !== userID)
                Connections[user].socket.emit("isPublic", Sessions[sessionID].isPublic);
        }
        updatePublicSession(sessionID);
    },
    setDescription(userID, sessionID, description) {
        if (description === null || description === undefined || description === Sessions[sessionID].description)
            return;
        Sessions[sessionID].description = description.substring(0, 70);
        for (let user of Sessions[sessionID].users) {
            if (user !== userID)
                Connections[user].socket.emit("description", Sessions[sessionID].description);
        }
        updatePublicSession(sessionID);
    },
    replaceDisconnectedPlayers(userID, sessionID) {
        Sessions[sessionID].replaceDisconnectedPlayers();
    },
    distributeSealed(userID, sessionID, boostersPerPlayer, customBoosters) {
        if (isNaN(boostersPerPlayer))
            return;
        Sessions[sessionID].distributeSealed(boostersPerPlayer, customBoosters);
    },
    distributeJumpstart(userID, sessionID) {
        Sessions[sessionID].distributeJumpstart();
    },
    generateBracket(userID, sessionID, players, ack) {
        if (!((players.length === 8 && !Sessions[sessionID].teamDraft) ||
            (players.length === 6 && Sessions[sessionID].teamDraft)))
            return;
        Sessions[sessionID].generateBracket(players);
        ack?.({ code: 0 });
    },
    generateSwissBracket(userID, sessionID, players, ack) {
        if (players.length !== 8)
            return;
        Sessions[sessionID].generateSwissBracket(players);
        ack?.({ code: 0 });
    },
    generateDoubleBracket(userID, sessionID, players, ack) {
        if (players.length !== 8)
            return;
        Sessions[sessionID].generateDoubleBracket(players);
        ack?.({ code: 0 });
    },
    lockBracket(userID, sessionID, bracketLocked) {
        Sessions[sessionID].bracketLocked = bracketLocked;
        for (let user of Sessions[sessionID].users) {
            if (user !== userID && user in Connections)
                Connections[user].socket.emit("sessionOptions", { bracketLocked: bracketLocked });
        }
    },
    shareDraftLog(userID, sessionID, draftLog) {
        const sess = Sessions[sessionID];
        if (!draftLog)
            return;
        // Update local copy to be public
        if (!sess.draftLog && sess.id === draftLog.sessionID)
            sess.draftLog = draftLog;
        else if (sess.draftLog.sessionID === draftLog.sessionID && sess.draftLog.time === draftLog.time)
            sess.draftLog.delayed = false;
        // Send the full copy to everyone
        for (let user of sess.users)
            if (user !== userID)
                Connections[user].socket.emit("draftLog", draftLog);
    },
};
function prepareSocketCallback(callback, ownerOnly = false) {
    return function () {
        // Last argument is assumed to be an acknowledgement function if it is a function.
        const ack = arguments.length > 0 && arguments[arguments.length - 1] instanceof Function
            ? arguments[arguments.length - 1]
            : null;
        const userID = this.handshake.query.userID;
        if (!(userID in Connections)) {
            ack?.({ code: 1, error: "Internal error. User does not exist." });
            return;
        }
        const sessionID = Connections[userID].sessionID;
        if (!sessionID || !(sessionID in Sessions)) {
            ack?.({ code: 1, error: "Internal error. Session does not exist." });
            return;
        }
        if (ownerOnly && Sessions[sessionID].owner !== userID) {
            ack?.({ code: 401, error: "Unautorized. Must be session owner." });
            return;
        }
        try {
            callback(userID, sessionID, ...arguments);
        }
        catch (e) {
            ack?.({ code: 500, error: "Internal server error." });
            console.error(e);
        }
    };
}
io.on("connection", async function (socket) {
    const query = socket.handshake.query;
    console.log(`${query.userName} [${query.userID}] connected. (${Object.keys(Connections).length + 1} players online)`);
    if (query.userID in Connections) {
        console.log(`${query.userName} [${query.userID}] already connected.`);
        // For some reason sockets doesn't always cleanly disconnects.
        // Give 3sec. for the original socket to respond or we'll close it.
        // Ask the user to wait while we test the previous connection...
        socket.emit("message", {
            title: "Connecting...",
            allowOutsideClick: false,
        });
        await new Promise(resolve => {
            (targetSocket => {
                const timeout = setTimeout(() => {
                    // Previous connection did not respond in time, close it and continue as normal.
                    targetSocket.disconnect();
                    // Wait for the socket to be properly disconnected and the previous Connection deleted.
                    process.nextTick(() => {
                        resolve();
                    });
                }, 3000);
                targetSocket.emit("stillAlive", () => {
                    // Previous connection is still alive, generate a new userID.
                    clearTimeout(timeout);
                    query.userID = uuidv1();
                    socket.emit("alreadyConnected", query.userID);
                    resolve();
                });
            })(Connections[query.userID].socket);
        });
    }
    if (query.userID in InactiveConnections) {
        // Restore previously saved connection
        // TODO: Front and Back end may be out of sync after this!
        InactiveConnections[query.userID].socket = socket;
        Connections[query.userID] = InactiveConnections[query.userID];
        delete InactiveConnections[query.userID];
    }
    else {
        Connections[query.userID] = new Connection(socket, query.userID, query.userName);
    }
    // Messages
    socket.on("disconnect", function () {
        const userID = this.handshake.query.userID;
        if (userID in Connections && Connections[userID].socket === this) {
            console.log(`${Connections[userID].userName} [${userID}] disconnected. (${Object.keys(Connections).length -
                1} players online)`);
            removeUserFromSession(userID);
            process.nextTick(() => {
                if (Connections[userID].socket === this)
                    delete Connections[userID];
            });
        }
    });
    socket.on("error", function (err) {
        console.error("Socket.io error: ");
        console.error(err);
    });
    socket.on("setSession", function (sessionID) {
        const userID = this.handshake.query.userID;
        if (sessionID === Connections[userID].sessionID)
            return;
        joinSession(sessionID, userID);
    });
    for (let key in socketCallbacks)
        socket.on(key, prepareSocketCallback(socketCallbacks[key]));
    for (let key in ownerSocketCallbacks)
        socket.on(key, prepareSocketCallback(ownerSocketCallbacks[key], true));
    joinSession(query.sessionID, query.userID);
    socket.emit("publicSessions", getPublicSessions());
});
///////////////////////////////////////////////////////////////////////////////
function joinSession(sessionID, userID) {
    // Fallback to previous session if possible, or generate a new one
    const refuse = msg => {
        Connections[userID].socket.emit("message", {
            title: "Cannot join session",
            html: msg,
        });
        if (Connections[userID].sessionID === null)
            sessionID = shortguid();
        else
            sessionID = Connections[userID].sessionID;
        Connections[userID].socket.emit("setSession", sessionID);
    };
    if (sessionID in InactiveSessions) {
        if (InactiveSessions[sessionID].drafting && !(userID in InactiveSessions[sessionID].disconnectedUsers)) {
            refuse(`Session '${sessionID}' is currently drafting.`);
            return;
        }
        console.log(`Restoring inactive session '${sessionID}'...`);
        // Always having a valid owner is more important than preserving the old one - probably.
        if (InactiveSessions[sessionID].ownerIsPlayer)
            InactiveSessions[sessionID].owner = userID;
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
        const bracketLink = sess.bracket
            ? `<br />Bracket is available <a href="/bracket?session=${encodeURI(sessionID)}" target="_blank" rel="noopener nofollow">here</a>.`
            : "";
        // Session exists and is drafting
        if (sess.drafting) {
            console.log(`${userID} wants to join drafting session '${sessionID}'... userID in sess.disconnectedUsers: ${userID in
                sess.disconnectedUsers}`);
            if (userID in sess.disconnectedUsers) {
                sess.reconnectUser(userID);
            }
            else {
                refuse(`This session (${sessionID}) is currently drafting. Please wait for them to finish.${bracketLink}`);
            }
        }
        else if (sess.getHumanPlayerCount() >= sess.maxPlayers) {
            // Session exists and is full
            refuse(`This session (${sessionID}) is full (${sess.users.size}/${sess.maxPlayers} players).${bracketLink}`);
        }
        else {
            addUserToSession(userID, sessionID);
        }
    }
    else {
        addUserToSession(userID, sessionID);
    }
}
function addUserToSession(userID, sessionID) {
    const options = {};
    if (Connections[userID].sessionID !== null && Connections[userID].sessionID in Sessions) {
        // Transfer session options to the new one if applicable
        if (userID === Sessions[Connections[userID].sessionID].owner) {
            for (let p of optionProps) {
                options[p] = Sessions[Connections[userID].sessionID][p];
            }
        }
        removeUserFromSession(userID);
    }
    if (!(sessionID in Sessions))
        Sessions[sessionID] = new Session(sessionID, userID, options);
    Sessions[sessionID].addUser(userID);
    if (Sessions[sessionID].isPublic)
        updatePublicSession(sessionID);
}
function deleteSession(sessionID) {
    const wasPublic = Sessions[sessionID].isPublic;
    process.nextTick(() => {
        delete Sessions[sessionID];
        if (wasPublic)
            updatePublicSession(sessionID);
    });
}
// Remove user from previous session and cleanup if empty
function removeUserFromSession(userID) {
    const sessionID = Connections[userID].sessionID;
    if (sessionID in Sessions) {
        let sess = Sessions[sessionID];
        if (sess.users.has(userID)) {
            sess.remUser(userID);
            if (sess.isPublic)
                updatePublicSession(sessionID);
            Connections[userID].sessionID = null;
            // Keep session alive if the owner wasn't a player and is still connected.
            if ((sess.ownerIsPlayer || !(sess.owner in Connections)) && sess.users.size === 0) {
                deleteSession(sessionID);
            }
            else
                sess.notifyUserChange();
        }
        else if (userID === sess.owner && !sess.ownerIsPlayer && sess.users.size === 0) {
            // User was a non-playing owner and alone in this session
            deleteSession(sessionID);
        }
    }
}
///////////////////////////////////////////////////////////////////////////////
// Express server setup
// Serve files in the public directory
app.use(express.static("./client/public/"));
///////////////////////////////////////////////////////////////////////////////
// Endpoints
// (TODO: Should be cleaned up)
app.get("/getCollection", (req, res) => {
    if (!req.cookies.sessionID) {
        res.sendStatus(400);
    }
    else if (req.params.sessionID in Sessions) {
        res.send(Sessions[req.cookies.sessionID].collection(false));
    }
    else {
        res.sendStatus(404);
    }
});
app.get("/getCollection/:sessionID", (req, res) => {
    if (!req.params.sessionID) {
        res.sendStatus(400);
    }
    else if (req.params.sessionID in Sessions) {
        res.send(Sessions[req.params.sessionID].collection(false));
    }
    else {
        res.sendStatus(404);
    }
});
function returnCollectionPlainText(res, sid) {
    if (!sid) {
        res.sendStatus(400);
    }
    else if (sid in Sessions) {
        const coll = Sessions[sid].collection(false);
        let r = "";
        for (let cid in coll)
            r += `${coll[cid]} ${Cards[cid].name}\n`;
        res.set("Content-disposition", `attachment; filename=collection_${sid}`);
        res.set("Content-Type", "text/plain");
        res.send(r);
    }
    else {
        res.sendStatus(404);
    }
}
app.get("/getCollectionPlainText/", (req, res) => {
    returnCollectionPlainText(res, req.cookies.sessionID);
});
app.get("/getCollectionPlainText/:sessionID", (req, res) => {
    returnCollectionPlainText(res, req.params.sessionID);
});
app.get("/getUsers/:sessionID", (req, res) => {
    if (!req.params.sessionID) {
        res.sendStatus(400);
    }
    else if (req.params.sessionID in Sessions) {
        res.send(JSON.stringify([...Sessions[req.params.sessionID].users]));
    }
    else {
        res.sendStatus(404);
    }
});
// Returns card data from a list of card ids
app.post("/getCards", (req, res) => {
    if (!req.body) {
        res.sendStatus(400);
    }
    else {
        try {
            res.setHeader("Content-Type", "application/json");
            if (Array.isArray(req.body)) {
                res.send(JSON.stringify(req.body.map(cid => Cards[cid])));
            }
            else if (typeof req.body === "object") {
                const r = {};
                for (let slot in req.body)
                    r[slot] = req.body[slot].map(cid => Cards[cid]);
                res.send(JSON.stringify(r));
            }
            else {
                res.sendStatus(400);
            }
        }
        catch (e) {
            console.error(e);
            res.sendStatus(500);
        }
    }
});
app.post("/getDeck", (req, res) => {
    if (!req.body) {
        res.status(400).send({ error: { message: `Bad request.` } });
    }
    else {
        try {
            let r = { deck: [], sideboard: [] };
            const lines = req.body.split(/\r\n|\n/);
            let target = r.deck;
            for (let line of lines) {
                line = line.trim();
                if (line === "Deck")
                    target = r.deck;
                if (line === "Sideboard" || (line === "" && r.deck.length > 0))
                    target = r.sideboard;
                if (["", "Deck", "Sideboard"].includes(line))
                    continue;
                let [count, cardID] = parseLine(line);
                if (typeof cardID !== "undefined") {
                    for (let i = 0; i < count; ++i)
                        target.push(getUnique(cardID));
                }
                else {
                    res.status(400).send({ error: { message: `Error on line '${line}'` } });
                    return;
                }
            }
            res.setHeader("Content-Type", "application/json");
            res.send(JSON.stringify(r));
        }
        catch (e) {
            console.log(e);
            res.sendStatus(500);
        }
    }
});
app.get("/bracket", (req, res) => {
    res.sendFile("client/public/bracket.html", { root: "." });
});
app.get("/getBracket/:sessionID", (req, res) => {
    const sid = req.params.sessionID;
    if (!sid) {
        res.sendStatus(400);
    }
    else if (sid in Sessions && Sessions[sid].bracket) {
        res.setHeader("Content-Type", "application/json");
        res.send(JSON.stringify(Sessions[sid].bracket));
    }
    else {
        res.sendStatus(404);
    }
});
app.get("/getDraftLog/:sessionID", (req, res) => {
    if (!req.params.sessionID) {
        res.sendStatus(400);
    }
    else if (req.params.sessionID in Sessions && Sessions[req.params.sessionID].draftLog) {
        res.setHeader("Content-Type", "application/json");
        if (Sessions[req.params.sessionID].draftLog.delayed)
            res.send(JSON.stringify(Sessions[req.params.sessionID].getStrippedLog()));
        else
            res.send(JSON.stringify(Sessions[req.params.sessionID].draftLog));
    }
    else {
        res.sendStatus(404);
    }
});
// Debug endpoints
const secretKey = process.env.SECRET_KEY || "1234";
var express_json_cache = []; // Clear this before calling
app.set("json replacer", function (key, value) {
    if (!express_json_cache)
        express_json_cache = [];
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
app.get("/getSessionsDebug/:key", (req, res) => {
    if (req.params.key === secretKey) {
        returnJSON(res, Sessions);
    }
    else {
        res.sendStatus(401).end();
    }
});
app.get("/getConnections/:key", (req, res) => {
    if (req.params.key === secretKey) {
        returnJSON(res, Connections);
    }
    else {
        res.sendStatus(401).end();
    }
});
app.get("/getStatus/:key", (req, res) => {
    if (req.params.key === secretKey) {
        let draftingSessions = 0;
        let draftingPlayers = 0;
        for (let sID in Sessions) {
            if (Sessions[sID].drafting) {
                ++draftingSessions;
                draftingPlayers += Sessions[sID].users.size;
            }
        }
        let uptime = process.uptime();
        returnJSON(res, {
            uptime: uptime,
            sessionCount: Object.keys(Sessions).length,
            playerCount: Object.keys(Connections).length,
            draftingSessions: draftingSessions,
            draftingPlayers: draftingPlayers,
            canRestart: draftingSessions === 0,
        });
    }
    else {
        res.sendStatus(401).end();
    }
});
// Used by Discord Bot
app.get("/getSessions/:key", (req, res) => {
    if (req.params.key === secretKey) {
        let localSess = {};
        for (let sid in Sessions)
            localSess[sid] = {
                id: sid,
                drafting: Sessions[sid].drafting,
                users: Sessions[sid].users,
                maxPlayers: Sessions[sid].maxPlayers,
                useCustomCardList: Sessions[sid].useCustomCardList,
                customCardList: Sessions[sid].customCardList
                    ? {
                        name: Sessions[sid].customCardList.name,
                        length: Sessions[sid].customCardList.length,
                    }
                    : null,
                setRestriction: Sessions[sid].setRestriction,
            };
        returnJSON(res, localSess);
    }
    else {
        res.sendStatus(401).end();
    }
});
Promise.all([InactiveConnections, InactiveSessions]).then(() => {
    httpServer.listen(port, err => {
        if (err)
            throw err;
        console.log("listening on port " + port);
    });
});
export default {};

"use strict";
import "core-js/features/string/match-all.js";
import io from "socket.io-client";
import Vue from "vue";
import draggable from "vuedraggable";
import VTooltip from "v-tooltip";
import { Multiselect } from "vue-multiselect";
import Swal from "sweetalert2";
import LogStoreWorker from "./logstore.worker.js";

import Constant from "../../src/data/constants.json";
import SetsInfos from "../public/data/SetsInfos.json";
import { isEmpty, randomStr4, guid, shortguid, getUrlVars, copyToClipboard } from "./helper.js";
import { getCookie, setCookie } from "./cookies.js";
import { ButtonColor, Alert, fireToast } from "./alerts.js";
import exportToMTGA from "./exportToMTGA.js";
import parseCSV from "./parseCSV.js";

import BoosterCard from "./components/BoosterCard.vue";
import Bracket from "./components/Bracket.vue";
import Card from "./components/Card.vue";
import CardPlaceholder from "./components/CardPlaceholder.vue";
import CardPool from "./components/CardPool.vue";
import CardPopup from "./components/CardPopup.vue";
import DelayedInput from "./components/DelayedInput.vue";
import DraftLog from "./components/DraftLog.vue";
import DraftLogHistory from "./components/DraftLogHistory.vue";
import DraftLogLive from "./components/DraftLogLive.vue";
import DraftLogPick from "./components/DraftLogPick.vue";
import Dropdown from "./components/Dropdown.vue";
import Esporter from "./components/Esporter.vue";
import GridDraft from "./components/GridDraft.vue";
import MinesweeperDraft from "./components/MinesweeperDraft.vue";
import LandControl from "./components/LandControl.vue";
import Modal from "./components/Modal.vue";
import PatchNotes from "./components/PatchNotes.vue";
import PickSummary from "./components/PickSummary.vue";
import SetRestriction from "./components/SetRestriction.vue";

// Preload Carback
import CardBack from /* webpackPrefetch: true */ "./assets/img/cardback.png";
const img = new Image();
img.src = CardBack;

const DraftState = {
	Waiting: "Waiting",
	Picking: "Picking",
	Brewing: "Brewing",
	Watching: "Watching",
	WinstonPicking: "WinstonPicking",
	WinstonWaiting: "WinstonWaiting",
	GridPicking: "GridPicking",
	GridWaiting: "GridWaiting",
	RochesterPicking: "RochesterPicking",
	RochesterWaiting: "RochesterWaiting",
	MinesweeperPicking: "MinesweeperPicking",
	MinesweeperWaiting: "MinesweeperWaiting",
};

const ReadyState = {
	Unknown: "Unknown",
	Ready: "Ready",
	NotReady: "NotReady",
	DontCare: "DontCare",
};

const Sounds = {
	start: new Audio("sound/drop_003.ogg"),
	next: new Audio("sound/next.mp3"),
	countdown: new Audio("sound/click_001.ogg"),
	readyCheck: new Audio("sound/drop_003.ogg"),
};

Vue.use(VTooltip, {
	defaultPlacement: "bottom-start",
	defaultBoundariesElement: "window",
	defaultDelay: 250,
});

const localStorageSettingsKey = "mtgadraft-settings";
const localStorageSessionSettingsKey = "mtgadraft-session-settings";

// Personal front-end settings
const defaultSettings = {
	targetDeckSize: 40,
	hideSessionID: false,
	displayCollectionStatus: true,
	displayBotScores: false,
	pickOnDblclick: true,
	enableSound: true,
	enableNotifications: false,
	collapseSideboard: false,
	sideboardBasics: 5,
};
const storedSettings = JSON.parse(localStorage.getItem(localStorageSettingsKey) ?? "{}");

// Also get the settings from the cookies for backwards compatibility.
// FIXME: Should be removed after a while.
function getSettingFromCookie(name) {
	if (name in storedSettings) return; // Prioritize the localStore settings.
	const cookieValue = getCookie(name, null);
	if (cookieValue) {
		storedSettings[name] = cookieValue;
		// 'Cast' strings from cookies into booleans
		if (typeof defaultSettings[name] === "boolean" && typeof storedSettings[name] === "string")
			storedSettings[name] = storedSettings[name] === "true";
	}
}
for (const name in defaultSettings) getSettingFromCookie(name);

const initialSettings = Object.assign(defaultSettings, storedSettings);

export default {
	components: {
		BoosterCard,
		Bracket,
		Card,
		CardList: () => import("./components/CardList.vue"),
		CardPlaceholder,
		CardPool,
		CardPopup,
		CardStats: () => import("./components/CardStats.vue"),
		Collection: () => import("./components/Collection.vue"),
		DelayedInput,
		DraftLog,
		DraftLogHistory,
		DraftLogLive,
		DraftLogPick,
		Dropdown,
		Esporter,
		GridDraft,
		MinesweeperDraft,
		LandControl,
		Modal,
		Multiselect,
		PatchNotes,
		PickSummary,
		SetRestriction,
		draggable,
	},
	data: () => {
		return {
			ready: false, // Wait for initial loading

			// User Data
			userID: guid(),
			userName: getCookie("userName", `Player_${randomStr4()}`),
			useCollection: true,
			collection: {},
			collectionInfos: {
				wildcards: { common: 0, uncommon: 0, rare: 0, mythic: 0 },
			},
			socket: undefined,

			// Session status
			sessionID: getCookie("sessionID", shortguid()),
			sessionOwner: null,
			sessionOwnerUsername: null,
			sessionUsers: [],
			disconnectedUsers: {},
			// Session settings
			ownerIsPlayer: true,
			isPublic: false,
			description: "",
			ignoreCollections: true,
			boostersPerPlayer: 3,
			cardsPerBooster: 15,
			teamDraft: false,
			randomizeSeatingOrder: false,
			disableBotSuggestions: false,
			distributionMode: "regular",
			customBoosters: ["", "", ""],
			maxPlayers: 8,
			mythicPromotion: true,
			useBoosterContent: false,
			boosterContent: {
				common: 10,
				uncommon: 3,
				rare: 1,
			},
			usePredeterminedBoosters: false,
			colorBalance: true,
			maxDuplicates: null,
			foil: false,
			bots: 0,
			setRestriction: [],
			drafting: false,
			useCustomCardList: false,
			customCardList: {},
			pickedCardsPerRound: 1,
			burnedCardsPerRound: 0,
			discardRemainingCardsAt: 0,
			maxTimer: 75,
			pickTimer: 75,
			personalLogs: true,
			draftLogRecipients: "everyone",
			bracketLocked: false,
			//
			draftLogs: [],
			currentDraftLog: null,
			draftLogLive: null,
			bracket: null,
			virtualPlayersData: undefined,
			booster: [],
			boosterNumber: 0,
			pickNumber: 0,
			botScores: null,
			winstonDraftState: null,
			gridDraftState: null,
			rochesterDraftState: null,
			minesweeperDraftState: null,
			draftPaused: false,

			publicSessions: [],

			// Front-end options & data
			displayedModal: "",
			userOrder: [],
			hideSessionID: initialSettings.hideSessionID,
			languages: Constant.Languages,
			language: getCookie("language", "en"),
			displayCollectionStatus: defaultSettings.displayCollectionStatus,
			sets: Constant.MTGASets,
			primarySets: Constant.PrimarySets,
			cubeLists: Constant.CubeLists,
			pendingReadyCheck: false,
			setsInfos: undefined,
			draftingState: undefined,
			displayBotScores: defaultSettings.displayBotScores,
			pickOnDblclick: defaultSettings.pickOnDblclick,
			enableSound: defaultSettings.enableSound,
			enableNotifications:
				typeof Notification !== "undefined" &&
				Notification &&
				Notification.permission == "granted" &&
				defaultSettings.enableNotifications,
			notificationPermission: typeof Notification !== "undefined" && Notification && Notification.permission,
			titleNotification: null,
			// Draft Booster
			pickInFlight: false,
			selectedCards: [],
			burningCards: [],
			// Brewing (deck and sideboard should not be modified directly, have to
			// stay in sync with their CardPool display)
			deck: [],
			sideboard: [],
			deckFilter: "",
			collapseSideboard: defaultSettings.collapseSideboard,
			autoLand: true,
			lands: { W: 0, U: 0, B: 0, R: 0, G: 0 },
			targetDeckSize: initialSettings.targetDeckSize,
			sideboardBasics: initialSettings.sideboardBasics,
			//
			selectedCube: Constant.CubeLists.length > 0 ? Constant.CubeLists[0] : null,

			// Chat
			currentChatMessage: "",
			displayChatHistory: false,
			messagesHistory: [],
		};
	},
	methods: {
		initializeSocket() {
			let storedUserID = getCookie("userID", null);
			if (storedUserID != null) {
				this.userID = storedUserID;
				// Server will handle the reconnect attempt if draft is still ongoing
				console.log("storedUserID: " + storedUserID);
			}

			const storedSessionSettings = localStorage.getItem(localStorageSessionSettingsKey) ?? "{}";

			// Socket Setup
			this.socket = io({
				query: {
					userID: this.userID,
					sessionID: this.sessionID,
					userName: this.userName,
					sessionSettings: storedSessionSettings,
				},
			});

			this.socket.on("disconnect", () => {
				console.log("Disconnected from server.");
				// Avoid closing an already opened modal
				if (!Swal.isVisible())
					Alert.fire({
						icon: "error",
						title: "Disconnected!",
						showConfirmButton: false,
					});
			});

			this.socket.io.on("reconnect", (attemptNumber) => {
				console.log(`Reconnected to server (attempt ${attemptNumber}).`);
				// Re-sync collection on reconnect.
				if (this.hasCollection) this.socket.emit("setCollection", this.collection);
				setCookie("useCollection", this.useCollection.toString());

				Alert.fire({
					icon: "warning",
					title: "Reconnected!",
					timer: 1500,
				});
			});

			this.socket.on("alreadyConnected", (newID) => {
				this.userID = newID;
				this.socket.io.opts.query.userID = newID;
				fireToast("warning", "Duplicate UserID: A new UserID as been affected to this instance.");
			});

			this.socket.on("stillAlive", (ack) => {
				if (ack) ack();
			});

			this.socket.on("chatMessage", (message) => {
				this.messagesHistory.push(message);
				// TODO: Cleanup this?
				let bubble = document.querySelector("#chat-bubble-" + message.author);
				bubble.innerText = message.text;
				bubble.style.opacity = 1;
				if (bubble.timeoutHandler) clearTimeout(bubble.timeoutHandler);
				bubble.timeoutHandler = window.setTimeout(() => (bubble.style.opacity = 0), 5000);
			});

			this.socket.on("publicSessions", (sessions) => {
				this.publicSessions = sessions;
			});

			this.socket.on("updatePublicSession", (session) => {
				const idx = this.publicSessions.findIndex((s) => s.id === session.id);
				if (session.isPrivate) {
					if (idx !== -1) this.publicSessions.splice(idx, 1);
				} else {
					if (idx !== -1) this.publicSessions.splice(idx, 1, session);
					else this.publicSessions.push(session);
				}
			});

			this.socket.on("setSession", (sessionID) => {
				this.sessionID = sessionID;
				this.socket.io.opts.query.sessionID = sessionID;
				if (this.drafting) {
					// Expelled during drafting
					this.drafting = false;
					this.draftingState = DraftState.Brewing;
				}
			});

			this.socket.on("sessionUsers", (users) => {
				for (let u of users) {
					if (!u.pickedThisRound) u.pickedThisRound = false;
					u.readyState = ReadyState.DontCare;
				}

				this.sessionUsers = users;
				this.userOrder = users.map((u) => u.userID);
			});

			this.socket.on("userDisconnected", (data) => {
				if (!this.drafting) return;
				this.sessionOwner = data.owner;
				this.disconnectedUsers = data.disconnectedUsers;
			});

			this.socket.on("resumeOnReconnection", (data) => {
				this.disconnectedUsers = {};
				fireToast("success", data.msg.title, data.msg.text);
			});

			this.socket.on("updateUser", (data) => {
				let user = this.userByID[data.userID];
				if (!user) {
					if (data.userID === this.sessionOwner && data.updatedProperties.userName)
						this.sessionOwnerUsername = data.updatedProperties.userName;
					return;
				}

				for (let prop in data.updatedProperties) {
					user[prop] = data.updatedProperties[prop];
				}
			});

			this.socket.on("sessionOptions", (sessionOptions) => {
				for (let prop in sessionOptions) this[prop] = sessionOptions[prop];
			});

			this.socket.on("sessionOwner", (ownerID, ownerUserName) => {
				this.sessionOwner = ownerID;
				if (ownerUserName) this.sessionOwnerUsername = ownerUserName;
			});
			this.socket.on("isPublic", (data) => {
				this.isPublic = data;
			});
			this.socket.on("ignoreCollections", (ignoreCollections) => {
				this.ignoreCollections = ignoreCollections;
			});
			this.socket.on("boostersPerPlayer", (data) => {
				this.boostersPerPlayer = parseInt(data);
			});
			this.socket.on("cardsPerBooster", (data) => {
				this.cardsPerBooster = parseInt(data);
			});
			this.socket.on("teamDraft", (data) => {
				this.teamDraft = data;
			});
			this.socket.on("bots", (data) => {
				this.bots = parseInt(data);
			});
			this.socket.on("setMaxPlayers", (maxPlayers) => {
				this.maxPlayers = parseInt(maxPlayers);
			});
			this.socket.on("setRestriction", (setRestriction) => {
				this.setRestriction = setRestriction;
			});
			this.socket.on("setPickTimer", (timer) => {
				this.maxTimer = timer;
			});

			this.socket.on("message", (data) => {
				if (data.icon === undefined) data.icon = "info";
				if (data.title === undefined) data.title = "[Missing Title]";
				if (data.text === undefined) data.text = "";
				if (data.html === undefined) data.html = null;
				if (data.imageUrl === undefined) data.imageUrl = null;

				if (data.showConfirmButton === undefined) data.showConfirmButton = true;
				else if (!data.showConfirmButton && data.timer === undefined) data.timer = 1500;

				if (data.allowOutsideClick === undefined) data.allowOutsideClick = true;

				Alert.fire({
					position: "center",
					icon: data.icon,
					title: data.title,
					text: data.text,
					html: data.html,
					imageUrl: data.imageUrl,
					imageHeight: 300,
					showConfirmButton: data.showConfirmButton,
					timer: data.timer,
					allowOutsideClick: data.allowOutsideClick,
				});
			});

			this.socket.on("readyCheck", () => {
				if (this.drafting) return;

				this.initReadyCheck();

				const ownerUsername =
					this.sessionOwner in this.userByID
						? this.userByID[this.sessionOwner].userName
						: this.sessionOwnerUsername
						? this.sessionOwnerUsername
						: "Session owner";

				this.pushNotification("Are you ready?", {
					body: `${ownerUsername} has initiated a ready check`,
				});

				Alert.fire({
					position: "center",
					icon: "question",
					title: "Are you ready?",
					text: `${ownerUsername} has initiated a ready check`,
					showCancelButton: true,
					confirmButtonColor: ButtonColor.Safe,
					cancelButtonColor: ButtonColor.Critical,
					confirmButtonText: "I'm ready!",
					cancelButtonText: "Not Ready",
					allowOutsideClick: false,
				}).then((result) => {
					this.socket.emit("setReady", result.value ? ReadyState.Ready : ReadyState.NotReady);
				});
			});

			this.socket.on("setReady", (userID, readyState) => {
				if (!this.pendingReadyCheck) return;
				if (userID in this.userByID) this.userByID[userID].readyState = readyState;
				if (this.sessionUsers.every((u) => u.readyState === ReadyState.Ready)) {
					fireToast("success", "Everybody is ready!");
					this.pushTitleNotification("✔️");
				}
			});

			// Winston Draft
			this.socket.on("startWinstonDraft", (state) => {
				startDraftSetup("Winston draft");
				this.setWinstonDraftState(state);
			});
			this.socket.on("winstonDraftSync", (winstonDraftState) => {
				this.setWinstonDraftState(winstonDraftState);
			});
			this.socket.on("winstonDraftNextRound", (currentPlayer) => {
				if (this.userID === currentPlayer) {
					this.playSound("next");
					fireToast("success", "Your turn!");
					this.pushNotification("Your turn!", {
						body: `This is your turn to pick.`,
					});
					this.draftingState = DraftState.WinstonPicking;
				} else {
					this.draftingState = DraftState.WinstonWaiting;
				}
			});
			this.socket.on("winstonDraftEnd", () => {
				this.drafting = false;
				this.winstonDraftState = null;
				this.draftingState = DraftState.Brewing;
				fireToast("success", "Done drafting!");
			});
			this.socket.on("winstonDraftRandomCard", (c) => {
				this.addToDeck(c);
				// Instantiate a card component to display in Swal (yep, I know.)
				const ComponentClass = Vue.extend(Card);
				const cardView = new ComponentClass({ parent: this, propsData: { card: c } });
				cardView.$mount();
				Alert.fire({
					position: "center",
					title: `You drew ${
						this.language in c.printed_names ? c.printed_names[this.language] : c.name
					} from the card pool!`,
					html: cardView.$el,
					showConfirmButton: true,
				});
			});

			this.socket.on("rejoinWinstonDraft", (data) => {
				this.drafting = true;

				this.setWinstonDraftState(data.state);
				this.clearState();
				this.$refs.deckDisplay.sync();
				this.$refs.sideboardDisplay.sync();
				this.$nextTick(() => {
					for (let c of data.pickedCards) this.addToDeck(c);

					if (this.userID === data.state.currentPlayer) this.draftingState = DraftState.WinstonPicking;
					else this.draftingState = DraftState.WinstonWaiting;

					Alert.fire({
						position: "center",
						icon: "success",
						title: "Reconnected to the Winston draft!",
						showConfirmButton: false,
						timer: 1500,
					});
				});
			});

			// Grid Draft
			this.socket.on("startGridDraft", (state) => {
				startDraftSetup("Grid draft");
				this.draftingState =
					this.userID === state.currentPlayer ? DraftState.GridPicking : DraftState.GridWaiting;
				this.setGridDraftState(state);
			});
			this.socket.on("gridDraftSync", (gridDraftState) => {
				this.setGridDraftState(gridDraftState);
			});
			this.socket.on("gridDraftNextRound", (state) => {
				const doNextRound = () => {
					this.setGridDraftState(state);
					if (this.userID === state.currentPlayer) {
						this.playSound("next");
						fireToast("success", "Your turn!");
						this.pushNotification("Your turn!", {
							body: `This is your turn to pick.`,
						});
						this.draftingState = DraftState.GridPicking;
					} else {
						this.draftingState = DraftState.GridWaiting;
					}
				};

				// Next booster, add a slight delay so user can see the last pick.
				if (this.gridDraftState.currentPlayer === null) {
					setTimeout(doNextRound, 2500);
				} else doNextRound();
			});
			this.socket.on("gridDraftEnd", () => {
				// Adds a slight deplay while the last pick is displayed.
				setTimeout(
					() => {
						this.drafting = false;
						this.gridDraftState = null;
						this.draftingState = DraftState.Brewing;
						fireToast("success", "Done drafting!");
					},
					this.gridDraftState.currentPlayer === null ? 2500 : 0
				);
			});

			this.socket.on("rejoinGridDraft", (data) => {
				this.drafting = true;

				this.setGridDraftState(data.state);
				this.clearState();
				this.$refs.deckDisplay.sync();
				this.$refs.sideboardDisplay.sync();
				this.$nextTick(() => {
					for (let c of data.pickedCards) this.addToDeck(c);

					if (this.userID === data.state.currentPlayer) this.draftingState = DraftState.GridPicking;
					else this.draftingState = DraftState.GridWaiting;

					Alert.fire({
						position: "center",
						icon: "success",
						title: "Reconnected to the Grid draft!",
						showConfirmButton: false,
						timer: 1500,
					});
				});
			});

			// Rochester Draft
			this.socket.on("startRochesterDraft", (state) => {
				startDraftSetup("Rochester draft");
				this.draftingState =
					this.userID === state.currentPlayer ? DraftState.RochesterPicking : DraftState.RochesterWaiting;
				this.setRochesterDraftState(state);
			});
			this.socket.on("rochesterDraftSync", (state) => {
				this.setRochesterDraftState(state);
			});
			this.socket.on("rochesterDraftNextRound", (state) => {
				this.setRochesterDraftState(state);
				if (this.userID === state.currentPlayer) {
					this.playSound("next");
					fireToast("success", "Your turn!");
					this.pushNotification("Your turn!", {
						body: `This is your turn to pick.`,
					});
					this.draftingState = DraftState.RochesterPicking;
					this.selectedCards = [];
				} else {
					this.draftingState = DraftState.RochesterWaiting;
				}
			});
			this.socket.on("rochesterDraftEnd", () => {
				this.drafting = false;
				this.rochesterDraftState = null;
				this.draftingState = DraftState.Brewing;
				fireToast("success", "Done drafting!");
			});

			this.socket.on("rejoinRochesterDraft", (data) => {
				this.drafting = true;

				this.setRochesterDraftState(data.state);
				this.clearState();
				this.$refs.deckDisplay.sync();
				this.$refs.sideboardDisplay.sync();
				this.$nextTick(() => {
					for (let c of data.pickedCards) this.addToDeck(c);

					if (this.userID === data.state.currentPlayer) this.draftingState = DraftState.RochesterPicking;
					else this.draftingState = DraftState.RochesterWaiting;

					Alert.fire({
						position: "center",
						icon: "success",
						title: "Reconnected to the Rochester draft!",
						showConfirmButton: false,
						timer: 1500,
					});
				});
			});

			// Minesweeper Draft
			this.socket.on("startMinesweeperDraft", (state) => {
				startDraftSetup("Minesweeper draft");
				this.draftingState =
					this.userID === state.currentPlayer ? DraftState.MinesweeperPicking : DraftState.MinesweeperWaiting;
				this.setMinesweeperDraftState(state);
			});
			this.socket.on("minesweeperDraftState", (state) => {
				this.setMinesweeperDraftState(state);
			});
			this.socket.on("minesweeperDraftEnd", (options) => {
				// Delay to allow the last pick to be displayed.
				setTimeout(
					() => {
						this.drafting = false;
						this.minesweeperDraftState = null;
						this.draftingState = DraftState.Brewing;
						fireToast("success", "Done drafting!");
					},
					options?.immediate ? 0 : 1000
				);
			});
			this.socket.on("rejoinMinesweeperDraft", (data) => {
				this.drafting = true;

				this.setMinesweeperDraftState(data.state);
				this.clearState();
				this.$refs.deckDisplay.sync();
				this.$refs.sideboardDisplay.sync();
				this.$nextTick(() => {
					for (let c of data.pickedCards) this.addToDeck(c);

					if (this.userID === data.state.currentPlayer) this.draftingState = DraftState.MinesweeperPicking;
					else this.draftingState = DraftState.MinesweeperWaiting;

					Alert.fire({
						position: "center",
						icon: "success",
						title: "Reconnected to the Minesweeper draft!",
						showConfirmButton: false,
						timer: 1500,
					});
				});
			});

			const startDraftSetup = (name = "draft") => {
				// Save user ID in case of disconnect
				setCookie("userID", this.userID);

				this.drafting = true;
				this.stopReadyCheck();
				this.clearState();
				Alert.fire({
					position: "center",
					icon: "success",
					title: "Now drafting!",
					showConfirmButton: false,
					timer: 1500,
				});

				this.playSound("start");

				this.pushNotification("Now drafting!", {
					body: `Your ${name} '${this.sessionID}' is starting!`,
				});
				this.pushTitleNotification("🏁");
			};

			// Standard Draft
			this.socket.on("startDraft", () => {
				startDraftSetup();

				// Are we just an Organizer, and not a player?
				if (!this.virtualPlayers.map((u) => u.userID).includes(this.userID)) {
					this.draftingState = DraftState.Watching;
				}
			});

			this.socket.on("rejoinDraft", (data) => {
				this.drafting = true;

				this.clearState();
				// Avoid duplicate keys by clearing card pools (e.g. on server restart)
				if (typeof this.$refs.deckDisplay !== "undefined") this.$refs.deckDisplay.sync();
				if (typeof this.$refs.sideboardDisplay !== "undefined") this.$refs.sideboardDisplay.sync();
				// Let vue react to changes to card pools
				this.$nextTick(() => {
					for (let c of data.pickedCards) this.addToDeck(c);

					this.booster = [];
					for (let c of data.booster) this.booster.push(c);
					this.boosterNumber = data.boosterNumber;
					this.pickNumber = data.pickNumber;
					this.botScores = data.botScores;

					this.pickedThisRound = data.pickedThisRound;
					if (this.pickedThisRound) this.draftingState = DraftState.Waiting;
					else this.draftingState = DraftState.Picking;
					this.selectedCards = [];
					this.burningCards = [];

					Alert.fire({
						position: "center",
						icon: "success",
						title: "Reconnected to the draft!",
						showConfirmButton: false,
						timer: 1500,
					});
				});
			});

			this.socket.on("nextBooster", (data) => {
				this.booster = [];
				for (let u of this.sessionUsers) {
					u.pickedThisRound = false;
				}
				this.boosterNumber = data.boosterNumber;
				this.pickNumber = data.pickNumber;
				this.botScores = data.botScores; // Get or Clear bot scores

				// Only watching, not playing/receiving a boost ourself.
				if (this.draftingState == DraftState.Watching) return;

				for (let c of data.booster) {
					this.booster.push(c);
				}
				this.playSound("next");
				this.draftingState = DraftState.Picking;
				this.selectedCards = [];
				this.burningCards = [];
			});

			this.socket.on("botRecommandations", (data) => {
				if (data.pickNumber === this.pickNumber) this.botScores = data.scores;
			});

			this.socket.on("endDraft", () => {
				Alert.fire({
					position: "center",
					icon: "success",
					title: "Done drafting!",
					showConfirmButton: false,
					timer: 1500,
				});
				this.drafting = false;
				this.draftPaused = false;
				if (this.draftingState === DraftState.Watching) {
					this.draftingState = undefined;
				} else {
					// User was playing
					this.draftingState = DraftState.Brewing;
				}
			});

			this.socket.on("pauseDraft", () => {
				this.draftPaused = true;
			});

			this.socket.on("resumeDraft", () => {
				this.draftPaused = false;
				fireToast("success", "Draft Resumed");
			});

			this.socket.on("draftLog", (draftLog) => {
				// Updates draft log if already present, or adds it to the list
				const idx = this.draftLogs.findIndex(
					(l) => l.sessionID === draftLog.sessionID && l.time === draftLog.time
				);
				if (idx >= 0) {
					if (this.currentDraftLog === this.draftLogs[idx]) this.currentDraftLog = draftLog;
					this.draftLogs.splice(idx, 1, draftLog);
				} else {
					// Received a new draft log, consider it as the current one
					this.currentDraftLog = draftLog;
					this.draftLogs.push(draftLog);
				}
				this.storeDraftLogs();
			});

			this.socket.on("shareDecklist", (data) => {
				const idx = this.draftLogs.findIndex((l) => l.sessionID === data.sessionID && l.time === data.time);
				if (idx && data.userID in this.draftLogs[idx].users) {
					this.draftLogs[idx].users[data.userID].decklist = data.decklist;
					this.storeDraftLogs();
				}
			});

			this.socket.on("draftLogLive", (data) => {
				if (data.log) this.draftLogLive = data.log;
				if (data.pick) {
					this.draftLogLive.users[data.userID].picks.push(data.pick);
					if (this.$refs.draftloglive) this.$refs.draftloglive.newPick(data);
				}
			});

			this.socket.on("pickAlert", (data) => {
				fireToast(
					"info",
					`${data.userName} picked ${data.cards
						.map((s) => (s.printed_names[this.language] ? s.printed_names[this.language] : s.name))
						.join(", ")}!`
				);
			});

			this.socket.on("selectJumpstartPacks", this.selectJumpstartPacks);

			this.socket.on("setCardSelection", (data) => {
				if (!data) return;
				const cards = data.reduce((acc, val) => acc.concat(val), []); // Flatten if necessary
				if (cards.length === 0) return;
				this.clearState();
				// Avoid duplicate keys by clearing card pools (e.g. on server restart)
				if (typeof this.$refs.deckDisplay !== "undefined") this.$refs.deckDisplay.sync();
				if (typeof this.$refs.sideboardDisplay !== "undefined") this.$refs.sideboardDisplay.sync();
				// Let vue react to changes to card pools
				this.$nextTick(() => {
					for (let c of cards) this.addToDeck(c);
					this.draftingState = DraftState.Brewing;
					// Hide waiting popup for sealed
					if (Swal.isVisible()) Swal.close();
					this.pushNotification("Cards received!");
				});
			});

			this.socket.on("timer", (data) => {
				if (data.countdown == 0) this.forcePick(this.booster);
				if (data.countdown < 10) {
					let chrono = document.getElementById("chrono");
					if (chrono) {
						chrono.classList.add("pulsing");
						setTimeout(() => {
							let chrono = document.getElementById("chrono");
							if (chrono) chrono.classList.remove("pulsing");
						}, 500);
					}
				}
				if (data.countdown > 0 && data.countdown <= 5) this.playSound("countdown");
				this.pickTimer = data.countdown;
			});

			this.socket.on("disableTimer", () => {
				this.pickTimer = -1;
			});
		},
		clearState() {
			this.disconnectedUsers = {};
			this.clearSideboard();
			this.clearDeck();
			this.deckFilter = "";
			this.lands = { W: 0, U: 0, B: 0, R: 0, G: 0 };
			this.currentDraftLog = null;
			this.boosterNumber = 0;
			this.pickNumber = 0;
			this.botScores = null;
		},
		resetSessionSettings() {
			if (this.userID !== this.sessionOwner) return;

			this.ownerIsPlayer = true;
			this.isPublic = false;
			this.description = "";
			this.ignoreCollections = true;
			this.boostersPerPlayer = 3;
			this.cardsPerBooster = 15;
			this.teamDraft = false;
			this.randomizeSeatingOrder = false;
			this.disableBotSuggestions = false;
			this.distributionMode = "regular";
			this.customBoosters = ["", "", ""];
			this.maxPlayers = 8;
			this.mythicPromotion = true;
			this.useBoosterContent = false;
			this.boosterContent = {
				common: 10,
				uncommon: 3,
				rare: 1,
			};
			this.usePredeterminedBoosters = false;
			this.colorBalance = true;
			this.maxDuplicates = null;
			this.foil = false;
			this.bots = 0;
			this.setRestriction = [];
			this.drafting = false;
			this.useCustomCardList = false;
			this.customCardList = {};
			this.pickedCardsPerRound = 1;
			this.burnedCardsPerRound = 0;
			this.discardRemainingCardsAt = 0;
			this.maxTimer = 75;
			this.pickTimer = 75;
			this.personalLogs = true;
			this.draftLogRecipients = "everyone";
			this.bracketLocked = false;

			fireToast("success", "Session settings reset to default values.");
		},
		playSound(key) {
			if (this.enableSound) Sounds[key].play();
		},
		// Chat Methods
		sendChatMessage() {
			if (!this.currentChatMessage || this.currentChatMessage == "") return;
			this.socket.emit("chatMessage", {
				author: this.userID,
				timestamp: Date.now(),
				text: this.currentChatMessage,
			});
			this.currentChatMessage = "";
		},
		// Draft Methods
		async startDraft() {
			if (this.userID != this.sessionOwner) return false;
			if (!this.teamDraft && this.sessionUsers.length + this.bots < 2) {
				let ret = await Alert.fire({
					icon: "info",
					title: "Not enough players",
					text: `At least 2 players (including bots) are needed to start a draft.`,
					showDenyButton: true,
					denyButtonColor: "darkgreen",
					denyButtonText: "Draft alone with bots",
					confirmButtonText: "Dismiss",
				});
				if (ret.isDenied) {
					this.bots = 7;
					await this.$nextTick();
				} else return false;
			}

			if (this.deck.length > 0) {
				Alert.fire({
					title: "Are you sure?",
					text: "Launching a new draft will reset everyones cards/deck!",
					icon: "warning",
					showCancelButton: true,
					confirmButtonColor: ButtonColor.Critical,
					cancelButtonColor: ButtonColor.Safe,
					confirmButtonText: "Launch draft!",
				}).then((result) => {
					if (result.value) {
						this.socket.emit("startDraft");
						return true;
					}
				});
			} else {
				this.socket.emit("startDraft");
				return true;
			}
			return false;
		},
		stopDraft() {
			if (this.userID != this.sessionOwner) return;
			const self = this;
			Alert.fire({
				title: "Are you sure?",
				text: "Do you really want to stop the draft for all players?",
				icon: "warning",
				showCancelButton: true,
				confirmButtonColor: ButtonColor.Critical,
				cancelButtonColor: ButtonColor.Safe,
				confirmButtonText: "Stop the draft!",
			}).then((result) => {
				if (result.value) {
					self.socket.emit("stopDraft");
				}
			});
		},
		pauseDraft() {
			if (this.userID != this.sessionOwner) return;
			this.socket.emit("pauseDraft");
		},
		selectCard(e, c) {
			if (!this.selectedCards.includes(c)) {
				if (this.selectedCards.length === this.cardsToPick) this.selectedCards.shift();
				this.selectedCards.push(c);
				this.restoreCard(null, c);
			}
		},
		burnCard(e, c) {
			if (this.burningCards.includes(c)) return;
			if (this.selectedCards.includes(c)) this.selectedCards.splice(this.selectedCards.indexOf(c), 1);
			this.burningCards.push(c);
			if (this.burningCards.length > this.burnedCardsPerRound) this.burningCards.shift();
			if (e) e.stopPropagation();
		},
		restoreCard(e, c) {
			if (!this.burningCards.includes(c)) return;
			this.burningCards.splice(
				this.burningCards.findIndex((o) => o === c),
				1
			);
			if (e) e.stopPropagation();
		},
		doubleClickCard(e, c) {
			this.selectCard(null, c);
			if (this.pickOnDblclick) this.pickCard();
		},
		allowBoosterCardDrop(e) {
			// Allow dropping only if the dragged object is the selected card

			// A better (?) solution would be something like
			// 		let cardid = e.dataTransfer.getData("text");
			// 		if (this.selectedCards && cardid == this.selectedCards.id)
			// {
			// but only Firefox allows to check for dataTransfer in this event (and
			// it's against the standard)

			if (e.dataTransfer.types.includes("isboostercard")) {
				e.preventDefault();
				e.dataTransfer.dropEffect = "move";
				return false;
			}
		},
		dragBoosterCard(e, card) {
			e.dataTransfer.setData("isboostercard", "true"); // Workaround: See allowBoosterCardDrop
			e.dataTransfer.setData("text", card.id);
			e.dataTransfer.effectAllowed = "move";
			this.selectCard(null, card);
		},
		dropBoosterCard(e, options) {
			// Filter other events; Disable when we're not picking (probably useless buuuuut...)
			if (
				e.dataTransfer.getData("isboostercard") !== "true" ||
				(this.draftingState != DraftState.Picking && this.draftingState != DraftState.RochesterPicking)
			)
				return;
			e.preventDefault();
			let cardid = e.dataTransfer.getData("text");
			if (this.selectedCards.length === 0) {
				console.error(`dropBoosterCard error: this.selectedCards === ${this.selectedCards}`);
				return;
			}
			if (!this.selectedCards.some((c) => cardid === c.id)) {
				console.error(
					`dropBoosterCard error: cardid (${cardid}) != this.selectedCards.id (${this.selectedCards.id})`
				);
				return;
			} else {
				if (!options) options = {};
				options.event = e;
				this.pickCard(options);
			}
		},
		pickCard(options) {
			if (
				this.pickInFlight || // We already send a pick request and are waiting for an anwser
				(this.draftingState != DraftState.Picking && this.draftingState != DraftState.RochesterPicking)
			)
				return;

			if (this.selectedCards.length !== this.cardsToPick) {
				const value = this.cardsToPick - this.selectedCards.length;
				fireToast("error", `You need to pick ${value} more ${value > 1 ? "cards" : "card"}.`);
				return;
			}

			if (this.burningCards.length !== this.cardsToBurnThisRound) {
				const value = this.cardsToBurnThisRound - this.burningCards.length;
				fireToast("error", `You need to burn ${value} more ${value > 1 ? "cards" : "card"}.`);
				return;
			}

			if (this.socket.disconnected) {
				this.disconnectedReminder();
				return;
			}
			// Give Vue one frame to react to state changes before triggering the
			// transitions.
			this.$nextTick(() => {
				if (this.rochesterDraftState) {
					this.socket.emit(
						"rochesterDraftPick",
						this.selectedCards.map((c) => this.rochesterDraftState.booster.findIndex((c2) => c === c2)),
						(answer) => {
							this.pickInFlight = false;
							if (answer.code !== 0) alert(`pickCard: Unexpected answer: ${answer.error}`);
						}
					);
					this.draftingState = DraftState.RochesterWaiting;
				} else {
					this.socket.emit(
						"pickCard",
						{
							pickedCards: this.selectedCards.map((c) => this.booster.findIndex((c2) => c === c2)),
							burnedCards: this.burningCards.map((c) => this.booster.findIndex((c2) => c === c2)),
						},
						(answer) => {
							this.pickInFlight = false;
							if (answer.code !== 0) alert(`pickCard: Unexpected answer: ${answer.error}`);
						}
					);
					this.draftingState = DraftState.Waiting;
				}
				if (options && options.toSideboard) this.addToSideboard(this.selectedCards, options);
				else this.addToDeck(this.selectedCards, options);
				// Removes picked & burned cards for animation
				this.booster = this.booster.filter(
					(c) => !this.selectedCards.includes(c) && !this.burningCards.includes(c)
				);
			});
			this.pickInFlight = true;
		},
		forcePick() {
			if (this.draftingState != DraftState.Picking) return;

			// Uses botScores to automatically select picks if available
			if (this.botScores) {
				let orderedPicks = [];
				for (let i = 0; i < this.botScores.scores.length; ++i) orderedPicks.push(i);
				orderedPicks.sort((lhs, rhs) => {
					return this.botScores.scores[lhs] < this.botScores.scores[rhs];
				});
				let currIdx = 0;
				while (currIdx < orderedPicks.length && this.selectedCards.length < this.cardsToPick) {
					while (
						currIdx < orderedPicks.length &&
						(this.selectedCards.includes(this.booster[orderedPicks[currIdx]]) ||
							this.burningCards.includes(this.booster[orderedPicks[currIdx]]))
					)
						++currIdx;
					if (currIdx < orderedPicks.length) this.selectedCards.push(this.booster[orderedPicks[currIdx]]);
					++currIdx;
				}
				currIdx = 0;
				orderedPicks.reverse();
				while (currIdx < orderedPicks.length && this.burningCards.length < this.cardsToBurnThisRound) {
					while (
						currIdx < orderedPicks.length &&
						(this.selectedCards.includes(this.booster[orderedPicks[currIdx]]) ||
							this.burningCards.includes(this.booster[orderedPicks[currIdx]]))
					)
						++currIdx;
					if (currIdx < orderedPicks.length) this.burningCards.push(this.booster[orderedPicks[currIdx]]);
					++currIdx;
				}
			}

			// Forces a random card if there isn't enough selected already
			while (this.selectedCards.length < this.cardsToPick) {
				let randomIdx;
				do randomIdx = Math.floor(Math.random() * this.booster.length);
				while (
					this.selectedCards.includes(this.booster[randomIdx]) ||
					this.burningCards.includes(this.booster[randomIdx])
				);
				this.selectedCards.push(this.booster[randomIdx]);
			}
			// Forces random cards to burn if there isn't enough selected already
			while (this.burningCards.length < this.cardsToBurnThisRound) {
				let randomIdx;
				do randomIdx = Math.floor(Math.random() * this.booster.length);
				while (
					this.selectedCards.includes(this.booster[randomIdx]) ||
					this.burningCards.includes(this.booster[randomIdx])
				);
				this.burningCards.push(this.booster[randomIdx]);
			}
			this.pickCard();
		},
		setWinstonDraftState(state) {
			this.winstonDraftState = state;
			const piles = [];
			for (let p of state.piles) {
				let pile = [];
				for (let c of p) pile.push(c);
				piles.push(pile);
			}
			this.winstonDraftState.piles = piles;
		},
		startWinstonDraft: async function () {
			if (this.userID != this.sessionOwner || this.drafting) return;

			if (!this.ownerIsPlayer) {
				Alert.fire({
					icon: "error",
					title: "Owner has to play",
					text: "Non-playing owner is not supported in Winston Draft for now. The 'Session owner is playing' option needs to be active.",
				});
				return;
			}

			let { value: boosterCount } = await Alert.fire({
				title: "Winston Draft",
				html: `<p>Winston Draft is a draft variant for two players. <a href="https://mtg.gamepedia.com/Winston_Draft" target="_blank" rel="noopener nofollow">More information here</a>.</p>How many boosters for the main stack (default is 6)?`,
				inputPlaceholder: "Booster count",
				input: "number",
				inputAttributes: {
					min: 6,
					max: 12,
					step: 1,
				},
				inputValue: 6,
				showCancelButton: true,
				confirmButtonColor: ButtonColor.Safe,
				cancelButtonColor: ButtonColor.Critical,
				confirmButtonText: "Start Winston Draft",
			});

			if (boosterCount) {
				if (typeof boosterCount !== "number") boosterCount = parseInt(boosterCount);
				this.socket.emit("startWinstonDraft", boosterCount);
			}
		},
		winstonDraftTakePile() {
			const cards = this.winstonDraftState.piles[this.winstonDraftState.currentPile];
			this.socket.emit("winstonDraftTakePile", (answer) => {
				if (answer.code === 0) {
					for (let c of cards) this.addToDeck(c);
				} else {
					console.error(answer);
				}
			});
		},
		winstonDraftSkipPile() {
			this.socket.emit("winstonDraftSkipPile", (answer) => {
				if (answer.code !== 0) {
					console.error(answer);
				}
			});
		},
		setGridDraftState(state) {
			const prevBooster = this.gridDraftState ? this.gridDraftState.booster : null;
			this.gridDraftState = state;
			const booster = [];
			let idx = 0;
			for (let card of this.gridDraftState.booster) {
				if (card) {
					if (prevBooster && prevBooster[idx] && prevBooster[idx].id === card.id)
						booster.push(prevBooster[idx]);
					else booster.push(card);
				} else booster.push(null);
				++idx;
			}
			this.gridDraftState.booster = booster;
		},
		startGridDraft: async function () {
			if (this.userID != this.sessionOwner || this.drafting) return;

			if (!this.ownerIsPlayer) {
				Alert.fire({
					icon: "error",
					title: "Owner has to play",
					text: "Non-playing owner is not supported in Grid Draft for now. The 'Session owner is playing' option needs to be active.",
				});
				return;
			}

			let { value: boosterCount } = await Alert.fire({
				title: "Grid Draft",
				html: `<p>Grid Draft is a draft variant for two players mostly used for drafting cubes. 9-cards boosters are presented one by one in a 3x3 grid and players alternatively chooses a row or a column of each booster, resulting in 2 or 3 cards being picked from each booster. The remaining cards are discarded.</p>How many boosters (default is 18)?`,
				inputPlaceholder: "Booster count",
				input: "number",
				inputAttributes: {
					min: 6,
					max: 32,
					step: 1,
				},
				inputValue: 18,
				showCancelButton: true,
				confirmButtonColor: ButtonColor.Safe,
				cancelButtonColor: ButtonColor.Critical,
				confirmButtonText: "Start Grid Draft",
			});

			if (boosterCount) {
				if (typeof boosterCount !== "number") boosterCount = parseInt(boosterCount);
				this.socket.emit("startGridDraft", parseInt(boosterCount));
			}
		},
		gridDraftPick(choice) {
			const cards = [];
			let pickedCards = 0;
			for (let i = 0; i < 3; ++i) {
				//                     Column           Row
				let idx = choice < 3 ? 3 * i + choice : 3 * (choice - 3) + i;
				if (this.gridDraftState.booster[idx]) {
					cards.push(this.gridDraftState.booster[idx]);
					++pickedCards;
				}
			}
			if (pickedCards === 0) {
				console.error("gridDraftPick: Should not reach that.");
				return;
			} else {
				this.socket.emit("gridDraftPick", choice, (answer) => {
					if (answer.code === 0) {
						for (let c of cards) this.addToDeck(c);
					} else alert("Error: ", answer.error);
				});
			}
		},
		setRochesterDraftState(state) {
			this.rochesterDraftState = state;
		},
		startRochesterDraft: async function () {
			if (this.userID != this.sessionOwner || this.drafting) return;

			if (!this.ownerIsPlayer) {
				Alert.fire({
					icon: "error",
					title: "Owner has to play",
					text: "Non-playing owner is not supported in Rochester Draft for now. The 'Session owner is playing' option needs to be active.",
				});
				return;
			}
			this.socket.emit("startRochesterDraft");
		},
		setMinesweeperDraftState(state) {
			const currentGridNumber = this.minesweeperDraftState?.gridNumber;

			const execute = () => {
				this.minesweeperDraftState = state;
				if (this.userID === state.currentPlayer) {
					this.playSound("next");
					fireToast("info", "Your turn! Pick a card.");
					this.pushNotification("Your turn!", {
						body: `This is your turn to pick.`,
					});
				}
			};

			if (currentGridNumber !== undefined && currentGridNumber !== state.gridNumber) {
				// Delay the state update on grid change to allow the animation to finish
				setTimeout(execute, 1000);
			} else execute();
		}, // This is just a shortcut to set burnedCardsPerTurn and boostersPerPlayers to suitable values.
		startMinesweeperDraft: async function () {
			if (this.userID !== this.sessionOwner || this.drafting) return;

			let gridCount = 4;
			let gridWidth = 9;
			let gridHeight = 10;
			let picksPerPlayerPerGrid = 9;
			let revealBorders = true;

			const savedValues = localStorage.getItem("mtgadraft-minesweeper");
			if (savedValues) {
				try {
					const values = JSON.parse(savedValues);
					gridCount = values.gridCount;
					gridWidth = values.gridWidth;
					gridHeight = values.gridHeight;
					picksPerPlayerPerGrid = values.picksPerPlayerPerGrid;
					revealBorders = values.revealBorders;
				} catch (err) {
					console.error("Error parsing saved values for Minesweeper Draft: ", err);
				}
			}

			Alert.fire({
				title: "Minesweeper Draft",
				html: `
					<p>Minesweeper Draft is a draft variant where players alternatively pick cards from a partially revealed card grid, discovering neighboring cards after each pick.</p>
					<div style="display: table; border-spacing: 0.5em; margin: auto;">
						<div style="display: table-row">
							<div style="display: table-cell; text-align: right;">Grid Count:</div>
							<div style="display: table-cell; text-align: left;"><input type="number" value="${gridCount}" min="1" max="99" step="1" id="input-gridCount" class="swal2-input" placeholder="Grid Count" style="max-width: 4em; margin: 0 auto;"></div>
						</div> 
						<div style="display: table-row">
							<div style="display: table-cell; text-align: right;">Grid Size:</div> 
							<div style="display: table-cell; text-align: left;"><input type="number" value="${gridWidth}" min="1" max="40" step="1" id="input-gridWidth" class="swal2-input" placeholder="Grid Width" style="max-width: 4em; margin: 0 auto;"> x <input type="number" value="${gridHeight}" min="1" max="40" step="1" id="input-gridHeight" class="swal2-input" placeholder="Grid Height" style="max-width: 4em; margin: 0 auto;"></div> 
						</div> 
						<div style="display: table-row">
							<div style="display: table-cell; text-align: right;">Picks per Player, per Grid:</div> 
							<div style="display: table-cell; text-align: left;"><input type="number" value="${picksPerPlayerPerGrid}" min="1" max="40*40" step="1" id="input-picksPerPlayerPerGrid" class="swal2-input" placeholder="Picks per Player, per Grid" style="max-width: 4em; margin: 0 auto;"></div> 
						</div> 
						<div style="display: table-row">
							<div style="display: table-cell; text-align: right;">Reveal borders:</div>
							<div style="display: table-cell; text-align: left;"><input type="checkbox" ${
								revealBorders ? "checked" : ""
							} id="input-revealBorders" placeholder="Reveal Borders"></div>
						</div>
					</div>
				`,
				showCancelButton: true,
				confirmButtonColor: ButtonColor.Safe,
				cancelButtonColor: ButtonColor.Critical,
				confirmButtonText: "Start Minesweeper Draft",
				width: "40vw",
				preConfirm() {
					return new Promise(function (resolve) {
						resolve({
							gridCount: document.getElementById("input-gridCount").valueAsNumber,
							gridWidth: document.getElementById("input-gridWidth").valueAsNumber,
							gridHeight: document.getElementById("input-gridHeight").valueAsNumber,
							picksPerPlayerPerGrid: document.getElementById("input-picksPerPlayerPerGrid").valueAsNumber,
							revealBorders: document.getElementById("input-revealBorders").checked,
						});
					});
				},
			}).then((r) => {
				if (r.isConfirmed) {
					localStorage.setItem("mtgadraft-minesweeper", JSON.stringify(r.value));
					this.socket.emit(
						"startMinesweeperDraft",
						r.value.gridCount,
						r.value.gridWidth,
						r.value.gridHeight,
						this.sessionUsers.length * r.value.picksPerPlayerPerGrid,
						r.value.revealBorders,
						(response) => {
							if (response?.error) {
								Alert.fire(response.error);
							}
						}
					);
				}
			});
		},
		minesweeperDraftPick(row, col) {
			const card = this.minesweeperDraftState.grid[row][col].card;
			this.socket.emit("minesweeperDraftPick", row, col, (response) => {
				if (response?.error) {
					Alert.fire(response.error);
				} else {
					this.addToDeck(card);
				}
			});
		},
		// This is just a shortcut to set burnedCardsPerTurn and boostersPerPlayers to suitable values.
		startGlimpseDraft: async function () {
			if (this.userID !== this.sessionOwner || this.drafting) return;

			let boostersPerPlayer = 9;
			if (this.boostersPerPlayer !== 3) boostersPerPlayer = this.boostersPerPlayer;
			let burnedCardsPerRound = 2;
			if (this.burnedCardsPerRound > 0) burnedCardsPerRound = this.burnedCardsPerRound;

			Alert.fire({
				title: "Glimpse Draft",
				html: `
					<p>Glimpse Draft (or Burn Draft) is a draft variant where players remove cards from the draft (typically 2) alongside each pick. It's mostly used for small and medium sized groups where a regular draft makes not much sense.</p>
					<p>How many boosters per player (default is 9)?
					<input type="number" value="${boostersPerPlayer}" min="3" step="1" id="input-boostersPerPlayer" class="swal2-input" placeholder="Boosters per Player"></p>
					<p>How many burned cards per pick (default is 2)?
					<input type="number" value="${burnedCardsPerRound}" min="1" max="13" step="1" id="input-burnedCardsPerRound" class="swal2-input" placeholder="Burned Cards"></p>`,
				inputValue: 6,
				showCancelButton: true,
				confirmButtonColor: ButtonColor.Safe,
				cancelButtonColor: ButtonColor.Critical,
				confirmButtonText: "Start Glimpse Draft",
				preConfirm() {
					return new Promise(function (resolve) {
						resolve({
							boostersPerPlayer: document.getElementById("input-boostersPerPlayer").valueAsNumber,
							burnedCardsPerRound: document.getElementById("input-burnedCardsPerRound").valueAsNumber,
						});
					});
				},
			}).then((r) => {
				if (r.isConfirmed) {
					const prev = [this.boostersPerPlayer, this.burnedCardsPerRound];
					this.boostersPerPlayer = r.value.boostersPerPlayer;
					this.burnedCardsPerRound = r.value.burnedCardsPerRound;
					// Wait to make sure reactive values are correctly propagated to the server
					this.$nextTick(() => {
						// Draft didn't start, restore previous values.
						if (!this.startDraft()) {
							[this.boostersPerPlayer, this.burnedCardsPerRound] = prev;
						}
					});
				}
			});
		},
		// Collection management
		setCollection(json) {
			if (this.collection == json) return;
			this.collection = Object.freeze(json);
			this.socket.emit("setCollection", this.collection);
		},
		uploadMTGALogs() {
			// Disabled for now as logs are broken since  the 26/08/2021 MTGA update
			//document.querySelector("#mtga-logs-file-input").click();
			Alert.fire({
				icon: "warning",
				title: "Logs import is disabled",
				html: `With the Jumpstart: Historic Horizons update, Wizards removed player collection from MTGA player logs which was our only non-intrusive way to get them. Collection import is thus disabled until the situation is resolved.
				<br />
				You can vote for <a href="https://feedback.wizards.com/forums/918667-mtg-arena-bugs-product-suggestions/suggestions/44050746-broken-logs-in-2021-8-0-3855" target="_blank" rel="noopener nofollow"> this issue on Wizards' bug tracker <i class="fas fa-external-link-alt"></i></a> to draw to their attention to the problem.
				<hr />
				<h2 class="swal2-title custom-swal-title">Other Imports</h2>
				As a workaround, you can use a 
				<ul style="text-align: left">
				<li>.txt card list in the MTGA format</li>
				<li>.csv file following the <a href="https://www.mtggoldfish.com/help/import_formats#mtggoldfish" target="_blank">MTGGoldFish CSV format</a> (<a href="https://mtgarena.pro/mtga-pro-tracker/" target="_blank">MTGA Pro Tracker</a> exports to it)</li>
				</ul>`,
				showCancelButton: true,
				confirmButtonText: "Upload a .txt or .csv list",
			}).then((r) => {
				if (r.value) {
					document.querySelector("#collection-file-input").click();
				}
			});
		},
		// Workaround for collection import: Collections are not available in logs anymore, accept standard card lists as collections.
		uploadCardListAsCollection(e) {
			const file = e.target.files[0];
			if (!file) return;
			const reader = new FileReader();
			reader.onload = async (e) => {
				let contents = e.target.result;

				// Convert MTGGoldFish CSV format (https://www.mtggoldfish.com/help/import_formats#mtggoldfish) to our format
				if (file.name.endsWith(".csv")) {
					const lines = parseCSV(contents);
					const cardIndex = lines[0].indexOf("Card");
					const setIDIndex = lines[0].indexOf("Set ID");
					const quantityIndex = lines[0].indexOf("Quantity");
					// Check header
					if (cardIndex < 0 || setIDIndex < 0 || quantityIndex < 0) {
						Alert.fire({
							icon: "error",
							title: "Invalid file",
							text: `The uploaded file is not a valid MTGGoldFish CSV file (Invalid header).`,
							footer: `Expected 'Card', 'Set ID' and 'Quantity', got '${lines[0]}'.`,
							showCancelButton: false,
						});
						return;
					}
					contents = "";
					const setWorkaroundRegex = /^Y\d\d-/;
					for (let i = 1; i < lines.length; i++) {
						const line = lines[i];
						if (line.length === 0) continue;
						if (line.length < Math.max(quantityIndex, cardIndex, setIDIndex)) {
							Alert.fire({
								icon: "error",
								title: "Invalid file",
								text: `Error on line ${i} ('${line}'): missing field(s).`,
								showCancelButton: false,
							});
							return;
						}
						if (["Plains", "Island", "Swamp", "Mountain", "Forest"].includes(line[cardIndex])) continue;

						// Workaround for some divergent set codes.
						const setCodeTranslation = {
							ANA: "OANA",
						};
						if (line[setIDIndex] in setCodeTranslation)
							line[setIDIndex] = setCodeTranslation[line[setIDIndex]];
						// Generic solution for alchemy sets, hoping the trend will continue (Y-2X -> Y).
						if (setWorkaroundRegex.test(line[setIDIndex]))
							line[setIDIndex] = line[setIDIndex].replace(setWorkaroundRegex, "Y");

						contents += `${line[quantityIndex].trim()} ${line[cardIndex].trim()} (${line[
							setIDIndex
						].trim()})\n`;
					}
				}

				this.socket.emit("parseCollection", contents, (ret) => {
					if (ret.type === "error") {
						Alert.fire({ icon: "error", title: ret.title, text: ret.text });
						return;
					}
					this.setCollection(ret.collection); // Unnecessary round trip, consider removing if this ends up being the only way to update the collection
					this.collectionInfos = {
						wildcards: {
							common: 0,
							uncommon: 0,
							rare: 0,
							mythic: 0,
						},
						vaultProgress: 0,
					};
					localStorage.setItem("Collection", JSON.stringify(this.collection));
					localStorage.setItem("CollectionInfos", JSON.stringify(this.collectionInfos));
					localStorage.setItem("CollectionDate", new Date().toLocaleDateString());
					if (ret.type === "warning") Alert.fire({ icon: "warning", title: ret.title, text: ret.text });
					else
						fireToast(
							"success",
							`Collection successfully imported (${Object.values(ret.collection).reduce(
								(a, b) => a + b,
								0
							)} cards).`
						);
				});
			};
			reader.readAsText(file);
		},
		parseMTGALog(e) {
			const file = e.target.files[0];
			if (!file) return;
			const reader = new FileReader();
			reader.onload = async (e) => {
				let contents = e.target.result;

				// Propose to use MTGA user name
				// FIXME: The username doesn't seem to appear in the log anymore as of 29/08/2021
				let nameFromLogs = localStorage.getItem("nameFromLogs");
				if (!nameFromLogs) {
					let m = contents.match(/DisplayName:(.+)#(\d+)/);
					if (m) {
						let name = `${m[1]}#${m[2]}`;
						if (name != this.userName) {
							const swalResult = await Alert.fire({
								icon: "question",
								title: "User Name",
								text: `Found display name '${name}', do you want to use it as your User Name?`,
								showCancelButton: true,
								showConfirmButton: true,
								confirmButtonColor: ButtonColor.Safe,
								cancelButtonColor: ButtonColor.Critical,
								confirmButtonText: "Yes",
								cancelButtonText: "No",
							});
							if (swalResult.value) {
								this.userName = name;
								localStorage.setItem("nameFromLogs", "done");
							} else {
								localStorage.setItem("nameFromLogs", "refused");
							}
						}
					}
				}

				// Specific error message when detailed logs are disabled in MTGA (could also use /"DetailedLogs\\\\\\":(true|false)/ regex);
				if (
					contents.indexOf("DETAILED LOGS: DISABLED") !== -1 &&
					contents.indexOf("DETAILED LOGS: ENABLED") === -1
				) {
					Alert.fire({
						icon: "error",
						title: "Detailed logs disabled",
						text: "Looks like a valid Player.log file but Detailed Logs have to be manually enabled in MTGA. Enable it in Options > View Account > Detailed Logs (Plugin Support) and restart MTGA.",
					});
					return null;
				}

				let playerIds = new Set(Array.from(contents.matchAll(/"playerId":"([^"]+)"/g)).map((e) => e[1]));

				const parseCollection = function (contents, startIdx = null) {
					const rpcName = "PlayerInventory.GetPlayerCardsV3";
					try {
						const callIdx = startIdx
							? contents.lastIndexOf(rpcName, startIdx)
							: contents.lastIndexOf(rpcName);
						const collectionStart = contents.indexOf("{", callIdx);
						const collectionEnd = contents.indexOf("}}", collectionStart) + 2;
						const collectionStr = contents.slice(collectionStart, collectionEnd);
						const collection = JSON.parse(collectionStr)["payload"];

						const inventoryStart = contents.indexOf('{"InventoryInfo', collectionEnd);
						const inventoryEnd = contents.indexOf("\n", inventoryStart);
						const inventoryStr = contents.slice(inventoryStart, inventoryEnd);
						const rawInventory = JSON.parse(inventoryStr)["InventoryInfo"];
						const inventory = {
							wildcards: {
								common: Math.max(0, rawInventory.WildCardCommons),
								uncommon: Math.max(0, rawInventory.WildCardUnCommons),
								rare: Math.max(0, rawInventory.WildCardRares),
								mythic: Math.max(0, rawInventory.WildCardMythics),
							},
							vaultProgress: Math.max(0, rawInventory.TotalVaultProgress) / 10,
						};
						console.log(inventory);

						return { collection, inventory };
					} catch (e) {
						Alert.fire({
							icon: "error",
							title: "Parsing Error",
							text: "An error occurred during parsing. Please make sure that you selected the correct file (C:\\Users\\%username%\\AppData\\LocalLow\\Wizards Of The Coast\\MTGA\\Player.log).",
							footer: "Full error: " + e,
						});
						return null;
					}
				};

				let result = null;
				if (playerIds.size > 1) {
					const swalResult = await Alert.fire({
						icon: "question",
						title: "Multiple Accounts",
						text: `Looks like there are collections from multiple accounts (${playerIds.size}) in these logs, do you want to intersect them all, or just import the latest?`,
						showCancelButton: true,
						showConfirmButton: true,
						confirmButtonColor: ButtonColor.Safe,
						cancelButtonColor: ButtonColor.Critical,
						confirmButtonText: "Intersect",
						cancelButtonText: "Latest Only",
					});
					if (swalResult.value) {
						const collections = [];
						for (let pid of playerIds) {
							const startIdx = contents.lastIndexOf(`"payload":{"playerId":"${pid}"`);
							const coll = parseCollection(contents, startIdx);
							if (coll) collections.push(coll);
						}
						let cardids = Object.keys(collections[0]);
						// Filter ids
						for (let i = 1; i < collections.length; ++i)
							cardids = Object.keys(collections[i]).filter((id) => cardids.includes(id));
						// Find min amount of each card
						result = {};
						for (let id of cardids) result[id] = collections[0][id];
						for (let i = 1; i < collections.length; ++i)
							for (let id of cardids) result[id] = Math.min(result[id], collections[i][id]);
					} else result = parseCollection(contents);
				} else result = parseCollection(contents);

				if (result !== null) {
					localStorage.setItem("Collection", JSON.stringify(result.collection));
					localStorage.setItem("CollectionInfos", JSON.stringify(result.inventory));
					localStorage.setItem("CollectionDate", new Date().toLocaleDateString());
					this.setCollection(result.collection);
					this.collectionInfos = result.inventory;
					Alert.fire({
						position: "top-end",
						icon: "success",
						title: "Collection updated",
						showConfirmButton: false,
						timer: 1500,
					});
				}
			};
			reader.readAsText(file);
		},
		// Returns a Blob to be consumed by a FileReader
		uploadFile(e, callback, options) {
			let file = e.target.files[0];
			if (!file) {
				fireToast("error", "An error occured while uploading the file.");
				return false;
			}
			return callback(file, options);
		},
		// Returns a Blob to be consumed by a FileReader
		fetchFile: async function (url, callback, options) {
			const response = await fetch(url);
			if (!response.ok) {
				fireToast("error", `Could not fetch ${url}.`);
				return;
			}
			const blob = await response.blob();
			callback(blob, options);
		},
		dropCustomList(event) {
			event.preventDefault();
			event.target.classList.remove("dropzone-highlight");

			if (event.dataTransfer.items) {
				for (let item of event.dataTransfer.items)
					if (item.kind === "file") {
						const file = item.getAsFile();
						this.parseCustomCardList(file);
					}
			} else {
				for (let file of event.dataTransfer.files) this.parseCustomCardList(file);
			}
		},
		parseCustomCardList: async function (file) {
			Alert.fire({
				position: "center",
				icon: "info",
				title: "Parsing card list...",
				showConfirmButton: false,
			});
			let contents = await file.text();

			this.socket.emit("parseCustomCardList", contents, (answer) => {
				if (answer.code === 0) {
					fireToast("success", `Card list uploaded (${this.customCardList.length} cards)`);
				} else {
					Alert.fire({
						icon: "error",
						title: answer.title,
						text: answer.text,
						html: answer.html,
						footer: answer.footer,
					});
				}
			});
		},
		importCube(service) {
			const defaultMatchCardVersions = localStorage.getItem("import-match-versions", "false") === "true";
			const defaultCubeID = localStorage.getItem("import-cubeID", "");
			Alert.fire({
				title: `Import from ${service}`,
				html: `<p>Enter a Cube ID or an URL to import a cube directly from ${service}</p>
				<input type="checkbox" id="input-match-card-versions" ${
					defaultMatchCardVersions ? "checked" : ""
				}><label for="input-match-card-versions">Match exact card versions</label>`,
				inputPlaceholder: "Cube ID/URL",
				input: "text",
				inputValue: defaultCubeID,
				showCancelButton: true,
				confirmButtonColor: ButtonColor.Safe,
				cancelButtonColor: ButtonColor.Critical,
				confirmButtonText: "Import",
				preConfirm(cubeID) {
					const matchVersions = document.getElementById("input-match-card-versions").checked;
					localStorage.setItem("import-match-versions", matchVersions.toString());
					if (cubeID) {
						// Convert from URL to cubeID if necessary.
						const urlTest = cubeID.match(
							/https?:\/\/(?:cubecobra\.com|cubeartisan\.net)\/cube\/(?:overview\/)?([^/\n]*)/
						);
						if (urlTest) cubeID = urlTest[1];
					}
					localStorage.setItem("import-cubeID", cubeID);
					return new Promise(function (resolve) {
						resolve({
							cubeID: cubeID,
							matchVersions: matchVersions,
							service: service,
						});
					});
				},
			}).then((result) => {
				if (result.value && result.value.cubeID) this.selectCube(result.value);
			});
		},
		selectCube(cube) {
			const ack = (r) => {
				if (r.type === "error") {
					Alert.fire({
						icon: "error",
						title: r.title,
						text: r.text,
						footer: r.footer,
					});
				} else {
					fireToast("success", `Card list loaded (${this.customCardList.length} cards)`);
				}
			};

			if (cube.cubeCobraID) {
				cube.cubeID = cube.cubeCobraID;
				cube.service = "Cube Cobra";
			} else if (cube.cubeArtisanID) {
				cube.cubeID = cube.cubeArtisanID;
				cube.service = "CubeArtisan";
			}

			if (cube.cubeID) {
				Alert.fire({
					position: "center",
					icon: "info",
					title: `Loading Cube...`,
					text: `Please wait as we retrieve the latest version from ${cube.service}...`,
					footer: `CubeID: ${cube.cubeID}`,
					showConfirmButton: false,
					allowOutsideClick: false,
				});
				this.socket.emit(
					"importCube",
					{ cubeID: cube.cubeID, service: cube.service, matchVersions: cube.matchVersions },
					ack
				);
			} else if (cube.name) {
				this.socket.emit("loadLocalCustomCardList", cube.name, ack);
			}
		},
		exportDeck(full = true) {
			copyToClipboard(
				exportToMTGA(this.deck, this.sideboard, this.language, this.lands, this.sideboardBasics, full)
			);
			fireToast("success", "Deck exported to clipboard!");
		},
		shareDecklist() {
			this.socket.emit("shareDecklist", {
				main: this.deck.map((c) => c.id),
				side: this.sideboard.map((c) => c.id),
				lands: this.lands,
				timestamp: Date.now(),
			});
			fireToast("success", "Deck now visible in logs and bracket!");
		},
		importDeck: async function () {
			const response = await fetch("/getDeck", {
				method: "POST",
				mode: "cors",
				cache: "no-cache",
				credentials: "same-origin",
				headers: {
					"Content-Type": "text/plain",
				},
				redirect: "follow",
				referrerPolicy: "no-referrer",
				body: document.querySelector("#decklist-text").value,
			});
			if (response.status === 200) {
				let data = await response.json();
				if (data && !data.error) {
					this.clearState();
					for (let c of data.deck) this.addToDeck(c);
					for (let c of data.sideboard) this.addToSideboard(c);
					this.draftingState = DraftState.Brewing;
				}
				fireToast("success", "Successfully imported deck!");
				this.displayedModal = null;
			} else if (response.status === 400) {
				let data = await response.json();
				if (data.error) {
					fireToast("error", `Error importing deck: ${data.error.message}`);
				} else {
					fireToast("error", "Error importing deck.");
				}
			} else {
				fireToast("error", "Error importing deck.");
			}
		},
		uploadBoosters() {
			if (this.sessionOwner !== this.userID) return;
			const text = document.querySelector("#upload-booster-text").value;
			this.socket.emit("setBoosters", text, (response) => {
				if (response.error) {
					Alert.fire({
						icon: "error",
						title: response.error.title,
						text: response.error.text,
						footer: response.error.footer,
					});
				} else {
					fireToast("success", "Boosters successfuly uploaded!");
					this.displayedModal = "sessionOptions";
				}
			});
		},
		shuffleUploadedBoosters() {
			if (this.sessionOwner !== this.userID) return;
			this.socket.emit("shuffleBoosters", (response) => {
				if (response.error) {
					fireToast(response.error.type, response.error.title);
				} else {
					fireToast("success", "Boosters successfuly shuffled!");
				}
			});
		},
		toggleSetRestriction(code) {
			if (this.setRestriction.includes(code))
				this.setRestriction.splice(
					this.setRestriction.findIndex((c) => c === code),
					1
				);
			else this.setRestriction.push(code);
		},
		setSessionOwner(newOwnerID) {
			if (this.userID != this.sessionOwner) return;
			let user = this.sessionUsers.find((u) => u.userID === newOwnerID);
			if (!user) return;
			Alert.fire({
				title: "Are you sure?",
				text: `Do you want to surrender session ownership to ${user.userName}?`,
				icon: "warning",
				showCancelButton: true,
				confirmButtonColor: ButtonColor.Safe,
				cancelButtonColor: ButtonColor.Critical,
				confirmButtonText: "Yes",
			}).then((result) => {
				if (result.value) {
					this.socket.emit("setSessionOwner", newOwnerID);
				}
			});
		},
		removePlayer(userID) {
			if (this.userID != this.sessionOwner) return;
			let user = this.sessionUsers.find((u) => u.userID === userID);
			if (!user) return;
			Alert.fire({
				title: "Are you sure?",
				text: `Do you want to remove player '${user.userName}' from the session? They'll still be able to rejoin if they want.`,
				icon: "warning",
				showCancelButton: true,
				confirmButtonColor: ButtonColor.Critical,
				cancelButtonColor: ButtonColor.Safe,
				confirmButtonText: "Remove player",
			}).then((result) => {
				if (result.value) {
					this.socket.emit("removePlayer", userID);
				}
			});
		},
		movePlayer(idx, dir) {
			if (this.userID != this.sessionOwner) return;

			const negMod = (m, n) => ((m % n) + n) % n;
			let other = negMod(idx + dir, this.userOrder.length);
			[this.userOrder[idx], this.userOrder[other]] = [this.userOrder[other], this.userOrder[idx]];

			this.socket.emit("setSeating", this.userOrder);
		},
		changePlayerOrder() {
			if (this.userID != this.sessionOwner) return;
			this.socket.emit("setSeating", this.userOrder);
		},
		sealedDialog: async function () {
			if (this.userID != this.sessionOwner) return;

			Alert.fire({
				title: "Start Sealed",
				html: `
					<p>How many boosters for each player (default is 6)?
					<input type="number" value="6" min="4" max="24" step="1" id="input-boostersPerPlayer" class="swal2-input" style="display:block" placeholder="Boosters per Player"></p>
					<p>(Optional) Customize the set of each booster:
					<div id="input-customBoosters" style="
						display: grid;
						grid-template-columns: 1fr 1fr 1fr;
						grid-column-gap: 0.5em;
					"></div></p>`,
				inputValue: 6,
				showCancelButton: true,
				confirmButtonColor: ButtonColor.Safe,
				cancelButtonColor: ButtonColor.Critical,
				confirmButtonText: "Distribute boosters",
				width: "auto",
				preConfirm() {
					return new Promise(function (resolve) {
						resolve({
							boostersPerPlayer: document.getElementById("input-boostersPerPlayer").valueAsNumber,
							customBoosters: [
								...document.getElementById("input-customBoosters").querySelectorAll("select"),
							].map((s) => s.value),
						});
					});
				},
				didOpen: (el) => {
					let customBoostersEl = el.querySelector("#input-customBoosters");
					let boostersPerPlayerEl = el.querySelector("#input-boostersPerPlayer");
					// Create the set selects according to the number of booster per player
					function updateCustomBoosterInput(target) {
						while (customBoostersEl.children.length < target) {
							let sel = document.createElement("select");
							sel.classList.add("standard-input");
							sel.style.margin = "0.5em auto";
							const addOption = (val, txt) => {
								let op = document.createElement("option");
								op.value = val;
								op.innerHTML = txt;
								sel.appendChild(op);
								return op;
							};
							const addSeparator = () => {
								const separator = addOption("", "————————————————");
								separator.style = "color: #888";
								separator.disabled = true;
							};
							addOption("", "(Default)");
							addOption("random", "Random set from Card Pool");
							addSeparator();
							for (let s of Constant.MTGASets.slice().reverse()) addOption(s, SetsInfos[s].fullName);
							addSeparator();
							for (let s of Constant.PrimarySets.filter((s) => !Constant.MTGASets.includes(s)))
								addOption(s, SetsInfos[s].fullName);
							customBoostersEl.appendChild(sel);
						}
						while (customBoostersEl.children.length > target)
							customBoostersEl.removeChild(customBoostersEl.lastChild);
					}
					updateCustomBoosterInput(boostersPerPlayerEl.value);
					boostersPerPlayerEl.addEventListener("change", function (e) {
						updateCustomBoosterInput(e.target.value);
					});
				},
			}).then((r) => {
				if (r.isConfirmed) {
					this.deckWarning(this.distributeSealed, [r.value.boostersPerPlayer, r.value.customBoosters]);
				}
			});
		},
		deckWarning(call, options = []) {
			if (this.deck.length > 0) {
				Alert.fire({
					title: "Are you sure?",
					text: "Lauching another game will reset everyone's cards/deck!",
					icon: "warning",
					showCancelButton: true,
					confirmButtonColor: ButtonColor.Critical,
					cancelButtonColor: ButtonColor.Safe,
					confirmButtonText: "Start new game!",
				}).then((result) => {
					if (result.value) {
						call(...options);
					}
				});
			} else {
				call(...options);
			}
		},
		distributeSealed(boosterCount, customBoosters) {
			if (this.userID !== this.sessionOwner) return;
			const useCustomBoosters = customBoosters && customBoosters.some((s) => s !== "");
			this.socket.emit("distributeSealed", boosterCount, useCustomBoosters ? customBoosters : null);
		},
		distributeJumpstart() {
			if (this.userID != this.sessionOwner) return;
			this.socket.emit("distributeJumpstart");
		},
		distributeJumpstartHH() {
			if (this.userID != this.sessionOwner) return;
			this.socket.emit("distributeJumpstart", "j21");
		},
		distributeSuperJump() {
			if (this.userID != this.sessionOwner) return;
			this.socket.emit("distributeJumpstart", "super");
		},
		async displayPackChoice(boosters, currentPack, packCount) {
			let boostersDisplay = "";
			for (let b of boosters) {
				let colors = b.colors
					.map(
						(c) => `<img src="img/mana/${c}.svg" class="mana-icon" style="vertical-align: text-top;"></img>`
					)
					.join(" ");
				boostersDisplay += `<div class="pack-button clickable" style="text-align: center"><img src="${b.image}" style="display:block; min-width: 250px; min-height: 354px; max-width: 250px; max-height: 60vh; border-radius: 3%; margin:auto;" /><h2>${colors}<br />${b.name}</h2></div>`;
			}
			let choice = -1;
			await Alert.fire({
				title: `Select your Jumpstart Packs (${currentPack + 1}/${packCount})`,
				html: `<div style="display:flex; justify-content: space-around; width: 100%">${boostersDisplay}</div>`,
				showCancelButton: false,
				showConfirmButton: false,
				allowEscapeKey: false,
				allowOutsideClick: false,
				width: "50vw",
				didOpen: (el) => {
					let packButtons = el.querySelectorAll(".pack-button");
					for (let i = 0; i < packButtons.length; ++i) {
						packButtons[i].addEventListener("click", () => {
							choice = i;
							for (let c of boosters[i].cards) this.addToDeck(c);
							Alert.clickConfirm();
						});
					}
				},
			});
			return choice;
		},
		selectJumpstartPacks: async function (choices, ack) {
			this.clearState();
			this.draftingState = DraftState.Brewing;
			let choice = await this.displayPackChoice(choices[0], 0, choices.length);
			await this.displayPackChoice(choices[1][choice], 1, choices.length);
			ack?.(
				this.userID,
				this.deck.map((card) => card.id)
			);
		},
		readyCheck() {
			if (this.userID != this.sessionOwner || this.drafting) return;

			if (this.socket.disconnected) {
				this.disconnectedReminder();
				return;
			}

			this.socket.emit("readyCheck", (anwser) => {
				if (anwser.code === 0) {
					this.initReadyCheck();
					this.socket.emit("setReady", ReadyState.Ready);
				}
			});
		},
		initReadyCheck() {
			this.pendingReadyCheck = true;

			for (let u of this.sessionUsers) u.readyState = ReadyState.Unknown;

			this.playSound("readyCheck");
			this.pushTitleNotification("❔");
		},
		stopReadyCheck() {
			this.pendingReadyCheck = false;

			for (let u of this.sessionUsers) u.readyState = ReadyState.DontCare;
		},
		shareSavedDraftLog(storedDraftLog) {
			if (this.userID != this.sessionOwner) {
				Alert.fire({
					title: "You need to be the session owner to share logs.",
					icon: "error",
				});
				return;
			}
			if (!storedDraftLog || !storedDraftLog.delayed) {
				fireToast("error", "No saved draft log");
				return;
			} else {
				if (storedDraftLog.sessionID !== this.sessionID) {
					Alert.fire({
						title: "Wrong Session ID",
						text: `Can't share logs: The session ID of your saved draft log ('${storedDraftLog.sessionID}') doesn't match the id of yout current session ('${this.sessionID}').`,
						icon: "error",
					});
					return;
				}
				storedDraftLog.delayed = false;
				this.socket.emit("shareDraftLog", storedDraftLog);
				this.storeDraftLogs();
				fireToast("success", "Shared draft log with session!");
			}
		},
		prepareBracketPlayers(pairingOrder) {
			const playerInfos = this.sessionUsers.map((u) => {
				return { userID: u.userID, userName: u.userName };
			});
			let players = [];
			for (let i = 0; i < pairingOrder.length; ++i) {
				if (pairingOrder[i] < playerInfos.length) players[i] = playerInfos[pairingOrder[i]];
				else players[i] = null;
			}
			return players;
		},
		// Bracket (Server communication)
		generateBracket() {
			if (this.userID != this.sessionOwner) return;
			let players = this.prepareBracketPlayers(this.teamDraft ? [0, 3, 2, 5, 4, 1] : [0, 4, 2, 6, 1, 5, 3, 7]);
			this.socket.emit("generateBracket", players, (answer) => {
				if (answer.code === 0) this.displayedModal = "bracket";
			});
		},
		generateSwissBracket() {
			if (this.userID != this.sessionOwner) return;
			let players =
				this.sessionUsers.length == 6
					? this.prepareBracketPlayers([0, 3, 1, 4, 2, 5])
					: this.prepareBracketPlayers([0, 4, 2, 6, 1, 5, 3, 7]);
			this.socket.emit("generateSwissBracket", players, (answer) => {
				if (answer.code === 0) this.displayedModal = "bracket";
			});
		},
		generateDoubleBracket() {
			if (this.userID != this.sessionOwner || this.teamDraft) return;
			let players = this.prepareBracketPlayers([0, 4, 2, 6, 1, 5, 3, 7]);
			this.socket.emit("generateDoubleBracket", players, (answer) => {
				if (answer.code === 0) this.displayedModal = "bracket";
			});
		},
		updateBracket(matchIndex, index, value) {
			if (this.userID != this.sessionOwner && this.bracketLocked) return;
			this.bracket.results[matchIndex][index] = value;
			this.socket.emit("updateBracket", this.bracket.results);
		},
		lockBracket(val) {
			if (this.userID != this.sessionOwner) return;
			this.bracketLocked = val;
			this.socket.emit("lockBracket", this.bracketLocked);
		},
		// Deck/Sideboard management
		addToDeck(card, options) {
			if (Array.isArray(card)) for (let c of card) this.addToDeck(c, options);
			else {
				// Handle column sync.
				this.deck.push(card);
				this.$refs.deckDisplay.addCard(card, options ? options.event : null);
			}
		},
		addToSideboard(card, options) {
			if (Array.isArray(card)) for (let c of card) this.addToSideboard(c, options);
			else {
				// Handle column sync.
				this.sideboard.push(card);
				this.$refs.sideboardDisplay.addCard(card, options ? options.event : null);
			}
		},
		deckToSideboard(e, c) {
			// From deck to sideboard
			let idx = this.deck.indexOf(c);
			if (idx >= 0) {
				this.deck.splice(idx, 1);
				this.addToSideboard(c);
			} else return;
			this.$refs.deckDisplay.remCard(c);
		},
		sideboardToDeck(e, c) {
			// From sideboard to deck
			let idx = this.sideboard.indexOf(c);
			if (idx >= 0) {
				this.sideboard.splice(idx, 1);
				this.addToDeck(c);
			} else return;
			this.$refs.sideboardDisplay.remCard(c);
		},
		clearDeck() {
			this.deck = [];
			this.$nextTick(() => {
				this.$refs.deckDisplay.sync();
			});
		},
		clearSideboard() {
			this.sideboard = [];
			this.$nextTick(() => {
				this.$refs.sideboardDisplay.sync();
			});
		},
		updateAutoLands() {
			if (this.autoLand) {
				if (!this.deck || this.deck.length === 0) return;

				const targetDeckSize = this.targetDeckSize ?? 40;
				const landToAdd = targetDeckSize - this.deck.length;
				if (landToAdd < 0) return;
				if (landToAdd === 0) {
					this.lands = { W: 0, U: 0, B: 0, R: 0, G: 0 };
					return;
				}

				const colorCount = this.colorsInDeck;
				let totalColor = 0;
				for (let c in colorCount) totalColor += colorCount[c];
				if (totalColor <= 0) return;

				for (let c in this.lands) this.lands[c] = Math.round(landToAdd * (colorCount[c] / totalColor));
				let addedLands = this.totalLands;

				if (this.deck.length + addedLands > targetDeckSize) {
					let max = "W";
					for (let i = 0; i < this.deck.length + addedLands - targetDeckSize; ++i) {
						for (let c in this.lands) if (this.lands[c] > this.lands[max]) max = c;
						this.lands[max] = Math.max(0, this.lands[max] - 1);
					}
				} else if (this.deck.length + addedLands < targetDeckSize) {
					let min = "W";
					for (let i = 0; i < targetDeckSize - (this.deck.length + addedLands); ++i) {
						for (let c in this.lands)
							if (
								this.colorsInDeck[min] == 0 ||
								(this.colorsInDeck[c] > 0 && this.lands[c] < this.lands[min])
							)
								min = c;
						this.lands[min] += 1;
					}
				}
			}
		},
		removeBasicsFromDeck() {
			this.deck = this.deck.filter((c) => c.type !== "Basic Land");
			this.sideboard = this.sideboard.filter((c) => c.type !== "Basic Land");
			this.$refs.deckDisplay.filterBasics();
			this.$refs.sideboardDisplay.filterBasics();
		},
		colorsInCardPool(pool) {
			let r = { W: 0, U: 0, B: 0, R: 0, G: 0 };
			for (let card of pool) {
				for (let color of card.colors) {
					r[color] += 1;
				}
			}
			return r;
		},
		// Misc.
		toggleNotifications() {
			this.enableNotifications = !this.enableNotifications;
			if (typeof Notification === "undefined") {
				this.notificationPermission = "unavailable";
				return;
			}
			if (this.enableNotifications && Notification.permission !== "granted") {
				Notification.requestPermission().then((permission) => {
					this.notificationPermission = permission;
					if (permission !== "granted") this.enableNotifications = false;
				});
			}
		},
		pushNotification(title, data) {
			if (this.enableNotifications && !document.hasFocus()) {
				new Notification(title, data);
			}
		},
		pushTitleNotification(msg) {
			if (this.titleNotification) {
				clearTimeout(this.titleNotification.timeout);
				this.titleNotification = null;
			}
			this.titleNotification = {
				timeout: setTimeout(() => {
					this.titleNotification = null;
					document.title = this.pageTitle;
				}, 3000),
				message: msg,
			};
			document.title = this.pageTitle;
		},
		sessionURLToClipboard() {
			copyToClipboard(
				`${window.location.protocol}//${window.location.hostname}${
					window.location.port ? ":" + window.location.port : ""
				}/?session=${encodeURIComponent(this.sessionID)}`
			);
			fireToast("success", "Session link copied to clipboard!");
		},
		disconnectedReminder() {
			fireToast("error", "Disconnected from server!");
		},
		toClipboard(data, message = "Copied to clipboard!") {
			copyToClipboard(data);
			fireToast("success", message);
		},
		updateStoredSessionSettings(data) {
			let previous = localStorage.getItem(localStorageSessionSettingsKey) ?? "{}";
			previous = JSON.parse(previous);
			for (let key in data) previous[key] = data[key];
			localStorage.setItem(localStorageSessionSettingsKey, JSON.stringify(previous));
		},
		storeDraftLogs() {
			// Limits saved draft logs to 25
			while (this.draftLogs.length > 25) {
				const idx = this.draftLogs.reduce((acc, cur, idx, src) => {
					return cur.time < src[acc].time ? idx : acc;
				}, 0);
				this.draftLogs.splice(idx, 1);
			}

			let worker = new LogStoreWorker();
			worker.onmessage = (e) => {
				localStorage.setItem("draftLogs", e.data);
				console.log("Stored Draft Logs.");
			};
			worker.postMessage(["compress", this.draftLogs]);
		},
		toggleLimitDuplicates() {
			if (this.maxDuplicates !== null) this.maxDuplicates = null;
			else
				this.maxDuplicates = {
					common: 8,
					uncommon: 4,
					rare: 2,
					mythic: 1,
				};
		},
		countMissing(cards) {
			if (!this.hasCollection || !cards) return null;
			const r = { common: 0, uncommon: 0, rare: 0, mythic: 0 };
			const counts = {};
			for (let card of cards) {
				if (!("arena_id" in card)) return null;
				if (card.type.includes("Basic")) continue;
				if (!(card.arena_id in counts)) counts[card.arena_id] = { rarity: card.rarity, count: 0 };
				++counts[card.arena_id].count;
			}
			for (let cid in counts)
				r[counts[cid].rarity] += Math.max(
					0,
					Math.min(4, counts[cid].count) - (cid in this.collection ? this.collection[cid] : 0)
				);
			return r;
		},
		wildcardCost(card) {
			if (!this.hasCollection || !card.arena_id || card.type.includes("Basic")) return false;
			if (!(card.arena_id in this.collection)) return true;
			if (this.collection[card.id] >= 4) return false;
			const currentCount = card.id in this.deckSummary ? this.deckSummary[card.id] : 0;
			return currentCount >= this.collection[card.arena_id];
		},
		hasEnoughWildcards(card) {
			if (
				!this.neededWildcards ||
				!this.neededWildcards.main ||
				!this.collectionInfos ||
				!this.collectionInfos.wildcards
			)
				return true;
			const needed = this.neededWildcards.main[card.rarity] || 0;
			return needed < this.collectionInfos.wildcards[card.rarity];
		},
		storeSettings() {
			let settings = {};
			for (let key in defaultSettings) {
				settings[key] = this[key];
			}
			localStorage.setItem(localStorageSettingsKey, JSON.stringify(settings));
		},
	},
	computed: {
		DraftState() {
			return DraftState;
		},
		ReadyState() {
			return ReadyState;
		},
		gameModeName() {
			if (this.rochesterDraftState) return "Rochester Draft";
			if (this.winstonDraftState) return "Winston Draft";
			if (this.gridDraftState) return "Grid Draft";
			if (this.useCustomCardList) return "Cube Draft";
			if (this.burnedCardsPerRound > 0) return "Glimpse Draft";
			return "Draft";
		},
		cardsToPick() {
			if (this.rochesterDraftState) return 1;
			return Math.min(this.pickedCardsPerRound, this.booster.length);
		},
		cardsToBurnThisRound() {
			return Math.max(0, Math.min(this.burnedCardsPerRound, this.booster.length - this.cardsToPick));
		},
		winstonCanSkipPile() {
			const s = this.winstonDraftState;
			return !(
				!s.remainingCards &&
				((s.currentPile === 0 && !s.piles[1].length && !s.piles[2].length) ||
					(s.currentPile === 1 && !s.piles[2].length) ||
					s.currentPile === 2)
			);
		},
		waitingForDisconnectedUsers() {
			if (!this.drafting) return false;
			return Object.keys(this.disconnectedUsers).length > 0;
		},
		disconnectedUserNames() {
			return Object.values(this.disconnectedUsers)
				.map((u) => u.userName)
				.join(", ");
		},
		virtualPlayers() {
			if (!this.drafting || !this.virtualPlayersData || Object.keys(this.virtualPlayersData).length == 0)
				return this.sessionUsers;

			let r = [];
			for (let id in this.virtualPlayersData) {
				if (this.virtualPlayersData[id].isBot) {
					r.push(this.virtualPlayersData[id]);
					r[r.length - 1].userName = r[r.length - 1].instance.name;
					r[r.length - 1].userID = r[r.length - 1].instance.id;
				} else if (this.virtualPlayersData[id].disconnected) {
					r.push({
						userName: "(Disconnected)",
						userID: "",
						disconnected: true,
					});
				} else {
					const p = this.sessionUsers.find((u) => u.userID === id);
					if (p) r.push(p);
				}
			}

			return r;
		},
		displaySets() {
			let dSets = [];
			for (let s of this.sets) {
				if (this.setsInfos && s in this.setsInfos)
					dSets.push({
						code: s,
						fullName: this.setsInfos[s].fullName,
						icon: this.setsInfos[s].icon,
					});
			}
			return dSets;
		},
		hasCollection() {
			return !isEmpty(this.collection);
		},

		colorsInDeck() {
			return this.colorsInCardPool(this.deck);
		},
		totalLands() {
			let addedLands = 0;
			for (let c in this.lands) addedLands += this.lands[c];
			return addedLands;
		},
		basicsInDeck() {
			return (
				this.deck.some((c) => c.type === "Basic Land") || this.sideboard.some((c) => c.type === "Basic Land")
			);
		},
		neededWildcards() {
			if (!this.hasCollection) return null;
			const main = this.countMissing(this.deck);
			const side = this.countMissing(this.sideboard);
			if (!main && !side) return null;
			return { main: main, side: side };
		},
		deckSummary() {
			const r = {};
			for (let c of this.deck) {
				if (!(c.id in r)) r[c.id] = 0;
				++r[c.id];
			}
			return r;
		},
		displayWildcardInfo() {
			return (
				this.displayCollectionStatus &&
				this.neededWildcards &&
				((this.neededWildcards.main && Object.values(this.neededWildcards.main).some((v) => v > 0)) ||
					(this.neededWildcards.side && Object.values(this.neededWildcards.side).some((v) => v > 0)))
			);
		},

		userByID() {
			let r = {};
			for (let u of this.sessionUsers) r[u.userID] = u;
			return r;
		},

		pageTitle() {
			return `MTGA Draft (${this.sessionUsers.length}/${this.maxPlayers}) ${
				this.titleNotification ? this.titleNotification.message : ""
			}`;
		},
	},
	mounted: async function () {
		// Load all card informations
		try {
			let urlParamSession = getUrlVars()["session"];
			if (urlParamSession) this.sessionID = decodeURIComponent(urlParamSession);

			// Load set informations
			this.setsInfos = Object.freeze(SetsInfos);

			// Now that we have all the essential data, initialize the websocket.
			this.initializeSocket();

			this.useCollection = getCookie("useCollection", "true") === "true";

			// Look for a locally stored collection
			const localStorageCollection = localStorage.getItem("Collection");
			if (localStorageCollection) {
				try {
					let json = JSON.parse(localStorageCollection);
					this.setCollection(json);
					console.log("Loaded collection from local storage");
				} catch (e) {
					console.error(e);
				}
			}
			const localStorageCollectionInfos = localStorage.getItem("CollectionInfos");
			if (localStorageCollectionInfos) {
				try {
					this.collectionInfos = JSON.parse(localStorageCollectionInfos);
				} catch (e) {
					console.error(e);
				}
			}

			const storedLogs = localStorage.getItem("draftLogs");
			if (storedLogs) {
				let worker = new LogStoreWorker();
				worker.onmessage = (e) => {
					this.draftLogs = e.data;
					console.log(`Loaded ${this.draftLogs.length} saved draft logs.`);
				};
				worker.postMessage(["decompress", storedLogs]);
			}

			for (let key in Sounds) Sounds[key].volume = 0.4;
			Sounds["countdown"].volume = 0.11;

			this.ready = true;
		} catch (e) {
			alert(e);
		}
	},
	watch: {
		sessionID() {
			if (this.socket) {
				let sessionSettings = {};
				const storedSessionSettings = localStorage.getItem(localStorageSessionSettingsKey);
				if (storedSessionSettings) {
					try {
						sessionSettings = JSON.parse(storedSessionSettings);
					} catch (e) {
						console.error("Error parsing stored session settings: ", e);
					}
				}
				this.socket.io.opts.query.sessionID = this.sessionID;
				this.socket.emit("setSession", this.sessionID, sessionSettings);
			}
			history.replaceState(
				{ sessionID: this.sessionID },
				`MTGADraft Session ${this.sessionID}`,
				`?session=${encodeURIComponent(this.sessionID)}`
			);
			if (this.sessionID) setCookie("sessionID", this.sessionID);
		},
		userName() {
			if (this.socket) {
				this.socket.io.opts.query.userName = this.userName;
				this.socket.emit("setUserName", this.userName);
			}
			setCookie("userName", this.userName);
		},
		useCollection() {
			if (this.socket) this.socket.emit("useCollection", this.useCollection);
			setCookie("useCollection", this.useCollection.toString());
		},
		// Front-end options
		language() {
			setCookie("language", this.language);
		},
		displayBotScores() {
			this.storeSettings();
		},
		pickOnDblclick() {
			this.storeSettings();
		},
		enableNotifications() {
			this.storeSettings();
		},
		enableSound() {
			this.storeSettings();
		},
		hideSessionID() {
			this.storeSettings();
		},
		displayCollectionStatus() {
			this.storeSettings();
		},
		collapseSideboard() {
			this.storeSettings();
		},
		deck() {
			this.updateAutoLands();
		},
		autoLand() {
			this.updateAutoLands();
		},
		targetDeckSize() {
			this.updateAutoLands();
			this.storeSettings();
		},
		sideboardBasics() {
			this.storeSettings();
		},
		// Session settings
		ownerIsPlayer() {
			if (this.userID != this.sessionOwner || !this.socket) return;
			setCookie("userID", this.userID); // Used for reconnection
			this.socket.emit("setOwnerIsPlayer", this.ownerIsPlayer);
		},
		setRestriction() {
			if (this.userID != this.sessionOwner || !this.socket) return;

			this.socket.emit("setRestriction", this.setRestriction);
		},
		isPublic() {
			if (this.userID != this.sessionOwner || !this.socket) return;
			this.socket.emit("setPublic", this.isPublic);
		},
		description() {
			if (this.userID != this.sessionOwner || !this.socket) return;
			this.socket.emit("setDescription", this.description);
		},
		usePredeterminedBoosters() {
			if (this.userID !== this.sessionOwner || !this.socket) return;
			this.socket.emit("setUsePredeterminedBoosters", this.usePredeterminedBoosters);
		},
		boostersPerPlayer() {
			if (this.userID != this.sessionOwner || !this.socket) return;
			this.socket.emit("boostersPerPlayer", this.boostersPerPlayer);
		},
		cardsPerBooster() {
			if (this.userID != this.sessionOwner || !this.socket) return;
			this.socket.emit("cardsPerBooster", this.cardsPerBooster);
		},
		teamDraft() {
			if (this.userID != this.sessionOwner || !this.socket) return;
			this.socket.emit("teamDraft", this.teamDraft);
		},
		randomizeSeatingOrder(oldValue, newValue) {
			if (this.userID != this.sessionOwner || !this.socket || oldValue === newValue) return;
			this.socket.emit("setRandomizeSeatingOrder", this.randomizeSeatingOrder);
			this.updateStoredSessionSettings({ randomizeSeatingOrder: this.randomizeSeatingOrder });
		},
		disableBotSuggestions(oldValue, newValue) {
			if (this.userID != this.sessionOwner || !this.socket || oldValue === newValue) return;
			this.socket.emit("setDisableBotSuggestions", this.disableBotSuggestions);
			this.updateStoredSessionSettings({ disableBotSuggestions: this.disableBotSuggestions });
		},
		distributionMode() {
			if (this.userID != this.sessionOwner || !this.socket) return;
			this.socket.emit("setDistributionMode", this.distributionMode);
		},
		customBoosters() {
			if (this.userID != this.sessionOwner || !this.socket) return;
			this.socket.emit("setCustomBoosters", this.customBoosters);
		},
		bots() {
			if (this.userID != this.sessionOwner || !this.socket) return;
			this.socket.emit("bots", this.bots);
		},
		maxPlayers() {
			if (this.userID != this.sessionOwner || !this.socket) return;
			this.socket.emit("setMaxPlayers", this.maxPlayers);
		},
		mythicPromotion() {
			if (this.userID != this.sessionOwner || !this.socket) return;
			this.socket.emit("setMythicPromotion", this.mythicPromotion);
		},
		useBoosterContent() {
			if (this.userID != this.sessionOwner || !this.socket) return;
			this.socket.emit("setUseBoosterContent", this.useBoosterContent);
		},
		boosterContent: {
			deep: true,
			handler(val) {
				if (this.userID != this.sessionOwner) return;
				if (Object.values(val).reduce((acc, val) => acc + val) <= 0) {
					fireToast("warning", "Your boosters should contain at least one card :)");
					this.boosterContent["common"] = 1;
				} else {
					if (this.socket) this.socket.emit("setBoosterContent", this.boosterContent);
				}
			},
		},
		maxTimer() {
			if (this.userID != this.sessionOwner || !this.socket) return;
			this.socket.emit("setPickTimer", this.maxTimer);
			this.updateStoredSessionSettings({ maxTimer: this.maxTimer });
		},
		ignoreCollections() {
			if (this.userID != this.sessionOwner || !this.socket) return;
			this.socket.emit("ignoreCollections", this.ignoreCollections);
			this.updateStoredSessionSettings({ ignoreCollections: this.ignoreCollections });
		},
		maxDuplicates: {
			deep: true,
			handler() {
				if (this.userID != this.sessionOwner || !this.socket) return;
				this.socket.emit("setMaxDuplicates", this.maxDuplicates);
			},
		},
		colorBalance() {
			if (this.userID != this.sessionOwner || !this.socket) return;
			this.socket.emit("setColorBalance", this.colorBalance);
			this.updateStoredSessionSettings({ colorBalance: this.colorBalance });
		},
		foil() {
			if (this.userID != this.sessionOwner || !this.socket) return;
			this.socket.emit("setFoil", this.foil);
			this.updateStoredSessionSettings({ foil: this.foil });
		},
		useCustomCardList() {
			if (this.userID != this.sessionOwner || !this.socket) return;
			this.socket.emit("setUseCustomCardList", this.useCustomCardList);
		},
		pickedCardsPerRound() {
			if (this.userID != this.sessionOwner || !this.socket) return;
			this.socket.emit("setPickedCardsPerRound", this.pickedCardsPerRound);
		},
		burnedCardsPerRound() {
			if (this.userID != this.sessionOwner || !this.socket) return;
			this.socket.emit("setBurnedCardsPerRound", this.burnedCardsPerRound);
		},
		discardRemainingCardsAt() {
			if (this.userID != this.sessionOwner || !this.socket) return;
			this.socket.emit("setDiscardRemainingCardsAt", this.discardRemainingCardsAt);
		},
		personalLogs() {
			if (this.userID != this.sessionOwner || !this.socket) return;
			this.socket.emit("setPersonalLogs", this.personalLogs);
			this.updateStoredSessionSettings({ personalLogs: this.personalLogs });
		},
		draftLogRecipients() {
			if (this.userID != this.sessionOwner || !this.socket) return;
			this.socket.emit("setDraftLogRecipients", this.draftLogRecipients);
			this.updateStoredSessionSettings({ draftLogRecipients: this.draftLogRecipients });
		},
		sessionUsers(newV, oldV) {
			document.title = this.pageTitle;
			if (oldV.length > 0) {
				if (oldV.length < newV.length) {
					if (newV.length === this.maxPlayers) this.pushTitleNotification("😀👍");
					else this.pushTitleNotification("😀➕");
				}
				if (oldV.length > newV.length) this.pushTitleNotification("🙁➖");
			}
		},
	},
};

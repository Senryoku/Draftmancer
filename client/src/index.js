"use strict";
import io from "../../node_modules/socket.io-client/dist/socket.io.js";
import Vue from "vue";
import draggable from "vuedraggable";
import VTooltip from "v-tooltip";
import VueClazyLoad from "./vue-clazy-load.js";
import Multiselect from "vue-multiselect";
import Swal from "sweetalert2";

import Constant from "./constants.json";
import DefaultLoc from "../public/data/MTGACards.en.json";
import { clone, isEmpty, guid, shortguid, getUrlVars, copyToClipboard } from "./helper.js";
import { getCookie, setCookie } from "./cookies.js";
import Modal from "./components/Modal.vue";
import CardPlaceholder from "./components/CardPlaceholder.vue";
import Card from "./components/Card.vue";
import CardPool from "./components/CardPool.vue";
import DraftLogPick from "./components/DraftLogPick.vue";
import DraftLog from "./components/DraftLog.vue";
import DraftLogLive from "./components/DraftLogLive.vue";
import Collection from "./components/Collection.vue";
import CardList from "./components/CardList.vue";
import Bracket from "./components/Bracket.vue";
import PatchNotes from "./components/PatchNotes.vue";
import Toggle from "./components/Toggle.vue";

// Preload Carback
import CardBack from "./assets/img/cardback.png";
const img = new Image();
img.src = CardBack;

const SwalCustomClasses = {
	popup: "custom-swal-popup",
	title: "custom-swal-title",
	content: "custom-swal-content",
};

const DraftState = {
	Waiting: "Waiting",
	Picking: "Picking",
	Brewing: "Brewing",
	Watching: "Watching",
	WinstonPicking: "WinstonPicking",
	WinstonWaiting: "WinstonWaiting",
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

let UniqueID = 0;
Vue.use(VueClazyLoad);
Vue.use(VTooltip);
VTooltip.options.defaultPlacement = "bottom-start";
VTooltip.options.defaultBoundariesElement = "window";

var app = new Vue({
	el: "#main-vue",
	components: {
		Modal,
		Toggle,
		CardPlaceholder,
		Card,
		CardPool,
		DraftLogPick,
		DraftLog,
		DraftLogLive,
		Collection,
		CardList,
		Bracket,
		PatchNotes,
		draggable,
		Multiselect,
	},
	data: {
		// Card Data
		cards: undefined,

		// User Data
		userID: guid(),
		userName: getCookie("userName", "Anonymous"),
		useCollection: getCookie("useCollection", true),
		collection: {},
		socket: undefined,

		// Session status
		sessionID: getCookie("sessionID", shortguid()),
		sessionOwner: null,
		sessionOwnerUsername: null,
		// Session options
		ownerIsPlayer: true,
		isPublic: false,
		ignoreCollections: false,
		sessionUsers: [],
		boostersPerPlayer: 3,
		distributionMode: "regular",
		customBoosters: ["", "", ""],
		maxPlayers: 8,
		mythicPromotion: true,
		boosterContent: {
			common: 10,
			uncommon: 3,
			rare: 1,
		},
		colorBalance: true,
		maxDuplicates: {
			common: 8,
			uncommon: 4,
			rare: 2,
			mythic: 1,
		},
		foil: false,
		bots: 0,
		setRestriction: "",
		drafting: false,
		useCustomCardList: false,
		customCardList: {},
		burnedCardsPerRound: 0,
		maxTimer: 75,
		pickTimer: 75,
		draftLogRecipients: "everyone",
		//
		draftLog: undefined,
		savedDraftLog: false,
		bracket: null,
		virtualPlayersData: undefined,
		booster: [],
		boosterNumber: 0,
		pickNumber: 0,
		winstonDraftState: null,

		publicSessions: [],
		selectedPublicSession: "",

		// Front-end options & data
		displayedModal: "",
		userOrder: [],
		hideSessionID: getCookie("hideSessionID", false),
		languages: Constant.Languages,
		language: getCookie("language", "en"),
		loadingLanguages: [],
		loadedLanguages: [],
		sets: Constant.MTGSets,
		cubeLists: Constant.CubeLists,
		pendingReadyCheck: false,
		setsInfos: undefined,
		draftingState: undefined,
		pickOnDblclick: getCookie("pickOnDblclick", false),
		enableSound: getCookie("enableSound", true),
		enableNotifications:
			typeof Notification !== "undefined" &&
			Notification &&
			Notification.permission == "granted" &&
			getCookie("enableNotifications", false),
		notificationPermission: typeof Notification !== "undefined" && Notification && Notification.permission,
		// Draft Booster
		pickInFlight: false,
		selectedCard: undefined,
		burningCards: [],
		// Brewing (deck and sideboard should not be modified directly, have to stay in sync with their CardPool display)
		deck: [],
		sideboard: [],
		autoLand: true,
		lands: { W: 0, U: 0, B: 0, R: 0, G: 0 },
		//
		selectedCube: Constant.CubeLists.length > 0 ? Constant.CubeLists[0] : null,

		// Chat
		currentChatMessage: "",
		displayChatHistory: false,
		messagesHistory: [],
	},
	methods: {
		initialize: function() {
			let storedUserID = getCookie("userID", null);
			if (storedUserID != null) {
				this.userID = storedUserID;
				// Server will handle the reconnect attempt if draft is still ongoing
				console.log("storedUserID: " + storedUserID);
			}

			// Socket Setup
			this.socket = io({
				query: {
					userID: this.userID,
					sessionID: this.sessionID,
					userName: this.userName,
				},
			});

			this.socket.on("disconnect", function() {
				console.log("Disconnected from server.");
				Swal.fire({
					customClass: SwalCustomClasses,
					icon: "error",
					title: "Disconnected!",
					showConfirmButton: false,
				});
			});

			this.socket.on("reconnect", function(attemptNumber) {
				console.log(`Reconnected to server (attempt ${attemptNumber}).`);

				Swal.fire({
					customClass: SwalCustomClasses,
					icon: "warning",
					title: "Reconnected!",
					timer: 1500,
				});
			});

			this.socket.on("alreadyConnected", function(newID) {
				app.userID = newID;
				this.query.userID = newID;
			});

			this.socket.on("chatMessage", function(message) {
				app.messagesHistory.push(message);
				// TODO: Cleanup this?
				let bubble = document.querySelector("#chat-bubble-" + message.author);
				bubble.innerText = message.text;
				bubble.style.opacity = 1;
				if (bubble.timeoutHandler) clearTimeout(bubble.timeoutHandler);
				bubble.timeoutHandler = window.setTimeout(() => (bubble.style.opacity = 0), 5000);
			});

			this.socket.on("publicSessions", function(sessions) {
				app.publicSessions = sessions;
			});

			this.socket.on("setSession", function(sessionID) {
				app.sessionID = sessionID;
				this.query.sessionID = sessionID;
				if (app.drafting) {
					// Expelled during drafting
					app.drafting = false;
					app.draftingState = DraftState.Brewing;
				}
			});

			this.socket.on("sessionUsers", function(users) {
				for (let u of users) {
					u.pickedThisRound = false;
					u.readyState = ReadyState.DontCare;
				}

				app.sessionUsers = users;
				app.userOrder = users.map(u => u.userID);
			});

			this.socket.on("userDisconnected", function(userNames) {
				if (!app.drafting) return;

				if (app.winstonDraftState) {
					Swal.fire({
						position: "center",
						customClass: SwalCustomClasses,
						icon: "error",
						title: `Player(s) disconnected`,
						text: `Wait for ${userNames.join(", ")} to come back or...`,
						showConfirmButton: true,
						allowOutsideClick: false,
						confirmButtonText: "Stop draft",
					}).then(result => {
						if (result.value) app.socket.emit("stopDraft");
					});
				} else {
					if (app.userID == app.sessionOwner) {
						Swal.fire({
							position: "center",
							customClass: SwalCustomClasses,
							icon: "error",
							title: `Player(s) disconnected`,
							text: `Wait for ${userNames.join(", ")} to come back or...`,
							showConfirmButton: true,
							allowOutsideClick: false,
							confirmButtonText: "Replace with a bot",
						}).then(result => {
							if (result.value) app.socket.emit("replaceDisconnectedPlayers");
						});
					} else {
						Swal.fire({
							position: "center",
							customClass: SwalCustomClasses,
							icon: "error",
							title: `Player(s) disconnected`,
							text: `Wait for ${userNames.join(
								", "
							)} to come back or for the owner to replace them by a bot.`,
							showConfirmButton: false,
							allowOutsideClick: false,
						});
					}
				}
			});

			this.socket.on("updateUser", function(data) {
				let user = app.userByID[data.userID];
				if (!user) {
					if (data.userID === app.sessionOwner && data.updatedProperties.userName)
						app.sessionOwnerUsername = data.updatedProperties.userName;
					return;
				}

				for (let prop in data.updatedProperties) {
					user[prop] = data.updatedProperties[prop];
				}
			});

			this.socket.on("sessionOptions", function(sessionOptions) {
				for (let prop in sessionOptions) {
					app[prop] = sessionOptions[prop];
				}
			});
			this.socket.on("sessionOwner", function(ownerID, ownerUserName) {
				app.sessionOwner = ownerID;
				if (ownerUserName) app.sessionOwnerUsername = ownerUserName;
			});
			this.socket.on("isPublic", function(data) {
				app.isPublic = data;
			});
			this.socket.on("ignoreCollections", function(ignoreCollections) {
				app.ignoreCollections = ignoreCollections;
			});
			this.socket.on("boostersPerPlayer", function(data) {
				app.boostersPerPlayer = parseInt(data);
			});
			this.socket.on("bots", function(data) {
				app.bots = parseInt(data);
			});
			this.socket.on("setMaxPlayers", function(maxPlayers) {
				app.maxPlayers = parseInt(maxPlayers);
			});
			this.socket.on("setRestriction", function(setRestriction) {
				app.setRestriction = setRestriction;
			});
			this.socket.on("setPickTimer", function(timer) {
				app.maxTimer = timer;
			});

			this.socket.on("message", function(data) {
				if (data.title === undefined) data.title = "[Missing Title]";
				if (data.text === undefined) data.text = "";

				if (data.showConfirmButton === undefined) data.showConfirmButton = true;
				else if (!data.showConfirmButton && data.timer === undefined) data.timer = 1500;

				if (data.allowOutsideClick === undefined) data.allowOutsideClick = true;

				Swal.fire({
					position: "center",
					icon: "info",
					title: data.title,
					text: data.text,
					customClass: SwalCustomClasses,
					showConfirmButton: data.showConfirmButton,
					timer: data.timer,
					allowOutsideClick: data.allowOutsideClick,
				});
			});

			this.socket.on("readyCheck", function() {
				if (app.drafting) return;

				app.initReadyCheck();

				if (app.enableNotifications) {
					new Notification("Are you ready?", {
						body: `${app.userByID[app.sessionOwner].userName} has initiated a ready check`,
					});
				}

				const ownerUsername =
					app.sessionOwner in app.userByID
						? app.userByID[app.sessionOwner].userName
						: app.sessionOwnerUsername
						? app.sessionOwnerUsername
						: "Session owner";

				Swal.fire({
					position: "center",
					icon: "question",
					title: "Are you ready?",
					text: `${ownerUsername} has initiated a ready check`,
					customClass: SwalCustomClasses,
					showCancelButton: true,
					confirmButtonColor: "#3085d6",
					cancelButtonColor: "#d33",
					confirmButtonText: "I'm ready!",
					cancelButtonText: "Not Ready",
				}).then(result => {
					app.socket.emit("setReady", result.value ? ReadyState.Ready : ReadyState.NotReady);
				});
			});

			this.socket.on("setReady", function(userID, readyState) {
				if (!app.pendingReadyCheck) return;
				if (userID in app.userByID) app.userByID[userID].readyState = readyState;
				if (app.sessionUsers.every(u => u.readyState === ReadyState.Ready))
					app.fireToast("success", "Everybody is ready!");
			});

			this.socket.on("startWinstonDraft", function(state) {
				setCookie("userID", app.userID);
				app.drafting = true;
				app.setWinstonDraftState(state);
				app.stopReadyCheck();
				app.clearSideboard();
				app.clearDeck();
				app.playSound("start");
				Swal.fire({
					position: "center",
					icon: "success",
					title: "Starting Winston Draft!",
					customClass: SwalCustomClasses,
					showConfirmButton: false,
					timer: 1500,
				});

				if (app.enableNotifications) {
					new Notification("Now drafting!", {
						body: `Your Winston draft '${app.sessionID}' is starting!`,
					});
				}
			});
			this.socket.on("winstonDraftSync", function(winstonDraftState) {
				app.setWinstonDraftState(winstonDraftState);
			});
			this.socket.on("winstonDraftNextRound", function(currentUser) {
				if (app.userID === currentUser) {
					app.playSound("next");
					app.fireToast("success", "Your turn!");
					if (app.enableNotifications) {
						new Notification("Your turn!", {
							body: `This is your turn to pick.`,
						});
					}
					app.draftingState = DraftState.WinstonPicking;
				} else {
					app.draftingState = DraftState.WinstonWaiting;
				}
			});
			this.socket.on("winstonDraftEnd", function() {
				app.drafting = false;
				app.winstonDraftState = null;
				app.draftingState = DraftState.Brewing;
				app.fireToast("success", "Done drafting!");
			});
			this.socket.on("winstonDraftRandomCard", function(cid) {
				const c = app.genCard(cid);
				app.addToDeck(c);
				// Instantiate a card component to display in Swal (yep, I know.)
				const ComponentClass = Vue.extend(Card);
				const cardView = new ComponentClass({ parent: app, propsData: { card: c } });
				cardView.$mount();
				Swal.fire({
					position: "center",
					title: `You drew ${app.cards[cid].printed_name[app.language]} from the card pool!`,
					html: cardView.$el,
					customClass: SwalCustomClasses,
					showConfirmButton: true,
				});
			});

			this.socket.on("rejoinWinstonDraft", function(data) {
				app.drafting = true;

				app.setWinstonDraftState(data.state);
				app.clearSideboard();
				app.clearDeck();
				for (let cid of data.pickedCards) app.addToDeck(app.genCard(cid));
				// Fixme: I don't understand why this in necessary...
				app.$nextTick(() => {
					app.$refs.deckDisplay.sync();
				});

				if (app.userID === data.state.currentUser) app.draftingState = DraftState.WinstonPicking;
				else app.draftingState = DraftState.WinstonWaiting;

				Swal.fire({
					position: "center",
					icon: "success",
					title: "Reconnected to the Winston draft!",
					customClass: SwalCustomClasses,
					showConfirmButton: false,
					timer: 1500,
				});
			});

			this.socket.on("startDraft", function() {
				// Save user ID in case of disconnect
				setCookie("userID", app.userID);

				app.drafting = true;
				app.stopReadyCheck();
				app.clearSideboard();
				app.clearDeck();
				Swal.fire({
					position: "center",
					icon: "success",
					title: "Now drafting!",
					customClass: SwalCustomClasses,
					showConfirmButton: false,
					timer: 1500,
				});

				app.playSound("start");

				if (app.enableNotifications) {
					new Notification("Now drafting!", {
						body: `Your draft '${app.sessionID}' is starting!`,
					});
				}

				// Are we just an Organizer, and not a player?
				if (!app.virtualPlayers.map(u => u.userID).includes(app.userID)) {
					app.draftingState = DraftState.Watching;
				}
			});

			this.socket.on("rejoinDraft", function(data) {
				app.drafting = true;

				app.clearDeck();
				app.clearSideboard();
				for (let cid of data.pickedCards) app.addToDeck(app.genCard(cid));
				// Fixme: I don't understand why this in necessary...
				app.$nextTick(() => {
					app.$refs.deckDisplay.sync();
				});

				app.booster = [];
				for (let cid of data.booster) {
					app.booster.push(app.genCard(cid));
				}
				app.boosterNumber = data.boosterNumber;
				app.pickNumber = data.pickNumber;

				app.pickedThisRound = data.pickedThisRound;
				if (app.pickedThisRound) app.draftingState = DraftState.Waiting;
				else app.draftingState = DraftState.Picking;
				app.selectedCard = undefined;
				app.burningCards = [];

				Swal.fire({
					position: "center",
					icon: "success",
					title: "Reconnected to the draft!",
					customClass: SwalCustomClasses,
					showConfirmButton: false,
					timer: 1500,
				});
			});

			this.socket.on("nextBooster", function(data) {
				app.booster = [];
				for (let u of app.sessionUsers) {
					u.pickedThisRound = false;
				}
				app.boosterNumber = data.boosterNumber;
				app.pickNumber = data.pickNumber;

				// Only watching, not playing/receiving a boost ourself.
				if (app.draftingState == DraftState.Watching) return;

				for (let cid of data.booster) {
					app.booster.push(app.genCard(cid));
				}
				app.playSound("next");
				app.draftingState = DraftState.Picking;
			});

			this.socket.on("endDraft", function() {
				Swal.fire({
					position: "center",
					icon: "success",
					title: "Done drafting!",
					showConfirmButton: false,
					customClass: SwalCustomClasses,
					timer: 1500,
				});
				app.drafting = false;
				if (app.draftingState === DraftState.Watching) {
					app.draftingState = undefined;
				} else {
					// User was playing
					app.draftingState = DraftState.Brewing;
				}
			});

			this.socket.on("draftLog", function(draftLog) {
				if (draftLog.delayed && draftLog.delayed === true) {
					localStorage.setItem("draftLog", JSON.stringify(draftLog));
					app.draftLog = undefined;
					app.savedDraftLog = true;
				} else {
					localStorage.setItem("draftLog", JSON.stringify(draftLog));
					app.draftLog = draftLog;
				}
			});

			this.socket.on("pickAlert", function(data) {
				app.fireToast("info", `${data.userName} picked ${app.cards[data.cardID].printed_name[app.language]}!`);
			});

			this.socket.on("setCardSelection", function(data) {
				app.clearSideboard();
				app.clearDeck();
				for (let cid of data.flat()) {
					app.addToDeck(app.genCard(cid));
				}
				app.draftingState = DraftState.Brewing;
				// Hide waiting popup for sealed
				if (Swal.isVisible()) Swal.close();
			});

			this.socket.on("timer", function(data) {
				if (data.countdown == 0) app.forcePick(app.booster);
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
				if (data.countdown > 0 && data.countdown <= 5) app.playSound("countdown");
				app.pickTimer = data.countdown;
			});

			this.socket.on("disableTimer", function() {
				app.pickTimer = -1;
			});

			// Look for a locally stored collection
			let localStorageCollection = localStorage.getItem("Collection");
			if (localStorageCollection) {
				try {
					let json = JSON.parse(localStorageCollection);
					this.setCollection(json);
					console.log("Loaded collection from local storage");
				} catch (e) {
					console.error(e);
				}
			}

			// Look for a previous draftLog
			let tmpDraftLog = JSON.parse(localStorage.getItem("draftLog"));
			if (tmpDraftLog) {
				if (tmpDraftLog.delayed) this.savedDraftLog = true;
				else this.draftLog = tmpDraftLog;
			}

			let urlParamSession = getUrlVars()["session"];
			if (urlParamSession) this.sessionID = decodeURI(urlParamSession);

			for (let key in Sounds) Sounds[key].volume = 0.4;
			Sounds["countdown"].volume = 0.11;
		},
		playSound: function(key) {
			if (this.enableSound) Sounds[key].play();
		},
		// Chat Methods
		sendChatMessage: function() {
			if (!this.currentChatMessage || this.currentChatMessage == "") return;
			this.socket.emit("chatMessage", {
				author: this.userID,
				timestamp: Date.now(),
				text: this.currentChatMessage,
			});
			this.currentChatMessage = "";
		},
		// Draft Methods

		startDraft: function() {
			if (this.userID != this.sessionOwner) return;
			if (this.deck.length > 0) {
				Swal.fire({
					title: "Are you sure?",
					text: "Launching a draft will reset everyones cards/deck!",
					icon: "warning",
					showCancelButton: true,
					customClass: SwalCustomClasses,
					confirmButtonColor: "#3085d6",
					cancelButtonColor: "#d33",
					confirmButtonText: "I'm sure!",
				}).then(result => {
					if (result.value) {
						this.socket.emit("startDraft");
					}
				});
			} else {
				this.socket.emit("startDraft");
			}
		},
		stopDraft: function() {
			if (this.userID != this.sessionOwner) return;
			const self = this;
			Swal.fire({
				title: "Are you sure?",
				text: "Do you really want to stop the draft here?",
				icon: "warning",
				showCancelButton: true,
				customClass: SwalCustomClasses,
				confirmButtonColor: "#3085d6",
				cancelButtonColor: "#d33",
				confirmButtonText: "I'm sure!",
			}).then(result => {
				if (result.value) {
					self.socket.emit("stopDraft");
				}
			});
		},
		selectCard: function(e, c) {
			this.selectedCard = c;
			this.restoreCard(null, c);
		},
		burnCard: function(e, c) {
			if (this.burningCards.includes(c)) return;
			this.burningCards.push(c);
			if (this.burningCards.length > this.burnedCardsPerRound) this.burningCards.shift();
			if (e) e.stopPropagation();
		},
		restoreCard: function(e, c) {
			if (!this.burningCards.includes(c)) return;
			this.burningCards.splice(
				this.burningCards.findIndex(o => o === c),
				1
			);
			if (e) e.stopPropagation();
		},
		doubleClickCard: function(e, c) {
			this.selectCard(null, c);
			if (this.pickOnDblclick) this.pickCard();
		},
		pickCard: function() {
			if (
				this.pickInFlight || // We already send a pick request and are waiting for an anwser
				this.draftingState != DraftState.Picking ||
				!this.selectedCard ||
				this.burningCards.length > this.burnedCardsPerRound ||
				(this.burningCards.length !== this.burnedCardsPerRound &&
					this.booster.length !== this.burningCards.length + 1) // Allows for burning less cards
				// only if we're finishing the
				// booster
			)
				return;

			if (this.socket.disconnected) {
				this.disconnectedReminder();
				return;
			}
			// Give Vue one frame to react to state changes before triggering the transitions.
			this.$nextTick(() => {
				this.socket.emit(
					"pickCard",
					{
						selectedCard: this.selectedCard.id,
						burnedCards: this.burningCards.map(c => c.id),
					},
					answer => {
						this.pickInFlight = false;
						if (answer.code !== 0) alert(`pickCard: Unexpected answer: ${answer.error}`);
					}
				);
				this.draftingState = DraftState.Waiting;
				this.addToDeck(this.selectedCard);
				this.selectedCard = undefined;
				this.burningCards = [];
			});
			this.pickInFlight = true;
		},
		forcePick: function() {
			if (this.draftingState != DraftState.Picking) return;
			// Forces a random card if none is selected
			if (!this.selectedCard) {
				const randomIdx = Math.floor(Math.random() * this.booster.length);
				this.selectedCard = this.booster[randomIdx];
			}
			// Forces random cards to burn if there isn't enough selected already
			while (
				1 + this.burningCards.length < this.booster.length &&
				this.burningCards.length < this.burnedCardsPerRound
			) {
				let randomIdx;
				do randomIdx = Math.floor(Math.random() * this.booster.length);
				while (
					this.booster[randomIdx] === this.selectedCard ||
					this.burningCards.includes(this.booster[randomIdx])
				);
				this.burningCards.push(this.booster[randomIdx]);
			}
			this.pickCard();
		},
		setWinstonDraftState: function(state) {
			this.winstonDraftState = state;
			const piles = [];
			for (let p of state.piles) {
				let pile = [];
				for (let cid of p) pile.push(this.genCard(cid));
				piles.push(pile);
			}
			this.winstonDraftState.piles = piles;
		},
		startWinstonDraft: async function() {
			if (this.userID != this.sessionOwner || this.drafting) return;

			if (!this.ownerIsPlayer) {
				Swal.fire({
					icon: "error",
					title: "Owner has to play",
					text:
						"Non-playing owner is not supported in Winston Draft for now. The 'Session owner is playing' option needs to be active.",
					customClass: SwalCustomClasses,
				});
				return;
			}

			const { value: boosterCount } = await Swal.fire({
				title: "Winston Draft",
				html: `Winston Draft is a draft variant for two players, <a href="https://mtg.gamepedia.com/Winston_Draft" target="_blank">more information here</a>. How many boosters for the main stack (default is 6)?`,
				inputPlaceholder: "Booster count",
				input: "number",
				inputAttributes: {
					min: 6,
					max: 12,
					step: 1,
				},
				inputValue: 6,
				customClass: SwalCustomClasses,
				showCancelButton: true,
				confirmButtonColor: "#3085d6",
				cancelButtonColor: "#d33",
				confirmButtonText: "Start Winston Draft",
			});

			if (boosterCount) {
				this.socket.emit("startWinstonDraft", boosterCount);
			}
		},
		winstonDraftTakePile: function() {
			const cards = this.winstonDraftState.piles[this.winstonDraftState.currentPile];
			this.socket.emit("winstonDraftTakePile", answer => {
				if (answer.code === 0) {
					for (let c of cards) this.addToDeck(c);
				} else alert("Error: ", answer.error);
			});
		},
		winstonDraftSkipPile: function() {
			this.socket.emit("winstonDraftSkipPile", answer => {
				if (answer.code !== 0) alert("Error: ", answer.error);
			});
		},
		// Collection management
		setCollection: function(json) {
			if (this.collection == json) return;
			this.collection = Object.freeze(json);
			this.socket.emit("setCollection", this.collection);
		},
		parseMTGALog: function(e) {
			let file = e.target.files[0];
			if (!file) {
				return;
			}
			var reader = new FileReader();
			reader.onload = async function(e) {
				let contents = e.target.result;

				let playerIds = new Set(Array.from(contents.matchAll(/"playerId":"([^"]+)"/g)).map(e => e[1]));

				const parseCollection = function(contents, startIdx = null) {
					const rpcName = "PlayerInventory.GetPlayerCardsV3";
					try {
						const call_idx = startIdx
							? contents.lastIndexOf(rpcName, startIdx)
							: contents.lastIndexOf(rpcName);
						const collection_start = contents.indexOf("{", call_idx);
						const collection_end = contents.indexOf("}}", collection_start) + 2;
						const collStr = contents.slice(collection_start, collection_end);
						const collJson = JSON.parse(collStr)["payload"];
						// for (let c of Object.keys(collJson).filter((c) => !(c in
						// app.cards))) console.log(c, " not found.");
						return collJson;
					} catch (e) {
						Swal.fire({
							icon: "error",
							title: "Parsing Error",
							text:
								"An error occurred during parsing. Please make sure that you selected the correct file and that the detailed logs option (found in Options > View Account > Detailed Logs (Plugin Support)) is activated in game.",
							footer: "Full error: " + e,
							customClass: SwalCustomClasses,
						});
						return null;
					}
				};

				let collection = null;
				if (playerIds.size > 1) {
					const swalResult = await Swal.fire({
						icon: "question",
						title: "Multiple Accounts",
						text: `Looks like there are collections from multiple accounts (${playerIds.size}) in these logs, do you want to intersect them all, or just import the latest?`,
						customClass: SwalCustomClasses,
						showCancelButton: true,
						showConfirmButton: true,
						confirmButtonColor: "#3085d6",
						cancelButtonColor: "#d33",
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
							cardids = Object.keys(collections[i]).filter(id => cardids.includes(id));
						// Find min amount of each card
						collection = {};
						for (let id of cardids) collection[id] = collections[0][id];
						for (let i = 1; i < collections.length; ++i)
							for (let id of cardids) collection[id] = Math.min(collection[id], collections[i][id]);
					} else collection = parseCollection(contents);
				} else collection = parseCollection(contents);

				if (collection !== null) {
					localStorage.setItem("Collection", JSON.stringify(collection));
					localStorage.setItem("CollectionDate", new Date().toLocaleDateString());
					app.setCollection(collection);
					Swal.fire({
						position: "top-end",
						icon: "success",
						title: "Collection updated",
						customClass: SwalCustomClasses,
						showConfirmButton: false,
						timer: 1500,
					});
				}
			};
			reader.readAsText(file);
		},
		// Returns a Blob to be consumed by a FileReader
		uploadFile: function(e, callback, options) {
			let file = e.target.files[0];
			if (!file) {
				this.fireToast("error", "An error occured while uploading the file.");
				return;
			}
			callback(file, options);
		},
		// Returns a Blob to be consumed by a FileReader
		fetchFile: async function(url, callback, options) {
			const response = await fetch(url);
			if (!response.ok) {
				this.fireToast("error", `Could not fetch ${url}.`);
				return;
			}
			const blob = await response.blob();
			callback(blob, options);
		},
		parseCustomCardList: function(file, options) {
			Swal.fire({
				position: "center",
				customClass: SwalCustomClasses,
				icon: "info",
				title: "Parsing card list...",
				showConfirmButton: false,
			});
			var reader = new FileReader();
			reader.onload = function(e) {
				let contents = e.target.result;

				const lineRegex = /^(?:(\d+)\s+)?([^(\v\n]+)??(?:\s\((\w+)\)(?:\s+(\d+))?)?\s*$/;
				const parseLine = function(line) {
					line = line.trim();
					let [, count, name, set, number] = line.match(lineRegex);
					if (!count) count = 1;
					if (set) {
						set = set.toLowerCase();
						if (set === "dar") set = "dom";
						if (set === "conf") set = "con";
					}
					// Note: The regex currently cannot catch this case. Without
					// parenthesis, the collector number will be part of the name.
					if (number && !set) {
						Swal.fire({
							icon: "warning",
							title: `Collector number without Set`,
							text: `You should not specify a collector number without also specifying a set: '${line}'.`,
							customClass: SwalCustomClasses,
						});
					}
					let cardID = Object.keys(app.cards).find(
						id =>
							app.cards[id].name == name &&
							(!set || app.cards[id].set === set) &&
							(!number || app.cards[id].collector_number === number)
					);
					if (typeof cardID !== "undefined") {
						return [count, cardID];
					} else {
						// If not found, try doubled faced cards before giving up!
						cardID = Object.keys(app.cards).find(
							id =>
								app.cards[id].name.startsWith(name + " //") &&
								(!set || app.cards[id].set === set) &&
								(!number || app.cards[id].collector_number === number)
						);
						if (typeof cardID !== "undefined") return [count, cardID];
					}

					Swal.fire({
						icon: "error",
						title: `Card not found`,
						text: `Could not find '${name}' in our database.`,
						footer: `Full line: '${line}'`,
						customClass: SwalCustomClasses,
					});
					return [0, undefined];
				};

				try {
					const lines = contents.split(/\r\n|\n/);
					let cardList = {};
					// Custom rarity sheets
					if (lines[0].trim()[0] === "[") {
						let line = 0;
						let cardCount = 0;
						cardList = {
							customSheets: true,
							cardsPerBooster: {},
							cards: {},
						};
						let headerRegex = new RegExp(String.raw`\[([^\(\]]+)(\((\d+)\))?\]`); // Groups: SlotName, '(Count)', Count
						while (line < lines.length) {
							let header = lines[line].match(headerRegex);
							if (!header) {
								Swal.fire({
									icon: "error",
									title: `Slot`,
									text: `Error parsing slot '${lines[line]}'.`,
									customClass: SwalCustomClasses,
								});
								return;
							}
							cardList.cardsPerBooster[header[1]] = parseInt(header[3]);
							cardList.cards[header[1]] = [];
							line += 1;
							while (line < lines.length && lines[line].trim()[0] !== "[") {
								if (lines[line]) {
									let [count, cardID] = parseLine(lines[line].trim());
									if (typeof cardID !== "undefined") {
										for (let i = 0; i < count; ++i) cardList.cards[header[1]].push(cardID);
										cardCount += count;
									} else return;
								}
								line += 1;
							}
						}
						cardList.length = cardCount;
					} else {
						cardList = {
							customSheets: false,
							cards: [],
						};
						for (let line of lines) {
							if (line) {
								let [count, cardID] = parseLine(line);
								if (typeof cardID !== "undefined") {
									for (let i = 0; i < count; ++i) cardList.cards.push(cardID);
								} else return;
							}
						}
						cardList.length = cardList.cards.length;
					}
					if (options && options.name) cardList.name = options.name;
					app.customCardList = cardList;
				} catch (e) {
					Swal.fire({
						icon: "error",
						title: "Parsing Error",
						text: "An error occurred during parsing, please check you input file.",
						footer: "Full error: " + e,
						customClass: SwalCustomClasses,
					});
				}
			};
			reader.readAsText(file);
		},
		exportDeck: function() {
			copyToClipboard(this.exportMTGA(this.deck, this.sideboard, this.language, this.lands));
			this.fireToast("success", "Deck exported to clipboard!");
		},
		cardToMTGAExport: function(c, language) {
			let set = c.set.toUpperCase();
			if (set == "DOM") set = "DAR"; // DOM is called DAR in MTGA
			if (set == "CON") set = "CONF"; // CON is called CONF in MTGA
			let name = this.cards[c.id].printed_name[language];
			// FIXME: Workaround for a typo in MTGA
			if (name === "Lurrus of the Dream-Den") name = "Lurrus of the Dream Den";
			let idx = name.indexOf("//");
			// Ravnica Splits cards needs both names to be imported, others don't
			if (idx != -1 && c.set != "grn" && c.set != "rna") name = name.substr(0, idx - 1);
			return `1 ${name} (${set}) ${c.collector_number}\n`;
		},
		exportMTGA: function(deck, sideboard, language, lands) {
			let str = "Deck\n";
			for (let c of deck) str += this.cardToMTGAExport(c, language);
			if (lands) {
				for (let c in lands) if (lands[c] > 0) str += `${lands[c]} ${Constant.BasicLandNames[language][c]}\n`;
			}
			if (sideboard && sideboard.length > 0) {
				str += "\nSideboard\n";
				for (let c of sideboard) str += this.cardToMTGAExport(c, language);
				// Add some basic lands to the sideboard
				for (let c of ["W", "U", "B", "R", "G"]) str += `2 ${Constant.BasicLandNames[language][c]}\n`;
			}
			return str;
		},
		openLog: function(e) {
			let file = e.target.files[0];
			if (!file) {
				return;
			}
			var reader = new FileReader();
			reader.onload = function(e) {
				try {
					let contents = e.target.result;
					let json = JSON.parse(contents);
					if (json.users) {
						app.draftLog = json;
						app.displayedModal = "draftLog";
					} else {
						Swal.fire({
							icon: "error",
							title: "Parsing Error",
							text:
								"An error occurred during parsing. Please make sure that you selected the correct file.",
							footer: "Full error: Missing required data",
							customClass: SwalCustomClasses,
						});
					}
				} catch (e) {
					Swal.fire({
						icon: "error",
						title: "Parsing Error",
						text: "An error occurred during parsing. Please make sure that you selected the correct file.",
						footer: "Full error: " + e,
						customClass: SwalCustomClasses,
					});
				}
			};
			reader.readAsText(file);
		},
		toggleSetRestriction: function(code) {
			if (this.setRestriction.includes(code))
				this.setRestriction.splice(
					this.setRestriction.findIndex(c => c === code),
					1
				);
			else this.setRestriction.push(code);
		},
		setSessionOwner: function(newOwnerID) {
			if (this.userID != this.sessionOwner) return;
			let user = this.sessionUsers.find(u => u.userID === newOwnerID);
			if (!user) return;
			Swal.fire({
				title: "Are you sure?",
				text: `Do you want to surrender session ownership to ${user.userName}?`,
				icon: "warning",
				showCancelButton: true,
				customClass: SwalCustomClasses,
				confirmButtonColor: "#3085d6",
				cancelButtonColor: "#d33",
				confirmButtonText: "Yes",
			}).then(result => {
				if (result.value) {
					this.socket.emit("setSessionOwner", newOwnerID);
				}
			});
		},
		removePlayer: function(userID) {
			if (this.userID != this.sessionOwner) return;
			let user = this.sessionUsers.find(u => u.userID === userID);
			if (!user) return;
			Swal.fire({
				title: "Are you sure?",
				text: `Do you want to remove player '${user.userName}' from the session? They'll still be able to rejoin if they want.`,
				icon: "warning",
				showCancelButton: true,
				customClass: SwalCustomClasses,
				confirmButtonColor: "#3085d6",
				cancelButtonColor: "#d33",
				confirmButtonText: "Yes",
			}).then(result => {
				if (result.value) {
					this.socket.emit("removePlayer", userID);
				}
			});
		},
		movePlayer: function(idx, dir) {
			if (this.userID != this.sessionOwner) return;

			const negMod = (m, n) => ((m % n) + n) % n;
			let other = negMod(idx + dir, this.userOrder.length);
			[this.userOrder[idx], this.userOrder[other]] = [this.userOrder[other], this.userOrder[idx]];

			this.socket.emit("setSeating", this.userOrder);
		},
		changePlayerOrder: function() {
			if (this.userID != this.sessionOwner) return;
			this.socket.emit("setSeating", this.userOrder);
		},
		randomizeSeating: function() {
			if (this.userID != this.sessionOwner) return;
			this.socket.emit("randomizeSeating");
		},
		sealedDialog: async function() {
			if (this.userID != this.sessionOwner) return;
			const { value: boosterCount } = await Swal.fire({
				title: "Start Sealed",
				showCancelButton: true,
				text: "How many booster for each player?",
				inputPlaceholder: "Booster count",
				input: "number",
				inputAttributes: {
					min: 4,
					max: 12,
					step: 1,
				},
				inputValue: 6,
				customClass: SwalCustomClasses,
				confirmButtonColor: "#3085d6",
				cancelButtonColor: "#d33",
				confirmButtonText: "Distribute boosters",
			});

			if (boosterCount) {
				this.distributeSealed(boosterCount);
			}
		},
		distributeSealed: function(boosterCount) {
			if (this.deck.length > 0) {
				Swal.fire({
					title: "Are you sure?",
					text: "Distributing sealed boosters will reset everyone's cards/deck!",
					icon: "warning",
					showCancelButton: true,
					customClass: SwalCustomClasses,
					confirmButtonColor: "#3085d6",
					cancelButtonColor: "#d33",
					confirmButtonText: "Yes, distribute!",
				}).then(result => {
					if (result.value) {
						this.doDistributeSealed(boosterCount);
					}
				});
			} else {
				this.doDistributeSealed(boosterCount);
			}
		},
		doDistributeSealed: function(boosterCount) {
			this.socket.emit("distributeSealed", boosterCount);
		},
		joinPublicSession: function() {
			this.sessionID = this.selectedPublicSession;
		},
		readyCheck: function() {
			if (this.userID != this.sessionOwner || this.drafting) return;

			if (this.socket.disconnected) {
				this.disconnectedReminder();
				return;
			}

			this.socket.emit("readyCheck", anwser => {
				if (anwser.code === 0) {
					this.initReadyCheck();
					this.socket.emit("setReady", ReadyState.Ready);
				}
			});
		},
		initReadyCheck: function() {
			this.pendingReadyCheck = true;

			for (let u of app.sessionUsers) u.readyState = ReadyState.Unknown;

			this.playSound("readyCheck");
		},
		stopReadyCheck: function() {
			this.pendingReadyCheck = false;

			for (let u of app.sessionUsers) u.readyState = ReadyState.DontCare;
		},
		shareSavedDraftLog: function() {
			if (this.userID != this.sessionOwner) {
				Swal.fire({
					title: "You need to be the session owner to share logs.",
					icon: "error",
					customClass: SwalCustomClasses,
				});
				return;
			}
			let storedDraftLog = localStorage.getItem("draftLog");
			if (!storedDraftLog) {
				this.fireToast("error", "No saved draft log");
				this.savedDraftLog = false;
				return;
			} else {
				let parsedLogs = JSON.parse(storedDraftLog).draftLog;
				if (parsedLogs.sessionID !== this.sessionID) {
					Swal.fire({
						title: "Wrong Session ID",
						text: `Can't share logs: The session ID of your saved draft log ('${parsedLogs.sessionID}') doesn't match the id of yout current session ('${this.sessionID}').`,
						icon: "error",
						customClass: SwalCustomClasses,
					});
					return;
				}
				this.savedDraftLog = false;
				this.draftLog = parsedLogs;
				this.socket.emit("shareDraftLog", this.draftLog);
				localStorage.setItem("draftLog", JSON.stringify(this.draftLog));
				this.fireToast("success", "Shared draft log with session!");
			}
		},
		// Bracket (Server communication)
		generateBracket: function() {
			if (this.userID != this.sessionOwner) return;
			const playerNames = this.sessionUsers.map(u => u.userName);
			let players = [];
			const pairingOrder = [0, 4, 2, 6, 1, 5, 3, 7];
			for (let i = 0; i < 8; ++i) {
				if (pairingOrder[i] < playerNames.length) players[i] = playerNames[pairingOrder[i]];
				else players[i] = "";
			}
			this.socket.emit("generateBracket", players, answer => {
				if (answer.code === 0) this.displayedModal = "bracket";
			});
		},
		updateBracket: function() {
			this.socket.emit("updateBracket", this.bracket.results);
		},
		// Deck/Sideboard management
		addToDeck: function(card) {
			// Handle column sync.
			this.deck.push(card);
			this.$refs.deckDisplay.addCard(card);
		},
		addToSideboard: function(card) {
			// Handle column sync.
			this.sideboard.push(card);
			this.$refs.sideboardDisplay.addCard(card);
		},
		deckToSideboard: function(e, c) {
			// From deck to sideboard
			let idx = this.deck.indexOf(c);
			if (idx >= 0) {
				this.deck.splice(idx, 1);
				this.addToSideboard(c);
			} else return;
			this.$refs.deckDisplay.remCard(c);
		},
		sideboardToDeck: function(e, c) {
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
			app.$nextTick(() => {
				this.$refs.deckDisplay.sync();
			});
		},
		clearSideboard() {
			this.sideboard = [];
			app.$nextTick(() => {
				this.$refs.deckDisplay.sync();
			});
		},
		updateAutoLands: function() {
			if (this.autoLand) {
				if (!this.deck || this.deck.length === 0) return;

				const targetDeckSize = 40;
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
		colorsInCardPool: function(pool) {
			let r = { W: 0, U: 0, B: 0, R: 0, G: 0 };
			for (let card of pool) {
				for (let color of card.color_identity) {
					r[color] += 1;
				}
			}
			return r;
		},
		// Misc.
		fetchTranslation: function(lang) {
			if (this.loadedLanguages.includes(lang)) {
				if (this.language !== lang) this.language = lang;
				return;
			}
			if (this.loadingLanguages.includes(lang)) return;
			this.loadingLanguages.push(lang);
			fetch(`data/MTGACards.${lang}.json`).then(response =>
				response.json().then(json => this.handleTranslation(lang, json))
			);
		},
		handleTranslation: function(lang, json) {
			let merged = clone(this.cards);
			// Missing translation will default to english
			for (let c in merged) {
				merged[c]["printed_name"][lang] =
					c in json && "printed_name" in json[c] ? json[c]["printed_name"] : this.cards[c]["name"];
				merged[c]["image_uris"][lang] =
					c in json && "image_uris" in json[c] ? json[c]["image_uris"] : this.cards[c]["image_uris"]["en"];
			}
			this.cards = Object.freeze(merged);
			this.loadingLanguages.splice(lang, 1);
			this.loadedLanguages.push(lang);
			if (this.language !== lang) this.language = lang;
		},
		genCard: function(c) {
			// Takes a card id and return a unique card object (without localization information)
			if (!(c in this.cards)) {
				console.error(`Error: Card id '${c}' not found!`);
				return { id: c };
			}
			return {
				id: c,
				uniqueID: UniqueID++,
				name: this.cards[c].name,
				/*
				// printed_name and image_uris can be dynamically loaded (multiple languages), use $root.cards
				printed_name: this.cards[c].printed_name,
				image_uris: this.cards[c].image_uris,
				*/
				set: this.cards[c].set,
				rarity: this.cards[c].rarity,
				cmc: this.cards[c].cmc,
				collector_number: this.cards[c].collector_number,
				color_identity: this.cards[c].color_identity,
				in_booster: this.cards[c].in_booster,
			};
		},
		checkNotificationPermission: function(e) {
			if (e.target.checked && typeof Notification !== "undefined" && Notification.permission != "granted") {
				Notification.requestPermission().then(function(permission) {
					this.notificationPermission = permission;
					if (permission != "granted") {
						this.enableNotifications = false;
					}
				});
			}
		},
		sessionURLToClipboard: function() {
			copyToClipboard(
				`${window.location.protocol}//${window.location.hostname}:${window.location.port}/?session=${encodeURI(
					this.sessionID
				)}`
			);
			this.fireToast("success", "Session link copied to clipboard!");
		},
		fireToast: function(type, title) {
			Swal.fire({
				toast: true,
				position: "top-end",
				icon: type,
				title: title,
				customClass: SwalCustomClasses,
				showConfirmButton: false,
				timer: 2000,
			});
		},
		disconnectedReminder: function() {
			this.fireToast("error", "Disconnected from server!");
		},
	},
	computed: {
		DraftState: function() {
			return DraftState;
		},
		ReadyState: function() {
			return ReadyState;
		},
		cardsToBurnThisRound: function() {
			return Math.min(this.burnedCardsPerRound, this.booster.length - 1);
		},
		winstonCanSkipPile: function() {
			const s = this.winstonDraftState;
			return !(
				!s.remainingCards &&
				((s.currentPile === 0 && !s.piles[1].length && !s.piles[2].length) ||
					(s.currentPile === 1 && !s.piles[2].length) ||
					s.currentPile === 2)
			);
		},
		virtualPlayers: function() {
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
					r.push(this.sessionUsers.find(u => u.userID === id));
				}
			}

			return r;
		},
		displaySets: function() {
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
		hasCollection: function() {
			return !isEmpty(this.collection);
		},

		colorsInDeck: function() {
			return this.colorsInCardPool(this.deck);
		},
		totalLands: function() {
			let addedLands = 0;
			for (let c in this.lands) addedLands += this.lands[c];
			return addedLands;
		},

		userByID: function() {
			let r = {};
			for (let u of this.sessionUsers) r[u.userID] = u;
			return r;
		},
	},
	mounted: async function() {
		// Load all card informations
		fetch("data/MTGACards.json").then(function(response) {
			response.json().then(function(parsed) {
				try {
					for (let c in parsed) {
						parsed[c].id = c;
						if (!("in_booster" in parsed[c])) parsed[c].in_booster = true;
						if (!("printed_name" in parsed[c])) parsed[c].printed_name = {};
						if (!("image_uris" in parsed[c])) parsed[c].image_uris = {};
					}

					app.cards = Object.freeze(parsed); // Object.freeze so Vue doesn't make everything reactive.
					app.handleTranslation("en", DefaultLoc);
					if (!(app.language in app.loadedLanguages)) app.fetchTranslation(app.language);
					app.initialize();
				} catch (e) {
					alert(e);
				}
			});
		});

		// Load set informations
		fetch("data/SetsInfos.json").then(function(response) {
			response.json().then(function(json) {
				try {
					app.setsInfos = Object.freeze(json);
				} catch (e) {
					alert(e);
				}
			});
		});
	},
	watch: {
		sessionID: function() {
			this.socket.query.sessionID = this.sessionID;
			this.socket.emit("setSession", this.sessionID);
			history.replaceState(
				{ sessionID: this.sessionID },
				`MTGADraft Session ${this.sessionID}`,
				`?session=${this.sessionID}`
			);
			setCookie("sessionID", this.sessionID);
		},
		userName: function() {
			this.socket.query.userName = this.userName;
			this.socket.emit("setUserName", this.userName);
			setCookie("userName", this.userName);
		},
		useCollection: function() {
			this.socket.emit("useCollection", this.useCollection);
			setCookie("useCollection", this.useCollection);
		},
		// Front-end options
		language: function() {
			setCookie("language", this.language);
		},
		pickOnDblclick: function() {
			setCookie("pickOnDblclick", this.pickOnDblclick);
		},
		enableSound: function() {
			setCookie("enableSound", this.enableSound);
		},
		hideSessionID: function() {
			setCookie("hideSessionID", this.hideSessionID);
		},
		deck: function() {
			this.updateAutoLands();
		},
		autoLand: function() {
			this.updateAutoLands();
		},
		// Session options
		ownerIsPlayer: function() {
			if (this.userID != this.sessionOwner) return;
			setCookie("userID", this.userID); // Used for reconnection
			this.socket.emit("setOwnerIsPlayer", this.ownerIsPlayer);
		},
		setRestriction: function() {
			if (this.userID != this.sessionOwner) return;

			this.socket.emit("setRestriction", this.setRestriction);
		},
		isPublic: function() {
			if (this.userID != this.sessionOwner) return;
			this.socket.emit("setPublic", this.isPublic);
		},
		boostersPerPlayer: function() {
			if (this.userID != this.sessionOwner) return;
			this.socket.emit("boostersPerPlayer", this.boostersPerPlayer);
		},
		distributionMode: function() {
			if (this.userID != this.sessionOwner) return;
			this.socket.emit("setDistributionMode", this.distributionMode);
		},
		customBoosters: function() {
			if (this.userID != this.sessionOwner) return;
			this.socket.emit("setCustomBoosters", this.customBoosters);
		},
		bots: function() {
			if (this.userID != this.sessionOwner) return;
			this.socket.emit("bots", this.bots);
		},
		maxPlayers: function() {
			if (this.userID != this.sessionOwner) return;
			this.socket.emit("setMaxPlayers", this.maxPlayers);
		},
		mythicPromotion: function() {
			if (this.userID != this.sessionOwner) return;
			this.socket.emit("setMythicPromotion", this.mythicPromotion);
		},
		boosterContent: {
			deep: true,
			handler(val) {
				if (this.userID != this.sessionOwner) return;
				if (Object.values(val).reduce((acc, val) => acc + val) <= 0) {
					this.fireToast("warning", "Your boosters should contain at least one card :)");
					this.boosterContent["common"] = 1;
				} else {
					this.socket.emit("setBoosterContent", this.boosterContent);
				}
			},
		},
		maxTimer: function() {
			if (this.userID != this.sessionOwner) return;
			this.socket.emit("setPickTimer", this.maxTimer);
		},
		ignoreCollections: function() {
			if (this.userID != this.sessionOwner) return;
			this.socket.emit("ignoreCollections", this.ignoreCollections);
		},
		maxDuplicates: {
			deep: true,
			handler() {
				if (this.userID != this.sessionOwner) return;
				this.socket.emit("setMaxDuplicates", this.maxDuplicates);
			},
		},
		colorBalance: function() {
			if (this.userID != this.sessionOwner) return;
			this.socket.emit("setColorBalance", this.colorBalance);
		},
		foil: function() {
			if (this.userID != this.sessionOwner) return;
			this.socket.emit("setFoil", this.foil);
		},
		useCustomCardList: function() {
			if (this.userID != this.sessionOwner) return;
			this.socket.emit("setUseCustomCardList", this.useCustomCardList);
		},
		customCardList: function() {
			if (this.userID != this.sessionOwner || !this.customCardList.length) return;
			this.socket.emit("customCardList", this.customCardList, answer => {
				if (answer.code === 0) {
					app.fireToast("success", `Card list uploaded (${this.customCardList.length} cards)`);
				} else {
					app.fireToast("error", `Error while uploading card list: ${answer.error}`);
				}
			});
		},
		burnedCardsPerRound: function() {
			if (this.userID != this.sessionOwner) return;
			this.socket.emit("setBurnedCardsPerRound", this.burnedCardsPerRound);
		},
		draftLogRecipients: function() {
			if (this.userID != this.sessionOwner) return;
			this.socket.emit("setDraftLogRecipients", this.draftLogRecipients);
		},
		enableNotifications: function() {
			setCookie("enableNotifications", this.enableNotifications);
		},
	},
});

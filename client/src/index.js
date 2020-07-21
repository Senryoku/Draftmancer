"use strict";
import "core-js/features/string/match-all";
import io from "../../node_modules/socket.io-client/dist/socket.io.js";
import Vue from "vue";
import draggable from "vuedraggable";
import VTooltip from "v-tooltip";
import VueClazyLoad from "./vue-clazy-load.js";
import Multiselect from "vue-multiselect";
import Swal from "sweetalert2";

import Constant from "./constants.json";
import SetsInfos from "../public/data/SetsInfos.json";
import { isEmpty, randomStr4, guid, shortguid, getUrlVars, copyToClipboard } from "./helper.js";
import { getCookie, setCookie } from "./cookies.js";
import { SwalCustomClasses, fireToast } from "./alerts.js";
import { Cards, genCard, loadCards, addLanguage } from "./Cards.js";
import exportToMTGA from "./exportToMTGA.js";

import Modal from "./components/Modal.vue";
import Card from "./components/Card.vue";
import CardPlaceholder from "./components/CardPlaceholder.vue";
import BoosterCard from "./components/BoosterCard.vue";
import CardPool from "./components/CardPool.vue";
import DraftLogPick from "./components/DraftLogPick.vue";
import DraftLog from "./components/DraftLog.vue";
import DraftLogLive from "./components/DraftLogLive.vue";
import Collection from "./components/Collection.vue";
import CardList from "./components/CardList.vue";
import Bracket from "./components/Bracket.vue";
import PatchNotes from "./components/PatchNotes.vue";

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

Vue.use(VueClazyLoad);
Vue.use(VTooltip);
VTooltip.options.defaultPlacement = "bottom-start";
VTooltip.options.defaultBoundariesElement = "window";

new Vue({
	el: "#main-vue",
	components: {
		Modal,
		Card,
		CardPlaceholder,
		BoosterCard,
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
		ready: false, // Wait for initial loading

		// User Data
		userID: guid(),
		userName: getCookie("userName", `Anonymous_${randomStr4()}`),
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
		bracketLocked: false,
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
		initializeSocket: function() {
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

			this.socket.on("disconnect", () => {
				console.log("Disconnected from server.");
				Swal.fire({
					customClass: SwalCustomClasses,
					icon: "error",
					title: "Disconnected!",
					showConfirmButton: false,
				});
			});

			this.socket.on("reconnect", attemptNumber => {
				console.log(`Reconnected to server (attempt ${attemptNumber}).`);

				Swal.fire({
					customClass: SwalCustomClasses,
					icon: "warning",
					title: "Reconnected!",
					timer: 1500,
				});
			});

			this.socket.on("alreadyConnected", newID => {
				this.userID = newID;
				this.socket.query.userID = newID;
			});

			this.socket.on("chatMessage", message => {
				this.messagesHistory.push(message);
				// TODO: Cleanup this?
				let bubble = document.querySelector("#chat-bubble-" + message.author);
				bubble.innerText = message.text;
				bubble.style.opacity = 1;
				if (bubble.timeoutHandler) clearTimeout(bubble.timeoutHandler);
				bubble.timeoutHandler = window.setTimeout(() => (bubble.style.opacity = 0), 5000);
			});

			this.socket.on("publicSessions", sessions => {
				this.publicSessions = sessions;
			});

			this.socket.on("setSession", sessionID => {
				this.sessionID = sessionID;
				this.socket.query.sessionID = sessionID;
				if (this.drafting) {
					// Expelled during drafting
					this.drafting = false;
					this.draftingState = DraftState.Brewing;
				}
			});

			this.socket.on("sessionUsers", users => {
				for (let u of users) {
					u.pickedThisRound = false;
					u.readyState = ReadyState.DontCare;
				}

				this.sessionUsers = users;
				this.userOrder = users.map(u => u.userID);
			});

			this.socket.on("userDisconnected", userNames => {
				if (!this.drafting) return;

				if (this.winstonDraftState) {
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
						if (result.value) this.socket.emit("stopDraft");
					});
				} else {
					if (this.userID == this.sessionOwner) {
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
							if (result.value) this.socket.emit("replaceDisconnectedPlayers");
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

			this.socket.on("updateUser", data => {
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

			this.socket.on("sessionOptions", sessionOptions => {
				for (let prop in sessionOptions) {
					this[prop] = sessionOptions[prop];
				}
			});
			this.socket.on("sessionOwner", (ownerID, ownerUserName) => {
				this.sessionOwner = ownerID;
				if (ownerUserName) this.sessionOwnerUsername = ownerUserName;
			});
			this.socket.on("isPublic", data => {
				this.isPublic = data;
			});
			this.socket.on("ignoreCollections", ignoreCollections => {
				this.ignoreCollections = ignoreCollections;
			});
			this.socket.on("boostersPerPlayer", data => {
				this.boostersPerPlayer = parseInt(data);
			});
			this.socket.on("bots", data => {
				this.bots = parseInt(data);
			});
			this.socket.on("setMaxPlayers", maxPlayers => {
				this.maxPlayers = parseInt(maxPlayers);
			});
			this.socket.on("setRestriction", setRestriction => {
				this.setRestriction = setRestriction;
			});
			this.socket.on("setPickTimer", timer => {
				this.maxTimer = timer;
			});

			this.socket.on("message", data => {
				if (data.icon === undefined) data.icon = "info";
				if (data.title === undefined) data.title = "[Missing Title]";
				if (data.text === undefined) data.text = "";
				if (data.html === undefined) data.html = null;
				if (data.imageUrl === undefined) data.imageUrl = null;

				if (data.showConfirmButton === undefined) data.showConfirmButton = true;
				else if (!data.showConfirmButton && data.timer === undefined) data.timer = 1500;

				if (data.allowOutsideClick === undefined) data.allowOutsideClick = true;

				Swal.fire({
					position: "center",
					icon: data.icon,
					title: data.title,
					text: data.text,
					html: data.html,
					imageUrl: data.imageUrl,
					imageHeight: 300,
					customClass: SwalCustomClasses,
					showConfirmButton: data.showConfirmButton,
					timer: data.timer,
					allowOutsideClick: data.allowOutsideClick,
				});
			});

			this.socket.on("readyCheck", () => {
				if (this.drafting) return;

				this.initReadyCheck();

				if (this.enableNotifications) {
					new Notification("Are you ready?", {
						body: `${this.userByID[this.sessionOwner].userName} has initiated a ready check`,
					});
				}

				const ownerUsername =
					this.sessionOwner in this.userByID
						? this.userByID[this.sessionOwner].userName
						: this.sessionOwnerUsername
						? this.sessionOwnerUsername
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
					this.socket.emit("setReady", result.value ? ReadyState.Ready : ReadyState.NotReady);
				});
			});

			this.socket.on("setReady", (userID, readyState) => {
				if (!this.pendingReadyCheck) return;
				if (userID in this.userByID) this.userByID[userID].readyState = readyState;
				if (this.sessionUsers.every(u => u.readyState === ReadyState.Ready))
					fireToast("success", "Everybody is ready!");
			});

			this.socket.on("startWinstonDraft", state => {
				setCookie("userID", this.userID);
				this.drafting = true;
				this.setWinstonDraftState(state);
				this.stopReadyCheck();
				this.clearSideboard();
				this.clearDeck();
				this.playSound("start");
				Swal.fire({
					position: "center",
					icon: "success",
					title: "Starting Winston Draft!",
					customClass: SwalCustomClasses,
					showConfirmButton: false,
					timer: 1500,
				});

				if (this.enableNotifications) {
					new Notification("Now drafting!", {
						body: `Your Winston draft '${this.sessionID}' is starting!`,
					});
				}
			});
			this.socket.on("winstonDraftSync", winstonDraftState => {
				this.setWinstonDraftState(winstonDraftState);
			});
			this.socket.on("winstonDraftNextRound", currentUser => {
				if (this.userID === currentUser) {
					this.playSound("next");
					fireToast("success", "Your turn!");
					if (this.enableNotifications) {
						new Notification("Your turn!", {
							body: `This is your turn to pick.`,
						});
					}
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
			this.socket.on("winstonDraftRandomCard", cid => {
				const c = genCard(cid);
				this.addToDeck(c);
				// Instantiate a card component to display in Swal (yep, I know.)
				const ComponentClass = Vue.extend(Card);
				const cardView = new ComponentClass({ parent: this, propsData: { card: c } });
				cardView.$mount();
				Swal.fire({
					position: "center",
					title: `You drew ${Cards[cid].printed_name[this.language]} from the card pool!`,
					html: cardView.$el,
					customClass: SwalCustomClasses,
					showConfirmButton: true,
				});
			});

			this.socket.on("rejoinWinstonDraft", data => {
				this.drafting = true;

				this.setWinstonDraftState(data.state);
				this.clearSideboard();
				this.clearDeck();
				for (let cid of data.pickedCards) this.addToDeck(genCard(cid));
				// Fixme: I don't understand why this in necessary...
				this.$nextTick(() => {
					this.$refs.deckDisplay.sync();
				});

				if (this.userID === data.state.currentUser) this.draftingState = DraftState.WinstonPicking;
				else this.draftingState = DraftState.WinstonWaiting;

				Swal.fire({
					position: "center",
					icon: "success",
					title: "Reconnected to the Winston draft!",
					customClass: SwalCustomClasses,
					showConfirmButton: false,
					timer: 1500,
				});
			});

			this.socket.on("startDraft", () => {
				// Save user ID in case of disconnect
				setCookie("userID", this.userID);

				this.drafting = true;
				this.stopReadyCheck();
				this.clearSideboard();
				this.clearDeck();
				Swal.fire({
					position: "center",
					icon: "success",
					title: "Now drafting!",
					customClass: SwalCustomClasses,
					showConfirmButton: false,
					timer: 1500,
				});

				this.playSound("start");

				if (this.enableNotifications) {
					new Notification("Now drafting!", {
						body: `Your draft '${this.sessionID}' is starting!`,
					});
				}

				// Are we just an Organizer, and not a player?
				if (!this.virtualPlayers.map(u => u.userID).includes(this.userID)) {
					this.draftingState = DraftState.Watching;
				}
			});

			this.socket.on("rejoinDraft", data => {
				this.drafting = true;

				this.clearDeck();
				this.clearSideboard();
				for (let cid of data.pickedCards) this.addToDeck(genCard(cid));
				// Fixme: I don't understand why this in necessary... (Maybe it's not.)
				this.$nextTick(() => {
					if (typeof this.$refs.deckDisplay !== "undefined") this.$refs.deckDisplay.sync();
					if (typeof this.$refs.sideboardDisplay !== "undefined") this.$refs.sideboardDisplay.sync();
				});

				this.booster = [];
				for (let cid of data.booster) {
					this.booster.push(genCard(cid));
				}
				this.boosterNumber = data.boosterNumber;
				this.pickNumber = data.pickNumber;

				this.pickedThisRound = data.pickedThisRound;
				if (this.pickedThisRound) this.draftingState = DraftState.Waiting;
				else this.draftingState = DraftState.Picking;
				this.selectedCard = undefined;
				this.burningCards = [];

				Swal.fire({
					position: "center",
					icon: "success",
					title: "Reconnected to the draft!",
					customClass: SwalCustomClasses,
					showConfirmButton: false,
					timer: 1500,
				});
			});

			this.socket.on("nextBooster", data => {
				this.booster = [];
				for (let u of this.sessionUsers) {
					u.pickedThisRound = false;
				}
				this.boosterNumber = data.boosterNumber;
				this.pickNumber = data.pickNumber;

				// Only watching, not playing/receiving a boost ourself.
				if (this.draftingState == DraftState.Watching) return;

				for (let cid of data.booster) {
					this.booster.push(genCard(cid));
				}
				this.playSound("next");
				this.draftingState = DraftState.Picking;
			});

			this.socket.on("endDraft", () => {
				Swal.fire({
					position: "center",
					icon: "success",
					title: "Done drafting!",
					showConfirmButton: false,
					customClass: SwalCustomClasses,
					timer: 1500,
				});
				this.drafting = false;
				if (this.draftingState === DraftState.Watching) {
					this.draftingState = undefined;
				} else {
					// User was playing
					this.draftingState = DraftState.Brewing;
				}
			});

			this.socket.on("draftLog", draftLog => {
				if (draftLog.delayed && draftLog.delayed === true) {
					localStorage.setItem("draftLog", JSON.stringify(draftLog));
					this.draftLog = undefined;
					this.savedDraftLog = true;
				} else {
					localStorage.setItem("draftLog", JSON.stringify(draftLog));
					this.draftLog = draftLog;
				}
			});

			this.socket.on("pickAlert", data => {
				fireToast("info", `${data.userName} picked ${Cards[data.cardID].printed_name[this.language]}!`);
			});

			this.socket.on("setCardSelection", data => {
				this.clearSideboard();
				this.clearDeck();
				for (let cid of data.reduce((acc, val) => acc.concat(val), [])) {
					this.addToDeck(genCard(cid));
				}
				this.draftingState = DraftState.Brewing;
				// Hide waiting popup for sealed
				if (Swal.isVisible()) Swal.close();
			});

			this.socket.on("timer", data => {
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
		allowBoosterCardDrop: function(e) {
			// Allow dropping only if the dragged object is the selected card

			// A better (?) solution would be something like
			// 		let cardid = e.dataTransfer.getData("text");
			// 		if (this.selectedCard && cardid == this.selectedCard.id) {
			// but only Firefox allows to check for dataTransfer in this event (and it's against the standard)

			if (e.dataTransfer.types.includes("isboostercard")) {
				e.preventDefault();
				e.dataTransfer.dropEffect = "move";
				return false;
			}
		},
		dragBoosterCard: function(e, card) {
			e.dataTransfer.setData("isboostercard", "true"); // Workaround: See allowBoosterCardDrop
			e.dataTransfer.setData("text", card.id);
			e.dataTransfer.effectAllowed = "move";
			this.selectCard(null, card);
		},
		dropBoosterCard: function(e, options) {
			// Filter other events; Disable when we're not picking (probably useless buuuuut...)
			if (e.dataTransfer.getData("isboostercard") !== "true" || this.draftingState != DraftState.Picking) return;
			e.preventDefault();
			let cardid = e.dataTransfer.getData("text");
			if (!this.selectedCard) {
				console.error(`dropBoosterCard error: this.selectedCard === ${this.selectedCard}`);
				return;
			}
			if (cardid != this.selectedCard.id) {
				console.error(
					`dropBoosterCard error: cardid (${cardid}) != this.selectedCard.id (${this.selectedCard.id})`
				);
				return;
			} else {
				this.pickCard(options);
			}
		},
		pickCard: function(options) {
			if (
				this.pickInFlight || // We already send a pick request and are waiting for an anwser
				this.draftingState != DraftState.Picking ||
				!this.selectedCard
			)
				return;
			if (!this.validBurnedCardCount) {
				fireToast(
					"error",
					`You need to burn ${this.cardsToBurnThisRound - this.burningCards.length} more card(s).`
				);
				return;
			}

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
				if (options && options.toSideboard) this.addToSideboard(this.selectedCard);
				else this.addToDeck(this.selectedCard);
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
				for (let cid of p) pile.push(genCard(cid));
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
			reader.onload = async e => {
				let contents = e.target.result;

				// Propose to use MTGA user name
				let nameFromLogs = getCookie("nameFromLogs", "");
				if (nameFromLogs === "") {
					let m = contents.match(/DisplayName:(.+)#(\d+)/);
					if (m) {
						let name = `${m[1]}#${m[2]}`;
						if (name != this.userName) {
							const swalResult = await Swal.fire({
								icon: "question",
								title: "User Name",
								text: `Found display name '${name}', do you want to use it as your User Name?`,
								customClass: SwalCustomClasses,
								showCancelButton: true,
								showConfirmButton: true,
								confirmButtonColor: "#3085d6",
								cancelButtonColor: "#d33",
								confirmButtonText: "Yes",
								cancelButtonText: "No",
							});
							if (swalResult.value) {
								this.userName = name;
								setCookie("nameFromLogs", "done");
							} else {
								setCookie("nameFromLogs", "refused");
							}
						}
					}
				}

				// Specific error message when detailed logs are disabled in MTGA
				if (
					contents.indexOf("DETAILED LOGS: DISABLED") !== -1 &&
					contents.indexOf("DETAILED LOGS: ENABLED") === -1
				) {
					Swal.fire({
						icon: "error",
						title: "Detailed logs disabled",
						text:
							"Looks like a valid Player.log file but Detailed Logs have to be manually enabled in MTGA. Enable it in Options > View Account > Detailed Logs (Plugin Support) and restart MTGA.",
						customClass: SwalCustomClasses,
					});
					return null;
				}

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
						// Cards))) console.log(c, " not found.");
						return collJson;
					} catch (e) {
						Swal.fire({
							icon: "error",
							title: "Parsing Error",
							text:
								"An error occurred during parsing. Please make sure that you selected the correct file (C:\\Users\\%username%\\AppData\\LocalLow\\Wizards Of The Coast\\MTGA\\Player.log).",
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
					this.setCollection(collection);
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
				fireToast("error", "An error occured while uploading the file.");
				return;
			}
			callback(file, options);
		},
		// Returns a Blob to be consumed by a FileReader
		fetchFile: async function(url, callback, options) {
			const response = await fetch(url);
			if (!response.ok) {
				fireToast("error", `Could not fetch ${url}.`);
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
			reader.onload = e => {
				let contents = e.target.result;

				const lineRegex = /^(?:(\d+)\s+)?([^(\v\n]+)??(?:\s\((\w+)\)(?:\s+(\d+))?)?\s*$/;
				const parseLine = line => {
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
					let cardID = Object.keys(Cards).find(
						id =>
							Cards[id].name == name &&
							(!set || Cards[id].set === set) &&
							(!number || Cards[id].collector_number === number)
					);
					if (typeof cardID !== "undefined") {
						return [count, cardID];
					} else {
						// If not found, try doubled faced cards before giving up!
						cardID = Object.keys(Cards).find(
							id =>
								Cards[id].name.startsWith(name + " //") &&
								(!set || Cards[id].set === set) &&
								(!number || Cards[id].collector_number === number)
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
					this.customCardList = cardList;
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
		exportDeck: function(full = true) {
			copyToClipboard(exportToMTGA(this.deck, this.sideboard, this.language, this.lands, full));
			fireToast("success", "Deck exported to clipboard!");
		},
		openLog: function(e) {
			let file = e.target.files[0];
			if (!file) {
				return;
			}
			var reader = new FileReader();
			reader.onload = e => {
				try {
					let contents = e.target.result;
					let json = JSON.parse(contents);
					if (json.users) {
						this.draftLog = json;
						this.displayedModal = "draftLog";
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
				this.deckWarning(this.distributeSealed, boosterCount);
			}
		},
		deckWarning: function(call, options) {
			if (this.deck.length > 0) {
				Swal.fire({
					title: "Are you sure?",
					text: "Lauching another game will reset everyone's cards/deck!",
					icon: "warning",
					showCancelButton: true,
					customClass: SwalCustomClasses,
					confirmButtonColor: "#3085d6",
					cancelButtonColor: "#d33",
					confirmButtonText: "Yes, play!",
				}).then(result => {
					if (result.value) {
						call(options);
					}
				});
			} else {
				call(options);
			}
		},
		distributeSealed: function(boosterCount) {
			if (this.userID != this.sessionOwner) return;
			this.socket.emit("distributeSealed", boosterCount);
		},
		distributeJumpstart: function() {
			if (this.userID != this.sessionOwner) return;
			this.socket.emit("distributeJumpstart");
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

			for (let u of this.sessionUsers) u.readyState = ReadyState.Unknown;

			this.playSound("readyCheck");
		},
		stopReadyCheck: function() {
			this.pendingReadyCheck = false;

			for (let u of this.sessionUsers) u.readyState = ReadyState.DontCare;
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
				fireToast("error", "No saved draft log");
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
				fireToast("success", "Shared draft log with session!");
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
		generateSwissBracket: function() {
			if (this.userID != this.sessionOwner) return;
			const playerNames = this.sessionUsers.map(u => u.userName);
			let players = [];
			const pairingOrder = [0, 4, 2, 6, 1, 5, 3, 7];
			for (let i = 0; i < 8; ++i) {
				if (pairingOrder[i] < playerNames.length) players[i] = playerNames[pairingOrder[i]];
				else players[i] = "";
			}
			this.socket.emit("generateSwissBracket", players, answer => {
				if (answer.code === 0) this.displayedModal = "bracket";
			});
		},
		updateBracket: function() {
			if (this.userID != this.sessionOwner && this.bracketLocked) return;
			this.socket.emit("updateBracket", this.bracket.results);
		},
		lockBracket: function(val) {
			if (this.userID != this.sessionOwner) return;
			this.bracketLocked = val;
			this.socket.emit("lockBracket", this.bracketLocked);
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

			this.loadingLanguages.push(lang);
			fetch(`data/MTGACards.${lang}.json`).then(response =>
				response.json().then(json => this.handleTranslation(lang, json))
			);
		},
		handleTranslation: function(lang, json) {
			addLanguage(lang, json);
			this.loadingLanguages.splice(lang, 1);
			this.loadedLanguages.push(lang);
			if (this.language !== lang) this.language = lang;
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
				`${window.location.protocol}//${window.location.hostname}${
					window.location.port ? ":" + window.location.port : ""
				}/?session=${encodeURI(this.sessionID)}`
			);
			fireToast("success", "Session link copied to clipboard!");
		},
		disconnectedReminder: function() {
			fireToast("error", "Disconnected from server!");
		},
		logPathToClipboard: function() {
			copyToClipboard(`C:\\Users\\%username%\\AppData\\LocalLow\\Wizards Of The Coast\\MTGA\\Player.log`);
			fireToast("success", "Default log path copied to clipboard!");
		},
	},
	computed: {
		DraftState: function() {
			return DraftState;
		},
		ReadyState: function() {
			return ReadyState;
		},
		validBurnedCardCount: function() {
			// Allows for burning less cards only if we're finishing the booster
			return (
				this.burningCards.length <= this.burnedCardsPerRound &&
				(this.burningCards.length === this.burnedCardsPerRound ||
					this.booster.length === this.burningCards.length + 1)
			);
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
		try {
			let urlParamSession = getUrlVars()["session"];
			if (urlParamSession) this.sessionID = decodeURI(urlParamSession);

			await loadCards();

			// Always load English as it's used as a backup
			const DefaultLoc = (await import("../public/data/MTGACards.en.json")).default;
			this.handleTranslation("en", DefaultLoc);
			if (!(this.language in this.loadedLanguages)) this.fetchTranslation(this.language);

			// Load set informations
			this.setsInfos = Object.freeze(SetsInfos);

			// Now that we have all the essential data, initialize the websocket.
			this.initializeSocket();

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

			for (let key in Sounds) Sounds[key].volume = 0.4;
			Sounds["countdown"].volume = 0.11;

			this.ready = true;
		} catch (e) {
			alert(e);
		}
	},
	watch: {
		sessionID: function() {
			if (this.socket) {
				this.socket.query.sessionID = this.sessionID;
				this.socket.emit("setSession", this.sessionID);
			}
			history.replaceState(
				{ sessionID: this.sessionID },
				`MTGADraft Session ${this.sessionID}`,
				`?session=${this.sessionID}`
			);
			setCookie("sessionID", this.sessionID);
		},
		userName: function() {
			if (this.socket) {
				this.socket.query.userName = this.userName;
				this.socket.emit("setUserName", this.userName);
			}
			setCookie("userName", this.userName);
		},
		useCollection: function() {
			if (this.socket) this.socket.emit("useCollection", this.useCollection);
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
			if (this.userID != this.sessionOwner || !this.socket) return;
			setCookie("userID", this.userID); // Used for reconnection
			this.socket.emit("setOwnerIsPlayer", this.ownerIsPlayer);
		},
		setRestriction: function() {
			if (this.userID != this.sessionOwner || !this.socket) return;

			this.socket.emit("setRestriction", this.setRestriction);
		},
		isPublic: function() {
			if (this.userID != this.sessionOwner || !this.socket) return;
			this.socket.emit("setPublic", this.isPublic);
		},
		boostersPerPlayer: function() {
			if (this.userID != this.sessionOwner || !this.socket) return;
			this.socket.emit("boostersPerPlayer", this.boostersPerPlayer);
		},
		distributionMode: function() {
			if (this.userID != this.sessionOwner || !this.socket) return;
			this.socket.emit("setDistributionMode", this.distributionMode);
		},
		customBoosters: function() {
			if (this.userID != this.sessionOwner || !this.socket) return;
			this.socket.emit("setCustomBoosters", this.customBoosters);
		},
		bots: function() {
			if (this.userID != this.sessionOwner || !this.socket) return;
			this.socket.emit("bots", this.bots);
		},
		maxPlayers: function() {
			if (this.userID != this.sessionOwner || !this.socket) return;
			this.socket.emit("setMaxPlayers", this.maxPlayers);
		},
		mythicPromotion: function() {
			if (this.userID != this.sessionOwner || !this.socket) return;
			this.socket.emit("setMythicPromotion", this.mythicPromotion);
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
		maxTimer: function() {
			if (this.userID != this.sessionOwner || !this.socket) return;
			this.socket.emit("setPickTimer", this.maxTimer);
		},
		ignoreCollections: function() {
			if (this.userID != this.sessionOwner || !this.socket) return;
			this.socket.emit("ignoreCollections", this.ignoreCollections);
		},
		maxDuplicates: {
			deep: true,
			handler() {
				if (this.userID != this.sessionOwner || !this.socket) return;
				this.socket.emit("setMaxDuplicates", this.maxDuplicates);
			},
		},
		colorBalance: function() {
			if (this.userID != this.sessionOwner || !this.socket) return;
			this.socket.emit("setColorBalance", this.colorBalance);
		},
		foil: function() {
			if (this.userID != this.sessionOwner || !this.socket) return;
			this.socket.emit("setFoil", this.foil);
		},
		useCustomCardList: function() {
			if (this.userID != this.sessionOwner || !this.socket) return;
			this.socket.emit("setUseCustomCardList", this.useCustomCardList);
		},
		customCardList: function() {
			if (this.userID != this.sessionOwner || !this.customCardList.length || !this.socket) return;
			this.socket.emit("customCardList", this.customCardList, answer => {
				if (answer.code === 0) {
					fireToast("success", `Card list uploaded (${this.customCardList.length} cards)`);
				} else {
					fireToast("error", `Error while uploading card list: ${answer.error}`);
				}
			});
		},
		burnedCardsPerRound: function() {
			if (this.userID != this.sessionOwner || !this.socket) return;
			this.socket.emit("setBurnedCardsPerRound", this.burnedCardsPerRound);
		},
		draftLogRecipients: function() {
			if (this.userID != this.sessionOwner || !this.socket) return;
			this.socket.emit("setDraftLogRecipients", this.draftLogRecipients);
		},
		enableNotifications: function() {
			setCookie("enableNotifications", this.enableNotifications);
		},
	},
});

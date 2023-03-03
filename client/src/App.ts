"use strict";
import { ClientToServerEvents, ServerToClientEvents } from "../../src/SocketType";
import { SessionID, UserID } from "../../src/IDTypes";
import { SetCode, IIndexable } from "../../src/Types";
import {
	DisconnectedUser,
	DistributionMode,
	DraftLogRecipients,
	ReadyState,
	UserData,
	UsersData,
} from "../../src/Session/SessionTypes";
import { ArenaID, Card, CardColor, CardID, PlainCollection, UniqueCard, UniqueCardID } from "../../src/CardTypes";
import { DraftLog } from "../../src/DraftLog";
import { BotScores } from "../../src/Bot";
import { WinstonDraftSyncData } from "../../src/WinstonDraft";
import { GridDraftSyncData } from "../../src/GridDraft";
import { minesweeperApplyDiff, MinesweeperSyncData } from "../../src/MinesweeperDraftTypes";
import { RochesterDraftSyncData } from "../../src/RochesterDraft";
import { RotisserieDraftStartOptions, RotisserieDraftSyncData } from "../../src/RotisserieDraft";
import { TeamSealedSyncData } from "../../src/TeamSealed";
import { Bracket } from "../../src/Brackets";
import { SocketAck } from "../../src/Message";
import Constants, { CubeDescription } from "../../src/Constants";
import { Options } from "../../src/utils";
import { JHHBooster } from "../../src/JumpstartHistoricHorizons";
import { CustomCardList } from "../../src/CustomCardList";
import SessionsSettingsProps from "../../src/Session/SessionProps";

import io, { Socket } from "socket.io-client";
import Vue, { defineComponent } from "vue";
import draggable from "vuedraggable";
import { Multiselect } from "vue-multiselect";
import Swal, { SweetAlertIcon, SweetAlertOptions, SweetAlertResult } from "sweetalert2";

import SetsInfos, { SetInfo } from "./SetInfos";
import { isEmpty, randomStr4, guid, shortguid, getUrlVars, copyToClipboard, escapeHTML } from "./helper";
import { getCookie, setCookie } from "./cookies";
import { ButtonColor, Alert, fireToast } from "./alerts";
import parseCSV from "./parseCSV";

import BoosterCard from "./components/BoosterCard.vue";
import CardComponent from "./components/Card.vue";
import CardPlaceholder from "./components/CardPlaceholder.vue";
import CardPool from "./components/CardPool.vue";
import CardPopup from "./components/CardPopup.vue";
import DelayedInput from "./components/DelayedInput.vue";
import Dropdown from "./components/Dropdown.vue";
import ExportDropdown from "./components/ExportDropdown.vue";
import Modal from "./components/Modal.vue";
import SealedDialog from "./components/SealedDialog.vue";
import ScaleSlider from "./components/ScaleSlider.vue";
import RotisserieDraftDialog from "./components/RotisserieDraftDialog.vue";

// Preload Carback
import CardBack from /* webpackPrefetch: true */ "./assets/img/cardback.webp";
const img = new Image();
img.src = CardBack;

const DraftState = {
	None: "None",
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
	RotisserieDraft: "RotisserieDraft",
	MinesweeperPicking: "MinesweeperPicking",
	MinesweeperWaiting: "MinesweeperWaiting",
	TeamSealed: "TeamSealed",
};

enum PassingOrder {
	None,
	Left,
	Right,
	Repeat,
}

const Sounds: { [name: string]: HTMLAudioElement } = {
	start: new Audio("sound/drop_003.ogg"),
	next: new Audio("sound/next.mp3"),
	countdown: new Audio("sound/click_001.ogg"),
	readyCheck: new Audio("sound/drop_003.ogg"),
};

const localStorageSettingsKey = "mtgadraft-settings";
const localStorageSessionSettingsKey = "mtgadraft-session-settings";

// Personal front-end settings
const defaultSettings = {
	targetDeckSize: 40,
	hideSessionID: false,
	displayCollectionStatus: true,
	displayBotScores: false,
	fixedDeck: false,
	pickOnDblclick: true,
	enableSound: true,
	enableNotifications: false,
	collapseSideboard: window.innerWidth > 1200,
	sideboardBasics: 0,
	preferredBasics: "",
	boosterCardScale: 1,
};
const storedSettings = JSON.parse(localStorage.getItem(localStorageSettingsKey) ?? "{}");
const initialSettings = Object.assign(defaultSettings, storedSettings);

export default defineComponent({
	components: {
		BoosterCard,
		Bracket: () => import("./components/Bracket.vue"),
		Card: CardComponent,
		CardList: () => import("./components/CardList.vue"),
		CardPlaceholder,
		CardPool,
		CardPopup,
		CardStats: () => import("./components/CardStats.vue"),
		Collection: () => import("./components/Collection.vue"),
		CollectionImportHelp: () => import("./components/CollectionImportHelp.vue"),
		DelayedInput,
		DraftLog: () => import("./components/DraftLog.vue"),
		DraftLogHistory: () => import("./components/DraftLogHistory.vue"),
		DraftLogLive: () => import("./components/DraftLogLive.vue"),
		DraftLogPick: () => import("./components/DraftLogPick.vue"),
		Dropdown,
		ExportDropdown,
		GridDraft: () => import("./components/GridDraft.vue"),
		RotisserieDraft: () => import("./components/RotisserieDraft.vue"),
		MinesweeperDraft: () => import("./components/MinesweeperDraft.vue"),
		TeamSealed: () => import("./components/TeamSealed.vue"),
		LandControl: () => import("./components/LandControl.vue"),
		Modal,
		Multiselect,
		PatchNotes: () => import("./components/PatchNotes.vue"),
		PickSummary: () => import("./components/PickSummary.vue"),
		ScaleSlider,
		SetRestriction: () => import("./components/SetRestriction.vue"),
		draggable,
	},
	data: () => {
		let userID: UserID = guid();
		let storedUserID = getCookie("userID");
		if (storedUserID !== "") {
			userID = storedUserID;
			// Server will handle the reconnect attempt if draft is still ongoing
			console.log("storedUserID: " + storedUserID);
		}

		let urlParamSession = getUrlVars()["session"];
		const sessionID: SessionID = urlParamSession
			? decodeURIComponent(urlParamSession)
			: getCookie("sessionID", shortguid());

		const userName = getCookie("userName", `Player_${randomStr4()}`);

		const storedSessionSettings = localStorage.getItem(localStorageSessionSettingsKey) ?? "{}";

		// Socket Setup
		const socket: Socket<ServerToClientEvents, ClientToServerEvents> = io({
			query: {
				userID: userID,
				sessionID: sessionID,
				userName: userName,
				sessionSettings: storedSessionSettings,
			},
		});

		return {
			ready: false, // Wait for initial loading

			// User Data
			userID: userID,
			userName: userName,
			useCollection: true,
			collection: {} as PlainCollection,
			collectionInfos: {
				wildcards: { common: 0, uncommon: 0, rare: 0, mythic: 0 },
				vaultProgress: 0,
			},
			socket: socket,

			// Session status
			sessionID: sessionID,
			sessionOwner: userID as UserID,
			sessionOwnerUsername: userName as string,
			sessionUsers: [] as {
				userID: string;
				userName: string;
				collection: boolean;
				useCollection: boolean;
				readyState: ReadyState;
			}[],
			disconnectedUsers: {} as { [uid: UserID]: DisconnectedUser },
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
			distributionMode: "regular" as DistributionMode,
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
			maxDuplicates: null as { common: number; uncommon: number; rare: number; mythic: number } | null,
			foil: false,
			bots: 0,
			setRestriction: [] as SetCode[],
			drafting: false,
			useCustomCardList: false,
			customCardListWithReplacement: false,
			customCardList: {} as CustomCardList,
			doubleMastersMode: false,
			pickedCardsPerRound: 1,
			burnedCardsPerRound: 0,
			discardRemainingCardsAt: 0,
			maxTimer: 75,
			pickTimer: 75,
			personalLogs: true,
			draftLogRecipients: "everyone" as DraftLogRecipients,
			bracketLocked: false,
			//
			draftLogs: [] as DraftLog[],
			currentDraftLog: null as DraftLog | null,
			draftLogLive: null as DraftLog | null,
			bracket: null as Bracket | null,
			virtualPlayersData: null as UsersData | null,
			booster: [] as UniqueCard[],
			boosterNumber: 0,
			pickNumber: 0,
			botScores: null as BotScores | null,
			winstonDraftState: null as WinstonDraftSyncData | null,
			gridDraftState: null as GridDraftSyncData | null,
			rochesterDraftState: null as RochesterDraftSyncData | null,
			rotisserieDraftState: null as RotisserieDraftSyncData | null,
			minesweeperDraftState: null as MinesweeperSyncData | null,
			teamSealedState: null as TeamSealedSyncData | null,
			draftPaused: false,

			publicSessions: [] as {
				id: string;
				description: string;
				players: number;
				maxPlayers: number;
				cube: boolean;
				sets: string[];
			}[],

			// Front-end options & data
			displayedModal: null as string | null,
			userOrder: [] as UserID[],
			hideSessionID: initialSettings.hideSessionID,
			languages: Constants.Languages,
			language: getCookie("language", "en"),
			displayCollectionStatus: defaultSettings.displayCollectionStatus,
			sets: Constants.MTGASets,
			primarySets: Constants.PrimarySets,
			cubeLists: Constants.CubeLists,
			pendingReadyCheck: false,
			setsInfos: SetsInfos,
			draftingState: DraftState.None,
			displayBotScores: defaultSettings.displayBotScores,
			fixedDeck: defaultSettings.fixedDeck,

			fixedDeckState: {
				ht: 400,
				mainHeight: "100vh", // Applied in the template as an inlined style
				y: 0,
				dy: 0,
			},
			pickOnDblclick: defaultSettings.pickOnDblclick,
			boosterCardScale: defaultSettings.boosterCardScale,
			enableSound: defaultSettings.enableSound,
			enableNotifications:
				typeof Notification !== "undefined" &&
				Notification &&
				Notification.permission == "granted" &&
				defaultSettings.enableNotifications,
			notificationPermission: typeof Notification !== "undefined" && Notification && Notification.permission,
			titleNotification: null as { timeout: ReturnType<typeof setTimeout>; message: string } | null,
			// Draft Booster
			pickInFlight: false,
			selectedCards: [] as UniqueCard[],
			burningCards: [] as UniqueCard[],
			// Brewing (deck and sideboard should not be modified directly, have to
			// stay in sync with their CardPool display)
			deck: [] as UniqueCard[],
			sideboard: [] as UniqueCard[],
			deckFilter: "",
			collapseSideboard: defaultSettings.collapseSideboard,
			autoLand: true,
			lands: { W: 0, U: 0, B: 0, R: 0, G: 0 } as { [c in CardColor]: number },
			targetDeckSize: initialSettings.targetDeckSize,
			sideboardBasics: initialSettings.sideboardBasics,
			preferredBasics: initialSettings.preferredBasics,
			//
			selectedCube: Constants.CubeLists[0],

			// Used to debounce calls to doStoreDraftLogs
			storeDraftLogsTimeout: null as ReturnType<typeof setTimeout> | null,

			// Chat
			currentChatMessage: "",
			displayChatHistory: false,
			messagesHistory: [] as {
				author: string;
				text: string;
				timestamp: number;
			}[],
		};
	},
	methods: {
		initializeSocket() {
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
				this.socket.io.opts.query!.userID = newID;
				fireToast("warning", "Duplicate UserID: A new UserID as been affected to this instance.");
			});

			this.socket.on("stillAlive", (ack) => {
				if (ack) ack();
			});

			this.socket.on("chatMessage", (message) => {
				this.messagesHistory.push(message);
				// TODO: Cleanup this?
				const bubbleEl = document.querySelector("#chat-bubble-" + message.author);
				if (bubbleEl) {
					const bubble = bubbleEl as HTMLElement;
					bubble.innerText = message.text;
					bubble.style.opacity = "1";
					if ((bubble as any).timeoutHandler) clearTimeout((bubble as any).timeoutHandler);
					(bubble as any).timeoutHandler = window.setTimeout(() => (bubble.style.opacity = "0"), 5000);
				}
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
				this.socket.io.opts.query!.sessionID = sessionID;
				if (this.drafting) {
					// Expelled during drafting
					this.drafting = false;
					this.draftingState = DraftState.Brewing;
				}
			});

			this.socket.on("sessionUsers", (users) => {
				this.sessionUsers = users.map((u) => {
					return { ...u, readyState: ReadyState.DontCare };
				});
				this.userOrder = users.map((u) => u.userID);
			});

			this.socket.on("userDisconnected", (data) => {
				if (!this.drafting) return;
				this.sessionOwner = data.owner;
				this.disconnectedUsers = data.disconnectedUsers;
			});

			this.socket.on("resumeOnReconnection", (msg) => {
				this.disconnectedUsers = {};
				fireToast("success", msg.title, msg.text);
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
				// FIXME: Use accurate key type once we have it.
				for (let prop in sessionOptions)
					(this as IIndexable)[prop as keyof typeof SessionsSettingsProps] = sessionOptions[prop];
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
			this.socket.on("setMaxPlayers", (maxPlayers) => {
				this.maxPlayers = maxPlayers;
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

				const toast = !!data.toast;
				if (toast) {
					fireToast(data.icon as SweetAlertIcon, data.title, data.text);
					return;
				}

				if (data.showConfirmButton === undefined) data.showConfirmButton = true;
				else if (!data.showConfirmButton && data.timer === undefined) data.timer = 1500;

				if (data.allowOutsideClick === undefined) data.allowOutsideClick = true;

				Alert.fire({
					position: "center",
					toast: !!data.toast,
					icon: data.icon as SweetAlertIcon,
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
					this.sessionOwner! in this.userByID
						? this.userByID[this.sessionOwner!].userName
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
				const ComponentClass = Vue.extend(CardComponent);
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
				this.$refs.deckDisplay?.sync();
				this.$refs.sideboardDisplay?.sync();
				this.$nextTick(() => {
					for (let c of data.pickedCards.main) this.addToDeck(c);
					for (let c of data.pickedCards.side) this.addToSideboard(c);

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
				if (this.gridDraftState?.currentPlayer === null) {
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
					this.gridDraftState?.currentPlayer === null ? 2500 : 0
				);
			});

			this.socket.on("rejoinGridDraft", (data) => {
				this.drafting = true;

				this.setGridDraftState(data.state);
				this.clearState();
				this.$refs.deckDisplay?.sync();
				this.$refs.sideboardDisplay?.sync();
				this.$nextTick(() => {
					for (let c of data.pickedCards.main) this.addToDeck(c);
					for (let c of data.pickedCards.side) this.addToSideboard(c);

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
				this.$refs.deckDisplay?.sync();
				this.$refs.sideboardDisplay?.sync();
				this.$nextTick(() => {
					for (let c of data.pickedCards.main) this.addToDeck(c);
					for (let c of data.pickedCards.side) this.addToSideboard(c);

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

			// Rotisserie Draft
			this.socket.on("startRotisserieDraft", (state) => {
				startDraftSetup("Rotisserie draft");
				this.draftingState = DraftState.RotisserieDraft;
				this.rotisserieDraftState = state;
			});
			this.socket.on("rotisserieDraftUpdateState", (uniqueCardID, newOwnerID, currentPlayer) => {
				if (!this.rotisserieDraftState) return;
				this.rotisserieDraftState.currentPlayer = currentPlayer;
				++this.rotisserieDraftState.pickNumber;

				const card = this.rotisserieDraftState.cards.find((c) => c.uniqueID === uniqueCardID);
				if (!card) return;
				card.owner = newOwnerID;

				if (this.userID === this.rotisserieDraftState.currentPlayer) {
					this.playSound("next");
					fireToast("success", "Your turn!");
					this.pushNotification("Your turn!", {
						body: `This is your turn to pick.`,
					});
				}
			});
			this.socket.on("rotisserieDraftEnd", () => {
				this.drafting = false;
				this.rotisserieDraftState = null;
				this.draftingState = DraftState.Brewing;
				fireToast("success", "Done drafting!");
			});

			this.socket.on("rejoinRotisserieDraft", (data) => {
				this.clearState();
				this.drafting = true;
				this.draftingState = DraftState.RotisserieDraft;
				this.$refs.deckDisplay?.sync();
				this.$refs.sideboardDisplay?.sync();
				this.$nextTick(() => {
					for (let c of data.pickedCards.main) this.addToDeck(c);
					for (let c of data.pickedCards.side) this.addToSideboard(c);

					this.rotisserieDraftState = data.state;

					Alert.fire({
						position: "center",
						icon: "success",
						title: "Reconnected to the Rotisserie draft!",
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
			this.socket.on("minesweeperDraftUpdateState", (diff) => {
				if (!this.minesweeperDraftState) return;
				minesweeperApplyDiff(this.minesweeperDraftState, diff);
				this.onMinesweeperStateUpdate();
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
				this.$refs.deckDisplay?.sync();
				this.$refs.sideboardDisplay?.sync();
				this.$nextTick(() => {
					for (let c of data.pickedCards.main) this.addToDeck(c);
					for (let c of data.pickedCards.side) this.addToSideboard(c);

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

			this.socket.on("startTeamSealed", (data) => {
				this.drafting = true;

				startDraftSetup("team sealed", "Team Sealed started!");
				this.teamSealedState = data.state;
				this.draftingState = DraftState.TeamSealed;
			});

			this.socket.on("rejoinTeamSealed", (data) => {
				this.drafting = true;

				startDraftSetup("team sealed", "Rejoined Team Sealed!");
				this.teamSealedState = data.state;
				this.draftingState = DraftState.TeamSealed;

				this.$refs.deckDisplay?.sync();
				this.$refs.sideboardDisplay?.sync();
				this.$nextTick(() => {
					for (let c of data.pickedCards.main) this.addToDeck(c);
					for (let c of data.pickedCards.side) this.addToSideboard(c);
				});
			});

			this.socket.on("startTeamSealedSpectator", () => {
				this.drafting = true;
				this.draftingState = DraftState.Watching;
			});

			this.socket.on("endTeamSealed", () => {
				fireToast("success", "Team Sealed stopped!");
				this.drafting = false;
				this.draftPaused = false;
				if (this.draftingState === DraftState.Watching) {
					// As player list will be reverting to its non-drafting state, click events used to select player have to be re-registered.
					this.$nextTick(() => {
						this.$refs.draftloglive?.registerPlayerSelectEvents();
					});
				} else this.draftingState = DraftState.Brewing;
			});

			this.socket.on("teamSealedUpdateCard", (cardUniqueID, newOwnerID) => {
				if (!this.drafting || this.draftingState !== DraftState.TeamSealed || !this.teamSealedState) return;

				const card = this.teamSealedState.cards.find((c) => c.uniqueID === cardUniqueID);
				if (!card) return;
				if (card.owner === this.userID) {
					this.deck = this.deck.filter((c) => c.uniqueID !== cardUniqueID);
					this.sideboard = this.sideboard.filter((c) => c.uniqueID !== cardUniqueID);
				}
				if (newOwnerID === this.userID) {
					this.addToDeck(card);
				}
				card.owner = newOwnerID;
				this.$nextTick(() => {
					this.$refs.deckDisplay?.sync();
					this.$refs.sideboardDisplay?.sync();
				});
			});

			const startDraftSetup = (name = "draft", msg = "Draft Started!") => {
				// Save user ID in case of disconnect
				setCookie("userID", this.userID);

				this.drafting = true;
				this.stopReadyCheck();
				this.clearState();
				Alert.fire({
					position: "center",
					icon: "success",
					title: msg,
					showConfirmButton: false,
					timer: 1500,
				});

				this.playSound("start");

				this.pushNotification(msg, {
					body: `Your ${name} '${this.sessionID}' is starting!`,
				});
				this.pushTitleNotification("🏁");
			};

			// Standard Draft
			this.socket.on("startDraft", (virtualPlayersData) => {
				startDraftSetup();
				if (virtualPlayersData) this.virtualPlayersData = virtualPlayersData;

				// Are we just an Organizer, and not a player?
				if (!this.virtualPlayers.map((u) => u.userID).includes(this.userID)) {
					this.draftingState = DraftState.Watching;
				}
			});

			this.socket.on("rejoinDraft", (data) => {
				this.drafting = true;
				this.clearState();
				// Avoid duplicate keys by clearing card pools (e.g. on server restart)
				this.$refs.deckDisplay?.sync();
				this.$refs.sideboardDisplay?.sync();
				// Let vue react to changes to card pools
				this.$nextTick(() => {
					for (let c of data.pickedCards.main) this.addToDeck(c);
					for (let c of data.pickedCards.side) this.addToSideboard(c);

					this.booster = [];
					if (data.booster) {
						for (let c of data.booster) this.booster.push(c);
						this.draftingState = DraftState.Picking;
					} else {
						this.draftingState = DraftState.Waiting;
					}
					this.boosterNumber = data.boosterNumber;
					this.pickNumber = data.pickNumber;
					this.botScores = data.botScores;

					this.selectedCards = [];
					this.burningCards = [];

					Alert.fire({
						position: "center",
						icon: "success",
						title: "Reconnected to the draft!",
						showConfirmButton: false,
						timer: 1500,
					});

					this.$refs.deckDisplay?.sync();
					this.$refs.sideboardDisplay?.sync();
				});
			});

			this.socket.on("draftState", (data) => {
				// Only watching, not playing/receiving a booster ourself.
				if (this.draftingState === DraftState.Watching) {
					this.boosterNumber = data.boosterNumber;
					return;
				}

				const fullState = data as {
					booster: UniqueCard[];
					boosterCount: number;
					boosterNumber: number;
					pickNumber: 0;
				};
				if (fullState.boosterCount > 0) {
					if (
						!this.booster ||
						this.booster.length === 0 ||
						this.pickNumber !== fullState.pickNumber! ||
						this.boosterNumber !== data.boosterNumber
					) {
						this.botScores = null; // Clear bot scores
						this.selectedCards = [];
						this.burningCards = [];
						this.booster = [];
						for (let c of fullState.booster!) this.booster.push(c);
						this.playSound("next");
					}
					this.boosterNumber = fullState.boosterNumber;
					this.pickNumber = fullState.pickNumber!;
					this.draftingState = DraftState.Picking;
				} else {
					// No new booster, don't update the state yet.
					this.draftingState = DraftState.Waiting;
				}
			});

			this.socket.on("botRecommandations", (data) => {
				if (data.pickNumber === this.pickNumber) this.botScores = data.scores;
			});

			this.socket.on("endDraft", () => {
				fireToast("success", "Done drafting!");
				this.drafting = false;
				this.draftPaused = false;
				if (this.draftingState === DraftState.Watching) {
					// As player list will be reverting to its non-drafting state, click events used to select player have to be re-registered.
					this.$nextTick(() => {
						this.$refs.draftloglive?.registerPlayerSelectEvents();
					});
				} else this.draftingState = DraftState.Brewing;
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
				if (idx && this.draftLogs[idx] && data.userID in this.draftLogs[idx].users) {
					this.$set(this.draftLogs[idx].users[data.userID], "decklist", data.decklist);
					this.storeDraftLogs();
				}
			});

			this.socket.on("draftLogLive", (data) => {
				if (data.log) this.draftLogLive = data.log;

				if (!this.draftLogLive) return;

				if (data.pick) this.draftLogLive.users[data.userID!].picks.push(data.pick);
				if (data.decklist) this.$set(this.draftLogLive.users[data.userID!], "decklist", data.decklist);
			});

			this.socket.on("pickAlert", (data) => {
				fireToast(
					"info",
					`${data.userName} picked ${data.cards
						.map((s) => (s.printed_names[this.language] ? s.printed_names[this.language] : s.name))
						.join(", ")}!`
				);
				this.$refs.draftloglive?.newPick(data);
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
				if (data.countdown == 0) this.forcePick();
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
			this.virtualPlayersData = null;
			this.clearSideboard();
			this.clearDeck();
			this.deckFilter = "";
			this.lands = { W: 0, U: 0, B: 0, R: 0, G: 0 };
			this.currentDraftLog = null;
			this.boosterNumber = -1;
			this.pickNumber = -1;
			this.booster = [];
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
		playSound(key: keyof typeof Sounds) {
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
			const proposedBots = this.maxPlayers <= 1 ? 7 : Math.max(0, this.maxPlayers - 1);
			if (!this.teamDraft && this.sessionUsers.length + this.bots < 2) {
				let ret = await Alert.fire({
					icon: "info",
					title: "Not enough players",
					text: `At least 2 players (including bots) are needed to start a draft.`,
					showDenyButton: true,
					denyButtonColor: "darkgreen",
					denyButtonText: `Draft alone with ${proposedBots} bots`,
					confirmButtonText: "Dismiss",
				});
				if (ret.isDenied) {
					this.bots = proposedBots;
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
				text: "Do you really want to stop the game for all players?",
				icon: "warning",
				showCancelButton: true,
				confirmButtonColor: ButtonColor.Critical,
				cancelButtonColor: ButtonColor.Safe,
				confirmButtonText: "Stop the game!",
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
		resumeDraft() {
			if (this.userID != this.sessionOwner) return;
			this.socket.emit("resumeDraft");
		},
		selectCard(e: Event | null, c: UniqueCard) {
			if (!this.selectedCards.includes(c)) {
				if (this.selectedCards.length === this.cardsToPick) this.selectedCards.shift();
				this.selectedCards.push(c);
				this.restoreCard(null, c);
			}
		},
		burnCard(e: Event, c: UniqueCard) {
			if (this.burningCards.includes(c)) return;
			if (this.selectedCards.includes(c)) this.selectedCards.splice(this.selectedCards.indexOf(c), 1);
			this.burningCards.push(c);
			if (this.burningCards.length > this.burnedCardsPerRound) this.burningCards.shift();
			if (e) e.stopPropagation();
		},
		restoreCard(e: Event | null, c: UniqueCard) {
			if (!this.burningCards.includes(c)) return;
			this.burningCards.splice(
				this.burningCards.findIndex((o) => o === c),
				1
			);
			if (e) e.stopPropagation();
		},
		doubleClickCard(e: MouseEvent, c: UniqueCard) {
			this.selectCard(null, c);
			if (this.pickOnDblclick) this.pickCard();
		},
		allowBoosterCardDrop(e: DragEvent) {
			// Allow dropping only if the dragged object is the selected card

			// A better (?) solution would be something like
			// 		let cardid = e.dataTransfer.getData("text");
			// 		if (this.selectedCards && cardid == this.selectedCards.id)
			// {
			// but only Firefox allows to check for dataTransfer in this event (and
			// it's against the standard)

			if (e.dataTransfer?.types.includes("isboostercard")) {
				e.preventDefault();
				e.dataTransfer.dropEffect = "move";
				return false;
			}

			// Allow dropping picks during Rotisserie draft if it is our turn to pick.
			if (
				e.dataTransfer?.types.includes("isrotisseriedraft") &&
				this.draftingState === DraftState.RotisserieDraft &&
				this.rotisserieDraftState?.currentPlayer === this.userID
			) {
				e.preventDefault();
				e.dataTransfer.dropEffect = "move";
				return false;
			}
		},
		dragBoosterCard(e: DragEvent, card: UniqueCard) {
			if (e.dataTransfer) {
				e.dataTransfer.setData("isboostercard", "true"); // Workaround: See allowBoosterCardDrop
				e.dataTransfer.setData("text", card.id);
				e.dataTransfer.effectAllowed = "move";
			}
			this.selectCard(null, card);
		},
		dropBoosterCard(e: DragEvent, options?: { toSideboard?: boolean }) {
			// Filter other events; Disable when we're not picking (probably useless buuuuut...)
			if (
				e.dataTransfer?.getData("isboostercard") === "true" &&
				(this.draftingState === DraftState.Picking || this.draftingState === DraftState.RochesterPicking)
			) {
				e.preventDefault();
				const cardid = e.dataTransfer.getData("text");
				if (!this.selectedCards.some((c) => cardid === c.id)) {
					console.error(
						"dropBoosterCard error: cardid (%s) could not be found in this.selectedCards:",
						cardid
					);
					console.error(this.selectedCards);
					return;
				}

				this.pickCard(Object.assign(options ?? {}, { event: e }));
				return;
			}

			if (
				e.dataTransfer?.getData("isrotisseriedraft") === "true" &&
				this.draftingState === DraftState.RotisserieDraft &&
				this.rotisserieDraftState?.currentPlayer === this.userID
			) {
				e.preventDefault();
				const cardUniqueID = parseInt(e.dataTransfer.getData("uniqueID"));
				this.rotisserieDraftPick(cardUniqueID, Object.assign(options ?? {}, { event: e }));
				return;
			}
		},
		pickCard(options: { toSideboard?: boolean; event?: MouseEvent } | undefined = undefined) {
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
				const toSideboard = options?.toSideboard;
				const cUIDs = this.selectedCards.map((c) => c.uniqueID);

				const ack = (answer: SocketAck) => {
					this.pickInFlight = false;
					if (answer.code !== 0) {
						Alert.fire(answer.error as SweetAlertOptions<any, any>);
					} else {
						if (toSideboard) for (let cuid of cUIDs) this.socket.emit("moveCard", cuid, "side");
						this.selectedCards = [];
						this.burningCards = [];
					}
				};

				if (this.rochesterDraftState) {
					this.socket.emit(
						"rochesterDraftPick",
						this.selectedCards.map((c) => this.rochesterDraftState!.booster.findIndex((c2) => c === c2)),
						ack
					);
					this.draftingState = DraftState.RochesterWaiting;
				} else {
					this.socket.emit(
						"pickCard",
						{
							pickedCards: this.selectedCards.map((c) => this.booster.findIndex((c2) => c === c2)),
							burnedCards: this.burningCards.map((c) => this.booster.findIndex((c2) => c === c2)),
						},
						ack
					);
					this.draftingState = DraftState.Waiting;
					// Removes picked & burned cards for animation
					this.booster = this.booster.filter(
						(c) => !this.selectedCards.includes(c) && !this.burningCards.includes(c)
					);
				}
				if (options?.toSideboard) this.addToSideboard(this.selectedCards, options);
				else this.addToDeck(this.selectedCards, options);
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
					return this.botScores!.scores[lhs] - this.botScores!.scores[rhs];
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
		setWinstonDraftState(state: WinstonDraftSyncData) {
			this.winstonDraftState = state;
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
					min: "6",
					max: "12",
					step: "1",
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
			if (!this.winstonDraftState) return;
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
		setGridDraftState(state: GridDraftSyncData) {
			const prevBooster = this.gridDraftState ? this.gridDraftState.booster : null;
			this.gridDraftState = state;
			const booster = [];
			let idx = 0;
			for (let card of this.gridDraftState.booster) {
				if (card) {
					if (prevBooster && prevBooster[idx] && prevBooster[idx]!.id === card.id)
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
					min: "6",
					max: "32",
					step: "1",
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
		gridDraftPick(choice: number) {
			if (!this.gridDraftState) return;

			const cards: UniqueCard[] = [];

			for (let i = 0; i < 3; ++i) {
				//                     Column           Row
				let idx = choice < 3 ? 3 * i + choice : 3 * (choice - 3) + i;
				if (this.gridDraftState.booster[idx]) {
					cards.push(this.gridDraftState.booster[idx]!);
				}
			}
			if (cards.length === 0) {
				console.error("gridDraftPick: Should not reach that.");
				return;
			} else {
				this.socket.emit("gridDraftPick", choice, (answer: SocketAck) => {
					if (answer.code === 0) {
						for (let c of cards) this.addToDeck(c);
					} else if (answer.error) Alert.fire(answer.error);
				});
			}
		},
		setRochesterDraftState(state: RochesterDraftSyncData) {
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
		startRotisserieDraft() {
			if (this.userID != this.sessionOwner || this.drafting) return;
			if (!this.ownerIsPlayer) {
				Alert.fire({
					icon: "error",
					title: "Owner has to play",
					text: "Non-playing owner is not supported in Rotisserie Draft for now. The 'Session owner is playing' option needs to be active.",
				});
				return;
			}
			const DialogClass = Vue.extend(RotisserieDraftDialog);
			let instance = new DialogClass({
				propsData: { defaultBoostersPerPlayer: this.boostersPerPlayer },
				beforeDestroy() {
					instance.$el.parentNode?.removeChild(instance.$el);
				},
			});
			instance.$on("cancel", () => {
				instance.$destroy();
			});
			instance.$on("start", (options: RotisserieDraftStartOptions) => {
				this.deckWarning((options) => {
					this.socket.emit("startRotisserieDraft", options, (r) => {
						if (r.code !== 0) Alert.fire(r.error!);
					});
				}, options);
				instance.$destroy();
			});
			instance.$mount();
			this.$el.appendChild(instance.$el);
		},
		rotisserieDraftPick(
			uniqueCardID: UniqueCardID,
			options: { toSideboard?: boolean; event?: MouseEvent } | undefined = undefined // Used to support pick by drag & drop
		) {
			if (!this.drafting || !this.rotisserieDraftState || this.rotisserieDraftState.currentPlayer !== this.userID)
				return;
			this.socket.emit("rotisserieDraftPick", uniqueCardID, (answer: SocketAck) => {
				if (answer.code !== 0) Alert.fire(answer.error!);
				else {
					const card = this.rotisserieDraftState?.cards.find((c) => c.uniqueID === uniqueCardID);
					if (options?.toSideboard) this.addToSideboard(card!, options);
					else this.addToDeck(card!, options);
				}
			});
		},
		setMinesweeperDraftState(state: MinesweeperSyncData) {
			const currentGridNumber = this.minesweeperDraftState?.gridNumber;

			const execute = () => {
				this.minesweeperDraftState = state;
				this.onMinesweeperStateUpdate();
			};

			if (currentGridNumber !== undefined && currentGridNumber !== state.gridNumber) {
				// Delay the state update on grid change to allow the animation to finish
				setTimeout(execute, 1000);
			} else execute();
		},
		onMinesweeperStateUpdate() {
			if (this.userID === this.minesweeperDraftState!.currentPlayer) {
				this.playSound("next");
				fireToast("info", "Your turn! Pick a card.");
				this.pushNotification("Your turn!", {
					body: `This is your turn to pick.`,
				});
			}
		},
		// This is just a shortcut to set burnedCardsPerTurn and boostersPerPlayers to suitable values.
		startMinesweeperDraft: async function () {
			if (this.userID !== this.sessionOwner || this.drafting) return;

			let gridCount = 4;
			let gridWidth = 10;
			let gridHeight = 9;
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
							gridCount: (document.getElementById("input-gridCount") as HTMLInputElement).valueAsNumber,
							gridWidth: (document.getElementById("input-gridWidth") as HTMLInputElement).valueAsNumber,
							gridHeight: (document.getElementById("input-gridHeight") as HTMLInputElement).valueAsNumber,
							picksPerPlayerPerGrid: (
								document.getElementById("input-picksPerPlayerPerGrid") as HTMLInputElement
							).valueAsNumber,
							revealBorders: (document.getElementById("input-revealBorders") as HTMLInputElement).checked,
						});
					});
				},
			}).then((r: any) => {
				if (r.isConfirmed) {
					localStorage.setItem("mtgadraft-minesweeper", JSON.stringify(r.value));
					this.socket.emit(
						"startMinesweeperDraft",
						r.value.gridCount,
						r.value.gridWidth,
						r.value.gridHeight,
						this.sessionUsers.length * r.value.picksPerPlayerPerGrid,
						r.value.revealBorders,
						(response: SocketAck) => {
							if (response?.error) {
								Alert.fire(response.error);
							}
						}
					);
				}
			});
		},
		minesweeperDraftPick(row: number, col: number) {
			if (!this.minesweeperDraftState) return;
			const card = this.minesweeperDraftState.grid[row][col].card;
			this.socket.emit("minesweeperDraftPick", row, col, (response) => {
				if (response?.error) {
					// These errors are not always prevented by the front-end because of latency, rather than adding a waiting state or something similar between
					// the pick request and the server response, we'll simply ignore them as they're not fatal anyway.
					if (response.error.title === "Invalid Coordinates" || response.error.title === "Not your turn.") {
						console.warn(response.error);
					} else {
						Alert.fire(response.error);
					}
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
							boostersPerPlayer: (document.getElementById("input-boostersPerPlayer") as HTMLInputElement)
								.valueAsNumber,
							burnedCardsPerRound: (
								document.getElementById("input-burnedCardsPerRound") as HTMLInputElement
							).valueAsNumber,
						});
					});
				},
			}).then((r: any) => {
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
		setCollection(json: PlainCollection) {
			if (this.collection == json) return;
			this.collection = Object.freeze(json);
			this.socket.emit("setCollection", this.collection);
		},
		uploadMTGALogs() {
			(document.querySelector("#collection-file-input") as HTMLElement)?.click();
			// Disabled for now as logs are broken since  the 26/08/2021 MTGA update
			//document.querySelector("#mtga-logs-file-input").click();
		},
		// Workaround for collection import: Collections are not available in logs anymore, accept standard card lists as collections.
		uploadCardListAsCollection(event: Event) {
			const file = (event.target as HTMLInputElement)?.files?.[0];
			if (!file) return;
			const reader = new FileReader();
			reader.onload = async (e) => {
				let contents = e.target?.result;
				if (!contents || typeof contents !== "string") {
					fireToast("error", `Empty file.`);
					return;
				}

				// Player.log, with MTGA Pro Tracker running.
				if (file.name.endsWith(".log")) {
					if (this.parseMTGAProTrackerLog(contents)) {
						fireToast("success", `Collection successfully imported.`);
					} else {
						fireToast(
							"error",
							`An error occured while processing '${file.name}', make sure it is the correct file (Player.log) and that MTGAProTracker is running.`
						);
					}
					return;
				}

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
							footer: `Expected 'Card', 'Set ID' and 'Quantity', got '${escapeHTML(
								lines[0].join(",")
							)}'.`,
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
						const setCodeTranslation: { [code: SetCode]: string } = {
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

				this.socket.emit("parseCollection", contents, (response) => {
					if (response.error) {
						Alert.fire(response.error);
						return;
					}
					if (!response.collection) {
						Alert.fire({
							title: "Error",
							text: "An error occured while importing the collection: Received an empty response.",
						});
						return;
					}
					this.setCollection(response.collection); // Unnecessary round trip, consider removing if this ends up being the only way to update the collection
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
					if (response.warning) Alert.fire(response.warning);
					else
						fireToast(
							"success",
							`Collection successfully imported (${Object.values(response.collection).reduce(
								(a, b) => a + b,
								0
							)} cards).`
						);
				});
			};
			reader.readAsText(file);
		},
		parseMTGAProTrackerLog(content: string) {
			try {
				const inventoryHeader = "[MTGA.Pro Logger] **InventoryContent** ";
				const inventoryIndex = content.lastIndexOf(inventoryHeader);
				if (inventoryIndex >= 0) {
					const inventoryStart = inventoryIndex + inventoryHeader.length;
					const inventoryEnd = content.indexOf("\n", inventoryStart);
					const inventoryData = JSON.parse(content.substring(inventoryStart, inventoryEnd))["Payload"];
					const inventory = {
						wildcards: {
							common: Math.max(0, inventoryData.wcCommon),
							uncommon: Math.max(0, inventoryData.wcUncommon),
							rare: Math.max(0, inventoryData.wcRare),
							mythic: Math.max(0, inventoryData.wcMythic),
						},
						vaultProgress: Math.max(0, inventoryData.vaultProgress),
					};
					localStorage.setItem("CollectionInfos", JSON.stringify(inventory));
					this.collectionInfos = inventory;
				}
			} catch (e) {
				console.error("Exception raised while extracting inventory information: ", e);
			}

			try {
				const collectionHeader = "[MTGA.Pro Logger] **Collection** ";
				const collectionIndex = content.lastIndexOf(collectionHeader);
				if (collectionIndex >= 0) {
					const collectionStart = collectionIndex + collectionHeader.length;
					const collectionEnd = content.indexOf("\n", collectionStart);
					const collectionData = JSON.parse(content.substring(collectionStart, collectionEnd))["Payload"];
					localStorage.setItem("Collection", JSON.stringify(collectionData));
					localStorage.setItem("CollectionDate", new Date().toLocaleDateString());
					this.setCollection(collectionData);
					return true;
				}
			} catch (e) {
				console.error("Exception raised while extracting collection information: ", e);
			}
			return false;
		},
		parseMTGALog(event: Event) {
			const file = (event.target as HTMLInputElement)?.files?.[0];
			if (!file) return;
			const reader = new FileReader();
			reader.onload = async (e) => {
				let contents = e.target?.result;
				if (!contents || typeof contents !== "string") {
					fireToast("error", `Empty file.`);
					return;
				}

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

				const parseCollection = function (contents: string, startIdx?: number) {
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
							footer: "Full error: " + escapeHTML(e as string),
						});
						return null;
					}
				};

				let result: { [id: string]: any } | null = null;
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
						const collections: ReturnType<typeof parseCollection>[] = [];
						for (let pid of playerIds) {
							const startIdx = contents.lastIndexOf(`"payload":{"playerId":"${pid}"`);
							const coll = parseCollection(contents, startIdx);
							if (coll) collections.push(coll);
						}
						let cardids = Object.keys(collections[0]!);
						// Filter ids
						for (let i = 1; i < collections.length; ++i)
							cardids = Object.keys(collections[i]!).filter((id) => cardids.includes(id));
						// Find min amount of each card
						result = {};
						for (let id of cardids) result[id] = collections[0]![id as keyof (typeof collections)[0]];
						for (let i = 1; i < collections.length; ++i)
							for (let id of cardids)
								result[id] = Math.min(
									result[id],
									collections[i]![id as keyof ReturnType<typeof parseCollection>]
								);
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
		uploadFile(e: Event, callback: (file: File, options?: Options) => void, options?: Options) {
			let file = (e.target as HTMLInputElement)?.files?.[0];
			if (!file) {
				fireToast("error", "An error occured while uploading the file.");
				return false;
			}
			return callback(file, options);
		},
		// Returns a Blob to be consumed by a FileReader
		fetchFile: async function (url: string, callback: (blob: Blob, options: Options) => void, options: Options) {
			const response = await fetch(url);
			if (!response.ok) {
				fireToast("error", `Could not fetch ${url}.`);
				return;
			}
			const blob = await response.blob();
			callback(blob, options);
		},
		dropCustomList(event: DragEvent) {
			event.preventDefault();
			(event.target as HTMLElement)?.classList.remove("dropzone-highlight");

			if (event.dataTransfer)
				if (event.dataTransfer.items) {
					for (let item of event.dataTransfer.items)
						if (item.kind === "file") {
							const file = item.getAsFile();
							if (file) this.parseCustomCardList(file);
						}
				} else {
					for (let file of event.dataTransfer.files) this.parseCustomCardList(file);
				}
		},
		async parseCustomCardList(file: File) {
			Alert.fire({
				position: "center",
				icon: "info",
				title: "Parsing card list...",
				showConfirmButton: false,
			});
			let contents = await file.text();

			this.socket.emit("parseCustomCardList", contents, (answer) => {
				if (answer?.error) {
					Alert.fire(answer.error);
				} else {
					fireToast("success", `Card list uploaded`);
				}
			});
		},
		// FIXME: Use a stricter type than 'string' for services.
		importCube(service: string) {
			const defaultMatchCardVersions = localStorage.getItem("import-match-versions") === "true";
			const defaultCubeID = localStorage.getItem("import-cubeID") ?? "";
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
				preConfirm(cubeID: string): Promise<{ cubeID: string; matchVersions: boolean }> {
					const matchVersions = (document.getElementById("input-match-card-versions") as HTMLInputElement)
						?.checked;
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
						});
					});
				},
			}).then((result: SweetAlertResult<{ cubeID: string; matchVersions: boolean }>) => {
				if (result.value && result.value.cubeID) {
					const cube =
						service === "Cube Cobra"
							? {
									name: "Imported Cube",
									cubeCobraID: result.value.cubeID,
									description: `Imported from Cube Cobra: '${result.value.cubeID}'`,
							  }
							: {
									name: "Imported Cube",
									cubeArtisanID: result.value.cubeID,
									description: `Imported from CubeArtisan: '${result.value.cubeID}'`,
							  };
					this.selectCube(cube, result.value.matchVersions);
				}
			});
		},
		selectCube(cube: CubeDescription, matchVersions: boolean = false) {
			const ack = (r: SocketAck) => {
				if (r?.error) {
					Alert.fire(r.error);
				} else {
					fireToast("success", `Card list loaded`);
				}
			};

			if (cube.cubeCobraID || cube.cubeArtisanID) {
				const cubeID = cube.cubeCobraID ?? cube.cubeArtisanID;
				const service = cube.cubeCobraID ? "Cube Cobra" : "CubeArtisan";
				Alert.fire({
					position: "center",
					icon: "info",
					title: `Loading Cube...`,
					text: `Please wait as we retrieve the latest version from ${service}...`,
					footer: `CubeID: ${escapeHTML(cubeID!)}`,
					showConfirmButton: false,
					allowOutsideClick: false,
				});
				this.socket.emit("importCube", { cubeID: cubeID, service: service, matchVersions: matchVersions }, ack);
			} else if (cube.name) {
				this.socket.emit("loadLocalCustomCardList", cube.name, ack);
			}
		},
		async importDeck() {
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
				body: (document.querySelector("#decklist-text") as HTMLInputElement)?.value,
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
			const text = (document.querySelector("#upload-booster-text") as HTMLInputElement)?.value;
			this.socket.emit("setBoosters", text, (response) => {
				if (response?.error) {
					Alert.fire(response.error);
				} else {
					fireToast("success", "Boosters successfuly uploaded!");
					this.displayedModal = "sessionOptions";
				}
			});
		},
		shuffleUploadedBoosters() {
			if (this.sessionOwner !== this.userID) return;
			this.socket.emit("shuffleBoosters", (response) => {
				if (response?.error) {
					fireToast(response.error.icon, response.error.title);
				} else {
					fireToast("success", "Boosters successfuly shuffled!");
				}
			});
		},
		toggleSetRestriction(code: SetCode) {
			if (this.setRestriction.includes(code))
				this.setRestriction.splice(
					this.setRestriction.findIndex((c) => c === code),
					1
				);
			else this.setRestriction.push(code);
		},
		setSessionOwner(newOwnerID: UserID) {
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
		removePlayer(userID: UserID) {
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
		movePlayer(idx: number, dir: -1 | 1) {
			if (this.userID != this.sessionOwner) return;

			const negMod = (m: number, n: number) => ((m % n) + n) % n;
			let other = negMod(idx + dir, this.userOrder.length);
			[this.userOrder[idx], this.userOrder[other]] = [this.userOrder[other], this.userOrder[idx]];

			this.socket.emit("setSeating", this.userOrder);
		},
		changePlayerOrder() {
			if (this.userID != this.sessionOwner) return;
			this.socket.emit("setSeating", this.userOrder);
		},
		async sealedDialog(teamSealed = false) {
			if (this.userID != this.sessionOwner) return;

			const DialogClass = Vue.extend(SealedDialog);
			let instance = new DialogClass({
				propsData: { users: this.sessionUsers, teamSealed: teamSealed },
				beforeDestroy() {
					instance.$el.parentNode?.removeChild(instance.$el);
				},
			});
			instance.$on("cancel", () => {
				instance.$destroy();
			});
			instance.$on("distribute", (boostersPerPlayer: number, customBoosters: SetCode[], teams: UserID[][]) => {
				this.deckWarning(
					teamSealed ? this.startTeamSealed : this.distributeSealed,
					boostersPerPlayer,
					customBoosters,
					teams
				);
				instance.$destroy();
			});
			instance.$mount();
			this.$el.appendChild(instance.$el);
		},
		deckWarning<T extends any[]>(call: (...args: T) => void, ...options: T) {
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
		distributeSealed(boosterCount: number, customBoosters: string[]) {
			if (this.userID !== this.sessionOwner) return;
			this.socket.emit("distributeSealed", boosterCount, customBoosters);
		},
		startTeamSealed(boosterCount: number, customBoosters: string[], teams: UserID[][]) {
			if (this.userID !== this.sessionOwner) return;
			this.socket.emit("startTeamSealed", boosterCount, customBoosters, teams, (err) => {
				if (err.error) Alert.fire(err.error);
			});
		},
		teamSealedPick(uniqueCardID: UniqueCardID) {
			this.socket.emit("teamSealedPick", uniqueCardID, (r) => {
				if (r.error) Alert.fire(r.error);
			});
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
		async displayPackChoice(boosters: JHHBooster[], currentPack: number, packCount: number) {
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
		async selectJumpstartPacks(
			choices: [JHHBooster[], JHHBooster[][]],
			ack: (user: UserID, cards: CardID[]) => void
		) {
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
		shareSavedDraftLog(storedDraftLog: DraftLog) {
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
		prepareBracketPlayers(pairingOrder: number[]) {
			const playerInfos = this.sessionUsers.map((u) => {
				return { userID: u.userID, userName: u.userName };
			});
			let players = [];
			for (let i = 0; i < pairingOrder.length; ++i) players[i] = playerInfos[pairingOrder[i]];
			return players;
		},
		// Bracket (Server communication)
		generateBracket() {
			if (this.userID != this.sessionOwner) return;
			let players = this.prepareBracketPlayers(this.teamDraft ? [0, 3, 2, 5, 4, 1] : [0, 4, 2, 6, 1, 5, 3, 7]);
			this.socket.emit("generateBracket", players, (answer) => {
				if (answer.code === 0) this.displayedModal = "bracket";
				else if (answer.error) Alert.fire(answer.error);
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
				else if (answer.error) Alert.fire(answer.error);
			});
		},
		generateDoubleBracket() {
			if (this.userID != this.sessionOwner || this.teamDraft) return;
			let players = this.prepareBracketPlayers([0, 4, 2, 6, 1, 5, 3, 7]);
			this.socket.emit("generateDoubleBracket", players, (answer) => {
				if (answer.code === 0) this.displayedModal = "bracket";
				else if (answer.error) Alert.fire(answer.error);
			});
		},
		updateBracket(matchIndex: number, index: number, value: number) {
			if (!this.bracket || (this.userID != this.sessionOwner && this.bracketLocked)) return;
			this.bracket.results[matchIndex][index] = value;
			this.socket.emit("updateBracket", this.bracket.results);
		},
		lockBracket(val: boolean) {
			if (this.userID != this.sessionOwner) return;
			this.bracketLocked = val;
			this.socket.emit("lockBracket", this.bracketLocked);
		},
		// Deck/Sideboard management
		addToDeck(card: UniqueCard | UniqueCard[], options: { event?: MouseEvent } | undefined = undefined) {
			if (Array.isArray(card)) for (let c of card) this.addToDeck(c, options);
			else {
				// Handle column sync.
				this.deck.push(card);
				this.$refs.deckDisplay?.addCard(card, options?.event ?? undefined);
			}
		},
		addToSideboard(card: UniqueCard | UniqueCard[], options: { event?: MouseEvent } | undefined = undefined) {
			if (Array.isArray(card)) for (let c of card) this.addToSideboard(c, options);
			else {
				// Handle column sync.
				this.sideboard.push(card);
				this.$refs.sideboardDisplay?.addCard(card, options?.event ?? undefined);
			}
		},
		deckToSideboard(e: Event, c: UniqueCard) {
			// From deck to sideboard
			let idx = this.deck.indexOf(c);
			if (idx >= 0) {
				this.deck.splice(idx, 1);
				this.addToSideboard(c);
				this.socket.emit("moveCard", c.uniqueID, "side");
			} else return;
			this.$refs.deckDisplay?.remCard(c);
			// Card DOM element will move without emiting a mouse leave event,
			// make sure to close the card popup.
			this.$root.$emit("closecardpopup");
		},
		sideboardToDeck(e: Event, c: UniqueCard) {
			// From sideboard to deck
			let idx = this.sideboard.indexOf(c);
			if (idx >= 0) {
				this.sideboard.splice(idx, 1);
				this.addToDeck(c);
				this.socket.emit("moveCard", c.uniqueID, "main");
			} else return;
			this.$refs.sideboardDisplay?.remCard(c);
			this.$root.$emit("closecardpopup");
		},
		onDeckChange(e: any /* I don't think vuedraggable exposes a 'ChangeEvent'? */) {
			// For movements between to columns of the pool, two events are emitted:
			// One for removal from the source column and one for addition into the destination.
			// We're emiting the event for server sync. only on addition, if this a movement within the pool,
			// the card won't be found on the other pool and nothing will happen.
			if (e.removed)
				this.deck.splice(
					this.deck.findIndex((c) => c === e.removed.element),
					1
				);
			if (e.added) {
				this.deck.push(e.added.element);
				this.socket.emit("moveCard", e.added.element.uniqueID, "main");
			}
		},
		onSideChange(e: any /* I don't think vuedraggable exposes a 'ChangeEvent'? */) {
			if (e.removed)
				this.sideboard.splice(
					this.sideboard.findIndex((c) => c === e.removed.element),
					1
				);
			if (e.added) {
				this.sideboard.push(e.added.element);
				this.socket.emit("moveCard", e.added.element.uniqueID, "side");
			}
		},
		onCollapsedSideChange(e: any /* I don't think vuedraggable exposes a 'ChangeEvent'? */) {
			this.$refs.sideboardDisplay?.sync(); /* Sync sideboard card-pool */
			if (e.added) this.socket.emit("moveCard", e.added.element.uniqueID, "side");
		},
		clearDeck() {
			this.deck = [];
			this.$nextTick(() => {
				this.$refs.deckDisplay?.sync();
			});
		},
		clearSideboard() {
			this.sideboard = [];
			this.$nextTick(() => {
				this.$refs.sideboardDisplay?.sync();
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
				for (let c in colorCount) totalColor += colorCount[c as CardColor];
				if (totalColor <= 0) return;

				for (let c in this.lands)
					this.lands[c as CardColor] = Math.round(landToAdd * (colorCount[c as CardColor] / totalColor));
				let addedLands = this.totalLands;

				if (this.deck.length + addedLands > targetDeckSize) {
					let max: CardColor = CardColor.W;
					for (let i = 0; i < this.deck.length + addedLands - targetDeckSize; ++i) {
						for (let c in this.lands)
							if (this.lands[c as CardColor] > this.lands[max]) max = c as CardColor;
						this.lands[max] = Math.max(0, this.lands[max] - 1);
					}
				} else if (this.deck.length + addedLands < targetDeckSize) {
					let min: CardColor = CardColor.W;
					for (let i = 0; i < targetDeckSize - (this.deck.length + addedLands); ++i) {
						for (let c in this.lands)
							if (
								this.colorsInDeck[min] == 0 ||
								(this.colorsInDeck[c as CardColor] > 0 && this.lands[c as CardColor] < this.lands[min])
							)
								min = c as CardColor;
						this.lands[min] += 1;
					}
				}
			}
		},
		removeBasicsFromDeck() {
			this.deck = this.deck.filter((c) => c.type !== "Basic Land");
			this.sideboard = this.sideboard.filter((c) => c.type !== "Basic Land");
			this.$refs.deckDisplay?.filterBasics();
			this.$refs.sideboardDisplay?.filterBasics();
		},
		colorsInCardPool(pool: Card[]) {
			let r = { W: 0, U: 0, B: 0, R: 0, G: 0 };
			for (let card of pool) {
				for (let color of card.colors) {
					r[color] += 1;
				}
			}
			return r;
		},
		cardConditionalClasses(card: Card) {
			if (this.cardFilter(card)) return ["card-filtered"];
			return [];
		},
		cardFilter(card: Card) {
			if (!this.deckFilter || this.deckFilter === "") return false;
			const filter = this.deckFilter.toLowerCase();
			return !this.cardFaceFilter(card, filter) && (!card.back || !this.cardFaceFilter(card.back, filter));
		},
		cardFaceFilter(
			card: {
				name: string;
				printed_names: { [lang: string]: string };
				type: string;
				subtypes: string[];
			},
			filter: string
		) {
			return (
				card.name.toLowerCase().includes(filter) ||
				(this.language != "en" && card.printed_names[this.language]?.toLowerCase().includes(filter)) ||
				card.type.toLowerCase().includes(filter) ||
				card.subtypes.join(" ").toLowerCase().includes(filter)
			);
		},
		// Misc.
		toggleNotifications() {
			this.enableNotifications = !this.enableNotifications;
			if (typeof Notification === "undefined") {
				this.notificationPermission = "denied";
				return;
			}
			if (this.enableNotifications && Notification.permission !== "granted") {
				Notification.requestPermission().then((permission) => {
					this.notificationPermission = permission;
					if (permission !== "granted") this.enableNotifications = false;
				});
			}
		},
		pushNotification(title: string, data?: NotificationOptions) {
			if (this.enableNotifications && !document.hasFocus()) new Notification(title, data);
		},
		pushTitleNotification(msg: string) {
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
		toClipboard(data: string, message = "Copied to clipboard!") {
			copyToClipboard(data);
			fireToast("success", message);
		},
		updateStoredSessionSettings(data: { [key: string]: any }) {
			const previousStr = localStorage.getItem(localStorageSessionSettingsKey) ?? "{}";
			const previous = JSON.parse(previousStr);
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

			// Debounce the compression and store
			if (this.storeDraftLogsTimeout) clearTimeout(this.storeDraftLogsTimeout);
			this.storeDraftLogsTimeout = setTimeout(this.doStoreDraftLogs, 5000);
		},
		doStoreDraftLogs() {
			let worker = new Worker(new URL("./logstore.worker.ts", import.meta.url));
			worker.onmessage = (e) => {
				localStorage.setItem("draftLogs", e.data);
				this.storeDraftLogsTimeout = null;
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
		countMissing(cards: Card[]) {
			if (!this.hasCollection || !cards) return null;
			const r = { common: 0, uncommon: 0, rare: 0, mythic: 0 };
			const counts: { [aid: ArenaID]: { rarity: string; count: number } } = {};
			for (let card of cards) {
				if (!("arena_id" in card)) return null;
				if (card.type.includes("Basic")) continue;
				if (!(card.arena_id! in counts)) counts[card.arena_id!] = { rarity: card.rarity, count: 0 };
				++counts[card.arena_id!].count;
			}
			for (let cid in counts)
				r[counts[cid]!.rarity as keyof typeof r] += Math.max(
					0,
					Math.min(4, counts[cid].count) - (cid in this.collection ? this.collection[cid] : 0)
				);
			return r;
		},
		wildcardCost(card: Card) {
			if (!this.hasCollection || !card.arena_id || card.type.includes("Basic")) return false;
			if (!(card.arena_id in this.collection)) return true;
			if (this.collection[card.id] >= 4) return false;
			const currentCount = card.id in this.deckSummary ? this.deckSummary[card.id] : 0;
			return currentCount >= this.collection[card.arena_id];
		},
		hasEnoughWildcards(card: Card) {
			if (
				!this.neededWildcards ||
				!this.neededWildcards.main ||
				!this.collectionInfos ||
				!this.collectionInfos.wildcards
			)
				return true;
			const needed = this.neededWildcards.main[card.rarity as keyof typeof this.neededWildcards.main] || 0;
			return needed < this.collectionInfos.wildcards[card.rarity as keyof typeof this.collectionInfos.wildcards];
		},
		storeSettings() {
			let settings: { [key: string]: any } = {};
			for (let key in defaultSettings) settings[key] = this[key as keyof typeof defaultSettings];
			localStorage.setItem(localStorageSettingsKey, JSON.stringify(settings));
		},

		beforeunload(event: BeforeUnloadEvent) {
			// Force the call to doStoreDraftLogs and ask the user to wait a bit.
			if (this.storeDraftLogsTimeout) {
				clearTimeout(this.storeDraftLogsTimeout);
				this.storeDraftLogsTimeout = null;
				this.doStoreDraftLogs();
				event.preventDefault();
				return (event.returnValue =
					"Processing draft logs, please wait a brief moment before navigating away...");
			}
			return false;
		},

		fixedDeckMouseDown(evt: MouseEvent) {
			this.fixedDeckState.y = evt.screenY;
			document.body.addEventListener("mousemove", this.resizeFixedDeck);
			document.body.addEventListener("mouseup", () => {
				document.body.removeEventListener("mousemove", this.resizeFixedDeck);
			});
			evt.preventDefault();
		},
		resizeFixedDeck(evt: MouseEvent) {
			if (!this.$refs.fixedDeckContainer) return;
			this.fixedDeckState.dy = this.fixedDeckState.y - evt.screenY;
			this.fixedDeckState.y = evt.screenY;
			this.fixedDeckState.ht += this.fixedDeckState.dy;
			this.fixedDeckState.ht = Math.min(
				Math.max(this.fixedDeckState.ht, window.innerHeight * 0.2),
				window.innerHeight * 0.8
			);
			this.applyFixedDeckSize();
		},
		applyFixedDeckSize() {
			if (!this.$refs.fixedDeckContainer) return;
			if (this.displayFixedDeck) {
				(this.$refs.fixedDeckContainer as HTMLElement).style.height = this.fixedDeckState.ht + "px";
				this.fixedDeckState.mainHeight = `calc(100vh - ${this.fixedDeckState.ht}px)`;
			} else {
				(this.$refs.fixedDeckContainer as HTMLElement).style.height = "auto";
			}
		},
	},
	computed: {
		DraftState() {
			return DraftState;
		},
		ReadyState() {
			return ReadyState;
		},
		PassingOrder() {
			return PassingOrder;
		},
		gameModeName() {
			if (this.teamSealedState) return "Team Sealed";
			if (this.rochesterDraftState) return "Rochester Draft";
			if (this.rotisserieDraftState) return "Rotisserie Draft";
			if (this.winstonDraftState) return "Winston Draft";
			if (this.gridDraftState) return "Grid Draft";
			if (this.useCustomCardList) return "Cube Draft";
			if (this.burnedCardsPerRound > 0) return "Glimpse Draft";
			return "Draft";
		},
		cardsToPick(): number {
			if (this.rochesterDraftState || !this.booster) return 1;
			let picksThisRound: number = this.pickedCardsPerRound;
			// Special case for doubleMastersMode. The number of picks could (should?) be send as part of the draftState rather
			// than duplicating the logic here, but currently this is the only special case and I'm chosing the easier solution.
			if (this.draftingState === DraftState.Picking && this.doubleMastersMode && this.pickNumber !== 0)
				picksThisRound = 1;
			return Math.min(picksThisRound, this.booster.length);
		},
		cardsToBurnThisRound(): number {
			if (this.rochesterDraftState || !this.booster) return 0;
			return Math.max(0, Math.min(this.burnedCardsPerRound, this.booster.length - this.cardsToPick));
		},
		winstonCanSkipPile() {
			if (!this.winstonDraftState) return false;
			const s: WinstonDraftSyncData = this.winstonDraftState;
			return !(
				!s.remainingCards &&
				((s.currentPile === 0 && !s.piles[1].length && !s.piles[2].length) ||
					(s.currentPile === 1 && !s.piles[2].length) ||
					s.currentPile === 2)
			);
		},
		waitingForDisconnectedUsers(): boolean {
			//                    Disconnected players do not matter for Team Sealed
			if (!this.drafting || this.teamSealedState) return false;
			return Object.keys(this.disconnectedUsers).length > 0;
		},
		disconnectedUserNames(): string {
			return Object.values(this.disconnectedUsers)
				.map((u) => u.userName)
				.join(", ");
		},
		virtualPlayers(): UserData[] | typeof this.sessionUsers {
			if (!this.drafting || !this.virtualPlayersData || Object.keys(this.virtualPlayersData).length == 0)
				return this.sessionUsers;

			let r = [];
			for (let id in this.virtualPlayersData) {
				if (this.virtualPlayersData[id].isBot) {
					r.push(this.virtualPlayersData[id]);
				} else if (this.virtualPlayersData[id].isDisconnected) {
					r.push(this.virtualPlayersData[id]);
				} else {
					const p = this.sessionUsers.find((u) => u.userID === id);
					let concat = Object.assign(this.virtualPlayersData[id], p);
					r.push(concat);
				}
			}

			return r;
		},
		passingOrder() {
			if (this.minesweeperDraftState || this.rotisserieDraftState || this.rochesterDraftState) {
				const pickNumber = (this.minesweeperDraftState ??
					this.rotisserieDraftState ??
					this.rochesterDraftState)!.pickNumber;
				if (pickNumber !== 0 && pickNumber % this.sessionUsers.length === this.sessionUsers.length - 1) {
					return PassingOrder.Repeat;
				} else if (Math.floor(pickNumber / this.sessionUsers.length) % 2 == 1) {
					return PassingOrder.Left;
				} else {
					return PassingOrder.Right;
				}
			}
			return this.boosterNumber
				? this.boosterNumber % 2 === 1
					? PassingOrder.Left
					: PassingOrder.Right
				: PassingOrder.None;
		},
		displaySets(): SetInfo[] {
			return Object.values(this.setsInfos).filter((set) => this.sets.includes(set.code));
		},
		hasCollection() {
			return !isEmpty(this.collection);
		},

		colorsInDeck() {
			return this.colorsInCardPool(this.deck);
		},
		totalLands() {
			return Object.values(this.lands).reduce((a, b) => a + b, 0);
		},
		basicsInDeck() {
			return (
				this.deck.some((c) => c.type === "Basic Land") || this.sideboard.some((c) => c.type === "Basic Land")
			);
		},
		deckCreatureCount() {
			return this.deck?.filter((c) => c.type.includes("Creature")).length ?? 0;
		},
		deckLandCount() {
			return this.deck?.filter((c) => c.type.includes("Land")).length ?? 0;
		},
		neededWildcards() {
			if (!this.hasCollection) return null;
			const main = this.countMissing(this.deck);
			const side = this.countMissing(this.sideboard);
			if (!main && !side) return null;
			return { main: main, side: side };
		},
		deckSummary() {
			const r: { [id: CardID]: number } = {};
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
		displayDeckAndSideboard() {
			return (
				(this.drafting && this.draftingState !== DraftState.Watching) ||
				this.draftingState === DraftState.Brewing
			);
		},
		displayFixedDeck() {
			return this.displayDeckAndSideboard && this.fixedDeck && this.draftingState !== DraftState.Brewing;
		},

		userByID() {
			let r: { [uid: UserID]: any } = {}; // FIXME: any
			for (let u of this.sessionUsers) r[u.userID] = u;
			return r;
		},

		pageTitle() {
			if (this.sessionUsers.length < 2)
				return `MTGADraft ${
					this.titleNotification ? this.titleNotification.message : "- Multi-Player Draft Simulator"
				}`;
			else
				return `MTGADraft (${this.sessionUsers.length}/${this.maxPlayers}) ${
					this.titleNotification ? this.titleNotification.message : ""
				}`;
		},
	},
	async mounted() {
		// Load all card informations
		try {
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
				let worker = new Worker(new URL("./logstore.worker.ts", import.meta.url));
				worker.onmessage = (e) => {
					this.draftLogs = e.data;
					console.log(`Loaded ${this.draftLogs.length} saved draft logs.`);
				};
				worker.postMessage(["decompress", storedLogs]);
			}

			// If we're waiting on a storeDraftLogsTimeout, ask the user to wait and trigger the compressiong/storing immediatly
			window.addEventListener("beforeunload", this.beforeunload);

			for (let key in Sounds) Sounds[key].volume = 0.4;
			Sounds["countdown"].volume = 0.11;
			this.$nextTick(() => {
				this.applyFixedDeckSize();
			});
			this.ready = true;
		} catch (e) {
			alert(e);
		}
	},
	unmounted() {
		window.removeEventListener("beforeunload", this.beforeunload);
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
				this.socket.io.opts.query!.sessionID = this.sessionID;
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
				this.socket.io.opts.query!.userName = this.userName;
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
		fixedDeck() {
			this.storeSettings();
		},
		displayFixedDeck() {
			this.applyFixedDeckSize();
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
		boosterCardScale() {
			this.storeSettings();
		},
		deck() {
			this.updateAutoLands();
		},
		autoLand() {
			this.updateAutoLands();
		},
		lands: {
			deep: true,
			handler() {
				if (!this.socket) return;
				this.socket.emit("updateDeckLands", this.lands);
			},
		},
		targetDeckSize() {
			this.updateAutoLands();
			this.storeSettings();
		},
		sideboardBasics() {
			this.storeSettings();
		},
		preferredBasics() {
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
			this.socket.emit("setBots", this.bots);
		},
		maxPlayers() {
			if (this.userID != this.sessionOwner || !this.socket) return;
			if (this.maxPlayers < 1) return;
			document.title = this.pageTitle;
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
			handler(val: typeof this.boosterContent) {
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
		customCardListWithReplacement() {
			if (this.userID != this.sessionOwner || !this.socket) return;
			this.socket.emit("setCustomCardListWithReplacement", this.customCardListWithReplacement);
		},
		doubleMastersMode() {
			if (this.userID != this.sessionOwner || !this.socket) return;
			this.socket.emit("setDoubleMastersMode", this.doubleMastersMode);
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
});

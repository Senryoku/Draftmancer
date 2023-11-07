import type { ClientToServerEvents, LoaderOptions, ServerToClientEvents } from "@/SocketType";
import type { UserID } from "@/IDTypes";
import type { SetCode, IIndexable, Language } from "@/Types";
import { DistributionMode, DraftLogRecipients, ReadyState, UserData, UsersData } from "../../src/Session/SessionTypes";
import { ArenaID, Card, CardID, DeckList, PlainCollection, UniqueCard, UniqueCardID } from "@/CardTypes";
import type { DraftLog } from "@/DraftLog";
import type { BotScores } from "@/Bot";
import type { WinstonDraftSyncData } from "@/WinstonDraft";
import type { WinchesterDraftSyncData } from "@/WinchesterDraft";
import type { GridDraftSyncData } from "@/GridDraft";
import type { RochesterDraftSyncData } from "@/RochesterDraft";
import type { RotisserieDraftStartOptions, RotisserieDraftSyncData } from "@/RotisserieDraft";
import type { TeamSealedSyncData } from "@/TeamSealed";
import type { Bracket } from "@/Brackets";
import type { SocketAck } from "@/Message";
import type { Options } from "@/utils";
import type { JHHBooster } from "@/JumpstartHistoricHorizons";
import type { CustomCardList } from "@/CustomCardList";
import type SessionsSettingsProps from "@/Session/SessionProps";
import { MinesweeperSyncData } from "@/MinesweeperDraftTypes";
import { HousmanDraftSyncData } from "@/HousmanDraft";
import { minesweeperApplyDiff } from "../../src/MinesweeperDraftTypes";
import Constants, { CubeDescription, EnglishBasicLandNames } from "../../src/Constants";
import { CardColor, OptionalOnPickDraftEffect, UsableDraftEffect } from "../../src/CardTypes";

import io, { Socket } from "socket.io-client";
import { toRaw, defineComponent, defineAsyncComponent, Component } from "vue";
import { Sortable } from "sortablejs-vue3";
import Swal, { SweetAlertIcon, SweetAlertOptions, SweetAlertResult } from "sweetalert2";
import { SortableEvent } from "sortablejs";
import { createCommonApp } from "./appCommon";

import SetsInfos, { SetInfo } from "../../src/SetInfos";
import {
	isEmpty,
	randomStr4,
	guid,
	shortguid,
	getUrlVars,
	copyToClipboard,
	escapeHTML,
	sortableUpdate,
	onEnterBoosterCards,
} from "./helper";
import { eraseCookie, getCookie, setCookie } from "./cookies";
import { ButtonColor, Alert, fireToast } from "./alerts";
import parseCSV from "./parseCSV";

import LoadingComponent from "./components/LoadingComponent.vue";
import News from "./components/News.vue";
import Communities from "./components/Communities.vue";
import BoosterCard from "./components/BoosterCard.vue";
import CardComponent from "./components/Card.vue";
import CardPlaceholder from "./components/CardPlaceholder.vue";
import CardPool from "./components/CardPool.vue";
import CardPopup from "./components/CardPopup.vue";
import DelayedInput from "./components/DelayedInput.vue";
import Dropdown from "./components/Dropdown.vue";
import ExportDropdown from "./components/ExportDropdown.vue";
import Modal from "./components/Modal.vue";
import SetSelect from "./components/SetSelect.vue";
import GlimpseDialog from "./components/GlimpseDraftDialog.vue";
import GridDialog from "./components/GridDraftDialog.vue";
import HousmanDialog from "./components/HousmanDialog.vue";
import MinesweeperDialog from "./components/MinesweeperDraftDialog.vue";
import RotisserieDraftDialog from "./components/RotisserieDraftDialog.vue";
import SealedDialog from "./components/SealedDialog.vue";
import SealedPresentation from "./components/SealedPresentation.vue";
import SolomonDialog from "./components/SolomonDialog.vue";
import WinchesterDialog from "./components/WinchesterDraftDialog.vue";
import WinstonDialog from "./components/WinstonDraftDialog.vue";
import ScaleSlider from "./components/ScaleSlider.vue";

// Preload Carback
import CardBack from /* webpackPrefetch: true */ "./assets/img/cardback.webp";
import { SolomonDraftSyncData } from "@/SolomonDraft";
import { isSomeEnum } from "../../src/TypeChecks";
import { DraftSyncData } from "@/DraftState";
const img = new Image();
img.src = CardBack;

enum GameState {
	None = "None",
	Waiting = "Waiting",
	Picking = "Picking",
	Reviewing = "Reviewing",
	Brewing = "Brewing",
	Watching = "Watching",
	WinstonPicking = "WinstonPicking",
	WinstonWaiting = "WinstonWaiting",
	WinchesterPicking = "WinchesterPicking",
	WinchesterWaiting = "WinchesterWaiting",
	HousmanDraft = "HousmanDraft",
	SolomonDraft = "SolomonDraft",
	GridPicking = "GridPicking",
	GridWaiting = "GridWaiting",
	RochesterPicking = "RochesterPicking",
	RochesterWaiting = "RochesterWaiting",
	RotisserieDraft = "RotisserieDraft",
	MinesweeperPicking = "MinesweeperPicking",
	MinesweeperWaiting = "MinesweeperWaiting",
	TeamSealed = "TeamSealed",
}

enum PassingOrder {
	None,
	Left,
	Right,
	Repeat,
}

export const Sounds: { [name: string]: HTMLAudioElement } = {
	start: new Audio("sound/drop_003.ogg"),
	next: new Audio("sound/next.mp3"),
	countdown: new Audio("sound/click_001.ogg"),
	readyCheck: new Audio("sound/drop_003.ogg"),
};

const localStorageSettingsKey = "draftmancer-settings";
const localStorageSessionSettingsKey = "draftmancer-session-settings";
const sessionStorageWindowSpecificDataKey = "draftmancer-window-specific-data";

const defaultUserName = `Player_${randomStr4()}`;
// Backwards compatility: these used to be stored in cookies.
const cookieUserName = getCookie("userName", defaultUserName);
const cookieUseCollection = getCookie("useCollection", "true") === "true";
const cookieLanguage = getCookie("language", "en") as Language;

// Personal front-end settings
const defaultSettings = {
	userName: cookieUserName,
	useCollection: cookieUseCollection,
	language: cookieLanguage,
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
	autoLand: true,
};
const storedSettings = JSON.parse(localStorage.getItem(localStorageSettingsKey) ?? "{}");
const initialSettings: typeof defaultSettings = Object.assign({ ...defaultSettings }, storedSettings);

type SessionUser = {
	userID: string;
	userName: string;
	collection: boolean;
	useCollection: boolean;
	readyState: ReadyState;
};

const DraftLogLiveComponent = defineAsyncComponent(() => import("./components/DraftLogLive.vue"));
const ChooseColorComponent = defineAsyncComponent(() => import("./components/ChooseColor.vue"));
const ChoosePlayerComponent = defineAsyncComponent(() => import("./components/ChoosePlayer.vue"));

export default defineComponent({
	components: {
		BoosterCard,
		BracketComponent: defineAsyncComponent(() => import("./components/Bracket.vue")),
		Card: CardComponent,
		CardList: defineAsyncComponent(() => import("./components/CardList.vue")),
		CardPlaceholder,
		CardPool,
		CardPopup,
		CardStats: defineAsyncComponent(() => import("./components/CardStats.vue")),
		CollectionComponent: defineAsyncComponent({
			loader: () => import("./components/Collection.vue"),
			loadingComponent: LoadingComponent,
		}),
		CollectionImportHelp: defineAsyncComponent(() => import("./components/CollectionImportHelp.vue")),
		DelayedInput,
		DraftLog: defineAsyncComponent(() => import("./components/DraftLog.vue")),
		DraftLogHistory: defineAsyncComponent(() => import("./components/DraftLogHistory.vue")),
		DraftLogLiveComponent,
		DraftLogPick: defineAsyncComponent(() => import("./components/DraftLogPick.vue")),
		Dropdown,
		ExportDropdown,
		GettingStarted: defineAsyncComponent(() => import("./components/GettingStarted.vue")),
		GridDraft: defineAsyncComponent(() => import("./components/GridDraft.vue")),
		HelpModal: defineAsyncComponent(() => import("./components/HelpModal.vue")),
		HousmanDraft: defineAsyncComponent(() => import("./components/HousmanDraft.vue")),
		LandControl: defineAsyncComponent(() => import("./components/LandControl.vue")),
		MinesweeperDraft: defineAsyncComponent(() => import("./components/MinesweeperDraft.vue")),
		Modal,
		News,
		Communities,
		PatchNotes: defineAsyncComponent(() => import("./components/PatchNotes.vue")),
		PickSummary: defineAsyncComponent(() => import("./components/PickSummary.vue")),
		DraftQueue: defineAsyncComponent(() => import("./components/DraftQueue.vue")),
		RotisserieDraft: defineAsyncComponent(() => import("./components/RotisserieDraft.vue")),
		ScaleSlider,
		SetRestrictionComponent: defineAsyncComponent(() => import("./components/SetRestriction.vue")),
		SetSelect,
		SolomonDraft: defineAsyncComponent(() => import("./components/SolomonDraft.vue")),
		Sortable,
		SponsorModal: defineAsyncComponent(() => import("./components/SponsorModal.vue")),
		TeamSealed: defineAsyncComponent(() => import("./components/TeamSealed.vue")),
		WinchesterDraft: defineAsyncComponent(() => import("./components/WinchesterDraft.vue")),
		WinstonDraft: defineAsyncComponent(() => import("./components/WinstonDraft.vue")),
	},
	data: () => {
		const path = window.location.pathname.substring(1).split("/");
		const validPages = ["", "draftqueue"];
		const page = validPages.includes(path[0]) ? path[0] : "";

		// We'll first generate default User and Session IDs, then try to load previously used
		// ones from cookies (kept across browser launch), and finally from sessionStorage (tab specific).

		// This allows long-term storage of userID and sessionID across browser restarts for a single instance using cookies,
		// while providing short-term reconnection capability for multiple tabs using sessionStorage.

		// Server will handle the reconnect attempt if a draft is still ongoing.

		let userID: UserID = getCookie("userID", guid());
		setCookie("userID", userID);

		const urlParamSession = getUrlVars()["session"];
		let sessionID: string | undefined = urlParamSession
			? decodeURIComponent(urlParamSession)
			: getCookie("sessionID", shortguid());

		let userName = initialSettings.userName;

		// Restore game state from window-specific data (Each tab save its own data to allow multiple tabs to play and reconnect at the same time)
		const windowSpecificDataStr = sessionStorage.getItem(sessionStorageWindowSpecificDataKey);
		if (windowSpecificDataStr) {
			try {
				const windowSpecificData = JSON.parse(windowSpecificDataStr);
				if (
					windowSpecificData.userName &&
					windowSpecificData.userID &&
					windowSpecificData.sessionID &&
					(!urlParamSession || sessionID === windowSpecificData.sessionID) // Prioritize sessionID from URL if present
				) {
					userName = windowSpecificData.userName;
					userID = windowSpecificData.userID;
					sessionID = windowSpecificData.sessionID;
					console.log("Restored state for this tab:", windowSpecificData);
				}
			} catch (e) {
				console.error("Error retrieving window-specific data:", e);
			}
		}

		if (page === "draftqueue") sessionID = undefined;

		const storedSessionSettings = localStorage.getItem(localStorageSessionSettingsKey) ?? "{}";

		const query: Record<string, string> = {
			userID: userID,
			userName: userName,
			sessionSettings: storedSessionSettings,
		};
		if (sessionID) query.sessionID = sessionID; // Note: Setting sessionID to undefined will send it as the "undefined" string, and that's not what we want...

		// Socket Setup
		const socket: Socket<ServerToClientEvents, ClientToServerEvents> = io({
			transports: ["websocket", "polling"], // Immediately try websocket connection instead of polling first.
			query,
		});

		socket.on("connect_error", () => {
			// revert to classic upgrade
			socket.io.opts.transports = ["polling", "websocket"];
		});

		return {
			// Make these enums available in the template
			GameState: GameState,
			ReadyState,
			PassingOrder,

			sortableUpdate,

			page: page,
			// User Data
			userID: userID,
			userName: userName,
			useCollection: true, // Note: True value will be set later so it's automatically sync with the server.
			collection: {} as PlainCollection,
			collectionInfos: {
				wildcards: { common: 0, uncommon: 0, rare: 0, mythic: 0 },
				vaultProgress: 0,
			},
			socket: socket,
			socketConnected: true,

			// Session status
			managed: false, // Is the session managed by the server? (i.e. the session doesn't have an owner)
			sessionID: sessionID,
			sessionOwner: (sessionID ? userID : undefined) as UserID | undefined,
			sessionOwnerUsername: userName as string,
			sessionUsers: [] as SessionUser[],
			disconnectedUsers: {} as { [uid: UserID]: { userName: string } },
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
				bonus: 1,
			},
			usePredeterminedBoosters: false,
			colorBalance: true,
			maxDuplicates: null as { common: number; uncommon: number; rare: number; mythic: number } | null,
			foil: false,
			bots: 0,
			setRestriction: [Constants.MTGASets[Constants.MTGASets.length - 1]] as SetCode[],
			drafting: false,
			useCustomCardList: false,
			customCardListWithReplacement: false,
			customCardList: null as CustomCardList | null,
			doubleMastersMode: false,
			pickedCardsPerRound: 1,
			burnedCardsPerRound: 0,
			discardRemainingCardsAt: 0,
			maxTimer: 75,
			tournamentTimer: false,
			reviewTimer: 0,
			hidePicks: false,
			pickTimer: 75,
			personalLogs: true,
			draftLogRecipients: "everyone" as DraftLogRecipients,
			draftLogUnlockTimer: 0,
			bracketLocked: false,
			//
			draftLogs: [] as DraftLog[],
			currentDraftLog: null as DraftLog | null,
			draftLogLive: null as DraftLog | null,
			bracket: null as Bracket | null,
			virtualPlayersData: null as UsersData | null,

			botScores: null as BotScores | null,

			draftState: null as DraftSyncData | null,
			winstonDraftState: null as WinstonDraftSyncData | null,
			gridDraftState: null as GridDraftSyncData | null,
			rochesterDraftState: null as RochesterDraftSyncData | null,
			rotisserieDraftState: null as RotisserieDraftSyncData | null,
			minesweeperDraftState: null as MinesweeperSyncData | null,
			teamSealedState: null as TeamSealedSyncData | null,
			winchesterDraftState: null as WinchesterDraftSyncData | null,
			housmanDraftState: null as HousmanDraftSyncData | null,
			solomonDraftState: null as SolomonDraftSyncData | null,

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
			language: initialSettings.language,
			displayCollectionStatus: initialSettings.displayCollectionStatus,
			sets: Constants.MTGASets,
			primarySets: Constants.PrimarySets,
			cubeLists: Constants.CubeLists,
			pendingReadyCheck: false,
			setsInfos: SetsInfos,
			gameState: GameState.None,
			displayBotScores: initialSettings.displayBotScores,
			fixedDeck: initialSettings.fixedDeck,

			fixedDeckState: {
				ht: 400,
				mainHeight: "100vh", // Applied in the template as an inlined style
				y: 0,
				dy: 0,
			},
			pickOnDblclick: initialSettings.pickOnDblclick,
			boosterCardScale: initialSettings.boosterCardScale,
			enableSound: initialSettings.enableSound,
			enableNotifications:
				typeof Notification !== "undefined" &&
				Notification &&
				Notification.permission == "granted" &&
				initialSettings.enableNotifications,
			notificationPermission: typeof Notification !== "undefined" && Notification && Notification.permission,
			titleNotification: null as { timeout: ReturnType<typeof setTimeout>; message: string } | null,
			// Draft Booster
			pickInFlight: false,
			selectedCards: [] as UniqueCard[],
			burningCards: [] as UniqueCard[],
			selectedUsableDraftEffect: undefined as
				| undefined
				| { name: string; effect: UsableDraftEffect; cardID: UniqueCardID },
			selectedOptionalDraftPickEffect: undefined as
				| undefined
				| { name: string; effect: OptionalOnPickDraftEffect; cardID: UniqueCardID },
			// Brewing (deck and sideboard should not be modified directly, have to
			// stay in sync with their CardPool display)
			deck: [] as UniqueCard[],
			sideboard: [] as UniqueCard[],
			deckFilter: "",
			collapseSideboard: initialSettings.collapseSideboard,
			autoLand: initialSettings.autoLand,
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
				this.socketConnected = false;
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
				this.socketConnected = true;
				// Re-sync collection on reconnect.
				if (this.hasCollection) this.socket.emit("setCollection", this.collection);

				fireToast("success", "Reconnected!");
			});

			this.socket.on("alreadyConnected", async (newID) => {
				this.userID = newID;
				this.socket.io.opts.query!.userID = newID;
				const doNotShowAgainKey = "alreadyConnectedWarning-doNotShowAgain";
				const doNotShowAgain = localStorage.getItem(doNotShowAgainKey) === "true" ?? false;
				if (!doNotShowAgain) {
					const r = await Alert.fire({
						icon: "warning",
						title: "Already connected!",
						html: "<p>Draftmancer appears to already be open in another tab or window. Reconnection isn't fully supported in this scenario.</p><p>If this is intended, do not close tabs after launching a draft: <strong>You won't be able to reconnect!</strong></p><p><em>Refreshing</em> is still safe.</p>",
						showConfirmButton: true,
						confirmButtonText: "Got it!",
						input: "checkbox",
						inputPlaceholder: "Do not show again",
						allowOutsideClick: false,
					});
					if (r.value) localStorage.setItem(doNotShowAgainKey, "true");
				} else
					fireToast(
						"warning",
						"Multiple tabs open",
						"Closing this tab after launching a draft will prevent you from reconnecting."
					);
			});

			this.socket.on("stillAlive", (ack) => {
				if (ack) ack();
			});

			this.socket.on("chatMessage", (message) => {
				this.messagesHistory.push(message);
				// TODO: Cleanup this?
				const bubbleEl = document.querySelector("#chat-bubble-" + message.author);
				if (bubbleEl) {
					const bubble = bubbleEl as HTMLElement & { timeoutHandler: number };
					bubble.innerText = message.text;
					bubble.style.opacity = "1";
					if (bubble.timeoutHandler) clearTimeout(bubble.timeoutHandler);
					bubble.timeoutHandler = window.setTimeout(() => (bubble.style.opacity = "0"), 5000);
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
					this.gameState = GameState.Brewing;
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
				const user = this.userByID[data.userID];
				if (!user) {
					if (data.userID === this.sessionOwner && data.updatedProperties.userName)
						this.sessionOwnerUsername = data.updatedProperties.userName;
					return;
				}

				for (const prop in data.updatedProperties) {
					(user as IIndexable)[prop] = data.updatedProperties[prop as keyof typeof data.updatedProperties];
				}
			});

			this.socket.on("sessionOptions", (sessionOptions) => {
				// FIXME: Use accurate key type once we have it.
				for (const prop in sessionOptions)
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
				this.pickTimer = timer;
			});

			this.socket.on("takeoverVote", async (userName, callback) => {
				const r = await Alert.fire({
					title: `${userName} wants to remove the current owner and take the session ownership`,
					text: "Do you want to accept?",
					showConfirmButton: true,
					showDenyButton: true,
					confirmButtonText: "Yes",
					denyButtonText: "No",
					timer: 30 * 1000,
				});
				callback(r.isConfirmed ? true : r.isDenied ? false : null);
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

				const ownerUsername = !this.sessionOwner
					? "Session owner"
					: this.sessionOwner in this.userByID
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
					this.notifyTurn();
					this.gameState = GameState.WinstonPicking;
				} else {
					this.gameState = GameState.WinstonWaiting;
				}
			});
			this.socket.on("winstonDraftEnd", () => {
				this.drafting = false;
				this.winstonDraftState = null;
				this.gameState = GameState.Brewing;
				fireToast("success", "Done drafting!");
			});
			this.socket.on("winstonDraftRandomCard", (c) => {
				this.addToDeck(c);
				// Instantiate a card component to display in Swal (yep, I know.)
				const cardView = createCommonApp(CardComponent, { card: c });
				const el = document.createElement("div");
				cardView.mount(el);
				Alert.fire({
					position: "center",
					title: `You drew ${
						this.language in c.printed_names ? c.printed_names[this.language] : c.name
					} from the card pool!`,
					html: el,
					showConfirmButton: true,
				});
			});

			this.socket.on("rejoinWinstonDraft", (data) => {
				this.drafting = true;

				this.setWinstonDraftState(data.state);
				this.clearState();
				this.$nextTick(() => {
					for (const c of data.pickedCards.main) this.addToDeck(c);
					for (const c of data.pickedCards.side) this.addToSideboard(c);

					if (this.userID === data.state.currentPlayer) this.gameState = GameState.WinstonPicking;
					else this.gameState = GameState.WinstonWaiting;

					Alert.fire({
						position: "center",
						icon: "success",
						title: "Reconnected to the Winston draft!",
						showConfirmButton: false,
						timer: 1500,
					});
				});
			});

			// Winchester Draft

			this.socket.on("startWinchesterDraft", (state) => {
				startDraftSetup("Winchester draft");
				this.winchesterDraftState = state;
				this.gameState =
					state.currentPlayer === this.userID ? GameState.WinchesterPicking : GameState.WinchesterWaiting;
			});
			this.socket.on("winchesterDraftSync", (state) => {
				this.winchesterDraftState = state;
				this.gameState =
					state.currentPlayer === this.userID ? GameState.WinchesterPicking : GameState.WinchesterWaiting;
			});
			this.socket.on("winchesterDraftEnd", () => {
				this.drafting = false;
				this.winchesterDraftState = null;
				this.gameState = GameState.Brewing;
				fireToast("success", "Done drafting!");
			});

			this.socket.on("rejoinWinchesterDraft", (data) => {
				this.clearState();
				this.drafting = true;
				this.winchesterDraftState = data.state;
				this.$nextTick(() => {
					for (const c of data.pickedCards.main) this.addToDeck(c);
					for (const c of data.pickedCards.side) this.addToSideboard(c);

					this.gameState =
						data.state.currentPlayer === this.userID
							? GameState.WinchesterPicking
							: GameState.WinchesterWaiting;

					Alert.fire({
						position: "center",
						icon: "success",
						title: "Reconnected to the Winchester draft!",
						showConfirmButton: false,
						timer: 1500,
					});
				});
			});

			this.socket.on("startHousmanDraft", (state) => {
				startDraftSetup("Housman draft");
				this.housmanDraftState = state;
				this.gameState = GameState.HousmanDraft;
			});
			this.socket.on("rejoinHousmanDraft", (data) => {
				this.clearState();
				this.drafting = true;
				this.gameState = GameState.HousmanDraft;
				this.housmanDraftState = data.state;
				this.$nextTick(() => {
					for (const c of data.pickedCards.main) this.addToDeck(c);
					for (const c of data.pickedCards.side) this.addToSideboard(c);

					Alert.fire({
						position: "center",
						icon: "success",
						title: "Reconnected to the Housman draft!",
						showConfirmButton: false,
						timer: 1500,
					});
				});
			});

			this.socket.on("startSolomonDraft", (state) => {
				startDraftSetup("Solomon draft");
				this.solomonDraftState = state;
				this.gameState = GameState.SolomonDraft;
			});
			this.socket.on("rejoinSolomonDraft", (data) => {
				this.clearState();
				this.drafting = true;
				this.gameState = GameState.SolomonDraft;
				this.solomonDraftState = data.state;
				this.$nextTick(() => {
					for (const c of data.pickedCards.main) this.addToDeck(c);
					for (const c of data.pickedCards.side) this.addToSideboard(c);

					Alert.fire({
						position: "center",
						icon: "success",
						title: "Reconnected to the Solomon draft!",
						showConfirmButton: false,
						timer: 1500,
					});
				});
			});

			// Grid Draft
			this.socket.on("startGridDraft", (state) => {
				startDraftSetup("Grid draft");
				this.gameState = this.userID === state.currentPlayer ? GameState.GridPicking : GameState.GridWaiting;
				this.setGridDraftState(state);
			});
			this.socket.on("gridDraftNextRound", (state) => {
				const doNextRound = () => {
					this.setGridDraftState(state);
					if (this.userID === state.currentPlayer) {
						this.notifyTurn();
						this.gameState = GameState.GridPicking;
					} else {
						this.gameState = GameState.GridWaiting;
					}
				};

				// Next booster, add a slight delay so user can see the last pick (Unless we're in testing).
				if (this.gridDraftState?.currentPlayer === null) {
					setTimeout(doNextRound, navigator.webdriver ? 10 : 2500);
				} else doNextRound();
			});
			this.socket.on("gridDraftEnd", () => {
				// Adds a slight deplay while the last pick is displayed.
				setTimeout(
					() => {
						this.drafting = false;
						this.gridDraftState = null;
						this.gameState = GameState.Brewing;
						fireToast("success", "Done drafting!");
					},
					this.gridDraftState?.currentPlayer === null ? (navigator.webdriver ? 10 : 2500) : 0
				);
			});

			this.socket.on("rejoinGridDraft", (data) => {
				this.drafting = true;

				this.setGridDraftState(data.state);
				this.clearState();
				this.$nextTick(() => {
					for (const c of data.pickedCards.main) this.addToDeck(c);
					for (const c of data.pickedCards.side) this.addToSideboard(c);

					if (this.userID === data.state.currentPlayer) this.gameState = GameState.GridPicking;
					else this.gameState = GameState.GridWaiting;

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
				this.gameState =
					this.userID === state.currentPlayer ? GameState.RochesterPicking : GameState.RochesterWaiting;
				this.setRochesterDraftState(state);
			});
			this.socket.on("rochesterDraftNextRound", (state) => {
				this.setRochesterDraftState(state);
				if (this.userID === state.currentPlayer) {
					this.notifyTurn();
					this.gameState = GameState.RochesterPicking;
					this.selectedCards = [];
				} else {
					this.gameState = GameState.RochesterWaiting;
				}
			});
			this.socket.on("rochesterDraftEnd", () => {
				this.drafting = false;
				this.rochesterDraftState = null;
				this.gameState = GameState.Brewing;
				fireToast("success", "Done drafting!");
			});

			this.socket.on("rejoinRochesterDraft", (data) => {
				this.drafting = true;

				this.setRochesterDraftState(data.state);
				this.clearState();
				this.$nextTick(() => {
					for (const c of data.pickedCards.main) this.addToDeck(c);
					for (const c of data.pickedCards.side) this.addToSideboard(c);

					if (this.userID === data.state.currentPlayer) this.gameState = GameState.RochesterPicking;
					else this.gameState = GameState.RochesterWaiting;

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
				this.gameState = GameState.RotisserieDraft;
				this.rotisserieDraftState = state;
			});
			this.socket.on("rotisserieDraftUpdateState", (uniqueCardID, newOwnerID, currentPlayer) => {
				if (!this.rotisserieDraftState) return;
				this.rotisserieDraftState.currentPlayer = currentPlayer;
				++this.rotisserieDraftState.pickNumber;

				const card = this.rotisserieDraftState.cards.find((c) => c.uniqueID === uniqueCardID);
				if (!card) return;
				card.owner = newOwnerID;

				if (!this.rotisserieDraftState.lastPicks) this.rotisserieDraftState.lastPicks = []; // FIXME: Here for backward compatibility. Will soon be safely removable.
				this.rotisserieDraftState.lastPicks.push(uniqueCardID);
				if (this.rotisserieDraftState.lastPicks.length > 8) this.rotisserieDraftState.lastPicks.shift();

				if (this.userID === this.rotisserieDraftState.currentPlayer) this.notifyTurn();
			});
			this.socket.on("rotisserieDraftEnd", () => {
				this.drafting = false;
				this.rotisserieDraftState = null;
				this.gameState = GameState.Brewing;
				fireToast("success", "Done drafting!");
			});

			this.socket.on("rejoinRotisserieDraft", (data) => {
				this.clearState();
				this.drafting = true;
				this.gameState = GameState.RotisserieDraft;
				this.$nextTick(() => {
					for (const c of data.pickedCards.main) this.addToDeck(c);
					for (const c of data.pickedCards.side) this.addToSideboard(c);

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
				this.gameState =
					this.userID === state.currentPlayer ? GameState.MinesweeperPicking : GameState.MinesweeperWaiting;
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
						this.gameState = GameState.Brewing;
						fireToast("success", "Done drafting!");
					},
					options?.immediate ? 0 : 1000
				);
			});
			this.socket.on("rejoinMinesweeperDraft", (data) => {
				this.drafting = true;

				this.setMinesweeperDraftState(data.state);
				this.clearState();
				this.$nextTick(() => {
					for (const c of data.pickedCards.main) this.addToDeck(c);
					for (const c of data.pickedCards.side) this.addToSideboard(c);

					if (this.userID === data.state.currentPlayer) this.gameState = GameState.MinesweeperPicking;
					else this.gameState = GameState.MinesweeperWaiting;

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
				this.gameState = GameState.TeamSealed;
			});

			this.socket.on("rejoinTeamSealed", (data) => {
				this.drafting = true;

				startDraftSetup("team sealed", "Rejoined Team Sealed!");
				this.teamSealedState = data.state;
				this.gameState = GameState.TeamSealed;

				this.deckDisplay?.sync();
				this.sideboardDisplay?.sync();
				this.$nextTick(() => {
					for (const c of data.pickedCards.main) this.addToDeck(c);
					for (const c of data.pickedCards.side) this.addToSideboard(c);
				});
			});

			this.socket.on("startTeamSealedSpectator", () => {
				this.drafting = true;
				this.gameState = GameState.Watching;
			});

			this.socket.on("endTeamSealed", () => {
				fireToast("success", "Team Sealed stopped!");
				this.drafting = false;
				this.draftPaused = false;
				if (this.gameState === GameState.Watching) {
					// As player list will be reverting to its non-drafting state, click events used to select player have to be re-registered.
					this.$nextTick(() => {
						this.draftLogLiveComponentRef?.registerPlayerSelectEvents();
					});
				} else this.gameState = GameState.Brewing;
			});

			this.socket.on("teamSealedUpdateCard", (cardUniqueID, newOwnerID) => {
				if (!this.drafting || this.gameState !== GameState.TeamSealed || !this.teamSealedState) return;

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
					this.deckDisplay?.sync();
					this.sideboardDisplay?.sync();
				});
			});

			const startDraftSetup = (name = "draft", msg = "Draft Started!") => {
				// Save user ID in case of disconnect
				setCookie("userID", this.userID);

				sessionStorage.setItem(
					sessionStorageWindowSpecificDataKey,
					JSON.stringify({ userName: this.userName, userID: this.userID, sessionID: this.sessionID })
				);

				if (this.sessionID) setCookie("sessionID", this.sessionID);
				this.updateURLQuery();

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
					this.gameState = GameState.Watching;
				}
			});

			this.socket.on("rejoinDraft", (data) => {
				this.drafting = true;
				this.clearState();
				// Let vue react to changes to card pools
				this.$nextTick(() => {
					for (const c of data.pickedCards.main) this.addToDeck(c);
					for (const c of data.pickedCards.side) this.addToSideboard(c);

					this.draftState = data.state;
					if (this.draftState.booster) {
						this.gameState = GameState.Picking;
					} else if (this.gameState !== GameState.Reviewing) this.gameState = GameState.Waiting;

					this.selectedCards = [];
					this.burningCards = [];

					Alert.fire({
						position: "center",
						icon: "success",
						title: "Reconnected to the draft!",
						showConfirmButton: false,
						timer: 1500,
					});

					this.deckDisplay?.sync();
					this.sideboardDisplay?.sync();
				});
			});

			this.socket.on("draftState", (data) => {
				// Only watching, not playing/receiving a booster ourself.
				if (this.gameState === GameState.Watching) {
					this.draftState = data;
					return;
				}

				if ("boosterCount" in data && data.boosterCount > 0) {
					if (
						!this.draftState ||
						!this.draftState.booster ||
						this.draftState.booster.length === 0 ||
						this.draftState.pickNumber !== data.pickNumber ||
						this.draftState.boosterNumber !== data.boosterNumber
					) {
						this.botScores = null; // Clear bot scores
						this.selectedCards = [];
						this.burningCards = [];
						this.playSound("next");
					}
					this.draftState = data;
					this.gameState = GameState.Picking;
				} else {
					if (this.gameState !== GameState.Reviewing) {
						// No new booster, don't update the state yet.
						this.gameState = GameState.Waiting;
					}
				}
			});

			this.socket.on("startReviewPhase", (timer) => {
				this.gameState = GameState.Reviewing;
				this.pickTimer = Math.ceil(timer);
				// This one is purely visual.
				const interval = setInterval(() => {
					--this.pickTimer;
					if (this.pickTimer <= 0 || this.pickTimer >= timer) clearInterval(interval);
				}, 1000);
			});

			this.socket.on("updateCardState", (updates) => {
				for (const update of updates) {
					const card = this.deck.find((c) => c.uniqueID === update.cardID);
					if (!card) this.sideboard.find((c) => c.uniqueID === update.cardID);
					if (card) card.state = update.state;
				}
			});

			this.socket.on("botRecommandations", (data) => {
				if (data.pickNumber === this.draftState?.pickNumber) this.botScores = data.scores;
			});

			this.socket.on("endDraft", () => {
				fireToast("success", "Done drafting!");
				this.drafting = false;
				this.draftPaused = false;
				if (this.gameState === GameState.Watching) {
					// As player list will be reverting to its non-drafting state, click events used to select player have to be re-registered.
					this.$nextTick(() => {
						this.draftLogLiveComponentRef?.registerPlayerSelectEvents();
					});
				} else this.gameState = GameState.Brewing;
				// Clear sessionID for managed sessions
				if (this.managed) eraseCookie("sessionID");
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
					if (data.decklist) {
						const decklist: Partial<DeckList> = data.decklist;
						if (!decklist.main) decklist.main = [];
						if (!decklist.side) decklist.side = [];
						this.draftLogs[idx].users[data.userID!].decklist = decklist as DeckList;
					} else this.draftLogs[idx].users[data.userID].decklist = data.decklist;
					this.storeDraftLogs();
				}
			});

			this.socket.on("draftLogLive", (data) => {
				if (data.log) this.draftLogLive = data.log;

				if (!this.draftLogLive) return;

				if (data.pick) this.draftLogLive.users[data.userID!].picks.push(data.pick);
				if (data.decklist) {
					const decklist: Partial<DeckList> = data.decklist;
					if (!decklist.main) decklist.main = [];
					if (!decklist.side) decklist.side = [];
					this.draftLogLive.users[data.userID!].decklist = decklist as DeckList;
				}
			});

			this.socket.on("pickAlert", (data) => {
				fireToast(
					"info",
					`${data.userName} picked ${data.cards
						.map((s) => (s.printed_names[this.language] ? s.printed_names[this.language] : s.name))
						.join(", ")}!`
				);
				this.draftLogLiveComponentRef?.newPick(data);
			});

			this.socket.on("selectJumpstartPacks", this.selectJumpstartPacks);

			this.socket.on("sealedBoosters", (boosters) => {
				const cards = boosters.reduce((acc, val) => acc.concat(val), []);
				this.spawnDialog(SealedPresentation, {
					// Note: SealedPresentation has the ability to present boosters one by one, we're not using it, yet.
					//       e.g. boosters: boosters
					boosters: [cards.filter((c) => c.rarity !== "common" && c.rarity !== "uncommon")],
					title: "Sealed - Rares and Mythics",
				});
				this.setCardPool(cards);
			});

			this.socket.on("setCardPool", this.setCardPool);

			this.socket.on("addCards", (message, cards) => {
				fireToast("info", `${message} ${cards.map((c) => c.name).join(", ")}`);
				this.addToDeck(cards);
			});

			this.socket.on("timer", (data) => {
				if (data.countdown < 0) data.countdown = 0;
				if (data.countdown <= 0) this.$nextTick(this.forcePick);
				if (data.countdown < 10) {
					const chrono = document.getElementById("chrono");
					if (chrono) {
						chrono.classList.add("pulsing");
						setTimeout(() => {
							const chrono = document.getElementById("chrono");
							if (chrono) chrono.classList.remove("pulsing");
						}, 500);
					}
				}
				if (data.countdown <= 5) this.playSound("countdown");
				this.pickTimer = data.countdown;
			});

			this.socket.on("disableTimer", () => {
				this.pickTimer = -1;
			});

			this.socket.on("askColor", (userName, card, ack) => {
				const el = document.createElement("div");
				el.style.position = "absolute";
				this.$el.appendChild(el);
				const instance = createCommonApp(ChooseColorComponent, {
					userName: userName,
					card: card,
					onTImeout: () => {
						instance.unmount();
						el.parentNode?.removeChild(el);
					},
					onSelectColor: (color: CardColor) => {
						ack(color);
						instance.unmount();
						el.parentNode?.removeChild(el);
					},
				});
				instance.mount(el);
			});

			this.socket.on("choosePlayer", (reason, users, ack) => {
				const el = document.createElement("div");
				el.style.position = "absolute";
				this.$el.appendChild(el);
				const instance = createCommonApp(ChoosePlayerComponent, {
					sessionUsers: this.sessionUsers,
					reason: reason,
					users: users,
					onTImeout: () => {
						instance.unmount();
						el.parentNode?.removeChild(el);
					},
					onChoose: (uid: UserID) => {
						ack(uid);
						instance.unmount();
						el.parentNode?.removeChild(el);
					},
				});
				instance.mount(el);
			});
		},
		loadPreviousDeck() {
			const d = this.previousDeck;
			if (!d) return;
			this.loadDeck(d.log, d.uid);
		},
		loadDeckFromLogs(log: DraftLog, uid: UserID) {
			this.loadDeck(log, uid);
			this.displayedModal = "";
		},
		loadDeck(log: DraftLog, uid: UserID) {
			const s = log.users[uid].decklist ?? {
				main: log.users[uid].cards,
				side: [],
			};
			let uniqueID = 0;
			const getUnique = (cid: string) => {
				return { uniqueID: uniqueID++, ...log.carddata[cid] };
			};
			const d = {
				main: s.main.map(getUnique),
				side: s.side.map(getUnique),
			};
			this.clearDeck();
			this.clearSideboard();
			this.addToDeck(d.main);
			this.addToSideboard(d.side);
			this.gameState = GameState.Brewing;
		},
		clearState() {
			this.disconnectedUsers = {};
			this.virtualPlayersData = null;
			this.clearSideboard();
			this.clearDeck();
			this.deckFilter = "";
			this.lands = { W: 0, U: 0, B: 0, R: 0, G: 0 };
			this.currentDraftLog = null;
			this.draftState = null;
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
				bonus: 1,
			};
			this.usePredeterminedBoosters = false;
			this.colorBalance = true;
			this.maxDuplicates = null;
			this.foil = false;
			this.bots = 0;
			this.setRestriction = [];
			this.drafting = false;
			this.useCustomCardList = false;
			this.customCardList = null;
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
		showLoader(options: LoaderOptions) {
			let { title } = options;
			title = escapeHTML(title);
			Alert.fire({
				toast: true,
				position: "top-end",
				icon: "info",
				title: title,
				showConfirmButton: false,
				didOpen: (toast) => {
					// If another swal is fired right after this one, the callback may be called on the wrong one...
					if (toast.innerText.includes(title)) {
						Alert.showLoading();
						toast.addEventListener("click", (e: Event) => {
							e.preventDefault();
							Swal.close();
						});
					}
				},
			});
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
		setCardPool(cards: UniqueCard[]) {
			if (!cards || cards.length === 0) return;
			this.clearState();
			// Let vue react to changes to card pools
			this.$nextTick(() => {
				this.addToDeck(cards);
				this.gameState = GameState.Brewing;
				fireToast("success", "Cards received!");
				this.pushNotification("Cards received!");
			});
		},
		// Draft Methods
		async startDraft() {
			if (this.userID != this.sessionOwner) return false;
			const proposedBots = this.maxPlayers <= 1 ? 7 : Math.max(0, this.maxPlayers - 1);
			if (!this.teamDraft && this.sessionUsers.length + this.bots < 2) {
				const ret = await Alert.fire({
					icon: "info",
					title: "Not enough players",
					html: `At least 2 players, including bots, are required to start a draft. Add bots, or join a <a href="/draftqueue">Draft queue</a> to be automatically matched with other players.`,
					showDenyButton: true,
					showCancelButton: true,
					denyButtonColor: "darkgreen",
					denyButtonText: `Draft alone with ${proposedBots} bots`,
					confirmButtonText: `Go to Draft Queues`,
				});
				if (ret.isDenied) {
					this.bots = proposedBots;
					await this.$nextTick();
				} else if (ret.isConfirmed) {
					window.location.href = "/draftqueue";
					return false;
				} else return false;
			}

			const ack = (response: SocketAck) => {
				if (response.error) Alert.fire(response.error);
			};

			if (this.deck.length > 0) {
				const ret = await Alert.fire({
					title: "Are you sure?",
					text: "Launching a new draft will reset everyones cards/deck!",
					icon: "warning",
					showCancelButton: true,
					confirmButtonColor: ButtonColor.Critical,
					cancelButtonColor: ButtonColor.Safe,
					confirmButtonText: "Launch draft!",
				});
				if (ret.isConfirmed) {
					this.socket.emit("startDraft", ack);
					return true;
				} else return false;
			} else {
				this.socket.emit("startDraft", ack);
				return true;
			}
			return false;
		},
		stopDraft() {
			if (this.userID != this.sessionOwner) return;
			Alert.fire({
				title: "Are you sure?",
				text: "Do you really want to stop the game for all players?",
				icon: "warning",
				showCancelButton: true,
				confirmButtonColor: ButtonColor.Critical,
				cancelButtonColor: ButtonColor.Safe,
				confirmButtonText: "Stop the game!",
			}).then((result) => {
				if (result.value) this.socket.emit("stopDraft");
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
				this.selectedCards.push(c);
				while (this.selectedCards.length > 0 && this.selectedCards.length > this.cardsToPick)
					this.selectedCards.shift();
				this.restoreCard(null, c);
			}
		},
		burnCard(e: Event, c: UniqueCard) {
			if (this.burningCards.includes(c)) return;
			if (this.selectedCards.includes(c)) this.selectedCards.splice(this.selectedCards.indexOf(c), 1);
			this.burningCards.push(c);
			if (this.burningCards.length > this.draftState!.burnsThisRound) this.burningCards.shift();
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

			if (
				e.dataTransfer?.types.includes("isboostercard") ||
				// Allow dropping picks during Rotisserie draft if it is our turn to pick.
				(e.dataTransfer?.types.includes("isrotisseriedraft") &&
					this.gameState === GameState.RotisserieDraft &&
					this.rotisserieDraftState?.currentPlayer === this.userID)
			) {
				e.preventDefault();
				e.dataTransfer.dropEffect = "move";
				// Mark the closest column as drop-active for feedback using a css effect
				if (e.target instanceof HTMLElement) {
					const column = e.target.closest(".card-column");
					column?.setAttribute("drop-active", "true");
				}
				return;
			}
		},
		onDragLeave(e: DragEvent) {
			if (e.target instanceof HTMLElement) {
				const column = e.target.closest(".card-column");
				column?.removeAttribute("drop-active");
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
			this.$el.querySelectorAll(".card-column").forEach((column: HTMLElement) => {
				column.removeAttribute("drop-active");
			});

			// Filter other events; Disable when we're not picking (probably useless buuuuut...)
			if (
				e.dataTransfer?.getData("isboostercard") === "true" &&
				(this.gameState === GameState.Picking || this.gameState === GameState.RochesterPicking)
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
				this.gameState === GameState.RotisserieDraft &&
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
				(this.gameState !== GameState.Picking && this.gameState !== GameState.RochesterPicking)
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
				if (!this.draftState && !this.rochesterDraftState) return;

				const state = this.draftState ?? this.rochesterDraftState!;

				const selectedCards = this.selectedCards;
				const burningCards = this.burningCards;
				const toSideboard = options?.toSideboard;

				const boosterBackup = structuredClone(toRaw(state.booster));

				const onSuccess: (() => void)[] = [];

				onSuccess.push(() => {
					this.selectedCards = [];
					this.burningCards = [];
				});

				const ack = (answer: SocketAck) => {
					this.pickInFlight = false;
					if (answer.code !== 0) {
						// Restore cardPool and booster state
						this.deck = this.deck.filter((c) => !selectedCards.includes(c));
						this.sideboard = this.sideboard.filter((c) => !selectedCards.includes(c));
						state!.booster = boosterBackup;
						this.selectedUsableDraftEffect = undefined; // Reset effects since it's probably an effect that triggered the error in the first place.
						this.gameState = GameState.Picking;
						Alert.fire(answer.error as SweetAlertOptions);
					} else {
						if (toSideboard)
							for (const cuid of selectedCards.map((c) => c.uniqueID))
								this.socket.emit("moveCard", cuid, "side");
						for (const callback of onSuccess) callback();
					}
				};

				let dontAddSelectedCardstoCardPool = false;

				if (this.rochesterDraftState) {
					this.socket.emit(
						"rochesterDraftPick",
						selectedCards.map((c) => this.rochesterDraftState!.booster.findIndex((c2) => c === c2)),
						ack
					);
					this.gameState = GameState.RochesterWaiting;
				} else {
					let draftEffect:
						| {
								effect: UsableDraftEffect;
								cardID: UniqueCardID;
						  }
						| undefined;
					if (this.selectedUsableDraftEffect) {
						draftEffect = {
							effect: this.selectedUsableDraftEffect.effect,
							cardID: this.selectedUsableDraftEffect.cardID,
						};
						switch (draftEffect!.effect) {
							case UsableDraftEffect.CogworkLibrarian: {
								onSuccess.push(() => {
									// Remove used Cogwork Libarian from player's card pool
									let index = this.deck.findIndex((c) => c.uniqueID === draftEffect!.cardID);
									if (index >= 0) {
										this.deckDisplay?.remCard(this.deck[index]);
										this.deck.splice(index, 1);
									} else {
										index = this.sideboard.findIndex((c) => c.uniqueID === draftEffect!.cardID);
										if (index >= 0) {
											this.sideboardDisplay?.remCard(this.sideboard[index]);
											this.sideboard.splice(index, 1);
										} else fireToast("error", "Could not find your Cogwork Librarian...");
									}
								});
								break;
							}
							case UsableDraftEffect.AgentOfAcquisitions: {
								if (toSideboard) this.addToSideboard(state.booster, options);
								else this.addToDeck(state.booster, options);
								dontAddSelectedCardstoCardPool = true;
								break;
							}
							case UsableDraftEffect.RemoveDraftCard:
								dontAddSelectedCardstoCardPool = true;
								break;
						}
						onSuccess.push(() => {
							this.selectedUsableDraftEffect = undefined;
						});
					}
					let optionalOnPickDraftEffect:
						| {
								effect: OptionalOnPickDraftEffect;
								cardID: UniqueCardID;
						  }
						| undefined;
					if (this.selectedOptionalDraftPickEffect) {
						optionalOnPickDraftEffect = {
							effect: this.selectedOptionalDraftPickEffect.effect,
							cardID: this.selectedOptionalDraftPickEffect.cardID,
						};
						onSuccess.push(() => {
							this.selectedOptionalDraftPickEffect = undefined;
						});
					}

					this.socket.emit(
						"pickCard",
						{
							pickedCards: selectedCards.map((c) => state!.booster.findIndex((c2) => c === c2)),
							burnedCards: burningCards.map((c) => state!.booster.findIndex((c2) => c === c2)),
							draftEffect,
							optionalOnPickDraftEffect,
						},
						ack
					);
					this.gameState = GameState.Waiting;
				}
				// Removes picked & burned cards for animation
				state.booster = state.booster.filter((c) => !selectedCards.includes(c) && !burningCards.includes(c));
				if (!dontAddSelectedCardstoCardPool)
					if (toSideboard) this.addToSideboard(selectedCards, options);
					else this.addToDeck(selectedCards, options);
			});
			this.pickInFlight = true;
		},
		passBooster() {
			this.socket.emit("passBooster");
		},
		forcePick() {
			if ((!this.draftState && !this.rochesterDraftState) || this.gameState !== GameState.Picking) return;

			if (this.draftState?.skipPick) return this.passBooster();

			const state = this.draftState ?? this.rochesterDraftState!;

			// Uses botScores to automatically select picks if available
			if (this.botScores) {
				const orderedPicks = [];
				for (let i = 0; i < this.botScores.scores.length; ++i) orderedPicks.push(i);
				orderedPicks.sort((lhs, rhs) => {
					return this.botScores!.scores[rhs] - this.botScores!.scores[lhs];
				});
				let currIdx = 0;
				while (currIdx < orderedPicks.length && this.selectedCards.length < this.cardsToPick) {
					while (
						currIdx < orderedPicks.length &&
						(this.selectedCards.includes(state.booster[orderedPicks[currIdx]]) ||
							this.burningCards.includes(state.booster[orderedPicks[currIdx]]))
					)
						++currIdx;
					if (currIdx < orderedPicks.length) this.selectedCards.push(state.booster[orderedPicks[currIdx]]);
					++currIdx;
				}
				currIdx = 0;
				orderedPicks.reverse();
				while (currIdx < orderedPicks.length && this.burningCards.length < this.cardsToBurnThisRound) {
					while (
						currIdx < orderedPicks.length &&
						(this.selectedCards.includes(state.booster[orderedPicks[currIdx]]) ||
							this.burningCards.includes(state.booster[orderedPicks[currIdx]]))
					)
						++currIdx;
					if (currIdx < orderedPicks.length) this.burningCards.push(state.booster[orderedPicks[currIdx]]);
					++currIdx;
				}
			}

			// Forces a random card if there isn't enough selected already
			while (this.selectedCards.length < this.cardsToPick) {
				let randomIdx;
				do randomIdx = Math.floor(Math.random() * state.booster.length);
				while (
					this.selectedCards.includes(state.booster[randomIdx]) ||
					this.burningCards.includes(state.booster[randomIdx])
				);
				this.selectedCards.push(state.booster[randomIdx]);
			}
			// Forces random cards to burn if there isn't enough selected already
			while (this.burningCards.length < this.cardsToBurnThisRound) {
				let randomIdx;
				do randomIdx = Math.floor(Math.random() * state.booster.length);
				while (
					this.selectedCards.includes(state.booster[randomIdx]) ||
					this.burningCards.includes(state.booster[randomIdx])
				);
				this.burningCards.push(state.booster[randomIdx]);
			}
			this.pickCard();
		},
		notifyTurn() {
			this.playSound("next");
			fireToast("info", "Your turn!");
			this.pushNotification("Your turn!", {
				body: `This is your turn to pick.`,
			});
		},
		spawnDialog<T extends Component>(rootComponent: T, props: object) {
			const el = document.createElement("div");
			el.style.position = "absolute";
			this.$el.appendChild(el);
			const instance = createCommonApp(rootComponent, {
				...props,
				onClose: () => {
					instance.unmount();
					el.parentNode?.removeChild(el);
				},
			});
			instance.mount(el);
			return instance;
		},
		setWinstonDraftState(state: WinstonDraftSyncData) {
			this.winstonDraftState = state;
		},
		startWinstonDraft() {
			if (this.userID != this.sessionOwner || this.drafting) return;
			if (!this.ownerIsPlayer) {
				Alert.fire({
					icon: "error",
					title: "Spectator mode not supported",
					text: "Non-playing owner is not supported in Winston Draft. The 'Spectate as Session Owner' option must be disabled.",
				});
			} else {
				this.spawnDialog(WinstonDialog, {
					onStart: (boostersPerPlayer: number) => {
						this.socket.emit("startWinstonDraft", boostersPerPlayer, true, (answer: SocketAck) => {
							if (answer.code !== 0 && answer.error) Alert.fire(answer.error);
						});
					},
				});
			}
		},
		winstonDraftTakePile() {
			if (!this.winstonDraftState) return;
			const cards = this.winstonDraftState.piles[this.winstonDraftState.currentPile] as UniqueCard[];
			this.socket.emit("winstonDraftTakePile", (answer) => {
				if (answer.code === 0) for (const c of cards) this.addToDeck(c);
				else console.error(answer);
			});
		},
		winstonDraftSkipPile() {
			this.socket.emit("winstonDraftSkipPile", (answer) => {
				if (answer.code !== 0) {
					console.error(answer);
				}
			});
		},
		startWinchesterDraft: async function () {
			if (this.userID !== this.sessionOwner || this.drafting) return;
			if (!this.ownerIsPlayer) {
				Alert.fire({
					icon: "error",
					title: "Spectator mode not supported",
					text: "Non-playing owner is not supported in Winchester Draft. The 'Spectate as Session Owner' option must be disabled.",
				});
			} else {
				this.spawnDialog(WinchesterDialog, {
					onStart: (boostersPerPlayer: number) => {
						this.socket.emit("startWinchesterDraft", boostersPerPlayer, true, (answer: SocketAck) => {
							if (answer.code !== 0 && answer.error) Alert.fire(answer.error);
						});
					},
				});
			}
		},
		winchesterDraftPick(index: number) {
			if (!this.winchesterDraftState) return;
			const cards = this.winchesterDraftState.piles[index];
			this.socket.emit("winchesterDraftPick", index, (answer) => {
				if (answer.code === 0) for (const c of cards) this.addToDeck(c);
				else console.error(answer);
			});
		},
		setGridDraftState(state: GridDraftSyncData) {
			const prevBooster = this.gridDraftState ? this.gridDraftState.booster : null;
			this.gridDraftState = state;
			const booster = [];
			let idx = 0;
			for (const card of this.gridDraftState.booster) {
				if (card) {
					if (prevBooster && prevBooster[idx] && prevBooster[idx]!.id === card.id)
						booster.push(prevBooster[idx]);
					else booster.push(card);
				} else booster.push(null);
				++idx;
			}
			this.gridDraftState.booster = booster;
		},
		startHousmanDraft() {
			if (this.userID !== this.sessionOwner || this.drafting) return;

			this.spawnDialog(HousmanDialog, {
				onStart: (
					handSize: number,
					revealedCardsCount: number,
					exchangeCount: number,
					roundCount: number,
					removeBasicLands: boolean
				) => {
					this.deckWarning(
						(
							handSize: number,
							revealedCardsCount: number,
							exchangeCount: number,
							roundCount: number,
							removeBasicLands: boolean
						) => {
							this.socket.emit(
								"startHousmanDraft",
								handSize,
								revealedCardsCount,
								exchangeCount,
								roundCount,
								removeBasicLands,
								(answer: SocketAck) => {
									if (answer.code !== 0 && answer.error) Alert.fire(answer.error);
								}
							);
						},
						handSize,
						revealedCardsCount,
						exchangeCount,
						roundCount,
						removeBasicLands
					);
				},
			});
		},
		housmanDraftEnd() {
			this.drafting = false;
			this.housmanDraftState = null;
			this.gameState = GameState.Brewing;
			fireToast("success", "Done drafting!");
		},
		startSolomonDraft() {
			if (this.userID !== this.sessionOwner || this.drafting) return;

			const start = (cardCount: number, roundCount: number, removeBasicLands: boolean) => {
				this.socket.emit("startSolomonDraft", cardCount, roundCount, removeBasicLands, (answer: SocketAck) => {
					if (answer.code !== 0 && answer.error) Alert.fire(answer.error);
				});
			};

			this.spawnDialog(SolomonDialog, {
				onStart: (cardCount: number, roundCount: number, removeBasicLands: boolean) => {
					this.deckWarning(start, cardCount, roundCount, removeBasicLands);
				},
			});
		},
		solomonDraftEnd() {
			this.drafting = false;
			this.solomonDraftState = null;
			this.gameState = GameState.Brewing;
			fireToast("success", "Done drafting!");
		},
		startGridDraft() {
			if (this.userID !== this.sessionOwner || this.drafting) return;

			if (!this.ownerIsPlayer) {
				Alert.fire({
					icon: "error",
					title: "Owner has to play",
					text: "Non-playing owner is not supported in Grid Draft for now. The 'Session owner is playing' option needs to be active.",
				});
			} else {
				this.spawnDialog(GridDialog, {
					onStart: (boosterCount: number, twoPicksPerGrid: boolean) => {
						this.socket.emit("startGridDraft", boosterCount, twoPicksPerGrid, (answer: SocketAck) => {
							if (answer.code !== 0 && answer.error) Alert.fire(answer.error);
						});
					},
				});
			}
		},
		gridDraftPick(choice: number) {
			if (!this.gridDraftState) return;

			const cards: UniqueCard[] = [];

			for (let i = 0; i < 3; ++i) {
				//                     Column           Row
				const idx = choice < 3 ? 3 * i + choice : 3 * (choice - 3) + i;
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
						for (const c of cards) this.addToDeck(c);
					} else if (answer.error) Alert.fire(answer.error);
				});
			}
		},
		setRochesterDraftState(state: RochesterDraftSyncData) {
			this.rochesterDraftState = state;
		},
		startRochesterDraft: async function () {
			if (this.userID !== this.sessionOwner || this.drafting) return;

			if (!this.ownerIsPlayer) {
				Alert.fire({
					icon: "error",
					title: "Owner has to play",
					text: "Non-playing owner is not supported in Rochester Draft for now. The 'Session owner is playing' option needs to be active.",
				});
				return;
			}
			this.socket.emit("startRochesterDraft", (answer: SocketAck) => {
				if (answer.code !== 0 && answer.error) Alert.fire(answer.error);
			});
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
			this.spawnDialog(RotisserieDraftDialog, {
				defaultBoostersPerPlayer: this.boostersPerPlayer,
				onStart: (options: RotisserieDraftStartOptions) => {
					this.deckWarning((options) => {
						this.socket.emit("startRotisserieDraft", options, (r) => {
							if (r.code !== 0 && r.error) Alert.fire(r.error);
						});
					}, options);
				},
			});
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
				this.notifyTurn();
			}
		},
		startMinesweeperDraft() {
			if (this.userID !== this.sessionOwner || this.drafting) return;

			this.spawnDialog(MinesweeperDialog, {
				onStart: (
					gridCount: number,
					gridWidth: number,
					gridHeight: number,
					picksPerPlayerPerGrid: number,
					revealCenter: boolean,
					revealCorners: boolean,
					revealBorders: boolean
				) => {
					this.deckWarning(
						(
							gridCount: number,
							gridWidth: number,
							gridHeight: number,
							picksPerPlayerPerGrid: number,
							revealCenter: boolean,
							revealCorners: boolean,
							revealBorders: boolean
						) => {
							this.socket.emit(
								"startMinesweeperDraft",
								gridCount,
								gridWidth,
								gridHeight,
								this.sessionUsers.length * picksPerPlayerPerGrid,
								revealCenter,
								revealCorners,
								revealBorders,
								(response: SocketAck) => {
									if (response?.error) Alert.fire(response.error);
								}
							);
						},
						gridCount,
						gridWidth,
						gridHeight,
						picksPerPlayerPerGrid,
						revealCenter,
						revealCorners,
						revealBorders
					);
				},
			});
		},
		minesweeperDraftPick(row: number, col: number) {
			if (!this.minesweeperDraftState) return;
			const card = this.minesweeperDraftState.grid[row][col].card;
			if (!card) {
				fireToast("error", "Invalid Pick");
				return;
			}

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

			this.spawnDialog(GlimpseDialog, {
				defaultBoostersPerPlayer: boostersPerPlayer,
				defaultBurnedCardsPerRound: burnedCardsPerRound,
				onStart: (boostersPerPlayer: number, burnedCardsPerRound: number) => {
					const prev = [this.boostersPerPlayer, this.burnedCardsPerRound];
					this.boostersPerPlayer = boostersPerPlayer;
					this.burnedCardsPerRound = burnedCardsPerRound;
					// Wait to make sure reactive values are correctly propagated to the server
					this.$nextTick(async () => {
						// Draft didn't start, restore previous values.
						if (!(await this.startDraft())) {
							[this.boostersPerPlayer, this.burnedCardsPerRound] = prev;
						}
					});
				},
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
			// Disabled for now as logs are broken since  the 26/08/2021 MTGA update. Note: #mtga-logs-file-input doesn't exist anymore.
			//document.querySelector("#mtga-logs-file-input").click();
		},
		// Workaround for collection import: Collections are not available in logs anymore, accept standard card lists as collections.
		uploadCardListAsCollection(event: Event) {
			const file = (event.target as HTMLInputElement)?.files?.[0];
			if (event.target instanceof HTMLInputElement) event.target.value = "";
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
			if (event.target instanceof HTMLInputElement) event.target.value = "";
			if (!file) return;
			const reader = new FileReader();
			reader.onload = async (e) => {
				const contents = e.target?.result;
				if (!contents || typeof contents !== "string") {
					fireToast("error", `Empty file.`);
					return;
				}

				// Propose to use MTGA user name
				// FIXME: The username doesn't seem to appear in the log anymore as of 29/08/2021
				const nameFromLogs = localStorage.getItem("nameFromLogs");
				if (!nameFromLogs) {
					const m = contents.match(/DisplayName:(.+)#(\d+)/);
					if (m) {
						const name = `${m[1]}#${m[2]}`;
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
					return;
				}

				const playerIds = new Set(Array.from(contents.matchAll(/"playerId":"([^"]+)"/g)).map((e) => e[1]));

				const parseCollection = function (contents: string, startIdx?: number) {
					const rpcName = "PlayerInventory.GetPlayerCardsV3";
					try {
						const callIdx = startIdx
							? contents.lastIndexOf(rpcName, startIdx)
							: contents.lastIndexOf(rpcName);
						const collectionStart = contents.indexOf("{", callIdx);
						const collectionEnd = contents.indexOf("}}", collectionStart) + 2;
						const collectionStr = contents.slice(collectionStart, collectionEnd);
						const collection = JSON.parse(collectionStr)["payload"] as PlainCollection;

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

				let result: ReturnType<typeof parseCollection> | null = null;
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
						const collections: Exclude<ReturnType<typeof parseCollection>, null>[] = [];
						for (const pid of playerIds) {
							const startIdx = contents.lastIndexOf(`"payload":{"playerId":"${pid}"`);
							const coll = parseCollection(contents, startIdx);
							if (coll) collections.push(coll);
						}
						let cardids = Object.keys(collections[0]!);
						// Filter ids
						for (const r of collections)
							cardids = Object.keys(r.collection).filter(
								(id) => cardids.includes(id) && r.collection[id] > 0
							);
						result = {
							collection: {},
							inventory: {
								wildcards: {
									common: Math.min(...collections.map((c) => c.inventory.wildcards.common)),
									uncommon: Math.min(...collections.map((c) => c.inventory.wildcards.uncommon)),
									rare: Math.min(...collections.map((c) => c.inventory.wildcards.rare)),
									mythic: Math.min(...collections.map((c) => c.inventory.wildcards.mythic)),
								},
								vaultProgress: Math.min(...collections.map((c) => c.inventory.vaultProgress)),
							},
						};
						// Find min amount of each card
						for (const id of cardids)
							result.collection[id] = Math.min(...collections.map((c) => c.collection[id]!));
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
			const file = (e.target as HTMLInputElement)?.files?.[0];
			if (e.target instanceof HTMLInputElement) e.target.value = ""; // Reset input: Without this, Chrome doesn't retrigger events when you try to upload the same file again.
			if (!file) {
				fireToast("error", "An error occured while uploading the file.");
				return false;
			}
			return callback(file, options);
		},
		// Returns a Blob to be consumed by a FileReader
		async fetchFile(url: string, callback: (blob: Blob, options: Options) => void, options: Options) {
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
					for (const item of event.dataTransfer.items)
						if (item.kind === "file") {
							const file = item.getAsFile();
							if (file) this.parseCustomCardList(file);
						}
				} else {
					for (const file of event.dataTransfer.files) this.parseCustomCardList(file);
				}
		},
		async parseCustomCardList(file: File) {
			Alert.fire({
				position: "center",
				icon: "info",
				title: "Parsing card list...",
				showConfirmButton: false,
			});
			const contents = await file.text();

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
		selectCube(cube: CubeDescription, matchVersions = false) {
			const ack = (r: SocketAck) => {
				if (r?.error) {
					Alert.fire(r.error);
				} else {
					fireToast("success", `Card list loaded`);
				}
			};

			if (cube.cubeCobraID || cube.cubeArtisanID) {
				const cubeID = (cube.cubeCobraID ?? cube.cubeArtisanID)!;
				const service = cube.cubeCobraID ? "Cube Cobra" : "CubeArtisan";
				if (cube.matchVersions !== undefined) matchVersions = cube.matchVersions;
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
				const data = await response.json();
				if (data && !data.error) {
					this.clearState();
					for (const c of data.deck) this.addToDeck(c);
					for (const c of data.sideboard) this.addToSideboard(c);
					this.gameState = GameState.Brewing;
				}
				fireToast("success", "Successfully imported deck!");
				this.displayedModal = null;
			} else if (response.status === 400) {
				const data = await response.json();
				if (data.error) {
					fireToast("error", `Error importing deck: ${data.error.message}`);
				} else {
					fireToast("error", "Error importing deck.");
				}
			} else {
				fireToast("error", "Error importing deck.");
			}
		},
		importMTGOLog(contents: string) {
			this.socket.emit("convertMTGOLog", contents, (response) => {
				if ("error" in response) {
					Alert.fire(response.error!);
				} else {
					this.draftLogs.push(response as DraftLog);
					this.storeDraftLogs();
					fireToast("success", "Successfully imported MTGO log!");
				}
			});
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
			if (this.userID !== this.sessionOwner) return;
			const user = this.sessionUsers.find((u) => u.userID === newOwnerID);
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
			if (this.userID !== this.sessionOwner) return;
			const user = this.sessionUsers.find((u) => u.userID === userID);
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
			if (this.userID !== this.sessionOwner) return;

			const negMod = (m: number, n: number) => ((m % n) + n) % n;
			const other = negMod(idx + dir, this.userOrder.length);
			[this.userOrder[idx], this.userOrder[other]] = [this.userOrder[other], this.userOrder[idx]];

			this.socket.emit("setSeating", this.userOrder);
		},
		changePlayerOrder(e: SortableEvent) {
			if (this.userID !== this.sessionOwner) return;
			sortableUpdate(e, this.userOrder);
			this.socket.emit("setSeating", this.userOrder);
		},
		async sealedDialog(teamSealed = false) {
			if (this.userID != this.sessionOwner) return;

			this.spawnDialog(SealedDialog, {
				users: this.sessionUsers,
				teamSealed: teamSealed,
				onDistribute: (boostersPerPlayer: number, customBoosters: SetCode[], teams: UserID[][]) => {
					this.deckWarning(
						teamSealed ? this.startTeamSealed : this.distributeSealed,
						boostersPerPlayer,
						customBoosters,
						teams
					);
				},
			});
		},
		deckWarning<T extends unknown[]>(call: (...args: T) => void, ...options: T) {
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
					if (result.value) call(...options);
				});
			} else {
				call(...options);
			}
		},
		distributeSealed(boosterCount: number, customBoosters: string[]) {
			if (this.userID !== this.sessionOwner) return;
			this.showLoader({ title: "Distributing sealed boosters..." });
			this.socket.timeout(10000).emit("distributeSealed", boosterCount, customBoosters, (err, response) => {
				if (err) {
					Alert.fire({ icon: "error", title: "Error contacting the server" });
				} else {
					if (response.error) Alert.fire(response.error);
				}
			});
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
		distributeJumpstart(set: string) {
			if (this.userID !== this.sessionOwner) return;
			this.socket.emit("distributeJumpstart", set, (r) => {
				if (r.error) Alert.fire(r.error);
			});
		},
		async displayPackChoice(boosters: JHHBooster[], currentPack: number, packCount: number) {
			let boostersDisplay = "";
			for (const b of boosters) {
				const colors = b.colors
					.map(
						(c) => `<img src="img/mana/${c}.svg" class="mana-icon" style="vertical-align: text-top;"></img>`
					)
					.join(" ");
				boostersDisplay += `<div class="pack-button clickable" style="text-align: center"><img src="${b.image}" style="display:block; min-width: 250px; min-height: 354px; max-width: 250px; max-height: 60vh; border-radius: 3%; margin: auto;" /><h2>${colors}<br />${b.name}</h2></div>`;
			}
			let choice = -1;
			await Alert.fire({
				title: `Select your Jumpstart Packs (${currentPack + 1}/${packCount})`,
				html: `<div style="display: flex; gap: 1em;">${boostersDisplay}</div>`,
				showCancelButton: true,
				showConfirmButton: false,
				allowEscapeKey: false,
				allowOutsideClick: false,
				width: "fit-content",
				didOpen: (el) => {
					const packButtons = el.querySelectorAll(".pack-button");
					for (let i = 0; i < packButtons.length; ++i) {
						packButtons[i].addEventListener("click", () => {
							choice = i;
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
			const choice = await this.displayPackChoice(choices[0], 0, choices.length);
			if (choice < 0) return ack?.(this.userID, []); // User canceled
			const secondChoice = await this.displayPackChoice(choices[1][choice], 1, choices.length);
			if (secondChoice < 0) return ack?.(this.userID, []);

			this.clearState();
			for (const c of choices[0][choice].cards) this.addToDeck(c);
			for (const c of choices[1][choice][secondChoice].cards) this.addToDeck(c);
			this.gameState = GameState.Brewing;

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

			for (const u of this.sessionUsers) u.readyState = ReadyState.Unknown;

			this.playSound("readyCheck");
			this.pushTitleNotification("❔");
		},
		stopReadyCheck() {
			this.pendingReadyCheck = false;

			for (const u of this.sessionUsers) u.readyState = ReadyState.DontCare;
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
						text: `Can't share logs: The session ID of your saved draft log ('${storedDraftLog.sessionID}') doesn't match the id of your current session ('${this.sessionID}').`,
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
			const players = [];
			for (let i = 0; i < pairingOrder.length; ++i) players[i] = playerInfos[pairingOrder[i]];
			return players;
		},
		// Bracket (Server communication)
		generateBracket() {
			if (this.userID != this.sessionOwner) return;
			const players = this.prepareBracketPlayers(this.teamDraft ? [0, 3, 2, 5, 4, 1] : [0, 4, 2, 6, 1, 5, 3, 7]);
			this.socket.emit("generateBracket", players, (answer) => {
				if (answer.code === 0) this.displayedModal = "bracket";
				else if (answer.error) Alert.fire(answer.error);
			});
		},
		generateSwissBracket() {
			if (this.userID != this.sessionOwner) return;
			const players =
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
			const players = this.prepareBracketPlayers([0, 4, 2, 6, 1, 5, 3, 7]);
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
			if (Array.isArray(card)) for (const c of card) this.addToDeck(c, options);
			else {
				// Handle column sync.
				this.deck.push(card);
				this.deckDisplay?.addCard(card, options?.event ?? undefined);
			}
		},
		addToSideboard(card: UniqueCard | UniqueCard[], options: { event?: MouseEvent } | undefined = undefined) {
			if (Array.isArray(card)) for (const c of card) this.addToSideboard(c, options);
			else {
				// Handle column sync.
				this.sideboard.push(card);
				this.sideboardDisplay?.addCard(card, options?.event ?? undefined);
			}
		},
		deckToSideboard(e: Event, c: UniqueCard) {
			// From deck to sideboard
			const idx = this.deck.indexOf(c);
			if (idx >= 0) {
				this.deck.splice(idx, 1);
				this.deckDisplay?.remCard(c);
				this.addToSideboard(c);
				// Card DOM element will move without emiting a mouse leave event,
				// make sure to close the card popup.
				this.emitter.emit("closecardpopup");
				this.socket.emit("moveCard", c.uniqueID, "side");
			}
		},
		sideboardToDeck(e: Event, c: UniqueCard) {
			// From sideboard to deck
			const idx = this.sideboard.indexOf(c);
			if (idx >= 0) {
				this.sideboard.splice(idx, 1);
				this.sideboardDisplay?.remCard(c);
				this.addToDeck(c);
				this.emitter.emit("closecardpopup");
				this.socket.emit("moveCard", c.uniqueID, "main");
			}
		},
		// Drag & Drop movements between deck and sideboard
		onDeckDragAdd(uniqueID: UniqueCardID) {
			const idx = this.sideboard.findIndex((c) => c.uniqueID === uniqueID);
			if (idx >= 0) {
				const card = this.sideboard[idx];
				this.deck.push(card);
				this.socket.emit("moveCard", card.uniqueID, "main");
			}
		},
		onDeckDragRemove(uniqueID: UniqueCardID) {
			this.deck.splice(
				this.deck.findIndex((c) => c.uniqueID === uniqueID),
				1
			);
		},
		onSideDragAdd(uniqueID: UniqueCardID) {
			const idx = this.deck.findIndex((c) => c.uniqueID === uniqueID);
			if (idx >= 0) {
				const card = this.deck[idx];
				this.sideboard.push(card);
				this.socket.emit("moveCard", card.uniqueID, "side");
			}
		},
		onSideDragRemove(uniqueID: UniqueCardID) {
			this.sideboard.splice(
				this.sideboard.findIndex((c) => c.uniqueID === uniqueID),
				1
			);
		},
		onCollapsedSideDragAdd(e: SortableEvent) {
			const entries =
				e.newIndicies.length > 0 ? e.newIndicies : [{ multiDragElement: e.item, index: e.newIndex! }];
			entries.sort((l, r) => l.index - r.index);
			for (const { multiDragElement, index } of entries) {
				multiDragElement.remove();
				const idx = this.deck.findIndex((c) => c.uniqueID === parseInt(multiDragElement.dataset["uniqueid"]!));
				if (idx >= 0) {
					const card = this.deck[idx];
					this.sideboard.splice(index, 0, card);
					this.socket.emit("moveCard", card.uniqueID, "side");
					this.sideboardDisplay?.sync();
				}
			}
		},
		onCollapsedSideDragRemove(e: SortableEvent) {
			const entries =
				e.oldIndicies.length > 0 ? e.oldIndicies : [{ multiDragElement: e.item, index: e.oldIndex! }];
			entries.sort((l, r) => r.index - l.index);
			for (const { index } of entries) {
				this.sideboard.splice(index, 1);
				this.sideboardDisplay?.sync();
			}
		},
		clearDeck() {
			this.deck = [];
			this.$nextTick(() => {
				this.deckDisplay?.sync();
			});
		},
		clearSideboard() {
			this.sideboard = [];
			this.$nextTick(() => {
				this.sideboardDisplay?.sync();
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
				for (const c in colorCount) totalColor += colorCount[c as CardColor];
				if (totalColor <= 0) return;

				for (const c in this.lands)
					this.lands[c as CardColor] = Math.round(landToAdd * (colorCount[c as CardColor] / totalColor));
				const addedLands = this.totalLands;

				if (this.deck.length + addedLands > targetDeckSize) {
					let max: CardColor = CardColor.W;
					for (let i = 0; i < this.deck.length + addedLands - targetDeckSize; ++i) {
						for (const c in this.lands)
							if (this.lands[c as CardColor] > this.lands[max]) max = c as CardColor;
						this.lands[max] = Math.max(0, this.lands[max] - 1);
					}
				} else if (this.deck.length + addedLands < targetDeckSize) {
					let min: CardColor = CardColor.W;
					for (let i = 0; i < targetDeckSize - (this.deck.length + addedLands); ++i) {
						for (const c in this.lands)
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
			this.socket.emit("removeBasicsFromDeck");
			this.deck = this.deck.filter((c) => !EnglishBasicLandNames.includes(c.name));
			this.sideboard = this.sideboard.filter((c) => !EnglishBasicLandNames.includes(c.name));
			this.deckDisplay?.filterBasics();
			this.sideboardDisplay?.filterBasics();
		},
		colorsInCardPool(pool: Card[]) {
			const r = { W: 0, U: 0, B: 0, R: 0, G: 0 };
			for (const card of pool) {
				for (const color of card.colors) {
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
			if (this.enableNotifications) this.requestNotificationPermission();
		},
		requestNotificationPermission() {
			if (Notification.permission !== "granted") {
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
				}/?session=${encodeURIComponent(this.sessionID ?? "")}`
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
		updateStoredSessionSettings(data: { [key: string]: unknown }) {
			const previousStr = localStorage.getItem(localStorageSessionSettingsKey) ?? "{}";
			const previous = JSON.parse(previousStr);
			for (const key in data) previous[key] = data[key];
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
			const worker = new Worker(new URL("./logstore.worker.ts", import.meta.url));
			worker.onmessage = (e) => {
				localStorage.setItem("draftLogs", e.data);
				this.storeDraftLogsTimeout = null;
				console.log("Stored Draft Logs.");
			};
			worker.postMessage(["compress", toRaw(this.draftLogs)]);
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
			for (const card of cards) {
				if (!("arena_id" in card)) return null;
				if (card.type.includes("Basic")) continue;
				if (!(card.arena_id! in counts)) counts[card.arena_id!] = { rarity: card.rarity, count: 0 };
				++counts[card.arena_id!].count;
			}
			for (const cid in counts)
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
			const settings: { [key: string]: unknown } = {};
			for (const key in defaultSettings) settings[key] = this[key as keyof typeof defaultSettings];
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
		updateURLQuery(): void {
			if (this.sessionID) {
				history.replaceState(
					{ sessionID: this.sessionID },
					`Draftmancer Session ${this.sessionID}`,
					`/?session=${encodeURIComponent(this.sessionID)}`
				);
			}
		},
		requestTakeover() {
			this.socket.emit("requestTakeover", (r) => {
				if (r.error) Alert.fire(r.error);
				else fireToast("success", "Takeover request succeeded!");
			});
		},

		onEnterBoosterCards: onEnterBoosterCards,
	},
	computed: {
		deckDisplay(): typeof CardPool | null {
			return this.$refs.deckDisplay as typeof CardPool | null;
		},
		sideboardDisplay(): typeof CardPool | null {
			return this.$refs.sideboardDisplay as typeof CardPool | null;
		},
		draftLogLiveComponentRef(): typeof DraftLogLiveComponent | null {
			return this.$refs.draftloglive as typeof DraftLogLiveComponent | null;
		},
		gameModeName(): string {
			if (this.teamSealedState) return "Team Sealed";
			if (this.rochesterDraftState) return "Rochester Draft";
			if (this.rotisserieDraftState) return "Rotisserie Draft";
			if (this.winstonDraftState) return "Winston Draft";
			if (this.winchesterDraftState) return "Winchester Draft";
			if (this.housmanDraftState) return "Housman Draft";
			if (this.solomonDraftState) return "Solomon Draft";
			if (this.gridDraftState) return "Grid Draft";
			if (this.minesweeperDraftState) return "Minesweeper Draft";
			if (this.useCustomCardList) return "Cube Draft";
			if (this.burnedCardsPerRound > 0) return "Glimpse Draft";
			return "Draft";
		},
		previousDeck() {
			if (this.draftLogs.length > 0 && this.draftLogs[this.draftLogs.length - 1].users[this.userID]) {
				return {
					log: this.draftLogs[this.draftLogs.length - 1],
					uid: this.userID,
				};
			}
			return null;
		},
		cardsToPick(): number {
			if (!this.draftState) return 1;
			let picksThisRound: number = this.draftState.picksThisRound;

			if (
				this.selectedUsableDraftEffect &&
				(this.selectedUsableDraftEffect.effect === UsableDraftEffect.CogworkLibrarian ||
					this.selectedUsableDraftEffect.effect === UsableDraftEffect.LeovoldsOperative)
			)
				picksThisRound += 1;

			return Math.min(picksThisRound, this.draftState.booster.length);
		},
		cardsToBurnThisRound(): number {
			if (!this.draftState) return 0;
			return Math.max(
				0,
				Math.min(this.draftState.burnsThisRound, this.draftState.booster.length - this.cardsToPick)
			);
		},
		waitingForDisconnectedUsers(): boolean {
			//                    Disconnected players do not matter for managed sessions, Team Sealed or Rotisserie Draft.
			if (!this.drafting || this.managed || this.teamSealedState || this.rotisserieDraftState) return false;
			return Object.keys(this.disconnectedUsers).length > 0;
		},
		disconnectedUserNames(): string {
			return Object.values(this.disconnectedUsers)
				.map((u) => u.userName)
				.join(", ");
		},
		virtualPlayers(): UserData[] {
			// Only the standard draft mode uses virtualPlayersData (it's the only one that supports bots), derive it from sessionUsers for the other game modes.
			if (!this.virtualPlayersData || Object.keys(this.virtualPlayersData).length == 0) {
				const r: UserData[] = [];
				for (let i = 0; i < this.sessionUsers.length; i++) {
					r.push({
						userName: this.sessionUsers[i].userName,
						userID: this.sessionUsers[i].userID,
						isBot: false,
						isReplaced: false,
						isDisconnected: this.sessionUsers[i].userID in this.disconnectedUsers,
					});
				}
				return r;
			}
			// Standard Draft mode with possible bots.
			return Object.values(this.virtualPlayersData);
		},
		passingOrder(): PassingOrder {
			if (this.gridDraftState) {
				if (this.sessionUsers.length === 4)
					return Math.floor(this.gridDraftState.round / 16) % 2 === 0
						? PassingOrder.Right
						: PassingOrder.Left;
				if (this.sessionUsers.length === 3)
					return Math.floor(this.gridDraftState.round / 9) % 2 === 0 ? PassingOrder.Right : PassingOrder.Left;
				// Assumes 2 players
				if (this.gridDraftState.twoPicksPerGrid)
					return [
						PassingOrder.Right,
						PassingOrder.Left,
						PassingOrder.Right,
						PassingOrder.Repeat,
						PassingOrder.Left,
						PassingOrder.Right,
						PassingOrder.Left,
						PassingOrder.Repeat,
					][this.gridDraftState.round % 8];
				return [PassingOrder.Right, PassingOrder.Repeat, PassingOrder.Left, PassingOrder.Repeat][
					this.gridDraftState.round % 4
				];
			}
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
			if (this.draftState)
				return this.draftState.boosterNumber !== undefined
					? this.draftState.boosterNumber % 2 === 1
						? PassingOrder.Left
						: PassingOrder.Right
					: PassingOrder.None;

			return PassingOrder.None;
		},
		currentPlayer(): UserID | null {
			if (this.winstonDraftState) return this.winstonDraftState.currentPlayer;
			if (this.winchesterDraftState) return this.winchesterDraftState.currentPlayer;
			if (this.housmanDraftState) return this.housmanDraftState.currentPlayer;
			if (this.solomonDraftState) return this.solomonDraftState.currentPlayer;
			if (this.gridDraftState) return this.gridDraftState.currentPlayer;
			if (this.rotisserieDraftState) return this.rotisserieDraftState.currentPlayer;
			if (this.rochesterDraftState) return this.rochesterDraftState.currentPlayer;
			if (this.minesweeperDraftState) return this.minesweeperDraftState.currentPlayer;
			return null;
		},
		displaySets(): SetInfo[] {
			return Object.values(this.setsInfos).filter((set) => this.sets.includes(set.code));
		},
		hasCollection(): boolean {
			return !isEmpty(this.collection);
		},

		availableOptionalDraftEffects(): {
			name: string;
			effect: OptionalOnPickDraftEffect;
			cardID: UniqueCardID;
		}[] {
			const r = [];
			for (const card of this.selectedCards.filter((c) => c.draft_effects !== undefined))
				for (const effect of card.draft_effects!.filter((e) => isSomeEnum(OptionalOnPickDraftEffect)(e)))
					r.push({
						name: card.name,
						effect: effect as OptionalOnPickDraftEffect,
						cardID: card.uniqueID,
					});
			return r;
		},
		availableDraftEffects(): {
			name: string;
			effect: UsableDraftEffect;
			cardID: UniqueCardID;
		}[] {
			if (!this.draftState) return [];
			const r = [];
			for (const arr of [this.deck, this.sideboard])
				for (const card of arr.filter((c) => c.draft_effects !== undefined))
					for (const effect of card.draft_effects!.filter((e) => isSomeEnum(UsableDraftEffect)(e))) {
						if (
							// These effects are only usable once.
							(!card.state?.faceUp &&
								[
									UsableDraftEffect.NoteCardName,
									UsableDraftEffect.NoteCreatureName,
									UsableDraftEffect.NoteCreatureTypes,
									UsableDraftEffect.AgentOfAcquisitions,
									UsableDraftEffect.LeovoldsOperative,
								].includes(effect as UsableDraftEffect)) ||
							// Disallow Cogwork Librarian effect if there's not enough cards in the pack.
							(effect === UsableDraftEffect.CogworkLibrarian &&
								this.draftState.booster.length <= this.pickedCardsPerRound)
						)
							continue;
						r.push({
							name: card.name,
							effect: effect as UsableDraftEffect,
							cardID: card.uniqueID,
						});
					}
			return r;
		},
		colorsInDeck(): ReturnType<typeof this.colorsInCardPool> {
			return this.colorsInCardPool(this.deck);
		},
		totalLands(): number {
			return Object.values(this.lands).reduce((a, b) => a + b, 0);
		},
		basicsInDeck(): boolean {
			return (
				this.deck.some((c) => EnglishBasicLandNames.includes(c.name)) ||
				this.sideboard.some((c) => EnglishBasicLandNames.includes(c.name))
			);
		},
		deckCreatureCount(): number {
			return this.deck?.filter((c) => c.type.includes("Creature")).length ?? 0;
		},
		deckLandCount(): number {
			return this.deck?.filter((c) => c.type.includes("Land")).length ?? 0;
		},
		neededWildcards(): {
			main: {
				common: number;
				uncommon: number;
				rare: number;
				mythic: number;
			} | null;
			side: {
				common: number;
				uncommon: number;
				rare: number;
				mythic: number;
			} | null;
		} | null {
			if (!this.hasCollection) return null;
			const main = this.countMissing(this.deck);
			const side = this.countMissing(this.sideboard);
			if (!main && !side) return null;
			return { main: main, side: side };
		},
		deckSummary(): { [id: CardID]: number } {
			const r: { [id: CardID]: number } = {};
			for (const c of this.deck) {
				if (!(c.id in r)) r[c.id] = 0;
				++r[c.id];
			}
			return r;
		},
		displayWildcardInfo(): boolean {
			return (
				this.displayCollectionStatus !== null &&
				this.neededWildcards !== null &&
				((this.neededWildcards.main !== null && Object.values(this.neededWildcards.main).some((v) => v > 0)) ||
					(this.neededWildcards.side !== null && Object.values(this.neededWildcards.side).some((v) => v > 0)))
			);
		},
		displayDeckAndSideboard(): boolean {
			return (
				(this.drafting &&
					(!this.hidePicks || this.gameState === GameState.Reviewing) &&
					this.gameState !== GameState.Watching) ||
				this.gameState === GameState.Brewing
			);
		},
		displayFixedDeck(): boolean {
			return this.displayDeckAndSideboard && this.fixedDeck && this.gameState !== GameState.Brewing;
		},

		userByID(): { [uid: UserID]: SessionUser } {
			const r: { [uid: UserID]: SessionUser } = {};
			for (const u of this.sessionUsers) r[u.userID] = u;
			return r;
		},

		pageTitle(): string {
			if (this.sessionUsers.length < 2)
				return `Draftmancer ${
					this.titleNotification ? this.titleNotification.message : "- Multiplayer MTG Limited Simulator"
				}`;
			else
				return `Draftmancer (${this.sessionUsers.length}/${this.maxPlayers}) ${
					this.titleNotification ? this.titleNotification.message : ""
				}`;
		},
	},
	async mounted() {
		try {
			this.emitter.on("notification", this.pushNotification);
			this.emitter.on("requestNotificationPermission", this.requestNotificationPermission);

			this.initializeSocket();
			this.updateURLQuery();

			// Initialized only now so it's correctly sync with the server.
			this.useCollection = initialSettings.useCollection;

			// Look for a locally stored collection
			const localStorageCollection = localStorage.getItem("Collection");
			if (localStorageCollection) {
				try {
					const json = JSON.parse(localStorageCollection);
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
				const worker = new Worker(new URL("./logstore.worker.ts", import.meta.url));
				worker.onmessage = (e) => {
					this.draftLogs = e.data as DraftLog[];
					console.log(`Loaded ${this.draftLogs.length} saved draft logs.`);
					// Asks the server if the last log was updated while we were offline.
					const logsForThisSession = this.draftLogs.filter((l) => l.sessionID === this.sessionID);
					if (logsForThisSession.length > 0) {
						const log = logsForThisSession.reduce((prev, curr) => (prev.time > curr.time ? prev : curr)); // Get the latest log
						this.socket?.emit("retrieveUpdatedDraftLogs", log.sessionID, log.time, log.lastUpdated);
					}
				};
				worker.postMessage(["decompress", storedLogs]);
			}

			// If we're waiting on a storeDraftLogsTimeout, ask the user to wait and trigger the compressiong/storing immediatly
			window.addEventListener("beforeunload", this.beforeunload);

			for (const key in Sounds) Sounds[key].volume = 0.4;
			Sounds["countdown"].volume = 0.11;
			this.$nextTick(() => {
				this.applyFixedDeckSize();
			});
		} catch (e) {
			alert(e);
		}
	},
	unmounted() {
		this.emitter.off("notification", this.pushNotification);
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
				if (this.sessionID) this.socket.emit("setSession", this.sessionID, sessionSettings);
			}
			this.updateURLQuery();
			if (this.sessionID) setCookie("sessionID", this.sessionID);
		},
		userName() {
			if (this.socket) {
				this.socket.io.opts.query!.userName = this.userName;
				this.socket.emit("setUserName", this.userName);
			}
			this.storeSettings();
		},
		useCollection() {
			this.socket?.emit("useCollection", this.useCollection);
			this.storeSettings();
		},
		// Front-end options
		language() {
			this.storeSettings();
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
		deck: {
			deep: true,
			handler() {
				this.updateAutoLands();
			},
		},
		availableUsableDraftEffects() {
			this.selectedUsableDraftEffect = undefined;
		},
		availableOptionalDraftEffects() {
			if (this.availableOptionalDraftEffects.length > 0)
				this.selectedOptionalDraftPickEffect = this.availableOptionalDraftEffects[0];
			else this.selectedOptionalDraftPickEffect = undefined;
		},
		autoLand() {
			this.updateAutoLands();
			this.storeSettings();
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
			if (this.userID !== this.sessionOwner || !this.socket) return;
			setCookie("userID", this.userID); // Used for reconnection
			this.socket.emit("setOwnerIsPlayer", this.ownerIsPlayer);
		},
		setRestriction: {
			deep: true,
			handler() {
				if (this.userID !== this.sessionOwner || !this.socket) return;

				this.socket.emit("setRestriction", this.setRestriction);
			},
		},
		isPublic() {
			if (this.userID !== this.sessionOwner || !this.socket) return;
			this.socket.emit("setPublic", this.isPublic);
		},
		description() {
			if (this.userID !== this.sessionOwner || !this.socket) return;
			this.socket.emit("setDescription", this.description);
		},
		usePredeterminedBoosters() {
			if (this.userID !== this.sessionOwner || !this.socket) return;
			this.socket.emit("setUsePredeterminedBoosters", this.usePredeterminedBoosters);
		},
		boostersPerPlayer() {
			if (this.userID !== this.sessionOwner || !this.socket) return;
			this.socket.emit("boostersPerPlayer", this.boostersPerPlayer);
		},
		cardsPerBooster() {
			if (this.userID !== this.sessionOwner || !this.socket) return;
			this.socket.emit("cardsPerBooster", this.cardsPerBooster);
		},
		teamDraft() {
			if (this.userID !== this.sessionOwner || !this.socket) return;
			this.socket.emit("teamDraft", this.teamDraft);
		},
		randomizeSeatingOrder(oldValue, newValue) {
			if (this.userID !== this.sessionOwner || !this.socket || oldValue === newValue) return;
			this.socket.emit("setRandomizeSeatingOrder", this.randomizeSeatingOrder);
			this.updateStoredSessionSettings({ randomizeSeatingOrder: this.randomizeSeatingOrder });
		},
		disableBotSuggestions(oldValue, newValue) {
			if (this.userID !== this.sessionOwner || !this.socket || oldValue === newValue) return;
			this.socket.emit("setDisableBotSuggestions", this.disableBotSuggestions);
			this.updateStoredSessionSettings({ disableBotSuggestions: this.disableBotSuggestions });
		},
		distributionMode() {
			if (this.userID !== this.sessionOwner || !this.socket) return;
			this.socket.emit("setDistributionMode", this.distributionMode);
		},
		customBoosters: {
			deep: true,
			handler() {
				if (this.userID !== this.sessionOwner || !this.socket) return;
				this.socket.emit("setCustomBoosters", this.customBoosters);
			},
		},
		bots() {
			if (this.userID !== this.sessionOwner || !this.socket) return;
			this.socket.emit("setBots", this.bots);
		},
		maxPlayers() {
			if (this.userID !== this.sessionOwner || !this.socket) return;
			if (this.maxPlayers < 1) return;
			document.title = this.pageTitle;
			this.socket.emit("setMaxPlayers", this.maxPlayers);
		},
		mythicPromotion() {
			if (this.userID !== this.sessionOwner || !this.socket) return;
			this.socket.emit("setMythicPromotion", this.mythicPromotion);
		},
		useBoosterContent() {
			if (this.userID !== this.sessionOwner || !this.socket) return;
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
			if (this.userID !== this.sessionOwner || !this.socket) return;
			this.socket.emit("setPickTimer", this.maxTimer);
			this.updateStoredSessionSettings({ maxTimer: this.maxTimer });
		},
		tournamentTimer() {
			if (this.userID !== this.sessionOwner || !this.socket) return;
			this.socket.emit("setTournamentTimer", this.tournamentTimer);
		},
		reviewTimer() {
			if (this.userID !== this.sessionOwner || !this.socket) return;
			this.socket.emit("setReviewTimer", this.reviewTimer);
		},
		hidePicks() {
			if (this.userID !== this.sessionOwner || !this.socket) return;
			this.socket.emit("setHidePicks", this.hidePicks);
		},
		ignoreCollections() {
			if (this.userID !== this.sessionOwner || !this.socket) return;
			this.socket.emit("ignoreCollections", this.ignoreCollections);
			this.updateStoredSessionSettings({ ignoreCollections: this.ignoreCollections });
		},
		maxDuplicates: {
			deep: true,
			handler() {
				if (this.userID !== this.sessionOwner || !this.socket) return;
				this.socket.emit("setMaxDuplicates", this.maxDuplicates);
			},
		},
		colorBalance() {
			if (this.userID !== this.sessionOwner || !this.socket) return;
			this.socket.emit("setColorBalance", this.colorBalance);
			this.updateStoredSessionSettings({ colorBalance: this.colorBalance });
		},
		foil() {
			if (this.userID != this.sessionOwner || !this.socket) return;
			this.socket.emit("setFoil", this.foil);
			this.updateStoredSessionSettings({ foil: this.foil });
		},
		useCustomCardList() {
			if (this.userID !== this.sessionOwner || !this.socket) return;
			this.socket.emit("setUseCustomCardList", this.useCustomCardList);
		},
		customCardListWithReplacement() {
			if (this.userID !== this.sessionOwner || !this.socket) return;
			this.socket.emit("setCustomCardListWithReplacement", this.customCardListWithReplacement);
		},
		doubleMastersMode() {
			if (this.userID !== this.sessionOwner || !this.socket) return;
			this.socket.emit("setDoubleMastersMode", this.doubleMastersMode);
		},
		pickedCardsPerRound() {
			if (this.userID !== this.sessionOwner || !this.socket) return;
			this.socket.emit("setPickedCardsPerRound", this.pickedCardsPerRound);
		},
		burnedCardsPerRound() {
			if (this.userID !== this.sessionOwner || !this.socket) return;
			this.socket.emit("setBurnedCardsPerRound", this.burnedCardsPerRound);
		},
		discardRemainingCardsAt() {
			if (this.userID !== this.sessionOwner || !this.socket) return;
			this.socket.emit("setDiscardRemainingCardsAt", this.discardRemainingCardsAt);
		},
		personalLogs() {
			if (this.userID !== this.sessionOwner || !this.socket) return;
			this.socket.emit("setPersonalLogs", this.personalLogs);
			this.updateStoredSessionSettings({ personalLogs: this.personalLogs });
		},
		draftLogRecipients() {
			if (this.userID !== this.sessionOwner || !this.socket) return;
			this.socket.emit("setDraftLogRecipients", this.draftLogRecipients);
			this.updateStoredSessionSettings({ draftLogRecipients: this.draftLogRecipients });
		},
		draftLogUnlockTimer() {
			if (this.userID !== this.sessionOwner || !this.socket) return;
			this.socket.emit("setDraftLogUnlockTimer", this.draftLogUnlockTimer);
			this.updateStoredSessionSettings({ draftLogUnlockTimer: this.draftLogUnlockTimer });
		},
		sessionUsers: {
			deep: true,
			handler(newV, oldV) {
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
		cardsToPick() {
			// Automatically deselect cards if needed
			while (this.selectedCards.length > 0 && this.selectedCards.length > this.cardsToPick)
				this.selectedCards.shift();
		},
	},
});

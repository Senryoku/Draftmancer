import { GridDraftSyncData } from "./GridDraft";
import { WinstonDraftSyncData } from "./WinstonDraft";
import { SessionID, UserID } from "./IDTypes";
import { Message, SocketAck, SocketError } from "./Message";
import { DistributionMode, DraftLogRecipients, ReadyState, UserData } from "./Session/SessionTypes";
import { Options } from "./utils";
import { SetCode } from "./Types";
import { DraftLog, DraftPick } from "./DraftLog";
import {
	CardID,
	DeckBasicLands,
	DeckList,
	UsableDraftEffect,
	PlainCollection,
	UniqueCard,
	UniqueCardID,
	OptionalOnPickDraftEffect,
	UniqueCardState,
	CardColor,
} from "./CardTypes";
import { RochesterDraftSyncData } from "./RochesterDraft";
import { MinesweeperSyncData, MinesweeperSyncDataDiff } from "./MinesweeperDraftTypes";
import { DraftState, DraftSyncData } from "./DraftState";
import { BotScores } from "./Bot";
import { getPublicSessionData } from "./Session";
import { JumpInBooster } from "./JumpInTypes";
import { RotisserieDraftStartOptions, RotisserieDraftSyncData } from "./RotisserieDraft";
import { WinchesterDraftSyncData } from "./WinchesterDraft";
import { HousmanDraftSyncData } from "./HousmanDraft";
import { SolomonDraftSyncData } from "./SolomonDraft";
import { QueueID } from "./draftQueue/QueueDescription";
import { BracketType, IBracket } from "./Brackets";
import { CCLSettings, CustomCardList } from "./CustomCardList";
import { SilentAuctionDraftState, SilentAuctionDraftSyncData } from "./SilentAuctionDraft";
import { Tiebreaker } from "./SilentAuctionDraftTiebreakers";

export type LoaderOptions = { title: string };

export interface ServerToClientEvents {
	updatePublicSession: (data: { id: SessionID; isPrivate: true } | ReturnType<typeof getPublicSessionData>) => void;
	publicSessions: (publicSessions: ReturnType<typeof getPublicSessionData>[]) => void;
	alreadyConnected: (uid: UserID) => void;
	stillAlive: (callback: () => void) => void;
	setSession: (sid: SessionID) => void;
	message: (msg: Message, pushToHistory?: boolean) => void;
	chatMessage: (msg: { author: string; text: string; timestamp: number }) => void;
	readyCheck: () => void;
	setReady: (userID: UserID, readyState: ReadyState) => void;
	sessionUsers: (
		users: {
			userID: UserID;
			userName: string;
			collection: boolean;
			useCollection: boolean;
		}[]
	) => void;
	updateUser: (data: {
		userID: UserID;
		updatedProperties: {
			userName?: string;
			collection?: boolean;
			useCollection?: boolean;
			readyState?: ReadyState;
		};
	}) => void;

	userDisconnected: (data: { owner?: UserID; disconnectedUsers: { [uid: string]: { userName: string } } }) => void;
	sessionOptions: (
		sessionOptions: Partial<{
			boosterContent: { [slot: string]: number };
			boostersPerPlayer: number;
			bots: number;
			bracket: IBracket;
			bracketLocked: boolean;
			burnedCardsPerRound: number;
			cardsPerBooster: number;
			colorBalance: boolean;
			customBoosters: string[];
			customCardList: CustomCardList;
			customCardListDuplicateProtection: boolean;
			customCardListWithReplacement: boolean;
			disableBotSuggestions: boolean;
			discardRemainingCardsAt: number;
			distributionMode: DistributionMode;
			doubleMastersMode: boolean;
			draftLogRecipients: DraftLogRecipients;
			draftLogUnlockTimer: number;
			foil: boolean;
			hidePicks: boolean;
			maxDuplicates: { [rarity: string]: number } | null;
			mythicPromotion: boolean;
			ownerIsPlayer: boolean;
			personalLogs: boolean;
			pickedCardsPerRound: number;
			randomizeSeatingOrder: boolean;
			reviewTimer: number;
			teamDraft: boolean;
			tournamentTimer: boolean;
			useBoosterContent: boolean;
			useCustomCardList: boolean;
			usePredeterminedBoosters: boolean;
			virtualPlayersData: Record<UserID, UserData>;
		}>
	) => void;
	updateCustomCardListSetting: (name: keyof CCLSettings, value: unknown) => void;
	setRestriction: (setRestriction: Array<SetCode>) => void;
	ignoreCollections: (ignoreCollections: boolean) => void;
	setPickTimer: (pickTimer: number) => void;
	setMaxPlayers: (maxPlayers: number) => void;
	sessionOwner: (owner: UserID | undefined, userName: string | null) => void;
	isPublic: (isPublic: boolean) => void;
	description: (description: string) => void;

	// Draft Queue
	draftQueueReadyCheck: (queue: QueueID, timeout: number, players: { status: ReadyState }[]) => void;
	draftQueueReadyCheckUpdate: (queue: QueueID, players: { status: ReadyState }[]) => void;
	draftQueueReadyCheckCancel: (queue: QueueID, backInQueue: boolean) => void;

	draftLog: (draftLog: DraftLog) => void;
	draftLogLive: (data: {
		log?: DraftLog;
		userID?: UserID;
		pick?: DraftPick;
		decklist?:
			| DeckList
			| {
					hashes: {
						[key: string]: string;
					};
			  };
	}) => void;
	pickAlert: (data: { userID: UserID; userName: string; cards: UniqueCard[] }) => void;

	botRecommandations: (data: { pickNumber: number; scores: BotScores }) => void;

	resumeOnReconnection: (msg: Message) => void;

	sealedBoosters: (boosters: UniqueCard[][]) => void;
	setCardPool: (cards: UniqueCard[]) => void;
	addCards: (message: string, cards: UniqueCard[]) => void;
	updateCardState: (updates: { cardID: UniqueCardID; state: UniqueCardState }[]) => void;

	timer: (data: { countdown: number }) => void;
	disableTimer: () => void;

	startDraft: (userData: Record<UserID, UserData>) => void;
	draftState: (state: DraftSyncData) => void;
	"draftState:boosterCount": (boosterCount: number) => void;
	startReviewPhase: (timer: number) => void;
	endDraft: () => void;
	pauseDraft: () => void;
	resumeDraft: () => void;
	rejoinDraft: (data: {
		pickedCards: { main: UniqueCard[]; side: UniqueCard[] };
		botScores: BotScores;
		state: ReturnType<DraftState["syncData"]>;
	}) => void;
	virtualPlayersDataUpdate: (data: Record<UserID, Partial<UserData>>) => void;

	startWinstonDraft: (state: WinstonDraftSyncData) => void;
	winstonDraftSync: (syncData: WinstonDraftSyncData) => void;
	winstonDraftNextRound: (currentPlayer: UserID) => void;
	winstonDraftRandomCard: (card: UniqueCard) => void;
	winstonDraftEnd: () => void;
	rejoinWinstonDraft: (data: {
		state: WinstonDraftSyncData;
		pickedCards: { main: UniqueCard[]; side: UniqueCard[] };
	}) => void;

	startWinchesterDraft: (state: WinchesterDraftSyncData) => void;
	winchesterDraftSync: (syncData: WinchesterDraftSyncData) => void;
	winchesterDraftEnd: () => void;
	rejoinWinchesterDraft: (data: {
		state: WinchesterDraftSyncData;
		pickedCards: { main: UniqueCard[]; side: UniqueCard[] };
	}) => void;

	startHousmanDraft: (state: HousmanDraftSyncData) => void;
	housmanDraftSync: (syncData: HousmanDraftSyncData) => void;
	housmanDraftExchange: (index: number, card: UniqueCard, currentPlayer: UserID, exchangeNum: number) => void;
	housmanDraftRoundEnd: (finalHand: UniqueCard[]) => void;
	housmanDraftEnd: () => void;
	rejoinHousmanDraft: (data: {
		state: HousmanDraftSyncData;
		pickedCards: { main: UniqueCard[]; side: UniqueCard[] };
	}) => void;

	startGridDraft: (syncData: GridDraftSyncData) => void;
	gridDraftNextRound: (syncData: GridDraftSyncData) => void;
	gridDraftEnd: () => void;
	rejoinGridDraft: (data: {
		state: GridDraftSyncData;
		pickedCards: { main: UniqueCard[]; side: UniqueCard[] };
	}) => void;

	startRochesterDraft: (syncData: RochesterDraftSyncData) => void;
	rochesterDraftNextRound: (syncData: RochesterDraftSyncData) => void;
	rochesterDraftEnd: () => void;
	rejoinRochesterDraft: (data: {
		state: RochesterDraftSyncData;
		pickedCards: { main: UniqueCard[]; side: UniqueCard[] };
	}) => void;

	startRotisserieDraft: (syncData: RotisserieDraftSyncData) => void;
	rotisserieDraftUpdateState: (uniqueCardID: UniqueCardID, newOwnerID: UserID, currentPlayer: UserID) => void;
	rotisserieDraftEnd: () => void;
	rejoinRotisserieDraft: (data: {
		state: RotisserieDraftSyncData;
		pickedCards: { main: UniqueCard[]; side: UniqueCard[] };
	}) => void;

	startMinesweeperDraft: (syncData: MinesweeperSyncData) => void;
	minesweeperDraftState: (syncData: MinesweeperSyncData) => void;
	minesweeperDraftUpdateState: (syncData: MinesweeperSyncDataDiff) => void;
	minesweeperDraftEnd: (options: { immediate?: boolean }) => void;
	rejoinMinesweeperDraft: (data: {
		state: MinesweeperSyncData;
		pickedCards: { main: UniqueCard[]; side: UniqueCard[] };
	}) => void;

	startSolomonDraft: (syncData: SolomonDraftSyncData) => void;
	solomonDraftState: (syncData: SolomonDraftSyncData) => void;
	solomonDraftUpdatePiles: (piles: [UniqueCardID[], UniqueCardID[]]) => void;
	solomonDraftPicked: (pileIdx: 0 | 1) => void;
	solomonDraftEnd: (immediate?: boolean) => void;
	rejoinSolomonDraft: (data: {
		state: SolomonDraftSyncData;
		pickedCards: { main: UniqueCard[]; side: UniqueCard[] };
	}) => void;

	startSilentAuctionDraft: (syncData: SilentAuctionDraftSyncData) => void;
	silentAuctionDraftSync: (syncData: SilentAuctionDraftSyncData) => void;
	silentAuctionDraftResults: (results: ReturnType<SilentAuctionDraftState["solveBids"]>) => void;
	silentAuctionDraftNotifyBid: (userID: UserID) => void;
	silentAuctionDraftEnd: () => void;
	rejoinSilentAuctionDraft: (data: {
		state: SilentAuctionDraftSyncData;
		pickedCards: { main: UniqueCard[]; side: UniqueCard[] };
	}) => void;

	startTeamSealed: (data: {
		state: {
			cards: (UniqueCard & {
				owner: null;
			})[];
			team: string[];
		};
	}) => void;
	rejoinTeamSealed: (data: {
		state: {
			cards: (UniqueCard & {
				owner: null;
			})[];
			team: string[];
		};
		pickedCards: { main: UniqueCard[]; side: UniqueCard[] };
	}) => void;
	startTeamSealedSpectator: () => void;
	endTeamSealed: () => void;
	teamSealedUpdateCard: (cid: UniqueCardID, owner: UserID | null) => void;

	selectJumpstartPacks: (
		choices: [JumpInBooster[], JumpInBooster[][]],
		callback: (user: UserID, cards: CardID[]) => void
	) => void; // FIXME

	shareDecklist: (data: {
		sessionID: string;
		time: number;
		userID: string;
		decklist?: DeckList | { hashes: { [key: string]: string } | undefined };
	}) => void;

	askColor: (userName: string, card: UniqueCard, callback: (color: CardColor) => void) => void;
	choosePlayer: (reason: string, users: UserID[], callback: (user: UserID) => void) => void;

	takeoverVote: (userName: string, callback: (response: boolean | null) => void) => void;
}

export interface ClientToServerEvents {
	setSession: (sid: SessionID, options: Options) => void;

	// Personal events
	setUserName: (userName: string) => void;
	setCollection: (collection: PlainCollection, ack?: (response: SocketAck) => void) => void;
	parseCollection: (txtcollection: string, ack: (ret: SocketAck & { collection?: PlainCollection }) => void) => void;
	useCollection: (useCollection: boolean) => void;
	chatMessage: (message: { author: string; text: string; timestamp: number }) => void;
	setReady: (readyState: ReadyState) => void;
	passBooster: () => void;
	pickCard: (
		data: {
			pickedCards: Array<number>;
			burnedCards: Array<number>;
			draftEffect?: { effect: UsableDraftEffect; cardID: UniqueCardID };
			optionalOnPickDraftEffect?: { effect: OptionalOnPickDraftEffect; cardID: UniqueCardID };
		},
		ack: (result: SocketAck) => void
	) => void;
	gridDraftPick: (choice: number, ack: (result: SocketAck) => void) => void;
	rochesterDraftPick: (choices: Array<number>, ack: (result: SocketAck) => void) => void;
	rotisserieDraftPick: (uniqueCardID: UniqueCardID, ack: (result: SocketAck) => void) => void;
	winstonDraftTakePile: (num: number, ack: (result: SocketAck) => void) => void;
	winstonDraftSkipPile: (num: number, ack: (result: SocketAck) => void) => void;
	winchesterDraftPick: (pickedColumn: number, ack: (result: SocketAck) => void) => void;
	housmanDraftPick: (handIndex: number, revealedCardsIndex: number, ack: (result: SocketAck) => void) => void;
	minesweeperDraftPick: (row: number, col: number, ack: (result: SocketAck) => void) => void;
	solomonDraftOrganize: (piles: [UniqueCardID[], UniqueCardID[]], ack: (result: SocketAck) => void) => void;
	solomonDraftConfirmPiles: (ack: (result: SocketAck) => void) => void;
	solomonDraftPick: (pile: 0 | 1, ack: (result: SocketAck) => void) => void;
	teamSealedPick: (uniqueCardID: UniqueCardID, ack: (result: SocketAck) => void) => void;
	silentAuctionDraftBid: (bids: number[], ack: (result: SocketAck) => void) => void;
	updateBracket: (matchIndex: number, playerIndex: number, value: number) => void;
	updateDeckLands: (lands: DeckBasicLands) => void;
	moveCard: (uniqueID: UniqueCardID, destStr: string) => void;
	swapDeckAndSideboard: () => void;
	moveAllToDeck: () => void;
	moveAllToSideboard: () => void;
	removeBasicsFromDeck: () => void;
	retrieveUpdatedDraftLogs: (logSessionID: SessionID, timestamp: number, lastUpdated: number | undefined) => void;

	// Draft Queue
	draftQueueSetReadyState: (status: ReadyState) => void;
	draftQueueRegister: (setCode: SetCode, ack: (result: SocketAck) => void) => void;
	draftQueueUnregister: (ack: (result: SocketAck) => void) => void;

	// Owner Only
	setOwnerIsPlayer: (val: boolean) => void;
	readyCheck: (ack: (result: SocketAck) => void) => void;
	startDraft: (ack: (result: SocketAck) => void) => void;
	stopDraft: () => void;
	pauseDraft: () => void;
	resumeDraft: () => void;
	startSupremeDraft: (
		boostersPerPlayer: number,
		pickedCardsPerRound: number,
		ack: (result: SocketAck) => void
	) => void;
	startGlimpseDraft: (
		boostersPerPlayer: number,
		burnedCardsPerRound: number,
		ack: (result: SocketAck) => void
	) => void;
	startGridDraft: (
		boosterCount: number,
		twoPicksPerGrid: boolean,
		regularBoosters: boolean,
		ack: (result: SocketAck) => void
	) => void;
	startRochesterDraft: (ack: (s: SocketAck) => void) => void;
	startRotisserieDraft: (options: RotisserieDraftStartOptions, ack: (s: SocketAck) => void) => void;
	startWinstonDraft: (
		boostersPerPlayer: number,
		pileCount: number,
		removeBasicLands: boolean,
		ack: (s: SocketAck) => void
	) => void;
	startWinchesterDraft: (boosterPerPlayer: number, removeBasicLands: boolean, ack: (s: SocketAck) => void) => void;
	startHousmanDraft: (
		handSize: number,
		revealedCardsCount: number,
		exchangeCount: number,
		roundCount: number,
		removeBasicLands: boolean,
		turnOrder: "classic" | "snake",
		ack: (s: SocketAck) => void
	) => void;
	startMinesweeperDraft: (
		gridCount: number,
		gridWidth: number,
		gridHeight: number,
		picksPerGrid: number,
		revealCenter: boolean,
		revealCorners: boolean,
		revealBorders: boolean,
		ack: (result: SocketAck) => void
	) => void;
	startSolomonDraft: (
		cardCount: number,
		roundCount: number,
		removeBasicLands: boolean,
		ack: (s: SocketAck) => void
	) => void;
	startTeamSealed: (
		boostersPerTeam: number,
		customBoosters: Array<string>,
		teams: UserID[][],
		ack: (result: SocketAck) => void
	) => void;
	startSilentAuctionDraft: (
		boosterCount: number,
		startingFunds: number,
		pricePaid: "first" | "second",
		reservePrice: number,
		tiebreakers: Tiebreaker[],
		ack: (result: SocketAck) => void
	) => void;
	setSessionOwner: (newOwnerID: UserID) => void;
	removePlayer: (userToRemove: UserID) => void;
	setSeating: (seating: Array<UserID>) => void;
	boostersPerPlayer: (boostersPerPlayer: number) => void;
	cardsPerBooster: (cardsPerBooster: number) => void;
	teamDraft: (teamDraft: boolean) => void;
	setRandomizeSeatingOrder: (randomizeSeatingOrder: boolean) => void;
	setDisableBotSuggestions: (disableBotSuggestions: boolean) => void;
	setDistributionMode: (distributionMode: DistributionMode) => void;
	setCustomBoosters: (customBoosters: Array<string>) => void;
	setBots: (bots: number) => void;
	setRestriction: (setRestriction: Array<SetCode>) => void;
	parseCustomCardList: (customCardList: string, ack: (result: SocketAck) => void) => void;
	importCube: (
		data: {
			name?: string;
			service: string;
			matchVersions: boolean;
			cubeID: string;
			sendResultsToCubeCobra?: boolean;
			retrieveCustomProperties?: boolean;
		},
		ack: (result: SocketAck) => void
	) => void;
	loadLocalCustomCardList: (cubeName: string, ack: (result: SocketAck) => void) => void;
	ignoreCollections: (ignoreCollections: boolean) => void;
	setPickTimer: (maxTimer: number) => void;
	setTournamentTimer: (tournamentTimer: boolean) => void;
	setReviewTimer: (reviewTimer: number) => void;
	setHidePicks: (hidePicks: boolean) => void;
	setMaxPlayers: (maxPlayers: number) => void;
	setMythicPromotion: (mythicPromotion: boolean) => void;
	setUseBoosterContent: (useBoosterContent: boolean) => void;
	setBoosterContent: (boosterContent: { common: number; uncommon: number; rare: number; bonus: number }) => void;
	setUsePredeterminedBoosters: (value: boolean) => void;
	setBoosters: (text: string, ack: (result: SocketAck) => void) => void;
	shuffleBoosters: (ack: (result: SocketAck) => void) => void;
	setPersonalLogs: (value: boolean) => void;
	setDraftLogRecipients: (draftLogRecipients: DraftLogRecipients) => void;
	setDraftLogUnlockTimer: (draftLogUnlockTimer: number) => void;
	setMaxDuplicates: (maxDuplicates: { [rarity in "common" | "uncommon" | "rare" | "mythic"]: number } | null) => void;
	setColorBalance: (colorBalance: boolean) => void;
	setFoil: (foil: boolean) => void;
	setUseCustomCardList: (useCustomCardList: boolean) => void;
	setCustomCardListWithReplacement: (customCardListWithReplacement: boolean) => void;
	setCustomCardListDuplicateProtection: (customCardListDuplicateProtection: boolean) => void;
	setCustomCardListSetting: (key: unknown, value: unknown) => void;
	setDoubleMastersMode: (doubleMastersMode: boolean) => void;
	setPickedCardsPerRound: (pickedCardsPerRound: number) => void;
	setBurnedCardsPerRound: (burnedCardsPerRound: number) => void;
	setDiscardRemainingCardsAt: (discardRemainingCardsAt: number) => void;
	setPublic: (isPublic: boolean) => void;
	setDescription: (description: string) => void;
	replaceDisconnectedPlayers: () => void;
	distributeJumpstart: (set: string | string[], ack: (result: SocketAck) => void) => void;
	generateBracket: (type: BracketType, ack: (result: SocketAck) => void) => void;
	lockBracket: (bracketLocked: boolean) => void;
	syncBracketMTGO: (value: boolean) => void;
	shareDraftLog: (draftLog: DraftLog) => void;
	distributeSealed: (
		boostersPerPlayer: number,
		customBoosters: Array<string>,
		ack: (result: SocketAck) => void
	) => void;

	requestTakeover: (ack: (result: SocketAck) => void) => void;

	convertMTGOLog: (str: string, callback: (response: SocketError | DraftLog) => void) => void;
}

// eslint-disable-next-line @typescript-eslint/no-empty-object-type
export interface InterServerEvents {}

export interface SocketData {
	userID: UserID;
}

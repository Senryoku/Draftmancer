import { GridDraftSyncData } from "./GridDraft";
import { WinstonDraftState, WinstonDraftSyncData } from "./WinstonDraft";
import { SessionID, UserID } from "./IDTypes";
import { Message, SocketAck } from "./Message";
import { DistributionMode, DraftLogRecipients, ReadyState, UsersData } from "./Session/SessionTypes";
import { Options } from "./utils";
import { SetCode } from "./Types";
import { DraftLog, DraftPick } from "./DraftLog";
import { CardID, CardPool, DeckBasicLands, DeckList, PlainCollection, UniqueCard, UniqueCardID } from "./CardTypes";
import { RochesterDraftState, RochesterDraftSyncData } from "./RochesterDraft";
import { MinesweeperDraftState, MinesweeperSyncData } from "./MinesweeperDraft";
import { DraftState } from "./DraftState";
import { BotScores } from "./Bot";
import SessionsSettingsProps from "./Session/SessionProps";
import { getPublicSessionData } from "./Session";
import { JHHBooster } from "./JumpstartHistoricHorizons";
import { RotisserieDraftState, RotisserieDraftSyncData } from "./RotisserieDraft";

export interface ServerToClientEvents {
	updatePublicSession: (data: { id: SessionID; isPrivate: true } | ReturnType<typeof getPublicSessionData>) => void;
	publicSessions: (publicSessions: ReturnType<typeof getPublicSessionData>[]) => void;
	alreadyConnected: (uid: UserID) => void;
	stillAlive: (callback: () => void) => void;
	setSession: (sid: SessionID) => void;
	message: (msg: Message) => void;
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
	updateUser: (data: { userID: UserID; updatedProperties: any }) => void; // FIXME

	userDisconnected: (data: { owner: UserID; disconnectedUsers: { [uid: string]: any } }) => void; // FIXME
	sessionOptions: (sessionOptions: { [key: keyof typeof SessionsSettingsProps]: any }) => void; // FIXME: Specify allowed options and their types
	setRestriction: (setRestriction: Array<SetCode>) => void;
	ignoreCollections: (ignoreCollections: boolean) => void;
	setPickTimer: (pickTimer: number) => void;
	setMaxPlayers: (maxPlayers: number) => void;
	sessionOwner: (owner: UserID, userName: string | null) => void;
	isPublic: (isPublic: boolean) => void;
	description: (description: string) => void;

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

	setCardSelection: (boosters: UniqueCard[][]) => void;

	timer: (data: { countdown: number }) => void;
	disableTimer: () => void;

	startDraft: (userData: UsersData) => void;
	draftState: (state: ReturnType<DraftState["syncData"]> | { boosterNumber: number }) => void;
	endDraft: () => void;
	pauseDraft: () => void;
	resumeDraft: () => void;
	rejoinDraft: (data: {
		pickedCards: { main: UniqueCard[]; side: UniqueCard[] };
		booster: UniqueCard[] | null;
		boosterNumber: number;
		pickNumber: number;
		botScores: BotScores;
	}) => void;

	startWinstonDraft: (state: WinstonDraftSyncData) => void;
	winstonDraftSync: (syncData: WinstonDraftSyncData) => void;
	winstonDraftNextRound: (currentPlayer: UserID) => void;
	winstonDraftRandomCard: (card: UniqueCard) => void;
	winstonDraftEnd: () => void;
	rejoinWinstonDraft: (data: {
		state: WinstonDraftSyncData;
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
	minesweeperDraftEnd: (options: { immediate?: boolean }) => void;
	rejoinMinesweeperDraft: (data: {
		state: MinesweeperSyncData;
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
		choices: [JHHBooster[], JHHBooster[][]],
		callback: (user: UserID, cards: CardID[]) => void
	) => void; // FIXME

	shareDecklist: (data: {
		sessionID: string;
		time: number;
		userID: string;
		decklist?:
			| DeckList
			| {
					hashes:
						| {
								[key: string]: string;
						  }
						| undefined;
			  };
	}) => void;
}

export interface ClientToServerEvents {
	setSession: (sid: SessionID, options: Options) => void;

	// Personal events
	setUserName: (userName: string) => void;
	setCollection: (
		collection: PlainCollection,
		ack?: (response: SocketAck | { collection: CardPool }) => void
	) => void;
	parseCollection: (txtcollection: string, ack: (ret: SocketAck & { collection?: PlainCollection }) => void) => void;
	useCollection: (useCollection: boolean) => void;
	chatMessage: (message: { author: string; text: string; timestamp: number }) => void;
	setReady: (readyState: ReadyState) => void;
	pickCard: (
		data: { pickedCards: Array<number>; burnedCards: Array<number> },
		ack: (result: SocketAck) => void
	) => void;
	gridDraftPick: (choice: number, ack: (result: SocketAck) => void) => void;
	rochesterDraftPick: (choices: Array<number>, ack: (result: SocketAck) => void) => void;
	rotisserieDraftPick: (uniqueCardID: UniqueCardID, ack: (result: SocketAck) => void) => void;
	winstonDraftTakePile: (ack: (result: SocketAck) => void) => void;
	winstonDraftSkipPile: (ack: (result: SocketAck) => void) => void;
	minesweeperDraftPick: (row: number, col: number, ack: (result: SocketAck) => void) => void;
	teamSealedPick: (uniqueCardID: UniqueCardID, ack: (result: SocketAck) => void) => void;
	updateBracket: (results: Array<[number, number]>) => void;
	updateDeckLands: (lands: DeckBasicLands) => void;
	moveCard: (uniqueID: UniqueCardID, destStr: string) => void;

	// Owner Only
	setOwnerIsPlayer: (val: boolean) => void;
	readyCheck: (ack: (result: SocketAck) => void) => void;
	startDraft: () => void;
	stopDraft: () => void;
	pauseDraft: () => void;
	resumeDraft: () => void;
	startGridDraft: (boosterCount: number) => void;
	startRochesterDraft: () => void;
	startRotisserieDraft: (ack: (s: SocketAck) => void) => void;
	startWinstonDraft: (boosterCount: number) => void;
	startMinesweeperDraft: (
		gridCount: number,
		gridWidth: number,
		gridHeight: number,
		picksPerGrid: number,
		revealBorders: boolean,
		ack: (result: SocketAck) => void
	) => void;
	startTeamSealed: (
		boostersPerTeam: number,
		customBoosters: Array<string>,
		teams: UserID[][],
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
	importCube: (data: any, ack: (result: SocketAck) => void) => void; // FIXME
	loadLocalCustomCardList: (cubeName: string, ack: (result: SocketAck) => void) => void;
	ignoreCollections: (ignoreCollections: boolean) => void;
	setPickTimer: (maxTimer: number) => void;
	setMaxPlayers: (maxPlayers: number) => void;
	setMythicPromotion: (mythicPromotion: boolean) => void;
	setUseBoosterContent: (useBoosterContent: boolean) => void;
	setBoosterContent: (boosterContent: { common: number; uncommon: number; rare: number }) => void;
	setUsePredeterminedBoosters: (value: boolean) => void;
	setBoosters: (text: string, ack: (result: SocketAck) => void) => void;
	shuffleBoosters: (ack: (result: SocketAck) => void) => void;
	setPersonalLogs: (value: boolean) => void;
	setDraftLogRecipients: (draftLogRecipients: DraftLogRecipients) => void;
	setMaxDuplicates: (maxDuplicates: { [rarity in "common" | "uncommon" | "rare" | "mythic"]: number } | null) => void;
	setColorBalance: (colorBalance: boolean) => void;
	setFoil: (foil: boolean) => void;
	setCollationType: (preferredCollation: string) => void;
	setUseCustomCardList: (useCustomCardList: boolean) => void;
	setCustomCardListWithReplacement: (customCardListWithReplacement: boolean) => void;
	setDoubleMastersMode: (doubleMastersMode: boolean) => void;
	setPickedCardsPerRound: (pickedCardsPerRound: number) => void;
	setBurnedCardsPerRound: (burnedCardsPerRound: number) => void;
	setDiscardRemainingCardsAt: (discardRemainingCardsAt: number) => void;
	setPublic: (isPublic: boolean) => void;
	setDescription: (description: string) => void;
	replaceDisconnectedPlayers: () => void;
	distributeJumpstart: (set?: string) => void;
	generateBracket: (players: Array<{ userID: UserID; userName: string }>, ack: (result: SocketAck) => void) => void;
	generateSwissBracket: (
		players: Array<{ userID: UserID; userName: string }>,
		ack: (result: SocketAck) => void
	) => void;
	generateDoubleBracket: (
		players: Array<{ userID: UserID; userName: string }>,
		ack: (result: SocketAck) => void
	) => void;
	lockBracket: (bracketLocked: boolean) => void;
	shareDraftLog: (draftLog: DraftLog) => void;
	distributeSealed: (boostersPerPlayer: number, customBoosters: Array<string>) => void;
}

export interface InterServerEvents {}

// TODO: We can now use socket.data to store some user info.
export interface SocketData {
	userID: UserID;
}

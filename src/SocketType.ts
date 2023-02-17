import { GridDraftState, GridDraftSyncData } from "./GridDraft";
import { WinstonDraftState } from "./WinstonDraft";
import { SessionID, UserID } from "./IDTypes";
import { Message } from "./Message";
import { getPublicSessionData, UsersData } from "./Session";
import { Options } from "./utils";
import { SetCode } from "./Types";
import { DraftLog, DraftPick } from "./DraftLog";
import { CardID, DeckList, UniqueCard, UniqueCardID } from "./CardTypes";
import { RochesterDraftState } from "./RochesterDraft";
import { MinesweeperDraftState } from "./MinesweeperDraft";
import { DraftState } from "./DraftState";
import { BotScores } from "./Bot";

export interface ServerToClientEvents {
	updatePublicSession: (data: { id: SessionID; isPrivate: true } | ReturnType<typeof getPublicSessionData>) => void;
	publicSessions: (publicSessions: ReturnType<typeof getPublicSessionData>[]) => void;
	alreadyConnected: (uid: UserID) => void;
	stillAlive: (callback: () => void) => void;
	setSession: (sid: SessionID) => void;
	message: (msg: Message) => void;
	chatMessage: (msg: { author: string; text: string; timestamp: number }) => void;
	readyCheck: () => void;
	setReady: (userID: UserID, readyState: boolean) => void;
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
	sessionOptions: (sessionOptions: Options) => void; // FIXME
	bots: (bots: number) => void;
	setRestriction: (setRestriction: Array<SetCode>) => void;
	ignoreCollections: (ignoreCollections: boolean) => void;
	setPickTimer: (pickTimer: number) => void;
	setMaxPlayers: (maxPlayers: number) => void;
	sessionOwner: (owner: UserID, userName: string | null) => void;
	isPublic: (isPublic: boolean) => void;
	description: (description: string) => void;

	draftLog: (draftLog: DraftLog) => void;
	draftLogLive: (data: { log?: DraftLog; userID?: UserID; pick?: DraftPick }) => void;
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

	startWinstonDraft: (state: WinstonDraftState) => void;
	winstonDraftSync: (syncData: ReturnType<WinstonDraftState["syncData"]>) => void;
	winstonDraftNextRound: (currentPlayer: UserID) => void;
	winstonDraftRandomCard: (card: UniqueCard) => void;
	winstonDraftEnd: () => void;

	startGridDraft: (syncData: GridDraftSyncData) => void;
	gridDraftNextRound: (syncData: GridDraftSyncData) => void;
	gridDraftEnd: () => void;

	startRochesterDraft: (syncData: ReturnType<RochesterDraftState["syncData"]>) => void;
	rochesterDraftNextRound: (syncData: ReturnType<RochesterDraftState["syncData"]>) => void;
	rochesterDraftEnd: () => void;

	startMinesweeperDraft: (syncData: ReturnType<MinesweeperDraftState["syncData"]>) => void;
	minesweeperDraftState: (syncData: ReturnType<MinesweeperDraftState["syncData"]>) => void;
	minesweeperDraftEnd: (options: { immediate?: boolean }) => void;

	startTeamSealed: (data: {
		state: {
			cards: (UniqueCard & {
				owner: null;
			})[];
			team: string[];
		};
	}) => void;
	startTeamSealedSpectator: () => void;
	endTeamSealed: () => void;
	teamSealedUpdateCard: (cid: UniqueCardID, owner: UserID | null) => void;

	selectJumpstartPacks: (choices: any, callback: (user: UserID, cards: CardID[]) => void) => void; // FIXME

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
}

export interface InterServerEvents {}

// TODO: We can now use socket.data to store some user info.
export interface SocketData {
	userID: string;
}

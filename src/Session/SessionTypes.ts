import { UniqueCard } from "../CardTypes";
import { UserID } from "../IDTypes";

export enum ReadyState {
	Unknown = "Unknown",
	Ready = "Ready",
	NotReady = "NotReady",
	DontCare = "DontCare",
}

export type UserData = {
	userID: UserID;
	userName: string;
	isBot: boolean;
	isDisconnected: boolean;
	boosterCount?: number;
};

export type UsersData = {
	[uid: UserID]: UserData;
};

export type DistributionMode = "regular" | "shufflePlayerBoosters" | "shuffleBoosterPool";
export type DraftLogRecipients = "none" | "owner" | "delayed" | "everyone";

export type DisconnectedUser = {
	userName: string;
	pickedCards: { main: UniqueCard[]; side: UniqueCard[] };
};

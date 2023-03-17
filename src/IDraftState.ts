import { UserID } from "./IDTypes.js";

export abstract class IDraftState {
	type: string;
	constructor(type: string) {
		this.type = type;
	}

	abstract syncData(userID: UserID): unknown;
}

export interface TurnBased extends IDraftState {
	currentPlayer(): UserID;
}

export function instanceOfTurnBased(object: IDraftState): object is TurnBased {
	return "currentPlayer" in object;
}

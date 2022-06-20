import { UserID } from "./IDTypes.js";

export class IDraftState {
	type: string;
	constructor(type: string) {
		this.type = type;
	}
}

export interface TurnBased extends IDraftState {
	currentPlayer(): UserID;
}

export function instanceOfTurnBased(object: any): object is TurnBased {
	return "currentPlayer" in object;
}

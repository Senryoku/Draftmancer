import axios from "axios";
import { InTesting, InProduction } from "./Context.js";
import { Session } from "./Session.js";

export function sendDraftLogToCubeCobra(session: Session) {
	// if (!InProduction) return;
	console.log(
		`sendDraftLogToCubeCobra: session.useCustomCardList: ${session.useCustomCardList}, session.customCardList.cubeCobraID: ${session.customCardList.cubeCobraID}`
	);
	try {
		if (session.useCustomCardList && session.customCardList.cubeCobraID) {
			console.log(`Sending draft log to CubeCobra (CubeID: ${session.customCardList.cubeCobraID})...`);

			// TODO
		}
	} catch (err) {
		console.error("Error sending draft log to CubeCobra: ", err);
	}
}

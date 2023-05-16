import { CardColor, OracleID, UniqueCard } from "./CardTypes.js";
import { Connections } from "./Connection.js";
import { getRandom } from "./utils.js";

export const CogworkLibrarianOracleID = "ec0d964e-ca2c-4252-8551-cf1916576653";

// List of cards that are drafted face up.
export const FaceUpCards: OracleID[] = [
	"19047c4b-0106-455d-ab71-68cabfae7404", // Agent of Acquisitions
	"70ff487d-96b3-4322-9975-59bf3c6b517f", // Animus of Predation
	"6ca0078f-d6b5-4643-b801-e7a98706f21c", // Archdemon of Paliano
	"bb6bda0d-ddb8-47fa-be07-bbcd73a52830", // Canal Dredger
	"f10898a5-87ec-4a30-a383-9f9bcba3e4d0", // Cogwork Grinder
	"ec0d964e-ca2c-4252-8551-cf1916576653", // Cogwork Librarian
	"1269f7dc-a5d6-48e9-8887-b581ce38c204", // Deal Broker
	"5e8c6894-c9ad-4a50-af13-c2d95395c71e", // Illusionary Informant
	"8fedb2c2-fb13-4af1-b85e-714832562da7", // Leovold's Operative
	"96d88811-d0d8-4c64-b7f2-8304d81c8cfa", // Noble Banneret
	"6dd3be81-b6dc-42ee-9e0a-2e39e3f4e793", // Paliano Vanguard
	"dc90b4aa-ba5e-4188-939d-b3920bd9ab0d", // Smuggler Captain
	"e40daee2-f9e6-489f-b3dd-274e5a6b8604", // Whispergear Sneak
];

// List of cards that are revealed after being drafted.
export const RevealedCards: OracleID[] = [
	"80ea63fd-691a-45ba-a4bf-862e5ec2922d", // Aether Searcher
	"adfd33cb-086c-48f4-b443-ba971ff43684", // Cogwork Spy
	"c60ba5e9-dbfa-441b-a96f-9cc7fdfd2d76", // Cogwork Tracker
	"abd78909-72dc-4d36-8990-39995fd071da", // Custodi Peacekeeper
	"8ddbb63c-7f52-431b-bb82-e020b1c3749a", // Garbage Fire
	"19a3c505-b180-47cc-bef3-9e807a8a4a3d", // Lore Seeker
	"412fbf73-a471-42ad-83fe-14f19e4e9595", // Lurking Automaton
	"cf682012-de36-4ab4-ad94-c3c0fd7bce3f", // Paliano, the High City
	"6ea507d3-2b8d-4f08-824c-0de0ae214da5", // Pyretic Hunter
	"db8e3c05-12d6-41f6-8cc7-e64c863fca58", // Regicide
	"d5fc017a-7517-4737-ad5b-cc45f1e139ea", // Spire Phantasm
];

// Ask neighbors to choose a color to be noted on a card (see the Conspiracy cards 'Paliano, the High City' and 'Regicide')
export async function askColors(card: UniqueCard, userID: string, leftPlayer: string, rightPlayer: string) {
	if (!card.state) card.state = {};
	card.state.colors = [];
	const userName = Connections[userID]?.userName;
	for (const uid of [rightPlayer, userID, leftPlayer]) {
		const promise = new Promise<CardColor | undefined>((resolve) => {
			// Is disconnected, or simply a bot.
			if (!Connections[uid]?.socket) resolve(undefined);
			else
				Connections[uid].socket.timeout(32000).emit("askColor", userName, card, (err, selectedColor) => {
					if (err) resolve(undefined);
					else resolve(selectedColor);
				});
		});
		const selectedColor = await promise;
		// Get a random new color if player did not respond in time.
		if (!selectedColor || card.state.colors.includes(selectedColor))
			card.state.colors.push(
				getRandom((["W", "U", "B", "R", "G"] as CardColor[]).filter((c) => !card.state!.colors!.includes(c)))
			);
		else card.state.colors.push(selectedColor);

		Connections[userID]?.socket?.emit("updateCardState", [{ cardID: card.uniqueID, state: card.state }]);
	}
}

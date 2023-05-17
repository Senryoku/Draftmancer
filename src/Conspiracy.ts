import { CardColor, UniqueCard } from "./CardTypes.js";
import { Connections } from "./Connection.js";
import { getRandom } from "./utils.js";

// Ask neighbors to choose a color to be noted on a card (see the Conspiracy cards 'Paliano, the High City' and 'Regicide')
export async function askColors(card: UniqueCard, userID: string, leftPlayer: string, rightPlayer: string) {
	if (!card.state) card.state = {};
	card.state.colors = [];
	const userName = Connections[userID]?.userName;
	for (const uid of [rightPlayer, userID, leftPlayer]) {
		const selectedColor = await new Promise<CardColor | undefined>((resolve) => {
			// Is disconnected, or simply a bot.
			if (!Connections[uid]?.socket) resolve(undefined);
			else
				Connections[uid].socket.timeout(32000).emit("askColor", userName, card, (err, selectedColor) => {
					if (err) resolve(undefined);
					else resolve(selectedColor);
				});
		});
		// Get a random new color if player did not respond in time.
		if (!selectedColor || card.state.colors.includes(selectedColor))
			card.state.colors.push(
				getRandom((["W", "U", "B", "R", "G"] as CardColor[]).filter((c) => !card.state!.colors!.includes(c)))
			);
		else card.state.colors.push(selectedColor);

		Connections[userID]?.socket?.emit("updateCardState", [{ cardID: card.uniqueID, state: card.state }]);
	}
}

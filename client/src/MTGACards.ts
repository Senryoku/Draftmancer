import { ArenaID, Card } from "@/CardTypes";
import _mtgaCards from "./data/MTGACards.json" assert { type: "json" };

export const MTGACards = _mtgaCards as { [aid: ArenaID]: Card };

export default MTGACards;

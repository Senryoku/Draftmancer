import { ArenaID, Card } from "@/CardTypes";
import _mtgaCards from "./data/MTGACards.json" with { type: "json" };

export const MTGACards = _mtgaCards as { [aid: ArenaID]: Card };

export default MTGACards;

import { ArenaID } from "@/CardTypes";
import _mtgaAlternates from "./data/MTGAAlternates.json" assert { type: "json" };
export const MTGAAlternates = _mtgaAlternates as { [name: string]: ArenaID[] };
export default MTGAAlternates;

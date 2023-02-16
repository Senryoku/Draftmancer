import { ArenaID } from "../../src/CardTypes";
import MTGACards from "../public/data/MTGACards.json";

// List of arena_ids for a given card name
const MTGAAlternates: { [name: string]: ArenaID[] } = {};
for (let c of Object.values(MTGACards)) {
	if (!MTGAAlternates[c.name]) MTGAAlternates[c.name] = [];
	if (c.arena_id) MTGAAlternates[c.name].push(c.arena_id);
}

export default MTGAAlternates;

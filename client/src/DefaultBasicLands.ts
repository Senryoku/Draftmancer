import { CardColor, Card } from "@/CardTypes";
import _lands from "./data/DefaultBasicLands.json" assert { type: "json" };

export const BasicLands = _lands as { [c in CardColor]: Card };

export default BasicLands;

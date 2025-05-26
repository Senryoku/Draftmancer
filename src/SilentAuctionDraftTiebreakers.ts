export const TiebreakerProperties = ["funds", "cards"] as const;
export type Tiebreaker = { property: (typeof TiebreakerProperties)[number]; winner: "lower" | "higher" };
export const DefaultTiebreakers = [
	{ property: "funds", winner: "higher" },
	{ property: "cards", winner: "lower" },
] as const;

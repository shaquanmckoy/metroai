// pairs.ts
// Shared constants used by MetroXPanel and dashboard

export const PAIRS = ["R_10", "R_25", "R_50", "R_75", "R_100"] as const;

export type Pair = (typeof PAIRS)[number];
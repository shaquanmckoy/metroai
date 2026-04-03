export type Trade = any;

export type UIFlags = Record<string, boolean | undefined>;

export type BarrierOptimizerWindow = 3 | 5 | 10 | 15;

export type BarrierOptimizerRow = {
  pair: string;
  label: string;
  score: number;
  ticks: number;
  higherWinPct: number;
  lowerWinPct: number;
  avgMoveUp: number;
  avgMoveDown: number;
  higherBarrier: number;
  lowerBarrier: number;
  best: string;
  difference: number;
};
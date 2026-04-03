import type { Pair } from "@/app/dashboard/page";

export const RISE_FALL_PAIRS: readonly Pair[] = [
  "R_10",
  "R_25",
  "R_50",
  "R_75",
  "R_100",
  "1HZ10V",
  "1HZ15V",
  "1HZ25V",
  "1HZ30V",
  "1HZ50V",
  "1HZ75V",
  "1HZ90V",
  "1HZ100V",
  "JD10",
  "JD25",
  "JD50",
  "JD75",
  "JD100",
  "RDBEAR",
  "RDBULL",
  "STPRNG",
  "STPRNG2",
  "STPRNG3",
  "STPRNG4",
  "STPRNG5",
];

export const STEP_ONLY_PAIRS: readonly Pair[] = [
  "STPRNG",
  "STPRNG2",
  "STPRNG3",
  "STPRNG4",
  "STPRNG5",
];

export const INDEX_GROUPS = {
  volatility: [
    { code: "R_10", label: "Volatility 10 Index" },
    { code: "R_25", label: "Volatility 25 Index" },
    { code: "R_50", label: "Volatility 50 Index" },
    { code: "R_75", label: "Volatility 75 Index" },
    { code: "R_100", label: "Volatility 100 Index" },
    { code: "1HZ10V", label: "Volatility 10 (1s) Index" },
    { code: "1HZ15V", label: "Volatility 15 (1s) Index" },
    { code: "1HZ25V", label: "Volatility 25 (1s) Index" },
    { code: "1HZ30V", label: "Volatility 30 (1s) Index" },
    { code: "1HZ50V", label: "Volatility 50 (1s) Index" },
    { code: "1HZ75V", label: "Volatility 75 (1s) Index" },
    { code: "1HZ90V", label: "Volatility 90 (1s) Index" },
    { code: "1HZ100V", label: "Volatility 100 (1s) Index" },
  ],
  jump: [
    { code: "JD10", label: "Jump 10 Index" },
    { code: "JD25", label: "Jump 25 Index" },
    { code: "JD50", label: "Jump 50 Index" },
    { code: "JD75", label: "Jump 75 Index" },
    { code: "JD100", label: "Jump 100 Index" },
  ],
  Step: [
    { code: "STPRNG", label: "Step Index" },
    { code: "STPRNG2", label: "Step Index 200" },
    { code: "STPRNG3", label: "Step Index 300" },
    { code: "STPRNG4", label: "Step Index 400" },
    { code: "STPRNG5", label: "Step Index 500" },
  ],
};
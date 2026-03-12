"use client";

import React, { useEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";

const APP_ID = 1089;

// ===================== UPDATED INDEX LIST =====================

export const INDEX_GROUPS = {
  volatility: [
    { code: "R_10", label: "Volatility 10 Index" },
    { code: "R_25", label: "Volatility 25 Index" },
    { code: "R_50", label: "Volatility 50 Index" },
    { code: "R_75", label: "Volatility 75 Index" },
    { code: "R_100", label: "Volatility 100 Index" },
    { code: "1HZ10V", label: "Volatility 10 (1s) Index" },
    {code: "1HZ15V", label: "Volatility 15 (1s) Index" },
    { code: "1HZ25V", label: "Volatility 25 (1s) Index" },
    {code: "1HZ30V", label: "Volatility 30 (1s) Index" },
    { code: "1HZ50V", label: "Volatility 50 (1s) Index" },
    { code: "1HZ75V", label: "Volatility 75 (1s) Index" },
    {code: "1HZ90V", label: "Volatility 90 (1s) Index" },
    { code: "1HZ100V", label: "Volatility 100 (1s) Index" },
    
    
  ],

  jump: [
    { code: "JD10", label: "Jump 10 Index" },
    { code: "JD25", label: "Jump 25 Index" },
    { code: "JD50", label: "Jump 50 Index" },
    { code: "JD75", label: "Jump 75 Index" },
    { code: "JD100", label: "Jump 100 Index" },
    { code: "RDBEAR", label: "Bear Market Index" },
    { code: "RDBULL", label: "Bull Market Index" },
  ],

  Step: [
    { code: "STPRNG", label: "STEP INDEX 100" },
    { code: "STPRNG2", label: "STEP INDEX 200" },
    { code: "STPRNG3", label: "STEP INDEX 300" },
    { code: "STPRNG4", label: "STEP INDEX 500" },
    { code: "STPRNG5", label: "STEP INDEX 1000" },
  ],
};

export const METRO_SPIDER_PAIRS = [
  // Volatility
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

  // Jump
  "JD10",
  "JD25",
  "JD50",
  "JD75",
  "JD100",
  "RDBEAR",
  "RDBULL",
] as const;

export const RISE_FALL_PAIRS = [
  ...METRO_SPIDER_PAIRS,

  // Step (Rise/Fall only)
  "STPRNG",
  "STPRNG2",
  "STPRNG3",
  "STPRNG4",
  "STPRNG5",
] as const;

export const STEP_ONLY_PAIRS = RISE_FALL_PAIRS.filter(
  (p) => !METRO_SPIDER_PAIRS.includes(p as (typeof METRO_SPIDER_PAIRS)[number])
) as readonly Pair[];

export const PAIRS = RISE_FALL_PAIRS;

export type Pair = (typeof PAIRS)[number];

type TradeResult = "Win" | "Loss" | "Pending";
type TradeType =
  | "Matches"
  | "Differs"
  | "Over"
  | "Under"
  | "Rise"
  | "Fall"
  | "Higher"
  | "Lower";

type Trade = {
 source?: "MetroX" | "Metro" | "SpiderX" | "SpiderX Auto" | "Edshell" | "M-Spider";
  id: number; // req_id
  contract_id?: number;

  symbol: Pair;
  digit: number;
  type: TradeType;

  stake: number;
  durationTicks: number;

  payout?: number;
  profit?: number;

  // ✅ digit contract settled on (exit/settlement digit)
  settlementDigit?: number;

  result: TradeResult;
  createdAt: number;
    batchIndex?: number; // 1,2,3...
  batchTotal?: number; // 3 or 5
};

type BarrierOptimizerWindow = 3 | 5 | 10 | 15;

type BarrierOptimizerRow = {
  pair: Pair;
  label: string;
  ticks: number;
  higherWinPct: number;
  lowerWinPct: number;
  avgMoveUp: number;
  avgMoveDown: number;
  higherBarrier: number;
  lowerBarrier: number;
  difference: number;
  best: "HIGHER" | "LOWER";
  score: number;
};

const CONTRACT_TYPE_MAP: Record<TradeType, string> = {
  Matches: "DIGITMATCH",
  Differs: "DIGITDIFF",
  Over: "DIGITOVER",
  Under: "DIGITUNDER",

  // Rise/Fall
  Rise: "CALL",
  Fall: "PUT",

  // Higher/Lower
  Higher: "CALL",
  Lower: "PUT",
};
function getContractType(type: TradeType, allowEquals: boolean) {
  if (type === "Rise") return allowEquals ? "CALLE" : "CALL";
  if (type === "Fall") return allowEquals ? "PUTE" : "PUT";
  if (type === "Higher") return "CALL";
  if (type === "Lower") return "PUT";
  return CONTRACT_TYPE_MAP[type];
}

function sleep(ms: number) {
  return new Promise((r) => setTimeout(r, ms));
}

function formatTime(ms: number) {
  return new Date(ms).toLocaleString();
}
function parseMSpiderDuration(value: string): { duration: number; duration_unit: "t" | "s" | "m" | "h" } {
  if (/^\d+$/.test(value)) {
    return { duration: Number(value), duration_unit: "t" };
  }
  if (/^\d+s$/.test(value)) {
    return { duration: Number.parseInt(value, 10), duration_unit: "s" };
  }
  if (/^\d+m$/.test(value)) {
    return { duration: Number.parseInt(value, 10), duration_unit: "m" };
  }
  if (/^\d+h$/.test(value)) {
    return { duration: Number.parseInt(value, 10), duration_unit: "h" };
  }
  return { duration: 5, duration_unit: "t" };
}
const BARRIER_OPTIMIZER_PAIRS = [
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
] as const satisfies readonly Pair[];

const BARRIER_WINDOW_TICK_COUNT: Record<BarrierOptimizerWindow, number> = {
  3: 3,
  5: 5,
  10: 10,
  15: 15,
};

const getPairLabel = (pair: Pair) => {
  for (const group of Object.values(INDEX_GROUPS)) {
    const found = group.find((item) => item.code === pair);
    if (found) return found.label;
  }
  return pair;
};

function formatOptimizerBarrier(value: number) {
  return `${value >= 0 ? "+" : ""}${value.toFixed(2)}`;
}

function clampPercent(value: number) {
  return Math.max(0, Math.min(100, value));
}

function buildBarrierOptimizerRows(params: {
  pairQuotesRef: React.MutableRefObject<Record<Pair, number[]>>;
  windowTicks: BarrierOptimizerWindow;
}): BarrierOptimizerRow[] {
  const { pairQuotesRef, windowTicks } = params;
  const lookahead = BARRIER_WINDOW_TICK_COUNT[windowTicks];

  const rows = BARRIER_OPTIMIZER_PAIRS.map((pair) => {
    const quotes = pairQuotesRef.current[pair] ?? [];
    if (quotes.length <= lookahead + 2) {
      return null;
    }

    let higherWins = 0;
    let lowerWins = 0;
    let totalUp = 0;
    let totalDown = 0;
    let moveSamples = 0;

    for (let i = 0; i < quotes.length - lookahead; i++) {
      const entry = quotes[i];
      const futureSlice = quotes.slice(i + 1, i + 1 + lookahead);
      if (!futureSlice.length) continue;

      const maxFuture = Math.max(...futureSlice);
      const minFuture = Math.min(...futureSlice);

      const upMove = maxFuture - entry;
      const downMove = entry - minFuture;

      if (upMove > 0) totalUp += upMove;
      if (downMove > 0) totalDown += downMove;

      if (upMove > downMove) higherWins++;
      if (downMove > upMove) lowerWins++;
      if (upMove > 0 || downMove > 0) moveSamples++;
    }

    if (!moveSamples) return null;

    const higherWinPct = clampPercent((higherWins / moveSamples) * 100);
    const lowerWinPct = clampPercent((lowerWins / moveSamples) * 100);
    const avgMoveUp = totalUp / moveSamples;
    const avgMoveDown = totalDown / moveSamples;

    // derive recommended barriers from average movement
// H must always be positive
const higherBarrier = Math.abs(avgMoveUp * 0.25);

// L must always be negative
const lowerBarrier = -Math.abs(avgMoveDown * 0.25);

// difference must reflect real directional edge
const difference = avgMoveUp - avgMoveDown;

const best: "HIGHER" | "LOWER" = difference >= 0 ? "HIGHER" : "LOWER";

    const score = Math.round(
      clampPercent(
        Math.abs(difference) * 12 + Math.max(higherWinPct, lowerWinPct) * 0.9
      )
    );

    return {
      pair,
      label: getPairLabel(pair),
      ticks: quotes.length,
      higherWinPct,
      lowerWinPct,
      avgMoveUp,
      avgMoveDown,
      higherBarrier,
      lowerBarrier,
      difference,
      best,
      score,
    };
  }).filter(Boolean) as BarrierOptimizerRow[];

  return rows
    .sort((a, b) => Math.abs(b.difference) - Math.abs(a.difference))
    .slice(0, 4); // only top 4
}
function MarketIndicator({
  activeStrategy,
  selectedPair,
  pairDigitsRef,
}: {
  activeStrategy: "matches" | "overunder" | "risefall" | "mspider" | null;
  selectedPair: Pair;
  pairDigitsRef: React.MutableRefObject<Record<Pair, number[]>>;
}) {
  const [now, setNow] = useState(() => new Date());
  // ✅ Risk memory (per index) — prevents flip-flopping
const riskEmaRef = useRef<Record<string, number>>({});
const riskHistRef = useRef<Record<string, number[]>>({});

  useEffect(() => {
    const t = window.setInterval(() => setNow(new Date()), 1000);
    return () => window.clearInterval(t);
  }, []);

  // ===================== TIME (UTC) =====================
  const utcH = now.getUTCHours();
  const utcM = now.getUTCMinutes();
  const utcTotalMin = utcH * 60 + utcM;

  const localDay = now.getDay(); // 0 Sun ... 6 Sat
  const isWeekend = localDay === 0 || localDay === 6;

  // ===================== INDEX TYPE =====================
  const is1HZ = selectedPair.startsWith("1HZ");
  const isJump = selectedPair.startsWith("JD") || selectedPair === "RDBEAR" || selectedPair === "RDBULL";

  // ===================== SESSIONS (UTC) =====================
  const inAsia = utcTotalMin >= 0 * 60 && utcTotalMin < 9 * 60;
  const inLondon = utcTotalMin >= 8 * 60 && utcTotalMin < 17 * 60;
  const inNY = utcTotalMin >= 13 * 60 && utcTotalMin < 22 * 60;

  const overlapAL = inAsia && inLondon;   // 08:00 - 09:00
  const overlapLN = inLondon && inNY;     // 13:00 - 17:00
  const overlap = overlapAL || overlapLN;

  const zone = overlap
    ? "Overlap (higher movement)"
    : inNY
    ? "New York"
    : inLondon
    ? "London"
    : inAsia
    ? "Asia (Tokyo)"
    : "Off-hours";

  // ===================== TRANSITION WINDOWS =====================
  const TRANSITION_MIN = 30;
  const OVERLAP_TRANSITION_MIN = 15;

  const boundaries = [0 * 60, 8 * 60, 9 * 60, 13 * 60, 17 * 60, 22 * 60];

  const distToBoundary = (t: number, b: number) => {
    const d = Math.abs(t - b);
    return Math.min(d, 24 * 60 - d);
  };

  const nearestBoundary = boundaries
    .map((b) => ({ b, d: distToBoundary(utcTotalMin, b) }))
    .sort((a, b) => a.d - b.d)[0];

  const isOverlapBoundary =
    nearestBoundary.b === 8 * 60 ||
    nearestBoundary.b === 9 * 60 ||
    nearestBoundary.b === 13 * 60 ||
    nearestBoundary.b === 17 * 60;

  const inTransition =
    (isOverlapBoundary && nearestBoundary.d <= OVERLAP_TRANSITION_MIN) ||
    (!isOverlapBoundary && nearestBoundary.d <= TRANSITION_MIN);

  const transitionLabel = inTransition
    ? `Transition (${nearestBoundary.d}m from ${String(Math.floor(nearestBoundary.b / 60)).padStart(2, "0")}:${String(
        nearestBoundary.b % 60
      ).padStart(2, "0")} UTC)`
    : "Stable";

  // ===================== LIVE MARKET BEHAVIOR (NEW) =====================
  const ticksAll = pairDigitsRef.current[selectedPair] ?? [];
  const last200 = ticksAll.slice(-200);
  const last50 = ticksAll.slice(-50);
  const last20 = ticksAll.slice(-20);
  const last10 = ticksAll.slice(-10);
  const last5 = ticksAll.slice(-5);

  const ready20 = last20.length >= 20;
  const ready50 = last50.length >= 50;
  const ready200 = last200.length >= 200;

  const freq = (arr: number[]) => {
    const f = Array.from({ length: 10 }, () => 0);
    for (const d of arr) f[d]++;
    return f;
  };

  const pct = (f: number[], n: number) => f.map((x) => (n ? (x / n) * 100 : 0));

  const f200 = freq(last200);
  const p200 = pct(f200, last200.length);

  const f20 = freq(last20);
  const p20 = pct(f20, last20.length);

  // entropy (0..1): higher => more uniform/random distribution
  const entropy01 = (f: number[], n: number) => {
    if (!n) return 0;
    let h = 0;
    for (let i = 0; i < 10; i++) {
      const pi = f[i] / n;
      if (pi > 0) h += -pi * Math.log(pi);
    }
    const max = Math.log(10);
    return max ? h / max : 0;
  };

  // ✅ Chi-square vs uniform distribution (expected = n/10)
// LOWER = digits look very uniform (more random-like)
// HIGHER = digits NOT uniform
const chiSquareUniform = (f: number[], n: number) => {
  if (!n) return 0;
  const expected = n / 10;
  let chi = 0;
  for (let i = 0; i < 10; i++) {
    const diff = f[i] - expected;
    chi += (diff * diff) / expected;
  }
  return chi;
};

  const H200 = entropy01(f200, last200.length);
  const chi200 = ready200 ? chiSquareUniform(f200, last200.length) : 0;

  // churn + streaks (behavior risk)
  const repeatRate = (arr: number[]) => {
    if (arr.length < 2) return 0;
    let same = 0;
    for (let i = 1; i < arr.length; i++) if (arr[i] === arr[i - 1]) same++;
    return (same / (arr.length - 1)) * 100;
  };

  const maxStreak = (arr: number[]) => {
    let best = 1;
    let cur = 1;
    for (let i = 1; i < arr.length; i++) {
      if (arr[i] === arr[i - 1]) {
        cur++;
        if (cur > best) best = cur;
      } else {
        cur = 1;
      }
    }
    return best;
  };

  const rep50 = repeatRate(last50);
  const streak50 = maxStreak(last50);

  // quick “shock” detector: last10 distribution suddenly concentrated
  const shock = (() => {
    if (last10.length < 10) return false;
    const f10 = freq(last10);
    const max10 = Math.max(...f10);
    return max10 >= 4; // 40%+ of last 10 on one digit
  })();

  // ===================== STRATEGY EDGE SCORE (NEW) =====================
  const stratName =
  activeStrategy === "matches"
    ? "MetroX"
    : activeStrategy === "overunder"
    ? "SpiderX"
    : activeStrategy === "risefall"
    ? "Rise/Fall"
    : activeStrategy === "mspider"
    ? "M-Spider"
    : "No strategy selected";

  // MetroX (DIFFERS edge): we want a *least frequent digit*, low pct, and NOT seen in last5
  const metroEdge = (() => {
    if (!ready20) return null;

    let lowDigit = 0;
    let lowPct20 = Infinity;
    for (let d = 0; d <= 9; d++) {
      if (p20[d] < lowPct20) {
        lowPct20 = p20[d];
        lowDigit = d;
      }
    }

    const lowPct200 = ready200 ? p200[lowDigit] : null;
    const blocked = last5.includes(lowDigit);

    // simple tiering
    const score =
      lowPct20 <= 2.0 && !blocked ? 3 :
      lowPct20 <= 3.0 && !blocked ? 2 :
      lowPct20 <= 4.0 && !blocked ? 1 :
      0;

    return { lowDigit, lowPct20, lowPct200, blocked, score };
  })();

  // SpiderX edge: pick best of common Over/Under barriers using last20
  const spiderEdge = (() => {
    if (!ready20) return null;

    const pctHits = (cond: (d: number) => boolean) => {
      let hits = 0;
      for (const d of last20) if (cond(d)) hits++;
      return (hits / 20) * 100;
    };

    const candidates = [
      { label: "OVER 0", type: "Over" as const, barrier: 0, pct: pctHits((d) => d > 0) },
      { label: "OVER 1", type: "Over" as const, barrier: 1, pct: pctHits((d) => d > 1) },
      { label: "UNDER 9", type: "Under" as const, barrier: 9, pct: pctHits((d) => d < 9) },
      { label: "UNDER 8", type: "Under" as const, barrier: 8, pct: pctHits((d) => d < 8) },
    ].sort((a, b) => b.pct - a.pct);

    const best = candidates[0];
    const score = best.pct >= 95 ? 3 : best.pct >= 92 ? 2 : best.pct >= 90 ? 1 : 0;

    return { best, score };
  })();

  // ===================== RISK SCORE (UPDATED) =====================
  let riskScore = 0;
  const riskReasons: string[] = [];

  // timing risk
  if (zone === "Off-hours") {
    riskScore += 2;
    riskReasons.push("Off-hours (randomness / fatigue risk)");
  } else if (overlap) {
    riskScore += 1;
    riskReasons.push("Overlap = faster movement (discipline needed)");
  }

  if (inTransition) {
    riskScore += 2;
    riskReasons.push("Transition window (momentum shifts)");
  }

  if (isWeekend) {
    riskScore += 1;
    riskReasons.push("Weekend discipline risk");
  }

  // instrument risk
  if (is1HZ) {
    riskScore += 2;
    riskReasons.push("1HZ speed risk (execution errors)");
  }
  if (isJump) {
    riskScore += 2;
    riskReasons.push("Jump/Bull/Bear spike risk");
  }

 // ✅ LIVE behavior risk (UPGRADED)
if (!ready20) {
  riskScore += 2;
  riskReasons.push("Not enough ticks yet (need 20+)");
} else {
  // --- Randomness detection (stronger than entropy alone) ---
  // If chi-square is LOW, digits look very uniform → random-like → risky for edge strategies
  if (ready200) {
    if (chi200 <= 6.0) {
      riskScore += 3;
      riskReasons.push("Very uniform digits (random-like) [chi² low]");
    } else if (chi200 <= 10.0) {
      riskScore += 2;
      riskReasons.push("Uniform-ish digits (random-like) [chi² moderate]");
    }

    // Keep entropy too, but lower weight now
    if (H200 >= 0.975) {
      riskScore += 1;
      riskReasons.push("High entropy (random-like)");
    }
  }

  // --- Choppy / spike behavior ---
  if (ready50 && rep50 >= 18) {
    riskScore += 1;
    riskReasons.push("Higher repeat rate (choppy tape)");
  }
  if (ready50 && streak50 >= 4) {
    riskScore += 2;
    riskReasons.push("Streaky bursts detected");
  }
  if (shock) {
    riskScore += 2;
    riskReasons.push("Short-term concentration (shock in last 10)");
  }
}

  // strategy edge reduces risk (because you have “reason” to trade)
  if (activeStrategy === "matches" && metroEdge) {
    if (metroEdge.score >= 2) {
      riskScore -= 2;
      riskReasons.push("Metro edge strong (least digit is low & not recent)");
    } else if (metroEdge.score === 1) {
      riskScore -= 1;
      riskReasons.push("Metro edge moderate");
    } else {
      riskScore += 1;
      riskReasons.push("Metro edge weak (avoid forcing trades)");
    }
    if (metroEdge.blocked) {
      riskScore += 1;
      riskReasons.push("Target digit appeared in last 5 ticks");
    }
  }

  if (activeStrategy === "overunder" && spiderEdge) {
    if (spiderEdge.score >= 2) {
      riskScore -= 2;
      riskReasons.push("Spider edge strong (best Over/Under % is high)");
    } else if (spiderEdge.score === 1) {
      riskScore -= 1;
      riskReasons.push("Spider edge moderate");
    } else {
      riskScore += 2;
      riskReasons.push("Spider edge weak (avoid trading)");
    }
  }

  if (!activeStrategy) {
    riskScore += 2;
    riskReasons.push("No strategy selected");
  }

  // clamp 0..10
  riskScore = Math.max(0, Math.min(10, riskScore));
  // ✅ Smooth risk (EMA) + confirm sustained HIGH risk
const key = selectedPair;

// EMA smoothing (stable display)
const prevEma = riskEmaRef.current[key] ?? riskScore;
const alpha = 0.25; // 0.25 = good balance
const ema = prevEma + alpha * (riskScore - prevEma);
riskEmaRef.current[key] = ema;

const riskScoreDisplayed = Math.round(ema * 10) / 10;

// Track last ~12 seconds of raw risk for confirmation
const hist = riskHistRef.current[key] ?? [];
hist.push(riskScore);
if (hist.length > 12) hist.shift();
riskHistRef.current[key] = hist;

// Only allow HIGH if last ~8 seconds were all >= 7
const sustainedHigh = hist.length >= 8 && hist.slice(-8).every((x) => x >= 7);

// Use smoothed score to set level
let riskLevel =
  riskScoreDisplayed >= 7 ? "HIGH" : riskScoreDisplayed >= 4 ? "MEDIUM" : "LOW";

// ✅ downgrade HIGH spikes until confirmed
if (riskLevel === "HIGH" && !sustainedHigh) {
  riskLevel = "MEDIUM";
  riskReasons.push("High-risk spike detected, waiting for confirmation…");
}

  const riskColor =
  riskLevel === "HIGH"
    ? "text-red-300"
    : riskLevel === "MEDIUM"
    ? "text-yellow-200"
    : "text-emerald-300";

  const tradeAdvice =
    riskLevel === "HIGH"
      ? "High risk: avoid auto-trading; only trade if edge is very strong."
      : riskLevel === "MEDIUM"
      ? "Medium risk: smaller size, fewer entries, no rushing."
      : "Low risk: normal routine (still require a real edge).";

  // ===================== BETTER INDEX RECOMMENDATION =====================
  const indexTip = (() => {
    if (!activeStrategy) return "Pick MetroX or SpiderX to get live edge-based recommendations.";

    if (activeStrategy === "matches") {
      const edgeTxt =
        metroEdge && ready20
          ? `Live Metro edge: least digit ${metroEdge.lowDigit} is ${metroEdge.lowPct20.toFixed(1)}% (last20)${
              metroEdge.lowPct200 != null ? ` • ${metroEdge.lowPct200.toFixed(1)}% (last200)` : ""
            }${metroEdge.blocked ? " • ⚠️ appeared in last5" : ""}`
          : "Live Metro edge: collecting 20 ticks…";

      if (riskLevel === "HIGH") return `MetroX: stay on R_25 / R_50. Avoid 1HZ + Jump during HIGH risk.\n${edgeTxt}`;
      if (riskLevel === "MEDIUM") return `MetroX: R_25 / R_50 best. Use 1HZ only if you reduce stake + slow down.\n${edgeTxt}`;
      return `MetroX: R_25 / R_50 stable. 1HZ only if you can control entries.\n${edgeTxt}`;
    }

    // SpiderX
    const edgeTxt =
      spiderEdge && ready20
        ? `Live Spider edge: best is ${spiderEdge.best.label} at ${spiderEdge.best.pct.toFixed(1)}% (last20)`
        : "Live Spider edge: collecting 20 ticks…";

    if (riskLevel === "HIGH") return `SpiderX: prefer R_50 / R_75 only. Avoid Jump + 1HZ in HIGH risk.\n${edgeTxt}`;
    if (riskLevel === "MEDIUM") return `SpiderX: R_50 / R_75. Trade strong signals (≥92–95%).\n${edgeTxt}`;
    return `SpiderX: R_50 / R_75 safest. Expand only if signals stay strong.\n${edgeTxt}`;
  })();

  const conflictWarning =
    riskLevel === "HIGH" && (is1HZ || isJump)
      ? "⚠️ Current index type is HIGH-risk for current conditions. Consider switching to R_25 / R_50."
      : riskLevel === "MEDIUM" && isJump
      ? "⚠️ Jump/Bull/Bear is riskier in medium conditions — only trade strongest edge."
      : "";

  // display a compact “market behavior” line
  const behaviorLine = ready50
    ? `Entropy${ready200 ? `200=${(H200 * 100).toFixed(0)}%` : ""} • Repeat50=${rep50.toFixed(0)}% • MaxStreak50=${streak50}${shock ? " • Shock" : ""}`
    : "Collecting ticks for behavior stats…";

  return (
    <div className="bg-[#13233d]/80 backdrop-blur rounded-2xl p-5 border border-white/10 shadow-[0_0_0_1px_rgba(255,255,255,0.06)]">
      <div className="flex items-start justify-between gap-3">
        <div>
          <p className="font-semibold text-white/85 tracking-tight">🕒 Market / Timing</p>
          <p className="text-xs text-white/60 mt-1">
            Strategy: <span className="text-white/80 font-semibold">{stratName}</span> • Index:{" "}
            <span className="text-white/80 font-semibold">{selectedPair}</span>
          </p>
        </div>

        <span className="px-3 py-1 rounded-full text-xs border border-white/10 bg-black/20 text-white/70">
          UTC {String(utcH).padStart(2, "0")}:{String(utcM).padStart(2, "0")}
        </span>
      </div>

      <div className="mt-3 grid grid-cols-2 gap-3 text-sm">
        <div className="rounded-xl bg-black/20 border border-white/10 p-3">
          <p className="text-[11px] text-white/60">Current Zone</p>
          <p className={`mt-1 font-bold ${overlap ? "text-emerald-300" : "text-sky-300"}`}>{zone}</p>
          <p className="text-[11px] text-white/55 mt-1">{transitionLabel}</p>
          <p className="text-[11px] text-white/55 mt-2">{behaviorLine}</p>
        </div>

        <div className="rounded-xl bg-black/20 border border-white/10 p-3">
          <p className="text-[11px] text-white/60">Risk Level</p>
          <p className={`mt-1 font-extrabold ${riskColor}`}>{riskLevel}</p>
          {riskLevel === "MEDIUM" && !sustainedHigh && (
  <p className="text-[11px] text-white/55 mt-1">Confirming if HIGH risk is sustained…</p>
)}
          <p className="text-[11px] text-white/55 mt-1">{tradeAdvice}</p>
          <p className="text-[11px] text-white/55 mt-2">
  Risk score (smoothed): {riskScoreDisplayed}/10
</p>
        </div>
      </div>

      <div className="mt-3 rounded-xl bg-white/5 border border-white/10 p-3">
        <p className="text-[11px] text-white/60">Index recommendation (live)</p>
        <p className="text-xs text-white/75 mt-1 whitespace-pre-line">{indexTip}</p>

        {conflictWarning && <p className="text-[11px] mt-2 text-yellow-200/90">{conflictWarning}</p>}

        <div className="mt-3">
          <p className="text-[11px] text-white/60 mb-1">Why this risk?</p>
          {riskReasons.length === 0 ? (
            <p className="text-[11px] text-white/55">No major risk flags detected.</p>
          ) : (
            <ul className="text-[11px] text-white/70 space-y-1 list-disc pl-4">
              {riskReasons.slice(0, 6).map((r, i) => (
                <li key={i}>{r}</li>
              ))}
            </ul>
          )}
          <p className="text-[11px] text-white/50 mt-2">
            Note: This measures *conditions + discipline + edge*, not a “prediction.”
          </p>
        </div>
      </div>
    </div>
  );
}

/** ================= ADMIN STRATEGY FLAGS (NEW) =================
 * Stored in localStorage under STRATEGY_FLAGS_KEY.
 * These flags are enforced for USERS only. Admins always see everything.
 */
const STRATEGY_FLAGS_KEY = "strategy_flags";

type StrategyKey = "matches" | "overunder" | "risefall" | "mspider";
type StrategyFlags = Record<StrategyKey, boolean>;

const DEFAULT_FLAGS: StrategyFlags = {
  matches: true,
  overunder: true,
  risefall: true,
  mspider: true,
};
const UI_FLAGS_KEY = "ui_flags";

type UIFlags = {
  metro_place_trade: boolean;
  metro_edshell: boolean;
  metro_metro: boolean; // ✅ NEW
  metro_3x: boolean;
  metro_5x: boolean;
  metro_1x_auto: boolean;
  metro_fast_auto: boolean;
  spider_analyzer: boolean;
  spider_manual_over_under: boolean;
  spider_random_auto: boolean;
};

const DEFAULT_UI_FLAGS: UIFlags = {
  metro_place_trade: true,
  metro_edshell: true,
  metro_metro: true,
  metro_3x: true,
  metro_5x: true,
  metro_1x_auto: true,
  metro_fast_auto: true,
  spider_analyzer: true,
  spider_manual_over_under: true,
  spider_random_auto: true,
};

function readUIFlags(): UIFlags {
  try {
    const raw = localStorage.getItem(UI_FLAGS_KEY);
    if (!raw) return DEFAULT_UI_FLAGS;
    const v = JSON.parse(raw) as Partial<UIFlags>;
    return {
      metro_place_trade: typeof v.metro_place_trade === "boolean" ? v.metro_place_trade : true,
      metro_edshell: typeof v.metro_edshell === "boolean" ? v.metro_edshell : true,
      metro_metro: typeof v.metro_metro === "boolean" ? v.metro_metro : true,
      metro_3x: typeof v.metro_3x === "boolean" ? v.metro_3x : true,
      metro_5x: typeof v.metro_5x === "boolean" ? v.metro_5x : true,
      metro_1x_auto: typeof v.metro_1x_auto === "boolean" ? v.metro_1x_auto : true,
      metro_fast_auto: typeof v.metro_fast_auto === "boolean" ? v.metro_fast_auto : true,
      spider_analyzer: typeof v.spider_analyzer === "boolean" ? v.spider_analyzer : true,
      spider_manual_over_under: typeof v.spider_manual_over_under === "boolean" ? v.spider_manual_over_under : true,
      spider_random_auto: typeof v.spider_random_auto === "boolean" ? v.spider_random_auto : true,
    };
  } catch {
    return DEFAULT_UI_FLAGS;
  }
}
function readStrategyFlags(): StrategyFlags {
  try {
    const raw = localStorage.getItem(STRATEGY_FLAGS_KEY);
    if (!raw) return DEFAULT_FLAGS;
    const parsed = JSON.parse(raw) as Partial<StrategyFlags>;
    return {
  matches: typeof parsed.matches === "boolean" ? parsed.matches : true,
  overunder: typeof parsed.overunder === "boolean" ? parsed.overunder : true,
  risefall: typeof parsed.risefall === "boolean" ? parsed.risefall : true,
  mspider: typeof parsed.mspider === "boolean" ? parsed.mspider : true,
};
  } catch {
    return DEFAULT_FLAGS;
  }
}
const MIN_TRADE_INTERVAL_MS = 400;

export default function Dashboard() {
  const router = useRouter();

  // ✅ auth gate (prevents direct access after logout)
  const [authChecked, setAuthChecked] = useState(false);
  const [isAdmin, setIsAdmin] = useState(false);

  // ✅ which strategies are enabled for USERS (admins ignore these)
  const [strategyFlags, setStrategyFlags] = useState<StrategyFlags>(DEFAULT_FLAGS);

  useEffect(() => {
    const loggedIn = localStorage.getItem("loggedIn") === "true";
    const role = (localStorage.getItem("role") || "").toLowerCase();

    if (!loggedIn) {
      router.replace("/");
      return;
    }

    // ✅ allow admin to stay on dashboard too
const admin = role === "admin";
setIsAdmin(admin);

(async () => {
  // ---- Strategy flags ----
  try {
    const res = await fetch("/api/admin/strategies", { cache: "no-store" });
    const data = await res.json();
    const f = data?.ok && data.flags ? data.flags : DEFAULT_FLAGS;

    localStorage.setItem(STRATEGY_FLAGS_KEY, JSON.stringify(f));
    setStrategyFlags(f);
  } catch {
    setStrategyFlags(DEFAULT_FLAGS);
  }

  // ---- UI flags ----
  try {
    const res = await fetch("/api/admin/ui-flags", { cache: "no-store" });
    const data = await res.json();
    const uf = data?.ok && data.flags ? data.flags : DEFAULT_UI_FLAGS;

    localStorage.setItem(UI_FLAGS_KEY, JSON.stringify(uf));
    setUiFlags(uf);
  } catch {
    setUiFlags(DEFAULT_UI_FLAGS);
  }

  setAuthChecked(true);
})();

  }, [router]);

  // ✅ live-update if admin changes flags in another tab/page
useEffect(() => {
  const onStorage = (e: StorageEvent) => {
    if (e.key === STRATEGY_FLAGS_KEY) {
      setStrategyFlags(readStrategyFlags());
    }
    if (e.key === UI_FLAGS_KEY) {
      setUiFlags(readUIFlags());
    }
  };
  window.addEventListener("storage", onStorage);
  return () => window.removeEventListener("storage", onStorage);
}, []);

  const wsRef = useRef<WebSocket | null>(null);
  const authorizedRef = useRef(false);
  const activeStrategyRef = useRef<"matches" | "overunder" | "risefall" | "mspider" | null>(null);
  const selectedPairRef = useRef<Pair>(PAIRS[0]);
  const lastEdshellAtRef = useRef(0);
  const [uiFlags, setUiFlags] = useState<UIFlags>(DEFAULT_UI_FLAGS);
  const [barrierOptimizerOpen, setBarrierOptimizerOpen] = useState(false);
const [barrierOptimizerLive, setBarrierOptimizerLive] = useState(false);
const [barrierOptimizerWindow, setBarrierOptimizerWindow] = useState<BarrierOptimizerWindow>(5);

  // ✅ force-remount MetroX panel (resets its local analysis state)
  const [metroXResetKey, setMetroXResetKey] = useState(0);

  // per-pair rolling digits cache
  const pairDigitsRef = useRef<Record<Pair, number[]>>(
  Object.fromEntries(PAIRS.map((p) => [p, []])) as unknown as Record<Pair, number[]>
);
// per-pair rolling quote cache (used for Rise/Fall trend detection)
const pairQuotesRef = useRef<Record<Pair, number[]>>(
  Object.fromEntries(PAIRS.map((p) => [p, []])) as unknown as Record<Pair, number[]>
);

  // buy ack waiters (req_id -> promise resolver)
  const buyAckWaitersRef = useRef<
    Record<number, { resolve: () => void; reject: (msg: string) => void }>
  >({});

  const proposalPreviewWaitersRef = useRef<
  Record<number, { resolve: (proposal: any) => void; reject: (msg: string) => void }>
>({});

  // contract_id -> req_id
  const contractToReqRef = useRef<Record<number, number>>({});

  // req_id -> info
  const reqInfoRef = useRef<
  Record<number, { symbol: Pair; digit: number; type: TradeType; stake: number; turbo?: boolean }>
>({});

  // ✅ flash digit result (win/loss) for 2 seconds
  const flashTimerRef = useRef<number | null>(null);
  const [lastWinDigit, setLastWinDigit] = useState<number | null>(null);
  const [lastLossDigit, setLastLossDigit] = useState<number | null>(null);

  // 5x autotrade cancellation + time limit
  const auto5xCancelRef = useRef(false);
  // ✅ prevent 1x Auto from trading the same pair back-to-back
const lastAuto1xPairRef = useRef<Pair | null>(null);

  const [token, setToken] = useState("");
  const [connected, setConnected] = useState(false);

  const [balance, setBalance] = useState<number | null>(null);
  const [currency, setCurrency] = useState("USD");

  const [pipSize, setPipSize] = useState<number>(2);

  const [ticks, setTicks] = useState<number[]>([]);

  const [activeStrategy, setActiveStrategy] = useState<"matches" | "overunder" | "risefall" | "mspider" | null>(null);
useEffect(() => {
  activeStrategyRef.current = activeStrategy;
}, [activeStrategy]);
  const [selectedPair, setSelectedPair] = useState<Pair>(PAIRS[0]);
  useEffect(() => {
  selectedPairRef.current = selectedPair;
}, [selectedPair]);
// ================= METRO AUTO (NEW) =================
const [metroRunning, setMetroRunning] = useState(false);
const metroCancelRef = useRef(false);
const metroLoopRef = useRef(false);

// prevent repeating same pair too fast
const metroLastTradeAtRef = useRef<Record<string, number>>({});
// 🛑 stop Fast AutoTrading when switching index
useEffect(() => {
  if (fastAutoRunning) {
    fastAutoCancelRef.current = true;
    setFastAutoRunning(false);
    setAnalysisStatus("Fast AutoTrading stopped (index changed).");
  }
  // eslint-disable-next-line react-hooks/exhaustive-deps
}, [selectedPair]);
  const [stake, setStake] = useState<number>(1);
  const [selectedDigit, setSelectedDigit] = useState<number | null>(null);
  // ✅ keep latest selected digit for Fast Auto loop
const selectedDigitRef = useRef<number | null>(null);

useEffect(() => {
  selectedDigitRef.current = selectedDigit;
}, [selectedDigit]);

  // MetroX controls
  const [mdTradeType, setMdTradeType] = useState<"Differs" | "Matches">("Differs");
  const [mdTickDuration, setMdTickDuration] = useState<number>(1);
  const [rfTickDuration, setRfTickDuration] = useState<number>(5);
  const [rfAllowEquals, setRfAllowEquals] = useState(false);

  const [tradeHistory, setTradeHistory] = useState<Trade[]>([]);

  const [instant3xRunning, setInstant3xRunning] = useState(false);
  const [turboMode, setTurboMode] = useState(false);

  const [auto5xRunning, setAuto5xRunning] = useState(false);
  const [auto1xRunning, setAuto1xRunning] = useState(false);
  const [analysisStatus, setAnalysisStatus] = useState<string>("");
  // ✅ Fast AutoTrading (NEW)
const [fastAutoRunning, setFastAutoRunning] = useState(false);
const fastAutoCancelRef = useRef(false);
const fastAutoLoopRunningRef = useRef(false);
// ================= SpiderX Random Auto =================
const [spiderRandomRunning, setSpiderRandomRunning] = useState(false);
const spiderRandomCancelRef = useRef(false);
const spiderRandomLoopRef = useRef(false);

  // collapsible analysis box
  const [analysisOpen, setAnalysisOpen] = useState(false);
  const barrierOptimizerRows = useMemo(() => {
  if (!barrierOptimizerLive) return [];
  return buildBarrierOptimizerRows({
    pairQuotesRef,
    windowTicks: barrierOptimizerWindow,
  });
}, [barrierOptimizerLive, barrierOptimizerWindow, ticks]);

  // per-pair meta (for display + decision)
  const emptyMeta = Object.fromEntries(
  PAIRS.map((p) => [p, { count: 0 }])
) as unknown as Record<Pair, { count: number; lowDigit?: number; lowPct?: number }>;
const [pairMeta, setPairMeta] = useState(emptyMeta);

  // ✅ left-side Profit/Loss box (same metric as MetroX trade history)
  const sessionNetProfit = useMemo(() => {
  return tradeHistory.reduce((acc, t) => acc + Number(t.profit ?? 0), 0);
}, [tradeHistory]);

  // ✅ cleanup socket when leaving dashboard
  useEffect(() => {
    return () => {
      try {
        wsRef.current?.close();
      } catch {}
    };
  }, []);

  const safeSend = (payload: unknown) => {
    const ws = wsRef.current;
    if (!ws || ws.readyState !== WebSocket.OPEN) return false;
    ws.send(JSON.stringify(payload));
    return true;
  };

  const newReqId = () => Date.now() + Math.floor(Math.random() * 1000);
  // ================= BUY QUEUE (prevents stuck Pending in Turbo) =================
const buyQueueRef = useRef<Array<{ req_id: number; proposalId: string; price: number }>>([]);
const buyWorkerRunningRef = useRef(false);

const enqueueBuy = (req_id: number, proposalId: string, price: number) => {
  buyQueueRef.current.push({ req_id, proposalId, price });
  void runBuyWorker();
};

const runBuyWorker = async () => {
  if (buyWorkerRunningRef.current) return;
  buyWorkerRunningRef.current = true;

  try {
    while (buyQueueRef.current.length) {
      const item = buyQueueRef.current.shift();
      if (!item) break;

      const { req_id, proposalId, price } = item;

      // Create a waiter for THIS buy (works for turbo too)
      const ack = new Promise<void>((resolve, reject) => {
        buyAckWaitersRef.current[req_id] = {
          resolve,
          reject: (msg: string) => reject(new Error(msg)),
        };
      });

      safeSend({ buy: proposalId, price, req_id });

      // Wait for buy ack or timeout
      try {
        await Promise.race([
          ack,
          new Promise<void>((_, reject) => setTimeout(() => reject(new Error("Buy ack timeout")), 8000)),
        ]);
      } catch {
        // Mark as failed so it doesn't stay Pending forever
        const fail = (arr: Trade[]): Trade[] =>
  arr.map((t) =>
    t.id === req_id && t.result === "Pending"
      ? {
          ...t,
          result: "Loss" as TradeResult, // ✅ force correct union type
          profit: 0,
          payout: 0,
        }
      : t
  );
        setTradeHistory((prev) => fail(prev));
      }

      // Small gap between BUYs (Turbo-safe). If you still see issues, increase to 250.
      await sleep(400);
    }
  } finally {
    buyWorkerRunningRef.current = false;
  }
};

useEffect(() => {
  if (activeStrategy !== "mspider") return;
  if (!barrierOptimizerLive) return;

  BARRIER_OPTIMIZER_PAIRS.forEach((pair) => {
    safeSend({ ticks: pair, subscribe: 1 });
  });
}, [activeStrategy, barrierOptimizerLive]);
  // ✅ robust last digit (handles 0 correctly)
  const getLastDigit = (quote: number, pip: number) => {
    const fixed = quote.toFixed(pip);
    const compact = fixed.replace(".", "");
    const ch = compact[compact.length - 1];
    const d = Number(ch);
    return Number.isFinite(d) ? d : 0;
  };

  const digitPercentFromList = (list: number[], d: number) => {
    if (!list.length) return 0;
    const c = list.filter((x) => x === d).length;
    return (c / list.length) * 100;
  };

  const lowestDigitFromList = (list: number[]) => {
    let bestDigit = 0;
    let bestPct = Infinity;
    for (let d = 0; d <= 9; d++) {
      const pct = digitPercentFromList(list, d);
      if (pct < bestPct) {
        bestPct = pct;
        bestDigit = d;
      }
    }
    return { digit: bestDigit, percent: bestPct };
  };

  const subscribeAllPairs = (pairs: readonly Pair[]) => {
  pairs.forEach((sym) => {
    safeSend({ ticks: sym, subscribe: 1 });
  });
};
const resetPairNow = (p: Pair) => {
  // 🔄 wipe ALL pair caches
  pairDigitsRef.current = Object.fromEntries(
    PAIRS.map((x) => [x, []])
  ) as unknown as Record<Pair, number[]>;
  pairQuotesRef.current = Object.fromEntries(
  PAIRS.map((x) => [x, []])
) as unknown as Record<Pair, number[]>;

  // wipe UI
  setTicks([]);
  setSelectedDigit(null);
  setLastWinDigit(null);
  setLastLossDigit(null);

  // reset analysis UI
  setAnalysisOpen(false);
  setAnalysisStatus("");

  // 🔄 reset ALL per-pair meta
  setPairMeta(
    Object.fromEntries(PAIRS.map((x) => [x, { count: 0 }])) as unknown as Record<
      Pair,
      { count: number; lowDigit?: number; lowPct?: number }
    >
  );
};

  const getLast20FromCache = (sym: Pair) => {
    const arr = pairDigitsRef.current[sym] ?? [];
    return arr.slice(-20);
  };

  // Wait until a pair has >=20 cached ticks (bounded by timeoutMs)
  const waitForCache20 = async (sym: Pair, timeoutMs: number) => {
    const start = Date.now();
    while (Date.now() - start < timeoutMs) {
      if (auto5xCancelRef.current) return false;
      const count = (pairDigitsRef.current[sym] ?? []).length;
      if (count >= 20) return true;
      await sleep(120);
    }
    return false;
  };

  const flashResultDigit = (kind: "win" | "loss", digit: number) => {
    if (kind === "win") {
      setLastWinDigit(digit);
      setLastLossDigit(null);
    } else {
      setLastLossDigit(digit);
      setLastWinDigit(null);
    }
    if (flashTimerRef.current) window.clearTimeout(flashTimerRef.current);
    flashTimerRef.current = window.setTimeout(() => {
      setLastWinDigit(null);
      setLastLossDigit(null);
    }, 2000);
  };

  /* ================= DERIV CONNECTION ================= */

  const connectDeriv = () => {
    if (!token) return alert("Please enter your Deriv API token");
    localStorage.setItem("deriv_token", token);

    try {
      wsRef.current?.close();
    } catch {}
    wsRef.current = null;

    authorizedRef.current = false;
    buyAckWaitersRef.current = {};
proposalPreviewWaitersRef.current = {};
contractToReqRef.current = {};
reqInfoRef.current = {};

   pairDigitsRef.current = Object.fromEntries(PAIRS.map((p) => [p, []])) as unknown as Record<Pair, number[]>;
   pairQuotesRef.current = Object.fromEntries(PAIRS.map((p) => [p, []])) as unknown as Record<Pair, number[]>;
    setPairMeta(
  Object.fromEntries(PAIRS.map((p) => [p, { count: 0 }])) as unknown as Record<
    Pair,
    { count: number; lowDigit?: number; lowPct?: number }
  >
);

    setTicks([]);
    setSelectedDigit(null);
    setLastWinDigit(null);
    setLastLossDigit(null);

    const ws = new WebSocket(`wss://ws.derivws.com/websockets/v3?app_id=${APP_ID}`);
    wsRef.current = ws;

    ws.onopen = () => {
      safeSend({ authorize: token });
    };

    ws.onmessage = (e) => {
      const data = JSON.parse(e.data);

      // ignore harmless already subscribed message
      if (data?.error?.message) {
  const msg: string = data.error.message;
  const req_id: number | undefined = data.req_id;
  const echo = data.echo_req ?? {};
  const tickSymbol = typeof echo.ticks === "string" ? echo.ticks : null;
  const isStepOnlySymbol = !!tickSymbol && STEP_ONLY_PAIRS.includes(tickSymbol as Pair);
  const isInvalidSymbolError = /symbol .* invalid/i.test(msg);
  const isAlreadySubscribedError = /already subscribed/i.test(msg);

  // If a waiter exists, always reject it (turbo or not)
  if (req_id && buyAckWaitersRef.current[req_id]) {
    buyAckWaitersRef.current[req_id].reject(msg);
    delete buyAckWaitersRef.current[req_id];
  }

  // Turbo: do NOT alert (but we did reject waiters so queue doesn't hang)
  if (req_id && reqInfoRef.current[req_id]?.turbo) return;

  // Ignore popup alerts for invalid Step-index subscriptions
if (isInvalidSymbolError && isStepOnlySymbol) return;

// Ignore harmless duplicate tick subscriptions (R_10 already subscribed)
if (isAlreadySubscribedError && tickSymbol) return;

alert(msg);
return;
}

      if (data.msg_type === "authorize") {
        authorizedRef.current = true;
        setConnected(true);

        safeSend({ balance: 1, subscribe: 1 });
        subscribeAllPairs(METRO_SPIDER_PAIRS);
      }

      if (data.msg_type === "balance") {
        setBalance(Number(data.balance.balance));
        setCurrency(data.balance.currency);
      }

      if (data.msg_type === "tick" && data.tick?.quote !== undefined) {
  const symbol = data.tick.symbol as Pair;
  if (!PAIRS.includes(symbol)) return;

 // ✅ allow ticks if ANY strategy is open OR Metro auto is running
if (
  activeStrategyRef.current !== "matches" &&
  activeStrategyRef.current !== "overunder" &&
  activeStrategyRef.current !== "risefall" &&
  activeStrategyRef.current !== "mspider" &&
  !metroLoopRef.current
) return;

  const ps = typeof data.tick.pip_size === "number" ? data.tick.pip_size : pipSize;
  if (typeof data.tick.pip_size === "number") setPipSize(ps);

  const quote = Number(data.tick.quote);
const digit = getLastDigit(quote, ps);

const prev = pairDigitsRef.current[symbol] ?? [];
const next = [...prev, digit];
pairDigitsRef.current[symbol] = next;

// store quotes for Rise/Fall trend detection
const prevQuotes = pairQuotesRef.current[symbol] ?? [];
const nextQuotes = [...prevQuotes, quote].slice(-400);
pairQuotesRef.current[symbol] = nextQuotes;
  const last20 = next.slice(-20);
  if (last20.length >= 20) {
    const low = lowestDigitFromList(last20);
    setPairMeta((m) => ({
      ...m,
      [symbol]: { count: next.length, lowDigit: low.digit, lowPct: low.percent },
    }));
  } else {
    setPairMeta((m) => ({ ...m, [symbol]: { ...m[symbol], count: next.length } }));
  }

  if (symbol === selectedPairRef.current) setTicks(next);
}

     // proposal preview or proposal -> buy
if (data.msg_type === "proposal") {
  const req_id: number | undefined = data.req_id;
  const proposalId: string | undefined = data.proposal?.id;
  if (!req_id || !proposalId) return;

  if (proposalPreviewWaitersRef.current[req_id]) {
    proposalPreviewWaitersRef.current[req_id].resolve(data.proposal);
    delete proposalPreviewWaitersRef.current[req_id];
    return;
  }

  const info = reqInfoRef.current[req_id];
  const stakeForReq = info?.stake ?? stake;

  if (info?.turbo) {
    enqueueBuy(req_id, proposalId, stakeForReq);
  } else {
    safeSend({ buy: proposalId, price: stakeForReq, req_id });
  }

  return;
}

      // buy ack
      if (data.msg_type === "buy") {
        const req_id: number | undefined = data.req_id;
        const contract_id: number | undefined = data.buy?.contract_id;
        if (!req_id || !contract_id) return;

        contractToReqRef.current[contract_id] = req_id;

        const apply = (arr: Trade[]) => arr.map((t) => (t.id === req_id ? { ...t, contract_id } : t));
        setTradeHistory((prev) => apply(prev));

        if (buyAckWaitersRef.current[req_id]) {
          buyAckWaitersRef.current[req_id].resolve();
          delete buyAckWaitersRef.current[req_id];
        }

        safeSend({ proposal_open_contract: 1, contract_id, subscribe: 1 });
      }

      // contract settlement
      if (data.msg_type === "proposal_open_contract") {
        const poc = data.proposal_open_contract;
        if (!poc?.contract_id) return;

        const contract_id: number = poc.contract_id;
        const req_id = contractToReqRef.current[contract_id];
        if (!req_id) return;

        const finished = poc.is_sold || poc.status === "sold" || poc.is_expired || poc.status === "expired";
        if (!finished) return;

        const profit = Number(poc.profit ?? 0);
        const payout = Number(poc.payout ?? 0);
        const result: TradeResult = profit > 0 ? "Win" : "Loss";

        // ✅ digit that contract actually settled on (exit digit)
        let settlementDigit: number | undefined;
        if (typeof poc.exit_tick === "number") {
          settlementDigit = getLastDigit(poc.exit_tick, pipSize);
        } else if (typeof poc.exit_spot === "number") {
          settlementDigit = getLastDigit(poc.exit_spot, pipSize);
        }

        const update = (arr: Trade[]) =>
          arr.map((t) => (t.id === req_id ? { ...t, result, profit, payout, settlementDigit } : t));

        setTradeHistory((prev) => update(prev));

        // ✅ flash green 💰 on WIN digit OR red ❌ on LOSS digit
        if (typeof settlementDigit === "number") {
          flashResultDigit(result === "Win" ? "win" : "loss", settlementDigit);
        }

        delete contractToReqRef.current[contract_id];
        delete reqInfoRef.current[req_id];
      }
    };

    ws.onclose = () => {
      setConnected(false);
      setBalance(null);
      authorizedRef.current = false;
    };

    ws.onerror = () => alert("Connection failed");
  };

  const disconnect = () => {
  // stop fast auto if running
  fastAutoCancelRef.current = true;
  setFastAutoRunning(false);
  setBarrierOptimizerLive(false);

  wsRef.current?.close();
  wsRef.current = null;
  setConnected(false);
  setBalance(null);
  authorizedRef.current = false;
};

  const logout = () => {
    disconnect();
    setBarrierOptimizerLive(false);
    localStorage.clear();
    router.replace("/");
    localStorage.removeItem("deriv_token");
  };

  /* ================= TRADE PLACEMENT ================= */

  const placeTradeFor = async ({
  symbol,
  digit,
  type,
  durationTicks,
  count = 1,
}: {
  symbol: Pair;
  digit: number;
  type: TradeType;
  durationTicks: number;
  count?: 1 | 3 | 5;
}) => {
  await placeDiffersInstant(symbol, digit, count, {
    durationTicks,
    source: "Edshell",
    batchTotal: count,
    batchStartIndex: 1,
  });
};
const placeHigherLowerTrade = ({
  direction,
  durationValue,
  barrier,
  customStake,
}: {
  direction: "Higher" | "Lower";
  durationValue: string;
  barrier: string;
  customStake?: number;
}) => {

  const tradeStake = customStake ?? stake;

  if (!tradeStake || tradeStake <= 0) return alert("Enter a stake amount");
  if (!barrier || !String(barrier).trim()) return alert("Set a barrier value first");
  if (!wsRef.current || wsRef.current.readyState !== WebSocket.OPEN) {
    return alert("WebSocket not connected yet");
  }
  if (!authorizedRef.current) return alert("Not authorized yet");

  const req_id = newReqId();

  const parsedDuration = parseMSpiderDuration(String(durationValue));

const trade: Trade = {
  id: req_id,
  symbol: selectedPair,
  digit: 0,
  type: direction,
  stake: tradeStake,
  durationTicks: parsedDuration.duration_unit === "t" ? parsedDuration.duration : 0,
  result: "Pending",
  createdAt: Date.now(),
  source: "M-Spider",
};

  setTradeHistory((prev) => [trade, ...prev]);

  reqInfoRef.current[req_id] = {
    symbol: selectedPair,
    digit: 0,
    type: direction,
    stake: tradeStake,
  };

  const { duration, duration_unit } = parseMSpiderDuration(String(durationValue));

safeSend({
  proposal: 1,
  amount: tradeStake,
  basis: "stake",
  contract_type: getContractType(direction, false),
  currency: currency || "USD",
  symbol: selectedPair,
  duration,
  duration_unit,
  barrier: String(barrier),
  req_id,
});
};
const requestHigherLowerPreview = async ({
  direction,
  durationValue,
  barrier,
  customStake,
}: {
  direction: "Higher" | "Lower";
  durationValue: string;
  barrier: string;
  customStake: number;
}) => {
  if (!customStake || customStake <= 0) return { payout: 0, profit: 0 };
  if (!barrier || !String(barrier).trim()) return { payout: 0, profit: 0 };
  if (!wsRef.current || wsRef.current.readyState !== WebSocket.OPEN) return { payout: 0, profit: 0 };
  if (!authorizedRef.current) return { payout: 0, profit: 0 };

  const req_id = newReqId();
  const { duration, duration_unit } = parseMSpiderDuration(durationValue);

  const proposal = await new Promise<any>((resolve, reject) => {
    proposalPreviewWaitersRef.current[req_id] = {
      resolve,
      reject: (msg: string) => reject(new Error(msg)),
    };

    const ok = safeSend({
      proposal: 1,
      amount: customStake,
      basis: "stake",
      contract_type: getContractType(direction, false),
      currency: currency || "USD",
      symbol: selectedPair,
      duration,
      duration_unit,
      barrier: String(barrier),
      req_id,
    });

    if (!ok) {
      delete proposalPreviewWaitersRef.current[req_id];
      reject(new Error("WebSocket not connected"));
      return;
    }

    window.setTimeout(() => {
      if (proposalPreviewWaitersRef.current[req_id]) {
        delete proposalPreviewWaitersRef.current[req_id];
        reject(new Error("Proposal preview timeout"));
      }
    }, 4000);
  });

  const payout = Number(proposal?.payout ?? 0);
  const profit = Number((payout - customStake).toFixed(2));

  return {
    payout: Number.isFinite(payout) ? payout : 0,
    profit: Number.isFinite(profit) ? profit : 0,
  };
};

const placeTrade = (type: TradeType, durationTicks: number) => {
  
  const needsDigit =
    type === "Matches" || type === "Differs" || type === "Over" || type === "Under";

  if (needsDigit && selectedDigit === null) return alert("Select a digit first");
  if (!stake || stake <= 0) return alert("Enter a stake amount");
  if (!wsRef.current || wsRef.current.readyState !== WebSocket.OPEN) return alert("WebSocket not connected yet");
  if (!authorizedRef.current) return alert("Not authorized yet");

  const req_id = newReqId();

  const src: Trade["source"] =
    activeStrategy === "overunder" ? "SpiderX Auto" : activeStrategy === "risefall" ? "Metro" : "MetroX";

  const digitForTrade = needsDigit ? (selectedDigit as number) : 0;

  const trade: Trade = {
    id: req_id,
    symbol: selectedPair,
    digit: digitForTrade,
    type,
    stake,
    durationTicks,
    result: "Pending",
    createdAt: Date.now(),
    source: src,
  };

  setTradeHistory((prev) => [trade, ...prev]);

  reqInfoRef.current[req_id] = { symbol: selectedPair, digit: digitForTrade, type, stake };

  const payload: any = {
    proposal: 1,
    amount: stake,
    basis: "stake",
    contract_type: getContractType(type, rfAllowEquals),
    currency: currency || "USD",
    symbol: selectedPair,
    duration: durationTicks,
    duration_unit: "t",
    req_id,
  };

  if (needsDigit) payload.barrier = String(selectedDigit);

  safeSend(payload);
};
const placeRiseFallDoubleTrade = (durationTicks: number) => {
  if (!stake || stake <= 0) return alert("Enter a stake amount");
  if (!wsRef.current || wsRef.current.readyState !== WebSocket.OPEN) return alert("WebSocket not connected yet");
  if (!authorizedRef.current) return alert("Not authorized yet");

  placeTrade("Rise", durationTicks);
  placeTrade("Fall", durationTicks);
};

  // Place one DIFFERS trade for symbol+digit and wait for buy-ack (safe for fast bursts)
  // ⚡ Instant parallel DIFFERS (no waiting)
// ⚡ Instant parallel DIFFERS (no waiting)
const placeDiffersInstant = async (
  symbol: Pair,
  digit: number,
  count: number,
  opts?: {
    durationTicks?: number;
    source?: Trade["source"];
    batchTotal?: number;
    batchStartIndex?: number; // default 1
  }
) => {
  if (!wsRef.current || wsRef.current.readyState !== WebSocket.OPEN) return;
  if (!authorizedRef.current) return;

  const durationTicks = opts?.durationTicks ?? mdTickDuration;
  const source = opts?.source ?? "MetroX";
  const startIndex = opts?.batchStartIndex ?? 1;

  for (let i = 0; i < count; i++) {
    const req_id = newReqId();

    const trade: Trade = {
      id: req_id,
      symbol,
      digit,
      type: "Differs",
      stake,
      durationTicks,          // ✅ FIX: store the real tick duration
      result: "Pending",
      createdAt: Date.now(),
      source, 
      batchIndex: opts?.batchTotal ? startIndex + i : undefined,
batchTotal: opts?.batchTotal,                // ✅ FIX: label the trade source
    };

    setTradeHistory((prev: Trade[]) => [trade, ...prev]);

    reqInfoRef.current[req_id] = {
      symbol,
      digit,
      type: "Differs",
      stake,
      turbo: true,
    };

    safeSend({
      proposal: 1,
      amount: stake,
      basis: "stake",
      contract_type: CONTRACT_TYPE_MAP["Differs"],
      currency: currency || "USD",
      symbol,
      duration: durationTicks,  // ✅ FIX: duration matches what's stored
      duration_unit: "t",
      barrier: String(digit),
      req_id,
    });

    // ⚡ CRITICAL: yield event loop so Deriv processes each proposal separately
    await new Promise((r) => setTimeout(r, 0));
  }
};
  const placeDiffersAndWaitBuyAck = async (
  symbol: Pair,
  digit: number,
  batch?: { index: number; total: number }
) => {
    if (!wsRef.current || wsRef.current.readyState !== WebSocket.OPEN) throw new Error("WebSocket not connected");
    if (!authorizedRef.current) throw new Error("Not authorized");

    const req_id = newReqId();

    const trade: Trade = {
      id: req_id,
      symbol,
      digit,
      type: "Differs",
      stake,
      durationTicks: 1,
      result: "Pending",
      createdAt: Date.now(),
      batchIndex: batch?.index,
batchTotal: batch?.total,
    };

    setTradeHistory((prev: Trade[]) => [trade, ...prev]);
    reqInfoRef.current[req_id] = { symbol, digit, type: "Differs", stake };

    const p = new Promise<void>((resolve, reject) => {
      buyAckWaitersRef.current[req_id] = {
        resolve,
        reject: (msg: string) => reject(new Error(msg)),
      };
    });

    safeSend({
      proposal: 1,
      amount: stake,
      basis: "stake",
      contract_type: CONTRACT_TYPE_MAP["Differs"],
      currency: currency || "USD",
      symbol,
      duration: mdTickDuration,
      duration_unit: "t",
      barrier: String(digit),
      req_id,
    });

    await Promise.race([
      p,
      new Promise<void>((_, reject) => setTimeout(() => reject(new Error("Timed out waiting for buy ack")), 9000)),
    ]);
  };

  /* ================= 3x Selected Digit ================= */

 const place3xSelectedDigit = async () => {
  if (instant3xRunning) return;
  if (selectedDigit === null) return alert("Select a digit first");
  if (!stake || stake <= 0) return alert("Enter a stake amount");

  setInstant3xRunning(true);

  // 🔁 Old behavior: Turbo only removes delay — does NOT change logic
  const gapMs = turboMode ? 0 : 50;

  try {
    await placeDiffersAndWaitBuyAck(selectedPair, selectedDigit, { index: 1, total: 3 });
if (gapMs) await sleep(gapMs);

await placeDiffersAndWaitBuyAck(selectedPair, selectedDigit, { index: 2, total: 3 });
if (gapMs) await sleep(gapMs);

await placeDiffersAndWaitBuyAck(selectedPair, selectedDigit, { index: 3, total: 3 });
  } catch (err) {
    alert(err instanceof Error ? err.message : "We couldn't process your trade.");
  } finally {
    setInstant3xRunning(false);
  }
};

// ================= METRO AUTO TOGGLE (UPGRADED) =================
// Press Metro -> keeps scanning + trading until Stop Metro
const toggleMetroAuto = async () => {
  // STOP
  if (metroRunning) {
    metroCancelRef.current = true;
    setAnalysisStatus("Stopping Metro...");
    return;
  }

  // START checks
  if (!stake || stake <= 0) return alert("Enter a stake amount");
  if (!wsRef.current || wsRef.current.readyState !== WebSocket.OPEN) return alert("WebSocket not connected");
  if (!authorizedRef.current) return alert("Not authorized");

  metroCancelRef.current = false;
  setMetroRunning(true);

  if (metroLoopRef.current) return;
  metroLoopRef.current = true;

  // ================== TUNABLE RULES ==================
  const SAMPLE_N = 1000;          // main sample window (long)
  const RECENT_N = 120;           // recent window (short)
  const MIN_SAMPLE = 250;

  const MAX_MATCH_PCT = 5.3;      // long-window max
  const MAX_RECENT_PCT = 6.0;     // must ALSO be low recently (prevents stale edge)
  const MAX_LAST10_HITS = 1;      // digit must appear <= 1 time in last10
  const MAX_LAST20_HITS = 3;      // digit must appear <= 3 times in last20

  const COOLDOWN_MS = 30_000;
  const LOOP_DELAY_MS = 800;
  // ✅ MISSING CONSTANTS (fixes the TS errors)
const MAX_BAD_CYCLES = 10;     // how many "no signal" loops before backoff
const MAX_FAIL_TRADES = 5;     // how many failed placements before backoff


  // ================== STATE TRACKERS ==================
  let badCycles = 0;
  let failedTrades = 0;

  // helpers (local)
  const getLastN = (sym: Pair, n: number) => (pairDigitsRef.current[sym] ?? []).slice(-n);

  const freq10 = (list: number[]) => {
    const f = Array.from({ length: 10 }, () => 0);
    for (const x of list) f[x]++;
    return f;
  };

  const pctOfDigit = (list: number[], d: number) => {
    if (!list.length) return 100;
    let c = 0;
    for (const x of list) if (x === d) c++;
    return (c / list.length) * 100;
  };

  const pickLeastFrequentDigit = (list: number[]) => {
    const f = freq10(list);
    const n = list.length;
    let bestDigit = 0;
    let bestPct = Infinity;

    for (let d = 0; d <= 9; d++) {
      const p = n ? (f[d] / n) * 100 : 100;
      if (p < bestPct) {
        bestPct = p;
        bestDigit = d;
      }
    }

    return { digit: bestDigit, matchPct: bestPct, f, n };
  };

  const countHits = (list: number[], d: number) => {
    let c = 0;
    for (const x of list) if (x === d) c++;
    return c;
  };

  const estimatedDiffersWin = (matchPct: number) => Math.max(0, Math.min(100, 100 - matchPct));
  const decideDurationTicks = (pair: Pair) => (pair.startsWith("1HZ") ? 1 : 2);

  // ✅ Keep this — and now we will actually USE it.
  const hardDisconnect = () => {
    try {
      wsRef.current?.close();
    } catch {}
    wsRef.current = null;
    setConnected(false);
    setBalance(null);
    authorizedRef.current = false;
  };

  // basic “can trade” guard
  const ensureLive = () => {
    const ws = wsRef.current;
    return !!ws && ws.readyState === WebSocket.OPEN && authorizedRef.current;
  };

  try {
    setAnalysisStatus(
      "Metro started: scanning all pairs for STRONG + STABLE least-frequent digits..."
    );

    while (!metroCancelRef.current) {
      if (!ensureLive()) break;

      // find best candidate across all pairs
      let best:
        | null
        | {
            pair: Pair;
            digit: number;
            matchPctLong: number;
            matchPctRecent: number;
            last10Hits: number;
            last20Hits: number;
            score: number;
            estWin: number;
          } = null;

      for (const pair of PAIRS) {
        if (metroCancelRef.current) break;

        // cooldown per pair
        const lastAt = metroLastTradeAtRef.current[pair] ?? 0;
        if (Date.now() - lastAt < COOLDOWN_MS) continue;

        const longSample = getLastN(pair, SAMPLE_N);
        if (longSample.length < MIN_SAMPLE) continue;

        const recentSample = getLastN(pair, RECENT_N);
        const last10 = getLastN(pair, 10);
        const last20 = getLastN(pair, 20);

        const pickLong = pickLeastFrequentDigit(longSample);
        const d = pickLong.digit;

        const matchPctLong = pickLong.matchPct;
        const matchPctRecent = pctOfDigit(recentSample, d);

        // HARD filters (accuracy)
        if (matchPctLong > MAX_MATCH_PCT) continue;
        if (matchPctRecent > MAX_RECENT_PCT) continue;

        const last10Hits = countHits(last10, d);
        const last20Hits = countHits(last20, d);

        if (last10Hits > MAX_LAST10_HITS) continue;
        if (last20Hits > MAX_LAST20_HITS) continue;

        // score (bigger = better)
        // prefer: lower long pct, low recent pct, low recent hits
        const score =
          (MAX_MATCH_PCT - matchPctLong) * 2 +
          (MAX_RECENT_PCT - matchPctRecent) * 2 +
          (MAX_LAST20_HITS - last20Hits) * 1.2 +
          (MAX_LAST10_HITS - last10Hits) * 1.5;

        const estWin = estimatedDiffersWin(matchPctLong);

        if (!best || score > best.score) {
          best = {
            pair,
            digit: d,
            matchPctLong,
            matchPctRecent,
            last10Hits,
            last20Hits,
            score,
            estWin,
          };
        }
      }

      if (!best) {
        badCycles++;
        setAnalysisStatus(
          `Metro: no STRONG signals right now. (badCycles ${badCycles}/${MAX_BAD_CYCLES})`
        );

        // ✅ HARD DISCONNECT TRIGGER #1
        // If we keep failing to find any quality signal for too long, disconnect.
        if (badCycles >= MAX_BAD_CYCLES) {
  // ✅ Instead of disconnecting, just back off and keep scanning
  setAnalysisStatus("Metro: no stable edge right now. Skipping trades and waiting...");
  badCycles = 0;                 // reset so it doesn't spam this message forever
  await sleep(4000);             // longer cooldown when conditions are bad
  continue;                      // keep loop alive
}

        await sleep(LOOP_DELAY_MS);
        continue;
      }

      // reset bad cycles if we found a real candidate
      badCycles = 0;

      const durationTicks = decideDurationTicks(best.pair);

      setAnalysisStatus(
        `Metro: ${best.pair} • DIFFERS ${best.digit} • long ${best.matchPctLong.toFixed(
          2
        )}% • recent ${best.matchPctRecent.toFixed(2)}% • last10Hits ${best.last10Hits} • ${durationTicks}t`
      );

      // place trade (DIFFERS only) with source Metro
      try {
        await placeDiffersInstant(best.pair, best.digit, 1, {
          durationTicks,
          source: "Metro",
        });

        metroLastTradeAtRef.current[best.pair] = Date.now();
      } catch {
        failedTrades++;
        setAnalysisStatus(
          `Metro: trade failed (${failedTrades}/${MAX_FAIL_TRADES}).`
        );

        // ✅ HARD DISCONNECT TRIGGER #2
        // If trade placement is repeatedly failing, disconnect.
        if (failedTrades >= MAX_FAIL_TRADES) {
  // ✅ Instead of disconnecting, pause and keep trying later
  setAnalysisStatus("Metro: repeated trade failures. Skipping and retrying later...");
  failedTrades = 0;              // reset after a cool-off
  await sleep(5000);             // backoff to avoid hammering requests
  continue;
}
      }

      await sleep(LOOP_DELAY_MS);
    }
  } finally {
    metroLoopRef.current = false;
    metroCancelRef.current = false;
    setMetroRunning(false);

    // only show "stopped" if not disconnected by safety
    if (wsRef.current) setAnalysisStatus("Metro stopped.");
  }
};

  /* ================= 5x AutoTrading ================= */

  const toggle5xAutoTrading = async () => {
  if (auto5xRunning) {
    auto5xCancelRef.current = true;
    setAnalysisStatus("Stopping...");
    return;
  }

  if (!stake || stake <= 0) return alert("Enter a stake amount");
  if (!wsRef.current || wsRef.current.readyState !== WebSocket.OPEN)
    return alert("WebSocket not connected yet");
  if (!authorizedRef.current) return alert("Not authorized yet");

  auto5xCancelRef.current = false;
  setAuto5xRunning(true);

  const gapMs = turboMode ? 0 : 50;
  const deadline = Date.now() + 5000;

  try {
    setAnalysisStatus("Analyzing all pairs...");

    // Build signals for each pair
    const pairSignals = PAIRS.map((pair) => {
      const digits = pairDigitsRef.current[pair] ?? [];

      if (digits.length < 20) {
        return { pair, lowestPct: Infinity, lowestDigit: null as number | null };
      }

      const last20 = digits.slice(-20);
      const freq = Array.from({ length: 10 }, () => 0);
      for (const d of last20) freq[d]++;

      const percentages = freq.map((f) => (f / 20) * 100);

      let lowestDigit = 0;
      let lowestPct = percentages[0];
      for (let i = 1; i < 10; i++) {
        if (percentages[i] < lowestPct) {
          lowestPct = percentages[i];
          lowestDigit = i;
        }
      }

      return { pair, lowestPct, lowestDigit };
    });

    // Strongest → weakest
    pairSignals.sort((a, b) => a.lowestPct - b.lowestPct);

    const usedPairs = new Set<Pair>();
    let placed = 0;

    const THRESHOLD = 3.0;

    // Place up to 5 trades, max 1 per pair, only if <= 3.0%
    for (const s of pairSignals) {
      if (auto5xCancelRef.current) break;
      if (Date.now() > deadline) break;
      if (placed >= 5) break;

      if (usedPairs.has(s.pair)) continue;
      if (s.lowestDigit === null) continue;
      if (s.lowestPct > THRESHOLD) continue;

      setAnalysisStatus(
        `5x Auto: ${s.pair} • Digit ${s.lowestDigit} • ${s.lowestPct.toFixed(1)}% (${placed + 1}/5)`
      );

      try {
  if (turboMode) {
    // ⚡ MAX TURBO — no waiting
    placeDiffersInstant(s.pair, s.lowestDigit, 1, {
  batchTotal: 5,
  batchStartIndex: placed + 1,
});
  } else {
    await placeDiffersAndWaitBuyAck(s.pair, s.lowestDigit, { index: placed + 1, total: 5 });
    if (gapMs) await sleep(gapMs);
  }

  usedPairs.add(s.pair);
  placed++;
} catch {
  setAnalysisStatus(`Skipped ${s.pair} (trade failed). Continuing...`);
}
}

    if (auto5xCancelRef.current) {
      setAnalysisStatus(`Stopped by user. Trades placed: ${placed}/5`);
    } else if (placed === 0) {
      setAnalysisStatus(`No trades placed (no pairs ≤ ${THRESHOLD.toFixed(1)}%).`);
    } else if (placed < 5) {
      setAnalysisStatus(`Finished (time limit reached). Trades placed: ${placed}/5`);
    } else {
      setAnalysisStatus("5x AutoTrading completed (5/5).");
    }
  } catch (err) {
    setAnalysisStatus(err instanceof Error ? err.message : "AutoTrading error.");
  } finally {
    setAuto5xRunning(false);
    auto5xCancelRef.current = false;
  }
};
/* ================= 1x Auto All Pairs ================= */

const run1xAutoAllPairs = async () => {
  if (auto1xRunning) return;

  if (!stake || stake <= 0) return alert("Enter a stake amount");
  if (!wsRef.current || wsRef.current.readyState !== WebSocket.OPEN)
    return alert("WebSocket not connected");
  if (!authorizedRef.current) return alert("Not authorized");

  setAuto1xRunning(true);
  setAnalysisStatus("Scanning all pairs for <3% opportunities...");

  try {
    const pairSignals = PAIRS.map((pair) => {
      const digits = pairDigitsRef.current[pair] ?? [];

      if (digits.length < 20)
        return { pair, lowestPct: Infinity, lowestDigit: null as number | null };

      const last20 = digits.slice(-20);
      const freq = Array.from({ length: 10 }, () => 0);
      last20.forEach((d) => freq[d]++);
      const percentages = freq.map((n) => (n / 20) * 100);

      let lowestDigit = 0;
      let lowestPct = percentages[0];
      for (let i = 1; i < 10; i++) {
        if (percentages[i] < lowestPct) {
          lowestPct = percentages[i];
          lowestDigit = i;
        }
      }

      return { pair, lowestPct, lowestDigit };
    });

    pairSignals.sort((a, b) => a.lowestPct - b.lowestPct);

    const lastPair = lastAuto1xPairRef.current;

    // pick best that is NOT the same as last time
    const best =
      pairSignals.find((s) => s.pair !== lastPair) ?? pairSignals[0];

    if (best.lowestPct < 3.0 && best.lowestDigit !== null) {
      if (best.pair === lastPair) {
        setAnalysisStatus(
          "No valid pairs < 3.0% (best signal repeats last pair) — no trade placed."
        );
        return;
      }

      setAnalysisStatus(
        `1x Auto: ${best.pair} • Digit ${best.lowestDigit} • ${best.lowestPct.toFixed(1)}%`
      );

      try {
  if (turboMode) {
    // ⚡ MAX TURBO
    placeDiffersInstant(best.pair, best.lowestDigit, 1);
  } else {
    await placeDiffersAndWaitBuyAck(best.pair, best.lowestDigit);
  }

  lastAuto1xPairRef.current = best.pair; // ✅ remember
  setAnalysisStatus("1x Auto trade placed.");
} catch {
  setAnalysisStatus("Trade failed.");
}
    } else {
      setAnalysisStatus("No valid pairs < 3.0% — no trade placed.");
    }
  } finally {
    setAuto1xRunning(false);
  }
};
/* ================= Fast AutoTrading (NEW) ================= */

const FAST_INTERVAL_MS_NORMAL = 400; // 0.4s as requested
const FAST_INTERVAL_MS_TURBO = 250;  // recommended faster in Turbo
const FAST_MAX_BUY_QUEUE = 12;       // safety limit

const toggleFastAutoTrading = async () => {
  // STOP
  if (fastAutoRunning) {
    fastAutoCancelRef.current = true;
    setAnalysisStatus("Stopping Fast AutoTrading...");
    return;
  }

  // START validations
  if (selectedDigit === null) return alert("Select a digit first");
  if (!stake || stake <= 0) return alert("Enter a stake amount");
  if (!wsRef.current || wsRef.current.readyState !== WebSocket.OPEN)
    return alert("WebSocket not connected");
  if (!authorizedRef.current) return alert("Not authorized");

  fastAutoCancelRef.current = false;
  setFastAutoRunning(true);
  setAnalysisStatus("Fast AutoTrading started...");

  if (fastAutoLoopRunningRef.current) return;
  fastAutoLoopRunningRef.current = true;

  try {
    while (!fastAutoCancelRef.current) {
      const ws = wsRef.current;
      if (!ws || ws.readyState !== WebSocket.OPEN || !authorizedRef.current) break;

      const d = selectedDigitRef.current;
      if (d === null) {
        setAnalysisStatus("Fast AutoTrading paused: select a digit.");
        await sleep(250);
        continue;
      }

      const sym = selectedPairRef.current;

      // backpressure protection
      if (buyQueueRef.current.length > FAST_MAX_BUY_QUEUE) {
        setAnalysisStatus(`Fast AutoTrading waiting... (queue ${buyQueueRef.current.length})`);
        await sleep(150);
        continue;
      }

      // 🔥 ALWAYS DIFFERS
      placeDiffersInstant(sym, d, 1);

      const interval = turboMode ? FAST_INTERVAL_MS_TURBO : FAST_INTERVAL_MS_NORMAL;
      await sleep(interval);
    }
  } finally {
    fastAutoLoopRunningRef.current = false;
    fastAutoCancelRef.current = false;
    setFastAutoRunning(false);
    setAnalysisStatus("Fast AutoTrading stopped.");
  }
};
/* ================= SpiderX Random Over/Under Auto ================= */

const toggleSpiderRandomAuto = async () => {
  // STOP
  if (spiderRandomRunning) {
    spiderRandomCancelRef.current = true;
    setAnalysisStatus("Stopping SpiderX Random Auto...");
    return;
  }

  // START validations
  if (!stake || stake <= 0) return alert("Enter a stake amount");
  if (!wsRef.current || wsRef.current.readyState !== WebSocket.OPEN) return alert("WebSocket not connected");
  if (!authorizedRef.current) return alert("Not authorized");

  spiderRandomCancelRef.current = false;
  setSpiderRandomRunning(true);
  setAnalysisStatus("SpiderX Random Auto started...");

  if (spiderRandomLoopRef.current) return;
  spiderRandomLoopRef.current = true;

  try {
    while (!spiderRandomCancelRef.current) {
      // pick a truly random pair
      const pair = PAIRS[Math.floor(Math.random() * PAIRS.length)];

      const digits = pairDigitsRef.current[pair] ?? [];
      if (digits.length < 20) {
        await sleep(100);
        continue;
      }

      const last20 = digits.slice(-20);
      const freq = Array.from({ length: 10 }, () => 0);
      last20.forEach((d) => freq[d]++);

      const pct = freq.map((n) => (n / 20) * 100);

      // Build ALL valid signals
      const signals: Array<{ type: TradeType; digit: number }> = [];

      // Over 0 when 0 ≤ 5%
      if (pct[0] <= 5) signals.push({ type: "Over", digit: 0 });

      // Over 1 when 0 & 1 ≤ 5%
      if (pct[0] <= 5 && pct[1] <= 5) signals.push({ type: "Over", digit: 1 });

      // Under 9 when 9 ≤ 5%
      if (pct[9] <= 5) signals.push({ type: "Under", digit: 9 });

      // Under 8 when 8 & 9 ≤ 5%
      if (pct[8] <= 5 && pct[9] <= 5) signals.push({ type: "Under", digit: 8 });

      // If no valid signal, skip this cycle
      if (signals.length === 0) {
        await sleep(150);
        continue;
      }

      // 🎯 TRUE RANDOM: pick one signal randomly
      const pick = signals[Math.floor(Math.random() * signals.length)];

      // set pair + digit
      setSelectedPair(pair);
      setSelectedDigit(pick.digit);

      // place trade (1 tick)
      setTimeout(() => {
        placeTrade(pick.type, 1);
      }, 30);

      const interval = turboMode ? 250 : 400;
      await sleep(interval);
    }
  } finally {
    spiderRandomLoopRef.current = false;
    spiderRandomCancelRef.current = false;
    setSpiderRandomRunning(false);
    setAnalysisStatus("SpiderX Random Auto stopped.");
  }
};
  // ✅ enforce strategy availability for USERS (NEW)
  const isStrategyEnabledForViewer = (key: StrategyKey) => {
    if (isAdmin) return true;
    return strategyFlags[key] !== false;
  };

  // ✅ if admin disables a strategy while a USER is viewing it, close it (NEW)
  useEffect(() => {
  if (isAdmin) return;
  if (activeStrategy === "matches" && !isStrategyEnabledForViewer("matches")) setActiveStrategy(null);
  if (activeStrategy === "overunder" && !isStrategyEnabledForViewer("overunder")) setActiveStrategy(null);
  if (activeStrategy === "risefall" && !isStrategyEnabledForViewer("risefall")) setActiveStrategy(null);
  if (activeStrategy === "mspider" && !isStrategyEnabledForViewer("mspider")) setActiveStrategy(null);
  // eslint-disable-next-line react-hooks/exhaustive-deps
}, [strategyFlags, isAdmin]);

  // remount MetroX panel when strategy changes
  useEffect(() => {
  if (!connected) return;
  if (activeStrategy !== "risefall") return;
  if (!selectedPair) return;

  // Only subscribe to the currently selected Rise/Fall pair
  safeSend({ ticks: selectedPair, subscribe: 1 });
}, [activeStrategy, connected, selectedPair]);
  useEffect(() => {
  setMetroXResetKey((k) => k + 1);

  if (activeStrategy !== "matches") {
    // 🛑 stop Fast AutoTrading when leaving MetroX
  fastAutoCancelRef.current = true;
  setFastAutoRunning(false);
    // 🔄 full reset when MetroX is OFF
    pairDigitsRef.current = Object.fromEntries(
      PAIRS.map((p) => [p, []])
    ) as unknown as Record<Pair, number[]>;

    setTicks([]);
    setSelectedDigit(null);
    setAnalysisOpen(false);
    setAnalysisStatus("");
    setLastWinDigit(null);
    setLastLossDigit(null);

    setPairMeta(
      Object.fromEntries(PAIRS.map((p) => [p, { count: 0 }])) as unknown as Record<
        Pair,
        { count: number; lowDigit?: number; lowPct?: number }
      >
    );
  }
}, [activeStrategy]);

  // ✅ prevent UI showing before auth is checked
  if (!authChecked) {
    return (
      <main className="min-h-screen bg-black text-white flex items-center justify-center">
        Loading...
      </main>
    );
  }

  return (
    <main className="min-h-screen relative overflow-hidden text-white">
      {/* Background layers */}
      <div className="pointer-events-none absolute inset-0 bg-gradient-to-br from-[#070c16] via-[#070c16] to-black" />
      <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(60%_60%_at_20%_10%,rgba(255,140,0,0.18),transparent_60%)]" />
      <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(55%_55%_at_80%_20%,rgba(59,130,246,0.16),transparent_60%)]" />
      <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(60%_60%_at_50%_85%,rgba(16,185,129,0.10),transparent_60%)]" />

      {/* MetroAI watermark background */}
<div
  className="pointer-events-none absolute inset-0 flex items-center justify-center opacity-[0.15]"
  style={{
    backgroundImage: "url('/metroai-logo.png')",
    backgroundRepeat: "no-repeat",
    backgroundPosition: "center",
    backgroundSize: "60%",
  }}
/>

      <div className="relative">
        {/* NAVBAR */}
        <header className="h-16 bg-[#0f1b2d]/70 backdrop-blur-md flex items-center justify-between px-6 border-b border-white/10">
          <div className="flex items-center gap-3">
            <img
  src="/metroai-logo.png"
  alt="MetroAI Logo"
  className="w-10 h-9 rounded-md object-contain bg-white/5 p-1 border border-white/10"
/>
            <div>
              <p className="font-bold leading-tight">MetroAi</p>
              <p className="text-xs text-gray-400">AI Trading</p>
            </div>
          </div>

          <nav className="hidden md:flex items-center gap-6 text-sm text-gray-300">
            <span className="text-green-400">● {connected ? "Connected" : "Disconnected"}</span>
            <button onClick={() => router.push("/")}>Home</button>

            {/* ✅ only show Admin button for admins */}
            {isAdmin && (
              <button onClick={() => router.push("/admin")} className="text-red-200 hover:text-red-300">
                Admin
              </button>
            )}

            <button>Analyzer</button>
            <button onClick={() => router.push("/dashboard/chart")}>MT5</button>
            <button onClick={logout} className="hover:text-red-400">
              Logout
            </button>
          </nav>
        </header>

        {/* PAGE HEADER */}
        <section className="mx-auto w-full max-w-[1800px] px-4 sm:px-6 lg:px-8 py-6">
          <div className="glass-panel p-6 flex justify-between items-center
  bg-gradient-to-r from-orange-500/30 via-orange-600/20 to-purple-700/20">
            <div>
              <h1 className="text-2xl font-extrabold tracking-tight">Trading Analyzer</h1>
              <p className="text-sm text-orange-100">Connect to Deriv and manage your trading activities</p>
            </div>

            {!connected ? (
              <div className="flex gap-2">
                <input
  type="password"
  placeholder="Deriv API Token"
  className="bg-black/40 px-3 py-2 rounded-md border border-white/10"
  value={token}
  onChange={(e) => {
    const v = e.target.value;
    setToken(v);
    localStorage.setItem("deriv_token", v); // ✅ makes it available to MT5 dashboard
  }}
/>
                <button
                  onClick={connectDeriv}
                  className="bg-indigo-500 px-4 py-2 rounded-md text-sm shadow-[0_0_0_1px_rgba(255,255,255,0.10)]"
                >
                  Connect
                </button>
              </div>
            ) : (
              <button
                onClick={disconnect}
                className="bg-red-500 hover:bg-red-600 px-4 py-2 rounded-md text-sm shadow-[0_0_0_1px_rgba(255,255,255,0.10)]"
              >
                Disconnect
              </button>
            )}
          </div>
        </section>

        {/* MAIN GRID */}
        <section className="mx-auto w-full max-w-7xl px-4 sm:px-6 lg:px-8 pb-8 grid grid-cols-1 lg:grid-cols-2 gap-6">
          {/* LEFT */}
          <div className="space-y-6">
            <div className="bg-[#13233d]/80 backdrop-blur rounded-2xl p-6 border border-white/10 shadow-[0_0_0_1px_rgba(255,255,255,0.06)]">
              <h2 className="font-semibold mb-4 text-white/85 tracking-tight">Deriv API Connection</h2>

              <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-3 gap-4 text-sm">
                <div className="bg-black/30 rounded-xl p-4 border border-white/10">
                  <p className="text-white/55 text-xs uppercase tracking-wide">Account Status</p>
                  <p className="font-semibold text-green-400">{connected ? "Connected" : "Disconnected"}</p>
                </div>
                {/* ✅ Market / Timing Indicator */}


                <div className="bg-black/30 rounded-xl p-4 border border-white/10">
                  <p className="text-white/55 text-xs uppercase tracking-wide">Account Balance</p>
                  <p className="font-semibold text-lg">
                    {balance !== null ? `${balance.toFixed(2)} ${currency}` : "Loading..."}
                  </p>
                </div>

                <div className="bg-black/30 rounded-xl p-4 border border-white/10">
                  <p className="text-white/55 text-xs uppercase tracking-wide">Session Profit/Loss</p>
                  <p className={`font-semibold text-lg ${sessionNetProfit >= 0 ? "text-emerald-400" : "text-red-400"}`}>
  {sessionNetProfit >= 0 ? "+" : ""}
  {sessionNetProfit.toFixed(2)} {currency}
</p>
                </div>
              </div>
            </div>
            <div className="bg-[#13233d]/80 backdrop-blur rounded-2xl p-6 border border-white/10 shadow-[0_0_0_1px_rgba(255,255,255,0.06)]">
  <h2 className="font-semibold mb-4 text-white/85 tracking-tight">Market / Timing</h2>
  <MarketIndicator
  activeStrategy={activeStrategy}
  selectedPair={selectedPair}
  pairDigitsRef={pairDigitsRef}
/>
</div>
            <div className="bg-[#13233d]/80 backdrop-blur rounded-2xl p-6 border border-white/10 shadow-[0_0_0_1px_rgba(255,255,255,0.06)]">
              <h2 className="font-semibold mb-4 text-white/85 tracking-tight">Trading Strategies</h2>

              {/* ✅ show/hide based on admin flags (NEW) */}
              {isStrategyEnabledForViewer("matches") && (
  <StrategyRow
    title="MetroX"
    description="Matches/Differs strategy"
    active={activeStrategy === "matches"}
    onToggle={() => setActiveStrategy(activeStrategy === "matches" ? null : "matches")}
  />
)}

  {isStrategyEnabledForViewer("overunder") && (
  <StrategyRow
    title="SpiderX"
    description="Over/Under Strategy"
    active={activeStrategy === "overunder"}
    onToggle={() => setActiveStrategy(activeStrategy === "overunder" ? null : "overunder")}
  />
)}

  {isStrategyEnabledForViewer("risefall") && (
  <StrategyRow
    title="Rise/Fall"
    description="Rise/Fall Strategy"
    active={activeStrategy === "risefall"}
    onToggle={() => setActiveStrategy(activeStrategy === "risefall" ? null : "risefall")}
  />
)}

{isStrategyEnabledForViewer("mspider") && (
  <StrategyRow
    title="M-Spider"
    description="Higher/Lower strategy"
    active={activeStrategy === "mspider"}
    onToggle={() => setActiveStrategy(activeStrategy === "mspider" ? null : "mspider")}
  />
)}

            </div>
          </div>

          {/* RIGHT */}
          <div className="min-w-0 rounded-1xl p-0 border border-white/10 overflow-hidden shadow-[0_0_0_1px_rgba(255,255,255,0.06)]">
{activeStrategy === "matches" && isStrategyEnabledForViewer("matches") && (
  <MetroXPanel
    key={metroXResetKey}
    ticks={ticks}
    pipSize={pipSize}
    stake={stake}
    setStake={setStake}
    selectedDigit={selectedDigit}
    setSelectedDigit={setSelectedDigit}
    selectedPair={selectedPair}
    setSelectedPair={(p: Pair) => {
      resetPairNow(p);
      setSelectedPair(p);
    }}
    mdTradeType={mdTradeType}
    setMdTradeType={setMdTradeType}
    mdTickDuration={mdTickDuration}
    setMdTickDuration={setMdTickDuration}
    onPlaceMetroX={() => placeTrade(mdTradeType, mdTickDuration)}
    on3xSelectedDigit={place3xSelectedDigit}
    placeTradeFor={placeTradeFor}
    instant3xRunning={instant3xRunning}
    turboMode={turboMode}
    setTurboMode={setTurboMode}
    onToggle5x={toggle5xAutoTrading}
    auto5xRunning={auto5xRunning}
    analysisStatus={analysisStatus}
    analysisOpen={analysisOpen}
    setAnalysisOpen={setAnalysisOpen}
    lastWinDigit={lastWinDigit}
    lastLossDigit={lastLossDigit}
    pairMeta={pairMeta}
    tradeHistory={tradeHistory}
    onClearHistory={() => setTradeHistory([])}
    currency={currency}
    run1xAutoAllPairs={run1xAutoAllPairs}
    auto1xRunning={auto1xRunning}
    onToggleFastAuto={toggleFastAutoTrading}
    fastAutoRunning={fastAutoRunning} 
    uiFlags={uiFlags}
    isAdmin={isAdmin}
    onToggleMetro={toggleMetroAuto}
    metroRunning={metroRunning}
  />
)}

            {activeStrategy === "overunder" && isStrategyEnabledForViewer("overunder") && (
  <div className="bg-[#13233d] p-6 flex flex-col min-h-[520px]">
   <SpiderXAnalyzer
  pairs={METRO_SPIDER_PAIRS}
  indexGroups={INDEX_GROUPS}
  pairDigitsRef={pairDigitsRef}
  selectedPair={selectedPair}
  setStake={setStake}
  stake={stake}
  setSelectedPair={(p: Pair) => {
    resetPairNow(p);
    setSelectedPair(p);
  }}
  onPlaceTrade={(type: TradeType, duration: number) => placeTrade(type, duration)}
  tradeHistory={tradeHistory}
  currency={currency}
  onClearHistory={() => setTradeHistory([])}
  toggleSpiderRandomAuto={toggleSpiderRandomAuto}
  spiderRandomRunning={spiderRandomRunning}
  setSelectedDigit={setSelectedDigit}
  selectedDigit={selectedDigit}
  lastWinDigit={lastWinDigit}
  lastLossDigit={lastLossDigit}

  // ✅ ADD THESE TWO LINES (this fixes your error)
  uiFlags={uiFlags}
  isAdmin={isAdmin}
/>
  </div>
)}
{activeStrategy === "risefall" && isStrategyEnabledForViewer("risefall") && (
  <div className="bg-[#13233d] p-6 flex flex-col min-h-[520px]">
    <RiseFallPanel
  selectedPair={selectedPair}
  availablePairs={RISE_FALL_PAIRS}
  setSelectedPair={(p: Pair) => {
    resetPairNow(p);
    setSelectedPair(p);
  }}
  stake={stake}
  setStake={setStake}
  rfTickDuration={rfTickDuration}
  setRfTickDuration={setRfTickDuration}
  rfAllowEquals={rfAllowEquals}
  setRfAllowEquals={setRfAllowEquals}
  onPlaceTrade={(type: "Rise" | "Fall", duration: number) => placeTrade(type, duration)}
  onPlaceDoubleTrade={(duration: number) => placeRiseFallDoubleTrade(duration)}
  currency={currency}
  tradeHistory={tradeHistory}
  onClearHistory={() => setTradeHistory([])}
  pairQuotesRef={pairQuotesRef}
/>
  </div>
)}

{activeStrategy === "mspider" && isStrategyEnabledForViewer("mspider") && (
  <div className="bg-[#13233d] p-6 flex flex-col min-h-[520px]">
    <MSpiderPanel
      header="M-Spider"
      selectedPair={selectedPair}
      setSelectedPair={setSelectedPair}
      stake={stake}
      setStake={setStake}
      currency={currency}
      onPlaceHigherLowerTrade={placeHigherLowerTrade}
      requestHigherLowerPreview={requestHigherLowerPreview}
      tradeHistory={tradeHistory}
      onClearHistory={() => setTradeHistory([])}
      pairQuotesRef={pairQuotesRef}
      barrierOptimizerLive={barrierOptimizerLive}
      setBarrierOptimizerLive={setBarrierOptimizerLive}
      barrierOptimizerWindow={barrierOptimizerWindow}
      setBarrierOptimizerWindow={setBarrierOptimizerWindow}
      barrierOptimizerRows={barrierOptimizerRows}
      setBarrierOptimizerOpen={setBarrierOptimizerOpen}
    />
  </div>
)}


            {/* ✅ if user selects a disabled strategy, show the default empty state */}
            {!activeStrategy && (
              <div className="bg-gradient-to-br from-[#1b2235] to-[#121826] p-6 min-h-[520px] flex items-center justify-center">
                <div className="text-center text-gray-300/80 max-w-sm">
                  <div className="mx-auto mb-4 w-10 h-10 rounded-full bg-white/5 flex items-center justify-center border border-white/10">
                    <span className="text-white/70">📊</span>
                  </div>
                  <p className="text-lg font-semibold text-white/90">Select a Trading Strategy</p>
                  <p className="text-sm mt-1 text-white/60">
                    Choose one of the available trading strategies to start analyzing and trading
                  </p>
                </div>
              </div>
            )}
          </div>
        </section>
      </div>
    </main>
  );
}


/* ================= STRATEGY TOGGLE ================= */
function MSpiderPanel({
  header,
  selectedPair,
  setSelectedPair,
  stake,
  setStake,
  currency,
  onPlaceHigherLowerTrade,
  requestHigherLowerPreview,
  tradeHistory,
  onClearHistory,
  pairQuotesRef,
  barrierOptimizerLive,
  setBarrierOptimizerLive,
  barrierOptimizerWindow,
  setBarrierOptimizerWindow,
  barrierOptimizerRows,
  setBarrierOptimizerOpen,
}: {
  barrierOptimizerLive: boolean;
  setBarrierOptimizerLive: React.Dispatch<React.SetStateAction<boolean>>;
  barrierOptimizerWindow: BarrierOptimizerWindow;
  setBarrierOptimizerWindow: React.Dispatch<React.SetStateAction<BarrierOptimizerWindow>>;
  barrierOptimizerRows: BarrierOptimizerRow[];
  setBarrierOptimizerOpen: React.Dispatch<React.SetStateAction<boolean>>;
  header: string;
  selectedPair: Pair;
  setSelectedPair: (p: Pair) => void;
  stake: number;
  setStake: React.Dispatch<React.SetStateAction<number>>;
  currency: string;
  onPlaceHigherLowerTrade: (args: {
  direction: "Higher" | "Lower";
  durationValue: string;
  barrier: string;
  customStake?: number;
}) => void;
requestHigherLowerPreview: (args: {
  direction: "Higher" | "Lower";
  durationValue: string;
  barrier: string;
  customStake: number;
}) => Promise<{ payout: number; profit: number }>;
  tradeHistory: Trade[];
  onClearHistory: () => void;
  pairQuotesRef: React.MutableRefObject<Record<Pair, number[]>>;
}) {
  const quotes = pairQuotesRef.current[selectedPair] ?? [];
  const latestQuote = quotes.length ? quotes[quotes.length - 1] : 0;

  const [duration, setDuration] = useState<string>("5");
  const [lowerStake, setLowerStake] = useState<number>(stake);
  const [autoTradingEnabled, setAutoTradingEnabled] = useState(false);
  const [autoTradeMinConfidence, setAutoTradeMinConfidence] = useState<number>(60);
  const autoTradeLastAtRef = useRef<number>(0);
  const [barrierMode, setBarrierMode] = useState<"offset" | "absolute">("offset");
  const [halfBarrier, setHalfBarrier] = useState(false);
  const [higherBarrier, setHigherBarrier] = useState<string>("+0.12");
  const [lowerBarrier, setLowerBarrier] = useState<string>("+0.12");

  const durationOptions = [
    
    { value: "5", label: "5 Ticks" },
    { value: "15s", label: "15 Seconds" },
    { value: "30s", label: "30 Seconds" },
    { value: "1m", label: "1 Minute" },
    { value: "2m", label: "2 Minutes" },
    { value: "5m", label: "5 Minutes" },
    { value: "10m", label: "10 Minutes" },
    { value: "15m", label: "15 Minutes" },
    { value: "30m", label: "30 Minutes" },
    { value: "1h", label: "1 Hour" },
  ];

  const offsetBasePresets = [0.5, 0.25, 0.12, 0.05, -0.05, -0.12, -0.25, -0.5];
  const pip = Math.max(2, latestQuote ? String(latestQuote).split(".")[1]?.length ?? 2 : 2);

  const normalizeOffset = (value: number) => {
    const decimals = halfBarrier ? 3 : 2;
    const rounded = Number(value.toFixed(decimals));
    return rounded === 0 ? 0 : rounded;
  };

  const formatOffset = (value: number) => {
    const normalized = normalizeOffset(value);
    const abs = Math.abs(normalized).toFixed(2);
    const sign = normalized >= 0 ? "+" : "-";
    return `${sign}${abs}`;
  };

  const parseOffsetValue = (value: string) => {
    const n = Number.parseFloat(value);
    return Number.isFinite(n) ? normalizeOffset(n) : 0.12;
  };

  const offsetPresets = useMemo(
    () => offsetBasePresets.map((v) => normalizeOffset(halfBarrier ? v / 2 : v)),
    [halfBarrier]
  );

  const absolutePresets = useMemo(() => {
    if (!latestQuote) return [] as number[];
    return offsetPresets
      .map((v) => Number((latestQuote + v).toFixed(pip)))
      .sort((a, b) => a - b);
  }, [latestQuote, offsetPresets, pip]);

  const higherDisplay = useMemo(() => {
    if (barrierMode === "offset") return higherBarrier;
    const n = Number.parseFloat(higherBarrier);
    return Number.isFinite(n) ? n.toFixed(pip) : latestQuote.toFixed(pip);
  }, [barrierMode, higherBarrier, latestQuote, pip]);

  const lowerDisplay = useMemo(() => {
    if (barrierMode === "offset") return lowerBarrier;
    const n = Number.parseFloat(lowerBarrier);
    return Number.isFinite(n) ? n.toFixed(pip) : latestQuote.toFixed(pip);
  }, [barrierMode, lowerBarrier, latestQuote, pip]);

 useEffect(() => {
  const defaultOffset = formatOffset(halfBarrier ? 0.06 : 0.12);

  if (barrierMode === "offset") {
    setHigherBarrier(defaultOffset);
    setLowerBarrier(defaultOffset);
    return;
  }

  if (!latestQuote) return;

  const base = Number((latestQuote + (halfBarrier ? 0.06 : 0.12)).toFixed(pip));
  const formatted = base.toFixed(pip);
  setHigherBarrier(formatted);
  setLowerBarrier(formatted);
  // eslint-disable-next-line react-hooks/exhaustive-deps
}, [barrierMode, halfBarrier]);

  const changeOffsetBarrier = (
    current: string,
    setValue: React.Dispatch<React.SetStateAction<string>>,
    direction: -1 | 1
  ) => {
    const currentOffset = parseOffsetValue(current);
    const options = [...offsetPresets].sort((a, b) => a - b);

    let idx = options.findIndex((v) => Math.abs(v - currentOffset) < 0.0001);

    if (idx === -1) {
      idx = options.findIndex((v) => v >= currentOffset);
      if (idx === -1) idx = options.length - 1;
    }

    const nextIdx = Math.max(0, Math.min(options.length - 1, idx + direction));
    setValue(formatOffset(options[nextIdx]));
  };

  const barrierChips =
    barrierMode === "offset"
      ? offsetPresets.map((v) => ({
          key: `offset-${v}`,
          label: formatOffset(v),
          value: formatOffset(v),
        }))
      : absolutePresets.map((v) => ({
          key: `absolute-${v}`,
          label: v.toFixed(pip),
          value: v.toFixed(pip),
        }));
        const chartQuotes = quotes.slice(-30);
const anchorQuote = chartQuotes.length > 0 ? chartQuotes[0] : latestQuote;

const higherBarrierValue =
  barrierMode === "offset"
    ? Number((latestQuote + parseOffsetValue(higherBarrier)).toFixed(pip))
    : Number.parseFloat(higherBarrier || String(latestQuote || 0));

const lowerBarrierValue =
  barrierMode === "offset"
    ? Number((latestQuote + parseOffsetValue(lowerBarrier)).toFixed(pip))
    : Number.parseFloat(lowerBarrier || String(latestQuote || 0));

const recentMoves =
  chartQuotes.length > 1
    ? chartQuotes.slice(1).map((q, i) => ({
        key: `${i}-${q}`,
        dir: q >= chartQuotes[i] ? "H" : "L",
      }))
    : [];

const higherCount = recentMoves.filter((m) => m.dir === "H").length;
const lowerCount = recentMoves.filter((m) => m.dir === "L").length;
const totalMoves = recentMoves.length || 1;
const higherPct = (higherCount / totalMoves) * 100;
const lowerPct = (lowerCount / totalMoves) * 100;

const prediction = lowerPct > higherPct ? "LOWER" : "HIGHER";
const [higherPreview, setHigherPreview] = useState<{ payout: number; profit: number }>({
  payout: 0,
  profit: 0,
});
const [lowerPreview, setLowerPreview] = useState<{ payout: number; profit: number }>({
  payout: 0,
  profit: 0,
});

const combinedStake = Number((stake + lowerStake).toFixed(2));
const higherPayout = Number(higherPreview.payout.toFixed(2));
const lowerPayout = Number(lowerPreview.payout.toFixed(2));
const higherProfit = Number(higherPreview.profit.toFixed(2));
const lowerProfit = Number(lowerPreview.profit.toFixed(2));
const combinedPayout = Number((higherPayout + lowerPayout).toFixed(2));
const confidence = Math.max(higherPct, lowerPct);
const autoTradeCooldownMs = 30_000;
const autoTradeReady =
  confidence >= autoTradeMinConfidence &&
  Date.now() - autoTradeLastAtRef.current >= autoTradeCooldownMs;

useEffect(() => {
  let cancelled = false;

  const run = async () => {
    if (!stake || stake <= 0 || !lowerStake || lowerStake <= 0) {
      if (!cancelled) {
        setHigherPreview({ payout: 0, profit: 0 });
        setLowerPreview({ payout: 0, profit: 0 });
      }
      return;
    }

    try {
      const [higher, lower] = await Promise.all([
        requestHigherLowerPreview({
          direction: "Higher",
          durationValue: duration,
          barrier: higherDisplay,
          customStake: stake,
        }),
        requestHigherLowerPreview({
          direction: "Lower",
          durationValue: duration,
          barrier: lowerDisplay,
          customStake: lowerStake,
        }),
      ]);

      if (!cancelled) {
        setHigherPreview(higher);
        setLowerPreview(lower);
      }
    } catch {
      if (!cancelled) {
        setHigherPreview({ payout: 0, profit: 0 });
        setLowerPreview({ payout: 0, profit: 0 });
      }
    }
  };

  const t = window.setTimeout(run, 180);

  return () => {
    cancelled = true;
    window.clearTimeout(t);
  };
}, [requestHigherLowerPreview, duration, higherDisplay, lowerDisplay, stake, lowerStake, selectedPair]);
const zoneLabel =
  latestQuote > higherBarrierValue
    ? "Above Higher"
    : latestQuote < lowerBarrierValue
    ? "Below Lower"
    : "Between";

const chartMin = Math.min(...chartQuotes, lowerBarrierValue, higherBarrierValue, latestQuote || 0);
const chartMax = Math.max(...chartQuotes, lowerBarrierValue, higherBarrierValue, latestQuote || 0);
const chartRange = Math.max(chartMax - chartMin, 0.0001);

const pathD = chartQuotes
  .map((q, i) => {
    const x = chartQuotes.length <= 1 ? 0 : (i / (chartQuotes.length - 1)) * 100;
    const y = 100 - ((q - chartMin) / chartRange) * 100;
    return `${i === 0 ? "M" : "L"}${x},${y}`;
  })
  .join(" ");

const latestY = 100 - ((latestQuote - chartMin) / chartRange) * 100;
const higherY = 100 - ((higherBarrierValue - chartMin) / chartRange) * 100;
const lowerY = 100 - ((lowerBarrierValue - chartMin) / chartRange) * 100;
const clampY = (y: number) => Math.max(6, Math.min(94, y));
const higherLabelY = clampY(higherY - 3);
const lowerLabelY = clampY(lowerY - 3);
const latestLabelY = clampY(latestY - 3);

useEffect(() => {
  if (!autoTradingEnabled) return;
  if (!autoTradeReady) return;

  autoTradeLastAtRef.current = Date.now();

  onPlaceHigherLowerTrade({
  direction: "Higher",
  durationValue: duration,
  barrier: higherDisplay,
  customStake: stake,
});

onPlaceHigherLowerTrade({
  direction: "Lower",
  durationValue: duration,
  barrier: lowerDisplay,
  customStake: lowerStake,
});
}, [
  autoTradingEnabled,
  autoTradeReady,
  autoTradeMinConfidence,
  higherDisplay,
  lowerDisplay,
  duration,
  stake,
  lowerStake,
  onPlaceHigherLowerTrade,
]);
  return (
    <div className="rounded-[28px] border border-cyan-500/30 bg-[linear-gradient(135deg,rgba(29,40,73,0.92),rgba(5,17,46,0.96)_55%,rgba(2,13,36,0.98))] p-8 shadow-[0_0_40px_rgba(0,0,0,0.25)]">
      <div className="flex items-start justify-between gap-4">
        <div className="flex items-start gap-4">
          <div className="flex h-14 w-14 items-center justify-center rounded-2xl border border-cyan-400/40 bg-cyan-500/15 text-cyan-300">
            <svg
              viewBox="0 0 24 24"
              className="h-7 w-7"
              fill="none"
              stroke="currentColor"
              strokeWidth="1.8"
              strokeLinecap="round"
              strokeLinejoin="round"
            >
              <path d="M3 13h4l2.5-6 4 10 2.5-4H21" />
            </svg>
          </div>

          <div>
            <h2 className="text-[2rem] font-bold leading-none text-white">{header}</h2>
            <p className="mt-2 text-lg text-white/65">Real-time price movement prediction</p>
          </div>
        </div>

        <div className="inline-flex items-center gap-3 rounded-full border border-sky-400/50 bg-sky-500/15 px-5 py-2 text-sky-300">
          <span className="h-3 w-3 rounded-full bg-sky-400" />
          <span className="text-sm font-semibold tracking-wide">Live</span>
        </div>
      </div>

      <div className="mt-8 grid grid-cols-1 gap-6 md:grid-cols-2">
        <div>
          <label className="mb-3 block text-[1.05rem] font-medium text-white/85">Market</label>
          <select
            value={selectedPair}
            onChange={(e) => setSelectedPair(e.target.value as Pair)}
            className="h-14 w-full rounded-xl border border-white/10 bg-slate-800/70 px-4 text-[1.05rem] text-white outline-none transition focus:border-cyan-400/50"
          >
            {RISE_FALL_PAIRS.map((pair) => (
              <option key={pair} value={pair}>
                {pair}
              </option>
            ))}
          </select>
        </div>

        <div>
          <label className="mb-3 block text-[1.05rem] font-medium text-white/85">Duration</label>
          <select
            value={duration}
            onChange={(e) => setDuration(e.target.value)}
            className="h-14 w-full rounded-xl border border-white/10 bg-slate-800/70 px-4 text-[1.05rem] text-white outline-none transition focus:border-cyan-400/50"
          >
            {durationOptions.map((opt) => (
              <option key={opt.value} value={opt.value}>
                {opt.label}
              </option>
            ))}
          </select>
        </div>
      </div>

      <div className="mt-8 grid grid-cols-1 gap-6 md:grid-cols-2">
        <div>
          <label className="mb-3 flex items-center gap-2 text-[1.05rem] font-medium text-emerald-300">
            <span>↗</span>
            <span>Higher Stake ($)</span>
          </label>
          <input
            type="number"
            min={0.35}
            step="0.01"
            value={stake}
            onChange={(e) => {
              const v = Number(e.target.value);
              if (Number.isFinite(v)) setStake(v);
            }}
            className="h-16 w-full rounded-2xl border border-emerald-400/25 bg-slate-800/70 px-5 text-[1.1rem] text-white outline-none transition focus:border-emerald-400/45"
          />
        </div>

        <div>
          <label className="mb-3 flex items-center gap-2 text-[1.05rem] font-medium text-rose-300">
            <span>↘</span>
            <span>Lower Stake ($)</span>
          </label>
          <input
            type="number"
            min={0.35}
            step="0.01"
            value={lowerStake}
            onChange={(e) => {
              const v = Number(e.target.value);
              if (Number.isFinite(v)) setLowerStake(v);
            }}
            className="h-16 w-full rounded-2xl border border-rose-400/25 bg-slate-800/70 px-5 text-[1.1rem] text-white outline-none transition focus:border-rose-400/45"
          />
        </div>
      </div>

      <div className="mt-8">
        <label className="mb-4 block text-[1.05rem] font-medium text-white/85">Barrier Type</label>

        <div className="inline-flex rounded-2xl border border-white/10 bg-slate-800/55 p-1">
          <button
            type="button"
            onClick={() => setBarrierMode("offset")}
            className={`min-w-[210px] rounded-xl px-8 py-4 text-lg font-medium transition ${
              barrierMode === "offset"
                ? "bg-sky-500/30 text-sky-300 shadow-[inset_0_0_18px_rgba(14,165,233,0.12)]"
                : "text-white/75"
            }`}
          >
            Offset
          </button>

          <button
            type="button"
            onClick={() => setBarrierMode("absolute")}
            className={`min-w-[210px] rounded-xl px-8 py-4 text-lg font-medium transition ${
              barrierMode === "absolute"
                ? "bg-sky-500/30 text-sky-300 shadow-[inset_0_0_18px_rgba(14,165,233,0.12)]"
                : "text-white/75"
            }`}
          >
            Absolute
          </button>
        </div>
      </div>

      <div className="mt-8 flex justify-center">
        <button
          type="button"
          onClick={() => setHalfBarrier((v) => !v)}
          className={`inline-flex items-center gap-4 rounded-2xl border px-6 py-3 text-lg transition ${
            halfBarrier
              ? "border-amber-400/40 bg-amber-500/12 text-amber-300"
              : "border-white/10 bg-slate-800/55 text-white/80"
          }`}
        >
          <span
            className={`relative h-8 w-16 rounded-full transition ${
              halfBarrier ? "bg-amber-500/35" : "bg-slate-600/60"
            }`}
          >
            <span
              className={`absolute top-1 h-6 w-6 rounded-full transition ${
                halfBarrier ? "left-9 bg-amber-300" : "left-1 bg-white/70"
              }`}
            />
          </span>
          <span>Half Barrier</span>
          {halfBarrier && (
            <span className="rounded-lg bg-amber-400/15 px-3 py-1 text-base font-semibold text-amber-300">
              /2
            </span>
          )}
        </button>
      </div>

      <div className="mt-8 grid grid-cols-1 gap-5 xl:grid-cols-2">
        <div className="rounded-[24px] border border-emerald-400/25 bg-slate-900/35 p-5 xl:min-h-[250px]">
          <div className="mb-5 flex items-center justify-between gap-4">
            <div className="text-[1.05rem] font-medium text-emerald-300">↗ Higher Barrier</div>
            <div className="text-[1.7rem] font-medium tracking-tight text-white/45">
              {latestQuote ? latestQuote.toFixed(pip) : "0.00"}
            </div>
          </div>

          <div className="flex items-center gap-2">
            {barrierMode === "offset" && (
              <button
                type="button"
                onClick={() => changeOffsetBarrier(higherBarrier, setHigherBarrier, -1)}
                className="flex h-11 w-11 items-center justify-center rounded-2xl border border-white/10 bg-slate-700/45 text-3xl text-white/80 shrink-0"
              >
                −
              </button>
            )}

            <input
  type="number"
  step={barrierMode === "offset" ? "0.01" : "any"}
  value={
    barrierMode === "offset"
      ? parseOffsetValue(higherBarrier)
      : Number.parseFloat(higherBarrier || String(latestQuote || 0))
  }
  onChange={(e) => {
    const v = Number(e.target.value);
    if (!Number.isFinite(v)) return;

    if (barrierMode === "offset") {
      setHigherBarrier(formatOffset(v));
    } else {
      setHigherBarrier(v.toFixed(pip));
    }
  }}
  className="h-[60px] min-w-0 flex-1 rounded-2xl border border-emerald-400/25 bg-slate-800/65 px-2 text-[1.05rem] text-white outline-none transition focus:border-emerald-400/45"
/>

            {barrierMode === "offset" && (
              <button
                type="button"
                onClick={() => changeOffsetBarrier(higherBarrier, setHigherBarrier, 1)}
                className="flex h-11 w-11 items-center justify-center rounded-2xl border border-white/10 bg-slate-700/45 text-3xl text-white/80 shrink-0"
              >
                +
              </button>
            )}
          </div>

          <div className="mt-3 flex flex-wrap gap-2">
            {barrierChips.map((chip) => (
              <button
                key={`higher-${chip.key}`}
                type="button"
                onClick={() => setHigherBarrier(chip.value)}
                className={`rounded-xl border px-4 py-2.5 text-base font-medium transition ${
                  higherDisplay === chip.value
                    ? "border-emerald-400/45 bg-emerald-500/15 text-emerald-300"
                    : "border-white/10 bg-slate-800/60 text-white/70"
                }`}
              >
                {chip.label}
              </button>
            ))}
          </div>
        </div>

        <div className="rounded-[24px] border border-rose-400/25 bg-slate-900/35 p-5 xl:min-h-[250px]">
          <div className="mb-4 flex items-center justify-between gap-4">
            <div className="text-[1.05rem] font-medium text-rose-300">↘ Lower Barrier</div>
            <div className="text-[1.7rem] font-medium tracking-tight text-white/45">
              {latestQuote ? latestQuote.toFixed(pip) : "0.00"}
            </div>
          </div>

          <div className="flex items-center gap-3">
            {barrierMode === "offset" && (
              <button
                type="button"
                onClick={() => changeOffsetBarrier(lowerBarrier, setLowerBarrier, -1)}
                className="flex h-11 w-11 items-center justify-center rounded-2xl border border-white/10 bg-slate-700/45 text-3xl text-white/80 shrink-0"
              >
                −
              </button>
            )}

            <input
  type="number"
  step={barrierMode === "offset" ? "0.01" : "any"}
  value={
    barrierMode === "offset"
      ? parseOffsetValue(lowerBarrier)
      : Number.parseFloat(lowerBarrier || String(latestQuote || 0))
  }
  onChange={(e) => {
    const v = Number(e.target.value);
    if (!Number.isFinite(v)) return;

    if (barrierMode === "offset") {
      setLowerBarrier(formatOffset(v));
    } else {
      setLowerBarrier(v.toFixed(pip));
    }
  }}
  className="h-[60px] min-w-0 flex-1 rounded-2xl border border-rose-400/25 bg-slate-800/65 px-2 text-[1.05rem] text-white outline-none transition focus:border-rose-400/45"
/>

            {barrierMode === "offset" && (
              <button
                type="button"
                onClick={() => changeOffsetBarrier(lowerBarrier, setLowerBarrier, 1)}
                className="flex h-11 w-11 items-center justify-center rounded-2xl border border-white/10 bg-slate-700/45 text-3xl text-white/80 shrink-0"
              >
                +
              </button>
            )}
          </div>

          <div className="mt-3 flex flex-wrap gap-2">
            {barrierChips.map((chip) => (
              <button
                key={`lower-${chip.key}`}
                type="button"
                onClick={() => setLowerBarrier(chip.value)}
                className={`rounded-xl border px-4 py-2.5 text-base font-medium transition ${
                  lowerDisplay === chip.value
                    ? "border-rose-400/45 bg-rose-500/15 text-rose-300"
                    : "border-white/10 bg-slate-800/60 text-white/70"
                }`}
              >
                {chip.label}
              </button>
            ))}
          </div>
        </div>
      </div>
      
      <div className="mt-8 rounded-[28px] border border-cyan-500/20 bg-[linear-gradient(135deg,rgba(10,23,53,0.96),rgba(4,16,42,0.98)_55%,rgba(2,13,36,0.99))] p-5 shadow-[0_0_0_1px_rgba(34,211,238,0.08)]">
  <div className="flex items-start justify-between gap-4">
    <div className="flex items-start gap-3">
      <div className="flex h-12 w-12 items-center justify-center rounded-2xl border border-amber-400/25 bg-amber-500/10 text-amber-300 text-2xl">
        ⌖
      </div>
      <div>
        <div className="text-[1.3rem] font-bold leading-none text-white">
          Barrier Optimizer
        </div>
        <div className="mt-1 text-sm text-white/55">
          Find the best barrier settings for each pair
        </div>
      </div>
    </div>

    <div className="flex items-center gap-2">
      {barrierOptimizerLive && (
        <span className="rounded-full border border-emerald-400/20 bg-emerald-500/12 px-3 py-1 text-xs font-semibold text-emerald-300">
          ● LIVE
        </span>
      )}
      <span className="rounded-full border border-amber-400/20 bg-amber-500/12 px-3 py-1 text-xs font-semibold text-amber-300">
        {barrierOptimizerRows.length} pairs
      </span>
    </div>
  </div>

  <div className="mt-5 flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
    <div className="flex flex-wrap items-center gap-2">
      <span className="text-white/70 text-sm">Window:</span>
      {[3, 5, 10, 15].map((n) => (
        <button
          key={n}
          type="button"
          onClick={() => setBarrierOptimizerWindow(n as BarrierOptimizerWindow)}
          className={`rounded-xl border px-4 py-2 text-sm font-medium transition ${
            barrierOptimizerWindow === n
              ? "border-amber-400/35 bg-amber-500/15 text-amber-300"
              : "border-white/10 bg-white/5 text-white/40"
          }`}
        >
          {n} ticks
        </button>
      ))}
    </div>

    <button
      type="button"
      onClick={() => setBarrierOptimizerLive((v) => !v)}
      className={`rounded-xl px-5 py-2.5 text-sm font-semibold text-white transition ${
        barrierOptimizerLive
          ? "bg-rose-600 hover:bg-rose-500"
          : "bg-orange-500 hover:bg-orange-400"
      }`}
    >
      {barrierOptimizerLive ? "Stop" : "Go Live"}
    </button>
  </div>

  {!barrierOptimizerLive ? (
    <div className="mt-6 flex min-h-[230px] flex-col items-center justify-center rounded-[24px] border border-white/10 bg-white/5 px-6 text-center">
      <div className="flex h-16 w-16 items-center justify-center rounded-[20px] border border-amber-400/20 bg-amber-500/10 text-2xl text-amber-300">
        ⌖
      </div>
      <div className="mt-4 text-xl font-semibold text-white/85">
        No scan results yet
      </div>
      <div className="mt-2 max-w-xl text-sm leading-7 text-white/45">
        Click &quot;Go Live&quot; to connect to all volatility pairs and get continuously updated barrier recommendations.
      </div>
    </div>
  ) : (
    <div className="mt-6 rounded-[24px] border border-cyan-500/20 bg-[#07152c]/85 p-4">
      <div className="flex flex-col gap-2 lg:flex-row lg:items-center lg:justify-between">
        <div className="flex items-center gap-2 text-sm font-semibold text-white/85">
          <span className="text-amber-300">◔</span>
          <span>Top 4 pairs by longest movement ({barrierOptimizerWindow}-tick window)</span>
        </div>

        <div className="flex items-center gap-2 text-xs">
          <span className="rounded-full border border-emerald-400/20 bg-emerald-500/12 px-3 py-1 font-semibold text-emerald-300">
            ● LIVE
          </span>
          <span className="text-white/35">{quotes.length} ticks</span>
        </div>
      </div>

      <div className="mt-4 space-y-4">
        {barrierOptimizerRows.length === 0 ? (
          <div className="rounded-[20px] border border-white/10 bg-white/5 p-5 text-sm text-white/55">
            Waiting for enough live tick history to rank all pairs.
          </div>
        ) : (
          barrierOptimizerRows.map((row, index) => {
            const scoreWidth = `${Math.max(8, Math.min(100, row.score))}%`;
            const rowTicks = pairQuotesRef.current[row.pair]?.length ?? row.ticks;
            const differenceText = `${row.difference >= 0 ? "+" : ""}${row.difference.toFixed(2)}`;

            return (
              <div
                key={row.pair}
                className={`rounded-[22px] border p-4 ${
                  index === 0
                    ? "border-emerald-400/20 bg-[linear-gradient(90deg,rgba(16,185,129,0.10),rgba(15,23,42,0.20))]"
                    : "border-cyan-500/20 bg-[linear-gradient(180deg,rgba(8,19,42,0.88),rgba(6,16,35,0.92))]"
                }`}
              >
                <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
                  <div className="min-w-0 flex-1">
                    <div className="flex flex-wrap items-center gap-2">
                      <span className="rounded-lg bg-white/10 px-2 py-1 text-xs font-semibold text-amber-300">
                        #{index + 1}
                      </span>
                      <div className="text-[1.1rem] font-semibold text-white">
                        {row.label}
                      </div>
                      {index === 0 && (
                        <span className="rounded-full border border-cyan-400/20 bg-cyan-500/10 px-2 py-1 text-[10px] font-semibold text-cyan-300">
                          ACTIVE
                        </span>
                      )}
                      <span className="text-xs text-white/35">↗ {rowTicks}t</span>
                    </div>

                    <div className="mt-4 grid grid-cols-2 gap-x-6 gap-y-3 text-sm lg:grid-cols-4">
                      <div>
                        <div className="text-white/40">Higher win:</div>
                        <div className="mt-1 font-semibold text-cyan-300">
                          {row.higherWinPct.toFixed(1)}%
                        </div>
                      </div>
                      <div>
                        <div className="text-white/40">Lower win:</div>
                        <div className="mt-1 font-semibold text-amber-300">
                          {row.lowerWinPct.toFixed(1)}%
                        </div>
                      </div>
                      <div>
                        <div className="text-white/40">Avg move up:</div>
                        <div className="mt-1 font-semibold text-emerald-300">
                          {row.avgMoveUp.toFixed(2)}
                        </div>
                      </div>
                      <div>
                        <div className="text-white/40">Avg move dn:</div>
                        <div className="mt-1 font-semibold text-rose-300">
                          {row.avgMoveDown.toFixed(2)}
                        </div>
                      </div>
                    </div>

                    <div className="mt-4 text-sm text-white/35">
                      Difference (Up - Down):
                    </div>

                    <div className="mt-3 flex flex-wrap items-center gap-2">
                      <div className="rounded-xl bg-emerald-500/10 px-3 py-2 text-sm font-semibold text-emerald-300">
                        ↗ H: {formatOptimizerBarrier(row.higherBarrier)}
                      </div>
                      <div className="rounded-xl bg-rose-500/10 px-3 py-2 text-sm font-semibold text-rose-300">
                        ↘ L: {formatOptimizerBarrier(row.lowerBarrier)}
                      </div>
                      <div className="rounded-xl bg-amber-500/10 px-3 py-2 text-sm font-semibold text-amber-300">
                        ⚡ Best: {row.best}
                      </div>
                    </div>

                    <div className="mt-4">
                      <div className="text-xs text-white/40">Score</div>
                      <div className="mt-2 h-2 overflow-hidden rounded-full bg-white/10">
                        <div
                          className="h-full rounded-full bg-emerald-400"
                          style={{ width: scoreWidth }}
                        />
                      </div>
                    </div>
                  </div>

                  <div className="flex shrink-0 items-center gap-4 lg:flex-col lg:items-end">
                    <div className="text-right">
                      <div className="text-3xl font-extrabold text-emerald-300">
                        {row.score}
                      </div>
                      <div className="text-[11px] uppercase tracking-[0.2em] text-white/35">
                        Score
                      </div>
                      <div
                        className={`mt-2 text-sm font-semibold ${
                          row.difference >= 0 ? "text-emerald-300" : "text-rose-300"
                        }`}
                      >
                        {differenceText}
                      </div>
                    </div>

                    <button
                      type="button"
                      onClick={() => {
  setSelectedPair(row.pair);
  setHigherBarrier(formatOffset(Math.abs(row.higherBarrier)));
  setLowerBarrier(formatOffset(-Math.abs(row.lowerBarrier)));
}}
                      className="rounded-xl bg-orange-500 px-4 py-2 text-sm font-semibold text-white transition hover:bg-orange-400"
                    >
                      Apply
                    </button>
                  </div>
                </div>
              </div>
            );
          })
        )}
      </div>

      <div className="mt-4 rounded-[20px] border border-white/10 bg-white/5 px-4 py-3 text-xs leading-6 text-white/45">
        Live mode: shows the top 4 pairs with the longest up & down movement from spot price. Barriers are set at 25% of average movement for balanced wins. Updates continuously.
      </div>
    </div>
  )}
</div>

      <div className="mt-8 rounded-[28px] border border-white/10 bg-slate-900/25 p-5 shadow-[0_0_0_1px_rgba(255,255,255,0.03)]">
  <div className="flex items-center justify-between gap-4">
    <div className="flex items-center gap-3">
      <div className="text-cyan-300 text-2xl">⌁</div>
      <div>
        <div className="text-[1.1rem] font-semibold text-white/90">
          Price Chart <span className="text-white/40 font-normal">Last 30 ticks</span>
        </div>
      </div>
    </div>

    <div className="text-right">
      <div className="text-[2rem] font-bold text-emerald-300 leading-none">
        {latestQuote.toFixed(pip)}
      </div>
      <div className="mt-2 text-[1.1rem] text-emerald-300/90">
        {chartQuotes.length > 1
          ? `${latestQuote - anchorQuote >= 0 ? "+" : ""}${(latestQuote - anchorQuote).toFixed(pip)}`
          : `+0.${"0".repeat(pip)}`}
      </div>
    </div>
  </div>

  <div className="mt-5 rounded-2xl border border-white/10 bg-slate-800/55 px-4 py-3 flex items-center justify-between gap-4">
    <div className="text-white/45 text-[1.05rem]">
      Barrier anchor: <span className="text-white/80">{anchorQuote.toFixed(pip)}</span>
    </div>
    <button
      type="button"
      onClick={() => {
        const nextValue =
          barrierMode === "offset"
            ? formatOffset(halfBarrier ? 0.06 : 0.12)
            : latestQuote.toFixed(pip);
        setHigherBarrier(nextValue);
        setLowerBarrier(nextValue);
      }}
      className="text-cyan-300 text-[1.05rem] font-semibold hover:text-cyan-200 transition"
    >
      Reset to current
    </button>
  </div>

  <div
    className={`mt-4 rounded-t-2xl border border-b-0 px-5 py-3 text-[1.05rem] font-semibold ${
      zoneLabel === "Above Higher"
        ? "border-emerald-400/30 bg-emerald-500/10 text-emerald-300"
        : zoneLabel === "Below Lower"
        ? "border-rose-400/30 bg-rose-500/10 text-rose-300"
        : "border-amber-400/30 bg-amber-500/10 text-amber-300"
    }`}
  >
    ●{" "}
    {zoneLabel === "Above Higher"
      ? `PRICE IS ABOVE YOUR HIGHER BARRIER (${higherBarrierValue.toFixed(pip)})`
      : zoneLabel === "Below Lower"
      ? `PRICE IS BELOW YOUR LOWER BARRIER (${lowerBarrierValue.toFixed(pip)})`
      : `PRICE IS BETWEEN YOUR BARRIERS (${lowerBarrierValue.toFixed(pip)} - ${higherBarrierValue.toFixed(pip)})`}
  </div>

  <div className="rounded-b-2xl border border-white/10 bg-slate-900/35 overflow-hidden">
    <div className="p-5">
      <div className="h-[300px] sm:h-[320px] lg:h-[340px] w-full rounded-2xl border border-white/5 bg-[linear-gradient(180deg,rgba(32,44,78,0.8),rgba(21,29,56,0.9))] px-3 py-4 sm:px-4">
        <svg viewBox="0 0 100 100" preserveAspectRatio="none" className="h-full w-full overflow-visible">
          <defs>
            <linearGradient id="mspiderAreaFill" x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor="rgba(255,66,99,0.18)" />
              <stop offset="100%" stopColor="rgba(255,66,99,0.02)" />
            </linearGradient>
          </defs>

          {[20, 40, 60, 80].map((y) => (
            <line
              key={`grid-${y}`}
              x1="0"
              y1={y}
              x2="100"
              y2={y}
              stroke="rgba(96,165,250,0.12)"
              strokeDasharray="2 2"
              vectorEffect="non-scaling-stroke"
            />
          ))}

          <line
            x1="0"
            y1={higherY}
            x2="100"
            y2={higherY}
            stroke="rgba(52,211,153,0.9)"
            strokeDasharray="3 2"
            vectorEffect="non-scaling-stroke"
          />
          <g>
  <rect
    x="0.8"
    y={higherLabelY - 5}
    width="22"
    height="7"
    rx="1.6"
    fill="rgba(16,185,129,0.16)"
    stroke="rgba(52,211,153,0.55)"
    strokeWidth="0.3"
    vectorEffect="non-scaling-stroke"
  />
  <text
    x="1.9"
    y={higherLabelY}
    fill="#34d399"
    fontSize="3.1"
    fontWeight="700"
  >
    HIGHER {higherBarrierValue.toFixed(pip)}
  </text>
</g>
          <line
            x1="0"
            y1={lowerY}
            x2="100"
            y2={lowerY}
            stroke="rgba(251,113,133,0.9)"
            strokeDasharray="3 2"
            vectorEffect="non-scaling-stroke"
          />
          <g>
  <rect
    x="77"
    y={lowerLabelY - 5}
    width="22"
    height="7"
    rx="1.6"
    fill="rgba(244,63,94,0.16)"
    stroke="rgba(251,113,133,0.55)"
    strokeWidth="0.3"
    vectorEffect="non-scaling-stroke"
  />
  <text
    x="78.2"
    y={lowerLabelY}
    fill="#fb7185"
    fontSize="3.1"
    fontWeight="700"
  >
    LOWER {lowerBarrierValue.toFixed(pip)}
  </text>
</g>

          {pathD && (
            <>
              <path d={`${pathD} L100,100 L0,100 Z`} fill="url(#mspiderAreaFill)" stroke="none" />
              <path
                d={pathD}
                fill="none"
                stroke="#ff4263"
                strokeWidth="0.9"
                vectorEffect="non-scaling-stroke"
              />
            </>
          )}

          {chartQuotes.length > 0 && (
  <>
    <g>
      <rect
        x="0.8"
        y={latestLabelY - 5}
        width="18"
        height="7"
        rx="1.6"
        fill="rgba(244,63,94,0.16)"
        stroke="rgba(251,113,133,0.55)"
        strokeWidth="0.3"
        vectorEffect="non-scaling-stroke"
      />
      <text
        x="1.9"
        y={latestLabelY}
        fill="#fb7185"
        fontSize="3.1"
        fontWeight="700"
      >
        {latestQuote.toFixed(pip)}
      </text>
    </g>
    <circle
      cx="100"
      cy={latestY}
      r="1.5"
      fill="#0f172a"
      stroke="#ff4263"
      strokeWidth="0.8"
      vectorEffect="non-scaling-stroke"
    />
  </>
)}
        </svg>
      </div>

      <div className="mt-4 flex flex-wrap items-center justify-between gap-3 border-t border-white/5 pt-4">
        <div className="flex flex-wrap items-center gap-6 text-[1.05rem]">
          <span className="text-white/80">
            <span className="mr-2 text-rose-300">—</span>Price
          </span>
          <span className="text-emerald-300">
            <span className="mr-2">- -</span>Higher Barrier
          </span>
          <span className="text-rose-300">
            <span className="mr-2">- -</span>Lower Barrier
          </span>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-3 gap-2 w-full lg:w-auto lg:min-w-[360px]">
          <button
            type="button"
            className={`rounded-xl border px-4 py-2.5 text-[1rem] font-semibold transition ${
              zoneLabel === "Above Higher"
                ? "border-emerald-400/40 bg-emerald-500/10 text-emerald-300"
                : "border-white/10 bg-slate-800/55 text-white/45"
            }`}
          >
            Above Higher
          </button>
          <button
            type="button"
            className={`rounded-xl border px-4 py-2.5 text-[1rem] font-semibold transition ${
              zoneLabel === "Between"
                ? "border-amber-400/40 bg-amber-500/10 text-amber-300"
                : "border-white/10 bg-slate-800/55 text-white/45"
            }`}
          >
            Between
          </button>
          <button
            type="button"
            className={`rounded-xl border px-4 py-2.5 text-[1rem] font-semibold transition ${
              zoneLabel === "Below Lower"
                ? "border-rose-400/40 bg-rose-500/10 text-rose-300"
                : "border-white/10 bg-slate-800/55 text-white/45"
            }`}
          >
            Below Lower
          </button>
        </div>
      </div>
    </div>
  </div>
</div>

<div className="mt-6 grid grid-cols-1 gap-4 md:grid-cols-2">
  <div className="rounded-[24px] border border-emerald-400/25 bg-[linear-gradient(90deg,rgba(16,185,129,0.08),rgba(15,23,42,0.25))] p-6">
    <div className="text-[1.05rem] font-medium text-emerald-300">↗ Higher</div>
    <div className="mt-4 text-[3rem] font-bold leading-none text-emerald-300">
      {higherPct.toFixed(1)}%
    </div>
    <div className="mt-3 text-[1.35rem] text-white/75">{higherCount} ticks</div>
  </div>

  <div className="rounded-[24px] border border-rose-400/25 bg-[linear-gradient(90deg,rgba(244,63,94,0.08),rgba(15,23,42,0.25))] p-6">
    <div className="text-[1.05rem] font-medium text-rose-300">↘ Lower</div>
    <div className="mt-4 text-[3rem] font-bold leading-none text-rose-300">
      {lowerPct.toFixed(1)}%
    </div>
    <div className="mt-3 text-[1.35rem] text-white/75">{lowerCount} ticks</div>
  </div>
</div>

<div className="mt-6 rounded-[24px] border border-white/10 bg-slate-900/25 p-6">
  <div className="flex items-center gap-3">
    <div className="text-cyan-300 text-2xl">⌗</div>
    <div className="text-[1.1rem] font-semibold text-white/90">Recent Moves</div>
  </div>

  <div className="mt-5 flex flex-wrap gap-3">
    {recentMoves.length ? (
      recentMoves.map((move) => (
        <div
          key={move.key}
          className={`flex h-11 min-w-[42px] items-center justify-center rounded-xl border px-3 text-[1.1rem] font-semibold ${
            move.dir === "H"
              ? "border-emerald-400/30 bg-emerald-500/10 text-emerald-300"
              : "border-rose-400/30 bg-rose-500/10 text-rose-300"
          }`}
        >
          {move.dir}
        </div>
      ))
    ) : (
      <div className="text-white/45">Waiting for price movement data...</div>
    )}
  </div>
</div>

<div className="mt-6 rounded-[24px] border border-rose-400/25 bg-[linear-gradient(90deg,rgba(244,63,94,0.08),rgba(15,23,42,0.25))] p-6">
  <div className="flex items-center justify-between gap-4">
    <div className="flex items-center gap-3">
      <div className="text-cyan-300 text-2xl">◎</div>
      <div className="text-[1.1rem] font-semibold text-white/90">Prediction</div>
    </div>
    <div className="text-[1.15rem] font-bold text-amber-300">
      {confidence.toFixed(0)}% confidence
    </div>
  </div>

  <div className="mt-5 flex items-center gap-4">
    <div
      className={`flex h-14 w-14 items-center justify-center rounded-full border text-3xl ${
        prediction === "LOWER"
          ? "border-rose-400/40 text-rose-300"
          : "border-emerald-400/40 text-emerald-300"
      }`}
    >
      {prediction === "LOWER" ? "↓" : "↑"}
    </div>

    <div>
      <div
        className={`text-[2rem] font-bold leading-none ${
          prediction === "LOWER" ? "text-rose-300" : "text-emerald-300"
        }`}
      >
        {prediction}
      </div>
      <div className="mt-2 text-[1.2rem] text-white/75">
        {prediction === "LOWER"
          ? "Next tick predicted to go lower than current"
          : "Next tick predicted to go higher than current"}
      </div>
    </div>
  </div>

  <div className="mt-6 h-3 w-full overflow-hidden rounded-full bg-slate-800/80">
    <div
      className={`h-full rounded-full ${
        prediction === "LOWER" ? "bg-rose-500" : "bg-emerald-500"
      }`}
      style={{ width: `${Math.max(12, Math.min(100, confidence))}%` }}
    />
  </div>
</div>

<div className="mt-6 grid grid-cols-1 gap-4 md:grid-cols-2">
  <button
    type="button"
    onClick={() =>
  onPlaceHigherLowerTrade({
  direction: "Higher",
  durationValue: duration,
  barrier: higherDisplay,
  customStake: stake,
})
}
    className="rounded-[22px] border border-emerald-400/30 bg-[linear-gradient(135deg,rgba(16,185,129,0.22),rgba(6,95,70,0.42))] px-6 py-5 text-left transition hover:border-emerald-300/50 hover:bg-[linear-gradient(135deg,rgba(16,185,129,0.28),rgba(6,95,70,0.5))]"
  >
    <div className="text-[1.2rem] font-bold tracking-wide text-white/80">HIGHER</div>
    <div className="mt-2 text-[1.1rem] text-white/65">Payout: ${higherPayout.toFixed(2)}</div>
    <div className="mt-1 text-[1.1rem] font-semibold text-white/75">Profit: {higherProfit >= 0 ? "+" : ""}${higherProfit.toFixed(2)}</div>
  </button>

  <button
    type="button"
    onClick={() =>
  onPlaceHigherLowerTrade({
  direction: "Lower",
  durationValue: duration,
  barrier: lowerDisplay,
  customStake: lowerStake,
})
}
    className="rounded-[22px] border border-rose-400/30 bg-[linear-gradient(135deg,rgba(244,63,94,0.22),rgba(127,29,29,0.42))] px-6 py-5 text-left transition hover:border-rose-300/50 hover:bg-[linear-gradient(135deg,rgba(244,63,94,0.28),rgba(127,29,29,0.5))]"
  >
    <div className="text-[1.2rem] font-bold tracking-wide text-white/80">LOWER</div>
    <div className="mt-2 text-[1.1rem] text-white/65">Payout: ${lowerPayout.toFixed(2)}</div>
    <div className="mt-1 text-[1.1rem] font-semibold text-white/75">Profit: {lowerProfit >= 0 ? "+" : ""}${lowerProfit.toFixed(2)}</div>
  </button>
</div>

<button
  type="button"
  onClick={() => {
  onPlaceHigherLowerTrade({
  direction: "Higher",
  durationValue: duration,
  barrier: higherDisplay,
  customStake: stake,
});

onPlaceHigherLowerTrade({
  direction: "Lower",
  durationValue: duration,
  barrier: lowerDisplay,
  customStake: lowerStake,
});
}}
  className="mt-4 w-full rounded-[22px] border border-amber-400/30 bg-[linear-gradient(135deg,rgba(251,146,60,0.22),rgba(194,65,12,0.42))] px-6 py-6 text-center transition hover:border-amber-300/50 hover:bg-[linear-gradient(135deg,rgba(251,146,60,0.28),rgba(194,65,12,0.5))]"
>
  <div className="text-[1.2rem] font-bold tracking-wide text-white/80">HIGHER & LOWER</div>
  <div className="mt-3 text-[1.15rem] text-white/60">
    Total Stake: ${combinedStake.toFixed(2)}
    <span className="mx-4 text-white/30">•</span>
    Combined Payout: ${combinedPayout.toFixed(2)}
  </div>
</button>

<div className="mt-6 rounded-[24px] border border-white/10 bg-slate-950/35 p-6">
  <div className="flex items-start justify-between gap-4">
    <div>
      <div className="text-[1.35rem] font-semibold text-white/85">Auto Trading</div>
    </div>

    <button
      type="button"
      onClick={() => setAutoTradingEnabled((v) => !v)}
      className="inline-flex items-center"
    >
      <span className={`relative h-9 w-[74px] rounded-full transition ${autoTradingEnabled ? "bg-cyan-500/35" : "bg-slate-700/80"}`}>
        <span className={`absolute top-1 h-7 w-7 rounded-full transition ${autoTradingEnabled ? "left-[38px] bg-cyan-300" : "left-1 bg-white/70"}`} />
      </span>
    </button>
  </div>

  <div className="mt-5 flex flex-wrap items-center gap-2">
    <button
      type="button"
      className="rounded-xl border border-cyan-400/35 bg-sky-500/20 px-5 py-2.5 text-[1.05rem] font-medium text-cyan-200 transition"
    >
      H&L (2)
    </button>

    <span className="ml-2 text-[1.05rem] text-white/45">Min:</span>

    {[55, 60, 65, 70, 75].map((pct) => (
      <button
        key={pct}
        type="button"
        onClick={() => setAutoTradeMinConfidence(pct)}
        className={`rounded-xl border px-4 py-2.5 text-[1.05rem] font-medium transition ${
          autoTradeMinConfidence === pct
            ? "border-cyan-400/35 bg-sky-500/20 text-cyan-200"
            : "border-white/10 bg-slate-800/55 text-white/40"
        }`}
      >
        {pct}%
      </button>
    ))}
  </div>

  <div className="mt-5 space-y-3">
  <p className="max-w-4xl text-[1.1rem] leading-9 text-white/45">
    When enabled, Auto Trading places 1 Higher and 1 Lower trade together on 5 ticks whenever prediction confidence reaches the selected threshold, then waits 30 seconds before the next round.
  </p>

  <div className="text-[1rem] text-white/55">
    Status:{" "}
    <span className={autoTradeReady ? "text-emerald-300" : "text-amber-300"}>
      {autoTradeReady
        ? `Ready to place H&L at ${autoTradeMinConfidence}%+ confidence`
        : `Waiting for ${autoTradeMinConfidence}% confidence or cooldown`}
    </span>
  </div>
</div>
</div>
      <div className="mt-6">
        <StrategyTradeHistoryTab
          title="M-Spider Trade History"
          trades={tradeHistory}
          currency={currency}
          onClearHistory={onClearHistory}
        />
      </div>
    </div>
  );
}

function StrategyRow({
  title,
  description,
  active,
  onToggle,
}: {
  title: string;
  description: string;
  active: boolean;
  onToggle: () => void;
}) {
  return (
    <div className="flex items-center justify-between mb-4">
      <div>
        <p className="font-semibold text-white/90 tracking-tight">{title}</p>
        <p className="text-xs text-gray-400">{description}</p>
      </div>

      <button
        onClick={onToggle}
        className={`w-12 h-6 rounded-full relative ${active ? "bg-green-500" : "bg-gray-600"}`}
      >
        <span
          className={`absolute top-0.5 w-5 h-5 bg-white rounded-full transition ${
            active ? "right-0.5" : "left-0.5"
          }`}
        />
      </button>
    </div>
  );
}

/* ================= Shared Strategy Trade History ================= */

function StrategyTradeHistoryTab({
  title,
  trades,
  currency,
  onClearHistory,
}: {
  title: string;
  trades: Trade[];
  currency: string;
  onClearHistory: () => void;
}) {
  const [filter, setFilter] = useState<"all" | "wins" | "losses">("all");

  const normalizedTrades = [...trades].sort((a, b) => b.createdAt - a.createdAt);
  const wins = normalizedTrades.filter((t) => t.result === "Win");
  const losses = normalizedTrades.filter((t) => t.result === "Loss");

  const filteredTrades =
    filter === "wins"
      ? wins
      : filter === "losses"
      ? losses
      : normalizedTrades;

  const totalProfit = normalizedTrades.reduce((sum, t) => {
    return sum + (typeof t.profit === "number" ? t.profit : 0);
  }, 0);

  const settledTrades = normalizedTrades.filter(
    (t) => t.result === "Win" || t.result === "Loss"
  );
  const winRate = settledTrades.length ? (wins.length / settledTrades.length) * 100 : 0;

  const getBadgeTone = (trade: Trade) => {
    if (trade.result === "Win") {
      return {
        card: "border-emerald-400/25 bg-[radial-gradient(circle_at_top,rgba(16,185,129,0.12),rgba(15,23,42,0.55)_55%,rgba(15,23,42,0.85))]",
        pill: "border-emerald-400/30 bg-emerald-500/12 text-emerald-300",
        pnl: "text-emerald-300",
        status: "text-emerald-300",
        iconWrap: "bg-emerald-500/12 text-emerald-300",
      };
    }

    if (trade.result === "Loss") {
      return {
        card: "border-rose-400/20 bg-[radial-gradient(circle_at_top,rgba(244,63,94,0.10),rgba(15,23,42,0.55)_55%,rgba(15,23,42,0.85))]",
        pill: "border-rose-400/30 bg-rose-500/12 text-rose-300",
        pnl: "text-rose-300",
        status: "text-rose-300",
        iconWrap: "bg-rose-500/12 text-rose-300",
      };
    }

    return {
      card: "border-cyan-400/20 bg-[radial-gradient(circle_at_top,rgba(34,211,238,0.10),rgba(15,23,42,0.55)_55%,rgba(15,23,42,0.85))]",
      pill: "border-amber-400/30 bg-amber-500/12 text-amber-300",
      pnl: "text-amber-300",
      status: "text-amber-300",
      iconWrap: "bg-cyan-500/12 text-cyan-300",
    };
  };

  const formatAmount = (n?: number) => {
    if (typeof n !== "number" || Number.isNaN(n)) return `0.00 ${currency}`;
    return `${n.toFixed(2)} ${currency}`;
  };

  const getDerivedPayout = (trade: Trade) => {
    if (typeof (trade as Trade & { payout?: number }).payout === "number") {
      return (trade as Trade & { payout?: number }).payout as number;
    }
    if (typeof trade.profit === "number") {
      return trade.stake + trade.profit;
    }
    return trade.stake;
  };

  return (
    <div className="mt-6 rounded-[30px] border border-cyan-500/25 bg-[radial-gradient(circle_at_top,rgba(34,211,238,0.10),rgba(15,23,42,0.75)_45%,rgba(15,23,42,0.95))] p-6 shadow-[0_0_0_1px_rgba(34,211,238,0.08)]">
      <div className="flex items-start justify-between gap-4">
        <div className="flex items-center gap-4">
          <div className="flex h-14 w-14 items-center justify-center rounded-2xl border border-cyan-400/35 bg-cyan-500/12 text-2xl text-cyan-300">
            🏆
          </div>
          <div>
            <h3 className="text-[2rem] font-bold tracking-tight text-cyan-300">Trade History</h3>
            <p className="mt-1 text-sm text-white/45">{title}</p>
          </div>
        </div>

        <button
          type="button"
          onClick={onClearHistory}
          className="flex h-14 w-14 items-center justify-center rounded-2xl border border-rose-400/30 bg-rose-500/10 text-2xl text-rose-300 transition hover:bg-rose-500/15"
          aria-label="Clear history"
        >
          🗑️
        </button>
      </div>

      <div className="mt-8 grid grid-cols-1 gap-5 md:grid-cols-2">
        <div className="rounded-[24px] border border-white/10 bg-[radial-gradient(circle_at_center,rgba(16,185,129,0.10),rgba(15,23,42,0.90)_65%)] p-6">
          <div className="text-[1.15rem] text-white/80">⚡ Net Profit/Loss</div>
          <div
            className={`mt-5 text-[3rem] font-bold leading-none ${
              totalProfit >= 0 ? "text-emerald-300" : "text-rose-300"
            }`}
          >
            {totalProfit >= 0 ? "+" : ""}
            {totalProfit.toFixed(2)} {currency}
          </div>
        </div>

        <div className="rounded-[24px] border border-white/10 bg-[radial-gradient(circle_at_center,rgba(59,130,246,0.12),rgba(15,23,42,0.90)_65%)] p-6">
          <div className="text-[1.15rem] text-white/80">◎ Win Rate</div>
          <div className="mt-5 flex items-end gap-3">
            <div className="text-[3rem] font-bold leading-none text-sky-300">
              {winRate.toFixed(1)}%
            </div>
            <div className="pb-1 text-[1.1rem] text-white/70">
              ({wins.length}/{settledTrades.length || 0})
            </div>
          </div>
        </div>
      </div>

      <div className="mt-8 grid grid-cols-1 gap-4 md:grid-cols-3">
        <button
          type="button"
          onClick={() => setFilter("all")}
          className={`rounded-[20px] border px-6 py-5 text-left text-[1.15rem] font-semibold transition ${
            filter === "all"
              ? "border-sky-400/45 bg-sky-500/18 text-cyan-200 shadow-[0_0_0_1px_rgba(56,189,248,0.25)]"
              : "border-white/10 bg-white/5 text-white/75"
          }`}
        >
          🏆 All Trades ({normalizedTrades.length})
        </button>

        <button
          type="button"
          onClick={() => setFilter("wins")}
          className={`rounded-[20px] border px-6 py-5 text-left text-[1.15rem] font-semibold transition ${
            filter === "wins"
              ? "border-emerald-400/45 bg-emerald-500/14 text-emerald-200 shadow-[0_0_0_1px_rgba(52,211,153,0.18)]"
              : "border-white/10 bg-white/5 text-white/75"
          }`}
        >
          ✓ Wins ({wins.length})
        </button>

        <button
          type="button"
          onClick={() => setFilter("losses")}
          className={`rounded-[20px] border px-6 py-5 text-left text-[1.15rem] font-semibold transition ${
            filter === "losses"
              ? "border-rose-400/45 bg-rose-500/14 text-rose-200 shadow-[0_0_0_1px_rgba(251,113,133,0.18)]"
              : "border-white/10 bg-white/5 text-white/75"
          }`}
        >
          ⊗ Losses ({losses.length})
        </button>
      </div>

      <div className="mt-8 max-h-[720px] overflow-y-auto pr-2 space-y-5">
        {filteredTrades.length === 0 ? (
          <div className="rounded-[24px] border border-white/10 bg-slate-900/35 px-6 py-12 text-center text-white/50">
            No trades found for this filter.
          </div>
        ) : (
          filteredTrades.slice(0, 20).map((trade) => {
            const tones = getBadgeTone(trade);
            const payout = getDerivedPayout(trade);
            const entryLabel =
              trade.type === "Matches" ||
              trade.type === "Differs" ||
              trade.type === "Over" ||
              trade.type === "Under"
                ? `${trade.type.toUpperCase()} ${trade.digit}`
                : trade.type.toUpperCase();

            return (
              <div
                key={trade.id}
                className={`rounded-[26px] border p-6 shadow-[0_0_0_1px_rgba(255,255,255,0.03)] ${tones.card}`}
              >
                <div className="flex flex-col gap-5 lg:flex-row lg:items-start lg:justify-between">
                  <div className="min-w-0">
                    <div className="flex flex-wrap items-center gap-3">
                      <div
                        className={`flex h-12 w-12 items-center justify-center rounded-2xl ${tones.iconWrap}`}
                      >
                        ↗
                      </div>
                      <div className="text-[2rem] font-bold leading-none text-white">
                        {trade.symbol}
                      </div>
                      <span
                        className={`rounded-full border px-4 py-1.5 text-sm font-bold uppercase tracking-wide ${tones.pill}`}
                      >
                        {trade.result === "Pending" ? "Pending" : trade.result}
                      </span>
                    </div>

                    <div className="mt-4 flex flex-wrap items-center gap-3 text-[1.1rem]">
                      <span className="font-semibold text-cyan-300">{trade.source ?? title}</span>
                      <span className="rounded-full border border-sky-400/30 bg-sky-500/12 px-4 py-1 text-sky-300">
                        {trade.durationTicks} ticks
                      </span>
                      <span className="rounded-lg border border-violet-400/30 bg-violet-500/12 px-4 py-1 text-violet-300">
                        {entryLabel}
                      </span>
                    </div>
                  </div>

                  <div className="text-left lg:text-right">
                    <div className={`text-[2.2rem] font-bold ${tones.pnl}`}>
                      {typeof trade.profit === "number"
                        ? `${trade.profit >= 0 ? "+" : ""}${trade.profit.toFixed(2)} ${currency}`
                        : "—"}
                    </div>
                    <div className="mt-2 text-[1.15rem] text-white/70">
                      Stake:{" "}
                      <span className="font-semibold text-white/85">
                        {formatAmount(trade.stake)}
                      </span>
                    </div>
                    <div className="mt-1 text-[1.15rem] text-white/45">
                      Payout:{" "}
                      <span className="font-semibold text-white/65">
                        {formatAmount(payout)}
                      </span>
                    </div>
                  </div>
                </div>

                <div className="mt-5 border-t border-white/10 pt-5">
                  <div className="grid grid-cols-1 gap-y-4 text-[1.1rem] md:grid-cols-[160px_1fr] md:gap-x-6">
                    <div className="text-white/75">Time</div>
                    <div className="text-white/85 md:text-right">
                      {new Date(trade.createdAt).toLocaleString()}
                    </div>

                    <div className="text-white/75">Entry</div>
                    <div className="md:text-right">
                      <span className="inline-flex rounded-lg border border-violet-400/30 bg-violet-500/12 px-4 py-2 font-semibold tracking-wide text-violet-300">
                        {entryLabel}
                      </span>
                    </div>

                    <div className="text-white/75">Exit Digit</div>
                    <div className="md:text-right">
                      <span className="inline-flex min-w-[48px] items-center justify-center rounded-lg border border-emerald-400/25 bg-emerald-500/12 px-4 py-2 text-[1.8rem] font-bold text-emerald-300">
                        {typeof trade.settlementDigit === "number" ? trade.settlementDigit : "—"}
                      </span>
                    </div>

                    <div className="text-white/75">Payout</div>
                    <div className="font-semibold text-white/85 md:text-right">
                      {formatAmount(payout)}
                    </div>
                  </div>
                </div>

                <div className="mt-5 border-t border-white/10 pt-5 flex items-center justify-between gap-4">
                  <div className="text-white/75">Status</div>
                  <div className={`text-[1.15rem] font-semibold ${tones.status}`}>
                    {trade.result === "Win"
                      ? "◌ Completed - Won"
                      : trade.result === "Loss"
                      ? "◌ Completed - Lost"
                      : "◌ Pending"}
                  </div>
                </div>
              </div>
            );
          })
        )}
      </div>
    </div>
  );
}

/* ================= Rise/Fall PANEL ================= */

function RiseFallPanel({
  selectedPair,
  availablePairs,
  setSelectedPair,
  stake,
  setStake,
  rfTickDuration,
  setRfTickDuration,
  rfAllowEquals,
  setRfAllowEquals,
  onPlaceTrade,
  onPlaceDoubleTrade,
  currency,
  tradeHistory,
  onClearHistory,
  pairQuotesRef,
}: {
  selectedPair: Pair;
  availablePairs: readonly Pair[];
setSelectedPair: (p: Pair) => void;
stake: number;
setStake: (n: number) => void;
rfTickDuration: number;
setRfTickDuration: (n: number) => void;
rfAllowEquals: boolean;
setRfAllowEquals: React.Dispatch<React.SetStateAction<boolean>>;
    onPlaceTrade: (type: "Rise" | "Fall", duration: number) => void;
  onPlaceDoubleTrade: (duration: number) => void;
  currency: string;
  tradeHistory: Trade[];
  onClearHistory: () => void;
  pairQuotesRef: React.MutableRefObject<Record<Pair, number[]>>
}) {
  const quotes = pairQuotesRef.current[selectedPair] ?? [];
  const last20Quotes = quotes.slice(-20);
  const last12Quotes = quotes.slice(-12);
  const last6Quotes = quotes.slice(-6);

  const latestQuote = last20Quotes.length ? last20Quotes[last20Quotes.length - 1] : null;
  const first20 = last20Quotes.length ? last20Quotes[0] : null;
  const first12 = last12Quotes.length ? last12Quotes[0] : null;
  const first6 = last6Quotes.length ? last6Quotes[0] : null;

  const longMove = latestQuote !== null && first20 !== null ? latestQuote - first20 : 0;
  const mediumMove = latestQuote !== null && first12 !== null ? latestQuote - first12 : 0;
  const shortMove = latestQuote !== null && first6 !== null ? latestQuote - first6 : 0;

  const tickMoves = last12Quotes.slice(1).map((q, i) => q - last12Quotes[i]);
  const upTicks = tickMoves.filter((m) => m > 0).length;
  const downTicks = tickMoves.filter((m) => m < 0).length;
  const flatTicks = tickMoves.filter((m) => m === 0).length;

  const avgMove = tickMoves.length
    ? tickMoves.reduce((sum, move) => sum + move, 0) / tickMoves.length
    : 0;

  const trendDirection =
    shortMove > 0 && mediumMove > 0 && longMove > 0 && upTicks >= Math.max(4, downTicks + 2)
      ? "UPTREND"
      : shortMove < 0 && mediumMove < 0 && longMove < 0 && downTicks >= Math.max(4, upTicks + 2)
      ? "DOWNTREND"
      : "SIDEWAYS";

  const trendStrength =
    trendDirection === "UPTREND" || trendDirection === "DOWNTREND"
      ? Math.abs(shortMove) + Math.abs(mediumMove) + Math.abs(longMove)
      : 0;

  const recommendedTrade: "Rise" | "Fall" | null =
    trendDirection === "UPTREND"
      ? "Rise"
      : trendDirection === "DOWNTREND"
      ? "Fall"
      : null;

  const riseFallTrades = tradeHistory.filter((t) => t.type === "Rise" || t.type === "Fall");

  const tickBadges = last12Quotes.slice(-8).map((q, i, arr) => {
    const prev = i === 0 ? null : arr[i - 1];
    const move = prev === null ? 0 : q - prev;
    const tone =
      move > 0
        ? "text-emerald-300 border-emerald-500/30"
        : move < 0
        ? "text-red-300 border-red-500/30"
        : "text-white/60 border-white/10";
    const arrow = move > 0 ? "↑" : move < 0 ? "↓" : "→";
    return { value: q, arrow, tone };
  });
  

  return (
    <div className="rounded-2xl border border-white/10 overflow-hidden shadow-[0_0_0_1px_rgba(255,255,255,0.06)]">
      <div className="bg-gradient-to-br from-[#1b2235]/95 to-[#121826] p-6">
        <div className="flex items-start justify-between gap-3">
          <div>
            <p className="text-lg font-semibold text-white/90">Rise/Fall</p>
            <p className="text-xs text-white/60 mt-1">
              Smart trend mode: reads live ticks for the selected pair and auto-decides Rise or Fall
            </p>
          </div>
        </div>

        <div className="mt-5 grid grid-cols-1 md:grid-cols-2 gap-4">
          <div className="bg-black/30 rounded-xl p-4 border border-white/10">
            <p className="text-[11px] text-white/60 uppercase tracking-wide">Index</p>
            <select
              className="mt-2 w-full bg-black/40 px-3 py-2 rounded-md border border-white/10"
              value={selectedPair}
              onChange={(e) => setSelectedPair(e.target.value as Pair)}
            >
              {availablePairs.map((p) => (
                <option key={p} value={p}>
                  {p}
                </option>
              ))}
            </select>
          </div>

          <div className="bg-black/30 rounded-xl p-4 border border-white/10">
            <p className="text-[11px] text-white/60 uppercase tracking-wide">Stake</p>
            <div className="mt-2 flex items-center gap-2">
              <input
                type="number"
                min={0}
                step={0.01}
                className="w-full bg-black/40 px-3 py-2 rounded-md border border-white/10"
                value={stake}
                onChange={(e) => setStake(Number(e.target.value))}
              />
              <span className="text-xs text-white/60">{currency}</span>
            </div>
          </div>

          <div className="bg-black/30 rounded-xl p-4 border border-white/10">
            <p className="text-[11px] text-white/60 uppercase tracking-wide">Duration (ticks)</p>
            <input
              type="number"
              min={1}
              step={1}
              className="mt-2 w-full bg-black/40 px-3 py-2 rounded-md border border-white/10"
              value={rfTickDuration}
              onChange={(e) => setRfTickDuration(Math.max(1, Number(e.target.value) || 1))}
            />
            <p className="text-[11px] text-white/50 mt-2">Tip: use 3–10 ticks and wait for a clear trend before entering.</p>
            <div className="bg-black/30 rounded-xl p-4 border border-white/10">
  <p className="text-[11px] text-white/60 uppercase tracking-wide">Allow Equals</p>

  <label className="mt-3 flex items-center justify-between gap-3 cursor-pointer">
    <div>
      <p className="text-sm font-semibold text-white/85">Allow Equals</p>
      <p className="text-[11px] text-white/50 mt-1">
        When enabled, equal exit/entry spots count as a win for Rise and Fall trades.
      </p>
    </div>

    <button
      type="button"
      aria-pressed={rfAllowEquals}
      onClick={() => setRfAllowEquals((v) => !v)}
      className={`w-12 h-6 rounded-full relative transition ${
        rfAllowEquals ? "bg-emerald-500" : "bg-white/15"
      }`}
    >
      <span
        className={`absolute top-0.5 w-5 h-5 bg-white rounded-full transition ${
          rfAllowEquals ? "right-0.5" : "left-0.5"
        }`}
      />
    </button>
  </label>

  <p className="text-[11px] text-sky-300 mt-3">
    Current mode: {rfAllowEquals ? "ON — Allow Equals active" : "OFF — strict Rise/Fall only"}
  </p>
</div>
          </div>

          <div className="bg-black/30 rounded-xl p-4 border border-white/10">
            <p className="text-[11px] text-white/60 uppercase tracking-wide">Trend engine</p>
            <div className="mt-2 space-y-2 text-xs text-white/75">
              <p>
                Current quote: <span className="font-semibold text-white/90">{latestQuote !== null ? latestQuote : "Waiting for ticks..."}</span>
              </p>
              <p>
                Trend:{" "}
                <span
                  className={`font-semibold ${
                    trendDirection === "UPTREND"
                      ? "text-emerald-300"
                      : trendDirection === "DOWNTREND"
                      ? "text-red-300"
                      : "text-yellow-200"
                  }`}
                >
                  {trendDirection}
                </span>
              </p>
              <p>
                Auto decision: <span className="font-semibold text-sky-300">{recommendedTrade ?? "WAIT / NO TRADE"}</span>
              </p>
              <p>
                Up ticks: <span className="text-emerald-300">{upTicks}</span> • Down ticks: <span className="text-red-300">{downTicks}</span> • Flat: <span className="text-white/60">{flatTicks}</span>
              </p>
              <p>
                Move 6/12/20: <span className="text-white/90">{shortMove.toFixed(4)} / {mediumMove.toFixed(4)} / {longMove.toFixed(4)}</span>
              </p>
              <p>
                Avg tick move: <span className="text-white/90">{avgMove.toFixed(5)}</span> • Strength: <span className="text-white/90">{trendStrength.toFixed(4)}</span>
              </p>
            </div>
          </div>
        </div>

        <div className="mt-5 bg-black/20 border border-white/10 rounded-xl p-4">
          <div className="flex items-center justify-between gap-3">
            <div>
              <p className="text-sm font-semibold text-white/85">Live tick tape</p>
              <p className="text-[11px] text-white/50 mt-1">Last 8 quotes for the selected pair</p>
            </div>
            <span className="text-[11px] text-white/60">{selectedPair}</span>
          </div>

          <div className="mt-3 flex flex-wrap gap-2">
            {tickBadges.length === 0 ? (
              <p className="text-[11px] text-white/55">Collecting live quotes...</p>
            ) : (
              tickBadges.map((item, idx) => (
                <div
                  key={`${item.value}-${idx}`}
                  className={`px-3 py-2 rounded-lg border bg-black/30 text-[11px] ${item.tone}`}
                >
                  {item.arrow} {item.value}
                </div>
              ))
            )}
          </div>
        </div>

        <div className="mt-5 bg-black/20 border border-white/10 rounded-xl p-4">
          <p className="text-[11px] text-white/60 uppercase tracking-wide">Trade actions</p>
          <div className="mt-3 grid grid-cols-1 md:grid-cols-2 xl:grid-cols-4 gap-2">
  <button
    onClick={() => recommendedTrade && onPlaceTrade(recommendedTrade, rfTickDuration)}
    disabled={!recommendedTrade}
    className={`text-sm font-semibold px-4 py-2 rounded-md ${
      recommendedTrade
        ? "bg-sky-500/90 hover:bg-sky-500 text-white"
        : "bg-white/10 text-white/40 cursor-not-allowed"
    }`}
  >
    Auto trade: {recommendedTrade ?? "Waiting..."}
  </button>

  <button
    onClick={() => onPlaceTrade("Rise", rfTickDuration)}
    className="bg-emerald-500/90 hover:bg-emerald-500 text-sm font-semibold px-4 py-2 rounded-md"
  >
    Manual Rise (CALL)
  </button>

  <button
    onClick={() => onPlaceTrade("Fall", rfTickDuration)}
    className="bg-red-500/90 hover:bg-red-500 text-sm font-semibold px-4 py-2 rounded-md"
  >
    Manual Fall (PUT)
  </button>

  <button
    onClick={() => onPlaceDoubleTrade(rfTickDuration)}
    className="bg-violet-500/90 hover:bg-violet-500 text-sm font-semibold px-4 py-2 rounded-md"
  >
    Double Entry (Rise + Fall)
  </button>
</div>
          <p className="text-[11px] text-white/50 mt-2">
  Auto follows the live trend engine. Double Entry places both Rise and Fall at the same time using the same pair, stake, and tick duration. Allow Equals applies to Auto, Manual Rise, Manual Fall, and Double Entry.
</p>
        </div>

        <StrategyTradeHistoryTab
          title="Rise/Fall Trade History"
          trades={tradeHistory}
          currency={currency}
          onClearHistory={onClearHistory}
        />
      </div>
    </div>
  );
}

/* ================= MetroX PANEL ================= */

function MetroXPanel({
  
  ticks,
  pipSize,
  stake,
  setStake,
  selectedDigit,
  setSelectedDigit,
  selectedPair,
  setSelectedPair,
  mdTradeType,
  setMdTradeType,
  mdTickDuration,
  setMdTickDuration,
  onPlaceMetroX,
  on3xSelectedDigit,
  placeTradeFor,
  instant3xRunning,
  turboMode,
  setTurboMode,
  onToggle5x,
  auto5xRunning,
  analysisStatus,
  analysisOpen,
  setAnalysisOpen,
  lastWinDigit,
  lastLossDigit,
  pairMeta,
  tradeHistory,
  onClearHistory,
  currency,
  run1xAutoAllPairs,
  auto1xRunning,
  onToggleFastAuto,
  fastAutoRunning,
  uiFlags,
  isAdmin,
    onToggleMetro,
  metroRunning,
}: {
  ticks: number[];
  pipSize: number;


  stake: number;
  setStake: (n: number) => void;

  selectedDigit: number | null;
  setSelectedDigit: (d: number | null) => void;

  selectedPair: Pair;
  setSelectedPair: (p: Pair) => void;

  mdTradeType: "Differs" | "Matches";
  setMdTradeType: (t: "Differs" | "Matches") => void;

  mdTickDuration: number;
  setMdTickDuration: (n: number) => void;

  onPlaceMetroX: () => void;
  on3xSelectedDigit: () => void;
    placeTradeFor: any;
  instant3xRunning: boolean;

  turboMode: boolean;
  setTurboMode: (v: boolean) => void;

  onToggle5x: () => void;
  auto5xRunning: boolean;

  analysisStatus: string;

  analysisOpen: boolean;
  setAnalysisOpen: (v: boolean) => void;

  lastWinDigit: number | null;
  lastLossDigit: number | null;

  pairMeta: Record<Pair, { count: number; lowDigit?: number; lowPct?: number }>;

  tradeHistory: Trade[];
  onClearHistory: () => void;

    onToggleMetro: () => void;
  metroRunning: boolean;

  currency: string;

  // ✅ NEW PROPS (Fast Auto + 1x Auto)
  run1xAutoAllPairs: () => void;
  auto1xRunning: boolean;
  onToggleFastAuto: () => void;
  fastAutoRunning: boolean;
    uiFlags: UIFlags;
  isAdmin: boolean;
    // ✅ NEW SpiderX Random Auto
 
}) {
  // ✅ use full tick list for % display
  const digitPercent = (d: number) => {
    if (!ticks.length) return 0;
    return (ticks.filter((x) => x === d).length / ticks.length) * 100;
  };
  const [edshellCount, setEdshellCount] = useState<1 | 3 | 5>(1);
const [edshellScope, setEdshellScope] = useState<"current" | "scan">("current");
// ✅ Digit preview for EDSHELL (Current Index only)
const edshellPreviewDigit =
  edshellScope === "current" && pairMeta[selectedPair]?.count >= 20
    ? (pairMeta[selectedPair]?.lowDigit ?? null)
    : null;
const [metroXPressed, setMetroXPressed] = useState(false);
const [edshellPlacing, setEdshellPlacing] = useState(false);
const [edshellPlaced, setEdshellPlaced] = useState(false);
const canShow = (key: keyof UIFlags) => isAdmin || uiFlags[key] !== false;

  // ✅ “high appearance” threshold (avg ~10%)
  const HIGH_PCT_THRESHOLD = 13.0;

  const last20 = ticks.slice(-20);
  const counts = useMemo(() => {
    const c = Array.from({ length: 10 }, () => 0);
    for (const x of last20) c[x] = (c[x] ?? 0) + 1;
    return c;
  }, [last20]);

  const lastDigit = ticks.length ? ticks[ticks.length - 1] : null;

  /* ================= Intelligent DIFFERS ================= */
  const [intelligentOn, setIntelligentOn] = useState(false);
  const [intelligentStartLen, setIntelligentStartLen] = useState(0);

  useEffect(() => {
    setIntelligentStartLen(ticks.length);
  }, [selectedPair]);

  useEffect(() => {
    if (intelligentOn) setIntelligentStartLen(ticks.length);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [intelligentOn]);

  const intelligentDigits = useMemo(() => {
    const start = Math.min(intelligentStartLen, ticks.length);
    return ticks.slice(start);
  }, [ticks, intelligentStartLen]);

  const intelligentTotal = intelligentDigits.length;

  const intelligentRecent = useMemo(() => {
    const last = intelligentDigits.slice(-15);
    return last.join(" ");
  }, [intelligentDigits]);

  const intelligentLeast = useMemo(() => {
    if (intelligentTotal < 20) return null;

    const freq = Array.from({ length: 10 }, () => 0);
    for (const d of intelligentDigits) freq[d] = (freq[d] ?? 0) + 1;

    let bestDigit = 0;
    let bestCount = Infinity;
    for (let d = 0; d <= 9; d++) {
      if (freq[d] < bestCount) {
        bestCount = freq[d];
        bestDigit = d;
      }
    }
    return bestDigit;
  }, [intelligentDigits, intelligentTotal]);
  /* ================= END Intelligent DIFFERS ================= */

  return (
    <div className="bg-gradient-to-br from-[#1b2235]/95 to-[#121826]/95 p-6 min-h-[520px]">
      {/* TOP CONTROLS */}
      <div className="grid grid-cols-2 gap-3 mb-4">
        <div>
          <p className="text-[11px] text-white/60 mb-1">Select Index</p>
          <select
  className="w-full bg-[#0e1422] border border-white/10 p-2 rounded-md text-sm"
  value={selectedPair}
  onChange={(e) => setSelectedPair(e.target.value as Pair)}
>

  <optgroup label="Volatility Indices">
    {INDEX_GROUPS.volatility.map((s) => (
      <option key={s.code} value={s.code}>
        {s.label}
      </option>
    ))}
  </optgroup>

  <optgroup label="Jump Indices">
    {INDEX_GROUPS.jump.map((s) => (
      <option key={s.code} value={s.code}>
        {s.label}
      </option>
    ))}
  </optgroup>
</select>
        </div>

        <div>
          <p className="text-[11px] text-white/60 mb-1">Strategy</p>
          <select className="w-full bg-[#0e1422] border border-white/10 p-2 rounded-md text-sm">
            <option>MetroX</option>
          </select>
        </div>
      </div>

      {/* STAKE */}
      <div className="mb-4">
        <p className="text-[11px] text-white/60 mb-1">Stake Amount</p>
        <div className="flex gap-2">
          <input
            type="number"
            step="0.1"
            min="0.1"
            value={stake}
            onChange={(e) => setStake(Number(e.target.value))}
            className="w-full bg-[#0e1422] border border-white/10 p-2 rounded-md text-sm"
          />
          <button
            onClick={() => setStake(1)}
            className="px-3 rounded-md bg-white/5 border border-white/10 text-sm hover:bg-white/10"
          >
            $1
          </button>
          <button
            onClick={() => setStake(5)}
            className="px-3 rounded-md bg-white/5 border border-white/10 text-sm hover:bg-white/10"
          >
            $5
          </button>
          <button
            onClick={() => setStake(10)}
            className="px-3 rounded-md bg-white/5 border border-white/10 text-sm hover:bg-white/10"
          >
            $10
          </button>
        </div>
      </div>

      {/* Trade type + duration */}
      <div className="bg-white/5 border border-white/10 rounded-xl p-3 mb-3">
        <div className="grid grid-cols-2 gap-3">
          <div>
            <p className="text-[11px] text-white/60 mb-1">Trade Type</p>
            <select
              value={mdTradeType}
              onChange={(e) => setMdTradeType(e.target.value as "Differs" | "Matches")}
              className="w-full bg-[#0e1422] border border-white/10 p-2 rounded-md text-sm"
            >
              <option value="Differs">DIFFERS</option>
              <option value="Matches">MATCHES</option>
            </select>
          </div>

          <div>
            <p className="text-[11px] text-white/60 mb-1">Tick Duration</p>
            <select
              value={mdTickDuration}
              onChange={(e) => setMdTickDuration(Number(e.target.value))}
              className="w-full bg-[#0e1422] border border-white/10 p-2 rounded-md text-sm"
            >
              {Array.from({ length: 10 }, (_, i) => i + 1).map((n) => (
                <option key={n} value={n}>
                  {n} Tick{n > 1 ? "s" : ""}
                </option>
              ))}
            </select>
          </div>
        </div>
      </div>

      {/* Intelligent DIFFERS TAB */}
      <div className="bg-gradient-to-r from-[#1b2a49]/70 to-[#1a2340]/70 border border-white/10 rounded-xl p-4 mb-3">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <span className="text-yellow-300">💡</span>
            <p className="text-sm font-semibold text-yellow-200">Intelligent DIFFERS</p>
          </div>

          <button
            onClick={() => setIntelligentOn(!intelligentOn)}
            className={`px-4 py-1 rounded-lg text-xs font-semibold border transition ${
              intelligentOn
                ? "bg-emerald-600/25 border-emerald-500/40 text-emerald-200"
                : "bg-white/10 border-white/15 text-white/70"
            }`}
          >
            {intelligentOn ? "ON" : "OFF"}
          </button>
        </div>

        {intelligentOn && (
          <div className="mt-3 rounded-lg bg-black/20 border border-white/10 p-4">
            <p className="text-xs text-white/60">
              Recent Ticks (Analyzing <span className="font-semibold text-white/80">{intelligentTotal}</span> total):
            </p>

            <div className="mt-2 text-sm tracking-widest text-emerald-300 font-semibold">
              {intelligentRecent || "—"}
            </div>

            {intelligentTotal < 20 ? (
              <div className="mt-3 text-sm font-semibold text-yellow-200">WAIT FOR 20 TICKS ({intelligentTotal}/20)</div>
            ) : (
              <div className="mt-4 text-center">
                <div className="text-xs text-white/60 flex items-center justify-center gap-2">
                  <span>🧠</span>
                  <span>Least Frequent Digit</span>
                </div>
                <div className="mt-2 text-5xl font-extrabold text-yellow-200 leading-none">{intelligentLeast ?? "—"}</div>
                <div className="mt-2 text-xs text-white/70">
                  ⚡ Best digit to trade <span className="font-semibold text-yellow-200">DIFFERS</span>
                </div>
              </div>
            )}
          </div>
        )}
      </div>

      {/* DIGITS */}
      <div className="mt-2">
        <p className="text-sm text-white/80 mb-2">
          Last digit prediction - Click any digit to select for <span className="font-semibold">{mdTradeType.toUpperCase()}</span> trade
        </p>

        <div className="grid grid-cols-5 gap-3">
          {Array.from({ length: 10 }, (_, d) => {
            const selected = selectedDigit === d;

            // ✅ flash result digits
            const won = lastWinDigit === d;
            const lost = lastLossDigit === d;

            // ✅ “Deriv market selecting” = live last digit
            const live = lastDigit === d;

            // ✅ “high appearance” digit = high percentage
            const pct = digitPercent(d);
            const high = ticks.length >= 20 && pct >= HIGH_PCT_THRESHOLD;

            // Priority: selected (blue) > won (green 💰) > lost (red ❌) > live (green) > high (red) > base
            const base = "bg-[#0e1422] border-white/10 text-white/90 hover:bg-white/5";
            const selectedCls = "bg-blue-600/90 border-blue-400 text-white";
            const wonCls = "bg-emerald-600/35 border-emerald-400 text-white";
            const lostCls = "bg-red-600/35 border-red-400 text-white";
            const liveCls = "bg-emerald-600/20 border-emerald-500/30 text-white";
            const highCls = "bg-red-600/20 border-red-500/35 text-white";

            const cls = selected ? selectedCls : won ? wonCls : lost ? lostCls : live ? liveCls : high ? highCls : base;

            return (
              <button
                key={d}
                onClick={() => setSelectedDigit(d)}
                className={`relative rounded-full py-3 sm:py-4 text-center border transition ${cls}`}
              >
                {selected && <span className="absolute top-2 right-3 text-white text-sm">✓</span>}
                {!selected && won && <span className="absolute top-2 right-3 text-emerald-100 text-sm">💰</span>}
                {!selected && !won && lost && <span className="absolute top-2 right-3 text-red-100 text-sm">❌</span>}
                {!selected && !won && !lost && live && <span className="absolute top-2 right-3 text-emerald-200 text-sm">●</span>}
                {!selected && !won && !lost && !live && high && <span className="absolute top-2 right-3 text-red-200 text-sm">▲</span>}

                <div className="text-lg font-bold leading-none">{d}</div>
                <div className="mt-1 text-[11px] text-white/60">{pct.toFixed(1)}%</div>
              </button>
            );
          })}
        </div>

        <p className="text-xs text-white/50 mt-3">
          Based on {ticks.length} ticks from <span className="font-semibold">{selectedPair}</span>• Last Digit:{" "}
         <span className="text-green-400 font-extrabold text-4xl leading-none drop-shadow-[0_0_12px_rgba(34,197,94,0.9)]">
  {lastDigit !== null ? lastDigit : "-"}
</span>
        </p>

        {/* Collapsible analysis box */}
        <div className="mt-3 rounded-lg border border-white/10 bg-white/5 overflow-hidden">
          <button
            onClick={() => setAnalysisOpen(!analysisOpen)}
            className="w-full flex items-center justify-between px-3 py-2 text-xs text-white/80 hover:bg-white/5"
          >
            <span className="font-semibold">Tick Count Analysis — {selectedPair}</span>
            <span className="text-white/60">{analysisOpen ? "▾" : "▸"}</span>
          </button>

          {analysisOpen && (
            <div className="px-3 pb-3">
              <div className="flex items-center justify-between mt-1">
                <p className="text-[11px] text-white/60">last 20 ticks</p>
                <p className="text-[11px] text-white/60">
                  {last20.length}/20 • pip_size: {pipSize}
                </p>
              </div>

              {last20.length < 20 ? (
                <p className="text-[11px] text-white/60 mt-2">Collecting ticks…</p>
              ) : (
                <div className="mt-2 grid grid-cols-5 gap-2 text-[11px] text-white/70">
                  {Array.from({ length: 10 }, (_, d) => {
                    const pct20 = (counts[d] / last20.length) * 100;
                    return (
                      <div key={d} className="rounded-md border border-white/10 bg-black/10 px-2 py-2 text-center">
                        <div className="font-semibold">{d}</div>
                        <div>{counts[d]} / 20</div>
                        <div className="text-white/55">{pct20.toFixed(1)}%</div>
                      </div>
                    );
                  })}
                </div>
              )}

              <div className="mt-3 border-t border-white/10 pt-3">
                <p className="text-[11px] text-white/60 mb-2">Per-pair cache status (used by 5x AutoTrading)</p>
                <div className="grid grid-cols-1 gap-1 text-[11px] text-white/70">
                 {PAIRS.map((p) => {
  const m = pairMeta[p];
  const has20 = m.count >= 20;

  const label =
  INDEX_GROUPS.volatility.find(x => x.code === p)?.label ||
  p;

  return (
    <div
      key={p}
      className="flex items-center justify-between rounded-md border border-white/10 bg-black/10 px-2 py-2"
    >
      <span className="font-semibold">{label}</span>

      <span className="text-white/60">
        {m.count} cached •{" "}
        {has20 && m.lowDigit !== undefined && m.lowPct !== undefined
          ? `lowest: ${m.lowDigit} (${m.lowPct.toFixed(1)}%)`
          : "waiting for 20 ticks..."}
      </span>
    </div>
  );
})}
                </div>
              </div>
            </div>
          )}
        </div>
      </div>

      {/* ACTION BUTTONS */}
<div className="mt-5 space-y-6">
  {/* ✅ Place MetroX Trade */}
  {canShow("metro_place_trade") && (
    <button
      onClick={() => {
        if (selectedDigit === null) return alert("Select a digit first");

        setMetroXPressed(true);
        setTimeout(() => setMetroXPressed(false), 1000);

        onPlaceMetroX();
      }}
      className={`w-full rounded-md py-4 text-sm font-semibold shadow-[0_0_0_1px_rgba(255,255,255,0.10)] transition active:scale-[0.98]
        ${
          metroXPressed
            ? "bg-emerald-500 ring-2 ring-emerald-300 shadow-[0_0_25px_rgba(16,185,129,0.6)]"
            : "bg-emerald-600 hover:bg-emerald-700 active:brightness-110"
        }`}
    >
      {metroXPressed ? "✅ Placing Trade" : "⚡ Place MetroX Trade"}
    </button>
  )}

  {/* ✅ EDSHELL */}
  {canShow("metro_edshell") && (
    <div className="space-y-2">
      <button
  disabled={edshellPlacing}
  onClick={async () => {
    if (edshellPlacing) return;

    // basic validation
    if (!stake || stake <= 0) return alert("Enter a stake amount first.");
    if (mdTickDuration < 1) return alert("Tick Duration must be at least 1.");

    setEdshellPlaced(false);
    setEdshellPlacing(true);

    try {
      let pickPair: Pair | null = null;
      let pickDigit: number | null = null;
      let pickPct: number | null = null;

      // ---------- CURRENT INDEX ----------
      if (edshellScope === "current") {
        const m = pairMeta[selectedPair];

        if (!m || m.count < 20) {
          alert("EDSHELL needs at least 20 cached ticks on the current index.");
          return;
        }
        if (typeof m.lowDigit !== "number" || typeof m.lowPct !== "number") {
          alert("EDSHELL signal not ready yet (missing lowDigit/lowPct).");
          return;
        }

        pickPair = selectedPair;
        pickDigit = m.lowDigit;
        pickPct = m.lowPct;
      }

      // ---------- SCAN ALL ----------
      if (edshellScope === "scan") {
        let bestPair: Pair | null = null;
        let bestPct = Infinity;

        for (const p of PAIRS) {
          const m = pairMeta[p];
          if (!m || m.count < 20) continue;
          if (typeof m.lowPct !== "number") continue;

          if (m.lowPct < bestPct) {
            bestPct = m.lowPct;
            bestPair = p;
          }
        }

        if (!bestPair) {
          alert("Scan All needs at least 20 cached ticks on some pairs.");
          return;
        }

        // ✅ HARD RULE: only trade if best pair <= 2.0%
        if (bestPct > 2.0) {
          alert(
            `No trade: best pair is ${bestPair} at ${bestPct.toFixed(1)}% (needs ≤ 2.0%).`
          );
          return;
        }

        const bm = pairMeta[bestPair];
        if (!bm || typeof bm.lowDigit !== "number" || typeof bm.lowPct !== "number") {
          alert("Scan All best pair signal not ready yet.");
          return;
        }

        pickPair = bestPair;
        pickDigit = bm.lowDigit;
        pickPct = bm.lowPct;
      }

      if (pickPair === null || pickDigit === null) {
        alert("EDSHELL could not select a pair/digit.");
        return;
      }

      await placeTradeFor({
        symbol: pickPair,
        digit: pickDigit,
        type: "Differs",
        durationTicks: mdTickDuration,
        count: edshellCount,
      });

      setEdshellPlaced(true);
      setTimeout(() => setEdshellPlaced(false), 1200);
    } finally {
      setEdshellPlacing(false);
    }
  }}
  className={`relative w-full rounded-md py-4 text-sm font-extrabold tracking-wide border
    shadow-[0_0_0_1px_rgba(255,255,255,0.10)] transition active:scale-[0.98]
    ${
      edshellPlacing
        ? "cursor-not-allowed bg-yellow-400/60 text-black border-yellow-200/60 animate-pulse"
        : edshellPlaced
        ? "bg-emerald-500 text-white border-emerald-300 shadow-[0_0_25px_rgba(16,185,129,0.6)]"
        : "bg-yellow-400 text-black border-yellow-200 hover:bg-yellow-300 shadow-[0_0_22px_rgba(250,204,21,0.55)]"
    }`}
>
  <span>
    {edshellPlacing ? "🧠 PLACING..." : edshellPlaced ? "✅ DONE" : "🧠 EDSHELL"}
  </span>

  {edshellScope === "current" && (
    <span
      className={`absolute right-4 top-1/2 -translate-y-1/2 px-3 py-1 rounded-full text-sm font-extrabold
        border border-black/20 bg-black/25
        ${
          edshellPreviewDigit !== null
            ? "text-white drop-shadow-[0_0_12px_rgba(255,255,255,0.85)] shadow-[0_0_18px_rgba(250,204,21,0.75)]"
            : "text-white/70"
        }`}
      title="Least frequent digit (last 20 ticks)"
    >
      {edshellPreviewDigit !== null ? `🎯 ${edshellPreviewDigit}` : "…"}
    </span>
  )}
</button>

      <div className="grid grid-cols-2 gap-2">
        <select
          value={edshellCount}
          onChange={(e) => setEdshellCount(Number(e.target.value) as 1 | 3 | 5)}
          className="w-full bg-[#0e1422] border border-white/10 p-2 rounded-md text-sm"
        >
          <option value={1}>1x (default)</option>
          <option value={3}>3x</option>
          <option value={5}>5x</option>
        </select>

        <select
          value={edshellScope}
          onChange={(e) => setEdshellScope(e.target.value as "current" | "scan")}
          className="w-full bg-[#0e1422] border border-white/10 p-2 rounded-md text-sm"
        >
          <option value="current">Current Index</option>
          <option value="scan">Scan All</option>
        </select>
      </div>
    </div>
  )}

    {/* ✅ METRO (NEW) — AutoTrade toggle */}
  {canShow("metro_metro") && (
    <button
      onClick={onToggleMetro}
      className={`w-full rounded-md py-3 text-sm font-semibold shadow-[0_0_0_1px_rgba(255,255,255,0.10)] transition active:scale-[0.98] ${
        metroRunning
          ? "bg-teal-600 hover:bg-teal-700 animate-pulse"
          : "bg-teal-500 hover:bg-teal-600"
      }`}
    >
      {metroRunning ? "Stop Metro" : "Metro"}
    </button>
  )}

  {/* ✅ 3x Selected Digit */}
  {canShow("metro_3x") && (
    <button
      onClick={on3xSelectedDigit}
      disabled={instant3xRunning}
      className={`w-full rounded-md py-3 text-sm font-semibold shadow-[0_0_0_1px_rgba(255,255,255,0.10)] transition active:scale-[0.98] ${
        instant3xRunning
          ? "bg-slate-600 cursor-not-allowed animate-pulse"
          : "bg-red-600 hover:bg-red-700 active:brightness-110"
      }`}
    >
      {instant3xRunning ? "Placing 3 trades..." : "3x Selected Digit"}
    </button>
  )}

  {/* ✅ 5x AutoTrading */}
  {canShow("metro_5x") && (
    <button
      onClick={onToggle5x}
      className={`w-full rounded-md py-3 text-sm font-semibold shadow-[0_0_0_1px_rgba(255,255,255,0.10)] transition active:scale-[0.98] ${
        auto5xRunning
          ? "bg-orange-600 hover:bg-orange-700 animate-pulse"
          : "bg-purple-600 hover:bg-purple-700 active:brightness-110"
      }`}
    >
      {auto5xRunning ? "Stop 5x AutoTrading" : "5x AutoTrading"}
    </button>
  )}

  {/* ✅ 1x Auto All Pairs */}
  {canShow("metro_1x_auto") && (
    <button
      onClick={run1xAutoAllPairs}
      disabled={auto1xRunning}
      className={`w-full rounded-md py-3 text-sm font-semibold shadow-[0_0_0_1px_rgba(255,255,255,0.10)] transition active:scale-[0.98] ${
        auto1xRunning
          ? "bg-slate-600 cursor-not-allowed animate-pulse"
          : "bg-indigo-600 hover:bg-indigo-700 active:brightness-110"
      }`}
    >
      {auto1xRunning ? "Scanning..." : "1x Auto All Pairs"}
    </button>
  )}

  {/* ✅ Fast AutoTrading */}
  {canShow("metro_fast_auto") && (
    <button
      onClick={onToggleFastAuto}
      className={`w-full rounded-md py-3 text-sm font-semibold shadow-[0_0_0_1px_rgba(255,255,255,0.10)] transition active:scale-[0.98] ${
        fastAutoRunning
          ? "bg-emerald-600 hover:bg-emerald-700 animate-pulse active:brightness-110"
          : "bg-cyan-600 hover:bg-cyan-700 active:brightness-110"
      }`}
    >
      {fastAutoRunning ? "Stop Fast AutoTrading" : "Fast AutoTrading"}
    </button>
  )}

  {/* Turbo Mode (leave visible for admins/users — or wrap in canShow if you want) */}
  <div className="flex items-center justify-between px-2 text-xs text-white/70">
    <span>Turbo Mode</span>
    <button
      onClick={() => setTurboMode(!turboMode)}
      className={`w-12 h-6 rounded-full relative border transition ${
        turboMode ? "bg-orange-500/70 border-orange-400/60" : "bg-white/10 border-white/15"
      }`}
    >
      <span
        className={`absolute top-0.5 w-5 h-5 bg-white rounded-full transition ${
          turboMode ? "right-0.5" : "left-0.5"
        }`}
      />
    </button>
  </div>

  {analysisStatus && (
    <div className="rounded-lg bg-white/5 border border-white/10 p-3 text-xs text-white/70">
      {analysisStatus}
    </div>
  )}
</div>

      {/* Trade History */}
     <div className="mt-6">
  <StrategyTradeHistoryTab
    title="Trade History"
    trades={tradeHistory}
    currency={currency}
    onClearHistory={onClearHistory}
  />
</div>
    </div>
  );
}

/* ================= Trade History (3 tabs only) ================= */

function TradeHistoryMetroLike({
  tradeHistory,
  currency,
  onClear,
}: {
  tradeHistory: Trade[];
  currency: string;
  onClear: () => void;
}) {
  const [tab, setTab] = useState<"all" | "wins" | "losses">("all");

  const netProfit = tradeHistory.reduce((acc, t) => acc + Number(t.profit ?? 0), 0);

  const wins = tradeHistory.filter((t) => t.result === "Win").length;
  const losses = tradeHistory.filter((t) => t.result === "Loss").length;
  const done = tradeHistory.filter((t) => t.result === "Win" || t.result === "Loss").length;
  const winRate = done ? (wins / done) * 100 : 0;

  const filtered = tradeHistory.filter((t) => {
    if (tab === "wins") return t.result === "Win";
    if (tab === "losses") return t.result === "Loss";
    return true;
  });

  // Index label (nice names like screenshot)
  const getIndexLabel = (sym: Pair) => {
    const vol = INDEX_GROUPS.volatility.find((x) => x.code === sym)?.label;
    const jump = INDEX_GROUPS.jump.find((x) => x.code === sym)?.label;
    const step = INDEX_GROUPS.Step.find((x) => x.code === sym)?.label;
    return vol || jump || step || sym;
  };

  const pillForResult = (r: TradeResult) => {
    if (r === "Win") return "bg-emerald-500/15 border-emerald-400/25 text-emerald-200";
    if (r === "Loss") return "bg-red-500/15 border-red-400/25 text-red-200";
    return "bg-yellow-500/15 border-yellow-400/25 text-yellow-200";
  };

  // This is what will show as “button / strategy used”
  // Uses your existing data (t.source + t.type) with a clean label.
  const getActionLabel = (t: Trade) => {
  // ✅ if source exists, just show it (covers SpiderX Auto, SpiderX, MetroX, Edshell)
  if (t.source) return t.source;

  // fallback for older trades without source
  if (t.type === "Differs") return "Fast DIFFERS";
  if (t.type === "Matches") return "MATCHES";
  if (t.type === "Over") return "OVER";
  if (t.type === "Under") return "UNDER";

  return "MetroX";
};

  const TabBtn = ({
    active,
    onClick,
    children,
  }: {
    active: boolean;
    onClick: () => void;
    children: React.ReactNode;
  }) => (
    <button
      onClick={onClick}
      className={`flex-1 rounded-xl px-3 py-2 text-xs font-semibold border transition
        ${
          active
            ? "bg-cyan-500/15 border-cyan-400/25 text-cyan-100"
            : "bg-white/[0.04] border-white/10 text-white/65 hover:bg-white/[0.07]"
        }`}
    >
      {children}
    </button>
  );

  return (
    <div className="mt-6 rounded-2xl border border-white/10 bg-gradient-to-br from-[#0f1b2d]/90 to-[#0b1220]/90 p-4 shadow-[0_20px_80px_rgba(0,0,0,0.45)]">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <div className="h-10 w-10 rounded-2xl bg-cyan-500/10 border border-cyan-400/20 flex items-center justify-center">
            <span className="text-cyan-200">⏳</span>
          </div>
          <div>
            <p className="text-sm font-semibold text-cyan-100">Trade History</p>
            <p className="text-[11px] text-white/45">Entry • Exit • Payout • Strategy</p>
          </div>
        </div>

        <button
          onClick={onClear}
          title="Clear trade history"
          className="h-10 w-10 rounded-2xl bg-red-500/10 border border-red-400/20 text-red-200 hover:bg-red-500/20 transition"
        >
          🗑
        </button>
      </div>

      {/* Stats row */}
      <div className="mt-4 grid grid-cols-2 gap-3">
        <div className="rounded-2xl border border-white/10 bg-white/[0.04] p-4">
          <p className="text-[11px] text-white/55">Net Profit/Loss</p>
          <p className={`mt-2 text-2xl font-extrabold ${netProfit >= 0 ? "text-emerald-300" : "text-red-300"}`}>
            {netProfit >= 0 ? "+" : ""}
            {netProfit.toFixed(2)} <span className="text-white/60">{currency}</span>
          </p>
        </div>

        <div className="rounded-2xl border border-white/10 bg-white/[0.04] p-4">
          <p className="text-[11px] text-white/55">Win Rate</p>
          <p className="mt-2 text-2xl font-extrabold text-sky-300">
            {winRate.toFixed(1)}%{" "}
            <span className="text-xs text-white/50 font-semibold">
              ({wins}/{done || 0})
            </span>
          </p>
        </div>
      </div>

      {/* Tabs */}
      <div className="mt-4 grid grid-cols-3 gap-2">
        <TabBtn active={tab === "all"} onClick={() => setTab("all")}>
          All Trades ({tradeHistory.length})
        </TabBtn>
        <TabBtn active={tab === "wins"} onClick={() => setTab("wins")}>
          Wins ({wins})
        </TabBtn>
        <TabBtn active={tab === "losses"} onClick={() => setTab("losses")}>
          Losses ({losses})
        </TabBtn>
      </div>

      {/* List */}
      <div className="mt-4 max-h-[720px] overflow-y-auto space-y-3 pr-2">
        {filtered.length === 0 ? (
          <div className="rounded-2xl border border-white/10 bg-white/[0.04] p-4 text-sm text-white/60">
            No trades in this tab.
          </div>
        ) : (
          filtered.map((t, idx) => {
            const profitVal = Number(t.profit ?? 0);

            const profitText =
              t.result === "Pending"
                ? ""
                : `${profitVal >= 0 ? "+" : ""}${profitVal.toFixed(2)} ${currency}`;

            const statusLabel =
              t.result === "Pending"
                ? "Pending"
                : t.result === "Win"
                ? "Completed - Won"
                : "Completed - Lost";

            const actionLabel = getActionLabel(t);

            return (
              <div
                key={idx}
                className="rounded-2xl border border-white/10 bg-white/[0.04] p-4 shadow-[0_0_0_1px_rgba(255,255,255,0.02)]"
              >
                {/* Top Row (index + result + profit like screenshot) */}
                <div className="flex items-start justify-between gap-3">
                  <div className="flex items-start gap-3">
                    <div className="h-10 w-10 rounded-2xl bg-emerald-500/10 border border-emerald-400/15 flex items-center justify-center">
                      <span className="text-emerald-200">📈</span>
                    </div>

                    <div>
                      <div className="flex items-center gap-2">
                        <p className="text-sm font-extrabold text-white/90">{t.symbol}</p>

                        <span className={`text-[10px] px-2 py-0.5 rounded-full border ${pillForResult(t.result)}`}>
                          {t.result === "Win" ? "WON" : t.result === "Loss" ? "LOST" : "PENDING"}
                        </span>
                        {t.batchIndex && t.batchTotal && (
  <span className="text-[10px] px-2 py-0.5 rounded-full border border-white/10 bg-black/20 text-white/70">
    {t.batchIndex}/{t.batchTotal}
  </span>
)}
                      </div>

                      <p className="mt-1 text-[11px] text-white/55 font-semibold">
                        {getIndexLabel(t.symbol)}
                      </p>

                      {/* Strategy / button used */}
                      <div className="mt-2 inline-flex items-center gap-2">
                        <span className="text-[10px] px-2 py-0.5 rounded-full border border-white/10 bg-black/20 text-white/70">
                          {actionLabel}
                        </span>

                        <span className="text-[10px] px-2 py-0.5 rounded-full border border-purple-400/20 bg-purple-500/10 text-purple-200">
                          {t.type.toUpperCase()}
                        </span>
                      </div>
                    </div>
                  </div>

                  <div className="text-right">
                    <p
                      className={`text-sm font-extrabold ${
                        t.result === "Win"
                          ? "text-emerald-300"
                          : t.result === "Loss"
                          ? "text-red-300"
                          : "text-white/60"
                      }`}
                    >
                      {profitText || "—"}
                    </p>
                    <p className="mt-1 text-[11px] text-white/55">
                      Stake: {t.stake.toFixed(2)} {currency}
                    </p>
                    <p className="text-[11px] text-white/55">
                      Payout: {typeof t.payout === "number" ? `${t.payout.toFixed(2)} ${currency}` : "—"}
                    </p>
                  </div>
                </div>

                {/* Middle Row (Entry / Exit / Payout like screenshot) */}
                <div className="mt-4 grid grid-cols-3 gap-2">
                  <div className="rounded-xl border border-white/10 bg-black/15 px-3 py-2">
                    <p className="text-[10px] uppercase tracking-wide text-white/45">Entry</p>
                    <div className="mt-1 flex items-center justify-between">
                      <span className="text-xs text-white/70">Digit</span>
                      <span className="text-xs font-extrabold text-white/90">
                        {t.digit}
                      </span>
                    </div>
                  </div>

                  <div className="rounded-xl border border-white/10 bg-black/15 px-3 py-2">
                    <p className="text-[10px] uppercase tracking-wide text-white/45">Exit</p>
                    <div className="mt-1 flex items-center justify-between">
                      <span className="text-xs text-white/70">Digit</span>
                      <span className="text-xs font-extrabold text-white/90">
                        {typeof t.settlementDigit === "number" ? t.settlementDigit : "—"}
                      </span>
                    </div>
                  </div>

                  <div className="rounded-xl border border-white/10 bg-black/15 px-3 py-2">
                    <p className="text-[10px] uppercase tracking-wide text-white/45">Payout</p>
                    <div className="mt-1 flex items-center justify-between">
                      <span className="text-xs text-white/70">{t.type.toUpperCase()}</span>
                      <span className="text-xs font-extrabold text-white/90">
                        {typeof t.payout === "number" ? t.payout.toFixed(2) : "—"}{" "}
                        <span className="text-white/60">{currency}</span>
                      </span>
                    </div>
                  </div>
                </div>

                {/* Bottom row (Status) */}
                <div className="mt-3 flex items-center justify-between rounded-xl border border-white/10 bg-black/10 px-3 py-2">
                  <div className="text-[11px] text-white/55">Status</div>
                  <div
                    className={`text-[11px] font-semibold ${
                      t.result === "Win"
                        ? "text-emerald-300"
                        : t.result === "Loss"
                        ? "text-red-300"
                        : "text-yellow-300"
                    }`}
                  >
                    {statusLabel}
                  </div>
                </div>

                {/* Time (optional – screenshot doesn’t emphasize it, but you still keep it) */}
                <div className="mt-2 text-[10px] text-white/40">
                  {formatTime(t.createdAt)}
                </div>
              </div>
            );
          })
        )}
      </div>
    </div>
  );
}

/* ================= STRATEGY PANEL (UNCHANGED) ================= */

function StrategyPanel({
  type,
  ticks,
  selectedDigit,
  setSelectedDigit,
  stake,
  setStake,
  selectedPair,
  setSelectedPair,
  tradeHistory,
  placeTrade,
}: {
  type: "matches" | "overunder";
  ticks: number[];
  selectedDigit: number | null;
  setSelectedDigit: (d: number | null) => void;
  stake: number;
  setStake: (s: number) => void;
  selectedPair: Pair;
  setSelectedPair: (p: Pair) => void;
  tradeHistory: Trade[];
  placeTrade: (t: TradeType, duration: number) => void;
}) {
  const digitPercent = (d: number) => {
    if (!ticks.length) return 0;
    return (ticks.filter((x) => x === d).length / ticks.length) * 100;
  };

  const digitColor = (d: number) => {
    return `border rounded-lg p-3 text-center cursor-pointer ${
      d === selectedDigit ? "border-yellow-400" : "border-gray-700"
    }`;
  };

  return (
    <div>
      <div className="flex gap-2 mb-3 items-center">
        <select
          className="bg-black/30 p-2 rounded"
          value={selectedPair}
          onChange={(e) => setSelectedPair(e.target.value as Pair)}
        >
          {PAIRS.map((p) => (
            <option key={p} value={p}>
              {p}
            </option>
          ))}
        </select>

        <input
          type="number"
          min={0.1}
          step={0.1}
          placeholder="Stake"
          value={stake}
          onChange={(e) => setStake(Number(e.target.value))}
          className="bg-black/30 p-2 rounded w-24"
        />

        <div className="bg-black/30 p-2 rounded w-16 text-center">{selectedDigit !== null ? selectedDigit : "-"}</div>
      </div>

      <div className="grid grid-cols-5 gap-3 mb-3">
        {Array.from({ length: 10 }, (_, i) => (
          <div key={i} onClick={() => setSelectedDigit(i)} className={digitColor(i)}>
            <p className="font-bold">{i}</p>
            <p className="text-xs">{digitPercent(i).toFixed(1)}%</p>
          </div>
        ))}
      </div>

      <div className="flex gap-2 mb-3">
        {type === "overunder" && (
          <>
            <button onClick={() => placeTrade("Over", 1)} className="bg-green-500 px-3 py-1 rounded">
  Over
</button>

<button onClick={() => placeTrade("Under", 1)} className="bg-red-500 px-3 py-1 rounded">
  Under
</button>
          </>
        )}
      </div>
    </div>
  );
}
// ================= SpiderX Best Pairs Analyzer =================

type AnalyzerMode = "OVER_0" | "OVER_1" | "OVER_2" | "UNDER_8" | "UNDER_9";

function SpiderXAnalyzer({
  pairs,
  indexGroups,
  pairDigitsRef,
  selectedPair,
  setSelectedPair,
  onPlaceTrade,
  tradeHistory,
  currency,
  onClearHistory,
  setStake,
  stake,
  toggleSpiderRandomAuto,
  spiderRandomRunning,
  setSelectedDigit,
  selectedDigit,
  lastWinDigit,
  lastLossDigit,

  // ✅ NEW (for admin UI flags)
  uiFlags,
  isAdmin,
}: {
  pairs: readonly Pair[];
  indexGroups: typeof INDEX_GROUPS;
  pairDigitsRef: React.MutableRefObject<Record<Pair, number[]>>;
  selectedPair: Pair;
  setSelectedPair: (p: Pair) => void;
  onPlaceTrade: (type: TradeType, duration: number) => void;
  tradeHistory: Trade[];
  currency: string;
  onClearHistory: () => void;
  setStake: (n: number) => void;
  stake: number;
  toggleSpiderRandomAuto: () => void;
  spiderRandomRunning: boolean;
  setSelectedDigit: (d: number | null) => void;
  selectedDigit: number | null;
  lastWinDigit: number | null;
  lastLossDigit: number | null;

  // ✅ NEW TYPES
  uiFlags: UIFlags;
  isAdmin: boolean;
}) {
  // ✅ helper (same as MetroX)
  const canShow = (key: keyof UIFlags) => isAdmin || uiFlags[key] !== false;

  // ===== Live Digit Stream (SpiderX) =====
  const ticks = pairDigitsRef.current[selectedPair] ?? [];
  const lastDigit = ticks.length ? ticks[ticks.length - 1] : null;

  // ✅ Use last20 like MetroX for a clean signal
  const last20 = ticks.slice(-20);

  const mostFrequentDigit = useMemo(() => {
    if (last20.length < 1) return null;
    const freq = Array.from({ length: 10 }, () => 0);
    for (const d of last20) freq[d]++;
    const max = Math.max(...freq);
    return freq.indexOf(max); // first most frequent
  }, [last20]);

  const digitPercent = (d: number) => {
    if (!ticks.length) return 0;
    return (ticks.filter((x) => x === d).length / ticks.length) * 100;
  };

  const [mode, setMode] = useState<AnalyzerMode>("OVER_1");

  // ===== Digit Popup (NEW) =====
  const [digitPopupOpen, setDigitPopupOpen] = useState(false);
  const [popupDigit, setPopupDigit] = useState<number | null>(null);

  // ✅ manual barrier digit (independent)
  const [barrierDigit, setBarrierDigit] = useState<number>(1);
  const [manualActive, setManualActive] = useState<"Over" | "Under" | null>(null);
  const lastManualRef = useRef<number>(0);

  const [running, setRunning] = useState(false);
  const [secondsLeft, setSecondsLeft] = useState(0);
  const [results, setResults] = useState<Array<{ pair: Pair; pct: number; hits: number }>>([]);
  const [analyzingPairs, setAnalyzingPairs] = useState<Pair[]>([]);

  const [autoRunning, setAutoRunning] = useState(false);
  const tradedPairsRef = useRef<Set<Pair>>(new Set());

  const modes: { key: AnalyzerMode; label: string }[] = [
    { key: "OVER_0", label: "OVER 0" },
    { key: "OVER_1", label: "OVER 1" },
    { key: "OVER_2", label: "OVER 2" },
    { key: "UNDER_8", label: "UNDER 8" },
    { key: "UNDER_9", label: "UNDER 9" },
  ];

  const computePct = (last20: number[], m: AnalyzerMode) => {
    if (last20.length < 20) return { pct: 0, hits: 0 };
    let hits = 0;
    for (const d of last20) {
      if (m === "OVER_0" && d > 0) hits++;
      if (m === "OVER_1" && d > 1) hits++;
      if (m === "OVER_2" && d > 2) hits++;
      if (m === "UNDER_8" && d < 8) hits++;
      if (m === "UNDER_9" && d < 9) hits++;
    }
    return { hits, pct: (hits / 20) * 100 };
  };

  const getTradeDigitFromMode = (m: AnalyzerMode) => {
    if (m === "OVER_0") return 0;
    if (m === "OVER_1") return 1;
    if (m === "OVER_2") return 2;
    if (m === "UNDER_8") return 8;
    return 9; // UNDER_9
  };

  const startAnalysis = () => {
    // STOP
    if (running) {
      setRunning(false);
      setAutoRunning(false);
      setAnalyzingPairs([]);
      tradedPairsRef.current.clear();
      return;
    }

    // START
    setRunning(true);
    setAutoRunning(false);
    setResults([]);
    setSecondsLeft(30);
    setAnalyzingPairs([]);
    tradedPairsRef.current.clear();

    const startedAt = Date.now();
    const TRADE_THRESHOLD = 95;

    const timer = window.setInterval(() => {
      const elapsed = Math.floor((Date.now() - startedAt) / 1000);
      const left = Math.max(0, 30 - elapsed);
      setSecondsLeft(left);

      const scored = pairs.map((pair) => {
        const last20 = (pairDigitsRef.current[pair] ?? []).slice(-20);
        const { pct, hits } = computePct(last20, mode);
        return { pair, pct, hits };
      });

      const liveTop2 = scored
        .filter((x) => (pairDigitsRef.current[x.pair] ?? []).length >= 20)
        .sort((a, b) => b.pct - a.pct)
        .slice(0, 2);

      setResults(liveTop2);
      setAnalyzingPairs(scored.map((s) => s.pair));

      // AUTO TRADE (only if autoRunning)
      for (const s of scored) {
        if (!autoRunning) break;
        if ((pairDigitsRef.current[s.pair] ?? []).length < 20) continue;
        if (s.pct < TRADE_THRESHOLD) continue;
        if (tradedPairsRef.current.has(s.pair)) continue;

        const tradeType: TradeType = mode.startsWith("OVER") ? "Over" : "Under";
        const tradeDigit = getTradeDigitFromMode(mode);

        // ✅ IMPORTANT: set pair + digit before placing trade
        setSelectedPair(s.pair);
        setSelectedDigit(tradeDigit); // ✅ FIX: actually sets digit used by Dashboard placeTrade

        setTimeout(() => {
          onPlaceTrade(tradeType, 1);
        }, 50);

        tradedPairsRef.current.add(s.pair);
      }

      if (left === 0) {
        window.clearInterval(timer);
        setRunning(false);
        setAutoRunning(false);

        const finalResults = scored
          .filter((x) => (pairDigitsRef.current[x.pair] ?? []).length >= 20)
          .sort((a, b) => b.pct - a.pct)
          .slice(0, 2);

        setResults(finalResults);
      }
    }, 500);
  };

  return (
    <div className="space-y-6">
      {/* ================= Analyzer ================= */}
      {canShow("spider_analyzer") && (
        <div className="rounded-2xl border border-white/10 bg-gradient-to-br from-[#1b2235]/95 to-[#121826]/95 p-5">
          {/* Header */}
          <div className="flex items-center justify-between mb-3">
            <p className="font-semibold text-white/90">🎯 SpiderX Best Pairs Analyzer</p>
            <button
              onClick={startAnalysis}
              className={`px-4 py-2 rounded-md text-sm font-semibold border ${
                running ? "bg-red-600 hover:bg-red-700 border-white/10" : "bg-sky-600 hover:bg-sky-700 border-white/10"
              }`}
            >
              {running ? "Stop Analysis" : "Start Analysis"}
            </button>
          </div>

          {/* Mode tabs */}
          <div className="flex flex-wrap gap-2 mb-4">
            {modes.map((m) => (
              <button
                key={m.key}
                onClick={() => setMode(m.key)}
                className={`px-3 py-1 rounded-md text-xs border ${
                  mode === m.key ? "bg-sky-600/25 border-sky-500/30 text-white" : "bg-white/5 border-white/10 text-white/70"
                }`}
              >
                {m.label}
              </button>
            ))}
          </div>

          {/* Countdown */}
          <div className="rounded-xl border border-white/10 bg-black/20 p-3 mb-4">
            <div className="flex justify-between text-xs text-white/70 mb-1">
              <span>TIME</span>
              <span>{running ? `${secondsLeft}s` : "—"}</span>
            </div>

            <div className="h-2 rounded-full bg-white/10 overflow-hidden">
              <div
                className="h-full bg-sky-500/80 transition-all"
                style={{ width: running ? `${((30 - secondsLeft) / 30) * 100}%` : "0%" }}
              />
            </div>

            {running && analyzingPairs.length > 0 && (
              <div className="mt-3 flex flex-wrap gap-2">
                {analyzingPairs.map((p) => (
                  <span key={p} className="px-2 py-1 rounded-md text-xs bg-white/5 border border-white/10 text-white/70">
                    {p}
                  </span>
                ))}
              </div>
            )}
          </div>

          {/* Results */}
          {results.length > 0 && (
            <div className="space-y-3">
              {results.map((r, i) => {
                const last20 = (pairDigitsRef.current[r.pair] ?? []).slice(-20);

                const label =
                  indexGroups.volatility.find((x) => x.code === r.pair)?.label ||
                  indexGroups.jump.find((x) => x.code === r.pair)?.label ||
                  r.pair;

                return (
                  <div
                    key={r.pair}
                    className={`rounded-xl border border-white/10 bg-black/20 p-3 ${r.pair === selectedPair ? "ring-2 ring-sky-500/40" : ""}`}
                  >
                    <div className="flex items-center justify-between">
                      <div>
                        <p className="text-sm font-semibold text-white/90">
                          #{i + 1} {label}
                        </p>
                        <button onClick={() => setSelectedPair(r.pair)} className="text-xs text-emerald-300">
                          ← Click to select
                        </button>
                      </div>

                      <div className="text-right">
                        <p className="text-lg font-extrabold text-emerald-300">{r.pct.toFixed(1)}%</p>
                        <p className="text-[11px] text-white/55">{r.hits}/20 digits</p>
                      </div>
                    </div>

                    <div className="mt-3 flex flex-wrap gap-1">
                      {last20.map((d, idx) => (
                        <span
                          key={idx}
                          className="w-6 h-6 rounded-md bg-emerald-500/15 border border-emerald-400/20 text-emerald-100 text-xs flex items-center justify-center"
                        >
                          {d}
                        </span>
                      ))}
                    </div>
                  </div>
                );
              })}
            </div>
          )}

          {/* Auto Trading button (optional) */}
          {results.length > 0 && (
            <div className="mt-4 space-y-3">
              <button
                onClick={() => {
                  if (autoRunning) {
                    setAutoRunning(false);
                    tradedPairsRef.current.clear();
                    return;
                  }
                  const bad = results.find((r) => r.pct < 95);
                  if (bad) {
                    alert(`Auto canceled: ${bad.pair} is only ${bad.pct.toFixed(1)}%`);
                    return;
                  }
                  setAutoRunning(true);
                  tradedPairsRef.current.clear();
                }}
                className={`w-full py-3 rounded-md font-semibold text-sm border transition ${
                  autoRunning ? "bg-red-600 hover:bg-red-700 animate-pulse" : "bg-emerald-600 hover:bg-emerald-700 border-emerald-500/40"
                }`}
              >
                {autoRunning ? "Stop Auto Trading" : "⚡ Start Auto Trading"}
              </button>

              <p className="text-xs text-white/60 text-center">
                Auto-trades {mode.replace("_", " ")} (1 tick) when percentage ≥ 95%
              </p>
            </div>
          )}
        </div>
      )}

      {/* ================= Digit Trade Popup (SpiderX) ================= */}
      {digitPopupOpen && popupDigit !== null && (
        <div className="fixed inset-0 z-50 flex items-center justify-center">
          {/* Backdrop */}
          <button className="absolute inset-0 bg-black/60" onClick={() => setDigitPopupOpen(false)} />

          {/* Modal */}
          <div className="relative w-[340px] max-w-[92vw] rounded-2xl border border-white/10 bg-[#0f1b2d] p-5 shadow-2xl">
            <div className="grid grid-cols-2 gap-4">
              {/* Top buttons: 1 trade */}
              <button
                onClick={() => {
                  setSelectedDigit(popupDigit);
                  onPlaceTrade("Over", 1);
                  setDigitPopupOpen(false);
                }}
                className="rounded-2xl bg-emerald-600 hover:bg-emerald-700 py-10 font-extrabold text-white text-xl"
              >
                OVER {popupDigit}
              </button>

              <button
                onClick={() => {
                  setSelectedDigit(popupDigit);
                  onPlaceTrade("Under", 1);
                  setDigitPopupOpen(false);
                }}
                className="rounded-2xl bg-blue-600 hover:bg-blue-700 py-10 font-extrabold text-white text-xl"
              >
                UNDER {popupDigit}
              </button>
            </div>

            <div className="mt-4 text-center text-sm font-semibold text-white/60">ADMIN: Instant Over/Under (3 Trades)</div>

            <div className="mt-4 grid grid-cols-2 gap-4">
              {/* Bottom buttons: 3x trades */}
              <button
                onClick={() => {
                  setSelectedDigit(popupDigit);

                  onPlaceTrade("Over", 1);
                  setTimeout(() => onPlaceTrade("Over", 1), 400);
                  setTimeout(() => onPlaceTrade("Over", 1), 800);

                  setDigitPopupOpen(false);
                }}
                className="rounded-2xl bg-orange-500 hover:bg-orange-600 py-8 font-bold text-white"
              >
                ⚡ Instant Over {popupDigit}
                <div className="text-white/90 text-sm mt-2">(3x trades)</div>
              </button>

              <button
                onClick={() => {
                  setSelectedDigit(popupDigit);

                  onPlaceTrade("Under", 1);
                  setTimeout(() => onPlaceTrade("Under", 1), 400);
                  setTimeout(() => onPlaceTrade("Under", 1), 800);

                  setDigitPopupOpen(false);
                }}
                className="rounded-2xl bg-purple-600 hover:bg-purple-700 py-8 font-bold text-white"
              >
                ⚡ Instant Under {popupDigit}
                <div className="text-white/90 text-sm mt-2">(3x trades)</div>
              </button>
            </div>

            <button
              onClick={() => setDigitPopupOpen(false)}
              className="mt-5 w-full rounded-xl bg-white/10 hover:bg-white/15 border border-white/10 py-3 font-semibold text-white/80"
            >
              Cancel
            </button>
          </div>
        </div>
      )}

      {/* ================= Live Digit Stream (SpiderX) ================= */}
      <div className="rounded-2xl border border-white/10 bg-gradient-to-br from-[#1b2235]/95 to-[#121826]/95 p-4">
        <p className="text-sm text-white/80 mb-3">Live Digit Stream</p>

        <div className="grid grid-cols-5 gap-3 mb-3">
          {Array.from({ length: 10 }, (_, d) => {
            const pct = digitPercent(d);

            const selected = selectedDigit === d;
            const won = lastWinDigit === d;
            const lost = lastLossDigit === d;
            const live = lastDigit === d;
            const most = mostFrequentDigit === d;

            const base = "bg-[#0e1422] border-white/10 text-white/90 hover:bg-white/5";
            const selectedCls = "bg-blue-600/90 border-blue-400 text-white";
            const wonCls = "bg-emerald-600/35 border-emerald-400 text-white";
            const lostCls = "bg-red-600/35 border-red-400 text-white";
            const liveCls = "bg-emerald-600/20 border-emerald-500/30 text-white";
            const mostCls = "bg-red-600/20 border-red-500/35 text-white";

            const cls = selected ? selectedCls : won ? wonCls : lost ? lostCls : live ? liveCls : most ? mostCls : base;

            return (
              <button
                key={d}
                onClick={() => {
                  setSelectedDigit(d);
                  setPopupDigit(d);
                  setDigitPopupOpen(true);
                }}
                className={`relative rounded-full py-3 text-center border transition ${cls}`}
              >
                {selected && <span className="absolute top-2 right-3 text-white text-sm">✓</span>}
                {!selected && won && <span className="absolute top-2 right-3 text-emerald-100 text-sm">💰</span>}
                {!selected && !won && lost && <span className="absolute top-2 right-3 text-red-100 text-sm">❌</span>}
                {!selected && !won && !lost && live && <span className="absolute top-2 right-3 text-emerald-200 text-sm">●</span>}
                {!selected && !won && !lost && !live && most && <span className="absolute top-2 right-3 text-red-200 text-sm">▲</span>}

                <div className="text-lg font-bold leading-none">{d}</div>
                <div className="mt-1 text-[11px] text-white/60">{pct.toFixed(1)}%</div>
              </button>
            );
          })}
        </div>

        <p className="text-xs text-white/60 text-center">
          Based on {ticks.length} ticks from <span className="font-semibold">{selectedPair}</span> • Last Digit:{" "}
          <span className="text-emerald-400 font-extrabold text-xl">{lastDigit !== null ? lastDigit : "-"}</span>
        </p>
      </div>

      {/* ================= SpiderX Settings ================= */}
      <div className="rounded-xl border border-white/10 bg-white/5 p-4">
        <p className="text-sm font-semibold text-white/90 mb-3">🕷 SpiderX Settings</p>

        {/* TOP ROW */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-3 mb-4">
          {/* Select Index */}
          <div>
            <p className="text-[11px] text-white/60 mb-1">Select Index</p>
            <select
              className="w-full bg-[#0e1422] border border-white/10 p-2 rounded-md text-sm"
              value={selectedPair}
              onChange={(e) => setSelectedPair(e.target.value as Pair)}
            >
              <optgroup label="Volatility Indices">
                {indexGroups.volatility.map((s) => (
                  <option key={s.code} value={s.code}>
                    {s.label}
                  </option>
                ))}
              </optgroup>
              <optgroup label="Jump Indices">
                {indexGroups.jump.map((s) => (
                  <option key={s.code} value={s.code}>
                    {s.label}
                  </option>
                ))}
              </optgroup>
            </select>
          </div>

          {/* Barrier */}
          <div>
            <p className="text-[11px] text-white/60 mb-1">Barrier Number</p>
            <select
              className="w-full bg-[#0e1422] border border-white/10 p-2 rounded-md text-sm"
              value={barrierDigit}
              onChange={(e) => {
                const d = Number(e.target.value);
                setBarrierDigit(d);
                setSelectedDigit(d);
              }}
            >
              {Array.from({ length: 10 }, (_, d) => (
                <option key={d} value={d}>
                  {d}
                </option>
              ))}
            </select>
          </div>

          {/* Tick Duration */}
          <div>
            <p className="text-[11px] text-white/60 mb-1">Tick Duration</p>
            <select className="w-full bg-[#0e1422] border border-white/10 p-2 rounded-md text-sm" value={1} disabled>
              <option value={1}>1 Tick</option>
            </select>
          </div>
        </div>

        {/* Stake */}
        <div className="mb-4">
          <p className="text-[11px] text-white/60 mb-2">Stake Amount</p>

          <div className="flex gap-2">
            <input
              type="number"
              step="0.1"
              min="0.1"
              value={stake}
              onChange={(e) => setStake(Number(e.target.value))}
              className="w-full bg-[#0e1422] border border-white/10 p-2 rounded-md text-sm"
            />

            <button
              onClick={() => setStake(1)}
              className="px-3 rounded-md bg-white/5 border border-white/10 text-sm hover:bg-white/10"
            >
              $1
            </button>

            <button
              onClick={() => setStake(5)}
              className="px-3 rounded-md bg-white/5 border border-white/10 text-sm hover:bg-white/10"
            >
              $5
            </button>

            <button
              onClick={() => setStake(10)}
              className="px-3 rounded-md bg-white/5 border border-white/10 text-sm hover:bg-white/10"
            >
              $10
            </button>
          </div>
        </div>

        {/* ✅ Manual Over/Under (flagged) */}
        {canShow("spider_manual_over_under") && (
          <>
            <p className="text-sm font-semibold text-white/80 mb-2">Manual Over / Under Trading</p>
            <div className="grid grid-cols-2 gap-3">
              <button
                onClick={() => {
                  const now = Date.now();
                  if (now - lastManualRef.current < 400) return;
                  lastManualRef.current = now;

                  setManualActive("Over");

                  setSelectedDigit(barrierDigit);
                  onPlaceTrade("Over", 1);

                  setTimeout(() => setManualActive(null), 300);
                }}
                className={`rounded-md py-3 font-semibold transition ${
                  manualActive === "Over"
                    ? "bg-emerald-500 shadow-[0_0_20px_rgba(16,185,129,0.9)]"
                    : "bg-emerald-600 hover:bg-emerald-700"
                }`}
              >
                Over {barrierDigit}
              </button>

              <button
                onClick={() => {
                  const now = Date.now();
                  if (now - lastManualRef.current < 400) return;
                  lastManualRef.current = now;

                  setManualActive("Under");

                  setSelectedDigit(barrierDigit);
                  onPlaceTrade("Under", 1);

                  setTimeout(() => setManualActive(null), 300);
                }}
                className={`rounded-md py-3 font-semibold transition ${
                  manualActive === "Under"
                    ? "bg-red-500 shadow-[0_0_20px_rgba(239,68,68,0.9)]"
                    : "bg-red-600 hover:bg-red-700"
                }`}
              >
                Under {barrierDigit}
              </button>
            </div>
          </>
        )}

        {/* ✅ Random Auto button (flagged) */}
        {canShow("spider_random_auto") && (
          <div className="mt-4">
            <button
              onClick={toggleSpiderRandomAuto}
              className={`w-full py-3 rounded-md font-semibold text-sm transition ${
                spiderRandomRunning ? "bg-red-600 hover:bg-red-700 animate-pulse" : "bg-indigo-600 hover:bg-indigo-700"
              }`}
            >
              {spiderRandomRunning ? "Stop Random Over/Under" : "🎲 Enable Random Over/Under"}
            </button>
            <p className="mt-2 text-xs text-white/60 text-center">
              Takes fast random Over/Under trades (0.4s, 1 tick)
            </p>
          </div>
        )}
      </div>

{/* ================= Trade History (Separate Panel) ================= */}
<div className="mt-6">
  <StrategyTradeHistoryTab
    title="Trade History"
    trades={tradeHistory}
    currency={currency}
    onClearHistory={onClearHistory}
  />
</div>
    </div>
  );
}
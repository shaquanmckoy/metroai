"use client";

import React, { useEffect, useRef, useState } from "react";
import type { Pair } from "@/app/dashboard/page";

function clampPercent(value: number) {
  return Math.max(0, Math.min(100, value));
}

const getPairLabel = (pair: Pair) => {
  for (const group of Object.values(INDEX_GROUPS)) {
    const found = group.find((item) => item.code === pair);
    if (found) return found.label;
  }
  return pair;
};

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
    { code: "STPRNG4", label: "STEP INDEX 400" },
    { code: "STPRNG5", label: "STEP INDEX 500" },
  ],
};

export const STEP_ONLY_PAIRS: readonly Pair[] = [
  "STPRNG",
  "STPRNG2",
  "STPRNG3",
  "STPRNG4",
  "STPRNG5",
];


export default function MarketIndicator({
  activeStrategy,
  selectedPair,
  pairDigitsRef,
  pairQuotesRef,
}: {
  activeStrategy: "matches" | "overunder" | "risefall" | "mspider" | null;
  selectedPair: Pair;
  pairDigitsRef: React.MutableRefObject<Record<Pair, number[]>>;
  pairQuotesRef: React.MutableRefObject<Record<Pair, number[]>>;
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
const isStep = selectedPair.startsWith("STPRNG");

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
  const quotesAll = pairQuotesRef.current[selectedPair] ?? [];
const quoteLast60 = quotesAll.slice(-60);
const quoteLast30 = quotesAll.slice(-30);
const quoteLast15 = quotesAll.slice(-15);
const quoteLast8 = quotesAll.slice(-8);
const quoteLast5 = quotesAll.slice(-5);

const readyQuotes = quoteLast15.length >= 15;

const getNetMove = (arr: number[]) => {
  if (arr.length < 2) return 0;
  return arr[arr.length - 1] - arr[0];
};

const countDirectionalMoves = (arr: number[]) => {
  let up = 0;
  let down = 0;
  let flat = 0;

  for (let i = 1; i < arr.length; i++) {
    if (arr[i] > arr[i - 1]) up++;
    else if (arr[i] < arr[i - 1]) down++;
    else flat++;
  }

  return { up, down, flat };
};

const analyzeQuoteTrend = (quotes: number[]) => {
  const q30 = quotes.slice(-30);
  const q15 = quotes.slice(-15);
  const q8 = quotes.slice(-8);
  const q5 = quotes.slice(-5);

  const ready = q15.length >= 15;
  const move15 = getNetMove(q15);
  const move8 = getNetMove(q8);
  const move5 = getNetMove(q5);
  const m15 = countDirectionalMoves(q15);

  const bias: "Rise" | "Fall" | "Wait" =
    !ready
      ? "Wait"
      : move15 > 0 && m15.up >= m15.down && move8 >= 0
      ? "Rise"
      : move15 < 0 && m15.down >= m15.up && move8 <= 0
      ? "Fall"
      : "Wait";

  const trendStrength =
    Math.abs(move15) + Math.abs(move8 * 0.8) + Math.abs(move5 * 0.6);

  const directionalControl = Math.abs(m15.up - m15.down);
  const confidence = clampPercent(
    ready ? 45 + trendStrength * 10 + directionalControl * 3 : 0
  );

  const range30 = q30.length ? Math.max(...q30) - Math.min(...q30) : 0;

  const doubleEntryScore = clampPercent(
    ready ? 35 + range30 * 8 + directionalControl * 4 + Math.abs(move8) * 12 : 0
  );

  return {
    ready,
    move15,
    move8,
    move5,
    m15,
    bias,
    confidence,
    range30,
    doubleEntryScore,
  };
};

const selectedTrend = analyzeQuoteTrend(quotesAll);
const recentMove15 = selectedTrend.move15;
const recentMove8 = selectedTrend.move8;
const microMove5 = selectedTrend.move5;
const movement15 = selectedTrend.m15;
const movement8 = countDirectionalMoves(quoteLast8);
const predictionConfidence = selectedTrend.confidence;
const predictionBias: "Rise" | "Fall" | "Wait" = selectedTrend.bias;

const predictionSummary = !readyQuotes
  ? "Collecting quote history for Rise/Fall prediction summary…"
  : predictionBias === "Rise"
  ? `Bias: RISE • Net15 ${recentMove15.toFixed(2)} • Up moves ${movement15.up}/${quoteLast15.length - 1} • Confidence ${predictionConfidence.toFixed(0)}%`
  : predictionBias === "Fall"
  ? `Bias: FALL • Net15 ${recentMove15.toFixed(2)} • Down moves ${movement15.down}/${quoteLast15.length - 1} • Confidence ${predictionConfidence.toFixed(0)}%`
  : `Bias: WAIT • Mixed structure on ${selectedPair} • Net15 ${recentMove15.toFixed(2)} • Confidence ${predictionConfidence.toFixed(0)}%`;

  const stepRankings = STEP_ONLY_PAIRS.map((pair) => {
  const trend = analyzeQuoteTrend(pairQuotesRef.current[pair] ?? []);
  return {
    pair,
    trend,
    ready: trend.ready,
    bias: trend.bias,
    confidence: trend.confidence,
    score: trend.doubleEntryScore,
    range30: trend.range30,
  };
})
  .filter((row) => row.ready)
  .sort((a, b) => b.score - a.score);

const bestStepPair = stepRankings[0] ?? null;

const stepPredictionSummary = !bestStepPair
  ? "Collecting live Step index quote history for double Rise + Fall ranking…"
  : `Best Step pair now: ${bestStepPair.pair} • ${bestStepPair.bias} bias • Double-entry score ${bestStepPair.score.toFixed(
      0
    )}% • Trend confidence ${bestStepPair.confidence.toFixed(0)}% • 30-tick range ${bestStepPair.range30.toFixed(2)}`;
  
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
if (isStep) {
  riskScore += 1;
  riskReasons.push("Step index can stair-step hard during short reversals");
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

    if (activeStrategy === "risefall") {
  const rfEdgeTxt = readyQuotes
    ? `Prediction summary: ${predictionSummary}`
    : "Prediction summary: collecting live quote history…";

  if (isStep) {
    if (riskLevel === "HIGH") {
return `Rise/Fall: Step indexes are too aggressive right now. Prefer waiting for a cleaner structure before using ${selectedPair}.${bestStepPair ? ` Best live Step pair: ${bestStepPair.pair} (${bestStepPair.score.toFixed(0)}%).` : ""}\n${rfEdgeTxt}`;    }

    if (predictionBias === "Rise") {
      return `Rise/Fall: ${selectedPair} currently leans bullish. Step indexes can work when directional control stays clean, but keep size smaller than volatility pairs.\n${rfEdgeTxt}`;
    }

    if (predictionBias === "Fall") {
      return `Rise/Fall: ${selectedPair} currently leans bearish. Step indexes are tradable here only when momentum stays one-sided over the last 8–15 ticks.\n${rfEdgeTxt}`;
    }

return `Rise/Fall: ${selectedPair} is a Step index, but the tape is mixed right now. Wait for stronger directional control before entering.${bestStepPair ? ` Best live Step pair: ${bestStepPair.pair} (${bestStepPair.score.toFixed(0)}%).` : ""}\n${rfEdgeTxt}`;  }

  if (riskLevel === "HIGH") {
    return `Rise/Fall: stay with smoother volatility pairs and wait for clearer direction. Avoid forcing entries into noisy conditions.\n${rfEdgeTxt}`;
  }

  if (predictionBias === "Rise") {
    return `Rise/Fall: current selected pair leans toward Rise continuation. Use cleaner volatility pairs first, then Step indexes only when structure remains stable.\n${rfEdgeTxt}`;
  }

  if (predictionBias === "Fall") {
    return `Rise/Fall: current selected pair leans toward Fall continuation. Step indexes are secondary here unless the tape keeps trending cleanly.\n${rfEdgeTxt}`;
  }

  return `Rise/Fall: no clean directional edge yet. Wait for a better quote structure before trading.\n${rfEdgeTxt}`;
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
  riskLevel === "HIGH" && (is1HZ || isJump || isStep)
    ? "⚠️ Current index type is HIGH-risk for current conditions. Consider switching to R_25 / R_50 or waiting for a cleaner setup."
    : riskLevel === "MEDIUM" && isJump
    ? "⚠️ Jump/Bull/Bear is riskier in medium conditions — only trade strongest edge."
    : riskLevel !== "LOW" && isStep
    ? "⚠️ Step indexes need cleaner one-way structure. Mixed movement can break Rise/Fall entries quickly."
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

  {activeStrategy === "risefall" && (
  <div className="mt-3 rounded-xl bg-black/20 border border-white/10 p-3">
    <p className="text-[11px] text-white/60">Prediction summary</p>
    <p className="text-xs text-white/80 mt-1">{predictionSummary}</p>
    <p className="text-[11px] text-white/55 mt-2">
      Last 30 / 15 / 5 net move: {getNetMove(quoteLast30).toFixed(2)} / {recentMove15.toFixed(2)} / {microMove5.toFixed(2)}
    </p>

    {isStep && (
      <div className="mt-3 rounded-xl bg-white/5 border border-white/10 p-3">
        <p className="text-[11px] text-white/60">Live Step prediction</p>
        <p className="text-xs text-white/80 mt-1">{stepPredictionSummary}</p>

        {bestStepPair && (
          <p className="text-[11px] text-emerald-300 mt-2">
            Double Rise + Fall focus: {bestStepPair.pair} • Score {bestStepPair.score.toFixed(0)}% • Bias {bestStepPair.bias} • Confidence {bestStepPair.confidence.toFixed(0)}%
          </p>
        )}

        <div className="mt-2 space-y-1">
          {stepRankings.slice(0, 5).map((row) => (
            <div key={row.pair} className="flex items-center justify-between text-[11px] text-white/70">
              <span>{row.pair}</span>
              <span>
                Score {row.score.toFixed(0)}% • {row.bias} • {row.confidence.toFixed(0)}%
              </span>
            </div>
          ))}
        </div>
      </div>
    )}
  </div>
)}

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
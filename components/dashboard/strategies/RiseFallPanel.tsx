"use client";

import React, { useEffect, useRef, useState } from "react";
import type { Pair } from "@/app/dashboard/page";
import DerivChart from "@/components/DerivChart";
import { STEP_ONLY_PAIRS } from "@/components/dashboard/strategy-constants";

export default function RiseFallPanel({
  selectedPair,
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
  tradeHistoryPanel,
}: {
  selectedPair: Pair;
  setSelectedPair: (pair: Pair) => void;
  stake: number;
  setStake: (value: number) => void;
  rfTickDuration: number | string;
  setRfTickDuration: (value: number | string) => void;
  rfAllowEquals: boolean;
  setRfAllowEquals: React.Dispatch<React.SetStateAction<boolean>>;
  onPlaceTrade: (type: "Rise" | "Fall", duration: number | string) => void;
  onPlaceDoubleTrade: (duration: number | string) => void;
  currency: string;
  tradeHistory: any[];
  onClearHistory: () => void;
  pairQuotesRef: { current: Record<Pair, number[]> };
  tradeHistoryPanel: React.ReactNode;
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

  const [rfSelectedAction, setRfSelectedAction] = useState<
    "Rise" | "Fall" | "Both" | "Auto" | "Dual Auto" | null
  >(null);
  const rfSelectedResetRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const [dualAutoEnabled, setDualAutoEnabled] = useState(false);
  const dualAutoCooldownRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const dualAutoLastPlacedRef = useRef(0);
  const [dualAutoCooldownLeft, setDualAutoCooldownLeft] = useState(0);
  const [dualAutoScope, setDualAutoScope] = useState<"selected" | "best-step">("selected");
  const [dualAutoTakeProfit, setDualAutoTakeProfit] = useState<string>("");
  const dualAutoStartNetRef = useRef<number | null>(null);
  const [dualAutoStopReason, setDualAutoStopReason] = useState<string>("");

  const getTradeNetValue = (trade: any) => {
    if (typeof trade?.profit === "number") return trade.profit;
    if (typeof trade?.pnl === "number") return trade.pnl;
    if (typeof trade?.netProfit === "number") return trade.netProfit;
    if (typeof trade?.profitLoss === "number") return trade.profitLoss;
    if (typeof trade?.pl === "number") return trade.pl;
    return 0;
  };

  const currentNetProfit = tradeHistory.reduce((sum, trade) => sum + getTradeNetValue(trade), 0);
  const dualAutoTakeProfitValue = Number(dualAutoTakeProfit);
  const dualAutoSessionNet =
    dualAutoStartNetRef.current === null ? 0 : currentNetProfit - dualAutoStartNetRef.current;

  const totalTicks = tickMoves.length;
  const activeTicks = upTicks + downTicks;
  const activityRatio = totalTicks > 0 ? activeTicks / totalTicks : 0;
  const imbalance = Math.abs(upTicks - downTicks);
  const moveRange = last12Quotes.length
    ? Math.max(...last12Quotes) - Math.min(...last12Quotes)
    : 0;

  const avgAbsMove = tickMoves.length
    ? tickMoves.reduce((sum, move) => sum + Math.abs(move), 0) / tickMoves.length
    : 0;

  const last5Moves = tickMoves.slice(-5);
  const recentBurst = last5Moves.length
    ? last5Moves.reduce((sum, move) => sum + Math.abs(move), 0) / last5Moves.length
    : 0;

  const directionFlips = tickMoves.reduce((count, move, index, arr) => {
    if (index === 0) return 0;
    const prev = arr[index - 1];
    if (move === 0 || prev === 0) return count;
    return Math.sign(move) !== Math.sign(prev) ? count + 1 : count;
  }, 0);

  const rfDurationForAnalysis = rfTickDuration === "15s" ? 15 : Number(rfTickDuration);

  const durationVolatilityNeed =
    rfDurationForAnalysis <= 2
      ? 0.12
      : rfDurationForAnalysis <= 5
        ? 0.09
        : rfDurationForAnalysis <= 10
          ? 0.06
          : 0.04;

  const dualAutoConfidence = Math.max(
    0,
    Math.min(
      100,
      activityRatio * 32 +
        Math.min(22, avgAbsMove * 5000) +
        Math.min(18, recentBurst * 6000) +
        Math.min(14, moveRange * 2500) +
        Math.min(8, directionFlips * 1.5) -
        Math.min(18, flatTicks * 6) -
        Math.min(12, imbalance * 2.5),
    ),
  );

  const dualAutoThreshold =
    rfDurationForAnalysis <= 2
      ? 88
      : rfDurationForAnalysis <= 5
        ? 84
        : rfDurationForAnalysis <= 10
          ? 80
          : 76;

  const dualAutoReady =
    last12Quotes.length >= 12 &&
    latestQuote !== null &&
    dualAutoConfidence >= dualAutoThreshold &&
    activityRatio >= 0.85 &&
    flatTicks <= 1 &&
    avgAbsMove >= durationVolatilityNeed &&
    recentBurst >= durationVolatilityNeed * 0.9 &&
    moveRange >= durationVolatilityNeed * Math.max(2, Math.min(rfDurationForAnalysis, 6));

  const dualAutoDurationOptions = [2, 4, 6, 8, 10] as const;

  const getDualDurationNeed = (ticks: number) =>
    ticks <= 2 ? 0.12 : ticks <= 4 ? 0.095 : ticks <= 6 ? 0.075 : ticks <= 8 ? 0.055 : 0.04;

  const dualAutoDurationScores = dualAutoDurationOptions.map((ticks) => {
    const need = getDualDurationNeed(ticks);

    const fitScore =
      activityRatio * 28 +
      Math.min(24, (avgAbsMove / Math.max(need, 0.0001)) * 12) +
      Math.min(20, (recentBurst / Math.max(need * 0.9, 0.0001)) * 10) +
      Math.min(18, (moveRange / Math.max(need * Math.max(2, Math.min(ticks, 6)), 0.0001)) * 12) +
      Math.min(8, directionFlips * 1.2) -
      Math.min(20, flatTicks * 7) -
      Math.min(14, imbalance * 2.5);

    return {
      ticks,
      score: Math.max(0, Math.min(100, fitScore)),
      ready:
        last12Quotes.length >= 12 &&
        latestQuote !== null &&
        activityRatio >= 0.82 &&
        flatTicks <= 1 &&
        avgAbsMove >= need &&
        recentBurst >= need * 0.85 &&
        moveRange >= need * Math.max(2, Math.min(ticks, 6)),
    };
  });

  const recommendedDualDuration =
    dualAutoDurationScores
      .slice()
      .sort((a, b) => {
        if (a.ready !== b.ready) return Number(b.ready) - Number(a.ready);
        return b.score - a.score;
      })[0] ?? { ticks: rfDurationForAnalysis, score: 0, ready: false };

  const buildDualAutoMetrics = (pair: Pair) => {
    const pairQuotes = (pairQuotesRef.current[pair] ?? []).slice(-12);

    if (pairQuotes.length < 12) {
      return {
        pair,
        ready: false,
        confidence: 0,
        threshold: 100,
        recommendedDuration: { ticks: rfDurationForAnalysis, score: 0, ready: false },
      };
    }

    const moves = pairQuotes.slice(1).map((q, i) => q - pairQuotes[i]);
    const up = moves.filter((m) => m > 0).length;
    const down = moves.filter((m) => m < 0).length;
    const flat = moves.filter((m) => m === 0).length;
    const total = moves.length;
    const active = up + down;
    const activity = total > 0 ? active / total : 0;
    const pairImbalance = Math.abs(up - down);
    const pairMoveRange = Math.max(...pairQuotes) - Math.min(...pairQuotes);

    const pairAvgAbsMove = moves.length
      ? moves.reduce((sum, move) => sum + Math.abs(move), 0) / moves.length
      : 0;

    const pairLast5Moves = moves.slice(-5);
    const pairRecentBurst = pairLast5Moves.length
      ? pairLast5Moves.reduce((sum, move) => sum + Math.abs(move), 0) / pairLast5Moves.length
      : 0;

    const pairDirectionFlips = moves.reduce((count, move, index, arr) => {
      if (index === 0) return 0;
      const prev = arr[index - 1];
      if (move === 0 || prev === 0) return count;
      return Math.sign(move) !== Math.sign(prev) ? count + 1 : count;
    }, 0);

    const scoreRows = dualAutoDurationOptions.map((ticks) => {
      const need = getDualDurationNeed(ticks);

      const fitScore =
        activity * 28 +
        Math.min(24, (pairAvgAbsMove / Math.max(need, 0.0001)) * 12) +
        Math.min(20, (pairRecentBurst / Math.max(need * 0.9, 0.0001)) * 10) +
        Math.min(18, (pairMoveRange / Math.max(need * Math.max(2, Math.min(ticks, 6)), 0.0001)) * 12) +
        Math.min(8, pairDirectionFlips * 1.2) -
        Math.min(20, flat * 7) -
        Math.min(14, pairImbalance * 2.5);

      return {
        ticks,
        score: Math.max(0, Math.min(100, fitScore)),
        ready:
          activity >= 0.82 &&
          flat <= 1 &&
          pairAvgAbsMove >= need &&
          pairRecentBurst >= need * 0.85 &&
          pairMoveRange >= need * Math.max(2, Math.min(ticks, 6)),
      };
    });

    const recommendedDuration =
      scoreRows
        .slice()
        .sort((a, b) => {
          if (a.ready !== b.ready) return Number(b.ready) - Number(a.ready);
          return b.score - a.score;
        })[0] ?? { ticks: rfDurationForAnalysis, score: 0, ready: false };

    const threshold =
      recommendedDuration.ticks <= 2
        ? 88
        : recommendedDuration.ticks <= 5
          ? 84
          : recommendedDuration.ticks <= 10
            ? 80
            : 76;

    const need = getDualDurationNeed(recommendedDuration.ticks);

    const confidence = Math.max(
      0,
      Math.min(
        100,
        activity * 32 +
          Math.min(22, pairAvgAbsMove * 5000) +
          Math.min(18, pairRecentBurst * 6000) +
          Math.min(14, pairMoveRange * 2500) +
          Math.min(8, pairDirectionFlips * 1.5) -
          Math.min(18, flat * 6) -
          Math.min(12, pairImbalance * 2.5),
      ),
    );

    const ready =
      confidence >= threshold &&
      activity >= 0.85 &&
      flat <= 1 &&
      pairAvgAbsMove >= need &&
      pairRecentBurst >= need * 0.9 &&
      pairMoveRange >= need * Math.max(2, Math.min(recommendedDuration.ticks, 6));

    return {
      pair,
      ready,
      confidence,
      threshold,
      recommendedDuration,
    };
  };

  const dualAutoStepCandidates = STEP_ONLY_PAIRS
    .map((pair) => buildDualAutoMetrics(pair))
    .sort((a, b) => {
      if (a.ready !== b.ready) return Number(b.ready) - Number(a.ready);
      if (b.confidence !== a.confidence) return b.confidence - a.confidence;
      return b.recommendedDuration.score - a.recommendedDuration.score;
    });

  const bestDualAutoStepCandidate = dualAutoStepCandidates[0] ?? null;
  const readyDualAutoStepCandidates = dualAutoStepCandidates.filter(
    (candidate) => candidate.ready && candidate.confidence >= 87,
  );

  const dualAutoTargetPair =
    dualAutoScope === "best-step" && bestDualAutoStepCandidate
      ? bestDualAutoStepCandidate.pair
      : selectedPair;

  const dualAutoExecutionDuration = rfTickDuration;

  const dualAutoExecutionConfidence =
    dualAutoScope === "best-step" && bestDualAutoStepCandidate
      ? bestDualAutoStepCandidate.confidence
      : dualAutoConfidence;

  const dualAutoExecutionReadyBase =
    dualAutoScope === "best-step" && bestDualAutoStepCandidate
      ? bestDualAutoStepCandidate.ready
      : dualAutoReady;

  const dualAutoExecutionReady =
  dualAutoExecutionReadyBase &&
  trendDirection !== "SIDEWAYS" &&
  dualAutoExecutionConfidence >= 87;

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

  const triggerRfSelectedAction = (action: "Rise" | "Fall" | "Both" | "Auto" | "Dual Auto") => {
    setRfSelectedAction(action);

    if (rfSelectedResetRef.current) {
      clearTimeout(rfSelectedResetRef.current);
    }

    rfSelectedResetRef.current = setTimeout(() => {
      setRfSelectedAction(null);
      rfSelectedResetRef.current = null;
    }, 3000);
  };

  useEffect(() => {
    if (!dualAutoEnabled) {
      setDualAutoCooldownLeft(0);
      if (dualAutoCooldownRef.current) {
        clearInterval(dualAutoCooldownRef.current);
        dualAutoCooldownRef.current = null;
      }
      return;
    }

    const updateCooldown = () => {
      const remaining = Math.max(0, 60000 - (Date.now() - dualAutoLastPlacedRef.current));
      setDualAutoCooldownLeft(Math.ceil(remaining / 1000));
    };

    updateCooldown();

    if (!dualAutoCooldownRef.current) {
      dualAutoCooldownRef.current = setInterval(updateCooldown, 1000);
    }

    return () => {
      if (dualAutoCooldownRef.current) {
        clearInterval(dualAutoCooldownRef.current);
        dualAutoCooldownRef.current = null;
      }
    };
  }, [dualAutoEnabled]);
  useEffect(() => {
  if (STEP_ONLY_PAIRS.includes(selectedPair)) return;
  setSelectedPair(STEP_ONLY_PAIRS[0]);
}, [selectedPair, setSelectedPair]);

  useEffect(() => {
    if (!dualAutoEnabled || dualAutoCooldownLeft > 0) return;

    if (dualAutoScope === "best-step") {
      const bestCandidate = readyDualAutoStepCandidates[0];
      if (!bestCandidate) return;

      triggerRfSelectedAction("Dual Auto");

      if (bestCandidate.pair !== selectedPair) {
        setSelectedPair(bestCandidate.pair);
        return;
      }

      onPlaceDoubleTrade(rfTickDuration);
      dualAutoLastPlacedRef.current = Date.now();
      setDualAutoCooldownLeft(60);
      return;
    }

    if (!dualAutoExecutionReady) return;
    if (dualAutoExecutionConfidence < 87) return;

    triggerRfSelectedAction("Dual Auto");

    if (dualAutoTargetPair !== selectedPair) {
      setSelectedPair(dualAutoTargetPair);
      return;
    }

    onPlaceDoubleTrade(dualAutoExecutionDuration);
    dualAutoLastPlacedRef.current = Date.now();
    setDualAutoCooldownLeft(60);
  }, [
    dualAutoEnabled,
    dualAutoScope,
    dualAutoExecutionReady,
    dualAutoCooldownLeft,
    dualAutoExecutionConfidence,
    dualAutoTargetPair,
    selectedPair,
    dualAutoExecutionDuration,
    onPlaceDoubleTrade,
    setSelectedPair,
    rfTickDuration,
    readyDualAutoStepCandidates,
  ]);

  useEffect(() => {
    if (!dualAutoEnabled) return;
    if (!Number.isFinite(dualAutoTakeProfitValue) || dualAutoTakeProfitValue <= 0) return;
    if (dualAutoStartNetRef.current === null) return;

    if (dualAutoSessionNet >= dualAutoTakeProfitValue) {
      setDualAutoEnabled(false);
      setDualAutoStopReason(`Take profit hit: ${dualAutoSessionNet.toFixed(2)} ${currency}`);
      dualAutoStartNetRef.current = null;
    }
  }, [dualAutoEnabled, dualAutoSessionNet, dualAutoTakeProfitValue, currency]);

  useEffect(() => {
    return () => {
      if (rfSelectedResetRef.current) {
        clearTimeout(rfSelectedResetRef.current);
      }
      if (dualAutoCooldownRef.current) {
        clearInterval(dualAutoCooldownRef.current);
        dualAutoCooldownRef.current = null;
      }
    };
  }, []);

  return (
    <div className="overflow-hidden rounded-[28px] border border-cyan-400/15 bg-[radial-gradient(circle_at_top_left,rgba(59,130,246,0.18),rgba(15,23,42,0.95)_45%,rgba(2,6,23,0.98))] shadow-[0_25px_80px_rgba(0,0,0,0.45)]">
      <div className="p-6 md:p-7">
        <div className="flex flex-col gap-4 md:flex-row md:items-start md:justify-between">
          <div>
            <div className="flex items-center gap-3">
              <div className="flex h-12 w-12 items-center justify-center rounded-2xl border border-cyan-400/25 bg-cyan-500/10 text-xl text-cyan-300">
                ↕
              </div>
              <div>
                <p className="text-[1.9rem] font-bold tracking-tight text-white">Rise/Fall</p>
                <p className="mt-1 text-sm text-white/55">
                  Smart trend mode reads live ticks and suggests the strongest direction.
                </p>
              </div>
            </div>
          </div>

          <div className="flex flex-wrap gap-2">
            <span className="inline-flex items-center rounded-full border border-cyan-400/20 bg-cyan-500/10 px-3 py-1 text-[11px] font-semibold uppercase tracking-wide text-cyan-200">
              Pair: {selectedPair}
            </span>
            <span className="inline-flex items-center rounded-full border border-white/10 bg-white/5 px-3 py-1 text-[11px] font-semibold uppercase tracking-wide text-white/70">
              Stake: {stake.toFixed(2)} {currency}
            </span>
            <span className="inline-flex items-center rounded-full border border-white/10 bg-white/5 px-3 py-1 text-[11px] font-semibold uppercase tracking-wide text-white/70">
              {rfTickDuration === "15s"
                ? "15 Seconds"
                : `${rfTickDuration} Tick${Number(rfTickDuration) > 1 ? "s" : ""}`}
            </span>
          </div>
        </div>

        <div className="mt-6 grid grid-cols-1 gap-5 xl:grid-cols-12">
          <div className="xl:col-span-6 rounded-[24px] border border-white/10 bg-[linear-gradient(135deg,rgba(15,23,42,0.92),rgba(2,6,23,0.96))] p-5 shadow-[0_0_0_1px_rgba(255,255,255,0.02)]">
            <div className="flex items-center justify-between gap-3">
              <div>
                <p className="text-[11px] uppercase tracking-[0.24em] text-white/45">Index</p>
                <p className="mt-1 text-sm text-white/65">Choose the market for live Rise/Fall analysis.</p>
              </div>
              <div className="rounded-xl border border-sky-400/20 bg-sky-500/10 px-3 py-1 text-xs font-semibold text-sky-200">
                Live
              </div>
            </div>
            <select
              className="mt-4 w-full rounded-xl border border-white/10 bg-black/40 px-4 py-3 text-base text-white outline-none transition focus:border-cyan-400/40 focus:ring-2 focus:ring-cyan-400/20"
              value={selectedPair}
              onChange={(e) => setSelectedPair(e.target.value as Pair)}
            >
              {STEP_ONLY_PAIRS.map((p) => (
                <option key={p} value={p}>
                  {p}
                </option>
              ))}
            </select>
          </div>

          <div className="xl:col-span-6 rounded-[24px] border border-white/10 bg-[linear-gradient(135deg,rgba(15,23,42,0.92),rgba(2,6,23,0.96))] p-5 shadow-[0_0_0_1px_rgba(255,255,255,0.02)]">
            <div className="flex items-center justify-between gap-3">
              <div>
                <p className="text-[11px] uppercase tracking-[0.24em] text-white/45">Stake</p>
                <p className="mt-1 text-sm text-white/65">Set your amount for each Rise/Fall entry.</p>
              </div>
              <div className="rounded-xl border border-white/10 bg-white/5 px-3 py-1 text-xs font-semibold text-white/75">
                {currency}
              </div>
            </div>
            <div className="mt-4 flex items-center gap-3">
              <input
                type="number"
                min={0}
                step={0.01}
                className="w-full rounded-xl border border-white/10 bg-black/40 px-4 py-3 text-base text-white outline-none transition focus:border-cyan-400/40 focus:ring-2 focus:ring-cyan-400/20"
                value={stake}
                onChange={(e) => setStake(Number(e.target.value))}
              />
              <span className="text-sm font-semibold text-white/55">{currency}</span>
            </div>
          </div>

          <div className="xl:col-span-6 rounded-[24px] border border-white/10 bg-[linear-gradient(135deg,rgba(15,23,42,0.92),rgba(2,6,23,0.96))] p-5 shadow-[0_0_0_1px_rgba(255,255,255,0.02)]">
            <div className="flex items-center justify-between gap-3">
              <div>
                <p className="text-[11px] uppercase tracking-[0.24em] text-white/45">Duration</p>
                <p className="mt-1 text-sm text-white/65">Shorter durations react faster. 3–10 ticks is usually cleaner.</p>
              </div>
              <div className="rounded-xl border border-amber-400/20 bg-amber-500/10 px-3 py-1 text-xs font-semibold text-amber-200">
                Presets
              </div>
            </div>

            <select
              className="mt-4 w-full rounded-xl border border-white/10 bg-black/40 px-4 py-3 text-base text-white outline-none transition focus:border-cyan-400/40 focus:ring-2 focus:ring-cyan-400/20"
              value={rfTickDuration === "15s" ? "15s" : String(rfTickDuration)}
              onChange={(e) => {
                const value = e.target.value;
                setRfTickDuration(value === "15s" ? "15s" : Number(value));
              }}
            >
              <option value="2">2 Ticks</option>
              <option value="4">4 Ticks</option>
              <option value="6">6 Ticks</option>
              <option value="8">8 Ticks</option>
              <option value="10">10 Ticks</option>
              <option value="15s">15 Seconds</option>
            </select>

            <p className="mt-3 text-[12px] leading-6 text-white/45">
              Choose a preset duration. 2–10 ticks is best for fast entries, while 15 seconds gives a slower confirmation window.
            </p>
          </div>

          <div className="xl:col-span-12 rounded-[24px] border border-white/10 bg-[linear-gradient(135deg,rgba(15,23,42,0.92),rgba(2,6,23,0.96))] p-5 shadow-[0_0_0_1px_rgba(255,255,255,0.02)]">
            <div className="flex items-start justify-between gap-4">
              <div>
                <p className="text-[11px] uppercase tracking-[0.24em] text-white/45">Trend Engine</p>
                <p className="mt-1 text-sm text-white/65">Live signal quality, direction, and momentum.</p>
              </div>
              <span
                className={`inline-flex rounded-full border px-3 py-1 text-[11px] font-bold uppercase tracking-wide ${
                  trendDirection === "UPTREND"
                    ? "border-emerald-400/25 bg-emerald-500/10 text-emerald-200"
                    : trendDirection === "DOWNTREND"
                      ? "border-rose-400/25 bg-rose-500/10 text-rose-200"
                      : "border-amber-400/25 bg-amber-500/10 text-amber-200"
                }`}
              >
                {trendDirection}
              </span>
            </div>

            <div className="mt-5 grid grid-cols-1 gap-3 md:grid-cols-2 xl:grid-cols-4">
              <div className="rounded-2xl border border-white/10 bg-black/20 p-4">
                <p className="text-[11px] uppercase tracking-wide text-white/45">Current Quote</p>
                <p className="mt-2 text-2xl font-bold text-white">
                  {latestQuote !== null ? latestQuote : "Waiting..."}
                </p>
              </div>

              <div className="rounded-2xl border border-cyan-400/15 bg-cyan-500/8 p-4">
                <p className="text-[11px] uppercase tracking-wide text-white/45">Auto Decision</p>
                <p className="mt-2 text-2xl font-bold text-cyan-300">{recommendedTrade ?? "WAIT"}</p>
              </div>

              <div className="rounded-2xl border border-violet-400/15 bg-violet-500/8 p-4">
                <p className="text-[11px] uppercase tracking-wide text-white/45">Dual Auto Confidence</p>
                <p className="mt-2 text-2xl font-bold text-violet-300">{dualAutoConfidence.toFixed(0)}%</p>
              </div>

              <div className="rounded-2xl border border-amber-400/15 bg-amber-500/8 p-4">
                <p className="text-[11px] uppercase tracking-wide text-white/45">Recommended Dual Duration</p>
                <p className="mt-2 text-2xl font-bold text-amber-300">{recommendedDualDuration.ticks} ticks</p>
                <p className="mt-1 text-[11px] text-white/65">Fit score: {recommendedDualDuration.score.toFixed(0)}%</p>
              </div>
            </div>

            <div className="mt-4 grid grid-cols-1 gap-3 md:grid-cols-3">
              <div className="rounded-2xl border border-emerald-400/12 bg-emerald-500/6 p-4">
                <p className="text-[11px] uppercase tracking-wide text-white/45">Up Ticks</p>
                <p className="mt-2 text-xl font-bold text-emerald-300">{upTicks}</p>
              </div>
              <div className="rounded-2xl border border-rose-400/12 bg-rose-500/6 p-4">
                <p className="text-[11px] uppercase tracking-wide text-white/45">Down Ticks</p>
                <p className="mt-2 text-xl font-bold text-rose-300">{downTicks}</p>
              </div>
              <div className="rounded-2xl border border-white/10 bg-white/5 p-4">
                <p className="text-[11px] uppercase tracking-wide text-white/45">Flat</p>
                <p className="mt-2 text-xl font-bold text-white/80">{flatTicks}</p>
              </div>
            </div>

            <div className="mt-4 space-y-3 rounded-2xl border border-white/10 bg-black/20 p-4 text-sm text-white/70">
              <div className="flex items-center justify-between gap-3">
                <span>Move 6 / 12 / 20</span>
                <span className="font-semibold text-white/90">
                  {shortMove.toFixed(4)} / {mediumMove.toFixed(4)} / {longMove.toFixed(4)}
                </span>
              </div>
              <div className="flex items-center justify-between gap-3">
                <span>Avg Tick Move</span>
                <span className="font-semibold text-white/90">{avgMove.toFixed(5)}</span>
              </div>
              <div className="flex items-center justify-between gap-3">
                <span>Strength</span>
                <span className="font-semibold text-white/90">{trendStrength.toFixed(4)}</span>
              </div>
            </div>
          </div>
        </div>

        <div className="mt-5 rounded-xl border border-white/10 bg-black/20 p-4">
          <div className="flex items-center justify-between gap-3">
            <div className="rounded-xl border border-white/10 bg-black/20 p-3">
              <p className="mb-2 text-[11px] text-white/60">Live Market Chart — {selectedPair}</p>
              <DerivChart symbol={selectedPair} />
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
                  className={`rounded-lg border bg-black/30 px-3 py-2 text-[11px] ${item.tone}`}
                >
                  {item.arrow} {item.value}
                </div>
              ))
            )}
          </div>
        </div>

        <div className="mt-5 rounded-xl border border-white/10 bg-black/20 p-4">
          <p className="text-[11px] uppercase tracking-wide text-white/60">Trade actions</p>

          <div className="mt-4 space-y-3">
            <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
              <button
                type="button"
                onClick={() => {
                  triggerRfSelectedAction("Rise");
                  onPlaceTrade("Rise", rfTickDuration);
                }}
                className={`rounded-xl border px-4 py-4 text-center font-bold tracking-wide shadow-md transition-all duration-200 ${
                  rfSelectedAction === "Rise"
                    ? "border-emerald-200 bg-gradient-to-r from-emerald-400 to-emerald-500 text-white ring-4 ring-emerald-300/60 shadow-[0_0_28px_rgba(16,185,129,0.50)]"
                    : "border-emerald-900/80 bg-gradient-to-r from-emerald-950 to-emerald-900 text-emerald-100/90 hover:border-emerald-700"
                }`}
              >
                <div className="flex items-center justify-center gap-2 text-2xl leading-none">
                  <span>↑</span>
                  <span>RISE</span>
                  {rfSelectedAction === "Rise" && <span className="text-base">✓</span>}
                </div>
                <div className="mt-1.5 text-xl font-semibold opacity-95">${stake.toFixed(2)}</div>
              </button>

              <button
                type="button"
                onClick={() => {
                  triggerRfSelectedAction("Fall");
                  onPlaceTrade("Fall", rfTickDuration);
                }}
                className={`rounded-xl border px-4 py-4 text-center font-bold tracking-wide shadow-md transition-all duration-200 ${
                  rfSelectedAction === "Fall"
                    ? "border-rose-200 bg-gradient-to-r from-rose-400 to-pink-500 text-white ring-4 ring-rose-300/60 shadow-[0_0_28px_rgba(244,63,94,0.50)]"
                    : "border-rose-900/80 bg-gradient-to-r from-rose-950 to-rose-900 text-rose-100/90 hover:border-rose-700"
                }`}
              >
                <div className="flex items-center justify-center gap-2 text-2xl leading-none">
                  <span>↓</span>
                  <span>FALL</span>
                  {rfSelectedAction === "Fall" && <span className="text-base">✓</span>}
                </div>
                <div className="mt-1.5 text-xl font-semibold opacity-95">${stake.toFixed(2)}</div>
              </button>
            </div>

            <button
              type="button"
              onClick={() => {
                triggerRfSelectedAction("Both");
                onPlaceDoubleTrade(rfTickDuration);
              }}
              className={`w-full rounded-xl border px-4 py-4 text-center font-bold tracking-wide shadow-md transition-all duration-200 ${
                rfSelectedAction === "Both"
                  ? "border-sky-200 bg-gradient-to-r from-blue-400 via-cyan-400 to-blue-500 text-white ring-4 ring-sky-300/60 shadow-[0_0_30px_rgba(56,189,248,0.50)]"
                  : "border-sky-900/80 bg-gradient-to-r from-slate-950 via-sky-950 to-slate-900 text-sky-100/90 hover:border-sky-700"
              }`}
            >
              <div className="flex items-center justify-center gap-2 text-2xl leading-none">
                <span className="text-emerald-300">↑</span>
                <span>RISE + FALL</span>
                <span className="text-rose-300">↓</span>
                {rfSelectedAction === "Both" && <span className="text-base text-white">✓</span>}
              </div>
              <div className="mt-1.5 text-xl font-semibold opacity-95">
                2x ${stake.toFixed(2)} = {(stake * 2).toFixed(2)}
              </div>
            </button>

            <button
              type="button"
              onClick={() => {
                triggerRfSelectedAction("Auto");
                if (recommendedTrade) onPlaceTrade(recommendedTrade, rfTickDuration);
              }}
              disabled={!recommendedTrade}
              className={`w-full rounded-xl border px-4 py-3 text-center font-semibold transition-all duration-200 ${
                !recommendedTrade
                  ? "cursor-not-allowed border-white/10 bg-slate-900 text-white/35"
                  : rfSelectedAction === "Auto"
                    ? "border-violet-200 bg-gradient-to-r from-violet-500 to-fuchsia-500 text-white ring-4 ring-violet-300/60 shadow-[0_0_28px_rgba(168,85,247,0.48)]"
                    : "border-violet-950/80 bg-gradient-to-r from-slate-950 to-violet-950 text-violet-100/90 hover:border-violet-700"
              }`}
            >
              <>
                Auto trade: {recommendedTrade ?? "Waiting..."}
                {rfSelectedAction === "Auto" && recommendedTrade && <span className="ml-2">✓</span>}
              </>
            </button>

            <div className="w-full rounded-xl border border-white/10 bg-black/20 p-3">
              <label className="mb-2 block text-[11px] font-medium uppercase tracking-wide text-white/55">
                Dual Auto Scan Mode
              </label>
              <select
                value={dualAutoScope}
                onChange={(e) => setDualAutoScope(e.target.value as "selected" | "best-step")}
                className="w-full rounded-lg border border-white/10 bg-slate-950 px-3 py-2 text-sm text-white outline-none"
              >
                <option value="selected">Current selected index</option>
                <option value="best-step">Scan all Step indexes</option>
              </select>

              <p className="mt-2 text-[11px] text-white/60">
                {dualAutoScope === "best-step"
                  ? bestDualAutoStepCandidate
                    ? `Best Step pair now: ${bestDualAutoStepCandidate.pair} • using selected duration ${rfTickDuration === "15s" ? "15 Seconds" : `${rfTickDuration} ticks`} • ${bestDualAutoStepCandidate.confidence.toFixed(0)}% confidence`
                    : "Scanning Step indexes for the best pair..."
                  : `Using current index: ${selectedPair}`}
              </p>
            </div>

            <button
              type="button"
              onClick={() => {
                triggerRfSelectedAction("Dual Auto");
                setDualAutoStopReason("");
                setDualAutoEnabled((v) => {
                  const next = !v;
                  if (next) {
                    dualAutoStartNetRef.current = currentNetProfit;
                  } else {
                    dualAutoStartNetRef.current = null;
                  }
                  return next;
                });
              }}
              className={`w-full rounded-xl border px-4 py-3 text-center font-semibold transition-all duration-200 ${
                dualAutoEnabled
                  ? "border-amber-200 bg-gradient-to-r from-amber-500 to-orange-500 text-white ring-4 ring-amber-300/60 shadow-[0_0_28px_rgba(251,146,60,0.48)]"
                  : "border-amber-950/80 bg-gradient-to-r from-slate-950 to-amber-950 text-amber-100/90 hover:border-amber-700"
              }`}
            >
              <div className="flex items-center justify-center gap-2">
                <span>Dual Auto</span>
                {dualAutoEnabled && <span>✓</span>}
              </div>
              <div className="mt-1 text-xs font-medium text-white/80">
                {dualAutoEnabled
                  ? dualAutoCooldownLeft > 0
                    ? `Cooldown: ${dualAutoCooldownLeft}s • ${dualAutoTargetPair} • ${rfTickDuration === "15s" ? "15 Seconds" : `${dualAutoExecutionDuration} ticks`} queued`
                    : dualAutoExecutionReady
                        ? `Ready • ${dualAutoScope === "best-step" ? readyDualAutoStepCandidates[0]?.pair ?? "No Step pair" : dualAutoTargetPair} • ${rfTickDuration === "15s" ? "15 Seconds" : `${dualAutoExecutionDuration} ticks`} • ${dualAutoExecutionConfidence.toFixed(0)}% confidence`
                        : trendDirection === "SIDEWAYS"
                        ? `Blocked • sideways trend • ${dualAutoExecutionConfidence.toFixed(0)}% confidence`
                        : `Watching • need 87%+ confidence • current ${dualAutoExecutionConfidence.toFixed(0)}%`
                  : dualAutoScope === "best-step"
                    ? "Scans all Step indexes and uses your selected duration"
                    : `Places 1 Rise + 1 Fall on ${selectedPair}`}
              </div>
            </button>

            <div className="w-full rounded-xl border border-white/10 bg-black/20 p-3">
              <label className="mb-2 block text-[11px] font-medium uppercase tracking-wide text-white/55">
                Dual Auto Take Profit
              </label>
              <input
                type="number"
                min={0}
                step={0.01}
                value={dualAutoTakeProfit}
                onChange={(e) => setDualAutoTakeProfit(e.target.value)}
                placeholder="Enter take profit amount"
                className="w-full rounded-lg border border-white/10 bg-slate-950 px-3 py-2 text-sm text-white outline-none"
              />
              <p className="mt-2 text-[11px] text-white/60">
                When Dual Auto session profit reaches this amount, Dual Auto switches off automatically.
              </p>
              <p className="mt-1 text-[11px] text-emerald-300/90">
                Session net: {dualAutoSessionNet.toFixed(2)} {currency}
              </p>
              {dualAutoStopReason && (
                <p className="mt-1 text-[11px] text-amber-300/90">{dualAutoStopReason}</p>
              )}
            </div>

            <button
              type="button"
              aria-pressed={rfAllowEquals}
              onClick={() => setRfAllowEquals((v) => !v)}
              className={`w-full rounded-xl border px-4 py-3 text-left font-semibold transition-all duration-200 ${
                rfAllowEquals
                  ? "border-emerald-200 bg-gradient-to-r from-emerald-500 to-teal-500 text-white ring-4 ring-emerald-300/60 shadow-[0_0_28px_rgba(16,185,129,0.48)]"
                  : "border-white/10 bg-slate-950 text-white/85 hover:border-white/20"
              }`}
            >
              <div className="flex items-center justify-between gap-4">
                <div>
                  <div className="flex items-center gap-2 text-sm uppercase tracking-wide text-white/65">
                    <span>Allow Equals</span>
                    {rfAllowEquals && <span className="text-white">✓</span>}
                  </div>
                  <div className="mt-1 text-base font-bold text-white">{rfAllowEquals ? "ON" : "OFF"}</div>
                  <div className="mt-1 text-xs text-white/70">
                    Equal entry and exit spots count as a win for Rise and Fall trades.
                  </div>
                </div>

                <div
                  className={`relative h-7 w-14 rounded-full border transition ${
                    rfAllowEquals ? "border-white/30 bg-white/20" : "border-white/15 bg-black/30"
                  }`}
                >
                  <span
                    className={`absolute top-0.5 h-5 w-5 rounded-full bg-white shadow transition ${
                      rfAllowEquals ? "right-1" : "left-1"
                    }`}
                  />
                </div>
              </div>
            </button>
          </div>

          <p className="mt-2 text-[11px] font-medium text-cyan-300/90">Selected: {rfSelectedAction ?? "None"}</p>
          <p className="text-[11px] font-medium text-amber-300/90">
            Dual Auto: {dualAutoEnabled
              ? dualAutoCooldownLeft > 0
                ? `Cooling down (${dualAutoCooldownLeft}s) • ${dualAutoTargetPair} • next ${rfTickDuration === "15s" ? "15 Seconds" : `${dualAutoExecutionDuration} ticks`}`
                : dualAutoExecutionReady
                    ? `Armed • ${dualAutoScope === "best-step" ? readyDualAutoStepCandidates[0]?.pair ?? "No Step pair" : dualAutoTargetPair} • ${rfTickDuration === "15s" ? "15 Seconds" : `${dualAutoExecutionDuration} ticks`} • ${dualAutoExecutionConfidence.toFixed(0)}% confidence`
                  : trendDirection === "SIDEWAYS"
                    ? `Blocked • sideways trend • need trend confirmation and 87%+ confidence`
                    : `Watching market • ${dualAutoTargetPair} • selected ${rfTickDuration === "15s" ? "15 Seconds" : `${dualAutoExecutionDuration} ticks`} • ${dualAutoExecutionConfidence.toFixed(0)}%`
              : dualAutoStopReason || "Off"}
          </p>
          <p className="mt-2 text-[11px] text-white/50">
           Auto follows the live trend engine. Dual Auto can either use the current selected index or scan all Step indexes. When scan all Step indexes is selected, it scans all Step indexes, picks the single Step index with the highest confidence that passes the Dual Auto rules, and places one dual Rise + Fall trade on that best pair using your selected duration. The panel also auto-switches to the first Step index if a non-Step market was selected before opening Rise/Fall. It will only place a dual trade when confidence is 87% or higher and the market is not trending sideways. If you set a take profit amount, Dual Auto switches itself off automatically once the session net profit reaches that target. Allow Equals applies to Auto, Dual Auto, Rise, Fall, and Rise + Fall.
          </p>
        </div>

        {tradeHistoryPanel}
      </div>
    </div>
  );
}
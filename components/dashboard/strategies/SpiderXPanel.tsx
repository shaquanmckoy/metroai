// REPLACED FILE CONTENTS
"use client";

import React, { useMemo, useRef, useState } from "react";
import type { Pair } from "@/app/dashboard/page";
import type { UIFlags } from "@/components/dashboard/strategy-types";


type AnalyzerMode = "OVER_0" | "OVER_1" | "OVER_2" | "UNDER_8" | "UNDER_9";

type PairOption = { code: string; label: string };

type PairGroups = {
  volatility: PairOption[];
  jump: PairOption[];
  Step?: PairOption[];
};

type AnalysisResult = { pair: Pair; pct: number; hits: number };

type TradeHistoryItem = {
  id?: string | number;
  symbol?: string;
  status?: string;
  result?: string;
  stake?: number | string;
};

type SpiderXPanelProps = {
  pairs: readonly Pair[];
  indexGroups: PairGroups;
  pairDigitsRef: { current: Record<Pair, number[] | undefined> };
  selectedPair: Pair;
  setSelectedPair: (pair: Pair) => void;
  onPlaceTrade: (tradeType: "Over" | "Under", duration?: number) => void;
  tradeHistory: TradeHistoryItem[];
  tradeHistoryPanel: React.ReactNode;
  currency: string;
  onClearHistory: () => void;
  setStake: (value: number) => void;
  stake: number;
  toggleSpiderRandomAuto: () => void;
  spiderRandomRunning: boolean;
  setSelectedDigit: (digit: number) => void;
  selectedDigit: number | null;
  lastWinDigit: number | null;
  lastLossDigit: number | null;
  uiFlags: UIFlags;
  isAdmin: boolean;
};


export default function SpiderXPanel({
  pairs,
  indexGroups,
  pairDigitsRef,
  selectedPair,
  setSelectedPair,
  onPlaceTrade,
  tradeHistory,
  tradeHistoryPanel,
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
  uiFlags,
  isAdmin,
}: SpiderXPanelProps) {
  const canShow = (key: keyof UIFlags) => isAdmin || uiFlags[key] !== false;

  const ticks = pairDigitsRef.current[selectedPair] ?? [];
  const lastDigit = ticks.length ? ticks[ticks.length - 1] : null;
  const last20 = ticks.slice(-20);

  const mostFrequentDigit = useMemo(() => {
    if (last20.length < 1) return null;
    const freq = Array.from({ length: 10 }, () => 0);
    for (const d of last20) freq[d]++;
    const max = Math.max(...freq);
    return freq.indexOf(max);
  }, [last20]);

  const digitPercent = (d: number) => {
    if (!ticks.length) return 0;
    return (ticks.filter((x: number) => x === d).length / ticks.length) * 100;
  };

  const [mode, setMode] = useState<AnalyzerMode>("OVER_1");
  const [digitPopupOpen, setDigitPopupOpen] = useState(false);
  const [popupDigit, setPopupDigit] = useState<number | null>(null);
  const [barrierDigit, setBarrierDigit] = useState<number>(1);
  const [manualActive, setManualActive] = useState<"Over" | "Under" | null>(null);
  const lastManualRef = useRef<number>(0);

  const [running, setRunning] = useState(false);
  const [secondsLeft, setSecondsLeft] = useState(0);
  const [results, setResults] = useState<AnalysisResult[]>([]);
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

  const computePct = (digits: number[], analyzerMode: AnalyzerMode) => {
    if (digits.length < 20) return { pct: 0, hits: 0 };
    let hits = 0;
    for (const d of digits) {
      if (analyzerMode === "OVER_0" && d > 0) hits++;
      if (analyzerMode === "OVER_1" && d > 1) hits++;
      if (analyzerMode === "OVER_2" && d > 2) hits++;
      if (analyzerMode === "UNDER_8" && d < 8) hits++;
      if (analyzerMode === "UNDER_9" && d < 9) hits++;
    }
    return { hits, pct: (hits / 20) * 100 };
  };

  const getTradeDigitFromMode = (analyzerMode: AnalyzerMode) => {
    if (analyzerMode === "OVER_0") return 0;
    if (analyzerMode === "OVER_1") return 1;
    if (analyzerMode === "OVER_2") return 2;
    if (analyzerMode === "UNDER_8") return 8;
    return 9;
  };

  const startAnalysis = () => {
    if (running) {
      setRunning(false);
      setAutoRunning(false);
      setAnalyzingPairs([]);
      tradedPairsRef.current.clear();
      return;
    }

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

      const scored = pairs.map((pair: Pair) => {
        const pairLast20 = (pairDigitsRef.current[pair] ?? []).slice(-20);
        const { pct, hits } = computePct(pairLast20, mode);
        return { pair, pct, hits };
      });

      const liveTop2 = scored
        .filter((x: AnalysisResult) => (pairDigitsRef.current[x.pair] ?? []).length >= 20)
        .sort((a: AnalysisResult, b: AnalysisResult) => b.pct - a.pct)
        .slice(0, 2);

      setResults(liveTop2);
      setAnalyzingPairs(scored.map((s: AnalysisResult) => s.pair));

      for (const s of scored) {
        if (!autoRunning) break;
        if ((pairDigitsRef.current[s.pair] ?? []).length < 20) continue;
        if (s.pct < TRADE_THRESHOLD) continue;
        if (tradedPairsRef.current.has(s.pair)) continue;

        const tradeType = mode.startsWith("OVER") ? "Over" : "Under";
        const tradeDigit = getTradeDigitFromMode(mode);

        setSelectedPair(s.pair);
        setSelectedDigit(tradeDigit);

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
          .filter((x: AnalysisResult) => (pairDigitsRef.current[x.pair] ?? []).length >= 20)
          .sort((a: AnalysisResult, b: AnalysisResult) => b.pct - a.pct)
          .slice(0, 2);

        setResults(finalResults);
      }
    }, 500);
  };

  return (
    <div className="space-y-6 overflow-hidden rounded-[28px] border border-cyan-400/15 bg-[radial-gradient(circle_at_top_left,rgba(59,130,246,0.18),rgba(15,23,42,0.95)_45%,rgba(2,6,23,0.98))] p-6 shadow-[0_25px_80px_rgba(0,0,0,0.45)]">
      <div className="flex flex-col gap-4 md:flex-row md:items-start md:justify-between">
        <div>
          <div className="flex items-center gap-3">
            <div className="flex h-12 w-12 items-center justify-center rounded-2xl border border-cyan-400/25 bg-cyan-500/10 text-xl text-cyan-300">
              🕷
            </div>
            <div>
              <p className="text-[1.9rem] font-bold tracking-tight text-white">SpiderX</p>
              <p className="mt-1 text-sm text-white/55">
                Smart digit analysis, best-pair scanning, and instant over/under execution.
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
            Barrier: {barrierDigit}
          </span>
        </div>
      </div>
      {canShow("spider_analyzer") && (
        <div className="rounded-[24px] border border-white/10 bg-[linear-gradient(135deg,rgba(15,23,42,0.92),rgba(2,6,23,0.96))] p-5 shadow-[0_0_0_1px_rgba(255,255,255,0.02)]">
          <div className="mb-3 flex items-center justify-between">
            <p className="text-[1.05rem] font-semibold text-white/90">🎯 SpiderX Best Pairs Analyzer</p>
            <button
              onClick={startAnalysis}
              className={`rounded-xl border px-4 py-2.5 text-sm font-semibold transition ${
                running ? "border-white/10 bg-red-600 hover:bg-red-700" : "border-white/10 bg-sky-600 hover:bg-sky-700"
              }`}
            >
              {running ? "Stop Analysis" : "Start Analysis"}
            </button>
          </div>

          <div className="mb-5 flex flex-wrap gap-2">
            {modes.map((m: { key: AnalyzerMode; label: string }) => (
              <button
                key={m.key}
                onClick={() => setMode(m.key)}
                className={`rounded-xl border px-3 py-2 text-xs font-semibold transition ${
                  mode === m.key ? "border-sky-500/30 bg-sky-600/25 text-white" : "border-white/10 bg-white/5 text-white/70"
                }`}
              >
                {m.label}
              </button>
            ))}
          </div>

          <div className="mb-5 rounded-2xl border border-white/10 bg-black/20 p-4">
            <div className="mb-1 flex justify-between text-xs text-white/70">
              <span>TIME</span>
              <span>{running ? `${secondsLeft}s` : "—"}</span>
            </div>

            <div className="h-2 overflow-hidden rounded-full bg-white/10">
              <div
                className="h-full bg-sky-500/80 transition-all"
                style={{ width: running ? `${((30 - secondsLeft) / 30) * 100}%` : "0%" }}
              />
            </div>

            {running && analyzingPairs.length > 0 && (
              <div className="mt-3 flex flex-wrap gap-2">
                {analyzingPairs.map((p: Pair) => (
                  <span key={p} className="rounded-md border border-white/10 bg-white/5 px-2 py-1 text-xs text-white/70">
                    {p}
                  </span>
                ))}
              </div>
            )}
          </div>

          {results.length > 0 && (
            <div className="space-y-3">
              {results.map((r: AnalysisResult, i: number) => {
                const resultLast20 = (pairDigitsRef.current[r.pair] ?? []).slice(-20);

                const label =
                  indexGroups.volatility.find((x: PairOption) => x.code === r.pair)?.label ||
                  indexGroups.jump.find((x: PairOption) => x.code === r.pair)?.label ||
                  r.pair;

                return (
                  <div
                    key={r.pair}
                    className={`rounded-2xl border border-white/10 bg-black/20 p-4 shadow-[0_0_0_1px_rgba(255,255,255,0.02)] ${r.pair === selectedPair ? "ring-2 ring-sky-500/40" : ""}`}
                  >
                    <div className="flex items-center justify-between">
                      <div>
                        <p className="text-sm font-semibold text-white/90">
                          #{i + 1} {label}
                        </p>
                        <button onClick={() => setSelectedPair(r.pair)} className="text-xs font-semibold text-emerald-300 hover:text-emerald-200 transition">
                          ← Click to select
                        </button>
                      </div>

                      <div className="text-right">
                        <p className="text-lg font-extrabold text-emerald-300">{r.pct.toFixed(1)}%</p>
                        <p className="text-[11px] text-white/55">{r.hits}/20 digits</p>
                      </div>
                    </div>

                    <div className="mt-3 flex flex-wrap gap-1">
                      {resultLast20.map((d: number, idx: number) => (
                        <span
                          key={idx}
                          className="flex h-7 w-7 items-center justify-center rounded-lg border border-emerald-400/20 bg-emerald-500/15 text-xs font-semibold text-emerald-100"
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

          {results.length > 0 && (
            <div className="mt-4 space-y-3">
              <button
                onClick={() => {
                  if (autoRunning) {
                    setAutoRunning(false);
                    tradedPairsRef.current.clear();
                    return;
                  }
                  const bad = results.find((r: AnalysisResult) => r.pct < 95);
                  if (bad) {
                    alert(`Auto canceled: ${bad.pair} is only ${bad.pct.toFixed(1)}%`);
                    return;
                  }
                  setAutoRunning(true);
                  tradedPairsRef.current.clear();
                }}
                className={`w-full rounded-xl border py-3.5 text-sm font-semibold transition ${
                  autoRunning ? "animate-pulse bg-red-600 hover:bg-red-700" : "border-emerald-500/40 bg-emerald-600 hover:bg-emerald-700"
                }`}
              >
                {autoRunning ? "Stop Auto Trading" : "⚡ Start Auto Trading"}
              </button>

              <p className="text-center text-xs text-white/60">
                Auto-trades {mode.replace("_", " ")} (1 tick) when percentage ≥ 95%
              </p>
            </div>
          )}
        </div>
      )}

      {digitPopupOpen && popupDigit !== null && (
        <div className="fixed inset-0 z-50 flex items-center justify-center">
          <button className="absolute inset-0 bg-black/60" onClick={() => setDigitPopupOpen(false)} />

          <div className="relative w-[340px] max-w-[92vw] rounded-[24px] border border-white/10 bg-[linear-gradient(135deg,rgba(15,23,42,0.96),rgba(2,6,23,0.98))] p-5 shadow-[0_25px_80px_rgba(0,0,0,0.55)]">
            <div className="grid grid-cols-2 gap-4">
              <button
                onClick={() => {
                  setSelectedDigit(popupDigit);
                  onPlaceTrade("Over", 1);
                  setDigitPopupOpen(false);
                }}
                className="rounded-[20px] bg-emerald-600 py-10 text-xl font-extrabold text-white hover:bg-emerald-700"
              >
                OVER {popupDigit}
              </button>

              <button
                onClick={() => {
                  setSelectedDigit(popupDigit);
                  onPlaceTrade("Under", 1);
                  setDigitPopupOpen(false);
                }}
                className="rounded-[20px] bg-blue-600 py-10 text-xl font-extrabold text-white hover:bg-blue-700"
              >
                UNDER {popupDigit}
              </button>
            </div>

            <div className="mt-4 text-center text-sm font-semibold text-white/60">ADMIN: Instant Over/Under (3 Trades)</div>

            <div className="mt-4 grid grid-cols-2 gap-4">
              <button
                onClick={() => {
                  setSelectedDigit(popupDigit);
                  onPlaceTrade("Over", 1);
                  setTimeout(() => onPlaceTrade("Over", 1), 400);
                  setTimeout(() => onPlaceTrade("Over", 1), 800);
                  setDigitPopupOpen(false);
                }}
                className="rounded-[20px] bg-orange-500 py-8 font-bold text-white hover:bg-orange-600"
              >
                ⚡ Instant Over {popupDigit}
                <div className="mt-2 text-sm text-white/90">(3x trades)</div>
              </button>

              <button
                onClick={() => {
                  setSelectedDigit(popupDigit);
                  onPlaceTrade("Under", 1);
                  setTimeout(() => onPlaceTrade("Under", 1), 400);
                  setTimeout(() => onPlaceTrade("Under", 1), 800);
                  setDigitPopupOpen(false);
                }}
                className="rounded-[20px] bg-purple-600 py-8 font-bold text-white hover:bg-purple-700"
              >
                ⚡ Instant Under {popupDigit}
                <div className="mt-2 text-sm text-white/90">(3x trades)</div>
              </button>
            </div>

            <button
              onClick={() => setDigitPopupOpen(false)}
              className="mt-5 w-full rounded-2xl border border-white/10 bg-white/10 py-3 font-semibold text-white/80 transition hover:bg-white/15"
            >
              Cancel
            </button>
          </div>
        </div>
      )}

      <div className="rounded-[24px] border border-white/10 bg-[linear-gradient(135deg,rgba(15,23,42,0.92),rgba(2,6,23,0.96))] p-5 shadow-[0_0_0_1px_rgba(255,255,255,0.02)]">
        <p className="mb-4 text-sm font-semibold text-white/85">Live Digit Stream</p>

        <div className="mb-4 grid grid-cols-5 gap-3 md:gap-4">
          {Array.from({ length: 10 }, (_: unknown, d: number) => {
            const pct = digitPercent(d);
            const selected = selectedDigit === d;
            const won = lastWinDigit === d;
            const lost = lastLossDigit === d;
            const live = lastDigit === d;
            const most = mostFrequentDigit === d;

            const base = "border-white/10 bg-[#0e1422] text-white/90 hover:bg-white/5";
            const selectedCls = "border-blue-400 bg-blue-600/90 text-white";
            const wonCls = "border-emerald-400 bg-emerald-600/35 text-white";
            const lostCls = "border-red-400 bg-red-600/35 text-white";
            const liveCls = "border-emerald-500/30 bg-emerald-600/20 text-white";
            const mostCls = "border-red-500/35 bg-red-600/20 text-white";

            const cls = selected ? selectedCls : won ? wonCls : lost ? lostCls : live ? liveCls : most ? mostCls : base;

            return (
              <button
                key={d}
                onClick={() => {
                  setSelectedDigit(d);
                  setPopupDigit(d);
                  setDigitPopupOpen(true);
                }}
                className={`relative rounded-2xl border py-3 text-center shadow-[0_0_0_1px_rgba(255,255,255,0.02)] transition ${cls}`}
              >
                {selected && <span className="absolute right-3 top-2 text-sm text-white">✓</span>}
                {!selected && won && <span className="absolute right-3 top-2 text-sm text-emerald-100">💰</span>}
                {!selected && !won && lost && <span className="absolute right-3 top-2 text-sm text-red-100">❌</span>}
                {!selected && !won && !lost && live && <span className="absolute right-3 top-2 text-sm text-emerald-200">●</span>}
                {!selected && !won && !lost && !live && most && <span className="absolute right-3 top-2 text-sm text-red-200">▲</span>}

                <div className="text-lg font-bold leading-none">{d}</div>
                <div className="mt-1 text-[11px] text-white/60">{pct.toFixed(1)}%</div>
              </button>
            );
          })}
        </div>

        <p className="text-center text-xs text-white/60">
          Based on {ticks.length} ticks from <span className="font-semibold">{selectedPair}</span> • Last Digit:{" "}
          <span className="text-xl font-extrabold text-emerald-400">{lastDigit !== null ? lastDigit : "-"}</span>
        </p>
      </div>

      <div className="rounded-[24px] border border-white/10 bg-[linear-gradient(135deg,rgba(15,23,42,0.92),rgba(2,6,23,0.96))] p-5 shadow-[0_0_0_1px_rgba(255,255,255,0.02)]">
        <p className="mb-4 text-sm font-semibold text-white/90">🕷 SpiderX Settings</p>

        <div className="mb-5 grid grid-cols-1 gap-5 md:grid-cols-3">
          <div>
            <p className="mb-2 text-[11px] uppercase tracking-[0.24em] text-white/45">Select Index</p>
            <select
              className="w-full rounded-xl border border-white/10 bg-black/40 px-4 py-3 text-base text-white outline-none transition focus:border-cyan-400/40 focus:ring-2 focus:ring-cyan-400/20"
              value={selectedPair}
              onChange={(e) => setSelectedPair(e.target.value as Pair)}
            >
              <optgroup label="Volatility Indices">
                {indexGroups.volatility.map((s: PairOption) => (
                  <option key={s.code} value={s.code}>
                    {s.label}
                  </option>
                ))}
              </optgroup>
              <optgroup label="Jump Indices">
                {indexGroups.jump.map((s: PairOption) => (
                  <option key={s.code} value={s.code}>
                    {s.label}
                  </option>
                ))}
              </optgroup>
            </select>
          </div>

          <div>
            <p className="mb-2 text-[11px] uppercase tracking-[0.24em] text-white/45">Barrier Number</p>
            <select
              className="w-full rounded-xl border border-white/10 bg-black/40 px-4 py-3 text-base text-white outline-none transition focus:border-cyan-400/40 focus:ring-2 focus:ring-cyan-400/20"
              value={barrierDigit}
              onChange={(e) => {
                const d = Number(e.target.value);
                setBarrierDigit(d);
                setSelectedDigit(d);
              }}
            >
              {Array.from({ length: 10 }, (_: unknown, d: number) => (
                <option key={d} value={d}>
                  {d}
                </option>
              ))}
            </select>
          </div>

          <div>
            <p className="mb-2 text-[11px] uppercase tracking-[0.24em] text-white/45">Tick Duration</p>
            <select className="w-full rounded-xl border border-white/10 bg-black/40 px-4 py-3 text-base text-white outline-none transition focus:border-cyan-400/40 focus:ring-2 focus:ring-cyan-400/20" value={1} disabled>
              <option value={1}>1 Tick</option>
            </select>
          </div>
        </div>

        <div className="mb-4">
          <p className="mb-2 text-[11px] uppercase tracking-[0.24em] text-white/45">Stake Amount</p>

          <div className="flex gap-2">
            <input
              type="number"
              step="0.1"
              min="0.1"
              value={stake}
              onChange={(e) => setStake(Number(e.target.value))}
              className="w-full rounded-xl border border-white/10 bg-black/40 px-4 py-3 text-base text-white outline-none transition focus:border-cyan-400/40 focus:ring-2 focus:ring-cyan-400/20"
            />

            <button onClick={() => setStake(1)} className="rounded-xl border border-white/10 bg-white/5 px-4 py-2 text-sm font-semibold transition hover:bg-white/10">
              $1
            </button>

            <button onClick={() => setStake(5)} className="rounded-xl border border-white/10 bg-white/5 px-4 py-2 text-sm font-semibold transition hover:bg-white/10">
              $5
            </button>

            <button onClick={() => setStake(10)} className="rounded-xl border border-white/10 bg-white/5 px-4 py-2 text-sm font-semibold transition hover:bg-white/10">
              $10
            </button>
          </div>
        </div>

        {canShow("spider_manual_over_under") && (
          <>
            <p className="mb-2 text-sm font-semibold text-white/80">Manual Over / Under Trading</p>
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
                className={`rounded-xl py-3.5 font-semibold transition ${
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
                className={`rounded-xl py-3.5 font-semibold transition ${
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

        {canShow("spider_random_auto") && (
          <div className="mt-4">
            <button
              onClick={toggleSpiderRandomAuto}
              className={`w-full rounded-xl py-3.5 text-sm font-semibold transition ${
                spiderRandomRunning ? "animate-pulse bg-red-600 hover:bg-red-700" : "bg-indigo-600 hover:bg-indigo-700"
              }`}
            >
              {spiderRandomRunning ? "Stop Random Over/Under" : "🎲 Enable Random Over/Under"}
            </button>
            <p className="mt-2 text-center text-xs text-white/60">Takes fast random Over/Under trades (0.4s, 1 tick)</p>
          </div>
        )}
      </div>

    </div>
  );
}
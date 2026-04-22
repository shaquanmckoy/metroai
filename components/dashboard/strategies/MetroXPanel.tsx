"use client";

import React, { useEffect, useMemo, useState } from "react";
import type { Pair } from "@/app/dashboard/page";
import type { Trade, UIFlags } from "@/components/dashboard/strategy-types";
import { INDEX_GROUPS } from "@/components/dashboard/strategy-constants";


type PairOption = { code: string; label: string };


const PAIRS: readonly Pair[] = [
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
  "STPRNG",
  "STPRNG2",
  "STPRNG3",
  "STPRNG4",
  "STPRNG5",
] as const;


type MetroXPanelProps = {
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
  tradeHistoryPanel: React.ReactNode;
  onClearHistory: () => void;
  onToggleMetro: () => void;
  metroRunning: boolean;
  currency: string;
  run1xAutoAllPairs: () => void;
  auto1xRunning: boolean;
  onToggleFastAuto: () => void;
  fastAutoRunning: boolean;
  uiFlags: UIFlags;
  isAdmin: boolean;
};

export default function MetroXPanel({
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
  tradeHistoryPanel,
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
}: MetroXPanelProps) {
  const digitPercent = (d: number) => {
    if (!ticks.length) return 0;
    return (ticks.filter((x: number) => x === d).length / ticks.length) * 100;
  };

  const [edshellCount, setEdshellCount] = useState<1 | 3 | 5>(1);
  const [edshellScope, setEdshellScope] = useState<"current" | "scan">("current");
  const edshellPreviewDigit =
    edshellScope === "current" && pairMeta[selectedPair]?.count >= 20
      ? (pairMeta[selectedPair]?.lowDigit ?? null)
      : null;
  const [metroXPressed, setMetroXPressed] = useState(false);
  const [edshellPlacing, setEdshellPlacing] = useState(false);
  const [edshellPlaced, setEdshellPlaced] = useState(false);
  const canShow = (key: keyof UIFlags) => isAdmin || uiFlags[key] !== false;

  const HIGH_PCT_THRESHOLD = 13.0;
  const last20 = ticks.slice(-20);
  const counts = useMemo(() => {
    const c = Array.from({ length: 10 }, () => 0);
    for (const x of last20) c[x] = (c[x] ?? 0) + 1;
    return c;
  }, [last20]);

  const lastDigit = ticks.length ? ticks[ticks.length - 1] : null;

  const [intelligentOn, setIntelligentOn] = useState(false);
  const [intelligentStartLen, setIntelligentStartLen] = useState(0);

  useEffect(() => {
    setIntelligentStartLen(ticks.length);
  }, [selectedPair, ticks.length]);

  useEffect(() => {
    if (intelligentOn) setIntelligentStartLen(ticks.length);
  }, [intelligentOn, ticks.length]);

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

  return (
    <div className="overflow-hidden rounded-[28px] border border-cyan-400/15 bg-[radial-gradient(circle_at_top_left,rgba(59,130,246,0.18),rgba(15,23,42,0.95)_45%,rgba(2,6,23,0.98))] p-6 shadow-[0_25px_80px_rgba(0,0,0,0.45)] min-h-[520px]">
      <div className="flex flex-col gap-4 md:flex-row md:items-start md:justify-between mb-6">
        <div>
          <div className="flex items-center gap-3">
            <div className="flex h-12 w-12 items-center justify-center rounded-2xl border border-cyan-400/25 bg-cyan-500/10 text-xl text-cyan-300">
              Ⓜ
            </div>
            <div>
              <p className="text-[1.9rem] font-bold tracking-tight text-white">MetroX</p>
              <p className="mt-1 text-sm text-white/55">
                Digit analysis, smart signal tracking, and fast execution tools.
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
            {mdTickDuration} Tick{mdTickDuration > 1 ? "s" : ""}
          </span>
        </div>
      </div>
      {/* TOP CONTROLS */}
      <div className="grid grid-cols-1 gap-5 xl:grid-cols-12 mb-5">
        <div className="xl:col-span-6 rounded-[24px] border border-white/10 bg-[linear-gradient(135deg,rgba(15,23,42,0.92),rgba(2,6,23,0.96))] p-5 shadow-[0_0_0_1px_rgba(255,255,255,0.02)]">
          <p className="text-[11px] uppercase tracking-[0.24em] text-white/45 mb-1">Select Index</p>
          <select
  className="mt-3 w-full rounded-xl border border-white/10 bg-black/40 px-4 py-3 text-base text-white outline-none transition focus:border-cyan-400/40 focus:ring-2 focus:ring-cyan-400/20"
  value={selectedPair}
  onChange={(e) => setSelectedPair(e.target.value as Pair)}
>
  <optgroup label="Volatility Indices">
    {INDEX_GROUPS.volatility.map((s: PairOption) => (
      <option key={s.code} value={s.code}>
        {s.label}
      </option>
    ))}
  </optgroup>
  <optgroup label="Jump Indices">
    {INDEX_GROUPS.jump.map((s: PairOption) => (
      <option key={s.code} value={s.code}>
        {s.label}
      </option>
    ))}
  </optgroup>
</select>
        </div>

        <div className="xl:col-span-6 rounded-[24px] border border-white/10 bg-[linear-gradient(135deg,rgba(15,23,42,0.92),rgba(2,6,23,0.96))] p-5 shadow-[0_0_0_1px_rgba(255,255,255,0.02)]">
          <p className="text-[11px] uppercase tracking-[0.24em] text-white/45 mb-1">Strategy</p>
          <select className="mt-3 w-full rounded-xl border border-white/10 bg-black/40 px-4 py-3 text-base text-white outline-none transition focus:border-cyan-400/40 focus:ring-2 focus:ring-cyan-400/20">
            <option>MetroX</option>
          </select>
        </div>
      </div>

      {/* STAKE */}
      <div className="rounded-[24px] border border-white/10 bg-[linear-gradient(135deg,rgba(15,23,42,0.92),rgba(2,6,23,0.96))] p-5 mb-5 shadow-[0_0_0_1px_rgba(255,255,255,0.02)]">
        <p className="text-[11px] uppercase tracking-[0.24em] text-white/45 mb-3">Stake Amount</p>
        <div className="flex gap-2">
          <input
            type="number"
            step="0.1"
            min="0.1"
            value={stake}
            onChange={(e) => setStake(Number(e.target.value))}
            className="w-full rounded-xl border border-white/10 bg-black/40 px-4 py-3 text-base text-white outline-none transition focus:border-cyan-400/40 focus:ring-2 focus:ring-cyan-400/20"
          />
          <button
            onClick={() => setStake(1)}
            className="px-4 rounded-xl bg-white/5 border border-white/10 text-sm font-semibold hover:bg-white/10 transition"
          >
            $1
          </button>
          <button
            onClick={() => setStake(5)}
            className="px-4 rounded-xl bg-white/5 border border-white/10 text-sm font-semibold hover:bg-white/10 transition"
          >
            $5
          </button>
          <button
            onClick={() => setStake(10)}
            className="px-4 rounded-xl bg-white/5 border border-white/10 text-sm font-semibold hover:bg-white/10 transition"
          >
            $10
          </button>
        </div>
      </div>

      {/* Trade type + duration */}
      <div className="rounded-[24px] border border-white/10 bg-[linear-gradient(135deg,rgba(15,23,42,0.92),rgba(2,6,23,0.96))] p-5 mb-5 shadow-[0_0_0_1px_rgba(255,255,255,0.02)]">
        <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
          <div>
            <p className="text-[11px] uppercase tracking-[0.24em] text-white/45 mb-2">Trade Type</p>
            <select
              value={mdTradeType}
              onChange={(e) => setMdTradeType(e.target.value as "Differs" | "Matches")}
              className="w-full rounded-xl border border-white/10 bg-black/40 px-4 py-3 text-base text-white outline-none transition focus:border-cyan-400/40 focus:ring-2 focus:ring-cyan-400/20"
            >
              <option value="Differs">DIFFERS</option>
              <option value="Matches">MATCHES</option>
            </select>
          </div>

          <div>
            <p className="text-[11px] uppercase tracking-[0.24em] text-white/45 mb-2">Tick Duration</p>
            <select
              value={mdTickDuration}
              onChange={(e) => setMdTickDuration(Number(e.target.value))}
              className="w-full rounded-xl border border-white/10 bg-black/40 px-4 py-3 text-base text-white outline-none transition focus:border-cyan-400/40 focus:ring-2 focus:ring-cyan-400/20"
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
      <div className="rounded-[24px] border border-cyan-400/15 bg-[linear-gradient(135deg,rgba(15,23,42,0.92),rgba(2,6,23,0.96))] p-5 mb-5 shadow-[0_0_0_1px_rgba(255,255,255,0.02)]">
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
          <div className="mt-4 rounded-2xl border border-white/10 bg-black/20 p-4">
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
      <div className="rounded-[24px] border border-white/10 bg-[linear-gradient(135deg,rgba(15,23,42,0.92),rgba(2,6,23,0.96))] p-5 mb-5 shadow-[0_0_0_1px_rgba(255,255,255,0.02)]">
        <p className="text-sm text-white/80 mb-4">
          Last digit prediction - Click any digit to select for <span className="font-semibold">{mdTradeType.toUpperCase()}</span> trade
        </p>

        <div className="grid grid-cols-5 gap-3 md:gap-4">
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
                className={`relative rounded-2xl py-3 sm:py-4 text-center border transition shadow-[0_0_0_1px_rgba(255,255,255,0.02)] ${cls}`}
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

        <p className="text-xs text-white/50 mt-4">
          Based on {ticks.length} ticks from <span className="font-semibold">{selectedPair}</span>• Last Digit:{" "}
         <span className="text-green-400 font-extrabold text-4xl leading-none drop-shadow-[0_0_12px_rgba(34,197,94,0.9)]">
  {lastDigit !== null ? lastDigit : "-"}
</span>
        </p>

        {/* Collapsible analysis box */}
        <div className="mt-4 rounded-2xl border border-white/10 bg-black/20 overflow-hidden">
          <button
            onClick={() => setAnalysisOpen(!analysisOpen)}
            className="w-full flex items-center justify-between px-4 py-3 text-xs text-white/80 hover:bg-white/5 transition"
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
                 {PAIRS.map((p: Pair) => {
  const m = pairMeta[p];
  const has20 = m.count >= 20;

  const label =
  INDEX_GROUPS.volatility.find((x: PairOption) => x.code === p)?.label ||
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
<div className="mt-5 space-y-4 rounded-[24px] border border-white/10 bg-[linear-gradient(135deg,rgba(15,23,42,0.92),rgba(2,6,23,0.96))] p-5 shadow-[0_0_0_1px_rgba(255,255,255,0.02)]">
  {/* ✅ Place MetroX Trade */}
  {canShow("metro_place_trade") && (
    <button
      onClick={() => {
        if (selectedDigit === null) return alert("Select a digit first");

        setMetroXPressed(true);
        setTimeout(() => setMetroXPressed(false), 1000);

        onPlaceMetroX();
      }}
      className={`w-full rounded-xl py-4 text-sm font-semibold shadow-[0_0_0_1px_rgba(255,255,255,0.10)] transition active:scale-[0.98]
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

        for (const p of PAIRS as readonly Pair[]) {
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
  className={`relative w-full rounded-xl py-4 text-sm font-extrabold tracking-wide border
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
      className={`w-full rounded-xl py-3 text-sm font-semibold shadow-[0_0_0_1px_rgba(255,255,255,0.10)] transition active:scale-[0.98] ${
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
      className={`w-full rounded-xl py-3 text-sm font-semibold shadow-[0_0_0_1px_rgba(255,255,255,0.10)] transition active:scale-[0.98] ${
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
      className={`w-full rounded-xl py-3 text-sm font-semibold shadow-[0_0_0_1px_rgba(255,255,255,0.10)] transition active:scale-[0.98] ${
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
className={`w-full rounded-xl py-3 text-sm font-semibold shadow-[0_0_0_1px_rgba(255,255,255,0.10)] transition active:scale-[0.98] ${        auto1xRunning
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
      className={`w-full rounded-xl py-3 text-sm font-semibold shadow-[0_0_0_1px_rgba(255,255,255,0.10)] transition active:scale-[0.98] ${
        fastAutoRunning
          ? "bg-emerald-600 hover:bg-emerald-700 animate-pulse active:brightness-110"
          : "bg-cyan-600 hover:bg-cyan-700 active:brightness-110"
      }`}
    >
      {fastAutoRunning ? "Stop Fast AutoTrading" : "Fast AutoTrading"}
    </button>
  )}

  {/* Turbo Mode (leave visible for admins/users — or wrap in canShow if you want) */}
  <div className="flex items-center justify-between rounded-2xl border border-white/10 bg-black/20 px-4 py-3 text-xs text-white/70">
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
    <div className="rounded-2xl bg-black/20 border border-white/10 p-4 text-xs text-white/70">
      {analysisStatus}
    </div>
  )}
</div>

      {/* Trade History */}
      {tradeHistoryPanel}
    </div>
  );
}
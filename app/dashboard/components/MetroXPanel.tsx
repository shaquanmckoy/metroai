"use client";

import React, { useMemo, useState, useEffect } from "react";
import { PAIRS, Pair } from "../page";

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
}: any) {
  const last20 = ticks.slice(-20);

  const digitPercent = (d: number) =>
    ticks.length ? (ticks.filter((x) => x === d).length / ticks.length) * 100 : 0;

  const lastDigit = ticks.length ? ticks[ticks.length - 1] : null;

  const HIGH_PCT_THRESHOLD = 13;

  /* ------------------------- Intelligent DIFFERS ------------------------- */
  const [intelligentOn, setIntelligentOn] = useState(false);
  const [intelligentStartLen, setIntelligentStartLen] = useState(0);

  useEffect(() => {
    setIntelligentStartLen(ticks.length);
  }, [selectedPair]);

  useEffect(() => {
    if (intelligentOn) setIntelligentStartLen(ticks.length);
  }, [intelligentOn]);

  const intelligentDigits = useMemo(() => {
    const start = Math.min(intelligentStartLen, ticks.length);
    return ticks.slice(start);
  }, [ticks, intelligentStartLen]);

  const intelligentTotal = intelligentDigits.length;

  const intelligentLeast = useMemo(() => {
    if (intelligentTotal < 20) return null;
    const freq = Array.from({ length: 10 }, () => 0);
    intelligentDigits.forEach((d) => (freq[d] = (freq[d] || 0) + 1));
    let bestDigit = 0;
    let bestCount = Infinity;
    for (let d = 0; d < 10; d++) {
      if (freq[d] < bestCount) {
        bestCount = freq[d];
        bestDigit = d;
      }
    }
    return bestDigit;
  }, [intelligentDigits, intelligentTotal]);

  /* ------------------------------ UI RETURN ------------------------------ */
  return (
    <div className="p-6 bg-gradient-to-br from-[#1b2235]/95 to-[#121826]/95 min-h-[520px]">

      {/* ------------------- Intelligent Differs Panel ------------------- */}
      <div className="bg-white/5 border border-white/10 rounded-xl p-4 mb-4">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <span className="text-yellow-300">💡</span>
            <p className="text-sm font-semibold text-yellow-200">
              Intelligent DIFFERS
            </p>
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
          <div className="mt-4 bg-black/20 border border-white/10 rounded-lg p-4">
            {intelligentTotal < 20 ? (
              <p className="text-yellow-200 text-sm font-semibold">
                WAITING FOR 20 TICKS ({intelligentTotal}/20)
              </p>
            ) : (
              <div className="text-center">
                <p className="text-xs text-white/60 mb-1">
                  Least frequent digit
                </p>
                <p className="text-5xl font-bold text-yellow-300">
                  {intelligentLeast}
                </p>
                <p className="text-xs mt-2 text-white/70">
                  Best digit for a DIFFERS trade
                </p>
              </div>
            )}
          </div>
        )}
      </div>

      {/* ------------------------- Digit Grid ------------------------- */}
      <p className="text-sm text-white/80 mb-2">
        Click a digit to select it for your{" "}
        <span className="font-semibold">{mdTradeType}</span> trade.
      </p>

      <div className="grid grid-cols-5 gap-3 mb-4">
        {Array.from({ length: 10 }, (_, d) => {
          const pct = digitPercent(d);

          const selected = selectedDigit === d;
          const won = lastWinDigit === d;
          const lost = lastLossDigit === d;
          const live = lastDigit === d;
          const high = ticks.length >= 20 && pct >= HIGH_PCT_THRESHOLD;

          let cls =
            "relative rounded-full py-3 text-center border transition bg-[#0e1422] border-white/10 text-white/90";

          if (selected) cls = "bg-blue-600 border-blue-400 text-white";
          else if (won) cls = "bg-emerald-600/40 border-emerald-400 text-white";
          else if (lost) cls = "bg-red-600/40 border-red-400 text-white";
          else if (live) cls = "bg-emerald-600/20 border-emerald-500/30";
          else if (high) cls = "bg-red-600/20 border-red-500/35";

          return (
            <button
              key={d}
              onClick={() => setSelectedDigit(d)}
              className={cls}
            >
              {selected && (
                <span className="absolute top-1 right-2 text-white text-sm">✓</span>
              )}

              {!selected && won && (
                <span className="absolute top-1 right-2 text-emerald-100 text-sm">💰</span>
              )}

              {!selected && lost && (
                <span className="absolute top-1 right-2 text-red-100 text-sm">❌</span>
              )}

              {!selected && !won && !lost && live && (
                <span className="absolute top-1 right-2 text-emerald-200 text-sm">●</span>
              )}

              {!selected && !won && !lost && !live && high && (
                <span className="absolute top-1 right-2 text-red-200 text-sm">▲</span>
              )}

              <div className="text-lg font-bold">{d}</div>
              <div className="text-[11px] text-white/60">{pct.toFixed(1)}%</div>
            </button>
          );
        })}
      </div>

      {/* ---------------- Tick Count Analysis Toggle ---------------- */}
      <div className="rounded-lg border border-white/10 bg-white/5 overflow-hidden mb-5">
        <button
          onClick={() => setAnalysisOpen(!analysisOpen)}
          className="w-full flex items-center justify-between px-3 py-2 text-xs text-white/80 hover:bg-white/5"
        >
          <span className="font-semibold">
            Tick Count Analysis — {selectedPair}
          </span>
          <span>{analysisOpen ? "▾" : "▸"}</span>
        </button>

        {analysisOpen && (
          <div className="px-3 pb-3 text-white/70 text-xs">
            {last20.length < 20 ? (
              <p className="mt-2">Collecting ticks…</p>
            ) : (
              <div className="grid grid-cols-5 gap-2 mt-2">
                {Array.from({ length: 10 }, (_, d) => {
                  const cnt = last20.filter((x) => x === d).length;
                  const pct20 = (cnt / 20) * 100;
                  return (
                    <div
                      key={d}
                      className="rounded-md bg-black/10 border border-white/10 p-2 text-center"
                    >
                      <p className="font-bold">{d}</p>
                      <p>{cnt} / 20</p>
                      <p className="text-white/55">{pct20.toFixed(1)}%</p>
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        )}
      </div>

      {/* --------------------- BUTTON ROW (OLD LAYOUT) --------------------- */}
      <div className="space-y-3">

        <button
          onClick={() => selectedDigit !== null && onPlaceMetroX()}
          className="w-full rounded-md py-3 bg-emerald-600 hover:bg-emerald-700 text-sm font-semibold"
        >
          ⚡ Place MetroX Trade
        </button>

        <button
          onClick={on3xSelectedDigit}
          disabled={instant3xRunning}
          className={`w-full rounded-md py-3 text-sm font-semibold ${
            instant3xRunning
              ? "bg-slate-600 cursor-not-allowed"
              : "bg-red-600 hover:bg-red-700"
          }`}
        >
          {instant3xRunning ? "Placing 3 trades..." : "3x Selected Digit"}
        </button>

        <button
          onClick={onToggle5x}
          className={`w-full rounded-md py-3 text-sm font-semibold ${
            auto5xRunning
              ? "bg-orange-600 hover:bg-orange-700"
              : "bg-purple-600 hover:bg-purple-700"
          }`}
        >
          {auto5xRunning ? "Stop 5x AutoTrading" : "5x AutoTrading"}
        </button>

        <button
          onClick={run1xAutoAllPairs}
          disabled={auto1xRunning}
          className={`w-full rounded-md py-3 text-sm font-semibold ${
            auto1xRunning
              ? "bg-slate-600 cursor-not-allowed"
              : "bg-indigo-600 hover:bg-indigo-700"
          }`}
        >
          {auto1xRunning ? "Scanning…" : "1x Auto All Pairs"}
        </button>

        {/* Turbo Mode toggle */}
        <div className="flex items-center justify-between text-xs text-white/70">
          <span>Turbo Mode</span>
          <button
            onClick={() => setTurboMode(!turboMode)}
            className={`w-12 h-6 rounded-full relative border transition ${
              turboMode
                ? "bg-orange-500/70 border-orange-400/60"
                : "bg-white/10 border-white/15"
            }`}
          >
            <span
              className={`absolute top-0.5 w-5 h-5 bg-white rounded-full transition ${
                turboMode ? "right-0.5" : "left-0.5"
              }`}
            />
          </button>
        </div>
      </div>

      {/* ---------------------- Trade History ---------------------- */}
      <TradeHistory tradeHistory={tradeHistory} currency={currency} onClear={onClearHistory} />
    </div>
  );
}

/* ---------------------------- Trade History Component ---------------------------- */

function TradeHistory({ tradeHistory, currency, onClear }: any) {
  const [tab, setTab] = useState<"all" | "wins" | "losses">("all");

  const wins = tradeHistory.filter((t: any) => t.result === "Win").length;
  const losses = tradeHistory.filter((t: any) => t.result === "Loss").length;
  const net = tradeHistory.reduce((acc: number, t: any) => acc + Number(t.profit || 0), 0);

  const filtered = tradeHistory.filter((t: any) => {
    if (tab === "wins") return t.result === "Win";
    if (tab === "losses") return t.result === "Loss";
    return true;
  });

  return (
    <div className="mt-6 bg-white/5 border border-white/10 rounded-xl p-4">
      <div className="flex items-center justify-between mb-3">
        <p className="font-semibold">Trade History</p>
        <button
          onClick={onClear}
          className="text-red-300 hover:text-red-200 text-sm"
        >
          Clear
        </button>
      </div>

      <div className="grid grid-cols-3 gap-2 mb-4 text-xs">
        <button
          onClick={() => setTab("all")}
          className={`py-2 rounded-full ${
            tab === "all" ? "bg-sky-600/30" : "bg-white/10"
          }`}
        >
          All ({tradeHistory.length})
        </button>
        <button
          onClick={() => setTab("wins")}
          className={`py-2 rounded-full ${
            tab === "wins" ? "bg-emerald-600/30" : "bg-white/10"
          }`}
        >
          Wins ({wins})
        </button>
        <button
          onClick={() => setTab("losses")}
          className={`py-2 rounded-full ${
            tab === "losses" ? "bg-red-600/30" : "bg-white/10"
          }`}
        >
          Losses ({losses})
        </button>
      </div>

      <div className="max-h-72 overflow-y-auto pr-1 space-y-2">
        {filtered.length === 0 ? (
          <p className="text-xs text-white/50">No trades yet.</p>
        ) : (
          filtered.map((t: any, idx: number) => (
            <div
              key={idx}
              className="bg-black/20 border border-white/10 rounded-lg p-3 text-xs"
            >
              <div className="flex justify-between mb-1">
                <span className="font-semibold">{t.symbol}</span>
                <span
                  className={`font-semibold ${
                    t.result === "Win"
                      ? "text-emerald-400"
                      : t.result === "Loss"
                      ? "text-red-400"
                      : "text-yellow-300"
                  }`}
                >
                  {t.result}
                </span>
              </div>
              <div>Digit: {t.digit}</div>
              <div>Stake: {t.stake} {currency}</div>
              <div>Profit: {t.profit?.toFixed(2) ?? "-"}</div>
            </div>
          ))
        )}
      </div>
    </div>
  );
}
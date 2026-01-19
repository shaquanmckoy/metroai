"use client";

import React from "react";
import { PAIRS, Pair } from "../_pairs";

type Trade = {
  id: number;
  symbol: Pair;
  digit: number;
  type: string;
  stake: number;
  durationTicks: number;
  result: string;
  createdAt: number;
  payout?: number;
  profit?: number;
  settlementDigit?: number;
};

export default function MetroPanel({
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
  lastWinDigit,
  lastLossDigit,
  tradeHistory,
  onClearHistory,
  currency,
  intelligentEnabled,
  setIntelligentEnabled,
  intelligentDigits,
  intelligentLeastDigit,
  intelligentTotal,
}: any) {
  const digitPercent = (d: number): number => {
    if (!ticks.length) return 0;
    return (ticks.filter((x: number) => x === d).length / ticks.length) * 100;
  };

  const HIGH_PCT = 13.0;
  const lastDigit = ticks.length > 0 ? ticks[ticks.length - 1] : null;

  const digits = Array.from({ length: 10 }, (_, i) => i);

  return (
    <div className="bg-gradient-to-br from-[#1b2235]/95 to-[#121826]/95 p-6 min-h-[520px]">

      {/* SELECT INDEX + STAKE */}
      <div className="grid grid-cols-2 gap-3 mb-4">
        <div>
          <p className="text-[11px] text-white/60 mb-1">Select Index</p>
          <select
            className="w-full bg-[#0e1422] border border-white/10 p-2 rounded-md text-sm"
            value={selectedPair}
            onChange={(e) => setSelectedPair(e.target.value as Pair)}
          >
            {PAIRS.map((p: Pair) => (
              <option key={p}>{p}</option>
            ))}
          </select>
        </div>

        <div>
          <p className="text-[11px] text-white/60 mb-1">Stake Amount</p>
          <input
            type="number"
            step="0.1"
            min="0.1"
            value={stake}
            onChange={(e) => setStake(Number(e.target.value))}
            className="w-full bg-[#0e1422] border border-white/10 p-2 rounded-md text-sm"
          />
        </div>
      </div>

      {/* INTELLIGENT DIFFERS */}
      <div className="bg-[#13233d]/40 border border-white/10 rounded-xl p-4 mb-4">
        <div className="flex justify-between items-center">
          <span className="text-sm font-semibold text-yellow-200">💡 Intelligent DIFFERS</span>

          <button
            onClick={() => setIntelligentEnabled(!intelligentEnabled)}
            className={`px-4 py-1 text-xs rounded-lg border ${
              intelligentEnabled
                ? "bg-emerald-600/25 border-emerald-400 text-emerald-200"
                : "bg-white/10 border-white/20 text-white/70"
            }`}
          >
            {intelligentEnabled ? "ON" : "OFF"}
          </button>
        </div>

        {intelligentEnabled && (
          <div className="mt-3 text-xs text-white/70">
            <p>
              Recent Digits ({intelligentTotal}):{" "}
              <span className="text-emerald-300 font-semibold">{intelligentDigits.join(" ")}</span>
            </p>

            {intelligentTotal < 20 ? (
              <p className="mt-2 text-yellow-200 font-semibold">
                Waiting for {20 - intelligentTotal} more ticks...
              </p>
            ) : (
              <div className="mt-3 text-center">
                <p className="text-white/60 text-xs">Least Frequent Digit</p>
                <p className="text-5xl text-yellow-300 font-bold">
                  {intelligentLeastDigit}
                </p>
              </div>
            )}
          </div>
        )}
      </div>

      {/* DIGIT GRID */}
      <p className="text-sm text-white/80 mb-2">
        Select digit for <span className="font-semibold">{mdTradeType}</span>
      </p>

      <div className="grid grid-cols-5 gap-3">
        {digits.map((d: number) => {
          const pct = digitPercent(d);
          const isSelected = selectedDigit === d;

          let cls =
            "relative rounded-full py-3 text-center border bg-[#0e1422] border-white/10 text-white";

          if (isSelected) cls = "bg-blue-600/90 border-blue-400";
          if (lastWinDigit === d) cls = "bg-emerald-600/30 border-emerald-400";
          if (lastLossDigit === d) cls = "bg-red-600/30 border-red-400";
          if (lastDigit === d) cls = "bg-emerald-600/20 border-emerald-400";
          if (pct >= HIGH_PCT) cls = "bg-red-600/20 border-red-400";

          return (
            <button key={d} className={cls} onClick={() => setSelectedDigit(d)}>
              <div className="text-lg font-bold">{d}</div>
              <div className="text-[11px] text-white/60">{pct.toFixed(1)}%</div>
            </button>
          );
        })}
      </div>

      {/* ACTION BUTTONS */}
      <div className="mt-5 space-y-3">
        <button
          onClick={onPlaceMetroX}
          className="w-full rounded-md py-3 bg-emerald-600 text-sm font-semibold"
        >
          ⚡ Place MetroX Trade
        </button>

        <button
          onClick={on3xSelectedDigit}
          disabled={instant3xRunning}
          className={`w-full rounded-md py-3 text-sm font-semibold ${
            instant3xRunning ? "bg-gray-600" : "bg-red-600"
          }`}
        >
          {instant3xRunning ? "Placing..." : "3× Selected Digit"}
        </button>

        <button
          onClick={onToggle5x}
          className={`w-full rounded-md py-3 text-sm font-semibold ${
            auto5xRunning ? "bg-orange-600" : "bg-purple-600"
          }`}
        >
          {auto5xRunning ? "Stop 5× Auto" : "Start 5× Auto"}
        </button>
      </div>

      {/* HISTORY */}
      <div className="mt-6">
        <div className="flex justify-between mb-2">
          <p className="font-semibold text-white/90">Trade History</p>
          <button
            onClick={onClearHistory}
            className="px-3 py-1 bg-red-600/30 border border-red-500 text-red-200 rounded-md text-xs"
          >
            Clear
          </button>
        </div>

        <div className="max-h-72 overflow-y-auto space-y-2 pr-1">
          {tradeHistory.map((t: Trade) => (
            <div key={t.id} className="bg-white/5 border border-white/10 rounded-lg p-3 text-xs">
              <div className="flex justify-between">
                <span>{t.symbol}</span>
                <span
                  className={
                    t.result === "Win"
                      ? "text-emerald-300"
                      : t.result === "Loss"
                      ? "text-red-300"
                      : "text-yellow-300"
                  }
                >
                  {t.result}
                </span>
              </div>

              <p className="mt-1 text-[11px]">
                Digit {t.digit} — Stake {t.stake} {currency}
                <br />
                Profit: {t.profit !== undefined ? `${t.profit} ${currency}` : "-"}
              </p>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
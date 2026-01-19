"use client";

import React, { useMemo, useState, useEffect } from "react";
import { PAIRS, Pair } from "../page";

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
  instant3xRunning: boolean;

  turboMode: boolean;
  setTurboMode: (v: boolean) => void;

  onToggle5x: () => void;
  auto5xRunning: boolean;

  analysisStatus: string;

  lastWinDigit: number | null;
  lastLossDigit: number | null;

  tradeHistory: Trade[];
  onClearHistory: () => void;

  currency: string;

  intelligentEnabled: boolean;
  setIntelligentEnabled: (v: boolean) => void;
  intelligentDigits: number[];
  intelligentLeastDigit: number | null;
  intelligentTotal: number;
}) {
  /* ------------------ % CALCULATIONS ------------------ */

  const digitPercent = (d: number): number => {
    if (!ticks.length) return 0;
    return (
      (ticks.filter((x: number) => x === d).length / ticks.length) * 100
    );
  };

  const HIGH_PCT = 13.0;

  const lastDigit: number | null =
    ticks.length > 0 ? (ticks[ticks.length - 1] as number) : null;

  /* ------------------ DIGITS GRID ------------------ */

  const digits: number[] = Array.from({ length: 10 }, (_: unknown, i: number) => i);

  return (
    <div className="bg-gradient-to-br from-[#1b2235]/95 to-[#121826]/95 p-6 min-h-[520px]">

      {/* ======================== TOP SETTINGS ======================== */}
      <div className="grid grid-cols-2 gap-3 mb-4">
        <div>
          <p className="text-[11px] text-white/60 mb-1">Select Index</p>
          <select
            className="w-full bg-[#0e1422] border border-white/10 p-2 rounded-md text-sm"
            value={selectedPair}
            onChange={(e) => setSelectedPair(e.target.value as Pair)}
          >
            {PAIRS.map((p: Pair) => (
              <option key={p} value={p}>
                {p}
              </option>
            ))}
          </select>
        </div>

        {/* Stake Amount */}
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

      {/* ================== INTELLIGENT DIFFERS PANEL ================== */}
      <div className="bg-[#13233d]/40 border border-white/10 rounded-xl p-4 mb-4">
        <div className="flex items-center justify-between">
          <p className="text-sm font-semibold text-yellow-200 flex gap-2 items-center">
            💡 Intelligent DIFFERS
          </p>

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
              <span className="text-emerald-300 font-semibold tracking-widest">
                {intelligentDigits.map((d: number) => d).join(" ")}
              </span>
            </p>

            {intelligentTotal < 20 ? (
              <p className="mt-2 text-yellow-200 font-semibold">
                Waiting for 20 ticks ({intelligentTotal}/20)
              </p>
            ) : (
              <div className="mt-3 text-center">
                <p className="text-white/60 text-xs">Least Frequent Digit</p>
                <p className="text-5xl text-yellow-300 font-bold">
                  {intelligentLeastDigit ?? "-"}
                </p>
                <p className="text-white/60 text-xs mt-1">
                  Suggested: DIFFERS {intelligentLeastDigit}
                </p>
              </div>
            )}
          </div>
        )}
      </div>

      {/* ======================== DIGITS GRID ======================== */}
      <p className="text-sm text-white/80 mb-2">
        Select digit for{" "}
        <span className="font-semibold">{mdTradeType.toUpperCase()}</span> trade
      </p>

      <div className="grid grid-cols-5 gap-3">
        {digits.map((d: number) => {
          const isSelected = selectedDigit === d;
          const pct = digitPercent(d);
          const isHigh = pct >= HIGH_PCT;
          const isWin = lastWinDigit === d;
          const isLoss = lastLossDigit === d;
          const isLive = lastDigit === d;

          let cls =
            "relative rounded-full py-3 text-center border transition bg-[#0e1422] border-white/10 text-white";

          if (isSelected) cls = "bg-blue-600/90 border-blue-400 text-white";
          else if (isWin) cls = "bg-emerald-600/30 border-emerald-400 text-white";
          else if (isLoss) cls = "bg-red-600/30 border-red-400 text-white";
          else if (isLive) cls = "bg-emerald-600/20 border-emerald-400 text-white";
          else if (isHigh) cls = "bg-red-600/20 border-red-400 text-white";

          return (
            <button key={d} onClick={() => setSelectedDigit(d)} className={cls}>
              <div className="text-lg font-bold">{d}</div>
              <div className="text-[11px] text-white/60">
                {pct.toFixed(1)}%
              </div>
            </button>
          );
        })}
      </div>

      {/* ======================== ACTION BUTTONS ======================== */}
      <div className="mt-5 space-y-3">
        <button
          onClick={() => {
            if (selectedDigit === null) return alert("Choose a digit first!");
            onPlaceMetroX();
          }}
          className="w-full rounded-md py-3 bg-emerald-600 hover:bg-emerald-700 text-sm font-semibold"
        >
          ⚡ Place MetroX Trade
        </button>

        <button
          onClick={on3xSelectedDigit}
          disabled={instant3xRunning}
          className={`w-full rounded-md py-3 text-sm font-semibold ${
            instant3xRunning
              ? "bg-gray-600 cursor-not-allowed"
              : "bg-red-600 hover:bg-red-700"
          }`}
        >
          {instant3xRunning ? "Placing 3 trades..." : "3× Selected Digit"}
        </button>

        <button
          onClick={onToggle5x}
          className={`w-full rounded-md py-3 text-sm font-semibold ${
            auto5xRunning
              ? "bg-orange-600 hover:bg-orange-700"
              : "bg-purple-600 hover:bg-purple-700"
          }`}
        >
          {auto5xRunning ? "Stop 5× AutoTrading" : "5× AutoTrading"}
        </button>

        {/* Turbo Mode */}
        <div className="flex justify-between items-center text-xs text-white/70 mt-2">
          <span>Turbo Mode</span>
          <button
            onClick={() => setTurboMode(!turboMode)}
            className={`w-12 h-6 rounded-full relative border ${
              turboMode
                ? "bg-orange-500 border-orange-400"
                : "bg-white/10 border-white/20"
            }`}
          >
            <span
              className={`absolute top-0.5 w-5 h-5 bg-white rounded-full transition ${
                turboMode ? "right-0.5" : "left-0.5"
              }`}
            />
          </button>
        </div>

        {/* Strategy Analysis */}
        {analysisStatus && (
          <div className="bg-white/5 border border-white/10 text-xs text-white/70 p-3 rounded-lg">
            {analysisStatus}
          </div>
        )}
      </div>

      {/* ======================== TRADE HISTORY ======================== */}
      <div className="mt-6">
        <div className="flex items-center justify-between mb-2">
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
            <div
              key={t.id}
              className="bg-white/5 border border-white/10 rounded-lg p-3 text-xs text-white/70"
            >
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
              <div className="mt-1 text-[11px]">
                Digit {t.digit} • Stake {t.stake} {currency}
                <br />
                Profit:{" "}
                {t.profit !== undefined
                  ? `${t.profit >= 0 ? "+" : ""}${t.profit.toFixed(2)} ${currency}`
                  : "-"}
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
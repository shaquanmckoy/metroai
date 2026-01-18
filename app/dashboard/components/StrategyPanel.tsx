"use client";

import React from "react";

export default function StrategyPanel({
  type,
  ticks,
  selectedDigit,
  setSelectedDigit,
  stake,
  setStake,
  selectedPair,
  setSelectedPair,
  tradeHistory,
  placeTrade
}: {
  type: "overunder";
  ticks: number[];
  selectedDigit: number | null;
  setSelectedDigit: (d: number | null) => void;
  stake: number;
  setStake: (n: number) => void;
  selectedPair: string;
  setSelectedPair: (p: string) => void;
  tradeHistory: any[];
  placeTrade: (t: "Over" | "Under") => void;
}) {
  return (
    <div className="space-y-6">

      {/* ================= HEADER ================= */}
      <div>
        <h2 className="text-xl font-semibold text-white/90 mb-2">
          Over / Under Strategy
        </h2>
        <p className="text-white/60 text-sm">
          Select a digit threshold and choose Over or Under.
        </p>
      </div>

      {/* ================= SELECT DIGIT ================= */}
      <div>
        <p className="text-white/80 mb-2">Select Digit Threshold</p>
        <div className="grid grid-cols-5 gap-2">
          {Array.from({ length: 10 }).map((_, d) => (
            <button
              key={d}
              onClick={() => setSelectedDigit(d)}
              className={`py-2 rounded-lg text-sm border transition ${
                selectedDigit === d
                  ? "bg-indigo-600 border-indigo-300 text-white"
                  : "bg-white/5 border-white/10 text-white/70 hover:bg-white/10"
              }`}
            >
              {d}
            </button>
          ))}
        </div>
      </div>

      {/* ================= CONTROLS ================= */}
      <div className="space-y-3">
        <div>
          <p className="text-white/80 mb-1">Stake Amount</p>
          <input
            type="number"
            value={stake}
            onChange={(e) => setStake(Number(e.target.value))}
            className="w-full px-3 py-2 bg-black/40 rounded-lg border border-white/10 text-white"
          />
        </div>

        <div>
          <p className="text-white/80 mb-1">Pair</p>
          <select
            value={selectedPair}
            onChange={(e) => setSelectedPair(e.target.value)}
            className="w-full px-3 py-2 bg-black/40 rounded-lg border border-white/10 text-white"
          >
            <option value="R_10">Volatility 10 Index</option>
            <option value="R_25">Volatility 25 Index</option>
            <option value="R_50">Volatility 50 Index</option>
            <option value="R_75">Volatility 75 Index</option>
            <option value="R_100">Volatility 100 Index</option>
          </select>
        </div>
      </div>

      {/* ================= TRADE BUTTONS ================= */}
      <div className="grid grid-cols-2 gap-4 mt-4">
        <button
          onClick={() => placeTrade("Over")}
          disabled={selectedDigit === null}
          className={`py-3 rounded-xl text-white font-semibold transition ${
            selectedDigit === null
              ? "bg-white/10 cursor-not-allowed"
              : "bg-green-600 hover:bg-green-700"
          }`}
        >
          Over
        </button>

        <button
          onClick={() => placeTrade("Under")}
          disabled={selectedDigit === null}
          className={`py-3 rounded-xl text-white font-semibold transition ${
            selectedDigit === null
              ? "bg-white/10 cursor-not-allowed"
              : "bg-red-600 hover:bg-red-700"
          }`}
        >
          Under
        </button>
      </div>

      {/* ================= HISTORY ================= */}
      <div className="mt-6">
        <h3 className="text-white/80 mb-2">Recent Trades</h3>

        {tradeHistory.length === 0 ? (
          <p className="text-white/50 text-sm">No trades yet.</p>
        ) : (
          <div className="space-y-2">
            {tradeHistory.map((t, i) => (
              <div
                key={i}
                className="p-3 rounded-lg bg-white/5 border border-white/10 text-white/80 text-sm flex justify-between"
              >
                <span>{t.type}</span>
                <span
                  className={
                    t.result === "Win"
                      ? "text-green-400"
                      : t.result === "Loss"
                      ? "text-red-400"
                      : "text-yellow-300"
                  }
                >
                  {t.result}
                </span>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
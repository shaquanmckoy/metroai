"use client";
import React from "react";

type Pair = "R_10" | "R_25" | "R_50" | "R_75" | "R_100";
type TradeTypeMD = "Matches" | "Differs";

type MetroXPanelProps = {
  ticks: number[];
  pipSize: number;

  stake: number;
  setStake: (n: number) => void;

  selectedDigit: number | null;
  setSelectedDigit: (d: number | null) => void;

  selectedPair: Pair;
  setSelectedPair: (p: Pair) => void;

  mdTradeType: TradeTypeMD;
  setMdTradeType: (t: TradeTypeMD) => void;

  mdTickDuration: number;
  setMdTickDuration: (n: number) => void;

  onPlaceMetroX: () => void;
  on3xSelectedDigit: () => void;

  instant3xRunning: boolean;

  turboMode: boolean;
  setTurboMode: (b: boolean) => void;

  onToggle5x: () => void;
  auto5xRunning: boolean;

  analysisStatus: string;

  analysisOpen: boolean;
  setAnalysisOpen: (b: boolean) => void;

  lastWinDigit: number | null;
  lastLossDigit: number | null;

  pairMeta: any;

  tradeHistory: any[];
  onClearHistory: () => void;

  currency: string;

  run1xAutoAllPairs: () => void;
  auto1xRunning: boolean;
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
}: MetroXPanelProps) {
  return (
    <div className="p-6 bg-[#0f1828] text-white min-h-[700px] space-y-6">

      {/* HEADER */}
      <div className="flex items-center justify-between">
        <h2 className="text-xl font-semibold">MetroX — Matches & Differs</h2>

        <select
          value={selectedPair}
          onChange={(e) => setSelectedPair(e.target.value as Pair)}
          className="bg-black/20 px-3 py-2 rounded-lg border border-white/10"
        >
          <option value="R_10">Volatility 10</option>
          <option value="R_25">Volatility 25</option>
          <option value="R_50">Volatility 50</option>
          <option value="R_75">Volatility 75</option>
          <option value="R_100">Volatility 100</option>
        </select>
      </div>

      {/* DIGIT PANEL */}
      <div className="grid grid-cols-5 gap-3">
        {Array.from({ length: 10 }).map((_, digit) => {
          const active = selectedDigit === digit;

          return (
            <button
              key={digit}
              onClick={() => setSelectedDigit(digit)}
              className={`p-4 rounded-xl transition border text-center text-lg font-bold
                ${
                  active
                    ? "bg-blue-600 border-blue-400"
                    : "bg-white/5 border-white/10 hover:bg-white/10"
                }`}
            >
              {digit}
            </button>
          );
        })}
      </div>

      {/* TRADE SETTINGS */}
      <div className="grid grid-cols-3 gap-4 pt-4">
        <div>
          <p className="text-sm text-gray-300">Stake</p>
          <input
            type="number"
            value={stake}
            onChange={(e) => setStake(Number(e.target.value))}
            className="w-full bg-black/20 border border-white/10 px-3 py-2 rounded-lg"
          />
        </div>

        <div>
          <p className="text-sm text-gray-300">Ticks</p>
          <select
            value={mdTickDuration}
            onChange={(e) => setMdTickDuration(Number(e.target.value))}
            className="w-full bg-black/20 border border-white/10 px-3 py-2 rounded-lg"
          >
            <option value={1}>1 Tick</option>
            <option value={2}>2 Ticks</option>
            <option value={3}>3 Ticks</option>
            <option value={5}>5 Ticks</option>
            <option value={10}>10 Ticks</option>
          </select>
        </div>

        <div>
          <p className="text-sm text-gray-300">Trade Type</p>
          <select
            value={mdTradeType}
            onChange={(e) => setMdTradeType(e.target.value as TradeTypeMD)}
            className="w-full bg-black/20 border border-white/10 px-3 py-2 rounded-lg"
          >
            <option value="Matches">Matches</option>
            <option value="Differs">Differs</option>
          </select>
        </div>
      </div>

      {/* BUTTONS */}
      <div className="grid grid-cols-2 gap-4 pt-4">
        <button
          onClick={onPlaceMetroX}
          className="bg-green-600 hover:bg-green-700 py-3 rounded-xl font-semibold"
        >
          Place MetroX Trade
        </button>

        <button
          onClick={on3xSelectedDigit}
          disabled={instant3xRunning}
          className={`py-3 rounded-xl font-semibold ${
            instant3xRunning
              ? "bg-purple-800/40"
              : "bg-purple-600 hover:bg-purple-700"
          }`}
        >
          {instant3xRunning ? "Running..." : "3x Selected Digit"}
        </button>
      </div>

      {/* AUTO BUTTONS */}
      <div className="grid grid-cols-2 gap-4">
        <button
          onClick={onToggle5x}
          disabled={auto5xRunning}
          className={`py-3 rounded-xl font-semibold ${
            auto5xRunning ? "bg-red-800/40" : "bg-red-600 hover:bg-red-700"
          }`}
        >
          {auto5xRunning ? "5x Auto Running..." : "5x Auto Trading"}
        </button>

        <button
          onClick={run1xAutoAllPairs}
          disabled={auto1xRunning}
          className={`py-3 rounded-xl font-semibold ${
            auto1xRunning ? "bg-blue-800/40" : "bg-blue-600 hover:bg-blue-700"
          }`}
        >
          {auto1xRunning ? "Scanning..." : "1x Auto All Pairs"}
        </button>
      </div>

      {/* ANALYSIS STATUS */}
      {analysisStatus && (
        <div className="p-4 bg-white/5 border border-white/10 rounded-xl text-sm text-gray-300">
          {analysisStatus}
        </div>
      )}
    </div>
  );
}
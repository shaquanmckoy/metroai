"use client";

import React, { useEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import MetroXPanel from "./components/MetroXPanel";
import StrategyPanel from "./components/StrategyPanel";
import StrategyRow from "./components/StrategyRow";
import TradeHistoryMetroLike from "./components/TradeHistoryMetroLike";

/* --------------------------------------------
   CONSTANTS AND INDEX GROUPS
-------------------------------------------- */

export const PAIRS = ["R_10", "R_25", "R_50", "R_75", "R_100"] as const;
export type Pair = (typeof PAIRS)[number];

export type TradeType = "Matches" | "Differs" | "Over" | "Under";
export type TradeResult = "Win" | "Loss" | "Pending";

export type Trade = {
  id: number;
  contract_id?: number;
  symbol: Pair;
  digit: number;
  type: TradeType;
  stake: number;
  durationTicks: number;
  payout?: number;
  profit?: number;
  settlementDigit?: number;
  result: TradeResult;
  createdAt: number;
};

/* --------------------------------------------
   PAGE COMPONENT START
-------------------------------------------- */

export default function Dashboard() {
  const router = useRouter();

  const wsRef = useRef<WebSocket | null>(null);

  /* -------- STATE -------- */

  const [connected, setConnected] = useState(false);
  const [token, setToken] = useState("");

  const [selectedPair, setSelectedPair] = useState<Pair>("R_10");
  const [activeStrategy, setActiveStrategy] = useState<"matches" | "overunder" | null>(null);

  const [stake, setStake] = useState(1);
  const [selectedDigit, setSelectedDigit] = useState<number | null>(null);
  const [mdTradeType, setMdTradeType] = useState<"Matches" | "Differs">("Differs");
  const [mdTickDuration, setMdTickDuration] = useState(1);

  const [balance, setBalance] = useState<number | null>(null);
  const [currency, setCurrency] = useState("USD");

  const [ticks, setTicks] = useState<number[]>([]);
  const [tradeHistoryMatches, setTradeHistoryMatches] = useState<Trade[]>([]);
  const [tradeHistoryOverUnder, setTradeHistoryOverUnder] = useState<Trade[]>([]);

  const [instant3xRunning, setInstant3xRunning] = useState(false);
  const [auto5xRunning, setAuto5xRunning] = useState(false);
  const [auto1xRunning, setAuto1xRunning] = useState(false);

  const [analysisStatus, setAnalysisStatus] = useState("");
  const [analysisOpen, setAnalysisOpen] = useState(false);

  const [lastWinDigit, setLastWinDigit] = useState<number | null>(null);
  const [lastLossDigit, setLastLossDigit] = useState<number | null>(null);

  const [pipSize, setPipSize] = useState(2);
  const [metroXResetKey, setMetroXResetKey] = useState(0);

  /* --------------------------------------------
     UI RETURN — CLEAN & ERROR-FREE
  -------------------------------------------- */

  return (
    <div className="min-h-screen bg-gradient-to-b from-[#0f0f14] via-[#0b0c11] to-[#050507] text-white overflow-x-hidden">

      {/* HEADER */}
      <header className="w-full backdrop-blur-xl bg-white/5 border-b border-white/10 shadow sticky top-0 z-50">
        <div className="max-w-7xl mx-auto px-6 py-4 flex items-center justify-between">
          <h1 className="text-xl font-semibold">MetroAi Trading Analyzer</h1>

          <div className="flex items-center gap-4">
            <span className="text-sm px-3 py-1 rounded-full bg-emerald-600/20 border border-emerald-500/30 text-emerald-300">
              ● {connected ? "Connected" : "Disconnected"}
            </span>

            <button
              onClick={() => wsRef.current?.close()}
              className="text-sm px-4 py-2 rounded-lg bg-red-600 hover:bg-red-700 shadow"
            >
              Disconnect
            </button>
          </div>
        </div>
      </header>

      {/* MAIN GRID */}
      <section className="px-8 pb-8 grid grid-cols-1 lg:grid-cols-2 gap-6">

        {/* LEFT PANEL */}
        <div className="space-y-6">

          {/* ACCOUNT BOX */}
          <div className="bg-[#13233d]/80 p-6 rounded-2xl border border-white/10">
            <h2 className="font-semibold mb-4">Deriv API Connection</h2>

            <div className="grid grid-cols-2 lg:grid-cols-3 gap-4 text-sm">
              <div className="bg-black/30 p-4 rounded-xl border border-white/10">
                <p className="text-gray-400">Account Status</p>
                <p className="font-semibold text-green-400">
                  {connected ? "Connected" : "Disconnected"}
                </p>
              </div>

              <div className="bg-black/30 p-4 rounded-xl border border-white/10">
                <p className="text-gray-400">Account Balance</p>
                <p className="font-semibold text-lg">
                  {balance !== null ? `${balance.toFixed(2)} ${currency}` : "..."}
                </p>
              </div>
            </div>
          </div>

          {/* STRATEGIES */}
          <div className="bg-[#13233d]/80 p-6 rounded-2xl border border-white/10">
            <h2 className="font-semibold mb-4">Trading Strategies</h2>

            <StrategyRow
              title="MetroX"
              description="Matches/Differs strategy"
              active={activeStrategy === "matches"}
              onToggle={() =>
                setActiveStrategy(activeStrategy === "matches" ? null : "matches")
              }
            />

            <StrategyRow
              title="Over / Under"
              description="Digit threshold strategy"
              active={activeStrategy === "overunder"}
              onToggle={() =>
                setActiveStrategy(activeStrategy === "overunder" ? null : "overunder")
              }
            />
          </div>
        </div>

        {/* RIGHT PANEL */}
        <div className="rounded-2xl border border-white/10 overflow-hidden shadow bg-[#0f1828]">

          {/* METROX PANEL */}
          {activeStrategy === "matches" && (
  <MetroXPanel
    key={metroXResetKey}
    ticks={ticks}
    pipSize={pipSize}
    stake={stake}
    setStake={setStake}
    selectedDigit={selectedDigit}
    setSelectedDigit={setSelectedDigit}

    selectedPair={selectedPair}
    setSelectedPair={setSelectedPair}  // ✔ only ONE

    mdTradeType={mdTradeType}
    setMdTradeType={setMdTradeType}
    mdTickDuration={mdTickDuration}
    setMdTickDuration={setMdTickDuration}

    onPlaceMetroX={() => {}}
    on3xSelectedDigit={() => {}}
    instant3xRunning={instant3xRunning}

    turboMode={false}
    setTurboMode={() => {}}

    onToggle5x={() => {}}
    auto5xRunning={auto5xRunning}

    analysisStatus={analysisStatus}
    analysisOpen={analysisOpen}
    setAnalysisOpen={setAnalysisOpen}

    lastWinDigit={lastWinDigit}
    lastLossDigit={lastLossDigit}
    pairMeta={{}}

    tradeHistory={tradeHistoryMatches}
    onClearHistory={() => {}}

    currency={currency}
    run1xAutoAllPairs={() => {}}
    auto1xRunning={auto1xRunning}
  />
)}

          {/* OVER / UNDER PANEL */}
          {activeStrategy === "overunder" && (
            <div className="bg-[#13233d] p-6">
              <StrategyPanel
                type="overunder"
                ticks={ticks}
                selectedDigit={selectedDigit}
                setSelectedDigit={setSelectedDigit}
                stake={stake}
                setStake={setStake}
                selectedPair={selectedPair}
                setSelectedPair={(p: string) =>
                  setSelectedPair(p as Pair)   // ✅ FIXED ERROR HERE
                }
                tradeHistory={tradeHistoryOverUnder}
                placeTrade={() => {}}
              />
            </div>
          )}

          {/* EMPTY STATE */}
          {!activeStrategy && (
            <div className="bg-gradient-to-br from-[#1b2235] to-[#121826] p-6 min-h-[520px] flex items-center justify-center">
              <p className="text-gray-300">Select a trading strategy to begin</p>
            </div>
          )}

        </div>
      </section>
    </div>
  );
}
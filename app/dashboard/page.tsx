"use client";

import React, { useState, useEffect, useRef, useMemo } from "react";
import { useRouter } from "next/navigation";
import MetroXPanel from "./components/MetroXPanel";
import { PAIRS, Pair } from "./pairs";

type TradeResult = "Win" | "Loss" | "Pending";
type TradeType = "Matches" | "Differs";

type Trade = {
  id: number;
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

const APP_ID = 1089;

export default function DashboardPage() {
  const router = useRouter();

  /* AUTH */
  const [authChecked, setAuthChecked] = useState(false);

  useEffect(() => {
    const logged = localStorage.getItem("loggedIn") === "true";
    if (!logged) router.replace("/");
    else setAuthChecked(true);
  }, []);

  if (!authChecked)
    return (
      <main className="min-h-screen flex items-center justify-center text-white">
        Loading...
      </main>
    );

  /* STATE */
  const wsRef = useRef<WebSocket | null>(null);
  const authorizedRef = useRef(false);
  const tradesRef = useRef<Record<number, { req_id: number }>>({});

  const [token, setToken] = useState("");
  const [connected, setConnected] = useState(false);

  const [balance, setBalance] = useState<number | null>(null);
  const [currency, setCurrency] = useState("USD");

  const [ticks, setTicks] = useState<number[]>([]);
  const [pipSize] = useState(2);

  const [selectedPair, setSelectedPair] = useState<Pair>("R_10");

  const digitsCache = useRef<Record<Pair, number[]>>({
    R_10: [],
    R_25: [],
    R_50: [],
    R_75: [],
    R_100: [],
  });

  const [stake, setStake] = useState(1);
  const [selectedDigit, setSelectedDigit] = useState<number | null>(null);

  const [mdTradeType, setMdTradeType] =
    useState<"Differs" | "Matches">("Differs");

  const [mdTickDuration, setMdTickDuration] = useState(1);

  const [tradeHistory, setTradeHistory] = useState<Trade[]>([]);
  const clearHistory = () => setTradeHistory([]);

  const [lastWinDigit, setLastWinDigit] = useState<number | null>(null);
  const [lastLossDigit, setLastLossDigit] = useState<number | null>(null);

  const flashDigit = (digit: number, win: boolean) => {
    setLastWinDigit(win ? digit : null);
    setLastLossDigit(!win ? digit : null);
    setTimeout(() => {
      setLastWinDigit(null);
      setLastLossDigit(null);
    }, 2000);
  };

  const [instant3xRunning, setInstant3xRunning] = useState(false);
  const [auto5xRunning, setAuto5xRunning] = useState(false);
  const [turboMode, setTurboMode] = useState(false);
  const [analysisStatus, setAnalysisStatus] = useState("");

  const [intelligentEnabled, setIntelligentEnabled] = useState(false);
  const [intelligentStartIndex, setIntelligentStartIndex] = useState(0);

  useEffect(() => {
    if (intelligentEnabled) setIntelligentStartIndex(ticks.length);
  }, [intelligentEnabled]);

  const intelligentDigits = useMemo(() => {
    return ticks.slice(intelligentStartIndex);
  }, [ticks, intelligentStartIndex]);

  const intelligentTotal = intelligentDigits.length;

  const intelligentLeastDigit = useMemo(() => {
    if (intelligentTotal < 20) return null;

    const counts = Array.from({ length: 10 }, () => 0);
    intelligentDigits.forEach((d) => counts[d]++);

    const min = Math.min(...counts);
    return counts.indexOf(min);
  }, [intelligentDigits, intelligentTotal]);

  /* HELPERS */
  const safeSend = (obj: any) => {
    const ws = wsRef.current;
    if (ws?.readyState === WebSocket.OPEN) ws.send(JSON.stringify(obj));
  };

  const newReqId = () => Date.now() + Math.floor(Math.random() * 1000);

  const getLastDigit = (quote: number) => {
    const fixed = quote.toFixed(pipSize).replace(".", "");
    return Number(fixed[fixed.length - 1]);
  };

  /* CONNECT */
  const connectDeriv = () => {
    if (!token) return alert("Enter Deriv API Token");

    wsRef.current?.close();
    wsRef.current = new WebSocket(
      `wss://ws.derivws.com/websockets/v3?app_id=${APP_ID}`
    );

    wsRef.current.onopen = () => safeSend({ authorize: token });

    wsRef.current.onmessage = (e) => {
      const msg = JSON.parse(e.data);

      if (msg.error) return alert(msg.error.message);

      if (msg.msg_type === "authorize") {
        authorizedRef.current = true;
        setConnected(true);

        safeSend({ balance: 1, subscribe: 1 });
        PAIRS.forEach((p) => safeSend({ ticks: p, subscribe: 1 }));
      }

      if (msg.msg_type === "balance") {
        setBalance(msg.balance.balance);
        setCurrency(msg.balance.currency);
      }

      if (msg.msg_type === "tick") {
        const symbol = msg.tick.symbol as Pair;
        const digit = getLastDigit(msg.tick.quote);

        const arr = digitsCache.current[symbol];
        arr.push(digit);
        if (arr.length > 200) arr.shift();

        if (symbol === selectedPair) setTicks([...arr]);
      }

      if (msg.msg_type === "proposal_open_contract") {
        const poc = msg.proposal_open_contract;
        if (!poc.is_sold) return;

        const ref = tradesRef.current[poc.contract_id];
        if (!ref) return;

        const finalDigit = getLastDigit(poc.exit_spot);
        const win = poc.profit > 0;

        flashDigit(finalDigit, win);

        setTradeHistory((prev) =>
          prev.map((t) =>
            t.id === ref.req_id
              ? {
                  ...t,
                  result: win ? "Win" : "Loss",
                  payout: poc.payout,
                  profit: poc.profit,
                  settlementDigit: finalDigit,
                }
              : t
          )
        );

        delete tradesRef.current[poc.contract_id];
      }

      if (msg.msg_type === "buy") {
        tradesRef.current[msg.buy.contract_id] = { req_id: msg.req_id };
      }
    };

    wsRef.current.onclose = () => {
      setConnected(false);
      authorizedRef.current = false;
      setBalance(null);
    };
  };

  const disconnect = () => {
    wsRef.current?.close();
    authorizedRef.current = false;
    setConnected(false);
  };

  /* PLACE TRADE */
  const placeTrade = (type: TradeType, duration: number) => {
    if (!connected) return alert("Not connected");
    if (selectedDigit === null) return alert("Select digit");

    const req_id = newReqId();

    setTradeHistory((prev) => [
      {
        id: req_id,
        symbol: selectedPair,
        digit: selectedDigit,
        type,
        stake,
        durationTicks: duration,
        createdAt: Date.now(),
        result: "Pending",
      },
      ...prev,
    ]);

    safeSend({
      proposal: 1,
      amount: stake,
      basis: "stake",
      contract_type: type === "Differs" ? "DIGITDIFF" : "DIGITMATCH",
      currency,
      symbol: selectedPair,
      duration,
      duration_unit: "t",
      barrier: String(selectedDigit),
      req_id,
    });
  };

  const on3xSelectedDigit = async () => {
    if (instant3xRunning) return;

    setInstant3xRunning(true);

    try {
      for (let i = 0; i < 3; i++) {
        placeTrade("Differs", mdTickDuration);
        if (!turboMode) await new Promise((r) => setTimeout(r, 60));
      }
    } finally {
      setInstant3xRunning(false);
    }
  };

  const toggle5x = () => {
    setAuto5xRunning(!auto5xRunning);
    setAnalysisStatus(
      auto5xRunning ? "Stopped." : "Auto trading logic not implemented."
    );
  };

  /* RENDER */
  return (
    <div className="min-h-screen bg-[#0b0c11] text-white p-6">

      {/* HEADER */}
      <div className="flex justify-between mb-6">
        <h1 className="text-xl font-semibold">MetroX Trading Dashboard</h1>

        <div className="flex gap-2 items-center">
          <span className="text-sm px-3 py-1 rounded-full bg-emerald-600/20 border border-emerald-400/30">
            ● {connected ? "Connected" : "Disconnected"}
          </span>

          {!connected ? (
            <>
              <input
                type="password"
                placeholder="API Token"
                onChange={(e) => setToken(e.target.value)}
                className="bg-black/40 px-3 py-2 rounded-md border border-white/20"
              />
              <button onClick={connectDeriv} className="bg-indigo-500 px-4 py-2 rounded-md">
                Connect
              </button>
            </>
          ) : (
            <button onClick={disconnect} className="bg-red-500 px-4 py-2 rounded-md">
              Disconnect
            </button>
          )}
        </div>
      </div>

      {/* BALANCE */}
      <div className="mb-6 bg-[#13233d]/60 p-4 rounded-xl border border-white/10">
        <p className="text-sm text-white/70">Account Balance</p>
        <p className="text-2xl font-bold mt-1">
          {balance !== null ? `${balance.toFixed(2)} ${currency}` : "—"}
        </p>
      </div>

      {/* MAIN PANEL */}
      <MetroXPanel
    ticks={ticks}
    pipSize={pipSize}
    stake={stake}
    setStake={setStake}
    selectedDigit={selectedDigit}
    setSelectedDigit={setSelectedDigit}
    selectedPair={selectedPair}
    setSelectedPair={setSelectedPair}
    mdTradeType={mdTradeType}
    setMdTradeType={setMdTradeType}
    mdTickDuration={mdTickDuration}
    setMdTickDuration={setMdTickDuration}
    onPlaceMetroX={() => placeTrade(mdTradeType, mdTickDuration)}
    on3xSelectedDigit={on3xSelectedDigit}
    instant3xRunning={instant3xRunning}
    turboMode={turboMode}
    setTurboMode={setTurboMode}
    onToggle5x={toggle5x}
    auto5xRunning={auto5xRunning}
    analysisStatus={analysisStatus}
    lastWinDigit={lastWinDigit}
    lastLossDigit={lastLossDigit}
    tradeHistory={tradeHistory}
    onClearHistory={clearHistory}
    currency={currency}
    intelligentEnabled={intelligentEnabled}
    setIntelligentEnabled={setIntelligentEnabled}
    intelligentDigits={intelligentDigits}
    intelligentLeastDigit={intelligentLeastDigit}
    intelligentTotal={intelligentTotal}
/>
    </div>
  );
}
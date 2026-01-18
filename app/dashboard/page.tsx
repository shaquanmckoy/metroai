"use client";

import React, { useEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";

const APP_ID = 1089;

// ===================== UPDATED INDEX LIST =====================

export const INDEX_GROUPS = {
  volatility: [
    { code: "R_10", label: "Volatility 10 Index" },
    { code: "R_25", label: "Volatility 25 Index" },
    { code: "R_50", label: "Volatility 50 Index" },
    { code: "R_75", label: "Volatility 75 Index" },
    { code: "R_100", label: "Volatility 100 Index" },
  ],

  volatility_1s: [
    { code: "R_10_1HZ", label: "Volatility 10 (1s)" },
    { code: "R_25_1HZ", label: "Volatility 25 (1s)" },
    { code: "R_50_1HZ", label: "Volatility 50 (1s)" },
    { code: "R_75_1HZ", label: "Volatility 75 (1s)" },
    { code: "R_100_1HZ", label: "Volatility 100 (1s)" },
  ],
};

export const PAIRS = [
  "R_10",
  "R_25",
  "R_50",
  "R_75",
  "R_100",
  "R_10_1HZ",
  "R_25_1HZ",
  "R_50_1HZ",
  "R_75_1HZ",
  "R_100_1HZ",
] as const;

export type Pair = (typeof PAIRS)[number];

type TradeResult = "Win" | "Loss" | "Pending";
type TradeType = "Matches" | "Differs" | "Over" | "Under";

type Trade = {
  id: number; // req_id
  contract_id?: number;

  symbol: Pair;
  digit: number;
  type: TradeType;

  stake: number;
  durationTicks: number;

  payout?: number;
  profit?: number;

  // ✅ digit contract settled on (exit/settlement digit)
  settlementDigit?: number;

  result: TradeResult;
  createdAt: number;
};

const CONTRACT_TYPE_MAP: Record<TradeType, string> = {
  Matches: "DIGITMATCH",
  Differs: "DIGITDIFF",
  Over: "DIGITOVER",
  Under: "DIGITUNDER",
};

function sleep(ms: number) {
  return new Promise((r) => setTimeout(r, ms));
}

function formatTime(ms: number) {
  return new Date(ms).toLocaleString();
}

/** ================= ADMIN STRATEGY FLAGS (NEW) =================
 * Stored in localStorage under STRATEGY_FLAGS_KEY.
 * These flags are enforced for USERS only. Admins always see everything.
 */
const STRATEGY_FLAGS_KEY = "strategy_flags";

type StrategyKey = "matches" | "overunder";
type StrategyFlags = Record<StrategyKey, boolean>;

const DEFAULT_FLAGS: StrategyFlags = {
  matches: true,
  overunder: true,
};

function readStrategyFlags(): StrategyFlags {
  try {
    const raw = localStorage.getItem(STRATEGY_FLAGS_KEY);
    if (!raw) return DEFAULT_FLAGS;
    const parsed = JSON.parse(raw) as Partial<StrategyFlags>;
    return {
      matches: typeof parsed.matches === "boolean" ? parsed.matches : true,
      overunder: typeof parsed.overunder === "boolean" ? parsed.overunder : true,
    };
  } catch {
    return DEFAULT_FLAGS;
  }
}

export default function Dashboard() {
  const router = useRouter();

  // ✅ auth gate (prevents direct access after logout)
  const [authChecked, setAuthChecked] = useState(false);
  const [isAdmin, setIsAdmin] = useState(false);

  // ✅ which strategies are enabled for USERS (admins ignore these)
  const [strategyFlags, setStrategyFlags] = useState<StrategyFlags>(DEFAULT_FLAGS);

  useEffect(() => {
    const loggedIn = localStorage.getItem("loggedIn") === "true";
    const role = (localStorage.getItem("role") || "").toLowerCase();

    if (!loggedIn) {
      router.replace("/");
      return;
    }

    // ✅ allow admin to stay on dashboard too
    const admin = role === "admin";
    setIsAdmin(admin);

    // ✅ load flags (used for non-admin users)
    setStrategyFlags(readStrategyFlags());

    setAuthChecked(true);
  }, [router]);

  // ✅ live-update if admin changes flags in another tab/page
  useEffect(() => {
    const onStorage = (e: StorageEvent) => {
      if (e.key === STRATEGY_FLAGS_KEY) {
        setStrategyFlags(readStrategyFlags());
      }
    };
    window.addEventListener("storage", onStorage);
    return () => window.removeEventListener("storage", onStorage);
  }, []);

  const wsRef = useRef<WebSocket | null>(null);
  const authorizedRef = useRef(false);

  // ✅ force-remount MetroX panel (resets its local analysis state)
  const [metroXResetKey, setMetroXResetKey] = useState(0);

  // per-pair rolling digits cache
  const pairDigitsRef = useRef<Record<Pair, number[]>>(
  Object.fromEntries(PAIRS.map((p) => [p, []])) as unknown as Record<Pair, number[]>
);

  // buy ack waiters (req_id -> promise resolver)
  const buyAckWaitersRef = useRef<
    Record<number, { resolve: () => void; reject: (msg: string) => void }>
  >({});

  // contract_id -> req_id
  const contractToReqRef = useRef<Record<number, number>>({});

  // req_id -> info
  const reqInfoRef = useRef<
    Record<number, { symbol: Pair; digit: number; type: TradeType; stake: number }>
  >({});

  // ✅ flash digit result (win/loss) for 2 seconds
  const flashTimerRef = useRef<number | null>(null);
  const [lastWinDigit, setLastWinDigit] = useState<number | null>(null);
  const [lastLossDigit, setLastLossDigit] = useState<number | null>(null);

  // 5x autotrade cancellation + time limit
  const auto5xCancelRef = useRef(false);

  const [token, setToken] = useState("");
  const [connected, setConnected] = useState(false);

  const [balance, setBalance] = useState<number | null>(null);
  const [currency, setCurrency] = useState("USD");

  const [pipSize, setPipSize] = useState<number>(2);

  const [ticks, setTicks] = useState<number[]>([]);

  const [activeStrategy, setActiveStrategy] = useState<"matches" | "overunder" | null>(null);

  const [selectedPair, setSelectedPair] = useState<Pair>(PAIRS[0]);
  const [stake, setStake] = useState<number>(1);
  const [selectedDigit, setSelectedDigit] = useState<number | null>(null);

  // MetroX controls
  const [mdTradeType, setMdTradeType] = useState<"Differs" | "Matches">("Differs");
  const [mdTickDuration, setMdTickDuration] = useState<number>(1);

  const [tradeHistoryMatches, setTradeHistoryMatches] = useState<Trade[]>([]);
  const [tradeHistoryOverUnder, setTradeHistoryOverUnder] = useState<Trade[]>([]);

  const [instant3xRunning, setInstant3xRunning] = useState(false);
  const [turboMode, setTurboMode] = useState(false);

  const [auto5xRunning, setAuto5xRunning] = useState(false);
  const [analysisStatus, setAnalysisStatus] = useState<string>("");

  // collapsible analysis box
  const [analysisOpen, setAnalysisOpen] = useState(false);

  // per-pair meta (for display + decision)
  const emptyMeta = Object.fromEntries(
  PAIRS.map((p) => [p, { count: 0 }])
) as unknown as Record<Pair, { count: number; lowDigit?: number; lowPct?: number }>;
const [pairMeta, setPairMeta] = useState(emptyMeta);

  // ✅ left-side Profit/Loss box (same metric as MetroX trade history)
  const metroXNetProfit = useMemo(() => {
    return tradeHistoryMatches.reduce((acc, t) => acc + Number(t.profit ?? 0), 0);
  }, [tradeHistoryMatches]);

  // ✅ cleanup socket when leaving dashboard
  useEffect(() => {
    return () => {
      try {
        wsRef.current?.close();
      } catch {}
    };
  }, []);

  const safeSend = (payload: unknown) => {
    const ws = wsRef.current;
    if (!ws || ws.readyState !== WebSocket.OPEN) return false;
    ws.send(JSON.stringify(payload));
    return true;
  };

  const newReqId = () => Date.now() + Math.floor(Math.random() * 1000);

  // ✅ robust last digit (handles 0 correctly)
  const getLastDigit = (quote: number, pip: number) => {
    const fixed = quote.toFixed(pip);
    const compact = fixed.replace(".", "");
    const ch = compact[compact.length - 1];
    const d = Number(ch);
    return Number.isFinite(d) ? d : 0;
  };

  const digitPercentFromList = (list: number[], d: number) => {
    if (!list.length) return 0;
    const c = list.filter((x) => x === d).length;
    return (c / list.length) * 100;
  };

  const lowestDigitFromList = (list: number[]) => {
    let bestDigit = 0;
    let bestPct = Infinity;
    for (let d = 0; d <= 9; d++) {
      const pct = digitPercentFromList(list, d);
      if (pct < bestPct) {
        bestPct = pct;
        bestDigit = d;
      }
    }
    return { digit: bestDigit, percent: bestPct };
  };

  const subscribeAllPairs = () => {
  PAIRS.forEach((sym) => {
    safeSend({ ticks: sym, subscribe: 1 });
  });
};

  const getLast20FromCache = (sym: Pair) => {
    const arr = pairDigitsRef.current[sym] ?? [];
    return arr.slice(-20);
  };

  // Wait until a pair has >=20 cached ticks (bounded by timeoutMs)
  const waitForCache20 = async (sym: Pair, timeoutMs: number) => {
    const start = Date.now();
    while (Date.now() - start < timeoutMs) {
      if (auto5xCancelRef.current) return false;
      const count = (pairDigitsRef.current[sym] ?? []).length;
      if (count >= 20) return true;
      await sleep(120);
    }
    return false;
  };

  const flashResultDigit = (kind: "win" | "loss", digit: number) => {
    if (kind === "win") {
      setLastWinDigit(digit);
      setLastLossDigit(null);
    } else {
      setLastLossDigit(digit);
      setLastWinDigit(null);
    }
    if (flashTimerRef.current) window.clearTimeout(flashTimerRef.current);
    flashTimerRef.current = window.setTimeout(() => {
      setLastWinDigit(null);
      setLastLossDigit(null);
    }, 2000);
  };

  /* ================= DERIV CONNECTION ================= */

  const connectDeriv = () => {
    if (!token) return alert("Please enter your Deriv API token");

    try {
      wsRef.current?.close();
    } catch {}
    wsRef.current = null;

    authorizedRef.current = false;
    buyAckWaitersRef.current = {};
    contractToReqRef.current = {};
    reqInfoRef.current = {};

   pairDigitsRef.current = Object.fromEntries(PAIRS.map((p) => [p, []])) as unknown as Record<Pair, number[]>;
    setPairMeta(
  Object.fromEntries(PAIRS.map((p) => [p, { count: 0 }])) as unknown as Record<
    Pair,
    { count: number; lowDigit?: number; lowPct?: number }
  >
);

    setTicks([]);
    setSelectedDigit(null);
    setLastWinDigit(null);
    setLastLossDigit(null);

    const ws = new WebSocket(`wss://ws.derivws.com/websockets/v3?app_id=${APP_ID}`);
    wsRef.current = ws;

    ws.onopen = () => {
      safeSend({ authorize: token });
    };

    ws.onmessage = (e) => {
      const data = JSON.parse(e.data);

      // ignore harmless already subscribed message
      if (data?.error?.message) {
        const msg: string = data.error.message;
        if (msg.toLowerCase().includes("already subscribed")) return;

        const req_id: number | undefined = data.req_id;
        if (req_id && buyAckWaitersRef.current[req_id]) {
          buyAckWaitersRef.current[req_id].reject(msg);
          delete buyAckWaitersRef.current[req_id];
          return;
        }

        alert(msg);
        return;
      }

      if (data.msg_type === "authorize") {
        authorizedRef.current = true;
        setConnected(true);

        safeSend({ balance: 1, subscribe: 1 });
        subscribeAllPairs();
      }

      if (data.msg_type === "balance") {
        setBalance(Number(data.balance.balance));
        setCurrency(data.balance.currency);
      }

      if (data.msg_type === "tick" && data.tick?.quote !== undefined) {
        const symbol = data.tick.symbol as Pair;
        if (!PAIRS.includes(symbol)) return;

        const ps = typeof data.tick.pip_size === "number" ? data.tick.pip_size : pipSize;
        if (typeof data.tick.pip_size === "number") setPipSize(ps);

        const digit = getLastDigit(Number(data.tick.quote), ps);

        const prev = pairDigitsRef.current[symbol] ?? [];
        const next = [...prev, digit];
        if (next.length > 200) next.shift();
        pairDigitsRef.current[symbol] = next;

        const last20 = next.slice(-20);
        if (last20.length >= 20) {
          const low = lowestDigitFromList(last20);
          setPairMeta((m) => ({
            ...m,
            [symbol]: { count: next.length, lowDigit: low.digit, lowPct: low.percent },
          }));
        } else {
          setPairMeta((m) => ({ ...m, [symbol]: { ...m[symbol], count: next.length } }));
        }

        if (symbol === selectedPair) setTicks(next);
      }

      // proposal -> buy
      if (data.msg_type === "proposal") {
        const req_id: number | undefined = data.req_id;
        const proposalId: string | undefined = data.proposal?.id;
        if (!req_id || !proposalId) return;

        const stakeForReq = reqInfoRef.current[req_id]?.stake ?? stake;

        safeSend({
          buy: proposalId,
          price: stakeForReq,
          req_id,
        });
      }

      // buy ack
      if (data.msg_type === "buy") {
        const req_id: number | undefined = data.req_id;
        const contract_id: number | undefined = data.buy?.contract_id;
        if (!req_id || !contract_id) return;

        contractToReqRef.current[contract_id] = req_id;

        const apply = (arr: Trade[]) => arr.map((t) => (t.id === req_id ? { ...t, contract_id } : t));
        setTradeHistoryMatches((prev) => apply(prev));
        setTradeHistoryOverUnder((prev) => apply(prev));

        if (buyAckWaitersRef.current[req_id]) {
          buyAckWaitersRef.current[req_id].resolve();
          delete buyAckWaitersRef.current[req_id];
        }

        safeSend({ proposal_open_contract: 1, contract_id, subscribe: 1 });
      }

      // contract settlement
      if (data.msg_type === "proposal_open_contract") {
        const poc = data.proposal_open_contract;
        if (!poc?.contract_id) return;

        const contract_id: number = poc.contract_id;
        const req_id = contractToReqRef.current[contract_id];
        if (!req_id) return;

        const finished = poc.is_sold || poc.status === "sold" || poc.is_expired || poc.status === "expired";
        if (!finished) return;

        const profit = Number(poc.profit ?? 0);
        const payout = Number(poc.payout ?? 0);
        const result: TradeResult = profit > 0 ? "Win" : "Loss";

        // ✅ digit that contract actually settled on (exit digit)
        let settlementDigit: number | undefined;
        if (typeof poc.exit_tick === "number") {
          settlementDigit = getLastDigit(poc.exit_tick, pipSize);
        } else if (typeof poc.exit_spot === "number") {
          settlementDigit = getLastDigit(poc.exit_spot, pipSize);
        }

        const update = (arr: Trade[]) =>
          arr.map((t) => (t.id === req_id ? { ...t, result, profit, payout, settlementDigit } : t));

        setTradeHistoryMatches((prev) => update(prev));
        setTradeHistoryOverUnder((prev) => update(prev));

        // ✅ flash green 💰 on WIN digit OR red ❌ on LOSS digit
        if (typeof settlementDigit === "number") {
          flashResultDigit(result === "Win" ? "win" : "loss", settlementDigit);
        }

        delete contractToReqRef.current[contract_id];
        delete reqInfoRef.current[req_id];
      }
    };

    ws.onclose = () => {
      setConnected(false);
      setBalance(null);
      authorizedRef.current = false;
    };

    ws.onerror = () => alert("Connection failed");
  };

  const disconnect = () => {
    wsRef.current?.close();
    wsRef.current = null;
    setConnected(false);
    setBalance(null);
    authorizedRef.current = false;
  };

  const logout = () => {
    disconnect();
    localStorage.clear();
    router.replace("/");
  };

  useEffect(() => {
    const arr = pairDigitsRef.current[selectedPair] ?? [];
    setTicks(arr);
    setSelectedDigit(null);
  }, [selectedPair]);

  /* ================= TRADE PLACEMENT ================= */

  const placeTrade = (type: TradeType, durationTicks: number) => {
    if (selectedDigit === null) return alert("Select a digit first");
    if (!stake || stake <= 0) return alert("Enter a stake amount");
    if (!wsRef.current || wsRef.current.readyState !== WebSocket.OPEN) return alert("WebSocket not connected yet");
    if (!authorizedRef.current) return alert("Not authorized yet");

    const req_id = newReqId();

    const trade: Trade = {
      id: req_id,
      symbol: selectedPair,
      digit: selectedDigit,
      type,
      stake,
      durationTicks,
      result: "Pending",
      createdAt: Date.now(),
    };

    if (type === "Matches" || type === "Differs") setTradeHistoryMatches((prev) => [trade, ...prev]);
    else setTradeHistoryOverUnder((prev) => [trade, ...prev]);

    reqInfoRef.current[req_id] = { symbol: selectedPair, digit: selectedDigit, type, stake };

    safeSend({
      proposal: 1,
      amount: stake,
      basis: "stake",
      contract_type: CONTRACT_TYPE_MAP[type],
      currency: currency || "USD",
      symbol: selectedPair,
      duration: durationTicks,
      duration_unit: "t",
      barrier: String(selectedDigit),
      req_id,
    });
  };

  // Place one DIFFERS trade for symbol+digit and wait for buy-ack (safe for fast bursts)
  const placeDiffersAndWaitBuyAck = async (symbol: Pair, digit: number) => {
    if (!wsRef.current || wsRef.current.readyState !== WebSocket.OPEN) throw new Error("WebSocket not connected");
    if (!authorizedRef.current) throw new Error("Not authorized");

    const req_id = newReqId();

    const trade: Trade = {
      id: req_id,
      symbol,
      digit,
      type: "Differs",
      stake,
      durationTicks: 1,
      result: "Pending",
      createdAt: Date.now(),
    };

    setTradeHistoryMatches((prev) => [trade, ...prev]);
    reqInfoRef.current[req_id] = { symbol, digit, type: "Differs", stake };

    const p = new Promise<void>((resolve, reject) => {
      buyAckWaitersRef.current[req_id] = {
        resolve,
        reject: (msg: string) => reject(new Error(msg)),
      };
    });

    safeSend({
      proposal: 1,
      amount: stake,
      basis: "stake",
      contract_type: CONTRACT_TYPE_MAP["Differs"],
      currency: currency || "USD",
      symbol,
      duration: mdTickDuration,
      duration_unit: "t",
      barrier: String(digit),
      req_id,
    });

    await Promise.race([
      p,
      new Promise<void>((_, reject) => setTimeout(() => reject(new Error("Timed out waiting for buy ack")), 9000)),
    ]);
  };

  /* ================= 3x Selected Digit ================= */

  const place3xSelectedDigit = async () => {
    if (instant3xRunning) return;
    if (selectedDigit === null) return alert("Select a digit first");
    if (!stake || stake <= 0) return alert("Enter a stake amount");

    setInstant3xRunning(true);
    const gapMs = turboMode ? 0 : 50;

    try {
      await placeDiffersAndWaitBuyAck(selectedPair, selectedDigit);
      if (gapMs) await sleep(gapMs);
      await placeDiffersAndWaitBuyAck(selectedPair, selectedDigit);
      if (gapMs) await sleep(gapMs);
      await placeDiffersAndWaitBuyAck(selectedPair, selectedDigit);
    } catch (err) {
      alert(err instanceof Error ? err.message : "We couldn't process your trade.");
    } finally {
      setInstant3xRunning(false);
    }
  };

  /* ================= 5x AutoTrading ================= */

  const toggle5xAutoTrading = async () => {
    if (auto5xRunning) {
      auto5xCancelRef.current = true;
      setAnalysisStatus("Stopping...");
      return;
    }

    if (!stake || stake <= 0) return alert("Enter a stake amount");
    if (!wsRef.current || wsRef.current.readyState !== WebSocket.OPEN) return alert("WebSocket not connected yet");
    if (!authorizedRef.current) return alert("Not authorized yet");

    auto5xCancelRef.current = false;
    setAuto5xRunning(true);

    const gapMs = turboMode ? 0 : 50;
    const deadline = Date.now() + 5000;

    try {
      setAnalysisStatus("Starting 5x AutoTrading (max 5s)...");

      const usedPairs = new Set<Pair>();
      let placed = 0;

      while (placed < 5 && Date.now() < deadline) {
        if (auto5xCancelRef.current) break;

        const candidates: { symbol: Pair; digit: number; percent: number }[] = [];

        for (const sym of PAIRS) {
          if (usedPairs.has(sym)) continue;

          const remaining = Math.max(0, deadline - Date.now());
          if (remaining <= 0) break;

          const have20 = (pairDigitsRef.current[sym] ?? []).length >= 20;
          if (!have20) {
            setAnalysisStatus(`Waiting for 20 cached ticks: ${sym}...`);
            const ok = await waitForCache20(sym, Math.min(remaining, 650));
            if (!ok) continue;
          }

          const last20 = getLast20FromCache(sym);
          if (last20.length < 20) continue;

          const low = lowestDigitFromList(last20);
          if (low.percent <= 8.0) candidates.push({ symbol: sym, digit: low.digit, percent: low.percent });
        }

        if (candidates.length === 0) {
          setAnalysisStatus("No valid pairs right now (all > 8.0% or still caching).");
          await sleep(180);
          continue;
        }

        candidates.sort((a, b) => a.percent - b.percent);
        const pick = candidates[0];

        setAnalysisStatus(
          `Placing trade ${placed + 1}/5: ${pick.symbol} digit ${pick.digit} (${pick.percent.toFixed(1)}%)`
        );

        try {
          await placeDiffersAndWaitBuyAck(pick.symbol, pick.digit);
          usedPairs.add(pick.symbol);
          placed += 1;
          if (gapMs) await sleep(gapMs);
        } catch {
          usedPairs.add(pick.symbol);
        }
      }

      if (auto5xCancelRef.current) {
        setAnalysisStatus(`Stopped by user. Trades placed: ${placed}/5`);
      } else if (placed === 0) {
        setAnalysisStatus("No trades placed within 5 seconds (all pairs > 8.0% or not enough cached ticks).");
      } else if (placed < 5) {
        setAnalysisStatus(`Finished (time limit reached). Trades placed: ${placed}/5`);
      } else {
        setAnalysisStatus("5x AutoTrading completed (5/5).");
      }
    } catch (err) {
      setAnalysisStatus(err instanceof Error ? err.message : "AutoTrading error.");
    } finally {
      setAuto5xRunning(false);
      auto5xCancelRef.current = false;
    }
  };

  // ✅ enforce strategy availability for USERS (NEW)
  const isStrategyEnabledForViewer = (key: StrategyKey) => {
    if (isAdmin) return true;
    return strategyFlags[key] !== false;
  };

  // ✅ if admin disables a strategy while a USER is viewing it, close it (NEW)
  useEffect(() => {
    if (isAdmin) return;
    if (activeStrategy === "matches" && !isStrategyEnabledForViewer("matches")) setActiveStrategy(null);
    if (activeStrategy === "overunder" && !isStrategyEnabledForViewer("overunder")) setActiveStrategy(null);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [strategyFlags, isAdmin]);

  // remount MetroX panel when strategy changes
  useEffect(() => {
    setMetroXResetKey((k) => k + 1);

    if (activeStrategy !== "matches") {
      setSelectedDigit(null);
      setAnalysisOpen(false);
      setAnalysisStatus("");
      setLastWinDigit(null);
      setLastLossDigit(null);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeStrategy]);

  // ✅ prevent UI showing before auth is checked
  if (!authChecked) {
    return (
      <main className="min-h-screen bg-black text-white flex items-center justify-center">
        Loading...
      </main>
    );
  }

  return (
    <main className="min-h-screen relative overflow-hidden text-white">
      {/* Background layers */}
      <div className="pointer-events-none absolute inset-0 bg-gradient-to-br from-[#070c16] via-[#070c16] to-black" />
      <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(60%_60%_at_20%_10%,rgba(255,140,0,0.18),transparent_60%)]" />
      <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(55%_55%_at_80%_20%,rgba(59,130,246,0.16),transparent_60%)]" />
      <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(60%_60%_at_50%_85%,rgba(16,185,129,0.10),transparent_60%)]" />

      <div className="relative">
        {/* NAVBAR */}
        <header className="h-16 bg-[#0f1b2d]/70 backdrop-blur-md flex items-center justify-between px-6 border-b border-white/10">
          <div className="flex items-center gap-3">
            <div className="w-9 h-9 rounded-md bg-orange-500 flex items-center justify-center font-bold shadow-[0_0_0_1px_rgba(255,255,255,0.12)]">
              M
            </div>
            <div>
              <p className="font-bold leading-tight">MetroAi</p>
              <p className="text-xs text-gray-400">AI Trading</p>
            </div>
          </div>

          <nav className="flex items-center gap-6 text-sm text-gray-300">
            <span className="text-green-400">● {connected ? "Connected" : "Disconnected"}</span>
            <button onClick={() => router.push("/")}>Home</button>

            {/* ✅ only show Admin button for admins */}
            {isAdmin && (
              <button onClick={() => router.push("/admin")} className="text-red-200 hover:text-red-300">
                Admin
              </button>
            )}

            <button>Analyzer</button>
            <button>Auto Trader</button>
            <button onClick={logout} className="hover:text-red-400">
              Logout
            </button>
          </nav>
        </header>

        {/* PAGE HEADER */}
        <section className="px-8 py-6">
          <div className="bg-gradient-to-r from-orange-600/80 to-orange-900/80 rounded-2xl p-6 flex justify-between items-center border border-white/10 shadow-[0_0_0_1px_rgba(255,255,255,0.06)]">
            <div>
              <h1 className="text-2xl font-bold">Trading Analyzer</h1>
              <p className="text-sm text-orange-100">Connect to Deriv and manage your trading activities</p>
            </div>

            {!connected ? (
              <div className="flex gap-2">
                <input
                  type="password"
                  placeholder="Deriv API Token"
                  className="bg-black/40 px-3 py-2 rounded-md border border-white/10"
                  onChange={(e) => setToken(e.target.value)}
                />
                <button
                  onClick={connectDeriv}
                  className="bg-indigo-500 px-4 py-2 rounded-md text-sm shadow-[0_0_0_1px_rgba(255,255,255,0.10)]"
                >
                  Connect
                </button>
              </div>
            ) : (
              <button
                onClick={disconnect}
                className="bg-red-500 hover:bg-red-600 px-4 py-2 rounded-md text-sm shadow-[0_0_0_1px_rgba(255,255,255,0.10)]"
              >
                Disconnect
              </button>
            )}
          </div>
        </section>

        {/* MAIN GRID */}
        <section className="px-8 pb-8 grid grid-cols-1 lg:grid-cols-2 gap-6">
          {/* LEFT */}
          <div className="space-y-6">
            <div className="bg-[#13233d]/80 backdrop-blur rounded-2xl p-6 border border-white/10 shadow-[0_0_0_1px_rgba(255,255,255,0.06)]">
              <h2 className="font-semibold mb-4 text-white/90">Deriv API Connection</h2>

              <div className="grid grid-cols-2 lg:grid-cols-3 gap-4 text-sm">
                <div className="bg-black/30 rounded-xl p-4 border border-white/10">
                  <p className="text-gray-400">Account Status</p>
                  <p className="font-semibold text-green-400">{connected ? "Connected" : "Disconnected"}</p>
                </div>

                <div className="bg-black/30 rounded-xl p-4 border border-white/10">
                  <p className="text-gray-400">Account Balance</p>
                  <p className="font-semibold text-lg">
                    {balance !== null ? `${balance.toFixed(2)} ${currency}` : "Loading..."}
                  </p>
                </div>

                <div className="bg-black/30 rounded-xl p-4 border border-white/10">
                  <p className="text-gray-400">Session Profit/Loss</p>
                  <p className={`font-semibold text-lg ${metroXNetProfit >= 0 ? "text-emerald-400" : "text-red-400"}`}>
                    {metroXNetProfit >= 0 ? "+" : ""}
                    {metroXNetProfit.toFixed(2)} {currency}
                  </p>
                </div>
              </div>
            </div>

            <div className="bg-[#13233d]/80 backdrop-blur rounded-2xl p-6 border border-white/10 shadow-[0_0_0_1px_rgba(255,255,255,0.06)]">
              <h2 className="font-semibold mb-4 text-white/90">Trading Strategies</h2>

              {/* ✅ show/hide based on admin flags (NEW) */}
              {isStrategyEnabledForViewer("matches") ? (
                <StrategyRow
                  title="MetroX"
                  description="Matches/Differs strategy"
                  active={activeStrategy === "matches"}
                  onToggle={() => setActiveStrategy(activeStrategy === "matches" ? null : "matches")}
                />
              ) : (
                !isAdmin && (
                  <div className="mb-4 rounded-lg bg-black/20 border border-white/10 p-3 text-xs text-white/60">
                    MetroX is currently disabled by admin.
                  </div>
                )
              )}

              {isStrategyEnabledForViewer("overunder") ? (
                <StrategyRow
                  title="Over / Under"
                  description="Digit threshold probability strategy"
                  active={activeStrategy === "overunder"}
                  onToggle={() => setActiveStrategy(activeStrategy === "overunder" ? null : "overunder")}
                />
              ) : (
                !isAdmin && (
                  <div className="mb-1 rounded-lg bg-black/20 border border-white/10 p-3 text-xs text-white/60">
                    Over / Under is currently disabled by admin.
                  </div>
                )
              )}
            </div>
          </div>

          {/* RIGHT */}
          <div className="rounded-2xl p-0 border border-white/10 overflow-hidden shadow-[0_0_0_1px_rgba(255,255,255,0.06)]">
            {activeStrategy === "matches" && isStrategyEnabledForViewer("matches") && (
              <MetroXPanel
                key={metroXResetKey}
                ticks={ticks}
                pipSize={pipSize}
                stake={stake}
                setStake={setStake}
                selectedDigit={selectedDigit}
                setSelectedDigit={setSelectedDigit}
                selectedPair={selectedPair}
                setSelectedPair={(p: Pair) => {
                  setSelectedPair(p);
                  setSelectedDigit(null);
                }}
                mdTradeType={mdTradeType}
                setMdTradeType={setMdTradeType}
                mdTickDuration={mdTickDuration}
                setMdTickDuration={setMdTickDuration}
                onPlaceMetroX={() => placeTrade(mdTradeType, mdTickDuration)}
                on3xSelectedDigit={place3xSelectedDigit}
                instant3xRunning={instant3xRunning}
                turboMode={turboMode}
                setTurboMode={setTurboMode}
                onToggle5x={toggle5xAutoTrading}
                auto5xRunning={auto5xRunning}
                analysisStatus={analysisStatus}
                analysisOpen={analysisOpen}
                setAnalysisOpen={setAnalysisOpen}
                lastWinDigit={lastWinDigit}
                lastLossDigit={lastLossDigit}
                pairMeta={pairMeta}
                tradeHistory={tradeHistoryMatches}
                onClearHistory={() => setTradeHistoryMatches([])}
                currency={currency}
              />
            )}

            {activeStrategy === "overunder" && isStrategyEnabledForViewer("overunder") && (
              <div className="bg-[#13233d] p-6">
                <StrategyPanel
                  type="overunder"
                  ticks={ticks}
                  selectedDigit={selectedDigit}
                  setSelectedDigit={(d: number) => setSelectedDigit(d)}
                  stake={stake}
                  setStake={setStake}
                  selectedPair={selectedPair}
                  setSelectedPair={(p: Pair) => setSelectedPair(p)}
                  tradeHistory={tradeHistoryOverUnder}
                  placeTrade={(t: TradeType) => placeTrade(t, 1)}
                />
              </div>
            )}

            {/* ✅ if user selects a disabled strategy, show the default empty state */}
            {!activeStrategy && (
              <div className="bg-gradient-to-br from-[#1b2235] to-[#121826] p-6 min-h-[520px] flex items-center justify-center">
                <div className="text-center text-gray-300/80 max-w-sm">
                  <div className="mx-auto mb-4 w-10 h-10 rounded-full bg-white/5 flex items-center justify-center border border-white/10">
                    <span className="text-white/70">📊</span>
                  </div>
                  <p className="text-lg font-semibold text-white/90">Select a Trading Strategy</p>
                  <p className="text-sm mt-1 text-white/60">
                    Choose one of the available trading strategies to start analyzing and trading
                  </p>
                </div>
              </div>
            )}
          </div>
        </section>
      </div>
    </main>
  );
}

/* ================= STRATEGY TOGGLE ================= */

function StrategyRow({
  title,
  description,
  active,
  onToggle,
}: {
  title: string;
  description: string;
  active: boolean;
  onToggle: () => void;
}) {
  return (
    <div className="flex items-center justify-between mb-4">
      <div>
        <p className="font-medium text-white/90">{title}</p>
        <p className="text-xs text-gray-400">{description}</p>
      </div>

      <button
        onClick={onToggle}
        className={`w-12 h-6 rounded-full relative ${active ? "bg-green-500" : "bg-gray-600"}`}
      >
        <span
          className={`absolute top-0.5 w-5 h-5 bg-white rounded-full transition ${
            active ? "right-0.5" : "left-0.5"
          }`}
        />
      </button>
    </div>
  );
}

/* ================= MetroX PANEL ================= */

function MetroXPanel({
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

  analysisOpen: boolean;
  setAnalysisOpen: (v: boolean) => void;

  lastWinDigit: number | null;
  lastLossDigit: number | null;

  pairMeta: Record<Pair, { count: number; lowDigit?: number; lowPct?: number }>;

  tradeHistory: Trade[];
  onClearHistory: () => void;

  currency: string;
}) {
  // ✅ use full tick list for % display
  const digitPercent = (d: number) => {
    if (!ticks.length) return 0;
    return (ticks.filter((x) => x === d).length / ticks.length) * 100;
  };

  // ✅ “high appearance” threshold (avg ~10%)
  const HIGH_PCT_THRESHOLD = 13.0;

  const last20 = ticks.slice(-20);
  const counts = useMemo(() => {
    const c = Array.from({ length: 10 }, () => 0);
    for (const x of last20) c[x] = (c[x] ?? 0) + 1;
    return c;
  }, [last20]);

  const lastDigit = ticks.length ? ticks[ticks.length - 1] : null;

  /* ================= Intelligent DIFFERS ================= */
  const [intelligentOn, setIntelligentOn] = useState(false);
  const [intelligentStartLen, setIntelligentStartLen] = useState(0);

  useEffect(() => {
    setIntelligentStartLen(ticks.length);
  }, [selectedPair]);

  useEffect(() => {
    if (intelligentOn) setIntelligentStartLen(ticks.length);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [intelligentOn]);

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
  /* ================= END Intelligent DIFFERS ================= */

  return (
    <div className="bg-gradient-to-br from-[#1b2235]/95 to-[#121826]/95 p-6 min-h-[520px]">
      {/* TOP CONTROLS */}
      <div className="grid grid-cols-2 gap-3 mb-4">
        <div>
          <p className="text-[11px] text-white/60 mb-1">Select Index</p>
          <select
  className="w-full bg-[#0e1422] border border-white/10 p-2 rounded-md text-sm"
  value={selectedPair}
  onChange={(e) => setSelectedPair(e.target.value as Pair)}
>
  <optgroup label="Volatility Indices">
    {INDEX_GROUPS.volatility.map((s) => (
      <option key={s.code} value={s.code}>
        {s.label}
      </option>
    ))}
  </optgroup>

  <optgroup label="Volatility 1-Second Indices">
    {INDEX_GROUPS.volatility_1s.map((s) => (
      <option key={s.code} value={s.code}>
        {s.label}
      </option>
    ))}
  </optgroup>

</select>
        </div>

        <div>
          <p className="text-[11px] text-white/60 mb-1">Strategy</p>
          <select className="w-full bg-[#0e1422] border border-white/10 p-2 rounded-md text-sm">
            <option>MetroX</option>
          </select>
        </div>
      </div>

      {/* STAKE */}
      <div className="mb-4">
        <p className="text-[11px] text-white/60 mb-1">Stake Amount</p>
        <div className="flex gap-2">
          <input
            type="number"
            step="0.1"
            min="0.1"
            value={stake}
            onChange={(e) => setStake(Number(e.target.value))}
            className="w-full bg-[#0e1422] border border-white/10 p-2 rounded-md text-sm"
          />
          <button
            onClick={() => setStake(1)}
            className="px-3 rounded-md bg-white/5 border border-white/10 text-sm hover:bg-white/10"
          >
            $1
          </button>
          <button
            onClick={() => setStake(5)}
            className="px-3 rounded-md bg-white/5 border border-white/10 text-sm hover:bg-white/10"
          >
            $5
          </button>
          <button
            onClick={() => setStake(10)}
            className="px-3 rounded-md bg-white/5 border border-white/10 text-sm hover:bg-white/10"
          >
            $10
          </button>
        </div>
      </div>

      {/* Trade type + duration */}
      <div className="bg-white/5 border border-white/10 rounded-xl p-3 mb-3">
        <div className="grid grid-cols-2 gap-3">
          <div>
            <p className="text-[11px] text-white/60 mb-1">Trade Type</p>
            <select
              value={mdTradeType}
              onChange={(e) => setMdTradeType(e.target.value as "Differs" | "Matches")}
              className="w-full bg-[#0e1422] border border-white/10 p-2 rounded-md text-sm"
            >
              <option value="Differs">DIFFERS</option>
              <option value="Matches">MATCHES</option>
            </select>
          </div>

          <div>
            <p className="text-[11px] text-white/60 mb-1">Tick Duration</p>
            <select
              value={mdTickDuration}
              onChange={(e) => setMdTickDuration(Number(e.target.value))}
              className="w-full bg-[#0e1422] border border-white/10 p-2 rounded-md text-sm"
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
      <div className="bg-gradient-to-r from-[#1b2a49]/70 to-[#1a2340]/70 border border-white/10 rounded-xl p-4 mb-3">
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
          <div className="mt-3 rounded-lg bg-black/20 border border-white/10 p-4">
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
      <div className="mt-2">
        <p className="text-sm text-white/80 mb-2">
          Last digit prediction - Click any digit to select for <span className="font-semibold">{mdTradeType.toUpperCase()}</span> trade
        </p>

        <div className="grid grid-cols-5 gap-3">
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
                className={`relative rounded-full py-3 text-center border transition ${cls}`}
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

        <p className="text-xs text-white/50 mt-3">
          Based on {ticks.length} ticks from <span className="font-semibold">{selectedPair}</span> • Last Digit:{" "}
          <span className="text-green-400 font-semibold">{lastDigit !== null ? lastDigit : "-"}</span>
        </p>

        {/* Collapsible analysis box */}
        <div className="mt-3 rounded-lg border border-white/10 bg-white/5 overflow-hidden">
          <button
            onClick={() => setAnalysisOpen(!analysisOpen)}
            className="w-full flex items-center justify-between px-3 py-2 text-xs text-white/80 hover:bg-white/5"
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
                 {PAIRS.map((p) => {
  const m = pairMeta[p];
  const has20 = m.count >= 20;

  const label =
  INDEX_GROUPS.volatility.find(x => x.code === p)?.label ||
  INDEX_GROUPS.volatility_1s.find(x => x.code === p)?.label ||
  p;

  return (
    <div
      key={p}
      className="flex items-center justify-between rounded-md border border-white/10 bg-black/10 px-2 py-2"
    >
      <span className="font-semibold">{label}</span>

      <span className="text-white/60">
        {Math.min(m.count, 200)}/200 cached •{" "}
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
      <div className="mt-5 space-y-3">
        <button
          onClick={() => {
            if (selectedDigit === null) return alert("Select a digit first");
            onPlaceMetroX();
          }}
          className="w-full rounded-md py-3 bg-emerald-600 hover:bg-emerald-700 text-sm font-semibold shadow-[0_0_0_1px_rgba(255,255,255,0.10)]"
        >
          ⚡ Place MetroX Trade
        </button>

        <button
          onClick={on3xSelectedDigit}
          disabled={instant3xRunning}
          className={`w-full rounded-md py-3 text-sm font-semibold shadow-[0_0_0_1px_rgba(255,255,255,0.10)] ${
            instant3xRunning ? "bg-slate-600 cursor-not-allowed" : "bg-red-600 hover:bg-red-700"
          }`}
        >
          {instant3xRunning ? "Placing 3 trades..." : "3x Selected Digit"}
        </button>

        <button
          onClick={onToggle5x}
          className={`w-full rounded-md py-3 text-sm font-semibold shadow-[0_0_0_1px_rgba(255,255,255,0.10)] ${
            auto5xRunning ? "bg-orange-600 hover:bg-orange-700" : "bg-purple-600 hover:bg-purple-700"
          }`}
        >
          {auto5xRunning ? "Stop 5x AutoTrading" : "5x AutoTrading"}
        </button>

        <div className="flex items-center justify-between px-2 text-xs text-white/70">
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
          <div className="rounded-lg bg-white/5 border border-white/10 p-3 text-xs text-white/70">{analysisStatus}</div>
        )}
      </div>

      {/* Trade History */}
      <TradeHistoryMetroLike tradeHistory={tradeHistory} currency={currency} onClear={onClearHistory} />
    </div>
  );
}

/* ================= Trade History (3 tabs only) ================= */

function TradeHistoryMetroLike({
  tradeHistory,
  currency,
  onClear,
}: {
  tradeHistory: Trade[];
  currency: string;
  onClear: () => void;
}) {
  const [tab, setTab] = useState<"all" | "wins" | "losses">("all");

  const netProfit = tradeHistory.reduce((acc, t) => acc + Number(t.profit ?? 0), 0);

  const wins = tradeHistory.filter((t) => t.result === "Win").length;
  const losses = tradeHistory.filter((t) => t.result === "Loss").length;
  const done = tradeHistory.filter((t) => t.result === "Win" || t.result === "Loss").length;
  const winRate = done ? (wins / done) * 100 : 0;

  const filtered = tradeHistory.filter((t) => {
    if (tab === "wins") return t.result === "Win";
    if (tab === "losses") return t.result === "Loss";
    return true;
  });

  return (
    <div className="mt-6 rounded-xl bg-gradient-to-br from-[#0f1b2d] to-[#0b1220] border border-white/10 p-4">
      <div className="flex items-center justify-between mb-3">
        <div className="flex items-center gap-2">
          <span className="w-8 h-8 rounded-lg bg-white/5 border border-white/10 flex items-center justify-center">🏆</span>
          <p className="font-semibold text-white/90">Trade History</p>
        </div>

        <button
          onClick={onClear}
          title="Clear trade history"
          className="w-9 h-9 rounded-full bg-red-600/20 border border-red-500/40 text-red-300 hover:bg-red-600/30 hover:text-red-200 transition"
        >
          🗑
        </button>
      </div>

      <div className="grid grid-cols-2 gap-3 mb-4">
        <div className="rounded-lg bg-white/5 border border-white/10 p-3">
          <p className="text-xs text-white/60">Net Profit/Loss</p>
          <p className={`text-2xl font-bold ${netProfit >= 0 ? "text-emerald-400" : "text-red-400"}`}>
            {netProfit >= 0 ? "+" : ""}
            {netProfit.toFixed(2)} {currency}
          </p>
        </div>

        <div className="rounded-lg bg-white/5 border border-white/10 p-3">
          <p className="text-xs text-white/60">Win Rate</p>
          <p className="text-2xl font-bold text-sky-300">
            {winRate.toFixed(1)}% <span className="text-xs text-white/50">({wins}/{done || 0})</span>
          </p>
        </div>
      </div>

      <div className="flex gap-2 mb-3">
        <button
          onClick={() => setTab("all")}
          className={`flex-1 rounded-full py-2 text-xs border ${
            tab === "all" ? "bg-sky-600/25 border-sky-500/30 text-white" : "bg-white/5 border-white/10 text-white/70"
          }`}
        >
          🧾 All Trades ({tradeHistory.length})
        </button>

        <button
          onClick={() => setTab("wins")}
          className={`flex-1 rounded-full py-2 text-xs border ${
            tab === "wins"
              ? "bg-emerald-600/20 border-emerald-500/30 text-white"
              : "bg-white/5 border-white/10 text-white/70"
          }`}
        >
          ✅ Wins ({wins})
        </button>

        <button
          onClick={() => setTab("losses")}
          className={`flex-1 rounded-full py-2 text-xs border ${
            tab === "losses"
              ? "bg-red-600/20 border-red-500/30 text-white"
              : "bg-white/5 border border-white/10 text-white/70"
          }`}
        >
          ❌ Losses ({losses})
        </button>
      </div>

      <div className="max-h-72 overflow-y-auto space-y-3 pr-1">
        {filtered.length === 0 ? (
          <div className="rounded-lg bg-white/5 border border-white/10 p-3 text-xs text-white/60">No trades in this tab.</div>
        ) : (
          filtered.map((t, idx) => {
            const pillColor =
              t.result === "Pending"
                ? "bg-yellow-500/15 border-yellow-400/20 text-yellow-200"
                : t.result === "Win"
                ? "bg-emerald-500/15 border-emerald-400/20 text-emerald-200"
                : "bg-red-500/15 border-red-400/20 text-red-200";

            const profitVal = Number(t.profit ?? 0);
            const profitText = t.result === "Pending" ? "" : `${profitVal >= 0 ? "+" : ""}${profitVal.toFixed(2)} ${currency}`;

            const statusLabel =
              t.result === "Pending" ? "Pending" : t.result === "Win" ? "Completed - Won" : "Completed - Lost";

            return (
              <div key={idx} className="rounded-xl bg-white/5 border border-white/10 p-3">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <span className="text-sm font-semibold">{t.symbol}</span>
                    <span className={`text-[11px] px-2 py-0.5 rounded-full border ${pillColor}`}>
                      {t.result === "Win" ? "WON" : t.result === "Loss" ? "LOST" : "PENDING"}
                    </span>
                  </div>

                  <div
                    className={`text-sm font-semibold ${
                      t.result === "Win" ? "text-emerald-300" : t.result === "Loss" ? "text-red-300" : "text-white/60"
                    }`}
                  >
                    {profitText}
                  </div>
                </div>

                <div className="mt-2 flex flex-wrap items-center gap-2 text-[11px]">
                  <span className="px-2 py-0.5 rounded-full border border-white/10 bg-black/10 text-white/70">MetroX</span>
                  <span className="px-2 py-0.5 rounded-full border border-white/10 bg-black/10 text-white/70">
                    {t.durationTicks} tick{t.durationTicks > 1 ? "s" : ""}
                  </span>
                  <span className="px-2 py-0.5 rounded-full border border-white/10 bg-black/10 text-white/70">
                    Entry: {t.type.toUpperCase()} {t.digit}
                  </span>
                  <span className="px-2 py-0.5 rounded-full border border-white/10 bg-black/10 text-white/70">
                    Exit Digit: {typeof t.settlementDigit === "number" ? t.settlementDigit : "-"}
                  </span>
                </div>

                <div className="mt-3 grid grid-cols-2 gap-2 text-xs text-white/70">
                  <div className="flex items-center justify-between rounded-lg bg-black/10 border border-white/10 px-2 py-2">
                    <span className="text-white/55">Time</span>
                    <span>{formatTime(t.createdAt)}</span>
                  </div>

                  <div className="flex items-center justify-between rounded-lg bg-black/10 border border-white/10 px-2 py-2">
                    <span className="text-white/55">Stake</span>
                    <span>
                      {t.stake.toFixed(2)} {currency}
                    </span>
                  </div>

                  <div className="flex items-center justify-between rounded-lg bg-black/10 border border-white/10 px-2 py-2">
                    <span className="text-white/55">Payout</span>
                    <span>{typeof t.payout === "number" ? `${t.payout.toFixed(2)} ${currency}` : "-"}</span>
                  </div>

                  <div className="flex items-center justify-between rounded-lg bg-black/10 border border-white/10 px-2 py-2">
                    <span className="text-white/55">Profit</span>
                    <span className={profitVal >= 0 ? "text-emerald-300" : "text-red-300"}>
                      {t.result === "Pending" ? "-" : `${profitVal >= 0 ? "+" : ""}${profitVal.toFixed(2)} ${currency}`}
                    </span>
                  </div>

                  <div className="col-span-2 flex items-center justify-between rounded-lg bg-black/10 border border-white/10 px-2 py-2">
                    <span className="text-white/55">Status</span>
                    <span className={t.result === "Win" ? "text-emerald-300" : t.result === "Loss" ? "text-red-300" : "text-yellow-300"}>
                      {statusLabel}
                    </span>
                  </div>
                </div>
              </div>
            );
          })
        )}
      </div>
    </div>
  );
}

/* ================= STRATEGY PANEL (UNCHANGED) ================= */

function StrategyPanel({
  type,
  ticks,
  selectedDigit,
  setSelectedDigit,
  stake,
  setStake,
  selectedPair,
  setSelectedPair,
  tradeHistory,
  placeTrade,
}: {
  type: "matches" | "overunder";
  ticks: number[];
  selectedDigit: number | null;
  setSelectedDigit: (d: number) => void;
  stake: number;
  setStake: (s: number) => void;
  selectedPair: Pair;
  setSelectedPair: (p: Pair) => void;
  tradeHistory: Trade[];
  placeTrade: (t: TradeType) => void;
}) {
  const digitPercent = (d: number) => {
    if (!ticks.length) return 0;
    return (ticks.filter((x) => x === d).length / ticks.length) * 100;
  };

  const digitColor = (d: number) => {
    return `border rounded-lg p-3 text-center cursor-pointer ${
      d === selectedDigit ? "border-yellow-400" : "border-gray-700"
    }`;
  };

  return (
    <div>
      <div className="flex gap-2 mb-3 items-center">
        <select
          className="bg-black/30 p-2 rounded"
          value={selectedPair}
          onChange={(e) => setSelectedPair(e.target.value as Pair)}
        >
          {PAIRS.map((p) => (
            <option key={p} value={p}>
              {p}
            </option>
          ))}
        </select>

        <input
          type="number"
          min={0.1}
          step={0.1}
          placeholder="Stake"
          value={stake}
          onChange={(e) => setStake(Number(e.target.value))}
          className="bg-black/30 p-2 rounded w-24"
        />

        <div className="bg-black/30 p-2 rounded w-16 text-center">{selectedDigit !== null ? selectedDigit : "-"}</div>
      </div>

      <div className="grid grid-cols-5 gap-3 mb-3">
        {Array.from({ length: 10 }, (_, i) => (
          <div key={i} onClick={() => setSelectedDigit(i)} className={digitColor(i)}>
            <p className="font-bold">{i}</p>
            <p className="text-xs">{digitPercent(i).toFixed(1)}%</p>
          </div>
        ))}
      </div>

      <div className="flex gap-2 mb-3">
        {type === "overunder" && (
          <>
            <button onClick={() => placeTrade("Over")} className="bg-green-500 px-3 py-1 rounded">
              Over
            </button>
            <button onClick={() => placeTrade("Under")} className="bg-red-500 px-3 py-1 rounded">
              Under
            </button>
          </>
        )}
      </div>
    </div>
  );
}
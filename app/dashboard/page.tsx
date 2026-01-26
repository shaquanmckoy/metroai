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

  jump: [
    { code: "JD10", label: "Jump 10 Index" },
    { code: "JD25", label: "Jump 25 Index" },
    { code: "JD50", label: "Jump 50 Index" },
    { code: "JD75", label: "Jump 75 Index" },
    { code: "JD100", label: "Jump 100 Index" },
  ],
};

export const PAIRS = [
  "R_10",
  "R_25",
  "R_50",
  "R_75",
  "R_100",

  // 🚀 Jump
  "JD10",
  "JD25",
  "JD50",
  "JD75",
  "JD100",
] as const;

export type Pair = (typeof PAIRS)[number];

type TradeResult = "Win" | "Loss" | "Pending";
type TradeType = "Matches" | "Differs" | "Over" | "Under";

type Trade = {
  source?: "MetroX" | "SpiderX" | "SpiderX Auto";
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

// ✅ ALWAYS load flags on login
(async () => {
  const local = localStorage.getItem("strategy_flags");

  if (local) {
    // we already have them
    setStrategyFlags(readStrategyFlags());
  } else {
    // ❗ fetch from server if missing
    try {
      const res = await fetch("/api/admin/strategies", { cache: "no-store" });
      const data = await res.json();

      if (data?.ok && data.flags) {
        // save to localStorage for future use
        localStorage.setItem("strategy_flags", JSON.stringify(data.flags));
        setStrategyFlags(data.flags);
      } else {
        setStrategyFlags(DEFAULT_FLAGS);
      }
    } catch {
      setStrategyFlags(DEFAULT_FLAGS);
    }
  }

  setAuthChecked(true);
})();

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
  const activeStrategyRef = useRef<"matches" | "overunder" | null>(null);
  const selectedPairRef = useRef<Pair>(PAIRS[0]);

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
  Record<number, { symbol: Pair; digit: number; type: TradeType; stake: number; turbo?: boolean }>
>({});

  // ✅ flash digit result (win/loss) for 2 seconds
  const flashTimerRef = useRef<number | null>(null);
  const [lastWinDigit, setLastWinDigit] = useState<number | null>(null);
  const [lastLossDigit, setLastLossDigit] = useState<number | null>(null);

  // 5x autotrade cancellation + time limit
  const auto5xCancelRef = useRef(false);
  // ✅ prevent 1x Auto from trading the same pair back-to-back
const lastAuto1xPairRef = useRef<Pair | null>(null);

  const [token, setToken] = useState("");
  const [connected, setConnected] = useState(false);

  const [balance, setBalance] = useState<number | null>(null);
  const [currency, setCurrency] = useState("USD");

  const [pipSize, setPipSize] = useState<number>(2);

  const [ticks, setTicks] = useState<number[]>([]);

  const [activeStrategy, setActiveStrategy] = useState<"matches" | "overunder" | null>(null);
useEffect(() => {
  activeStrategyRef.current = activeStrategy;
}, [activeStrategy]);
  const [selectedPair, setSelectedPair] = useState<Pair>(PAIRS[0]);
  useEffect(() => {
  selectedPairRef.current = selectedPair;
}, [selectedPair]);
// 🛑 stop Fast AutoTrading when switching index
useEffect(() => {
  if (fastAutoRunning) {
    fastAutoCancelRef.current = true;
    setFastAutoRunning(false);
    setAnalysisStatus("Fast AutoTrading stopped (index changed).");
  }
  // eslint-disable-next-line react-hooks/exhaustive-deps
}, [selectedPair]);
  const [stake, setStake] = useState<number>(1);
  const [selectedDigit, setSelectedDigit] = useState<number | null>(null);
  // ✅ keep latest selected digit for Fast Auto loop
const selectedDigitRef = useRef<number | null>(null);

useEffect(() => {
  selectedDigitRef.current = selectedDigit;
}, [selectedDigit]);

  // MetroX controls
  const [mdTradeType, setMdTradeType] = useState<"Differs" | "Matches">("Differs");
  const [mdTickDuration, setMdTickDuration] = useState<number>(1);

  const [tradeHistory, setTradeHistory] = useState<Trade[]>([]);

  const [instant3xRunning, setInstant3xRunning] = useState(false);
  const [turboMode, setTurboMode] = useState(false);

  const [auto5xRunning, setAuto5xRunning] = useState(false);
  const [auto1xRunning, setAuto1xRunning] = useState(false);
  const [analysisStatus, setAnalysisStatus] = useState<string>("");
  // ✅ Fast AutoTrading (NEW)
const [fastAutoRunning, setFastAutoRunning] = useState(false);
const fastAutoCancelRef = useRef(false);
const fastAutoLoopRunningRef = useRef(false);
// ================= SpiderX Random Auto =================
const [spiderRandomRunning, setSpiderRandomRunning] = useState(false);
const spiderRandomCancelRef = useRef(false);
const spiderRandomLoopRef = useRef(false);

  // collapsible analysis box
  const [analysisOpen, setAnalysisOpen] = useState(false);

  // per-pair meta (for display + decision)
  const emptyMeta = Object.fromEntries(
  PAIRS.map((p) => [p, { count: 0 }])
) as unknown as Record<Pair, { count: number; lowDigit?: number; lowPct?: number }>;
const [pairMeta, setPairMeta] = useState(emptyMeta);

  // ✅ left-side Profit/Loss box (same metric as MetroX trade history)
  const sessionNetProfit = useMemo(() => {
  return tradeHistory.reduce((acc, t) => acc + Number(t.profit ?? 0), 0);
}, [tradeHistory]);

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
  // ================= BUY QUEUE (prevents stuck Pending in Turbo) =================
const buyQueueRef = useRef<Array<{ req_id: number; proposalId: string; price: number }>>([]);
const buyWorkerRunningRef = useRef(false);

const enqueueBuy = (req_id: number, proposalId: string, price: number) => {
  buyQueueRef.current.push({ req_id, proposalId, price });
  void runBuyWorker();
};

const runBuyWorker = async () => {
  if (buyWorkerRunningRef.current) return;
  buyWorkerRunningRef.current = true;

  try {
    while (buyQueueRef.current.length) {
      const item = buyQueueRef.current.shift();
      if (!item) break;

      const { req_id, proposalId, price } = item;

      // Create a waiter for THIS buy (works for turbo too)
      const ack = new Promise<void>((resolve, reject) => {
        buyAckWaitersRef.current[req_id] = {
          resolve,
          reject: (msg: string) => reject(new Error(msg)),
        };
      });

      safeSend({ buy: proposalId, price, req_id });

      // Wait for buy ack or timeout
      try {
        await Promise.race([
          ack,
          new Promise<void>((_, reject) => setTimeout(() => reject(new Error("Buy ack timeout")), 8000)),
        ]);
      } catch {
        // Mark as failed so it doesn't stay Pending forever
        const fail = (arr: Trade[]): Trade[] =>
  arr.map((t) =>
    t.id === req_id && t.result === "Pending"
      ? {
          ...t,
          result: "Loss" as TradeResult, // ✅ force correct union type
          profit: 0,
          payout: 0,
        }
      : t
  );
        setTradeHistory((prev) => fail(prev));
      }

      // Small gap between BUYs (Turbo-safe). If you still see issues, increase to 250.
      await sleep(turboMode ? 150 : 80);
    }
  } finally {
    buyWorkerRunningRef.current = false;
  }
};

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
const resetPairNow = (p: Pair) => {
  // 🔄 wipe ALL pair caches
  pairDigitsRef.current = Object.fromEntries(
    PAIRS.map((x) => [x, []])
  ) as unknown as Record<Pair, number[]>;

  // wipe UI
  setTicks([]);
  setSelectedDigit(null);
  setLastWinDigit(null);
  setLastLossDigit(null);

  // reset analysis UI
  setAnalysisOpen(false);
  setAnalysisStatus("");

  // 🔄 reset ALL per-pair meta
  setPairMeta(
    Object.fromEntries(PAIRS.map((x) => [x, { count: 0 }])) as unknown as Record<
      Pair,
      { count: number; lowDigit?: number; lowPct?: number }
    >
  );
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
  const req_id: number | undefined = data.req_id;

  // If a waiter exists, always reject it (turbo or not)
  if (req_id && buyAckWaitersRef.current[req_id]) {
    buyAckWaitersRef.current[req_id].reject(msg);
    delete buyAckWaitersRef.current[req_id];
  }

  // Turbo: do NOT alert (but we did reject waiters so queue doesn't hang)
  if (req_id && reqInfoRef.current[req_id]?.turbo) return;

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

  // ✅ do NOT process ticks unless MetroX is active (closure-safe)
if (
  activeStrategyRef.current !== "matches" &&
  activeStrategyRef.current !== "overunder"
) return;

  const ps = typeof data.tick.pip_size === "number" ? data.tick.pip_size : pipSize;
  if (typeof data.tick.pip_size === "number") setPipSize(ps);

  const digit = getLastDigit(Number(data.tick.quote), ps);

  const prev = pairDigitsRef.current[symbol] ?? [];
const next = [...prev, digit]; // ❌ no cap anymore
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

  if (symbol === selectedPairRef.current) setTicks(next);
}

      // proposal -> buy
      if (data.msg_type === "proposal") {
  const req_id: number | undefined = data.req_id;
  const proposalId: string | undefined = data.proposal?.id;
  if (!req_id || !proposalId) return;

  const info = reqInfoRef.current[req_id];
  const stakeForReq = info?.stake ?? stake;

  // ⚡ Turbo trades → BUY QUEUE
  if (info?.turbo) {
    enqueueBuy(req_id, proposalId, stakeForReq);
  } else {
    // ✅ Non-turbo trades (3x, manual, MetroX) → immediate BUY (old behavior)
    safeSend({ buy: proposalId, price: stakeForReq, req_id });
  }

  return;
}

      // buy ack
      if (data.msg_type === "buy") {
        const req_id: number | undefined = data.req_id;
        const contract_id: number | undefined = data.buy?.contract_id;
        if (!req_id || !contract_id) return;

        contractToReqRef.current[contract_id] = req_id;

        const apply = (arr: Trade[]) => arr.map((t) => (t.id === req_id ? { ...t, contract_id } : t));
        setTradeHistory((prev) => apply(prev));

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

        setTradeHistory((prev) => update(prev));

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
  // stop fast auto if running
  fastAutoCancelRef.current = true;
  setFastAutoRunning(false);

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
  source: activeStrategy === "overunder" ? "SpiderX Auto" : "MetroX",
};

    setTradeHistory((prev) => [trade, ...prev]);

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
  // ⚡ Instant parallel DIFFERS (no waiting)
const placeDiffersInstant = async (symbol: Pair, digit: number, count: number) => {
  if (!wsRef.current || wsRef.current.readyState !== WebSocket.OPEN) return;
  if (!authorizedRef.current) return;

  for (let i = 0; i < count; i++) {
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

    setTradeHistory((prev: Trade[]) => [trade, ...prev]);

    reqInfoRef.current[req_id] = {
  symbol,
  digit,
  type: "Differs",
  stake,
  turbo: true,
};

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

    // ⚡ CRITICAL: yield event loop so Deriv processes each proposal separately
    await new Promise((r) => setTimeout(r, 0));
  }
};
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

    setTradeHistory((prev: Trade[]) => [trade, ...prev]);
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

  // 🔁 Old behavior: Turbo only removes delay — does NOT change logic
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
  if (!wsRef.current || wsRef.current.readyState !== WebSocket.OPEN)
    return alert("WebSocket not connected yet");
  if (!authorizedRef.current) return alert("Not authorized yet");

  auto5xCancelRef.current = false;
  setAuto5xRunning(true);

  const gapMs = turboMode ? 0 : 50;
  const deadline = Date.now() + 5000;

  try {
    setAnalysisStatus("Analyzing all pairs...");

    // Build signals for each pair
    const pairSignals = PAIRS.map((pair) => {
      const digits = pairDigitsRef.current[pair] ?? [];

      if (digits.length < 20) {
        return { pair, lowestPct: Infinity, lowestDigit: null as number | null };
      }

      const last20 = digits.slice(-20);
      const freq = Array.from({ length: 10 }, () => 0);
      for (const d of last20) freq[d]++;

      const percentages = freq.map((f) => (f / 20) * 100);

      let lowestDigit = 0;
      let lowestPct = percentages[0];
      for (let i = 1; i < 10; i++) {
        if (percentages[i] < lowestPct) {
          lowestPct = percentages[i];
          lowestDigit = i;
        }
      }

      return { pair, lowestPct, lowestDigit };
    });

    // Strongest → weakest
    pairSignals.sort((a, b) => a.lowestPct - b.lowestPct);

    const usedPairs = new Set<Pair>();
    let placed = 0;

    const THRESHOLD = 3.0;

    // Place up to 5 trades, max 1 per pair, only if <= 3.0%
    for (const s of pairSignals) {
      if (auto5xCancelRef.current) break;
      if (Date.now() > deadline) break;
      if (placed >= 5) break;

      if (usedPairs.has(s.pair)) continue;
      if (s.lowestDigit === null) continue;
      if (s.lowestPct > THRESHOLD) continue;

      setAnalysisStatus(
        `5x Auto: ${s.pair} • Digit ${s.lowestDigit} • ${s.lowestPct.toFixed(1)}% (${placed + 1}/5)`
      );

      try {
  if (turboMode) {
    // ⚡ MAX TURBO — no waiting
    placeDiffersInstant(s.pair, s.lowestDigit, 1);
  } else {
    await placeDiffersAndWaitBuyAck(s.pair, s.lowestDigit);
    if (gapMs) await sleep(gapMs);
  }

  usedPairs.add(s.pair);
  placed++;
} catch {
  setAnalysisStatus(`Skipped ${s.pair} (trade failed). Continuing...`);
}
}

    if (auto5xCancelRef.current) {
      setAnalysisStatus(`Stopped by user. Trades placed: ${placed}/5`);
    } else if (placed === 0) {
      setAnalysisStatus(`No trades placed (no pairs ≤ ${THRESHOLD.toFixed(1)}%).`);
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
/* ================= 1x Auto All Pairs ================= */

const run1xAutoAllPairs = async () => {
  if (auto1xRunning) return;

  if (!stake || stake <= 0) return alert("Enter a stake amount");
  if (!wsRef.current || wsRef.current.readyState !== WebSocket.OPEN)
    return alert("WebSocket not connected");
  if (!authorizedRef.current) return alert("Not authorized");

  setAuto1xRunning(true);
  setAnalysisStatus("Scanning all pairs for <3% opportunities...");

  try {
    const pairSignals = PAIRS.map((pair) => {
      const digits = pairDigitsRef.current[pair] ?? [];

      if (digits.length < 20)
        return { pair, lowestPct: Infinity, lowestDigit: null as number | null };

      const last20 = digits.slice(-20);
      const freq = Array.from({ length: 10 }, () => 0);
      last20.forEach((d) => freq[d]++);
      const percentages = freq.map((n) => (n / 20) * 100);

      let lowestDigit = 0;
      let lowestPct = percentages[0];
      for (let i = 1; i < 10; i++) {
        if (percentages[i] < lowestPct) {
          lowestPct = percentages[i];
          lowestDigit = i;
        }
      }

      return { pair, lowestPct, lowestDigit };
    });

    pairSignals.sort((a, b) => a.lowestPct - b.lowestPct);

    const lastPair = lastAuto1xPairRef.current;

    // pick best that is NOT the same as last time
    const best =
      pairSignals.find((s) => s.pair !== lastPair) ?? pairSignals[0];

    if (best.lowestPct < 3.0 && best.lowestDigit !== null) {
      if (best.pair === lastPair) {
        setAnalysisStatus(
          "No valid pairs < 3.0% (best signal repeats last pair) — no trade placed."
        );
        return;
      }

      setAnalysisStatus(
        `1x Auto: ${best.pair} • Digit ${best.lowestDigit} • ${best.lowestPct.toFixed(1)}%`
      );

      try {
  if (turboMode) {
    // ⚡ MAX TURBO
    placeDiffersInstant(best.pair, best.lowestDigit, 1);
  } else {
    await placeDiffersAndWaitBuyAck(best.pair, best.lowestDigit);
  }

  lastAuto1xPairRef.current = best.pair; // ✅ remember
  setAnalysisStatus("1x Auto trade placed.");
} catch {
  setAnalysisStatus("Trade failed.");
}
    } else {
      setAnalysisStatus("No valid pairs < 3.0% — no trade placed.");
    }
  } finally {
    setAuto1xRunning(false);
  }
};
/* ================= Fast AutoTrading (NEW) ================= */

const FAST_INTERVAL_MS_NORMAL = 400; // 0.4s as requested
const FAST_INTERVAL_MS_TURBO = 250;  // recommended faster in Turbo
const FAST_MAX_BUY_QUEUE = 12;       // safety limit

const toggleFastAutoTrading = async () => {
  // STOP
  if (fastAutoRunning) {
    fastAutoCancelRef.current = true;
    setAnalysisStatus("Stopping Fast AutoTrading...");
    return;
  }

  // START validations
  if (selectedDigit === null) return alert("Select a digit first");
  if (!stake || stake <= 0) return alert("Enter a stake amount");
  if (!wsRef.current || wsRef.current.readyState !== WebSocket.OPEN)
    return alert("WebSocket not connected");
  if (!authorizedRef.current) return alert("Not authorized");

  fastAutoCancelRef.current = false;
  setFastAutoRunning(true);
  setAnalysisStatus("Fast AutoTrading started...");

  if (fastAutoLoopRunningRef.current) return;
  fastAutoLoopRunningRef.current = true;

  try {
    while (!fastAutoCancelRef.current) {
      const ws = wsRef.current;
      if (!ws || ws.readyState !== WebSocket.OPEN || !authorizedRef.current) break;

      const d = selectedDigitRef.current;
      if (d === null) {
        setAnalysisStatus("Fast AutoTrading paused: select a digit.");
        await sleep(250);
        continue;
      }

      const sym = selectedPairRef.current;

      // backpressure protection
      if (buyQueueRef.current.length > FAST_MAX_BUY_QUEUE) {
        setAnalysisStatus(`Fast AutoTrading waiting... (queue ${buyQueueRef.current.length})`);
        await sleep(150);
        continue;
      }

      // 🔥 ALWAYS DIFFERS
      placeDiffersInstant(sym, d, 1);

      const interval = turboMode ? FAST_INTERVAL_MS_TURBO : FAST_INTERVAL_MS_NORMAL;
      await sleep(interval);
    }
  } finally {
    fastAutoLoopRunningRef.current = false;
    fastAutoCancelRef.current = false;
    setFastAutoRunning(false);
    setAnalysisStatus("Fast AutoTrading stopped.");
  }
};
/* ================= SpiderX Random Over/Under Auto ================= */

const toggleSpiderRandomAuto = async () => {
  // STOP
  if (spiderRandomRunning) {
    spiderRandomCancelRef.current = true;
    setAnalysisStatus("Stopping SpiderX Random Auto...");
    return;
  }

  // START validations
  if (!stake || stake <= 0) return alert("Enter a stake amount");
  if (!wsRef.current || wsRef.current.readyState !== WebSocket.OPEN) return alert("WebSocket not connected");
  if (!authorizedRef.current) return alert("Not authorized");

  spiderRandomCancelRef.current = false;
  setSpiderRandomRunning(true);
  setAnalysisStatus("SpiderX Random Auto started...");

  if (spiderRandomLoopRef.current) return;
  spiderRandomLoopRef.current = true;

  try {
    while (!spiderRandomCancelRef.current) {
      // pick a truly random pair
      const pair = PAIRS[Math.floor(Math.random() * PAIRS.length)];

      const digits = pairDigitsRef.current[pair] ?? [];
      if (digits.length < 20) {
        await sleep(100);
        continue;
      }

      const last20 = digits.slice(-20);
      const freq = Array.from({ length: 10 }, () => 0);
      last20.forEach((d) => freq[d]++);

      const pct = freq.map((n) => (n / 20) * 100);

      // Build ALL valid signals
      const signals: Array<{ type: TradeType; digit: number }> = [];

      // Over 0 when 0 ≤ 5%
      if (pct[0] <= 5) signals.push({ type: "Over", digit: 0 });

      // Over 1 when 0 & 1 ≤ 5%
      if (pct[0] <= 5 && pct[1] <= 5) signals.push({ type: "Over", digit: 1 });

      // Under 9 when 9 ≤ 5%
      if (pct[9] <= 5) signals.push({ type: "Under", digit: 9 });

      // Under 8 when 8 & 9 ≤ 5%
      if (pct[8] <= 5 && pct[9] <= 5) signals.push({ type: "Under", digit: 8 });

      // If no valid signal, skip this cycle
      if (signals.length === 0) {
        await sleep(150);
        continue;
      }

      // 🎯 TRUE RANDOM: pick one signal randomly
      const pick = signals[Math.floor(Math.random() * signals.length)];

      // set pair + digit
      setSelectedPair(pair);
      setSelectedDigit(pick.digit);

      // place trade (1 tick)
      setTimeout(() => {
        placeTrade(pick.type, 1);
      }, 30);

      const interval = turboMode ? 250 : 400;
      await sleep(interval);
    }
  } finally {
    spiderRandomLoopRef.current = false;
    spiderRandomCancelRef.current = false;
    setSpiderRandomRunning(false);
    setAnalysisStatus("SpiderX Random Auto stopped.");
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
    // 🛑 stop Fast AutoTrading when leaving MetroX
  fastAutoCancelRef.current = true;
  setFastAutoRunning(false);
    // 🔄 full reset when MetroX is OFF
    pairDigitsRef.current = Object.fromEntries(
      PAIRS.map((p) => [p, []])
    ) as unknown as Record<Pair, number[]>;

    setTicks([]);
    setSelectedDigit(null);
    setAnalysisOpen(false);
    setAnalysisStatus("");
    setLastWinDigit(null);
    setLastLossDigit(null);

    setPairMeta(
      Object.fromEntries(PAIRS.map((p) => [p, { count: 0 }])) as unknown as Record<
        Pair,
        { count: number; lowDigit?: number; lowPct?: number }
      >
    );
  }
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

      {/* MetroAI watermark background */}
<div
  className="pointer-events-none absolute inset-0 flex items-center justify-center opacity-[0.15]"
  style={{
    backgroundImage: "url('/metroai-logo.png')",
    backgroundRepeat: "no-repeat",
    backgroundPosition: "center",
    backgroundSize: "60%",
  }}
/>

      <div className="relative">
        {/* NAVBAR */}
        <header className="h-16 bg-[#0f1b2d]/70 backdrop-blur-md flex items-center justify-between px-6 border-b border-white/10">
          <div className="flex items-center gap-3">
            <img
  src="/metroai-logo.png"
  alt="MetroAI Logo"
  className="w-10 h-9 rounded-md object-contain bg-white/5 p-1 border border-white/10"
/>
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
          <div className="glass-panel p-6 flex justify-between items-center
  bg-gradient-to-r from-orange-500/30 via-orange-600/20 to-purple-700/20">
            <div>
              <h1 className="text-2xl font-extrabold tracking-tight">Trading Analyzer</h1>
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
              <h2 className="font-semibold mb-4 text-white/85 tracking-tight">Deriv API Connection</h2>

              <div className="grid grid-cols-2 lg:grid-cols-3 gap-4 text-sm">
                <div className="bg-black/30 rounded-xl p-4 border border-white/10">
                  <p className="text-white/55 text-xs uppercase tracking-wide">Account Status</p>
                  <p className="font-semibold text-green-400">{connected ? "Connected" : "Disconnected"}</p>
                </div>

                <div className="bg-black/30 rounded-xl p-4 border border-white/10">
                  <p className="text-white/55 text-xs uppercase tracking-wide">Account Balance</p>
                  <p className="font-semibold text-lg">
                    {balance !== null ? `${balance.toFixed(2)} ${currency}` : "Loading..."}
                  </p>
                </div>

                <div className="bg-black/30 rounded-xl p-4 border border-white/10">
                  <p className="text-white/55 text-xs uppercase tracking-wide">Session Profit/Loss</p>
                  <p className={`font-semibold text-lg ${sessionNetProfit >= 0 ? "text-emerald-400" : "text-red-400"}`}>
  {sessionNetProfit >= 0 ? "+" : ""}
  {sessionNetProfit.toFixed(2)} {currency}
</p>
                </div>
              </div>
            </div>

            <div className="bg-[#13233d]/80 backdrop-blur rounded-2xl p-6 border border-white/10 shadow-[0_0_0_1px_rgba(255,255,255,0.06)]">
              <h2 className="font-semibold mb-4 text-white/85 tracking-tight">Trading Strategies</h2>

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
    title="SpiderX"
    description="Over/Under Strategy"
    active={activeStrategy === "overunder"}
    onToggle={() => setActiveStrategy(activeStrategy === "overunder" ? null : "overunder")}
  />
) : (
  !isAdmin && (
    <div className="mb-1 rounded-lg bg-black/20 border border-white/10 p-3 text-xs text-white/60">
      SpiderX is currently disabled by admin.
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
  resetPairNow(p);
  setSelectedPair(p);
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
                tradeHistory={tradeHistory}
onClearHistory={() => setTradeHistory([])}
                currency={currency}
                run1xAutoAllPairs={run1xAutoAllPairs}
                auto1xRunning={auto1xRunning}
                onToggleFastAuto={toggleFastAutoTrading}
                fastAutoRunning={fastAutoRunning} 
              />
            )}

            {activeStrategy === "overunder" && isStrategyEnabledForViewer("overunder") && (
  <div className="bg-[#13233d] p-6 flex flex-col min-h-[520px]">
   <SpiderXAnalyzer
  pairs={PAIRS}
  indexGroups={INDEX_GROUPS}
  pairDigitsRef={pairDigitsRef}
  selectedPair={selectedPair}
  setStake={setStake}
  stake={stake}
  setSelectedPair={(p: Pair) => {
    resetPairNow(p);
    setSelectedPair(p);
  }}
  onPlaceTrade={(type: TradeType, duration: number) => placeTrade(type, duration)}
  tradeHistory={tradeHistory}
  currency={currency}
  onClearHistory={() => setTradeHistory([])}
  toggleSpiderRandomAuto={toggleSpiderRandomAuto}
  spiderRandomRunning={spiderRandomRunning}
  setSelectedDigit={setSelectedDigit}

  // ✅ ADD THESE:
  selectedDigit={selectedDigit}
  lastWinDigit={lastWinDigit}
  lastLossDigit={lastLossDigit}
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
        <p className="font-semibold text-white/90 tracking-tight">{title}</p>
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
  run1xAutoAllPairs,
  auto1xRunning,
  onToggleFastAuto,
  fastAutoRunning,
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

  // ✅ NEW PROPS (Fast Auto + 1x Auto)
  run1xAutoAllPairs: () => void;
  auto1xRunning: boolean;
  onToggleFastAuto: () => void;
  fastAutoRunning: boolean;
    // ✅ NEW SpiderX Random Auto
 
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

  <optgroup label="Jump Indices">
    {INDEX_GROUPS.jump.map((s) => (
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
          Based on {ticks.length} ticks from <span className="font-semibold">{selectedPair}</span>• Last Digit:{" "}
         <span className="text-green-400 font-extrabold text-4xl leading-none drop-shadow-[0_0_12px_rgba(34,197,94,0.9)]">
  {lastDigit !== null ? lastDigit : "-"}
</span>
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
      <div className="mt-5 space-y-6">
        <button
          onClick={() => {
            if (selectedDigit === null) return alert("Select a digit first");
            onPlaceMetroX();
          }}
          className="w-full rounded-md py-4 bg-emerald-600 hover:bg-emerald-700 text-sm font-semibold shadow-[0_0_0_1px_rgba(255,255,255,0.10)] active:scale-[0.98] active:brightness-110 transition"
        >
          ⚡ Place MetroX Trade
        </button>

        <button
          onClick={on3xSelectedDigit}
          disabled={instant3xRunning}
          className={`w-full rounded-md py-3 text-sm font-semibold shadow-[0_0_0_1px_rgba(255,255,255,0.10)] transition active:scale-[0.98] ${
  instant3xRunning
    ? "bg-slate-600 cursor-not-allowed animate-pulse"
    : "bg-red-600 hover:bg-red-700 active:brightness-110"
}`}
        >
          {instant3xRunning ? "Placing 3 trades..." : "3x Selected Digit"}
        </button>

        <button
          onClick={onToggle5x}
          className={`w-full rounded-md py-3 text-sm font-semibold shadow-[0_0_0_1px_rgba(255,255,255,0.10)] transition active:scale-[0.98] ${
  auto5xRunning
    ? "bg-orange-600 hover:bg-orange-700 animate-pulse"
    : "bg-purple-600 hover:bg-purple-700 active:brightness-110"
}`}
        >
          {auto5xRunning ? "Stop 5x AutoTrading" : "5x AutoTrading"}
        </button>
        <button
  onClick={run1xAutoAllPairs}
  disabled={auto1xRunning}
  className={`w-full rounded-md py-3 text-sm font-semibold shadow-[0_0_0_1px_rgba(255,255,255,0.10)] transition active:scale-[0.98] ${
    auto1xRunning
      ? "bg-slate-600 cursor-not-allowed animate-pulse"
      : "bg-indigo-600 hover:bg-indigo-700 active:brightness-110"
  }`}
>
  {auto1xRunning ? "Scanning..." : "1x Auto All Pairs"}
</button>

<button
  onClick={onToggleFastAuto}
  className={`w-full rounded-md py-3 text-sm font-semibold shadow-[0_0_0_1px_rgba(255,255,255,0.10)] transition active:scale-[0.98] ${
    fastAutoRunning
      ? "bg-emerald-600 hover:bg-emerald-700 animate-pulse active:brightness-110"
      : "bg-cyan-600 hover:bg-cyan-700 active:brightness-110"
  }`}
>
  {fastAutoRunning ? "Stop Fast AutoTrading" : "Fast AutoTrading"}
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
                  <span className="px-2 py-0.5 rounded-full border border-white/10 bg-black/10 text-white/70">
  {t.source ?? (t.type === "Over" || t.type === "Under" ? "SpiderX" : "MetroX")}
</span>
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
  setSelectedDigit: (d: number | null) => void;
  stake: number;
  setStake: (s: number) => void;
  selectedPair: Pair;
  setSelectedPair: (p: Pair) => void;
  tradeHistory: Trade[];
  placeTrade: (t: TradeType, duration: number) => void;
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
            <button onClick={() => placeTrade("Over", 1)} className="bg-green-500 px-3 py-1 rounded">
  Over
</button>

<button onClick={() => placeTrade("Under", 1)} className="bg-red-500 px-3 py-1 rounded">
  Under
</button>
          </>
        )}
      </div>
    </div>
  );
}
// ================= SpiderX Best Pairs Analyzer =================

type AnalyzerMode = "OVER_0" | "OVER_1" | "OVER_2" | "UNDER_8" | "UNDER_9";

function SpiderXAnalyzer({
  pairs,
  indexGroups,
  pairDigitsRef,
  selectedPair,
  setSelectedPair,
  onPlaceTrade,
  tradeHistory,
  currency,
  onClearHistory,
  setStake,
  stake, // ✅ ADD THIS
  toggleSpiderRandomAuto,
  spiderRandomRunning,
  setSelectedDigit,
  selectedDigit,
  lastWinDigit,
  lastLossDigit,
}: {
  pairs: readonly Pair[];
  indexGroups: typeof INDEX_GROUPS;
  pairDigitsRef: React.MutableRefObject<Record<Pair, number[]>>;
  selectedPair: Pair;
  setSelectedPair: (p: Pair) => void;
  onPlaceTrade: (type: TradeType, duration: number) => void;
  tradeHistory: Trade[];
  currency: string;
  onClearHistory: () => void;
  setStake: (n: number) => void;
  stake: number; // ✅ ADD THIS TYPE
  toggleSpiderRandomAuto: () => void;
  spiderRandomRunning: boolean;
  setSelectedDigit: (d: number | null) => void;
  selectedDigit: number | null;
  lastWinDigit: number | null;
  lastLossDigit: number | null;
}) {
    // ===== Live Digit Stream (SpiderX) =====
  const ticks = pairDigitsRef.current[selectedPair] ?? [];

  const lastDigit = ticks.length ? ticks[ticks.length - 1] : null;
  // ✅ Use last20 like MetroX for a clean signal
const last20 = ticks.slice(-20);

const mostFrequentDigit = useMemo(() => {
  if (last20.length < 1) return null;
  const freq = Array.from({ length: 10 }, () => 0);
  for (const d of last20) freq[d]++;
  const max = Math.max(...freq);
  return freq.indexOf(max); // first most frequent
}, [last20]);

  const digitPercent = (d: number) => {
    if (!ticks.length) return 0;
    return (ticks.filter((x) => x === d).length / ticks.length) * 100;
  };
  const [mode, setMode] = useState<AnalyzerMode>("OVER_1");
  // ===== Digit Popup (NEW) =====
const [digitPopupOpen, setDigitPopupOpen] = useState(false);
const [popupDigit, setPopupDigit] = useState<number | null>(null);

  // ✅ manual barrier digit (independent)
  const [barrierDigit, setBarrierDigit] = useState<number>(1);
  const [manualActive, setManualActive] = useState<"Over" | "Under" | null>(null);
  const lastManualRef = useRef<number>(0);

  const [running, setRunning] = useState(false);
  const [secondsLeft, setSecondsLeft] = useState(0);
  const [results, setResults] = useState<Array<{ pair: Pair; pct: number; hits: number }>>([]);
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

  const computePct = (last20: number[], m: AnalyzerMode) => {
    if (last20.length < 20) return { pct: 0, hits: 0 };
    let hits = 0;
    for (const d of last20) {
      if (m === "OVER_0" && d > 0) hits++;
      if (m === "OVER_1" && d > 1) hits++;
      if (m === "OVER_2" && d > 2) hits++;
      if (m === "UNDER_8" && d < 8) hits++;
      if (m === "UNDER_9" && d < 9) hits++;
    }
    return { hits, pct: (hits / 20) * 100 };
  };

  const getTradeDigitFromMode = (m: AnalyzerMode) => {
    if (m === "OVER_0") return 0;
    if (m === "OVER_1") return 1;
    if (m === "OVER_2") return 2;
    if (m === "UNDER_8") return 8;
    return 9; // UNDER_9
  };

  const startAnalysis = () => {
    // STOP
    if (running) {
      setRunning(false);
      setAutoRunning(false);
      setAnalyzingPairs([]);
      tradedPairsRef.current.clear();
      return;
    }

    // START
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

      const scored = pairs.map((pair) => {
        const last20 = (pairDigitsRef.current[pair] ?? []).slice(-20);
        const { pct, hits } = computePct(last20, mode);
        return { pair, pct, hits };
      });

      const liveTop2 = scored
        .filter((x) => (pairDigitsRef.current[x.pair] ?? []).length >= 20)
        .sort((a, b) => b.pct - a.pct)
        .slice(0, 2);

      setResults(liveTop2);
      setAnalyzingPairs(scored.map((s) => s.pair));

      // AUTO TRADE (only if autoRunning)
      for (const s of scored) {
        if (!autoRunning) break;
        if ((pairDigitsRef.current[s.pair] ?? []).length < 20) continue;
        if (s.pct < TRADE_THRESHOLD) continue;
        if (tradedPairsRef.current.has(s.pair)) continue;

        const tradeType: TradeType = mode.startsWith("OVER") ? "Over" : "Under";
        const tradeDigit = getTradeDigitFromMode(mode);

        // ✅ IMPORTANT: set pair + digit before placing trade
        setSelectedPair(s.pair);
        // @ts-ignore (Dashboard owns selectedDigit; this is still safe if you pass setSelectedDigit in future)
        // If you DO have setSelectedDigit available, use it here instead of this comment.

        setTimeout(() => {
          // NOTE: Dashboard placeTrade uses selectedDigit.
          // If you want Auto to truly use tradeDigit, pass setSelectedDigit into SpiderXAnalyzer.
          onPlaceTrade(tradeType, 1);
        }, 50);

        tradedPairsRef.current.add(s.pair);
      }

      if (left === 0) {
        window.clearInterval(timer);
        setRunning(false);
        setAutoRunning(false);

        const finalResults = scored
          .filter((x) => (pairDigitsRef.current[x.pair] ?? []).length >= 20)
          .sort((a, b) => b.pct - a.pct)
          .slice(0, 2);

        setResults(finalResults);
      }
    }, 500);
  };

  return (
    <div className="space-y-6">

        {/* ================= Analyzer ================= */}
      <div className="rounded-2xl border border-white/10 bg-gradient-to-br from-[#1b2235]/95 to-[#121826]/95 p-5">
        {/* Header */}
        <div className="flex items-center justify-between mb-3">
          <p className="font-semibold text-white/90">🎯 SpiderX Best Pairs Analyzer</p>
          <button
            onClick={startAnalysis}
            className={`px-4 py-2 rounded-md text-sm font-semibold border ${
              running ? "bg-red-600 hover:bg-red-700 border-white/10" : "bg-sky-600 hover:bg-sky-700 border-white/10"
            }`}
          >
            {running ? "Stop Analysis" : "Start Analysis"}
          </button>
        </div>

        {/* Mode tabs */}
        <div className="flex flex-wrap gap-2 mb-4">
          {modes.map((m) => (
            <button
              key={m.key}
              onClick={() => setMode(m.key)}
              className={`px-3 py-1 rounded-md text-xs border ${
                mode === m.key ? "bg-sky-600/25 border-sky-500/30 text-white" : "bg-white/5 border-white/10 text-white/70"
              }`}
            >
              {m.label}
            </button>
          ))}
        </div>

        {/* Countdown */}
        <div className="rounded-xl border border-white/10 bg-black/20 p-3 mb-4">
          <div className="flex justify-between text-xs text-white/70 mb-1">
            <span>TIME</span>
            <span>{running ? `${secondsLeft}s` : "—"}</span>
          </div>

          <div className="h-2 rounded-full bg-white/10 overflow-hidden">
            <div
              className="h-full bg-sky-500/80 transition-all"
              style={{ width: running ? `${((30 - secondsLeft) / 30) * 100}%` : "0%" }}
            />
          </div>

          {running && analyzingPairs.length > 0 && (
            <div className="mt-3 flex flex-wrap gap-2">
              {analyzingPairs.map((p) => (
                <span key={p} className="px-2 py-1 rounded-md text-xs bg-white/5 border border-white/10 text-white/70">
                  {p}
                </span>
              ))}
            </div>
          )}
        </div>

        {/* Results */}
        {results.length > 0 && (
          <div className="space-y-3">
            {results.map((r, i) => {
              const last20 = (pairDigitsRef.current[r.pair] ?? []).slice(-20);

              const label =
                indexGroups.volatility.find((x) => x.code === r.pair)?.label ||
                indexGroups.jump.find((x) => x.code === r.pair)?.label ||
                r.pair;

              return (
                <div
                  key={r.pair}
                  className={`rounded-xl border border-white/10 bg-black/20 p-3 ${r.pair === selectedPair ? "ring-2 ring-sky-500/40" : ""}`}
                >
                  <div className="flex items-center justify-between">
                    <div>
                      <p className="text-sm font-semibold text-white/90">
                        #{i + 1} {label}
                      </p>
                      <button onClick={() => setSelectedPair(r.pair)} className="text-xs text-emerald-300">
                        ← Click to select
                      </button>
                    </div>

                    <div className="text-right">
                      <p className="text-lg font-extrabold text-emerald-300">{r.pct.toFixed(1)}%</p>
                      <p className="text-[11px] text-white/55">{r.hits}/20 digits</p>
                    </div>
                  </div>

                  <div className="mt-3 flex flex-wrap gap-1">
                    {last20.map((d, idx) => (
                      <span
                        key={idx}
                        className="w-6 h-6 rounded-md bg-emerald-500/15 border border-emerald-400/20 text-emerald-100 text-xs flex items-center justify-center"
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

        {/* Auto Trading button (optional) */}
        {results.length > 0 && (
          <div className="mt-4 space-y-3">
            <button
              onClick={() => {
                if (autoRunning) {
                  setAutoRunning(false);
                  tradedPairsRef.current.clear();
                  return;
                }
                const bad = results.find((r) => r.pct < 95);
                if (bad) {
                  alert(`Auto canceled: ${bad.pair} is only ${bad.pct.toFixed(1)}%`);
                  return;
                }
                setAutoRunning(true);
                tradedPairsRef.current.clear();
              }}
              className={`w-full py-3 rounded-md font-semibold text-sm border transition ${
                autoRunning ? "bg-red-600 hover:bg-red-700 animate-pulse" : "bg-emerald-600 hover:bg-emerald-700 border-emerald-500/40"
              }`}
            >
              {autoRunning ? "Stop Auto Trading" : "⚡ Start Auto Trading"}
            </button>

            <p className="text-xs text-white/60 text-center">
              Auto-trades {mode.replace("_", " ")} (1 tick) when percentage ≥ 95%
            </p>
          </div>
        )}

              </div>
      {/* ================= Digit Trade Popup (SpiderX) ================= */}
{digitPopupOpen && popupDigit !== null && (
  <div className="fixed inset-0 z-50 flex items-center justify-center">
    {/* Backdrop */}
    <button
      className="absolute inset-0 bg-black/60"
      onClick={() => setDigitPopupOpen(false)}
    />

    {/* Modal */}
    <div className="relative w-[340px] max-w-[92vw] rounded-2xl border border-white/10 bg-[#0f1b2d] p-5 shadow-2xl">
      <div className="grid grid-cols-2 gap-4">
        {/* Top buttons: 1 trade */}
        <button
          onClick={() => {
  setSelectedDigit(popupDigit);   // ✅ ensure Dashboard has the digit
  onPlaceTrade("Over", 1);
  setDigitPopupOpen(false);
}}
          className="rounded-2xl bg-emerald-600 hover:bg-emerald-700 py-10 font-extrabold text-white text-xl"
        >
          OVER {popupDigit}
        </button>

        <button
          onClick={() => {
  setSelectedDigit(popupDigit);
  onPlaceTrade("Under", 1);
  setDigitPopupOpen(false);
}}
          className="rounded-2xl bg-blue-600 hover:bg-blue-700 py-10 font-extrabold text-white text-xl"
        >
          UNDER {popupDigit}
        </button>
      </div>

      <div className="mt-4 text-center text-sm font-semibold text-white/60">
        ADMIN: Instant Over/Under (3 Trades)
      </div>

      <div className="mt-4 grid grid-cols-2 gap-4">
        {/* Bottom buttons: 3x trades */}
        <button
          onClick={() => {
  setSelectedDigit(popupDigit);

  onPlaceTrade("Over", 1);
  setTimeout(() => onPlaceTrade("Over", 1), 400);
  setTimeout(() => onPlaceTrade("Over", 1), 800);

  setDigitPopupOpen(false);
}}
          className="rounded-2xl bg-orange-500 hover:bg-orange-600 py-8 font-bold text-white"
        >
          ⚡ Instant Over {popupDigit}
          <div className="text-white/90 text-sm mt-2">(3x trades)</div>
        </button>

        <button
          onClick={() => {
  setSelectedDigit(popupDigit);

  onPlaceTrade("Under", 1);
  setTimeout(() => onPlaceTrade("Under", 1), 400);
  setTimeout(() => onPlaceTrade("Under", 1), 800);

  setDigitPopupOpen(false);
}}
          className="rounded-2xl bg-purple-600 hover:bg-purple-700 py-8 font-bold text-white"
        >
          ⚡ Instant Under {popupDigit}
          <div className="text-white/90 text-sm mt-2">(3x trades)</div>
        </button>
      </div>

      <button
        onClick={() => setDigitPopupOpen(false)}
        className="mt-5 w-full rounded-xl bg-white/10 hover:bg-white/15 border border-white/10 py-3 font-semibold text-white/80"
      >
        Cancel
      </button>
    </div>
  </div>
)}
      {/* ================= Live Digit Stream (SpiderX) ================= */}
<div className="rounded-2xl border border-white/10 bg-gradient-to-br from-[#1b2235]/95 to-[#121826]/95 p-4">
  <p className="text-sm text-white/80 mb-3">Live Digit Stream</p>

  <div className="grid grid-cols-5 gap-3 mb-3">
  {Array.from({ length: 10 }, (_, d) => {
  const pct = digitPercent(d);

  const selected = selectedDigit === d;     // ✅ manual selected
  const won = lastWinDigit === d;           // ✅ win flash
  const lost = lastLossDigit === d;         // ✅ loss flash
  const live = lastDigit === d;             // ✅ market last digit
  const most = mostFrequentDigit === d;     // ✅ most frequent in red

  // same style set as MetroX
  const base = "bg-[#0e1422] border-white/10 text-white/90 hover:bg-white/5";
  const selectedCls = "bg-blue-600/90 border-blue-400 text-white";
  const wonCls = "bg-emerald-600/35 border-emerald-400 text-white";
  const lostCls = "bg-red-600/35 border-red-400 text-white";
  const liveCls = "bg-emerald-600/20 border-emerald-500/30 text-white";
  const mostCls = "bg-red-600/20 border-red-500/35 text-white";

  // ✅ Priority (same idea as MetroX)
  const cls = selected
    ? selectedCls
    : won
    ? wonCls
    : lost
    ? lostCls
    : live
    ? liveCls
    : most
    ? mostCls
    : base;

  return (
    <button
      key={d}
      onClick={() => {
        setSelectedDigit(d);
        setPopupDigit(d);
        setDigitPopupOpen(true);
      }}
      className={`relative rounded-full py-3 text-center border transition ${cls}`}
    >
      {/* ✅ Icons like MetroX */}
      {selected && <span className="absolute top-2 right-3 text-white text-sm">✓</span>}
      {!selected && won && <span className="absolute top-2 right-3 text-emerald-100 text-sm">💰</span>}
      {!selected && !won && lost && <span className="absolute top-2 right-3 text-red-100 text-sm">❌</span>}
      {!selected && !won && !lost && live && <span className="absolute top-2 right-3 text-emerald-200 text-sm">●</span>}
      {!selected && !won && !lost && !live && most && <span className="absolute top-2 right-3 text-red-200 text-sm">▲</span>}

      <div className="text-lg font-bold leading-none">{d}</div>
      <div className="mt-1 text-[11px] text-white/60">{pct.toFixed(1)}%</div>
    </button>
  );
})}
</div>

  <p className="text-xs text-white/60 text-center">
    Based on {ticks.length} ticks from{" "}
    <span className="font-semibold">{selectedPair}</span> • Last Digit:{" "}
    <span className="text-emerald-400 font-extrabold text-xl">
      {lastDigit !== null ? lastDigit : "-"}
    </span>
  </p>
</div>
      {/* ================= SpiderX Settings ================= */}
      <div className="rounded-xl border border-white/10 bg-white/5 p-4">
        <p className="text-sm font-semibold text-white/90 mb-3">🕷 SpiderX Settings</p>

        {/* TOP ROW */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-3 mb-4">
          {/* Select Index */}
          <div>
            <p className="text-[11px] text-white/60 mb-1">Select Index</p>
            <select
              className="w-full bg-[#0e1422] border border-white/10 p-2 rounded-md text-sm"
              value={selectedPair}
              onChange={(e) => setSelectedPair(e.target.value as Pair)}
            >
              <optgroup label="Volatility Indices">
                {indexGroups.volatility.map((s) => (
                  <option key={s.code} value={s.code}>
                    {s.label}
                  </option>
                ))}
              </optgroup>
              <optgroup label="Jump Indices">
                {indexGroups.jump.map((s) => (
                  <option key={s.code} value={s.code}>
                    {s.label}
                  </option>
                ))}
              </optgroup>
            </select>
          </div>

          {/* Barrier */}
          <div>
            <p className="text-[11px] text-white/60 mb-1">Barrier Number</p>
            <select
              className="w-full bg-[#0e1422] border border-white/10 p-2 rounded-md text-sm"
              value={barrierDigit}
              onChange={(e) => {
  const d = Number(e.target.value);
  setBarrierDigit(d);
  setSelectedDigit(d); // ✅ sync barrier -> Dashboard selectedDigit
}}
            >
              {Array.from({ length: 10 }, (_, d) => (
                <option key={d} value={d}>
                  {d}
                </option>
              ))}
            </select>
          </div>

          {/* Tick Duration */}
          <div>
            <p className="text-[11px] text-white/60 mb-1">Tick Duration</p>
            <select className="w-full bg-[#0e1422] border border-white/10 p-2 rounded-md text-sm" value={1} disabled>
              <option value={1}>1 Tick</option>
            </select>
          </div>
        </div>

        {/* Stake */}
        <div className="mb-4">
  <p className="text-[11px] text-white/60 mb-2">Stake Amount</p>

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

        {/* Manual Over/Under */}
        <p className="text-sm font-semibold text-white/80 mb-2">Manual Over / Under Trading</p>
        <div className="grid grid-cols-2 gap-3">
          <button
            onClick={() => {
  const now = Date.now();
  if (now - lastManualRef.current < 400) return;
  lastManualRef.current = now;

  setManualActive("Over");

  setSelectedDigit(barrierDigit); // ✅ CRITICAL
  onPlaceTrade("Over", 1);

  setTimeout(() => setManualActive(null), 300);
}}
            className={`rounded-md py-3 font-semibold transition ${
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

  setSelectedDigit(barrierDigit); // ✅ CRITICAL
  onPlaceTrade("Under", 1);

  setTimeout(() => setManualActive(null), 300);
}}
            className={`rounded-md py-3 font-semibold transition ${
              manualActive === "Under"
                ? "bg-red-500 shadow-[0_0_20px_rgba(239,68,68,0.9)]"
                : "bg-red-600 hover:bg-red-700"
            }`}
          >
            Under {barrierDigit}
          </button>
        </div>

        {/* Random Auto button */}
        <div className="mt-4">
          <button
            onClick={toggleSpiderRandomAuto}
            className={`w-full py-3 rounded-md font-semibold text-sm transition ${
              spiderRandomRunning ? "bg-red-600 hover:bg-red-700 animate-pulse" : "bg-indigo-600 hover:bg-indigo-700"
            }`}
          >
            {spiderRandomRunning ? "Stop Random Over/Under" : "🎲 Enable Random Over/Under"}
          </button>
          <p className="mt-2 text-xs text-white/60 text-center">Takes fast random Over/Under trades (0.4s, 1 tick)</p>
        </div>
      </div>
      {/* ================= Trade History (Separate Panel) ================= */}
<div className="mt-6">
  <TradeHistoryMetroLike
    tradeHistory={tradeHistory}
    currency={currency}
    onClear={onClearHistory}
  />
</div>


    </div>
  );
}
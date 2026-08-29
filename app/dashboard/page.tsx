"use client";

import MSpiderPanel from "@/components/dashboard/strategies/MSpiderPanel";
import { default as RiseFallPanel } from "@/components/dashboard/strategies/RiseFallPanel";
import SpiderXPanel from "@/components/dashboard/strategies/SpiderXPanel";
import MetroXPanel from "@/components/dashboard/strategies/MetroXPanel";
import EvenOddPanel from "@/components/dashboard/strategies/EvenOddPanel";
import MarketIndicator from "@/components/dashboard/MarketIndicator";
import DerivChart from "@/components/DerivChart";
import React, { useEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";

const RAW_DERIV_APP_ID = process.env.NEXT_PUBLIC_DERIV_APP_ID?.trim();
const APP_ID = RAW_DERIV_APP_ID || "";

const DERIV_OAUTH_BASE_URL = "https://auth.deriv.com/oauth2/auth";
const DERIV_OPTIONS_API_BASE = "https://api.derivws.com";
const DERIV_OAUTH_CALLBACK_PATH = "/dashboard";
const DERIV_OAUTH_STATE_KEY = "deriv_oauth_state";
const DERIV_OAUTH_VERIFIER_KEY = "deriv_oauth_code_verifier";

type DerivOAuthAccount = {
  accountId: string;
  token: string;
  currency: string;
};

function normalizeDerivToken(value: string) {
  return value.trim().replace(/^Bearer\s+/i, "");
}

function createOAuthRandomString(byteLength = 64) {
  const bytes = new Uint8Array(byteLength);
  window.crypto.getRandomValues(bytes);
  return Array.from(bytes, (byte) => byte.toString(16).padStart(2, "0")).join("");
}

function toBase64Url(buffer: ArrayBuffer) {
  const bytes = new Uint8Array(buffer);
  let binary = "";

  bytes.forEach((byte) => {
    binary += String.fromCharCode(byte);
  });

  return window
    .btoa(binary)
    .replace(/\+/g, "-")
    .replace(/\//g, "_")
    .replace(/=+$/g, "");
}

async function buildDerivOAuthUrl() {
  if (!APP_ID) {
    throw new Error("Deriv OAuth is not configured. Set NEXT_PUBLIC_DERIV_APP_ID first.");
  }

  const codeVerifier = createOAuthRandomString();
  const challengeBuffer = await window.crypto.subtle.digest(
    "SHA-256",
    new TextEncoder().encode(codeVerifier)
  );
  const state = createOAuthRandomString(32);
  const redirectUri = new URL(DERIV_OAUTH_CALLBACK_PATH, window.location.origin).toString();
  if (!redirectUri.startsWith("https://")) {
    throw new Error(
      "Deriv OAuth requires HTTPS. For local testing, run npm run dev:https and open https://localhost:3000."
    );
  }

  sessionStorage.setItem(DERIV_OAUTH_STATE_KEY, state);
  sessionStorage.setItem(DERIV_OAUTH_VERIFIER_KEY, codeVerifier);

  const params = new URLSearchParams({
    response_type: "code",
    client_id: APP_ID,
    redirect_uri: redirectUri,
    scope: "trade",
    state,
    code_challenge: toBase64Url(challengeBuffer),
    code_challenge_method: "S256",
  });

  return `${DERIV_OAUTH_BASE_URL}?${params.toString()}`;
}

function readDerivApiError(data: any) {
  const firstRestError = Array.isArray(data?.errors) ? data.errors[0] : null;

  return (
    data?.error?.message ||
    firstRestError?.message ||
    data?.message ||
    "Deriv did not return options trading accounts."
  );
}

function extractOptionsAccountId(account: any) {
  return String(
    account?.account_id ||
      account?.loginid ||
      account?.login_id ||
      account?.id ||
      account?.accountId ||
      ""
  ).toUpperCase();
}

async function fetchOptionsTradingAccounts(accessToken: string) {
  const response = await fetch(`${DERIV_OPTIONS_API_BASE}/trading/v1/options/accounts`, {
    method: "GET",
    headers: {
      Authorization: `Bearer ${accessToken}`,
      "Deriv-App-ID": APP_ID,
    },
  });

  const data = await response.json().catch(() => null);

  if (!response.ok) {
    throw new Error(readDerivApiError(data));
  }

  const rawAccounts = Array.isArray(data?.data)
    ? data.data
    : Array.isArray(data?.accounts)
      ? data.accounts
      : Array.isArray(data)
        ? data
        : [];

  return rawAccounts
    .map((rawAccount: any) => ({
      accountId: extractOptionsAccountId(rawAccount),
      token: accessToken,
      currency: String(rawAccount?.currency || "USD").toUpperCase(),
    }))
    .filter((account: DerivOAuthAccount) => account.accountId.length > 0);
}

async function fetchDerivWebSocketUrl(accessToken: string, accountId: string) {
  const response = await fetch(
    `${DERIV_OPTIONS_API_BASE}/trading/v1/options/accounts/${encodeURIComponent(accountId)}/otp`,
    {
      method: "POST",
      headers: {
        Authorization: `Bearer ${accessToken}`,
        "Deriv-App-ID": APP_ID,
      },
    }
  );
  const data = await response.json().catch(() => null);

  if (!response.ok) {
    throw new Error(readDerivApiError(data));
  }

  const websocketUrl = typeof data?.data?.url === "string" ? data.data.url : "";

  try {
    const parsedUrl = new URL(websocketUrl);
    const isDerivSocket =
      parsedUrl.protocol === "wss:" &&
      (parsedUrl.hostname === "derivws.com" || parsedUrl.hostname.endsWith(".derivws.com"));

    if (!isDerivSocket) throw new Error();
  } catch {
    throw new Error("Deriv did not return a valid trading connection.");
  }

  return websocketUrl;
}

function parseLegacyDerivOAuthAccounts() {
  if (typeof window === "undefined") return [] as DerivOAuthAccount[];

  const combinedParams = new URLSearchParams(
    `${window.location.search.replace(/^\?/, "")}&${window.location.hash.replace(/^#/, "")}`
  );

  const accounts: DerivOAuthAccount[] = [];

  for (let i = 1; i <= 50; i++) {
    const accountId = combinedParams.get(`acct${i}`);
    const token = combinedParams.get(`token${i}`);
    const currency = combinedParams.get(`cur${i}`) || "USD";

    if (!accountId || !token) continue;

    accounts.push({
      accountId: accountId.toUpperCase(),
      token: normalizeDerivToken(token),
      currency: currency.toUpperCase(),
    });
  }

  return accounts;
}

function readDerivOAuthCallback() {
  if (typeof window === "undefined") return null;

  const params = new URLSearchParams(window.location.search);
  const code = params.get("code");
  const state = params.get("state");
  const error = params.get("error");
  const errorDescription = params.get("error_description");

  if (!code && !error) return null;

  return { code, state, error, errorDescription };
}
// ============================================================================
// SAFE REFACTOR ORDER
// 1) Extract pure display components first.
// 2) Extract strategy panels second.
// 3) Extract helpers/types last.
//
// Suggested file structure:
// - components/dashboard/MarketIndicator.tsx
// - components/dashboard/strategies/MetroXPanel.tsx
// - components/dashboard/strategies/SpiderXPanel.tsx
// - components/dashboard/strategies/RiseFallPanel.tsx
// - components/dashboard/strategies/MSpiderPanel.tsx
// - components/dashboard/strategy-types.ts
// - components/dashboard/strategy-helpers.ts
//
// Important:
// - Keep WebSocket, auth, refs, and trade execution in this page first.
// - Move UI rendering before moving logic.
// - After each extraction, verify imports, props, and no behavior changes.
// ============================================================================

// ============================================================================
// Dashboard constants, types, and shared helpers
// Keep this section free of UI components so strategy panels can be extracted
// into separate files in a later refactor.
// ============================================================================
// ===================== UPDATED INDEX LIST =====================

export const INDEX_GROUPS = {
  volatility: [
    { code: "R_10", label: "Volatility 10 Index" },
    { code: "R_25", label: "Volatility 25 Index" },
    { code: "R_50", label: "Volatility 50 Index" },
    { code: "R_75", label: "Volatility 75 Index" },
    { code: "R_100", label: "Volatility 100 Index" },
    { code: "1HZ10V", label: "Volatility 10 (1s) Index" },
    {code: "1HZ15V", label: "Volatility 15 (1s) Index" },
    { code: "1HZ25V", label: "Volatility 25 (1s) Index" },
    {code: "1HZ30V", label: "Volatility 30 (1s) Index" },
    { code: "1HZ50V", label: "Volatility 50 (1s) Index" },
    { code: "1HZ75V", label: "Volatility 75 (1s) Index" },
    {code: "1HZ90V", label: "Volatility 90 (1s) Index" },
    { code: "1HZ100V", label: "Volatility 100 (1s) Index" },
    
    
  ],

  jump: [
    { code: "JD10", label: "Jump 10 Index" },
    { code: "JD25", label: "Jump 25 Index" },
    { code: "JD50", label: "Jump 50 Index" },
    { code: "JD75", label: "Jump 75 Index" },
    { code: "JD100", label: "Jump 100 Index" },
    { code: "RDBEAR", label: "Bear Market Index" },
    { code: "RDBULL", label: "Bull Market Index" },
  ],

  Step: [
    { code: "STPRNG", label: "STEP INDEX 100" },
    { code: "STPRNG2", label: "STEP INDEX 200" },
    { code: "STPRNG3", label: "STEP INDEX 300" },
    { code: "STPRNG4", label: "STEP INDEX 400" },
    { code: "STPRNG5", label: "STEP INDEX 500" },
  ],
};

export const METRO_SPIDER_PAIRS = [
  // Volatility
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

  // Jump
  "JD10",
  "JD25",
  "JD50",
  "JD75",
  "JD100",
  "RDBEAR",
  "RDBULL",
] as const;

export const RISE_FALL_PAIRS = [
  ...METRO_SPIDER_PAIRS,

  // Step (Rise/Fall only)
  "STPRNG",
  "STPRNG2",
  "STPRNG3",
  "STPRNG4",
  "STPRNG5",
] as const;

export const STEP_ONLY_PAIRS = RISE_FALL_PAIRS.filter(
  (p) => !METRO_SPIDER_PAIRS.includes(p as (typeof METRO_SPIDER_PAIRS)[number])
) as readonly Pair[];

export const PAIRS = RISE_FALL_PAIRS;

export type Pair = (typeof PAIRS)[number];

type ActiveSymbolItem = {
  symbol?: string;
  underlying_symbol?: string;
  display_name?: string;
  display_name_short?: string;
  underlying_symbol_name?: string;
};

const STEP_PAIR_LABELS: Record<
  Extract<Pair, "STPRNG" | "STPRNG2" | "STPRNG3" | "STPRNG4" | "STPRNG5">,
  string
> = {
  STPRNG: "Step Index 100",
  STPRNG2: "Step Index 200",
  STPRNG3: "Step Index 300",
  STPRNG4: "Step Index 400",
  STPRNG5: "Step Index 500",
};

type TradeResult = "Win" | "Loss" | "Pending";
type TradeType =
  | "Matches"
  | "Differs"
  | "Over"
  | "Under"
  | "Even"
  | "Odd"
  | "Rise"
  | "Fall"
  | "Higher"
  | "Lower";

type Trade = {
 source?: "MetroX" | "Metro" | "SpiderX" | "SpiderX Auto" | "Edshell" | "M-Spider" | "Even/Odd";
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
    batchIndex?: number; // 1,2,3...
  batchTotal?: number; // 3 or 5
};

type BarrierOptimizerWindow = 3 | 5 | 10 | 15;

type BarrierOptimizerRow = {
  pair: Pair;
  label: string;
  ticks: number;
  higherWinPct: number;
  lowerWinPct: number;
  avgMoveUp: number;
  avgMoveDown: number;
  higherBarrier: number;
  lowerBarrier: number;
  difference: number;
  best: "HIGHER" | "LOWER";
  score: number;
};

const CONTRACT_TYPE_MAP: Record<TradeType, string> = {
  Matches: "DIGITMATCH",
  Differs: "DIGITDIFF",
  Over: "DIGITOVER",
  Under: "DIGITUNDER",
  Even: "DIGITEVEN",
  Odd: "DIGITODD",

  // Rise/Fall
  Rise: "CALL",
  Fall: "PUT",

  // Higher/Lower
  Higher: "CALL",
  Lower: "PUT",
};
function getContractType(type: TradeType, allowEquals: boolean) {
  if (type === "Rise") return allowEquals ? "CALLE" : "CALL";
  if (type === "Fall") return allowEquals ? "PUTE" : "PUT";
  if (type === "Higher") return "CALL";
  if (type === "Lower") return "PUT";
  return CONTRACT_TYPE_MAP[type];
}

function sleep(ms: number) {
  return new Promise((r) => setTimeout(r, ms));
}

function formatTime(ms: number) {
  return new Date(ms).toLocaleString();
}
function parseMSpiderDuration(value: string): { duration: number; duration_unit: "t" | "s" | "m" | "h" } {
  if (/^\d+$/.test(value)) {
    return { duration: Number(value), duration_unit: "t" };
  }
  if (/^\d+s$/.test(value)) {
    return { duration: Number.parseInt(value, 10), duration_unit: "s" };
  }
  if (/^\d+m$/.test(value)) {
    return { duration: Number.parseInt(value, 10), duration_unit: "m" };
  }
  if (/^\d+h$/.test(value)) {
    return { duration: Number.parseInt(value, 10), duration_unit: "h" };
  }
  return { duration: 5, duration_unit: "t" };
}
const BARRIER_OPTIMIZER_PAIRS = [
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
] as const satisfies readonly Pair[];

const BARRIER_WINDOW_TICK_COUNT: Record<BarrierOptimizerWindow, number> = {
  3: 3,
  5: 5,
  10: 10,
  15: 15,
};

const getPairLabel = (pair: Pair) => {
  for (const group of Object.values(INDEX_GROUPS)) {
    const found = group.find((item) => item.code === pair);
    if (found) return found.label;
  }
  return pair;
};

function formatOptimizerBarrier(value: number) {
  return `${value >= 0 ? "+" : ""}${value.toFixed(2)}`;
}

function clampPercent(value: number) {
  return Math.max(0, Math.min(100, value));
}

function buildBarrierOptimizerRows(params: {
  pairQuotesRef: React.MutableRefObject<Record<Pair, number[]>>;
  windowTicks: BarrierOptimizerWindow;
}): BarrierOptimizerRow[] {
  const { pairQuotesRef, windowTicks } = params;
  const lookahead = BARRIER_WINDOW_TICK_COUNT[windowTicks];

  const rows = BARRIER_OPTIMIZER_PAIRS.map((pair) => {
    const quotes = pairQuotesRef.current[pair] ?? [];
    if (quotes.length <= lookahead + 2) {
      return null;
    }

    let higherWins = 0;
    let lowerWins = 0;
    let totalUp = 0;
    let totalDown = 0;
    let moveSamples = 0;

    for (let i = 0; i < quotes.length - lookahead; i++) {
      const entry = quotes[i];
      const futureSlice = quotes.slice(i + 1, i + 1 + lookahead);
      if (!futureSlice.length) continue;

      const maxFuture = Math.max(...futureSlice);
      const minFuture = Math.min(...futureSlice);

      const upMove = maxFuture - entry;
      const downMove = entry - minFuture;

      if (upMove > 0) totalUp += upMove;
      if (downMove > 0) totalDown += downMove;

      if (upMove > downMove) higherWins++;
      if (downMove > upMove) lowerWins++;
      if (upMove > 0 || downMove > 0) moveSamples++;
    }

    if (!moveSamples) return null;

    const higherWinPct = clampPercent((higherWins / moveSamples) * 100);
    const lowerWinPct = clampPercent((lowerWins / moveSamples) * 100);
    const avgMoveUp = totalUp / moveSamples;
    const avgMoveDown = totalDown / moveSamples;

    // derive recommended barriers from average movement
// H must always be positive
const higherBarrier = Math.abs(avgMoveUp * 0.25);

// L must always be negative
const lowerBarrier = -Math.abs(avgMoveDown * 0.25);

// difference must reflect real directional edge
const difference = avgMoveUp - avgMoveDown;

const best: "HIGHER" | "LOWER" = difference >= 0 ? "HIGHER" : "LOWER";

    const score = Math.round(
      clampPercent(
        Math.abs(difference) * 12 + Math.max(higherWinPct, lowerWinPct) * 0.9
      )
    );

    return {
      pair,
      label: getPairLabel(pair),
      ticks: quotes.length,
      higherWinPct,
      lowerWinPct,
      avgMoveUp,
      avgMoveDown,
      higherBarrier,
      lowerBarrier,
      difference,
      best,
      score,
    };
  }).filter(Boolean) as BarrierOptimizerRow[];

  return rows
    .sort((a, b) => Math.abs(b.difference) - Math.abs(a.difference))
    .slice(0, 4); // only top 4
}
// ============================================================================
// Shared dashboard widgets
// Extraction target: components/dashboard/MarketIndicator.tsx
// This is the safest first component to move because it is display-heavy and
// only depends on props + local helper logic.
// ============================================================================


// ============================================================================
// Strategy access flags and UI visibility flags
// ============================================================================
/** ================= ADMIN STRATEGY FLAGS (NEW) =================
 * Stored in localStorage under STRATEGY_FLAGS_KEY.
 * These flags are enforced for USERS only. Admins always see everything.
 */
const STRATEGY_FLAGS_KEY = "strategy_flags";

type StrategyKey = "matches" | "overunder" | "evenodd" | "risefall" | "mspider";
type StrategyFlags = Record<StrategyKey, boolean>;

const DEFAULT_FLAGS: StrategyFlags = {
  matches: true,
  overunder: true,
  evenodd: true,
  risefall: true,
  mspider: true,
};
const UI_FLAGS_KEY = "ui_flags";

type UIFlags = {
  metro_place_trade: boolean;
  metro_edshell: boolean;
  metro_metro: boolean; // ✅ NEW
  metro_3x: boolean;
  metro_5x: boolean;
  metro_1x_auto: boolean;
  metro_fast_auto: boolean;
  spider_analyzer: boolean;
  spider_manual_over_under: boolean;
  spider_random_auto: boolean;
};

const DEFAULT_UI_FLAGS: UIFlags = {
  metro_place_trade: true,
  metro_edshell: true,
  metro_metro: true,
  metro_3x: true,
  metro_5x: true,
  metro_1x_auto: true,
  metro_fast_auto: true,
  spider_analyzer: true,
  spider_manual_over_under: true,
  spider_random_auto: true,
};

function readUIFlags(): UIFlags {
  try {
    const raw = localStorage.getItem(UI_FLAGS_KEY);
    if (!raw) return DEFAULT_UI_FLAGS;
    const v = JSON.parse(raw) as Partial<UIFlags>;
    return {
      metro_place_trade: typeof v.metro_place_trade === "boolean" ? v.metro_place_trade : true,
      metro_edshell: typeof v.metro_edshell === "boolean" ? v.metro_edshell : true,
      metro_metro: typeof v.metro_metro === "boolean" ? v.metro_metro : true,
      metro_3x: typeof v.metro_3x === "boolean" ? v.metro_3x : true,
      metro_5x: typeof v.metro_5x === "boolean" ? v.metro_5x : true,
      metro_1x_auto: typeof v.metro_1x_auto === "boolean" ? v.metro_1x_auto : true,
      metro_fast_auto: typeof v.metro_fast_auto === "boolean" ? v.metro_fast_auto : true,
      spider_analyzer: typeof v.spider_analyzer === "boolean" ? v.spider_analyzer : true,
      spider_manual_over_under: typeof v.spider_manual_over_under === "boolean" ? v.spider_manual_over_under : true,
      spider_random_auto: typeof v.spider_random_auto === "boolean" ? v.spider_random_auto : true,
    };
  } catch {
    return DEFAULT_UI_FLAGS;
  }
}
function readStrategyFlags(): StrategyFlags {
  try {
    const raw = localStorage.getItem(STRATEGY_FLAGS_KEY);
    if (!raw) return DEFAULT_FLAGS;
    const parsed = JSON.parse(raw) as Partial<StrategyFlags>;
    return {
  matches: typeof parsed.matches === "boolean" ? parsed.matches : true,
  overunder: typeof parsed.overunder === "boolean" ? parsed.overunder : true,
  evenodd: typeof parsed.evenodd === "boolean" ? parsed.evenodd : true,
  risefall: typeof parsed.risefall === "boolean" ? parsed.risefall : true,
  mspider: typeof parsed.mspider === "boolean" ? parsed.mspider : true,
};
  } catch {
    return DEFAULT_FLAGS;
  }
}
const MIN_TRADE_INTERVAL_MS = 400;
type ReinvestThreshold = 25 | 50 | 75 | 100;

function getReinvestedStake(
  baseStake: number,
  profit: number,
  threshold: ReinvestThreshold
) {
  const safeBase = Number.isFinite(baseStake) ? Math.max(0, baseStake) : 0;
  const safeProfit = Number.isFinite(profit) ? Math.max(0, profit) : 0;
  return Number((safeBase + safeProfit * (threshold / 100)).toFixed(2));
}

// ============================================================================
// Main dashboard container
// Keep these responsibilities here during the first refactor pass:
// - auth / routing
// - websocket connection
// - refs and shared state
// - trade placement helpers
// - subscriptions and socket message handling
//
// Move out only strategy-specific JSX sections first.
// ============================================================================
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

(async () => {
  // ---- Strategy flags ----
  try {
    const res = await fetch("/api/admin/strategies", { cache: "no-store" });
    const data = await res.json();
    const f = data?.ok && data.flags ? data.flags : DEFAULT_FLAGS;

    localStorage.setItem(STRATEGY_FLAGS_KEY, JSON.stringify(f));
    setStrategyFlags(f);
  } catch {
    setStrategyFlags(DEFAULT_FLAGS);
  }

  // ---- UI flags ----
  try {
    const res = await fetch("/api/admin/ui-flags", { cache: "no-store" });
    const data = await res.json();
    const uf = data?.ok && data.flags ? data.flags : DEFAULT_UI_FLAGS;

    localStorage.setItem(UI_FLAGS_KEY, JSON.stringify(uf));
    setUiFlags(uf);
  } catch {
    setUiFlags(DEFAULT_UI_FLAGS);
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
    if (e.key === UI_FLAGS_KEY) {
      setUiFlags(readUIFlags());
    }
  };
  window.addEventListener("storage", onStorage);
  return () => window.removeEventListener("storage", onStorage);
}, []);

  const wsRef = useRef<WebSocket | null>(null);
const authorizedRef = useRef(false);
const activeStrategyRef = useRef<"matches" | "overunder" | "evenodd" | "risefall" | "mspider" | null>(null);
const selectedPairRef = useRef<Pair>(PAIRS[0]);
const liveSymbolMapRef = useRef<Record<Pair, string>>(
  Object.fromEntries(PAIRS.map((p) => [p, p])) as Record<Pair, string>
);
const liveSymbolReverseMapRef = useRef<Record<string, Pair>>(
  Object.fromEntries(PAIRS.map((p) => [p, p])) as Record<string, Pair>
);
const lastEdshellAtRef = useRef(0);
  const [uiFlags, setUiFlags] = useState<UIFlags>(DEFAULT_UI_FLAGS);
  const [barrierOptimizerOpen, setBarrierOptimizerOpen] = useState(false);
const [barrierOptimizerLive, setBarrierOptimizerLive] = useState(false);
const [barrierOptimizerWindow, setBarrierOptimizerWindow] = useState<BarrierOptimizerWindow>(5);

  // ✅ force-remount MetroX panel (resets its local analysis state)
  const [metroXResetKey, setMetroXResetKey] = useState(0);

  // per-pair rolling digits cache
  const pairDigitsRef = useRef<Record<Pair, number[]>>(
  Object.fromEntries(PAIRS.map((p) => [p, []])) as unknown as Record<Pair, number[]>
);
// per-pair rolling quote cache (used for Rise/Fall trend detection)
const pairQuotesRef = useRef<Record<Pair, number[]>>(
  Object.fromEntries(PAIRS.map((p) => [p, []])) as unknown as Record<Pair, number[]>
);

  // buy ack waiters (req_id -> promise resolver)
  const buyAckWaitersRef = useRef<
    Record<number, { resolve: () => void; reject: (msg: string) => void }>
  >({});

  const proposalPreviewWaitersRef = useRef<
  Record<number, { resolve: (proposal: any) => void; reject: (msg: string) => void }>
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
const [derivAccountId, setDerivAccountId] = useState("");
const [oauthAccounts, setOauthAccounts] = useState<DerivOAuthAccount[]>([]);
const [selectedOAuthIndex, setSelectedOAuthIndex] = useState(0);
const [derivLoginStatus, setDerivLoginStatus] = useState("");
const [connected, setConnected] = useState(false);

useEffect(() => {
  const applyAccounts = (accounts: DerivOAuthAccount[], status = "") => {
    setOauthAccounts(accounts);
    setSelectedOAuthIndex(0);
    setDerivLoginStatus(status);

    const first = accounts[0];
    if (!first) return;

    setToken(first.token);
    setDerivAccountId(first.accountId);
    setCurrency(first.currency);

    localStorage.setItem("deriv_oauth_accounts", JSON.stringify(accounts));
    localStorage.setItem("deriv_token", first.token);
    localStorage.setItem("deriv_account_id", first.accountId);
  };

  const loadDerivAccounts = async () => {
    const oauthCallback = readDerivOAuthCallback();

    if (oauthCallback) {
      window.history.replaceState({}, document.title, window.location.pathname);

      if (oauthCallback.error) {
        setDerivLoginStatus(
          oauthCallback.errorDescription || `Deriv login failed: ${oauthCallback.error}`
        );
        return;
      }

      const expectedState = sessionStorage.getItem(DERIV_OAUTH_STATE_KEY);
      const codeVerifier = sessionStorage.getItem(DERIV_OAUTH_VERIFIER_KEY);

      if (!oauthCallback.code || !oauthCallback.state || oauthCallback.state !== expectedState) {
        setDerivLoginStatus("Deriv login could not be verified. Please start the login again.");
        return;
      }

      if (!codeVerifier) {
        setDerivLoginStatus("Deriv login expired in this browser. Please start the login again.");
        return;
      }

      setDerivLoginStatus("Finishing secure Deriv login...");

      try {
        const tokenResponse = await fetch("/api/deriv/oauth/token", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            code: oauthCallback.code,
            codeVerifier,
          }),
        });
        const tokenData = await tokenResponse.json().catch(() => null);

        if (!tokenResponse.ok || !tokenData?.accessToken) {
          throw new Error(tokenData?.error || "Deriv did not return an access token.");
        }

        setDerivLoginStatus("Loading your Deriv Options trading accounts...");
        const optionsAccounts = await fetchOptionsTradingAccounts(tokenData.accessToken);

        if (!optionsAccounts.length) {
          throw new Error("No Deriv Options trading accounts were found for this login.");
        }

        applyAccounts(optionsAccounts, `${optionsAccounts.length} Options trading account(s) loaded.`);
      } catch (error) {
        setDerivLoginStatus(
          error instanceof Error ? error.message : "Could not finish Deriv login."
        );
      } finally {
        sessionStorage.removeItem(DERIV_OAUTH_STATE_KEY);
        sessionStorage.removeItem(DERIV_OAUTH_VERIFIER_KEY);
      }

      return;
    }

    const accountsFromRedirect = parseLegacyDerivOAuthAccounts();

    if (accountsFromRedirect.length) {
      applyAccounts(accountsFromRedirect, `${accountsFromRedirect.length} Deriv account(s) loaded.`);
      window.history.replaceState({}, document.title, window.location.pathname);
      return;
    }

    try {
      const savedAccounts = JSON.parse(
        localStorage.getItem("deriv_oauth_accounts") || "[]"
      ) as DerivOAuthAccount[];

      if (Array.isArray(savedAccounts) && savedAccounts.length) {
        applyAccounts(savedAccounts, `${savedAccounts.length} saved Deriv account(s) loaded.`);
      }
    } catch {}
  };

  void loadDerivAccounts();
}, []);

const loginWithDeriv = async () => {
  try {
    setDerivLoginStatus("Opening Deriv secure login...");
    const loginUrl = await buildDerivOAuthUrl();
    window.location.assign(loginUrl);
  } catch (error) {
    setDerivLoginStatus(
      error instanceof Error ? error.message : "Could not open Deriv login."
    );
  }
};

const selectDerivOAuthAccount = (index: number) => {
  const account = oauthAccounts[index];
  if (!account) return;

  setSelectedOAuthIndex(index);
  setToken(account.token);
  setDerivAccountId(account.accountId);
  setCurrency(account.currency);

  localStorage.setItem("deriv_token", account.token);
  localStorage.setItem("deriv_account_id", account.accountId);
};

  const [balance, setBalance] = useState<number | null>(null);
  const [currency, setCurrency] = useState("USD");

  const [pipSize, setPipSize] = useState<number>(2);

  const [ticks, setTicks] = useState<number[]>([]);

  const [activeStrategy, setActiveStrategy] = useState<"matches" | "overunder" | "evenodd" | "risefall" | "mspider" | null>(null);
useEffect(() => {
  activeStrategyRef.current = activeStrategy;
}, [activeStrategy]);
  const [selectedPair, setSelectedPair] = useState<Pair>(PAIRS[0]);
  useEffect(() => {
    selectedPairRef.current = selectedPair;

    if (activeStrategyRef.current === "risefall") {
      setTicks(pairDigitsRef.current[selectedPair] ?? []);
    }

    if (connected && authorizedRef.current) {
      safeSend({ ticks: resolveLiveSymbol(selectedPair), subscribe: 1 });
    }
  }, [selectedPair, connected]);

  useEffect(() => {
    if (activeStrategy === "risefall" && connected && authorizedRef.current) {
      safeSend({ ticks: resolveLiveSymbol(selectedPair), subscribe: 1 });
      setTicks(pairDigitsRef.current[selectedPair] ?? []);
    }
  }, [activeStrategy, selectedPair, connected]);

  // ===== Live chart quotes (used for the chart panel) =====
  const chartQuotes =
    pairQuotesRef.current[selectedPair]?.slice(-150) ?? [];
// ================= METRO AUTO (NEW) =================
const [metroRunning, setMetroRunning] = useState(false);
const metroCancelRef = useRef(false);
const metroLoopRef = useRef(false);

// prevent repeating same pair too fast
const metroLastTradeAtRef = useRef<Record<string, number>>({});
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
  const [reinvestProfitsEnabled, setReinvestProfitsEnabled] = useState(false);
  const [reinvestThreshold, setReinvestThreshold] =
    useState<ReinvestThreshold>(25);
  const manualStakeRef = useRef(1);
  const processedProfitTradeIdsRef = useRef<Record<number, true>>({});
  const [tradeHistory, setTradeHistory] = useState<Trade[]>([]);
  const [selectedDigit, setSelectedDigit] = useState<number | null>(null);
  // ✅ keep latest selected digit for Fast Auto loop
const selectedDigitRef = useRef<number | null>(null);

useEffect(() => {
  selectedDigitRef.current = selectedDigit;
}, [selectedDigit]);

const handleStakeChange: React.Dispatch<React.SetStateAction<number>> = (value) => {
  const nextStake = typeof value === "function" ? value(manualStakeRef.current) : value;
  const normalizedStake = Number.isFinite(nextStake) ? nextStake : 0;
  manualStakeRef.current = normalizedStake;
  setStake(normalizedStake);
};

useEffect(() => {
  if (!reinvestProfitsEnabled) {
    setStake(manualStakeRef.current);
    return;
  }

  const profitableTrades = tradeHistory.filter(
    (trade) =>
      trade.result !== "Pending" &&
      Number(trade.profit ?? 0) > 0 &&
      !processedProfitTradeIdsRef.current[trade.id]
  );

  if (!profitableTrades.length) return;

  profitableTrades.forEach((trade) => {
    processedProfitTradeIdsRef.current[trade.id] = true;
  });

  const totalNewProfit = profitableTrades.reduce(
    (sum, trade) => sum + Number(trade.profit ?? 0),
    0
  );

  setStake((currentStake) =>
    getReinvestedStake(currentStake, totalNewProfit, reinvestThreshold)
  );
}, [tradeHistory, reinvestProfitsEnabled, reinvestThreshold]);

  // ============================================================================
  // Strategy state: MetroX
  // ============================================================================
  const [mdTradeType, setMdTradeType] = useState<"Differs" | "Matches">("Differs");
  const [mdTickDuration, setMdTickDuration] = useState<number>(1);
  const [rfTickDuration, setRfTickDuration] = useState<number | string>(2);
  const [rfAllowEquals, setRfAllowEquals] = useState(false);


  const [instant3xRunning, setInstant3xRunning] = useState(false);
  const [turboMode, setTurboMode] = useState(false);

  const [auto5xRunning, setAuto5xRunning] = useState(false);
  const [auto1xRunning, setAuto1xRunning] = useState(false);
  const [analysisStatus, setAnalysisStatus] = useState<string>("");
  // ============================================================================
  // Strategy state: SpiderX
  // ============================================================================
  // ✅ Fast AutoTrading (NEW)
const [fastAutoRunning, setFastAutoRunning] = useState(false);
const fastAutoCancelRef = useRef(false);
const fastAutoLoopRunningRef = useRef(false);
// SpiderX random auto state
const [spiderRandomRunning, setSpiderRandomRunning] = useState(false);
const spiderRandomCancelRef = useRef(false);
const spiderRandomLoopRef = useRef(false);

  // collapsible analysis box
  const [analysisOpen, setAnalysisOpen] = useState(false);
  const barrierOptimizerRows = useMemo(() => {
  if (!barrierOptimizerLive) return [];
  return buildBarrierOptimizerRows({
    pairQuotesRef,
    windowTicks: barrierOptimizerWindow,
  });
}, [barrierOptimizerLive, barrierOptimizerWindow, ticks]);

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

  const markDerivSessionReady = () => {
  authorizedRef.current = true;
  setConnected(true);
  setDerivLoginStatus("Connected to Deriv.");

  safeSend({ balance: 1, subscribe: 1 });
  safeSend({ active_symbols: "brief" });
  subscribeAllPairs(PAIRS);
};

  const resolveLiveSymbol = (pair: Pair) => liveSymbolMapRef.current[pair] ?? pair;

const normalizeIncomingPair = (symbol: string): Pair | null => {
  const mapped = liveSymbolReverseMapRef.current[symbol];
  if (mapped) return mapped;
  return PAIRS.includes(symbol as Pair) ? (symbol as Pair) : null;
};

const syncLiveSymbolMap = (activeSymbols: ActiveSymbolItem[]) => {
  const nextMap = Object.fromEntries(PAIRS.map((p) => [p, p])) as Record<Pair, string>;

  activeSymbols.forEach((item) => {
    const liveSymbol = item.underlying_symbol || item.symbol;
    if (!liveSymbol) return;

    const label = `${item.underlying_symbol_name ?? ""} ${item.display_name ?? ""} ${item.display_name_short ?? ""}`.toLowerCase();

    (Object.entries(STEP_PAIR_LABELS) as Array<
      [Extract<Pair, "STPRNG" | "STPRNG2" | "STPRNG3" | "STPRNG4" | "STPRNG5">, string]
    >).forEach(([pair, expectedLabel]) => {
      const normalizedExpected = expectedLabel.toLowerCase();
      const looseExpected = normalizedExpected.replace(" index", "");
      if (
        label.includes(normalizedExpected) ||
        label.includes(looseExpected) ||
        label.includes(normalizedExpected.replace(/\s+/g, ""))
      ) {
        nextMap[pair] = liveSymbol;
      }
    });
  });

  liveSymbolMapRef.current = nextMap;
  liveSymbolReverseMapRef.current = Object.fromEntries(
    Object.entries(nextMap).map(([pair, symbol]) => [symbol, pair as Pair])
  ) as Record<string, Pair>;
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
      await sleep(400);
    }
  } finally {
    buyWorkerRunningRef.current = false;
  }
};

useEffect(() => {
  if (activeStrategy !== "mspider") return;
  if (!barrierOptimizerLive) return;

  BARRIER_OPTIMIZER_PAIRS.forEach((pair) => {
    safeSend({ ticks: pair, subscribe: 1 });
  });
}, [activeStrategy, barrierOptimizerLive]);
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

  const subscribeAllPairs = (pairs: readonly Pair[]) => {
  pairs.forEach((sym) => {
    safeSend({ ticks: resolveLiveSymbol(sym), subscribe: 1 });
  });
};
const resetPairNow = (p: Pair) => {
  // 🔄 wipe ALL pair caches
  pairDigitsRef.current = Object.fromEntries(
    PAIRS.map((x) => [x, []])
  ) as unknown as Record<Pair, number[]>;
  pairQuotesRef.current = Object.fromEntries(
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

  const connectDeriv = async () => {
    const cleanToken = normalizeDerivToken(token);
const cleanAccountId = derivAccountId.trim();

if (!APP_ID) return alert("Deriv OAuth is not configured on this deployment.");
if (!cleanToken || !cleanAccountId) return alert("Please log in with Deriv and select an account.");

localStorage.setItem("deriv_token", cleanToken);
if (cleanAccountId) localStorage.setItem("deriv_account_id", cleanAccountId);

    try {
      wsRef.current?.close();
    } catch {}
    wsRef.current = null;

    authorizedRef.current = false;
    buyAckWaitersRef.current = {};
proposalPreviewWaitersRef.current = {};
contractToReqRef.current = {};
reqInfoRef.current = {};

   pairDigitsRef.current = Object.fromEntries(PAIRS.map((p) => [p, []])) as unknown as Record<Pair, number[]>;
   pairQuotesRef.current = Object.fromEntries(PAIRS.map((p) => [p, []])) as unknown as Record<Pair, number[]>;
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
    processedProfitTradeIdsRef.current = {};
setReinvestProfitsEnabled(false);
setStake(manualStakeRef.current);

let websocketUrl = "";

try {
  setDerivLoginStatus(`Connecting ${cleanAccountId} to Deriv...`);
  websocketUrl = await fetchDerivWebSocketUrl(cleanToken, cleanAccountId);
} catch (error) {
  const message = error instanceof Error ? error.message : "Could not connect to Deriv.";
  setDerivLoginStatus(`${message} Please log in with Deriv again if your session expired.`);
  alert(message);
  return;
}

    const ws = new WebSocket(websocketUrl);
wsRef.current = ws;

ws.onopen = () => {
  markDerivSessionReady();
};

    ws.onmessage = (e) => {
      const data = JSON.parse(e.data);

      // ignore harmless already subscribed message
      if (data?.error?.message) {
  const msg: string = data.error.message;
  const req_id: number | undefined = data.req_id;
  const echo = data.echo_req ?? {};
  const rawTickSymbol = typeof echo.ticks === "string" ? echo.ticks : null;
const mappedTickPair = rawTickSymbol ? normalizeIncomingPair(rawTickSymbol) : null;
const isStepOnlySymbol = !!mappedTickPair && STEP_ONLY_PAIRS.includes(mappedTickPair);
  const isInvalidSymbolError = /symbol .* invalid/i.test(msg);
  const isAlreadySubscribedError = /already subscribed/i.test(msg);

  // If a waiter exists, always reject it (turbo or not)
  if (req_id && buyAckWaitersRef.current[req_id]) {
    buyAckWaitersRef.current[req_id].reject(msg);
    delete buyAckWaitersRef.current[req_id];
  }

  // Turbo: do NOT alert (but we did reject waiters so queue doesn't hang)
  if (req_id && reqInfoRef.current[req_id]?.turbo) return;

  // Ignore duplicate/harmless subscription popups, but do not silently swallow real Step subscription failures
if (isInvalidSymbolError && isStepOnlySymbol) {
  console.warn(`Step index subscription failed for ${rawTickSymbol}: ${msg}`);
  setAnalysisStatus(`Step index feed failed for ${mappedTickPair}. Refreshing live symbol map...`);
  safeSend({ active_symbols: "brief" });
  return;
}

if (isAlreadySubscribedError && rawTickSymbol) return;

alert(msg);
return;
}

if (data.msg_type === "active_symbols" && Array.isArray(data.active_symbols)) {
  syncLiveSymbolMap(data.active_symbols as ActiveSymbolItem[]);
}

      if (data.msg_type === "balance") {
        setBalance(Number(data.balance.balance));
        setCurrency(data.balance.currency);
      }

      if (data.msg_type === "tick" && data.tick?.quote !== undefined) {
  const symbol = normalizeIncomingPair(
    String(data.tick.underlying_symbol || data.tick.symbol || "")
  );
if (!symbol) return;

 // ✅ allow ticks if ANY strategy is open OR Metro auto is running
if (
  activeStrategyRef.current !== "matches" &&
  activeStrategyRef.current !== "overunder" &&
  activeStrategyRef.current !== "evenodd" &&
  activeStrategyRef.current !== "risefall" &&
  activeStrategyRef.current !== "mspider" &&
  !metroLoopRef.current
) return;

  const ps = typeof data.tick.pip_size === "number" ? data.tick.pip_size : pipSize;
  if (typeof data.tick.pip_size === "number") setPipSize(ps);

  const quote = Number(data.tick.quote);
const digit = getLastDigit(quote, ps);

const prev = pairDigitsRef.current[symbol] ?? [];
const next = [...prev, digit];
pairDigitsRef.current[symbol] = next;

// store quotes for Rise/Fall trend detection
const prevQuotes = pairQuotesRef.current[symbol] ?? [];
const nextQuotes = [...prevQuotes, quote].slice(-400);
pairQuotesRef.current[symbol] = nextQuotes;
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

  if (symbol === selectedPairRef.current) {
  setTicks(next);

  if (symbol.startsWith("STPRNG")) {
    setPipSize(ps);
  }
}
}

     // proposal preview or proposal -> buy
if (data.msg_type === "proposal") {
  const req_id: number | undefined = data.req_id;
  const proposalId: string | undefined = data.proposal?.id;
  if (!req_id || !proposalId) return;

  if (proposalPreviewWaitersRef.current[req_id]) {
    proposalPreviewWaitersRef.current[req_id].resolve(data.proposal);
    delete proposalPreviewWaitersRef.current[req_id];
    return;
  }

  const info = reqInfoRef.current[req_id];
  const stakeForReq = info?.stake ?? stake;

  if (info?.turbo) {
    enqueueBuy(req_id, proposalId, stakeForReq);
  } else {
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
        const exitValue = Number(poc.exit_tick ?? poc.exit_spot);
        if (Number.isFinite(exitValue)) {
          settlementDigit = getLastDigit(exitValue, pipSize);
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

    ws.onerror = () => {
      setDerivLoginStatus("The Deriv trading connection failed. Please reconnect.");
      alert("Connection failed");
    };
  };

  const disconnect = () => {
  // stop fast auto if running
  fastAutoCancelRef.current = true;
  setFastAutoRunning(false);
  setBarrierOptimizerLive(false);
  setReinvestProfitsEnabled(false);
  processedProfitTradeIdsRef.current = {};
  setStake(manualStakeRef.current);

  wsRef.current?.close();
  wsRef.current = null;
  setConnected(false);
  setBalance(null);
  authorizedRef.current = false;
};

  const logout = () => {
    disconnect();
    setBarrierOptimizerLive(false);
    setReinvestProfitsEnabled(false);
    processedProfitTradeIdsRef.current = {};
    setStake(manualStakeRef.current);
    localStorage.clear();
  router.replace("/");
  };

  // ============================================================================
  // Trade placement helpers shared by all strategies
  // ============================================================================

  const placeTradeFor = async ({
  symbol,
  digit,
  type,
  durationTicks,
  count = 1,
}: {
  symbol: Pair;
  digit: number;
  type: TradeType;
  durationTicks: number;
  count?: 1 | 3 | 5;
}) => {
  await placeDiffersInstant(symbol, digit, count, {
    durationTicks,
    source: "Edshell",
    batchTotal: count,
    batchStartIndex: 1,
  });
};
const placeHigherLowerTrade = ({
  direction,
  durationValue,
  barrier,
  customStake,
}: {
  direction: "Higher" | "Lower";
  durationValue: string;
  barrier: string;
  customStake?: number;
}) => {

  const tradeStake = customStake ?? stake;

  if (!tradeStake || tradeStake <= 0) return alert("Enter a stake amount");
  if (!barrier || !String(barrier).trim()) return alert("Set a barrier value first");
  if (!wsRef.current || wsRef.current.readyState !== WebSocket.OPEN) {
    return alert("WebSocket not connected yet");
  }
  if (!authorizedRef.current) return alert("Not authorized yet");

  const req_id = newReqId();

  const parsedDuration = parseMSpiderDuration(String(durationValue));

  const trade: Trade = {
    id: req_id,
    symbol: selectedPair,
    digit: 0,
    type: direction,
    stake: tradeStake,
    durationTicks: parsedDuration.duration_unit === "t" ? parsedDuration.duration : 0,
    result: "Pending",
    createdAt: Date.now(),
    source: "M-Spider",
  };

  setTradeHistory((prev) => [trade, ...prev]);

  reqInfoRef.current[req_id] = {
    symbol: selectedPair,
    digit: 0,
    type: direction,
    stake: tradeStake,
  };

  const { duration, duration_unit } = parseMSpiderDuration(String(durationValue));

  safeSend({
    proposal: 1,
    amount: tradeStake,
    basis: "stake",
    contract_type: getContractType(direction, false),
    currency: currency || "USD",
    underlying_symbol: resolveLiveSymbol(selectedPair),
    duration,
    duration_unit,
    barrier: String(barrier),
    req_id,
  });
};
const requestHigherLowerPreview = async ({
  direction,
  durationValue,
  barrier,
  customStake,
}: {
  direction: "Higher" | "Lower";
  durationValue: string;
  barrier: string;
  customStake: number;
}) => {
  if (!customStake || customStake <= 0) return { payout: 0, profit: 0 };
  if (!barrier || !String(barrier).trim()) return { payout: 0, profit: 0 };
  if (!wsRef.current || wsRef.current.readyState !== WebSocket.OPEN) return { payout: 0, profit: 0 };
  if (!authorizedRef.current) return { payout: 0, profit: 0 };

  const req_id = newReqId();
  const { duration, duration_unit } = parseMSpiderDuration(durationValue);

  const proposal = await new Promise<any>((resolve, reject) => {
    proposalPreviewWaitersRef.current[req_id] = {
      resolve,
      reject: (msg: string) => reject(new Error(msg)),
    };

    const ok = safeSend({
      proposal: 1,
      amount: customStake,
      basis: "stake",
      contract_type: getContractType(direction, false),
      currency: currency || "USD",
      underlying_symbol: resolveLiveSymbol(selectedPair),
      duration,
      duration_unit,
      barrier: String(barrier),
      req_id,
    });

    if (!ok) {
      delete proposalPreviewWaitersRef.current[req_id];
      reject(new Error("WebSocket not connected"));
      return;
    }

    window.setTimeout(() => {
      if (proposalPreviewWaitersRef.current[req_id]) {
        delete proposalPreviewWaitersRef.current[req_id];
        reject(new Error("Proposal preview timeout"));
      }
    }, 4000);
  });

  const payout = Number(proposal?.payout ?? 0);
  const profit = Number((payout - customStake).toFixed(2));

  return {
    payout: Number.isFinite(payout) ? payout : 0,
    profit: Number.isFinite(profit) ? profit : 0,
  };
};

const placeTrade = (
  type: TradeType,
  durationTicks: number | string,
  customStake?: number
) => {
  const tradeStake = customStake ?? stake;
  
  const needsDigit =
    type === "Matches" || type === "Differs" || type === "Over" || type === "Under";

  if (needsDigit && selectedDigit === null) return alert("Select a digit first");
  if (!Number.isFinite(tradeStake) || tradeStake <= 0) return alert("Enter a stake amount");
  if (!wsRef.current || wsRef.current.readyState !== WebSocket.OPEN) return alert("WebSocket not connected yet");
  if (!authorizedRef.current) return alert("Not authorized yet");

  const req_id = newReqId();

  const src: Trade["source"] =
    activeStrategy === "overunder"
      ? "SpiderX Auto"
      : activeStrategy === "evenodd"
        ? "Even/Odd"
        : activeStrategy === "risefall"
          ? "Metro"
          : "MetroX";

  const digitForTrade = needsDigit ? (selectedDigit as number) : 0;
  const parsedDuration =
  typeof durationTicks === "string" && durationTicks.endsWith("s")
    ? Number(durationTicks.replace("s", ""))
    : Number(durationTicks);

const durationUnit =
  typeof durationTicks === "string" && durationTicks.endsWith("s")
    ? "s"
    : "t";

  const trade: Trade = {
    id: req_id,
    symbol: selectedPair,
    digit: digitForTrade,
    type,
    stake: tradeStake,
    durationTicks: durationUnit === "t" ? parsedDuration : 0,
    result: "Pending",
    createdAt: Date.now(),
    source: src,
  };

  setTradeHistory((prev) => [trade, ...prev]);

  reqInfoRef.current[req_id] = {
    symbol: selectedPair,
    digit: digitForTrade,
    type,
    stake: tradeStake,
  };

  const payload: any = {
    proposal: 1,
    amount: tradeStake,
    basis: "stake",
    contract_type: getContractType(type, rfAllowEquals),
    currency: currency || "USD",
    underlying_symbol: resolveLiveSymbol(selectedPair),
    duration: parsedDuration,
    duration_unit: durationUnit,
    req_id,
  };

  if (needsDigit) payload.barrier = String(selectedDigit);

  safeSend(payload);
};
const placeRiseFallDoubleTrade = (durationTicks: number | string) => {
  if (!stake || stake <= 0) return alert("Enter a stake amount");
  if (!wsRef.current || wsRef.current.readyState !== WebSocket.OPEN) return alert("WebSocket not connected yet");
  if (!authorizedRef.current) return alert("Not authorized yet");

 const durationValue =
  typeof durationTicks === "string" && durationTicks.endsWith("s")
    ? durationTicks
    : Number(durationTicks);

placeTrade("Rise", durationValue);
placeTrade("Fall", durationValue);
};

  // Place one DIFFERS trade for symbol+digit and wait for buy-ack (safe for fast bursts)
  // ⚡ Instant parallel DIFFERS (no waiting)
// ⚡ Instant parallel DIFFERS (no waiting)
const placeDiffersInstant = async (
  symbol: Pair,
  digit: number,
  count: number,
  opts?: {
    durationTicks?: number;
    source?: Trade["source"];
    batchTotal?: number;
    batchStartIndex?: number; // default 1
  }
) => {
  if (!wsRef.current || wsRef.current.readyState !== WebSocket.OPEN) return;
  if (!authorizedRef.current) return;

  const durationTicks = opts?.durationTicks ?? mdTickDuration;
  const source = opts?.source ?? "MetroX";
  const startIndex = opts?.batchStartIndex ?? 1;

  for (let i = 0; i < count; i++) {
    const req_id = newReqId();

    const trade: Trade = {
      id: req_id,
      symbol,
      digit,
      type: "Differs",
      stake,
      durationTicks,          // ✅ FIX: store the real tick duration
      result: "Pending",
      createdAt: Date.now(),
      source, 
      batchIndex: opts?.batchTotal ? startIndex + i : undefined,
      batchTotal: opts?.batchTotal,                // ✅ FIX: label the trade source
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
      underlying_symbol: resolveLiveSymbol(symbol),
      duration: durationTicks,  // ✅ FIX: duration matches what's stored
      duration_unit: "t",
      barrier: String(digit),
      req_id,
    });

    // ⚡ CRITICAL: yield event loop so Deriv processes each proposal separately
    await new Promise((r) => setTimeout(r, 0));
  }
};
  const placeDiffersAndWaitBuyAck = async (
  symbol: Pair,
  digit: number,
  batch?: { index: number; total: number }
) => {
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
      batchIndex: batch?.index,
      batchTotal: batch?.total,
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
      underlying_symbol: resolveLiveSymbol(symbol),
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

  // ============================================================================
  // MetroX actions
  // ============================================================================

 const place3xSelectedDigit = async () => {
  if (instant3xRunning) return;
  if (selectedDigit === null) return alert("Select a digit first");
  if (!stake || stake <= 0) return alert("Enter a stake amount");

  setInstant3xRunning(true);

  // 🔁 Old behavior: Turbo only removes delay — does NOT change logic
  const gapMs = turboMode ? 0 : 50;

  try {
    await placeDiffersAndWaitBuyAck(selectedPair, selectedDigit, { index: 1, total: 3 });
if (gapMs) await sleep(gapMs);

await placeDiffersAndWaitBuyAck(selectedPair, selectedDigit, { index: 2, total: 3 });
if (gapMs) await sleep(gapMs);

await placeDiffersAndWaitBuyAck(selectedPair, selectedDigit, { index: 3, total: 3 });
  } catch (err) {
    alert(err instanceof Error ? err.message : "We couldn't process your trade.");
  } finally {
    setInstant3xRunning(false);
  }
};

// Metro auto loop
// Press Metro -> keeps scanning + trading until Stop Metro
const toggleMetroAuto = async () => {
  // STOP
  if (metroRunning) {
    metroCancelRef.current = true;
    setAnalysisStatus("Stopping Metro...");
    return;
  }

  // START checks
  if (!stake || stake <= 0) return alert("Enter a stake amount");
  if (!wsRef.current || wsRef.current.readyState !== WebSocket.OPEN) return alert("WebSocket not connected");
  if (!authorizedRef.current) return alert("Not authorized");

  metroCancelRef.current = false;
  setMetroRunning(true);

  if (metroLoopRef.current) return;
  metroLoopRef.current = true;

  // ================== TUNABLE RULES ==================
  const SAMPLE_N = 1000;          // main sample window (long)
  const RECENT_N = 120;           // recent window (short)
  const MIN_SAMPLE = 250;

  const MAX_MATCH_PCT = 5.3;      // long-window max
  const MAX_RECENT_PCT = 6.0;     // must ALSO be low recently (prevents stale edge)
  const MAX_LAST10_HITS = 1;      // digit must appear <= 1 time in last10
  const MAX_LAST20_HITS = 3;      // digit must appear <= 3 times in last20

  const COOLDOWN_MS = 30_000;
  const LOOP_DELAY_MS = 800;
  // ✅ MISSING CONSTANTS (fixes the TS errors)
const MAX_BAD_CYCLES = 10;     // how many "no signal" loops before backoff
const MAX_FAIL_TRADES = 5;     // how many failed placements before backoff


  // ================== STATE TRACKERS ==================
  let badCycles = 0;
  let failedTrades = 0;

  // helpers (local)
  const getLastN = (sym: Pair, n: number) => (pairDigitsRef.current[sym] ?? []).slice(-n);

  const freq10 = (list: number[]) => {
    const f = Array.from({ length: 10 }, () => 0);
    for (const x of list) f[x]++;
    return f;
  };

  const pctOfDigit = (list: number[], d: number) => {
    if (!list.length) return 100;
    let c = 0;
    for (const x of list) if (x === d) c++;
    return (c / list.length) * 100;
  };

  const pickLeastFrequentDigit = (list: number[]) => {
    const f = freq10(list);
    const n = list.length;
    let bestDigit = 0;
    let bestPct = Infinity;

    for (let d = 0; d <= 9; d++) {
      const p = n ? (f[d] / n) * 100 : 100;
      if (p < bestPct) {
        bestPct = p;
        bestDigit = d;
      }
    }

    return { digit: bestDigit, matchPct: bestPct, f, n };
  };

  const countHits = (list: number[], d: number) => {
    let c = 0;
    for (const x of list) if (x === d) c++;
    return c;
  };

  const estimatedDiffersWin = (matchPct: number) => Math.max(0, Math.min(100, 100 - matchPct));
  const decideDurationTicks = (pair: Pair) => (pair.startsWith("1HZ") ? 1 : 2);

  // ✅ Keep this — and now we will actually USE it.
  const hardDisconnect = () => {
    try {
      wsRef.current?.close();
    } catch {}
    wsRef.current = null;
    setConnected(false);
    setBalance(null);
    authorizedRef.current = false;
  };

  // basic “can trade” guard
  const ensureLive = () => {
    const ws = wsRef.current;
    return !!ws && ws.readyState === WebSocket.OPEN && authorizedRef.current;
  };

  try {
    setAnalysisStatus(
      "Metro started: scanning all pairs for STRONG + STABLE least-frequent digits..."
    );

    while (!metroCancelRef.current) {
      if (!ensureLive()) break;

      // find best candidate across all pairs
      let best:
        | null
        | {
            pair: Pair;
            digit: number;
            matchPctLong: number;
            matchPctRecent: number;
            last10Hits: number;
            last20Hits: number;
            score: number;
            estWin: number;
          } = null;

      for (const pair of PAIRS) {
        if (metroCancelRef.current) break;

        // cooldown per pair
        const lastAt = metroLastTradeAtRef.current[pair] ?? 0;
        if (Date.now() - lastAt < COOLDOWN_MS) continue;

        const longSample = getLastN(pair, SAMPLE_N);
        if (longSample.length < MIN_SAMPLE) continue;

        const recentSample = getLastN(pair, RECENT_N);
        const last10 = getLastN(pair, 10);
        const last20 = getLastN(pair, 20);

        const pickLong = pickLeastFrequentDigit(longSample);
        const d = pickLong.digit;

        const matchPctLong = pickLong.matchPct;
        const matchPctRecent = pctOfDigit(recentSample, d);

        // HARD filters (accuracy)
        if (matchPctLong > MAX_MATCH_PCT) continue;
        if (matchPctRecent > MAX_RECENT_PCT) continue;

        const last10Hits = countHits(last10, d);
        const last20Hits = countHits(last20, d);

        if (last10Hits > MAX_LAST10_HITS) continue;
        if (last20Hits > MAX_LAST20_HITS) continue;

        // score (bigger = better)
        // prefer: lower long pct, low recent pct, low recent hits
        const score =
          (MAX_MATCH_PCT - matchPctLong) * 2 +
          (MAX_RECENT_PCT - matchPctRecent) * 2 +
          (MAX_LAST20_HITS - last20Hits) * 1.2 +
          (MAX_LAST10_HITS - last10Hits) * 1.5;

        const estWin = estimatedDiffersWin(matchPctLong);

        if (!best || score > best.score) {
          best = {
            pair,
            digit: d,
            matchPctLong,
            matchPctRecent,
            last10Hits,
            last20Hits,
            score,
            estWin,
          };
        }
      }

      if (!best) {
        badCycles++;
        setAnalysisStatus(
          `Metro: no STRONG signals right now. (badCycles ${badCycles}/${MAX_BAD_CYCLES})`
        );

        // ✅ HARD DISCONNECT TRIGGER #1
        // If we keep failing to find any quality signal for too long, disconnect.
        if (badCycles >= MAX_BAD_CYCLES) {
  // ✅ Instead of disconnecting, just back off and keep scanning
  setAnalysisStatus("Metro: no stable edge right now. Skipping trades and waiting...");
  badCycles = 0;                 // reset so it doesn't spam this message forever
  await sleep(4000);             // longer cooldown when conditions are bad
  continue;                      // keep loop alive
}

        await sleep(LOOP_DELAY_MS);
        continue;
      }

      // reset bad cycles if we found a real candidate
      badCycles = 0;

      const durationTicks = decideDurationTicks(best.pair);

      setAnalysisStatus(
        `Metro: ${best.pair} • DIFFERS ${best.digit} • long ${best.matchPctLong.toFixed(
          2
        )}% • recent ${best.matchPctRecent.toFixed(2)}% • last10Hits ${best.last10Hits} • ${durationTicks}t`
      );

      // place trade (DIFFERS only) with source Metro
      try {
        await placeDiffersInstant(best.pair, best.digit, 1, {
          durationTicks,
          source: "Metro",
        });

        metroLastTradeAtRef.current[best.pair] = Date.now();
      } catch {
        failedTrades++;
        setAnalysisStatus(
          `Metro: trade failed (${failedTrades}/${MAX_FAIL_TRADES}).`
        );

        // ✅ HARD DISCONNECT TRIGGER #2
        // If trade placement is repeatedly failing, disconnect.
        if (failedTrades >= MAX_FAIL_TRADES) {
  // ✅ Instead of disconnecting, pause and keep trying later
  setAnalysisStatus("Metro: repeated trade failures. Skipping and retrying later...");
  failedTrades = 0;              // reset after a cool-off
  await sleep(5000);             // backoff to avoid hammering requests
  continue;
}
      }

      await sleep(LOOP_DELAY_MS);
    }
  } finally {
    metroLoopRef.current = false;
    metroCancelRef.current = false;
    setMetroRunning(false);

    // only show "stopped" if not disconnected by safety
    if (wsRef.current) setAnalysisStatus("Metro stopped.");
  }
};

  // ============================================================================
  // SpiderX / multi-pair automation actions
  // ============================================================================

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
    placeDiffersInstant(s.pair, s.lowestDigit, 1, {
  batchTotal: 5,
  batchStartIndex: placed + 1,
});
  } else {
    await placeDiffersAndWaitBuyAck(s.pair, s.lowestDigit, { index: placed + 1, total: 5 });
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
// Single-entry multi-pair automation

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
  if (activeStrategy === "evenodd" && !isStrategyEnabledForViewer("evenodd")) setActiveStrategy(null);
  if (activeStrategy === "risefall" && !isStrategyEnabledForViewer("risefall")) setActiveStrategy(null);
  if (activeStrategy === "mspider" && !isStrategyEnabledForViewer("mspider")) setActiveStrategy(null);
  // eslint-disable-next-line react-hooks/exhaustive-deps
}, [strategyFlags, isAdmin]);

  // remount MetroX panel when strategy changes
  useEffect(() => {
  if (!connected) return;
  if (activeStrategy !== "risefall") return;
  if (!selectedPair) return;

  if (selectedPair.startsWith("STPRNG")) {
    STEP_ONLY_PAIRS.forEach((pair) => {
      safeSend({ ticks: pair, subscribe: 1 });
    });
    setTicks(pairQuotesRef.current[selectedPair] ?? []);
  } else {
    safeSend({ ticks: resolveLiveSymbol(selectedPair), subscribe: 1 });
    setTicks(pairQuotesRef.current[selectedPair] ?? []);
  }
}, [activeStrategy, connected, selectedPair]);
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

          <nav className="hidden md:flex items-center gap-6 text-sm text-gray-300">
            <span className="text-green-400">● {connected ? "Connected" : "Disconnected"}</span>
            <button onClick={() => router.push("/")}>Home</button>

            {/* ✅ only show Admin button for admins */}
            {isAdmin && (
              <button onClick={() => router.push("/admin")} className="text-red-200 hover:text-red-300">
                Admin
              </button>
            )}

            <button>Analyzer</button>
            <button onClick={() => router.push("/dashboard/chart")}>MT5</button>
            <button onClick={logout} className="hover:text-red-400">
              Logout
            </button>
          </nav>
        </header>

        {/* PAGE HEADER */}
        <section className="mx-auto w-full max-w-[1800px] px-4 sm:px-6 lg:px-8 py-6">
          <div className="glass-panel p-6 flex justify-between items-center
  bg-gradient-to-r from-orange-500/30 via-orange-600/20 to-purple-700/20">
            <div>
              <h1 className="text-2xl font-extrabold tracking-tight">Trading Analyzer</h1>
              <p className="text-sm text-orange-100">Connect to Deriv and manage your trading activities</p>
            </div>

            {!connected ? (
  <div className="flex flex-wrap items-center gap-2">
    {!APP_ID && (
      <p className="w-full text-xs text-red-200">
        Deriv OAuth is not configured. Add NEXT_PUBLIC_DERIV_APP_ID to .env.local for local testing or to your deployment environment online.
      </p>
    )}
    {derivLoginStatus && (
      <p className="w-full text-xs text-orange-100/90">{derivLoginStatus}</p>
    )}
    {oauthAccounts.length === 0 ? (
      <button
        onClick={() => void loginWithDeriv()}
        disabled={!APP_ID}
        className="bg-orange-500 hover:bg-orange-600 disabled:cursor-not-allowed disabled:opacity-50 px-4 py-2 rounded-md text-sm font-semibold shadow-[0_0_0_1px_rgba(255,255,255,0.10)]"
      >
        Login with Deriv
      </button>
    ) : (
      <>
        <select
          className="bg-black/40 px-3 py-2 rounded-md border border-white/10 min-w-[220px]"
          value={selectedOAuthIndex}
          onChange={(e) => selectDerivOAuthAccount(Number(e.target.value))}
        >
          {oauthAccounts.map((account, index) => (
            <option key={account.accountId} value={index}>
              {account.accountId} • {account.currency}
            </option>
          ))}
        </select>

        <button
          onClick={connectDeriv}
          className="bg-indigo-500 hover:bg-indigo-600 px-4 py-2 rounded-md text-sm shadow-[0_0_0_1px_rgba(255,255,255,0.10)]"
        >
          Connect Selected Account
        </button>

        <button
          onClick={() => void loginWithDeriv()}
          disabled={!APP_ID}
          className="bg-black/40 hover:bg-black/60 disabled:cursor-not-allowed disabled:opacity-50 px-4 py-2 rounded-md text-sm border border-white/10"
        >
                    Switch / Refresh Deriv Accounts
        </button>
      </>
    )}
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
        <section className="mx-auto w-full max-w-[1800px] px-4 sm:px-6 lg:px-8 pb-8 grid grid-cols-1 lg:grid-cols-[0.9fr_1.25fr] gap-6">
          {/* LEFT */}
          <div className="space-y-6">
            <div className="bg-[#13233d]/80 backdrop-blur rounded-2xl p-6 border border-white/10 shadow-[0_0_0_1px_rgba(255,255,255,0.06)]">
              <h2 className="font-semibold mb-4 text-white/85 tracking-tight">Deriv API Connection</h2>

              <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-3 gap-4 text-sm">
                <div className="bg-black/30 rounded-xl p-4 border border-white/10">
                  <p className="text-white/55 text-xs uppercase tracking-wide">Account Status</p>
                  <p className="font-semibold text-green-400">{connected ? "Connected" : "Disconnected"}</p>
                </div>
                {/* ✅ Market / Timing Indicator */}


                <div className="bg-black/30 rounded-xl p-4 border border-white/10">
                  <p className="text-white/55 text-xs uppercase tracking-wide">Account Balance</p>
                  <p className="font-semibold text-lg">
                    {balance !== null ? `${balance.toFixed(2)} ${currency}` : "Loading..."}
                  </p>
                </div>

                <div className="bg-black/30 rounded-xl p-4 border border-white/10">
                  <p className="text-white/55 text-xs uppercase tracking-wide">
                    Session Profit/Loss
                  </p>
                  <p
                    className={`font-semibold text-lg ${
                      sessionNetProfit >= 0 ? "text-emerald-400" : "text-red-400"
                    }`}
                  >
                    {sessionNetProfit >= 0 ? "+" : ""}
                    {sessionNetProfit.toFixed(2)} {currency}
                  </p>
                </div>

                <div className="bg-black/30 rounded-xl p-4 border border-white/10 sm:col-span-2 xl:col-span-1">
                  <div className="flex items-center justify-between gap-3 mb-3">
                    <p className="text-white/55 text-xs uppercase tracking-wide">
                      Re-Invest Profits
                    </p>
                    <button
                      type="button"
                      onClick={() => setReinvestProfitsEnabled((prev) => !prev)}
                      className={`rounded-full px-3 py-1 text-xs font-semibold border transition ${
                        reinvestProfitsEnabled
                          ? "bg-emerald-500/20 text-emerald-300 border-emerald-400/40"
                          : "bg-white/5 text-white/70 border-white/10"
                      }`}
                    >
                      {reinvestProfitsEnabled ? "On" : "Off"}
                    </button>
                  </div>

                  <div className="grid grid-cols-4 gap-2">
                    {([25, 50, 75, 100] as const).map((value) => {
                      const active = reinvestThreshold === value;

                      return (
                        <button
                          key={value}
                          type="button"
                          onClick={() => setReinvestThreshold(value)}
                          className={`rounded-lg px-3 py-2 text-xs font-semibold border transition ${
                            active
                              ? "bg-indigo-500/20 text-indigo-200 border-indigo-400/40"
                              : "bg-white/5 text-white/70 border-white/10 hover:bg-white/10"
                          }`}
                        >
                          {value}%
                        </button>
                      );
                    })}
                  </div>

                  <p className="mt-2 text-[11px] text-white/45">
                  </p>
                </div>
              </div>
            </div>
            <div className="bg-[#13233d]/80 backdrop-blur rounded-2xl p-6 border border-white/10 shadow-[0_0_0_1px_rgba(255,255,255,0.06)]">
  <h2 className="font-semibold mb-4 text-white/85 tracking-tight">Market / Timing</h2>
  <MarketIndicator
  activeStrategy={activeStrategy}
  selectedPair={selectedPair}
  pairDigitsRef={pairDigitsRef}
  pairQuotesRef={pairQuotesRef}
/>
</div>
            <div className="bg-[#13233d]/80 backdrop-blur rounded-2xl p-6 border border-white/10 shadow-[0_0_0_1px_rgba(255,255,255,0.06)]">
              <h2 className="font-semibold mb-4 text-white/85 tracking-tight">Trading Strategies</h2>

              {/* ✅ show/hide based on admin flags (NEW) */}
              {isStrategyEnabledForViewer("matches") && (
  <StrategyRow
    title="MetroX"
    description="Matches/Differs strategy"
    active={activeStrategy === "matches"}
    onToggle={() => setActiveStrategy(activeStrategy === "matches" ? null : "matches")}
  />
)}

  {isStrategyEnabledForViewer("overunder") && (
  <StrategyRow
    title="SpiderX"
    description="Over/Under Strategy"
    active={activeStrategy === "overunder"}
    onToggle={() => setActiveStrategy(activeStrategy === "overunder" ? null : "overunder")}
  />
)}

  {isStrategyEnabledForViewer("evenodd") && (
  <StrategyRow
    title="Even/Odd"
    description="Even/Odd strategy with profit and loss limits"
    active={activeStrategy === "evenodd"}
    onToggle={() => setActiveStrategy(activeStrategy === "evenodd" ? null : "evenodd")}
  />
)}

  {isStrategyEnabledForViewer("risefall") && (
  <StrategyRow
    title="Rise/Fall"
    description="Rise/Fall Strategy"
    active={activeStrategy === "risefall"}
    onToggle={() => setActiveStrategy(activeStrategy === "risefall" ? null : "risefall")}
  />
)}

{isStrategyEnabledForViewer("mspider") && (
  <StrategyRow
    title="M-Spider"
    description="Higher/Lower strategy"
    active={activeStrategy === "mspider"}
    onToggle={() => setActiveStrategy(activeStrategy === "mspider" ? null : "mspider")}
  />
)}

            </div>
          </div>

          {/* RIGHT */}
          <div className="min-w-0 rounded-1xl p-0 border border-white/10 overflow-hidden shadow-[0_0_0_1px_rgba(255,255,255,0.06)]">
{activeStrategy === "matches" && isStrategyEnabledForViewer("matches") && (
  <MetroXPanel
    key={metroXResetKey}
    ticks={ticks}
    pipSize={pipSize}
    stake={stake}
    setStake={handleStakeChange}
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
    placeTradeFor={placeTradeFor}
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
    tradeHistoryPanel={
  <div className="mt-6">
    <StrategyTradeHistoryTab
      title="Trade History"
      trades={tradeHistory}
      currency={currency}
      onClearHistory={() => setTradeHistory([])}
    />
  </div>
}
    onClearHistory={() => setTradeHistory([])}
    currency={currency}
    run1xAutoAllPairs={run1xAutoAllPairs}
    auto1xRunning={auto1xRunning}
    onToggleFastAuto={toggleFastAutoTrading}
    fastAutoRunning={fastAutoRunning} 
    uiFlags={uiFlags}
    isAdmin={isAdmin}
    onToggleMetro={toggleMetroAuto}
    metroRunning={metroRunning}
  />
)}

            {activeStrategy === "overunder" && isStrategyEnabledForViewer("overunder") && (
  <div className="bg-[#13233d] p-6 flex flex-col min-h-[520px]">
   <SpiderXPanel
  pairs={METRO_SPIDER_PAIRS}
  indexGroups={INDEX_GROUPS}
  pairDigitsRef={pairDigitsRef}
  selectedPair={selectedPair}
  setStake={handleStakeChange}
  stake={stake}
  setSelectedPair={(p: Pair) => {
    resetPairNow(p);
    setSelectedPair(p);
  }}
  onPlaceTrade={(type: "Over" | "Under", duration?: number) => placeTrade(type, duration ?? 1)}
  tradeHistory={tradeHistory}
  tradeHistoryPanel={
  <StrategyTradeHistoryTab
    title="Trade History"
    trades={tradeHistory}
    currency={currency}
    onClearHistory={() => setTradeHistory([])}
  />
}
  currency={currency}
  onClearHistory={() => setTradeHistory([])}
  toggleSpiderRandomAuto={toggleSpiderRandomAuto}
  spiderRandomRunning={spiderRandomRunning}
  setSelectedDigit={setSelectedDigit}
  selectedDigit={selectedDigit}
  lastWinDigit={lastWinDigit}
  lastLossDigit={lastLossDigit}

  // ✅ ADD THESE TWO LINES (this fixes your error)
  uiFlags={uiFlags}
  isAdmin={isAdmin}
/>
<div className="mt-6">
  <StrategyTradeHistoryTab
    title="Trade History"
    trades={tradeHistory}
    currency={currency}
    onClearHistory={() => setTradeHistory([])}
  />
</div>
  </div>
)}
{activeStrategy === "evenodd" && isStrategyEnabledForViewer("evenodd") && (
  <div className="bg-[#13233d] flex min-h-[520px] flex-col">
    <EvenOddPanel
      indexGroups={INDEX_GROUPS}
      ticks={ticks}
      selectedPair={selectedPair}
      setSelectedPair={(p: Pair) => {
        resetPairNow(p);
        setSelectedPair(p);
      }}
      stake={stake}
      setStake={handleStakeChange}
      currency={currency}
      connected={connected}
      tradeHistory={tradeHistory}
      onPlaceTrade={(type: "Even" | "Odd", duration: number, tradeStake?: number) =>
        placeTrade(type, duration, tradeStake)
      }
      tradeHistoryPanel={
        <StrategyTradeHistoryTab
          title="Even/Odd Trade History"
          trades={tradeHistory.filter((trade) => trade.source === "Even/Odd")}
          currency={currency}
          onClearHistory={() =>
            setTradeHistory((previous) => previous.filter((trade) => trade.source !== "Even/Odd"))
          }
        />
      }
    />
  </div>
)}
{activeStrategy === "risefall" && isStrategyEnabledForViewer("risefall") && (
  <div className="bg-[#13233d] p-6 flex flex-col min-h-[520px]">
    <RiseFallPanel
  selectedPair={selectedPair}
  setSelectedPair={(p: Pair) => {
    resetPairNow(p);
    setSelectedPair(p);
  }}
  stake={stake}
  setStake={handleStakeChange}
  rfTickDuration={rfTickDuration}
  setRfTickDuration={setRfTickDuration}
  rfAllowEquals={rfAllowEquals}
  setRfAllowEquals={setRfAllowEquals}
  onPlaceTrade={(type: "Rise" | "Fall", duration: number | string) => placeTrade(type, duration)}
  onPlaceDoubleTrade={(duration: number | string) => placeRiseFallDoubleTrade(duration)}
  currency={currency}
  tradeHistory={tradeHistory}
  onClearHistory={() => setTradeHistory([])}
  pairQuotesRef={pairQuotesRef}
tradeHistoryPanel={
  <StrategyTradeHistoryTab
    title="Rise/Fall Trade History"
    trades={tradeHistory}
    currency={currency}
    onClearHistory={() => setTradeHistory([])}
  />
}
/>
  </div>
)}

{activeStrategy === "mspider" && isStrategyEnabledForViewer("mspider") && (
  <div className="bg-[#13233d] p-6 flex flex-col min-h-[520px]">
    <MSpiderPanel
      header="M-Spider"
      selectedPair={selectedPair}
      setSelectedPair={setSelectedPair}
      stake={stake}
      setStake={handleStakeChange}
      currency={currency}
      onPlaceHigherLowerTrade={placeHigherLowerTrade}
      requestHigherLowerPreview={requestHigherLowerPreview}
      tradeHistory={tradeHistory}
      tradeHistoryPanel={
  <StrategyTradeHistoryTab
    title="M-Spider Trade History"
    trades={tradeHistory}
    currency={currency}
    onClearHistory={() => setTradeHistory([])}
  />
}
      onClearHistory={() => setTradeHistory([])}
      pairQuotesRef={pairQuotesRef}
      barrierOptimizerLive={barrierOptimizerLive}
      setBarrierOptimizerLive={setBarrierOptimizerLive}
      barrierOptimizerWindow={barrierOptimizerWindow}
      setBarrierOptimizerWindow={setBarrierOptimizerWindow}
      barrierOptimizerRows={barrierOptimizerRows}
      setBarrierOptimizerOpen={setBarrierOptimizerOpen}
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

/* ================= Shared Strategy Trade History ================= */

function StrategyTradeHistoryTab({
  title,
  trades,
  currency,
  onClearHistory,
}: {
  title: string;
  trades: Trade[];
  currency: string;
  onClearHistory: () => void;
}) {
  const [filter, setFilter] = useState<"all" | "wins" | "losses">("all");

  const normalizedTrades = [...trades].sort((a, b) => b.createdAt - a.createdAt);
  const wins = normalizedTrades.filter((t) => t.result === "Win");
  const losses = normalizedTrades.filter((t) => t.result === "Loss");

  const filteredTrades =
    filter === "wins"
      ? wins
      : filter === "losses"
      ? losses
      : normalizedTrades;

  const totalProfit = normalizedTrades.reduce((sum, t) => {
    return sum + (typeof t.profit === "number" ? t.profit : 0);
  }, 0);

  const settledTrades = normalizedTrades.filter(
    (t) => t.result === "Win" || t.result === "Loss"
  );
  const winRate = settledTrades.length ? (wins.length / settledTrades.length) * 100 : 0;

  const getBadgeTone = (trade: Trade) => {
    if (trade.result === "Win") {
      return {
        card: "border-emerald-400/25 bg-[radial-gradient(circle_at_top,rgba(16,185,129,0.12),rgba(15,23,42,0.55)_55%,rgba(15,23,42,0.85))]",
        pill: "border-emerald-400/30 bg-emerald-500/12 text-emerald-300",
        pnl: "text-emerald-300",
        status: "text-emerald-300",
        iconWrap: "bg-emerald-500/12 text-emerald-300",
      };
    }

    if (trade.result === "Loss") {
      return {
        card: "border-rose-400/20 bg-[radial-gradient(circle_at_top,rgba(244,63,94,0.10),rgba(15,23,42,0.55)_55%,rgba(15,23,42,0.85))]",
        pill: "border-rose-400/30 bg-rose-500/12 text-rose-300",
        pnl: "text-rose-300",
        status: "text-rose-300",
        iconWrap: "bg-rose-500/12 text-rose-300",
      };
    }

    return {
      card: "border-cyan-400/20 bg-[radial-gradient(circle_at_top,rgba(34,211,238,0.10),rgba(15,23,42,0.55)_55%,rgba(15,23,42,0.85))]",
      pill: "border-amber-400/30 bg-amber-500/12 text-amber-300",
      pnl: "text-amber-300",
      status: "text-amber-300",
      iconWrap: "bg-cyan-500/12 text-cyan-300",
    };
  };

  const formatAmount = (n?: number) => {
    if (typeof n !== "number" || Number.isNaN(n)) return `0.00 ${currency}`;
    return `${n.toFixed(2)} ${currency}`;
  };

  const getDerivedPayout = (trade: Trade) => {
    if (typeof (trade as Trade & { payout?: number }).payout === "number") {
      return (trade as Trade & { payout?: number }).payout as number;
    }
    if (typeof trade.profit === "number") {
      return trade.stake + trade.profit;
    }
    return trade.stake;
  };

  return (
    <div className="mt-6 rounded-[30px] border border-cyan-500/25 bg-[radial-gradient(circle_at_top,rgba(34,211,238,0.10),rgba(15,23,42,0.75)_45%,rgba(15,23,42,0.95))] p-6 shadow-[0_0_0_1px_rgba(34,211,238,0.08)]">
      <div className="flex items-start justify-between gap-4">
        <div className="flex items-center gap-4">
          <div className="flex h-14 w-14 items-center justify-center rounded-2xl border border-cyan-400/35 bg-cyan-500/12 text-2xl text-cyan-300">
            🏆
          </div>
          <div>
            <h3 className="text-[2rem] font-bold tracking-tight text-cyan-300">Trade History</h3>
            <p className="mt-1 text-sm text-white/45">{title}</p>
          </div>
        </div>

        <button
          type="button"
          onClick={onClearHistory}
          className="flex h-14 w-14 items-center justify-center rounded-2xl border border-rose-400/30 bg-rose-500/10 text-2xl text-rose-300 transition hover:bg-rose-500/15"
          aria-label="Clear history"
        >
          🗑️
        </button>
      </div>

      <div className="mt-8 grid grid-cols-1 gap-5 md:grid-cols-2">
        <div className="rounded-[24px] border border-white/10 bg-[radial-gradient(circle_at_center,rgba(16,185,129,0.10),rgba(15,23,42,0.90)_65%)] p-6">
          <div className="text-[1.15rem] text-white/80">⚡ Net Profit/Loss</div>
          <div
            className={`mt-5 text-[3rem] font-bold leading-none ${
              totalProfit >= 0 ? "text-emerald-300" : "text-rose-300"
            }`}
          >
            {totalProfit >= 0 ? "+" : ""}
            {totalProfit.toFixed(2)} {currency}
          </div>
        </div>

        <div className="rounded-[24px] border border-white/10 bg-[radial-gradient(circle_at_center,rgba(59,130,246,0.12),rgba(15,23,42,0.90)_65%)] p-6">
          <div className="text-[1.15rem] text-white/80">◎ Win Rate</div>
          <div className="mt-5 flex items-end gap-3">
            <div className="text-[3rem] font-bold leading-none text-sky-300">
              {winRate.toFixed(1)}%
            </div>
            <div className="pb-1 text-[1.1rem] text-white/70">
              ({wins.length}/{settledTrades.length || 0})
            </div>
          </div>
        </div>
      </div>

      <div className="mt-8 grid grid-cols-1 gap-4 md:grid-cols-3">
        <button
          type="button"
          onClick={() => setFilter("all")}
          className={`rounded-[20px] border px-6 py-5 text-left text-[1.15rem] font-semibold transition ${
            filter === "all"
              ? "border-sky-400/45 bg-sky-500/18 text-cyan-200 shadow-[0_0_0_1px_rgba(56,189,248,0.25)]"
              : "border-white/10 bg-white/5 text-white/75"
          }`}
        >
          🏆 All Trades ({normalizedTrades.length})
        </button>

        <button
          type="button"
          onClick={() => setFilter("wins")}
          className={`rounded-[20px] border px-6 py-5 text-left text-[1.15rem] font-semibold transition ${
            filter === "wins"
              ? "border-emerald-400/45 bg-emerald-500/14 text-emerald-200 shadow-[0_0_0_1px_rgba(52,211,153,0.18)]"
              : "border-white/10 bg-white/5 text-white/75"
          }`}
        >
          ✓ Wins ({wins.length})
        </button>

        <button
          type="button"
          onClick={() => setFilter("losses")}
          className={`rounded-[20px] border px-6 py-5 text-left text-[1.15rem] font-semibold transition ${
            filter === "losses"
              ? "border-rose-400/45 bg-rose-500/14 text-rose-200 shadow-[0_0_0_1px_rgba(251,113,133,0.18)]"
              : "border-white/10 bg-white/5 text-white/75"
          }`}
        >
          ⊗ Losses ({losses.length})
        </button>
      </div>

      <div className="mt-8 max-h-[720px] overflow-y-auto pr-2 space-y-5">
        {filteredTrades.length === 0 ? (
          <div className="rounded-[24px] border border-white/10 bg-slate-900/35 px-6 py-12 text-center text-white/50">
            No trades found for this filter.
          </div>
        ) : (
          filteredTrades.slice(0, 20).map((trade) => {
            const tones = getBadgeTone(trade);
            const payout = getDerivedPayout(trade);
            const entryLabel =
              trade.type === "Matches" ||
              trade.type === "Differs" ||
              trade.type === "Over" ||
              trade.type === "Under"
                ? `${trade.type.toUpperCase()} ${trade.digit}`
                : trade.type.toUpperCase();

            return (
              <div
                key={trade.id}
                className={`rounded-[26px] border p-6 shadow-[0_0_0_1px_rgba(255,255,255,0.03)] ${tones.card}`}
              >
                <div className="flex flex-col gap-5 lg:flex-row lg:items-start lg:justify-between">
                  <div className="min-w-0">
                    <div className="flex flex-wrap items-center gap-3">
                      <div
                        className={`flex h-12 w-12 items-center justify-center rounded-2xl ${tones.iconWrap}`}
                      >
                        ↗
                      </div>
                      <div className="text-[2rem] font-bold leading-none text-white">
                        {trade.symbol}
                      </div>
                      <span
                        className={`rounded-full border px-4 py-1.5 text-sm font-bold uppercase tracking-wide ${tones.pill}`}
                      >
                        {trade.result === "Pending" ? "Pending" : trade.result}
                      </span>
                    </div>

                    <div className="mt-4 flex flex-wrap items-center gap-3 text-[1.1rem]">
                      <span className="font-semibold text-cyan-300">{trade.source ?? title}</span>
                      <span className="rounded-full border border-sky-400/30 bg-sky-500/12 px-4 py-1 text-sky-300">
                        {trade.durationTicks} ticks
                      </span>
                      <span className="rounded-lg border border-violet-400/30 bg-violet-500/12 px-4 py-1 text-violet-300">
                        {entryLabel}
                      </span>
                    </div>
                  </div>

                  <div className="text-left lg:text-right">
                    <div className={`text-[2.2rem] font-bold ${tones.pnl}`}>
                      {typeof trade.profit === "number"
                        ? `${trade.profit >= 0 ? "+" : ""}${trade.profit.toFixed(2)} ${currency}`
                        : "—"}
                    </div>
                    <div className="mt-2 text-[1.15rem] text-white/70">
                      Stake:{" "}
                      <span className="font-semibold text-white/85">
                        {formatAmount(trade.stake)}
                      </span>
                    </div>
                    <div className="mt-1 text-[1.15rem] text-white/45">
                      Payout:{" "}
                      <span className="font-semibold text-white/65">
                        {formatAmount(payout)}
                      </span>
                    </div>
                  </div>
                </div>

                <div className="mt-5 border-t border-white/10 pt-5">
                  <div className="grid grid-cols-1 gap-y-4 text-[1.1rem] md:grid-cols-[160px_1fr] md:gap-x-6">
                    <div className="text-white/75">Time</div>
                    <div className="text-white/85 md:text-right">
                      {new Date(trade.createdAt).toLocaleString()}
                    </div>

                    <div className="text-white/75">Entry</div>
                    <div className="md:text-right">
                      <span className="inline-flex rounded-lg border border-violet-400/30 bg-violet-500/12 px-4 py-2 font-semibold tracking-wide text-violet-300">
                        {entryLabel}
                      </span>
                    </div>

                    <div className="text-white/75">Exit Digit</div>
                    <div className="md:text-right">
                      <span className="inline-flex min-w-[48px] items-center justify-center rounded-lg border border-emerald-400/25 bg-emerald-500/12 px-4 py-2 text-[1.8rem] font-bold text-emerald-300">
                        {typeof trade.settlementDigit === "number" ? trade.settlementDigit : "—"}
                      </span>
                    </div>

                    <div className="text-white/75">Payout</div>
                    <div className="font-semibold text-white/85 md:text-right">
                      {formatAmount(payout)}
                    </div>
                  </div>
                </div>

                <div className="mt-5 border-t border-white/10 pt-5 flex items-center justify-between gap-4">
                  <div className="text-white/75">Status</div>
                  <div className={`text-[1.15rem] font-semibold ${tones.status}`}>
                    {trade.result === "Win"
                      ? "◌ Completed - Won"
                      : trade.result === "Loss"
                      ? "◌ Completed - Lost"
                      : "◌ Pending"}
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

  // Index label (nice names like screenshot)
  const getIndexLabel = (sym: Pair) => {
    const vol = INDEX_GROUPS.volatility.find((x) => x.code === sym)?.label;
    const jump = INDEX_GROUPS.jump.find((x) => x.code === sym)?.label;
    const step = INDEX_GROUPS.Step.find((x) => x.code === sym)?.label;
    return vol || jump || step || sym;
  };

  const pillForResult = (r: TradeResult) => {
    if (r === "Win") return "bg-emerald-500/15 border-emerald-400/25 text-emerald-200";
    if (r === "Loss") return "bg-red-500/15 border-red-400/25 text-red-200";
    return "bg-yellow-500/15 border-yellow-400/25 text-yellow-200";
  };

  // This is what will show as “button / strategy used”
  // Uses your existing data (t.source + t.type) with a clean label.
  const getActionLabel = (t: Trade) => {
  // ✅ if source exists, just show it (covers SpiderX Auto, SpiderX, MetroX, Edshell)
  if (t.source) return t.source;

  // fallback for older trades without source
  if (t.type === "Differs") return "Fast DIFFERS";
  if (t.type === "Matches") return "MATCHES";
  if (t.type === "Over") return "OVER";
  if (t.type === "Under") return "UNDER";
  if (t.type === "Even") return "EVEN";
  if (t.type === "Odd") return "ODD";

  return "MetroX";
};

  const TabBtn = ({
    active,
    onClick,
    children,
  }: {
    active: boolean;
    onClick: () => void;
    children: React.ReactNode;
  }) => (
    <button
      onClick={onClick}
      className={`flex-1 rounded-xl px-3 py-2 text-xs font-semibold border transition
        ${
          active
            ? "bg-cyan-500/15 border-cyan-400/25 text-cyan-100"
            : "bg-white/[0.04] border-white/10 text-white/65 hover:bg-white/[0.07]"
        }`}
    >
      {children}
    </button>
  );

  return (
    <div className="mt-6 rounded-2xl border border-white/10 bg-gradient-to-br from-[#0f1b2d]/90 to-[#0b1220]/90 p-4 shadow-[0_20px_80px_rgba(0,0,0,0.45)]">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <div className="h-10 w-10 rounded-2xl bg-cyan-500/10 border border-cyan-400/20 flex items-center justify-center">
            <span className="text-cyan-200">⏳</span>
          </div>
          <div>
            <p className="text-sm font-semibold text-cyan-100">Trade History</p>
            <p className="text-[11px] text-white/45">Entry • Exit • Payout • Strategy</p>
          </div>
        </div>

        <button
          onClick={onClear}
          title="Clear trade history"
          className="h-10 w-10 rounded-2xl bg-red-500/10 border border-red-400/20 text-red-200 hover:bg-red-500/20 transition"
        >
          🗑
        </button>
      </div>

      {/* Stats row */}
      <div className="mt-4 grid grid-cols-2 gap-3">
        <div className="rounded-2xl border border-white/10 bg-white/[0.04] p-4">
          <p className="text-[11px] text-white/55">Net Profit/Loss</p>
          <p className={`mt-2 text-2xl font-extrabold ${netProfit >= 0 ? "text-emerald-300" : "text-red-300"}`}>
            {netProfit >= 0 ? "+" : ""}
            {netProfit.toFixed(2)} <span className="text-white/60">{currency}</span>
          </p>
        </div>

        <div className="rounded-2xl border border-white/10 bg-white/[0.04] p-4">
          <p className="text-[11px] text-white/55">Win Rate</p>
          <p className="mt-2 text-2xl font-extrabold text-sky-300">
            {winRate.toFixed(1)}%{" "}
            <span className="text-xs text-white/50 font-semibold">
              ({wins}/{done || 0})
            </span>
          </p>
        </div>
      </div>

      {/* Tabs */}
      <div className="mt-4 grid grid-cols-3 gap-2">
        <TabBtn active={tab === "all"} onClick={() => setTab("all")}>
          All Trades ({tradeHistory.length})
        </TabBtn>
        <TabBtn active={tab === "wins"} onClick={() => setTab("wins")}>
          Wins ({wins})
        </TabBtn>
        <TabBtn active={tab === "losses"} onClick={() => setTab("losses")}>
          Losses ({losses})
        </TabBtn>
      </div>

      {/* List */}
      <div className="mt-4 max-h-[720px] overflow-y-auto space-y-3 pr-2">
        {filtered.length === 0 ? (
          <div className="rounded-2xl border border-white/10 bg-white/[0.04] p-4 text-sm text-white/60">
            No trades in this tab.
          </div>
        ) : (
          filtered.map((t, idx) => {
            const profitVal = Number(t.profit ?? 0);

            const profitText =
              t.result === "Pending"
                ? ""
                : `${profitVal >= 0 ? "+" : ""}${profitVal.toFixed(2)} ${currency}`;

            const statusLabel =
              t.result === "Pending"
                ? "Pending"
                : t.result === "Win"
                ? "Completed - Won"
                : "Completed - Lost";

            const actionLabel = getActionLabel(t);

            return (
              <div
                key={idx}
                className="rounded-2xl border border-white/10 bg-white/[0.04] p-4 shadow-[0_0_0_1px_rgba(255,255,255,0.02)]"
              >
                {/* Top Row (index + result + profit like screenshot) */}
                <div className="flex items-start justify-between gap-3">
                  <div className="flex items-start gap-3">
                    <div className="h-10 w-10 rounded-2xl bg-emerald-500/10 border border-emerald-400/15 flex items-center justify-center">
                      <span className="text-emerald-200">📈</span>
                    </div>

                    <div>
                      <div className="flex items-center gap-2">
                        <p className="text-sm font-extrabold text-white/90">{t.symbol}</p>

                        <span className={`text-[10px] px-2 py-0.5 rounded-full border ${pillForResult(t.result)}`}>
                          {t.result === "Win" ? "WON" : t.result === "Loss" ? "LOST" : "PENDING"}
                        </span>
                        {t.batchIndex && t.batchTotal && (
  <span className="text-[10px] px-2 py-0.5 rounded-full border border-white/10 bg-black/20 text-white/70">
    {t.batchIndex}/{t.batchTotal}
  </span>
)}
                      </div>

                      <p className="mt-1 text-[11px] text-white/55 font-semibold">
                        {getIndexLabel(t.symbol)}
                      </p>

                      {/* Strategy / button used */}
                      <div className="mt-2 inline-flex items-center gap-2">
                        <span className="text-[10px] px-2 py-0.5 rounded-full border border-white/10 bg-black/20 text-white/70">
                          {actionLabel}
                        </span>

                        <span className="text-[10px] px-2 py-0.5 rounded-full border border-purple-400/20 bg-purple-500/10 text-purple-200">
                          {t.type.toUpperCase()}
                        </span>
                      </div>
                    </div>
                  </div>

                  <div className="text-right">
                    <p
                      className={`text-sm font-extrabold ${
                        t.result === "Win"
                          ? "text-emerald-300"
                          : t.result === "Loss"
                          ? "text-red-300"
                          : "text-white/60"
                      }`}
                    >
                      {profitText || "—"}
                    </p>
                    <p className="mt-1 text-[11px] text-white/55">
                      Stake: {t.stake.toFixed(2)} {currency}
                    </p>
                    <p className="text-[11px] text-white/55">
                      Payout: {typeof t.payout === "number" ? `${t.payout.toFixed(2)} ${currency}` : "—"}
                    </p>
                  </div>
                </div>

                {/* Middle Row (Entry / Exit / Payout like screenshot) */}
                <div className="mt-4 grid grid-cols-3 gap-2">
                  <div className="rounded-xl border border-white/10 bg-black/15 px-3 py-2">
                    <p className="text-[10px] uppercase tracking-wide text-white/45">Entry</p>
                    <div className="mt-1 flex items-center justify-between">
                      <span className="text-xs text-white/70">Digit</span>
                      <span className="text-xs font-extrabold text-white/90">
                        {t.digit}
                      </span>
                    </div>
                  </div>

                  <div className="rounded-xl border border-white/10 bg-black/15 px-3 py-2">
                    <p className="text-[10px] uppercase tracking-wide text-white/45">Exit</p>
                    <div className="mt-1 flex items-center justify-between">
                      <span className="text-xs text-white/70">Digit</span>
                      <span className="text-xs font-extrabold text-white/90">
                        {typeof t.settlementDigit === "number" ? t.settlementDigit : "—"}
                      </span>
                    </div>
                  </div>

                  <div className="rounded-xl border border-white/10 bg-black/15 px-3 py-2">
                    <p className="text-[10px] uppercase tracking-wide text-white/45">Payout</p>
                    <div className="mt-1 flex items-center justify-between">
                      <span className="text-xs text-white/70">{t.type.toUpperCase()}</span>
                      <span className="text-xs font-extrabold text-white/90">
                        {typeof t.payout === "number" ? t.payout.toFixed(2) : "—"}{" "}
                        <span className="text-white/60">{currency}</span>
                      </span>
                    </div>
                  </div>
                </div>

                {/* Bottom row (Status) */}
                <div className="mt-3 flex items-center justify-between rounded-xl border border-white/10 bg-black/10 px-3 py-2">
                  <div className="text-[11px] text-white/55">Status</div>
                  <div
                    className={`text-[11px] font-semibold ${
                      t.result === "Win"
                        ? "text-emerald-300"
                        : t.result === "Loss"
                        ? "text-red-300"
                        : "text-yellow-300"
                    }`}
                  >
                    {statusLabel}
                  </div>
                </div>

                {/* Time (optional – screenshot doesn’t emphasize it, but you still keep it) */}
                <div className="mt-2 text-[10px] text-white/40">
                  {formatTime(t.createdAt)}
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

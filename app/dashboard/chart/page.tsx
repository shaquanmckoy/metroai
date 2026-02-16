"use client";

import React, { useEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { INDEX_GROUPS, PAIRS, type Pair } from "../page";

const APP_ID = 1089;

type MarketBias = "BUY" | "SELL" | "WAIT";
type MarketStructure = "Uptrend" | "Downtrend" | "Range" | "Unclear";

type Candle = {
  t: number; // open time (epoch seconds, bucketed)
  o: number;
  h: number;
  l: number;
  c: number;
};

type ChartMode = "line" | "candles";

const TIMEFRAMES: Array<{ label: string; sec: number }> = [
  { label: "1 minute", sec: 60 },
  { label: "2 minutes", sec: 120 },
  { label: "3 minutes", sec: 180 },
  { label: "5 minutes", sec: 300 },
  { label: "10 minutes", sec: 600 },
  { label: "15 minutes", sec: 900 },
  { label: "30 minutes", sec: 1800 },
  { label: "1 hour", sec: 3600 },
  { label: "2 hours", sec: 7200 },
  { label: "4 hours", sec: 14400 },
  { label: "8 hours", sec: 28800 },
  { label: "24 hours", sec: 86400 },
];

function clamp(n: number, a: number, b: number) {
  return Math.max(a, Math.min(b, n));
}

function formatIndexLabel(sym: Pair) {
  const vol = INDEX_GROUPS.volatility.find((x) => x.code === sym)?.label;
  const jump = INDEX_GROUPS.jump.find((x) => x.code === sym)?.label;
  return vol || jump || sym;
}

/** =========================
 *  Indicators (fast + "partial" so TP/SL doesn't wait forever)
 *  ========================= */
function smaPartial(arr: number[], n: number) {
  if (arr.length === 0) return null;
  const k = Math.min(n, arr.length);
  let s = 0;
  for (let i = arr.length - k; i < arr.length; i++) s += arr[i];
  return s / k;
}

function avgAbsDeltaPartial(arr: number[], n: number) {
  if (arr.length < 2) return null;
  const maxPairs = arr.length - 1;
  const k = Math.min(n, maxPairs);
  let s = 0;
  for (let i = arr.length - k; i < arr.length; i++) {
    s += Math.abs(arr[i] - arr[i - 1]);
  }
  return s / k;
}

function humanHold(tfSec: number, candles: number) {
  const total = tfSec * candles;
  if (total < 3600) return `~${Math.round(total / 60)} min`;
  if (total < 86400) return `~${(total / 3600).toFixed(1)} hr`;
  return `~${(total / 86400).toFixed(1)} day`;
}

/** =========================
 *  Candle builder from ticks
 *  ========================= */
function floorToTf(epochSec: number, tfSec: number) {
  return Math.floor(epochSec / tfSec) * tfSec;
}

function pushTickIntoCandles(prev: Candle[], epochSec: number, price: number, tfSec: number): Candle[] {
  const bucket = floorToTf(epochSec, tfSec);
  const last = prev[prev.length - 1];

  // New candle
  if (!last || last.t !== bucket) {
    const c: Candle = { t: bucket, o: price, h: price, l: price, c: price };
    const next = [...prev, c];
    return next.length > 360 ? next.slice(-360) : next;
  }

  // Update current candle
  const updated: Candle = {
    ...last,
    h: Math.max(last.h, price),
    l: Math.min(last.l, price),
    c: price,
  };

  return prev.slice(0, -1).concat(updated);
}

/** =========================
 *  Pan + Zoom (Deriv-like feel)
 *  - wheel: zoom in/out
 *  - drag: pan left/right
 *  - "Live": snap back to the latest data and keep following
 *  ========================= */
function usePanZoom(length: number, defaultSpan = 120) {
  const [span, setSpan] = useState(() => clamp(defaultSpan, 20, Math.max(20, length)));
  const [offset, setOffset] = useState(0);
  const [followLive, setFollowLive] = useState(true);

  const dragRef = useRef<{
    dragging: boolean;
    startX: number;
    startOffset: number;
    width: number;
  }>({ dragging: false, startX: 0, startOffset: 0, width: 1 });

  // keep view valid when length changes
  useEffect(() => {
    const maxSpan = Math.max(20, length);
    setSpan((s) => clamp(s, 20, maxSpan));

    setOffset((o) => {
      const s = clamp(span, 20, maxSpan);
      const maxOffset = Math.max(0, length - s);
      if (followLive) return maxOffset;
      return clamp(o, 0, maxOffset);
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [length]);

  // if live-follow is on, keep snapping to right edge
  useEffect(() => {
    if (!followLive) return;
    const maxOffset = Math.max(0, length - span);
    setOffset(maxOffset);
  }, [followLive, length, span]);

  const zoomBy = (factor: number, focusRatio = 0.5) => {
    setFollowLive(false);
    setSpan((oldSpan) => {
      const maxSpan = Math.max(20, length);
      const newSpan = clamp(Math.round(oldSpan * factor), 20, maxSpan);
      // re-center around focus
      setOffset((oldOffset) => {
        const focusIndex = oldOffset + focusRatio * oldSpan;
        const newOffset = Math.round(focusIndex - focusRatio * newSpan);
        const maxOffset = Math.max(0, length - newSpan);
        return clamp(newOffset, 0, maxOffset);
      });
      return newSpan;
    });
  };

  const onWheel = (e: React.WheelEvent, containerWidth: number) => {
    if (length <= 0) return;
    e.preventDefault();
    setFollowLive(false);

    const rectX = (e.nativeEvent as WheelEvent).offsetX ?? containerWidth / 2;
    const ratio = containerWidth > 0 ? clamp(rectX / containerWidth, 0, 1) : 0.5;

    const zoomIn = e.deltaY < 0;
    const factor = zoomIn ? 0.88 : 1.14;
    zoomBy(factor, ratio);
  };

  const onPointerDown = (e: React.PointerEvent, containerWidth: number) => {
    (e.currentTarget as HTMLElement).setPointerCapture?.(e.pointerId);
    dragRef.current.dragging = true;
    dragRef.current.startX = e.clientX;
    dragRef.current.startOffset = offset;
    dragRef.current.width = Math.max(1, containerWidth);
    setFollowLive(false);
  };

  const onPointerMove = (e: React.PointerEvent) => {
    if (!dragRef.current.dragging) return;
    const dx = e.clientX - dragRef.current.startX;
    const w = dragRef.current.width;
    const dIndex = (dx / w) * span;
    const nextOffset = Math.round(dragRef.current.startOffset - dIndex);
    const maxOffset = Math.max(0, length - span);
    setOffset(clamp(nextOffset, 0, maxOffset));
  };

  const onPointerUp = () => {
    dragRef.current.dragging = false;
  };

  const snapLive = () => setFollowLive(true);

  return {
    span,
    offset,
    followLive,
    setFollowLive,
    setSpan,
    setOffset,
    onWheel,
    onPointerDown,
    onPointerMove,
    onPointerUp,
    zoomIn: () => zoomBy(0.88, 0.5),
    zoomOut: () => zoomBy(1.14, 0.5),
    snapLive,
  };
}

/** =========================
 *  Line chart (SVG) + pan/zoom
 *  ========================= */
function LineChart({
  data,
  view,
  height = 320,
}: {
  data: number[];
  view: { offset: number; span: number };
  height?: number;
}) {
  const width = 1000;
  const viewBox = `0 0 ${width} ${height}`;

  const slice = data.slice(view.offset, view.offset + view.span);

  if (slice.length < 2) {
    return (
      <div className="h-[320px] flex items-center justify-center text-white/60 border border-white/10 rounded-xl bg-black/20">
        Waiting for ticks…
      </div>
    );
  }

  const min = Math.min(...slice);
  const max = Math.max(...slice);
  const range = max - min || 1;

  const points = slice
    .map((v, i) => {
      const x = (i / (slice.length - 1)) * width;
      const y = height - ((v - min) / range) * (height - 18) - 9;
      return `${x.toFixed(1)},${y.toFixed(1)}`;
    })
    .join(" ");

  const last = slice[slice.length - 1];

  return (
    <div className="border border-white/10 rounded-xl bg-black/20 overflow-hidden">
      <div className="px-4 py-3 border-b border-white/10 flex items-center justify-between">
        <div className="text-sm text-white/70">Live Price (Line)</div>
        <div className="text-sm font-semibold text-emerald-300">{last.toFixed(5)}</div>
      </div>

      <svg viewBox={viewBox} className="w-full h-[320px] block select-none">
        <polyline fill="none" stroke="currentColor" strokeWidth="2.2" className="text-sky-300" points={points} />
      </svg>

      <div className="px-4 py-3 border-t border-white/10 text-[11px] text-white/55">
        min {min.toFixed(5)} • max {max.toFixed(5)} • points {slice.length}
      </div>
    </div>
  );
}

/** =========================
 *  Candle chart (SVG) + pan/zoom
 *  ========================= */
function CandleChart({
  candles,
  view,
  height = 320,
  highlightTime,
}: {
  candles: Candle[];
  view: { offset: number; span: number };
  height?: number;
  highlightTime: number | null; // candle.t to highlight
}) {
  const width = 1000;
  const viewBox = `0 0 ${width} ${height}`;

  const slice = candles.slice(view.offset, view.offset + view.span);

  if (slice.length < 5) {
    return (
      <div className="h-[320px] flex items-center justify-center text-white/60 border border-white/10 rounded-xl bg-black/20">
        Building candles… (need a few)
      </div>
    );
  }

  const lows = slice.map((c) => c.l);
  const highs = slice.map((c) => c.h);
  const min = Math.min(...lows);
  const max = Math.max(...highs);
  const range = max - min || 1;

  const padX = 10;
  const innerW = width - padX * 2;
  const candleW = innerW / slice.length;
  const bodyW = Math.max(2, candleW * 0.55);

  const yOf = (p: number) => height - ((p - min) / range) * (height - 22) - 11;

  const last = slice[slice.length - 1];

  return (
    <div className="border border-white/10 rounded-xl bg-black/20 overflow-hidden">
      <div className="px-4 py-3 border-b border-white/10 flex items-center justify-between">
        <div className="text-sm text-white/70">Live Price (Candles)</div>
        <div className="text-sm font-semibold text-emerald-300">{last.c.toFixed(5)}</div>
      </div>

      <svg viewBox={viewBox} className="w-full h-[320px] block select-none">
        {slice.map((c, i) => {
          const x = padX + i * candleW + candleW / 2;
          const openY = yOf(c.o);
          const closeY = yOf(c.c);
          const highY = yOf(c.h);
          const lowY = yOf(c.l);

          const up = c.c >= c.o;
          const top = Math.min(openY, closeY);
          const bottom = Math.max(openY, closeY);
          const bodyH = Math.max(2, bottom - top);

          const isHL = highlightTime != null && c.t === highlightTime;

          return (
            <g key={c.t}>
              {/* wick */}
              <line
                x1={x}
                x2={x}
                y1={highY}
                y2={lowY}
                stroke="currentColor"
                className={up ? "text-emerald-300/70" : "text-red-300/70"}
                strokeWidth={1.4}
              />

              {/* body */}
              <rect
                x={x - bodyW / 2}
                y={top}
                width={bodyW}
                height={bodyH}
                rx={1.2}
                fill="currentColor"
                className={up ? "text-emerald-400/80" : "text-red-400/80"}
              />

              {/* highlight */}
              {isHL && (
                <rect
                  x={x - candleW / 2}
                  y={6}
                  width={candleW}
                  height={height - 12}
                  fill="none"
                  stroke="currentColor"
                  className="text-yellow-300/85"
                  strokeWidth={2}
                  rx={6}
                />
              )}
            </g>
          );
        })}
      </svg>

      <div className="px-4 py-3 border-t border-white/10 text-[11px] text-white/55">
        min {min.toFixed(5)} • max {max.toFixed(5)} • candles {slice.length}
      </div>
    </div>
  );
}

/** =========================
 *  Market Structure + Regular + Sniper + fast TP/SL
 *  - TP/SL and bias populate early (partial indicators)
 *  - Sniper waits for fewer candles than before
 *  ========================= */
function buildRecommendationFromCandles(candles: Candle[], tfSec: number) {
  const closes = candles.map((c) => c.c);
  const last = closes.at(-1) ?? null;

  const fast = smaPartial(closes, 14);
  const slow = smaPartial(closes, 40);

  const vol = avgAbsDeltaPartial(closes, 20); // partial => shows earlier
  const v = vol ?? 0;

  // slope (partial)
  const slope = (() => {
    if (closes.length < 8) return null;
    const look = Math.min(20, closes.length - 1);
    return closes[closes.length - 1] - closes[closes.length - 1 - look];
  })();

  // structure
  let structure: MarketStructure = "Unclear";
  if (fast != null && slow != null && slope != null && closes.length >= 10) {
    if (fast > slow && slope > 0) structure = "Uptrend";
    else if (fast < slow && slope < 0) structure = "Downtrend";
    else structure = "Range";
  } else if (closes.length >= 6) {
    // fallback: micro structure
    const a = closes[closes.length - 6];
    const b = closes[closes.length - 1];
    if (b > a) structure = "Uptrend";
    else if (b < a) structure = "Downtrend";
    else structure = "Range";
  }

  let bias: MarketBias = "WAIT";
  if (structure === "Uptrend") bias = "BUY";
  if (structure === "Downtrend") bias = "SELL";
  if (structure === "Range") bias = "WAIT";

  // regular entry (always available once we have some candles)
  const lookback = candles.slice(-30);
  const hi = lookback.length ? Math.max(...lookback.map((c) => c.h)) : null;
  const lo = lookback.length ? Math.min(...lookback.map((c) => c.l)) : null;

  const buffer = v > 0 ? v * 2.0 : last != null ? Math.abs(last) * 0.00002 : 0;

  let regularText = "Collecting candles for a regular entry plan…";
  if (last != null && hi != null && lo != null) {
    if (structure === "Uptrend") {
      regularText =
        `Regular entry: BUY on (1) break above ${(hi + buffer).toFixed(5)} ` +
        `or (2) pullback hold above ${(fast ?? last).toFixed(5)} with a bullish close.`;
    } else if (structure === "Downtrend") {
      regularText =
        `Regular entry: SELL on (1) break below ${(lo - buffer).toFixed(5)} ` +
        `or (2) rally rejection near ${(fast ?? last).toFixed(5)} with a bearish close.`;
    } else if (structure === "Range") {
      regularText =
        `Regular entry: Range plan — BUY near ${(lo + buffer).toFixed(5)} and SELL near ${(hi - buffer).toFixed(5)} ` +
        `(only with tight stops + clear rejection).`;
    } else {
      regularText = "Regular entry: WAIT — structure unclear. Let fast/slow separate and price make a clean break.";
    }
  }

  // sniper entry (lighter requirements than before)
  let sniperText = "Sniper entry: waiting for a clean reversal candle…";
  let entryCandleTime: number | null = null;

  const holdCandles = tfSec >= 3600 ? 2 : tfSec >= 900 ? 3 : 4;
  const holdText = `Hold suggestion: ${humanHold(tfSec, holdCandles)} (≈ ${holdCandles} candle(s)).`;

  if (candles.length >= 18 && last != null && fast != null && vol != null) {
    const i = candles.length - 1;
    const cur = candles[i];
    const prev = candles[i - 1];

    const nearFast = Math.abs(cur.c - fast) <= Math.max(v * 2.5, Math.abs(fast) * 0.00002);

    const bullish = cur.c > cur.o;
    const bearish = cur.c < cur.o;

    // simple engulf / strong reversal
    const bullishEngulf = bullish && prev.c < prev.o && cur.o <= prev.c && cur.c >= prev.o;
    const bearishEngulf = bearish && prev.c > prev.o && cur.o >= prev.c && cur.c <= prev.o;

    if (structure === "Uptrend") {
      if (nearFast && bullishEngulf) {
        sniperText = "Sniper entry: Pullback into fast SMA + bullish engulf → BUY signal.";
        entryCandleTime = cur.t;
      } else {
        sniperText = "Sniper entry: Wait for pullback into fast SMA, then a strong bullish reversal (engulf / strong close).";
      }
    } else if (structure === "Downtrend") {
      if (nearFast && bearishEngulf) {
        sniperText = "Sniper entry: Rally into fast SMA + bearish engulf → SELL signal.";
        entryCandleTime = cur.t;
      } else {
        sniperText = "Sniper entry: Wait for rally into fast SMA, then a strong bearish reversal (engulf / strong close).";
      }
    } else if (structure === "Range") {
      sniperText =
        "Sniper entry (Range): Only take extremes — look for a rejection/engulf candle at the range edge (tight stop).";
    } else {
      sniperText = "Sniper entry: WAIT — structure unclear. Need cleaner trend or a defined range.";
    }
  }

  let enterOn = "Candle entry: waiting for confirmation.";
  if (entryCandleTime != null) {
    enterOn = "Candle entry: Enter on highlighted candle CLOSE (safer) or next candle OPEN (more aggressive).";
  }

  // TP/SL (populate early; partial vol)
  let tp: number | null = null;
  let sl: number | null = null;

  if (last != null) {
    const baseVol = vol ?? (closes.length >= 2 ? Math.abs(closes[closes.length - 1] - closes[closes.length - 2]) : 0);
    const safeVol = Math.max(baseVol, Math.abs(last) * 0.000005); // avoid zero
    const risk = clamp(safeVol * 6, safeVol * 2, safeVol * 16);
    const reward = risk * 1.5;

    if (bias === "BUY") {
      sl = last - risk;
      tp = last + reward;
    } else if (bias === "SELL") {
      sl = last + risk;
      tp = last - reward;
    } else {
      // range/unclear: still show guidance around last
      sl = last - risk;
      tp = last + reward;
    }
  }

  return {
    last,
    structure,
    bias,
    fast,
    slow,
    vol,
    tp,
    sl,
    regularText,
    sniperText,
    holdText,
    enterOn,
    entryCandleTime,
  };
}

export default function ChartDashboardPage() {
  const router = useRouter();

  const [token, setToken] = useState("");
  const [connected, setConnected] = useState(false);

  const [selectedPair, setSelectedPair] = useState<Pair>(PAIRS[0]);
  const [chartMode, setChartMode] = useState<ChartMode>("candles");
  const [tfSec, setTfSec] = useState<number>(60);

  const [prices, setPrices] = useState<number[]>([]);
  const [candles, setCandles] = useState<Candle[]>([]);

  const wsRef = useRef<WebSocket | null>(null);

  // chart interaction container refs
  const chartBoxRef = useRef<HTMLDivElement | null>(null);

  // Pan/zoom views (keep separate so switching candles/line DOES NOT reset analysis)
  const lineView = usePanZoom(prices.length, 200);
  const candleView = usePanZoom(candles.length, 140);

  // Load saved token (shared with main dashboard + can be reused by MT5 dashboard too)
  useEffect(() => {
    const t = localStorage.getItem("deriv_token") || "";
    setToken(t);
  }, []);

  const connect = () => {
    const t = token || localStorage.getItem("deriv_token") || "";
    if (!t) return alert("Enter your Deriv API token on the main dashboard first.");

    localStorage.setItem("deriv_token", t);
    setToken(t);

    try {
      wsRef.current?.close();
    } catch {}
    wsRef.current = null;

    // IMPORTANT: don’t reset analysis on chartMode change.
    // We only reset when switching symbol or timeframe.
    setPrices([]);
    setCandles([]);
    setConnected(false);

    const ws = new WebSocket(`wss://ws.derivws.com/websockets/v3?app_id=${APP_ID}`);
    wsRef.current = ws;

    ws.onopen = () => {
      ws.send(JSON.stringify({ authorize: t }));
    };

    ws.onmessage = (e) => {
      const data = JSON.parse(e.data);

      if (data?.error?.message) {
        alert(data.error.message);
        return;
      }

      if (data.msg_type === "authorize") {
        setConnected(true);
        ws.send(JSON.stringify({ ticks: selectedPair, subscribe: 1 }));
      }

      if (data.msg_type === "tick" && data.tick?.quote !== undefined) {
        const sym = data.tick.symbol as Pair;
        if (sym !== selectedPair) return;

        const q = Number(data.tick.quote);
        const epochSec = Number(data.tick.epoch);

        if (!Number.isFinite(q) || !Number.isFinite(epochSec)) return;

        // line data
        setPrices((prev) => {
          const next = [...prev, q];
          return next.length > 1400 ? next.slice(-1400) : next;
        });

        // candle data
        setCandles((prev) => pushTickIntoCandles(prev, epochSec, q, tfSec));
      }
    };

    ws.onclose = () => setConnected(false);
    ws.onerror = () => alert("Chart connection failed");
  };

  const disconnect = () => {
    try {
      wsRef.current?.close();
    } catch {}
    wsRef.current = null;
    setConnected(false);
  };

  // When switching index/timeframe while connected, resubscribe/reset
  useEffect(() => {
    if (!connected) return;
    const ws = wsRef.current;
    if (!ws || ws.readyState !== WebSocket.OPEN) return;

    setPrices([]);
    setCandles([]);
    lineView.setFollowLive(true);
    candleView.setFollowLive(true);

    ws.send(JSON.stringify({ forget_all: "ticks" }));
    ws.send(JSON.stringify({ ticks: selectedPair, subscribe: 1 }));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedPair, tfSec, connected]);

  // Analysis always runs from candles (so switching chartMode doesn't restart analysis)
  const rec = useMemo(() => buildRecommendationFromCandles(candles, tfSec), [candles, tfSec]);

  const activeView = chartMode === "line" ? lineView : candleView;

  const getChartWidth = () => chartBoxRef.current?.clientWidth ?? 900;

  return (
    <main className="min-h-screen relative overflow-hidden text-white">
      <div className="pointer-events-none absolute inset-0 bg-gradient-to-br from-[#070c16] via-[#070c16] to-black" />

      <div className="relative">
        {/* Top bar */}
        <header className="h-16 bg-[#0f1b2d]/70 backdrop-blur-md flex items-center justify-between px-6 border-b border-white/10">
          <div className="flex items-center gap-3">
            <img
              src="/metroai-logo.png"
              alt="MetroAI Logo"
              className="w-10 h-9 rounded-md object-contain bg-white/5 p-1 border border-white/10"
            />
            <div>
              <p className="font-bold leading-tight">Chart Strategy</p>
              <p className="text-xs text-gray-400">Live Deriv Index Chart</p>
            </div>
          </div>

          <div className="flex items-center gap-3 text-sm text-gray-300">
            <span className="text-green-400">● {connected ? "Connected" : "Disconnected"}</span>
            <button onClick={() => router.push("/dashboard")} className="hover:text-white">
              Back
            </button>
          </div>
        </header>

        <section className="mx-auto w-full max-w-7xl px-4 sm:px-6 lg:px-8 py-6 space-y-6">
          {/* Connection */}
          <div className="rounded-2xl border border-white/10 bg-[#13233d]/80 backdrop-blur p-5">
            <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-3">
              <div>
                <p className="font-semibold text-white/85">Deriv Chart Connection</p>
                <p className="text-xs text-white/55">
                  Uses the same token saved from the main dashboard (also reusable on your MT5 dashboard if it reads{" "}
                  <span className="text-white/80 font-semibold">localStorage.deriv_token</span>).
                </p>
              </div>

              {!connected ? (
                <div className="flex gap-2 w-full md:w-auto">
                  <input
                    type="password"
                    placeholder="Deriv API Token"
                    value={token}
                    onChange={(e) => {
                      const v = e.target.value;
                      setToken(v);
                      localStorage.setItem("deriv_token", v); // sync for other dashboards
                    }}
                    className="flex-1 md:w-[320px] bg-black/40 px-3 py-2 rounded-md border border-white/10"
                  />
                  <button onClick={connect} className="bg-indigo-500 px-4 py-2 rounded-md text-sm">
                    Connect
                  </button>
                </div>
              ) : (
                <button onClick={disconnect} className="bg-red-500 hover:bg-red-600 px-4 py-2 rounded-md text-sm">
                  Disconnect
                </button>
              )}
            </div>
          </div>

          {/* Controls + Chart */}
          <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
            {/* Left: controls & recommendation */}
            <div className="space-y-6">
              {/* Index */}
              <div className="rounded-2xl border border-white/10 bg-[#13233d]/80 backdrop-blur p-5">
                <p className="text-sm font-semibold text-white/85 mb-3">Index</p>

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
                  <optgroup label="Jump / Bull / Bear">
                    {INDEX_GROUPS.jump.map((s) => (
                      <option key={s.code} value={s.code}>
                        {s.label}
                      </option>
                    ))}
                  </optgroup>
                </select>

                <div className="mt-3 text-xs text-white/55">
                  Current: <span className="text-white/80 font-semibold">{formatIndexLabel(selectedPair)}</span>
                </div>
              </div>

              {/* Chart controls */}
              <div className="rounded-2xl border border-white/10 bg-[#13233d]/80 backdrop-blur p-5">
                <p className="text-sm font-semibold text-white/85 mb-3">Chart</p>

                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <p className="text-[11px] text-white/60 mb-1">Type</p>
                    <select
                      className="w-full bg-[#0e1422] border border-white/10 p-2 rounded-md text-sm"
                      value={chartMode}
                      onChange={(e) => setChartMode(e.target.value as ChartMode)}
                    >
                      <option value="candles">Candles</option>
                      <option value="line">Line</option>
                    </select>
                  </div>

                  <div>
                    <p className="text-[11px] text-white/60 mb-1">Timeframe</p>
                    <select
                      className="w-full bg-[#0e1422] border border-white/10 p-2 rounded-md text-sm"
                      value={tfSec}
                      onChange={(e) => setTfSec(Number(e.target.value))}
                    >
                      {TIMEFRAMES.map((t) => (
                        <option key={t.sec} value={t.sec}>
                          {t.label}
                        </option>
                      ))}
                    </select>
                  </div>
                </div>

                <div className="mt-3 flex items-center gap-2">
                  <button
                    onClick={activeView.zoomIn}
                    className="px-3 py-1.5 rounded-md text-xs bg-black/25 border border-white/10 hover:bg-black/35"
                  >
                    +
                  </button>
                  <button
                    onClick={activeView.zoomOut}
                    className="px-3 py-1.5 rounded-md text-xs bg-black/25 border border-white/10 hover:bg-black/35"
                  >
                    −
                  </button>
                  <button
                    onClick={activeView.snapLive}
                    className={`px-3 py-1.5 rounded-md text-xs border ${
                      activeView.followLive
                        ? "bg-emerald-500/20 border-emerald-400/30 text-emerald-200"
                        : "bg-black/25 border-white/10 hover:bg-black/35 text-white/80"
                    }`}
                  >
                    Live
                  </button>
                  <div className="ml-auto text-[11px] text-white/55">
                    Wheel = zoom • Drag = pan
                  </div>
                </div>

                <p className="mt-3 text-[11px] text-white/50">
                  Switching Candles/Line does <span className="text-white/70 font-semibold">not</span> reset analysis.
                  Switching timeframe resets the candle aggregation.
                </p>
              </div>

              {/* Market structure + entries + TP/SL */}
              <div className="rounded-2xl border border-white/10 bg-[#13233d]/80 backdrop-blur p-5">
                <p className="text-sm font-semibold text-white/85 mb-2">Market Structure</p>

                <div className="flex items-center justify-between">
                  <span className="text-xs text-white/55">Structure</span>
                  <span className="text-sm font-bold text-sky-300">{rec.structure}</span>
                </div>

                <div className="flex items-center justify-between mt-2">
                  <span className="text-xs text-white/55">Bias</span>
                  <span
                    className={`text-sm font-extrabold ${
                      rec.bias === "BUY"
                        ? "text-emerald-300"
                        : rec.bias === "SELL"
                        ? "text-red-300"
                        : "text-yellow-200"
                    }`}
                  >
                    {rec.bias}
                  </span>
                </div>

                {/* Regular entry */}
                <div className="mt-4 rounded-xl bg-black/20 border border-white/10 p-4">
                  <p className="text-xs text-white/60 font-semibold">✅ Regular Entry</p>
                  <p className="mt-2 text-xs text-white/75 whitespace-pre-line">{rec.regularText}</p>
                </div>

                {/* Sniper entry */}
                <div className="mt-3 rounded-xl bg-black/20 border border-white/10 p-4">
                  <p className="text-xs text-white/60 font-semibold">🎯 Sniper Entry</p>
                  <p className="mt-2 text-xs text-white/75 whitespace-pre-line">{rec.sniperText}</p>

                  <div className="mt-3 text-[11px] text-white/60">
                    <div>🕒 {rec.holdText}</div>
                    <div className="mt-1">🟡 {rec.enterOn}</div>
                  </div>

                  {rec.entryCandleTime != null && (
                    <div className="mt-3 text-xs font-semibold text-yellow-200">
                      ✅ Entry candle detected — highlighted on the candles chart
                    </div>
                  )}
                </div>

                {/* TP/SL quick */}
                <div className="mt-4 grid grid-cols-2 gap-3">
                  <div className="rounded-xl bg-black/20 border border-white/10 p-3">
                    <p className="text-[11px] text-white/55">Take Profit (guide)</p>
                    <p className="mt-1 text-sm font-semibold text-white/85">
                      {rec.tp != null ? rec.tp.toFixed(5) : "—"}
                    </p>
                  </div>
                  <div className="rounded-xl bg-black/20 border border-white/10 p-3">
                    <p className="text-[11px] text-white/55">Stop Loss (guide)</p>
                    <p className="mt-1 text-sm font-semibold text-white/85">
                      {rec.sl != null ? rec.sl.toFixed(5) : "—"}
                    </p>
                  </div>
                </div>

                <div className="mt-3 text-[11px] text-white/45">
                  Note: Rules-based guidance (not financial advice). Always backtest + use risk control.
                </div>
              </div>
            </div>

            {/* Right: chart */}
            <div className="lg:col-span-2 rounded-2xl border border-white/10 bg-[#13233d]/80 backdrop-blur p-5">
              <div className="flex items-center justify-between mb-3">
                <p className="text-sm font-semibold text-white/85">Live Chart</p>
                <p className="text-xs text-white/55">
                  {formatIndexLabel(selectedPair)} • {TIMEFRAMES.find((t) => t.sec === tfSec)?.label}
                </p>
              </div>

              {/* Interaction layer */}
              <div
                ref={chartBoxRef}
                className="rounded-xl"
                onWheel={(e) => activeView.onWheel(e, getChartWidth())}
                onPointerDown={(e) => activeView.onPointerDown(e, getChartWidth())}
                onPointerMove={activeView.onPointerMove}
                onPointerUp={activeView.onPointerUp}
                onPointerCancel={activeView.onPointerUp}
                style={{ touchAction: "none" }}
              >
                {chartMode === "line" ? (
                  <LineChart data={prices} view={{ offset: lineView.offset, span: lineView.span }} />
                ) : (
                  <CandleChart
                    candles={candles}
                    view={{ offset: candleView.offset, span: candleView.span }}
                    highlightTime={rec.entryCandleTime}
                  />
                )}
              </div>

              <div className="mt-4 grid grid-cols-2 md:grid-cols-4 gap-3 text-xs">
                <div className="rounded-xl bg-black/20 border border-white/10 p-3">
                  <p className="text-white/55">SMA(14)</p>
                  <p className="mt-1 text-white/85 font-semibold">{rec.fast != null ? rec.fast.toFixed(5) : "—"}</p>
                </div>
                <div className="rounded-xl bg-black/20 border border-white/10 p-3">
                  <p className="text-white/55">SMA(40)</p>
                  <p className="mt-1 text-white/85 font-semibold">{rec.slow != null ? rec.slow.toFixed(5) : "—"}</p>
                </div>
                <div className="rounded-xl bg-black/20 border border-white/10 p-3">
                  <p className="text-white/55">Volatility</p>
                  <p className="mt-1 text-white/85 font-semibold">
                    {rec.vol != null ? rec.vol.toExponential(2) : "—"}
                  </p>
                </div>
                <div className="rounded-xl bg-black/20 border border-white/10 p-3">
                  <p className="text-white/55">{chartMode === "candles" ? "Candles" : "Ticks"}</p>
                  <p className="mt-1 text-white/85 font-semibold">
                    {chartMode === "candles" ? candles.length : prices.length}
                  </p>
                </div>
              </div>
            </div>
          </div>
        </section>
      </div>
    </main>
  );
}
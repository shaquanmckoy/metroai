"use client";

import React, { useEffect, useMemo, useRef, useState } from "react";
import type { Pair } from "@/app/dashboard/page";
import type { Trade, BarrierOptimizerWindow, BarrierOptimizerRow } from "@/components/dashboard/strategy-types";
import { RISE_FALL_PAIRS } from "@/components/dashboard/strategy-constants";

function formatOptimizerBarrier(value: number) {
  const abs = Math.abs(value).toFixed(2);
  return `${value >= 0 ? "+" : "-"}${abs}`;
}

export default function MSpiderPanel({
  header,
  selectedPair,
  setSelectedPair,
  stake,
  setStake,
  currency,
  onPlaceHigherLowerTrade,
  requestHigherLowerPreview,
  tradeHistory,
  tradeHistoryPanel,
  onClearHistory,
  pairQuotesRef,
  barrierOptimizerLive,
  setBarrierOptimizerLive,
  barrierOptimizerWindow,
  setBarrierOptimizerWindow,
  barrierOptimizerRows,
  setBarrierOptimizerOpen,
}: {
  barrierOptimizerLive: boolean;
  setBarrierOptimizerLive: React.Dispatch<React.SetStateAction<boolean>>;
  barrierOptimizerWindow: BarrierOptimizerWindow;
  setBarrierOptimizerWindow: React.Dispatch<React.SetStateAction<BarrierOptimizerWindow>>;
  barrierOptimizerRows: BarrierOptimizerRow[];
  setBarrierOptimizerOpen: React.Dispatch<React.SetStateAction<boolean>>;
  header: string;
  selectedPair: Pair;
  setSelectedPair: (p: Pair) => void;
  stake: number;
  setStake: React.Dispatch<React.SetStateAction<number>>;
  currency: string;
  onPlaceHigherLowerTrade: (args: {
  direction: "Higher" | "Lower";
  durationValue: string;
  barrier: string;
  customStake?: number;
}) => void;
requestHigherLowerPreview: (args: {
  direction: "Higher" | "Lower";
  durationValue: string;
  barrier: string;
  customStake: number;
}) => Promise<{ payout: number; profit: number }>;
  tradeHistory: Trade[];
  tradeHistoryPanel: React.ReactNode;
  onClearHistory: () => void;
  pairQuotesRef: React.MutableRefObject<Record<Pair, number[]>>;
}) {
  const quotes = pairQuotesRef.current[selectedPair] ?? [];
  const latestQuote = quotes.length ? quotes[quotes.length - 1] : 0;

  const [duration, setDuration] = useState<string>("5");
  const [lowerStake, setLowerStake] = useState<number>(stake);
  const [autoTradingEnabled, setAutoTradingEnabled] = useState(false);
  const [autoTradeMinConfidence, setAutoTradeMinConfidence] = useState<number>(60);
  const [autoTradeMode, setAutoTradeMode] = useState<"both" | "higher" | "lower">("both");
  const [autoTradeNow, setAutoTradeNow] = useState(() => Date.now());
  const autoTradeLastAtRef = useRef<number>(0);
  const requestPreviewRef = useRef(requestHigherLowerPreview);
  const previewLastFetchedAtRef = useRef<number>(0);
  const [barrierMode, setBarrierMode] = useState<"offset" | "absolute">("offset");
  const [halfBarrier, setHalfBarrier] = useState(false);
  const [barrierAutoUpdate, setBarrierAutoUpdate] = useState(false);
  const [higherBarrier, setHigherBarrier] = useState<string>("+0.12");
  const [lowerBarrier, setLowerBarrier] = useState<string>("-0.12");
  const [selectedTradeAction, setSelectedTradeAction] = useState<"higher" | "lower" | "both" | null>(null);
  const selectedTradeActionTimeoutRef = useRef<number | null>(null);
  const previousHalfBarrierRef = useRef(halfBarrier);
  const selectedOptimizerRow = useMemo(
    () => barrierOptimizerRows.find((row) => row.pair === selectedPair),
    [barrierOptimizerRows, selectedPair],
  );

  const durationOptions = [
    
    { value: "5", label: "5 Ticks" },
    { value: "15s", label: "15 Seconds" },
    { value: "30s", label: "30 Seconds" },
    { value: "1m", label: "1 Minute" },
    { value: "2m", label: "2 Minutes" },
    { value: "5m", label: "5 Minutes" },
    { value: "10m", label: "10 Minutes" },
    { value: "15m", label: "15 Minutes" },
    { value: "30m", label: "30 Minutes" },
    { value: "1h", label: "1 Hour" },
  ];

  const offsetBasePresets = [0.5, 0.25, 0.12, 0.05, -0.05, -0.12, -0.25, -0.5];
  const pip = Math.max(2, latestQuote ? String(latestQuote).split(".")[1]?.length ?? 2 : 2);

  const normalizeOffset = (value: number) => {
    const decimals = halfBarrier ? 3 : 2;
    const rounded = Number(value.toFixed(decimals));
    return rounded === 0 ? 0 : rounded;
  };

  const formatOffset = (value: number) => {
    const normalized = normalizeOffset(value);
    const abs = Math.abs(normalized).toFixed(2);
    const sign = normalized >= 0 ? "+" : "-";
    return `${sign}${abs}`;
  };

  const parseOffsetValue = (value: string) => {
    const n = Number.parseFloat(value);
    return Number.isFinite(n) ? normalizeOffset(n) : 0.12;
  };

  const offsetPresets = useMemo(
    () => offsetBasePresets.map((v) => normalizeOffset(v)),
    []
  );

  const absolutePresets = useMemo(() => {
    if (!latestQuote) return [] as number[];
    return offsetPresets
      .map((v) => Number((latestQuote + v).toFixed(pip)))
      .sort((a, b) => a - b);
  }, [latestQuote, offsetPresets, pip]);

  const higherDisplay = useMemo(() => {
    if (barrierMode === "offset") return higherBarrier;
    const n = Number.parseFloat(higherBarrier);
    return Number.isFinite(n) ? n.toFixed(pip) : latestQuote.toFixed(pip);
  }, [barrierMode, higherBarrier, latestQuote, pip]);

  const lowerDisplay = useMemo(() => {
    if (barrierMode === "offset") return lowerBarrier;
    const n = Number.parseFloat(lowerBarrier);
    return Number.isFinite(n) ? n.toFixed(pip) : latestQuote.toFixed(pip);
  }, [barrierMode, lowerBarrier, latestQuote, pip]);

  const getBaseBarrierOffset = () => 0.12;
  const getManualHalfOffsetValue = (value: number) => value / 2;
  const getBalancedOptimizerBarrierValue = () => {
    if (!selectedOptimizerRow) return getBaseBarrierOffset();
    return Number(
      ((Math.abs(selectedOptimizerRow.higherBarrier) + Math.abs(selectedOptimizerRow.lowerBarrier)) / 2).toFixed(2),
    );
  };
  const getEffectiveBarrierOffset = () => {
    const base = getBalancedOptimizerBarrierValue();
    return halfBarrier ? base / 2 : base;
  };
  const getDefaultHigherOffset = () => formatOffset(getEffectiveBarrierOffset());
  const getDefaultLowerOffset = () => formatOffset(-getEffectiveBarrierOffset());
  useEffect(() => {
    if (!barrierAutoUpdate) return;

    const offset = getEffectiveBarrierOffset();

    if (barrierMode === "offset") {
      setHigherBarrier(formatOffset(offset));
      setLowerBarrier(formatOffset(-offset));
      return;
    }

    if (!latestQuote) return;

    setHigherBarrier(Number((latestQuote + offset).toFixed(pip)).toFixed(pip));
    setLowerBarrier(Number((latestQuote - offset).toFixed(pip)).toFixed(pip));
  }, [barrierAutoUpdate, barrierMode, latestQuote, pip, halfBarrier, selectedPair, selectedOptimizerRow]);

  useEffect(() => {
    if (barrierAutoUpdate) {
      previousHalfBarrierRef.current = halfBarrier;
      return;
    }

    const halfBarrierChanged = previousHalfBarrierRef.current !== halfBarrier;
    previousHalfBarrierRef.current = halfBarrier;

    if (!halfBarrierChanged) return;

    if (barrierMode === "offset") {
      setHigherBarrier((prev) => {
        const current = Number.parseFloat(prev);
        if (!Number.isFinite(current)) return getDefaultHigherOffset();
        const next = halfBarrier ? getManualHalfOffsetValue(Math.abs(current)) : Math.abs(current) * 2;
        return formatOffset(next);
      });

      setLowerBarrier((prev) => {
        const current = Number.parseFloat(prev);
        if (!Number.isFinite(current)) return getDefaultLowerOffset();
        const next = halfBarrier ? getManualHalfOffsetValue(Math.abs(current)) : Math.abs(current) * 2;
        return formatOffset(-next);
      });
      return;
    }

    if (!latestQuote) return;

    setHigherBarrier((prev) => {
      const current = Number.parseFloat(prev);
      if (!Number.isFinite(current)) {
        return Number((latestQuote + getEffectiveBarrierOffset()).toFixed(pip)).toFixed(pip);
      }
      const distance = Math.abs(current - latestQuote);
      const nextDistance = halfBarrier ? distance / 2 : distance * 2;
      return Number((latestQuote + nextDistance).toFixed(pip)).toFixed(pip);
    });

    setLowerBarrier((prev) => {
      const current = Number.parseFloat(prev);
      if (!Number.isFinite(current)) {
        return Number((latestQuote - getEffectiveBarrierOffset()).toFixed(pip)).toFixed(pip);
      }
      const distance = Math.abs(current - latestQuote);
      const nextDistance = halfBarrier ? distance / 2 : distance * 2;
      return Number((latestQuote - nextDistance).toFixed(pip)).toFixed(pip);
    });
  }, [halfBarrier, barrierAutoUpdate, barrierMode, latestQuote, pip]);

  const changeOffsetBarrier = (
    current: string,
    setValue: React.Dispatch<React.SetStateAction<string>>,
    direction: -1 | 1
  ) => {
    const currentOffset = parseOffsetValue(current);
    const options = [...offsetPresets].sort((a, b) => a - b);

    let idx = options.findIndex((v) => Math.abs(v - currentOffset) < 0.0001);

    if (idx === -1) {
      idx = options.findIndex((v) => v >= currentOffset);
      if (idx === -1) idx = options.length - 1;
    }

    const nextIdx = Math.max(0, Math.min(options.length - 1, idx + direction));
    setValue(formatOffset(options[nextIdx]));
  };

  const barrierChips =
    barrierMode === "offset"
      ? offsetPresets.map((v) => ({
          key: `offset-${v}`,
          label: formatOffset(v),
          value: formatOffset(v),
        }))
      : absolutePresets.map((v) => ({
          key: `absolute-${v}`,
          label: v.toFixed(pip),
          value: v.toFixed(pip),
        }));
        const chartQuotes = quotes.slice(-30);
const anchorQuote = chartQuotes.length > 0 ? chartQuotes[0] : latestQuote;

const higherBarrierValue =
  barrierMode === "offset"
    ? Number((latestQuote + parseOffsetValue(higherBarrier)).toFixed(pip))
    : Number.parseFloat(higherBarrier || String(latestQuote || 0));

const lowerBarrierValue =
  barrierMode === "offset"
    ? Number((latestQuote + parseOffsetValue(lowerBarrier)).toFixed(pip))
    : Number.parseFloat(lowerBarrier || String(latestQuote || 0));

const recentMoves =
  chartQuotes.length > 1
    ? chartQuotes.slice(1).map((q, i) => ({
        key: `${i}-${q}`,
        dir: q >= chartQuotes[i] ? "H" : "L",
      }))
    : [];

const higherCount = recentMoves.filter((m) => m.dir === "H").length;
const lowerCount = recentMoves.filter((m) => m.dir === "L").length;
const totalMoves = recentMoves.length || 1;
const higherPct = (higherCount / totalMoves) * 100;
const lowerPct = (lowerCount / totalMoves) * 100;

const prediction = lowerPct > higherPct ? "LOWER" : "HIGHER";
const [higherPreview, setHigherPreview] = useState<{ payout: number; profit: number }>({
  payout: 0,
  profit: 0,
});
const [lowerPreview, setLowerPreview] = useState<{ payout: number; profit: number }>({
  payout: 0,
  profit: 0,
});

const combinedStake = Number((stake + lowerStake).toFixed(2));
const selectedDurationLabel =
  durationOptions.find((opt) => opt.value === duration)?.label ?? `${duration} Ticks`;
const higherPayout = Number(higherPreview.payout.toFixed(2));
const lowerPayout = Number(lowerPreview.payout.toFixed(2));
const higherProfit = Number(higherPreview.profit.toFixed(2));
const lowerProfit = Number(lowerPreview.profit.toFixed(2));
const combinedPayout = Number((higherPayout + lowerPayout).toFixed(2));
const confidence = Math.max(higherPct, lowerPct);
const autoTradeCooldownMs = 30_000;
const autoTradeCooldownRemainingMs = Math.max(
  0,
  autoTradeCooldownMs - (autoTradeNow - autoTradeLastAtRef.current)
);
const autoTradeCooldownSeconds = Math.ceil(autoTradeCooldownRemainingMs / 1000);
const autoTradeCoolingDown = autoTradingEnabled && autoTradeLastAtRef.current > 0 && autoTradeCooldownRemainingMs > 0;
const flashSelectedTradeAction = (action: "higher" | "lower" | "both") => {
  setSelectedTradeAction(action);

  if (selectedTradeActionTimeoutRef.current) {
    window.clearTimeout(selectedTradeActionTimeoutRef.current);
  }

  selectedTradeActionTimeoutRef.current = window.setTimeout(() => {
    setSelectedTradeAction(null);
    selectedTradeActionTimeoutRef.current = null;
  }, 3000);
};
const autoTradeReady =
  confidence >= autoTradeMinConfidence &&
  Date.now() - autoTradeLastAtRef.current >= autoTradeCooldownMs;

useEffect(() => {
  requestPreviewRef.current = requestHigherLowerPreview;
}, [requestHigherLowerPreview]);

useEffect(() => {
  if (!autoTradingEnabled) {
    setAutoTradeNow(Date.now());
    return;
  }

  const tick = () => setAutoTradeNow(Date.now());
  tick();

  const interval = window.setInterval(tick, 1000);
  return () => window.clearInterval(interval);
}, [autoTradingEnabled, autoTradeLastAtRef.current]);

useEffect(() => {
  return () => {
    if (selectedTradeActionTimeoutRef.current) {
      window.clearTimeout(selectedTradeActionTimeoutRef.current);
    }
  };
}, []);

useEffect(() => {
  let cancelled = false;

  const run = async () => {
    if (!stake || stake <= 0 || !lowerStake || lowerStake <= 0) {
      if (!cancelled) {
        setHigherPreview({ payout: 0, profit: 0 });
        setLowerPreview({ payout: 0, profit: 0 });
      }
      return;
    }

    const barrierChanged =
      higherDisplay !== higherBarrier ||
      lowerDisplay !== lowerBarrier ||
      barrierAutoUpdate ||
      barrierOptimizerLive;

    const minFetchGap = barrierChanged ? 150 : 1200;
    const delayMs = barrierChanged ? 120 : 350;

    const now = Date.now();
    if (now - previewLastFetchedAtRef.current < minFetchGap) return;
    previewLastFetchedAtRef.current = now;

    try {
      const [higher, lower] = await Promise.all([
        requestPreviewRef.current({
          direction: "Higher",
          durationValue: duration,
          barrier: higherDisplay,
          customStake: stake,
        }),
        requestPreviewRef.current({
          direction: "Lower",
          durationValue: duration,
          barrier: lowerDisplay,
          customStake: lowerStake,
        }),
      ]);

      if (!cancelled) {
        setHigherPreview(higher);
        setLowerPreview(lower);
      }
    } catch {
      if (!cancelled) {
        setHigherPreview({ payout: 0, profit: 0 });
        setLowerPreview({ payout: 0, profit: 0 });
      }
    }
  };

  const barrierChanged =
    higherDisplay !== higherBarrier ||
    lowerDisplay !== lowerBarrier ||
    barrierAutoUpdate ||
    barrierOptimizerLive;

  const t = window.setTimeout(run, barrierChanged ? 120 : 350);

  return () => {
    cancelled = true;
    window.clearTimeout(t);
  };
}, [
  duration,
  higherDisplay,
  lowerDisplay,
  higherBarrier,
  lowerBarrier,
  barrierAutoUpdate,
  barrierOptimizerLive,
  stake,
  lowerStake,
  selectedPair,
]);
const zoneLabel =
  latestQuote > higherBarrierValue
    ? "Above Higher"
    : latestQuote < lowerBarrierValue
    ? "Below Lower"
    : "Between";

const chartMin = Math.min(...chartQuotes, lowerBarrierValue, higherBarrierValue, latestQuote || 0);
const chartMax = Math.max(...chartQuotes, lowerBarrierValue, higherBarrierValue, latestQuote || 0);
const chartRange = Math.max(chartMax - chartMin, 0.0001);

const pathD = chartQuotes
  .map((q, i) => {
    const x = chartQuotes.length <= 1 ? 0 : (i / (chartQuotes.length - 1)) * 100;
    const y = 100 - ((q - chartMin) / chartRange) * 100;
    return `${i === 0 ? "M" : "L"}${x},${y}`;
  })
  .join(" ");

const latestY = 100 - ((latestQuote - chartMin) / chartRange) * 100;
const higherY = 100 - ((higherBarrierValue - chartMin) / chartRange) * 100;
const lowerY = 100 - ((lowerBarrierValue - chartMin) / chartRange) * 100;
const clampY = (y: number) => Math.max(6, Math.min(94, y));
const higherBandTop = Math.max(0, higherY - 2.3);
const higherBandHeight = Math.min(100 - higherBandTop, 4.6);
const lowerBandTop = Math.max(0, lowerY - 2.3);
const lowerBandHeight = Math.min(100 - lowerBandTop, 4.6);
const latestBandTop = Math.max(0, latestY - 1.4);
const latestBandHeight = Math.min(100 - latestBandTop, 2.8);
const higherLabelY = clampY(higherY - 4.4);
const lowerLabelY = clampY(lowerY + 6.4);
const latestLabelY = clampY(latestY - 3.8);

useEffect(() => {
  if (!autoTradingEnabled) return;
  if (!autoTradeReady) return;

  autoTradeLastAtRef.current = Date.now();
  setAutoTradeNow(Date.now());

  if (autoTradeMode === "both" || autoTradeMode === "higher") {
    onPlaceHigherLowerTrade({
      direction: "Higher",
      durationValue: duration,
      barrier: higherDisplay,
      customStake: stake,
    });
  }

  if (autoTradeMode === "both" || autoTradeMode === "lower") {
    onPlaceHigherLowerTrade({
      direction: "Lower",
      durationValue: duration,
      barrier: lowerDisplay,
      customStake: lowerStake,
    });
  }
}, [
  autoTradingEnabled,
  autoTradeReady,
  autoTradeMode,
  autoTradeMinConfidence,
  higherDisplay,
  lowerDisplay,
  duration,
  stake,
  lowerStake,
  onPlaceHigherLowerTrade,
]);
  return (
    <div className="rounded-[28px] border border-cyan-500/30 bg-[linear-gradient(135deg,rgba(29,40,73,0.92),rgba(5,17,46,0.96)_55%,rgba(2,13,36,0.98))] p-8 shadow-[0_0_40px_rgba(0,0,0,0.25)]">
      <div className="flex items-start justify-between gap-4">
        <div className="flex items-start gap-4">
          <div className="flex h-14 w-14 items-center justify-center rounded-2xl border border-cyan-400/40 bg-cyan-500/15 text-cyan-300">
            <svg
              viewBox="0 0 24 24"
              className="h-7 w-7"
              fill="none"
              stroke="currentColor"
              strokeWidth="1.8"
              strokeLinecap="round"
              strokeLinejoin="round"
            >
              <path d="M3 13h4l2.5-6 4 10 2.5-4H21" />
            </svg>
          </div>

          <div>
            <h2 className="text-[2rem] font-bold leading-none text-white">{header}</h2>
            <p className="mt-2 text-lg text-white/65">Real-time price movement prediction</p>
          </div>
        </div>

        <div className="inline-flex items-center gap-3 rounded-full border border-sky-400/50 bg-sky-500/15 px-5 py-2 text-sky-300">
          <span className="h-3 w-3 rounded-full bg-sky-400" />
          <span className="text-sm font-semibold tracking-wide">Live</span>
        </div>
      </div>

      <div className="mt-8 grid grid-cols-1 gap-6 md:grid-cols-2">
        <div>
          <label className="mb-3 block text-[1.05rem] font-medium text-white/85">Market</label>
          <select
            value={selectedPair}
            onChange={(e) => setSelectedPair(e.target.value as Pair)}
            className="h-14 w-full rounded-xl border border-white/10 bg-slate-800/70 px-4 text-[1.05rem] text-white outline-none transition focus:border-cyan-400/50"
          >
            {RISE_FALL_PAIRS.map((pair: Pair) => (
              <option key={pair} value={pair}>
                {pair}
              </option>
            ))}
          </select>
        </div>

        <div>
          <label className="mb-3 block text-[1.05rem] font-medium text-white/85">Duration</label>
          <select
            value={duration}
            onChange={(e) => setDuration(e.target.value)}
            className="h-14 w-full rounded-xl border border-white/10 bg-slate-800/70 px-4 text-[1.05rem] text-white outline-none transition focus:border-cyan-400/50"
          >
            {durationOptions.map((opt) => (
              <option key={opt.value} value={opt.value}>
                {opt.label}
              </option>
            ))}
          </select>
        </div>
      </div>

      <div className="mt-8 grid grid-cols-1 gap-6 md:grid-cols-2">
        <div>
          <label className="mb-3 flex items-center gap-2 text-[1.05rem] font-medium text-emerald-300">
            <span>↗</span>
            <span>Higher Stake ($)</span>
          </label>
          <input
            type="number"
            min={0.35}
            step="0.01"
            value={stake}
            onChange={(e) => {
              const v = Number(e.target.value);
              if (Number.isFinite(v)) setStake(v);
            }}
            className="h-16 w-full rounded-2xl border border-emerald-400/25 bg-slate-800/70 px-5 text-[1.1rem] text-white outline-none transition focus:border-emerald-400/45"
          />
        </div>

        <div>
          <label className="mb-3 flex items-center gap-2 text-[1.05rem] font-medium text-rose-300">
            <span>↘</span>
            <span>Lower Stake ($)</span>
          </label>
          <input
            type="number"
            min={0.35}
            step="0.01"
            value={lowerStake}
            onChange={(e) => {
              const v = Number(e.target.value);
              if (Number.isFinite(v)) setLowerStake(v);
            }}
            className="h-16 w-full rounded-2xl border border-rose-400/25 bg-slate-800/70 px-5 text-[1.1rem] text-white outline-none transition focus:border-rose-400/45"
          />
        </div>
      </div>

      <div className="mt-8">
        <label className="mb-4 block text-[1.05rem] font-medium text-white/85">Barrier Type</label>

        <div className="inline-flex rounded-2xl border border-white/10 bg-slate-800/55 p-1">
          <button
            type="button"
            onClick={() => setBarrierMode("offset")}
            className={`min-w-[210px] rounded-xl px-8 py-4 text-lg font-medium transition ${
              barrierMode === "offset"
                ? "bg-sky-500/30 text-sky-300 shadow-[inset_0_0_18px_rgba(14,165,233,0.12)]"
                : "text-white/75"
            }`}
          >
            Offset
          </button>

          <button
            type="button"
            onClick={() => setBarrierMode("absolute")}
            className={`min-w-[210px] rounded-xl px-8 py-4 text-lg font-medium transition ${
              barrierMode === "absolute"
                ? "bg-sky-500/30 text-sky-300 shadow-[inset_0_0_18px_rgba(14,165,233,0.12)]"
                : "text-white/75"
            }`}
          >
            Absolute
          </button>
        </div>
      </div>

      <div className="mt-8 flex justify-center gap-4 flex-wrap">
        <button
          type="button"
          onClick={() => setHalfBarrier((v) => !v)}
          className={`inline-flex items-center gap-4 rounded-2xl border px-6 py-3 text-lg transition ${
            halfBarrier
              ? "border-amber-400/40 bg-amber-500/12 text-amber-300"
              : "border-white/10 bg-slate-800/55 text-white/80"
          }`}
        >
          <span
            className={`relative h-8 w-16 rounded-full transition ${
              halfBarrier ? "bg-amber-500/35" : "bg-slate-600/60"
            }`}
          >
            <span
              className={`absolute top-1 h-6 w-6 rounded-full transition ${
                halfBarrier ? "left-9 bg-amber-300" : "left-1 bg-white/70"
              }`}
            />
          </span>
          <span>Half Barrier</span>
          {halfBarrier && (
            <span className="rounded-lg bg-amber-400/15 px-3 py-1 text-base font-semibold text-amber-300">
              /2
            </span>
          )}
        </button>

        <button
          type="button"
          onClick={() => setBarrierAutoUpdate((v) => !v)}
          className={`inline-flex items-center gap-4 rounded-2xl border px-6 py-3 text-lg transition ${
            barrierAutoUpdate
              ? "border-cyan-400/40 bg-cyan-500/12 text-cyan-300"
              : "border-white/10 bg-slate-800/55 text-white/80"
          }`}
        >
          <span
            className={`relative h-8 w-16 rounded-full transition ${
              barrierAutoUpdate ? "bg-cyan-500/35" : "bg-slate-600/60"
            }`}
          >
            <span
              className={`absolute top-1 h-6 w-6 rounded-full transition ${
                barrierAutoUpdate ? "left-9 bg-cyan-300" : "left-1 bg-white/70"
              }`}
            />
          </span>
          <span>Barrier Auto Update</span>
          {barrierAutoUpdate && (
            <span className="rounded-lg bg-cyan-400/15 px-3 py-1 text-base font-semibold text-cyan-300">
              ON
            </span>
          )}
        </button>
      </div>

      <div className="mt-8 grid grid-cols-1 gap-5 xl:grid-cols-2">
        <div className="rounded-[24px] border border-emerald-400/25 bg-slate-900/35 p-5 xl:min-h-[250px]">
          <div className="mb-5 flex items-center justify-between gap-4">
            <div className="text-[1.05rem] font-medium text-emerald-300">↗ Higher Barrier</div>
            <div className="text-[1.7rem] font-medium tracking-tight text-white/45">
              {latestQuote ? latestQuote.toFixed(pip) : "0.00"}
            </div>
          </div>

          <div className="flex items-center gap-2">
            {barrierMode === "offset" && (
              <button
                type="button"
                onClick={() => changeOffsetBarrier(higherBarrier, setHigherBarrier, -1)}
                className="flex h-11 w-11 items-center justify-center rounded-2xl border border-white/10 bg-slate-700/45 text-3xl text-white/80 shrink-0"
              >
                −
              </button>
            )}

            <input
  type="number"
  step={barrierMode === "offset" ? "0.01" : "any"}
  value={
    barrierMode === "offset"
      ? parseOffsetValue(higherBarrier)
      : Number.parseFloat(higherBarrier || String(latestQuote || 0))
  }
  onChange={(e) => {
    const v = Number(e.target.value);
    if (!Number.isFinite(v)) return;

    if (barrierMode === "offset") {
      setHigherBarrier(formatOffset(Math.abs(v)));
    } else {
      setHigherBarrier(v.toFixed(pip));
    }
  }}
  className="h-[60px] min-w-0 flex-1 rounded-2xl border border-emerald-400/25 bg-slate-800/65 px-2 text-[1.05rem] text-white outline-none transition focus:border-emerald-400/45"
/>

            {barrierMode === "offset" && (
              <button
                type="button"
                onClick={() => changeOffsetBarrier(higherBarrier, setHigherBarrier, 1)}
                className="flex h-11 w-11 items-center justify-center rounded-2xl border border-white/10 bg-slate-700/45 text-3xl text-white/80 shrink-0"
              >
                +
              </button>
            )}
          </div>

          <div className="mt-3 flex flex-wrap gap-2">
            {barrierChips.map((chip) => (
              <button
                key={`higher-${chip.key}`}
                type="button"
                onClick={() => setHigherBarrier(chip.value)}
                className={`rounded-xl border px-4 py-2.5 text-base font-medium transition ${
                  higherDisplay === chip.value
                    ? "border-emerald-400/45 bg-emerald-500/15 text-emerald-300"
                    : "border-white/10 bg-slate-800/60 text-white/70"
                }`}
              >
                {chip.label}
              </button>
            ))}
          </div>
        </div>

        <div className="rounded-[24px] border border-rose-400/25 bg-slate-900/35 p-5 xl:min-h-[250px]">
          <div className="mb-4 flex items-center justify-between gap-4">
            <div className="text-[1.05rem] font-medium text-rose-300">↘ Lower Barrier</div>
            <div className="text-[1.7rem] font-medium tracking-tight text-white/45">
              {latestQuote ? latestQuote.toFixed(pip) : "0.00"}
            </div>
          </div>

          <div className="flex items-center gap-3">
            {barrierMode === "offset" && (
              <button
                type="button"
                onClick={() => changeOffsetBarrier(lowerBarrier, setLowerBarrier, -1)}
                className="flex h-11 w-11 items-center justify-center rounded-2xl border border-white/10 bg-slate-700/45 text-3xl text-white/80 shrink-0"
              >
                −
              </button>
            )}

            <input
  type="number"
  step={barrierMode === "offset" ? "0.01" : "any"}
  value={
    barrierMode === "offset"
      ? parseOffsetValue(lowerBarrier)
      : Number.parseFloat(lowerBarrier || String(latestQuote || 0))
  }
  onChange={(e) => {
    const v = Number(e.target.value);
    if (!Number.isFinite(v)) return;

    if (barrierMode === "offset") {
      setLowerBarrier(formatOffset(-Math.abs(v)));
    } else {
      setLowerBarrier(v.toFixed(pip));
    }
  }}
  className="h-[60px] min-w-0 flex-1 rounded-2xl border border-rose-400/25 bg-slate-800/65 px-2 text-[1.05rem] text-white outline-none transition focus:border-rose-400/45"
/>

            {barrierMode === "offset" && (
              <button
                type="button"
                onClick={() => changeOffsetBarrier(lowerBarrier, setLowerBarrier, 1)}
                className="flex h-11 w-11 items-center justify-center rounded-2xl border border-white/10 bg-slate-700/45 text-3xl text-white/80 shrink-0"
              >
                +
              </button>
            )}
          </div>

          <div className="mt-3 flex flex-wrap gap-2">
            {barrierChips.map((chip) => (
              <button
                key={`lower-${chip.key}`}
                type="button"
                onClick={() => setLowerBarrier(chip.value)}
                className={`rounded-xl border px-4 py-2.5 text-base font-medium transition ${
                  lowerDisplay === chip.value
                    ? "border-rose-400/45 bg-rose-500/15 text-rose-300"
                    : "border-white/10 bg-slate-800/60 text-white/70"
                }`}
              >
                {chip.label}
              </button>
            ))}
          </div>
        </div>
      </div>
      
      <div className="mt-8 rounded-[28px] border border-cyan-500/20 bg-[linear-gradient(135deg,rgba(10,23,53,0.96),rgba(4,16,42,0.98)_55%,rgba(2,13,36,0.99))] p-5 shadow-[0_0_0_1px_rgba(34,211,238,0.08)]">
  <div className="flex items-start justify-between gap-4">
    <div className="flex items-start gap-3">
      <div className="flex h-12 w-12 items-center justify-center rounded-2xl border border-amber-400/25 bg-amber-500/10 text-amber-300 text-2xl">
        ⌖
      </div>
      <div>
        <div className="text-[1.3rem] font-bold leading-none text-white">
          Barrier Optimizer
        </div>
        <div className="mt-1 text-sm text-white/55">
          Find the best barrier settings for each pair
        </div>
      </div>
    </div>

    <div className="flex items-center gap-2">
      {barrierOptimizerLive && (
        <span className="rounded-full border border-emerald-400/20 bg-emerald-500/12 px-3 py-1 text-xs font-semibold text-emerald-300">
          ● LIVE
        </span>
      )}
      <span className="rounded-full border border-amber-400/20 bg-amber-500/12 px-3 py-1 text-xs font-semibold text-amber-300">
        {barrierOptimizerRows.length} pairs
      </span>
    </div>
  </div>

  <div className="mt-5 flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
    <div className="flex flex-wrap items-center gap-2">
      <span className="text-white/70 text-sm">Window:</span>
      {[3, 5, 10, 15].map((n) => (
        <button
          key={n}
          type="button"
          onClick={() => setBarrierOptimizerWindow(n as BarrierOptimizerWindow)}
          className={`rounded-xl border px-4 py-2 text-sm font-medium transition ${
            barrierOptimizerWindow === n
              ? "border-amber-400/35 bg-amber-500/15 text-amber-300"
              : "border-white/10 bg-white/5 text-white/40"
          }`}
        >
          {n} ticks
        </button>
      ))}
    </div>

    <button
      type="button"
      onClick={() => setBarrierOptimizerLive((v) => !v)}
      className={`rounded-xl px-5 py-2.5 text-sm font-semibold text-white transition ${
        barrierOptimizerLive
          ? "bg-rose-600 hover:bg-rose-500"
          : "bg-orange-500 hover:bg-orange-400"
      }`}
    >
      {barrierOptimizerLive ? "Stop" : "Go Live"}
    </button>
  </div>

  {!barrierOptimizerLive ? (
    <div className="mt-6 flex min-h-[230px] flex-col items-center justify-center rounded-[24px] border border-white/10 bg-white/5 px-6 text-center">
      <div className="flex h-16 w-16 items-center justify-center rounded-[20px] border border-amber-400/20 bg-amber-500/10 text-2xl text-amber-300">
        ⌖
      </div>
      <div className="mt-4 text-xl font-semibold text-white/85">
        No scan results yet
      </div>
      <div className="mt-2 max-w-xl text-sm leading-7 text-white/45">
        Click &quot;Go Live&quot; to connect to all volatility pairs and get continuously updated barrier recommendations.
      </div>
    </div>
  ) : (
    <div className="mt-6 rounded-[24px] border border-cyan-500/20 bg-[#07152c]/85 p-4">
      <div className="flex flex-col gap-2 lg:flex-row lg:items-center lg:justify-between">
        <div className="flex items-center gap-2 text-sm font-semibold text-white/85">
          <span className="text-amber-300">◔</span>
          <span>Top pairs with the longest up & down movement from spot price ({barrierOptimizerWindow}-tick window)</span>
        </div>

        <div className="flex items-center gap-2 text-xs">
          <span className="rounded-full border border-emerald-400/20 bg-emerald-500/12 px-3 py-1 font-semibold text-emerald-300">
            ● LIVE
          </span>
          <span className="text-white/35">{quotes.length} ticks</span>
        </div>
      </div>

      <div className="mt-4 space-y-4">
        {barrierOptimizerRows.length === 0 ? (
          <div className="rounded-[20px] border border-white/10 bg-white/5 p-5 text-sm text-white/55">
            Waiting for enough live tick history to rank all pairs.
          </div>
        ) : (
          barrierOptimizerRows.map((row, index) => {
            const rowPair = row.pair as Pair;
            const scoreWidth = `${Math.max(8, Math.min(100, row.score))}%`;
            const rowTicks = pairQuotesRef.current[rowPair]?.length ?? row.ticks;
            const differenceText = `${row.difference >= 0 ? "+" : ""}${row.difference.toFixed(2)}`;
            const balancedBarrierValue = Number(((Math.abs(row.higherBarrier) + Math.abs(row.lowerBarrier)) / 2).toFixed(2));

            return (
              <div
                key={rowPair}
                className={`rounded-[22px] border p-4 ${
                  index === 0
                    ? "border-emerald-400/20 bg-[linear-gradient(90deg,rgba(16,185,129,0.10),rgba(15,23,42,0.20))]"
                    : "border-cyan-500/20 bg-[linear-gradient(180deg,rgba(8,19,42,0.88),rgba(6,16,35,0.92))]"
                }`}
              >
                <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
                  <div className="min-w-0 flex-1">
                    <div className="flex flex-wrap items-center gap-2">
                      <span className="rounded-lg bg-white/10 px-2 py-1 text-xs font-semibold text-amber-300">
                        #{index + 1}
                      </span>
                      <div className="text-[1.1rem] font-semibold text-white">
                        {row.label}
                      </div>
                      {index === 0 && (
                        <span className="rounded-full border border-cyan-400/20 bg-cyan-500/10 px-2 py-1 text-[10px] font-semibold text-cyan-300">
                          ACTIVE
                        </span>
                      )}
                      <span className="text-xs text-white/35">↗ {rowTicks}t</span>
                    </div>

                    <div className="mt-4 grid grid-cols-2 gap-x-6 gap-y-3 text-sm lg:grid-cols-4">
                      <div>
                        <div className="text-white/40">Higher win:</div>
                        <div className="mt-1 font-semibold text-cyan-300">
                          {row.higherWinPct.toFixed(1)}%
                        </div>
                      </div>
                      <div>
                        <div className="text-white/40">Lower win:</div>
                        <div className="mt-1 font-semibold text-amber-300">
                          {row.lowerWinPct.toFixed(1)}%
                        </div>
                      </div>
                      <div>
                        <div className="text-white/40">Avg move up:</div>
                        <div className="mt-1 font-semibold text-emerald-300">
                          {row.avgMoveUp.toFixed(2)}
                        </div>
                      </div>
                      <div>
                        <div className="text-white/40">Avg move dn:</div>
                        <div className="mt-1 font-semibold text-rose-300">
                          {row.avgMoveDown.toFixed(2)}
                        </div>
                      </div>
                    </div>

                    <div className="mt-4 text-sm text-white/35">
                      Difference (Up - Down):
                    </div>

                    <div className="mt-3 flex flex-wrap items-center gap-2">
                      <div className="rounded-xl bg-emerald-500/10 px-3 py-2 text-sm font-semibold text-emerald-300">
                        ↗ H: {formatOptimizerBarrier(balancedBarrierValue)}
                      </div>
                      <div className="rounded-xl bg-rose-500/10 px-3 py-2 text-sm font-semibold text-rose-300">
                        ↘ L: {formatOptimizerBarrier(-balancedBarrierValue)}
                      </div>
                      <div className="rounded-xl bg-amber-500/10 px-3 py-2 text-sm font-semibold text-amber-300">
                        ⚡ Best: {row.best}
                      </div>
                    </div>

                    <div className="mt-4">
                      <div className="text-xs text-white/40">Score</div>
                      <div className="mt-2 h-2 overflow-hidden rounded-full bg-white/10">
                        <div
                          className="h-full rounded-full bg-emerald-400"
                          style={{ width: scoreWidth }}
                        />
                      </div>
                    </div>
                  </div>

                  <div className="flex shrink-0 items-center gap-4 lg:flex-col lg:items-end">
                    <div className="text-right">
                      <div className="text-3xl font-extrabold text-emerald-300">
                        {row.score}
                      </div>
                      <div className="text-[11px] uppercase tracking-[0.2em] text-white/35">
                        Score
                      </div>
                      <div
                        className={`mt-2 text-sm font-semibold ${
                          row.difference >= 0 ? "text-emerald-300" : "text-rose-300"
                        }`}
                      >
                        {differenceText}
                      </div>
                    </div>

                    <button
                      type="button"
                    onClick={() => {
                      setSelectedPair(rowPair);

                      if (barrierAutoUpdate) {
                        const optimizerBalancedValue = Number(
                          ((Math.abs(row.higherBarrier) + Math.abs(row.lowerBarrier)) / 2).toFixed(2),
                        );
                        const appliedOffset = halfBarrier ? optimizerBalancedValue / 2 : optimizerBalancedValue;

                        if (barrierMode === "offset") {
                          setHigherBarrier(formatOffset(appliedOffset));
                          setLowerBarrier(formatOffset(-appliedOffset));
                        } else {
                          const nextQuote = pairQuotesRef.current[rowPair]?.slice(-1)[0] ?? latestQuote;
                          setHigherBarrier(
                            Number((nextQuote + appliedOffset).toFixed(pip)).toFixed(pip),
                          );
                          setLowerBarrier(
                            Number((nextQuote - appliedOffset).toFixed(pip)).toFixed(pip),
                          );
                        }
                      } else {
                        const baseBalancedValue = balancedBarrierValue;
                        const appliedBalancedValue = halfBarrier ? baseBalancedValue / 2 : baseBalancedValue;
                        setHigherBarrier(formatOffset(appliedBalancedValue));
                        setLowerBarrier(formatOffset(-appliedBalancedValue));
                      }
                    }}
                      className="rounded-xl bg-orange-500 px-4 py-2 text-sm font-semibold text-white transition hover:bg-orange-400"
                    >
                      Apply
                    </button>
                  </div>
                </div>
              </div>
            );
          })
        )}
      </div>

      <div className="mt-4 rounded-[20px] border border-white/10 bg-white/5 px-4 py-3 text-xs leading-6 text-white/45">
        Live mode: shows top pairs with the longest up & down movement from spot price. Barriers are set at 25% of average movement for balanced wins. Updates every 2 seconds.
      </div>
    </div>
  )}
</div>

      <div className="mt-8 rounded-[28px] border border-white/10 bg-slate-900/25 p-5 shadow-[0_0_0_1px_rgba(255,255,255,0.03)]">
  <div className="flex items-center justify-between gap-4">
    <div className="flex items-center gap-3">
      <div className="text-cyan-300 text-2xl">⌁</div>
      <div>
        <div className="text-[1.1rem] font-semibold text-white/90">
          Price Chart <span className="text-white/40 font-normal">Last 30 ticks</span>
        </div>
      </div>
    </div>

    <div className="text-right">
      <div className="text-[2rem] font-bold text-emerald-300 leading-none">
        {latestQuote.toFixed(pip)}
      </div>
      <div className="mt-2 text-[1.1rem] text-emerald-300/90">
        {chartQuotes.length > 1
          ? `${latestQuote - anchorQuote >= 0 ? "+" : ""}${(latestQuote - anchorQuote).toFixed(pip)}`
          : `+0.${"0".repeat(pip)}`}
      </div>
    </div>
  </div>

  <div className="mt-5 rounded-2xl border border-white/10 bg-slate-800/55 px-4 py-3 flex items-center justify-between gap-4">
    <div className="text-white/45 text-[1.05rem]">
      Barrier anchor: <span className="text-white/80">{anchorQuote.toFixed(pip)}</span>
    </div>
    <button
      type="button"
      onClick={() => {
        const offset = getEffectiveBarrierOffset();
        if (barrierMode === "offset") {
          setHigherBarrier(formatOffset(offset));
          setLowerBarrier(formatOffset(-offset));
        } else {
          setHigherBarrier(Number((latestQuote + offset).toFixed(pip)).toFixed(pip));
          setLowerBarrier(Number((latestQuote - offset).toFixed(pip)).toFixed(pip));
        }
      }}
      className="text-cyan-300 text-[1.05rem] font-semibold hover:text-cyan-200 transition"
    >
      Reset to current
    </button>
  </div>

  <div
    className={`mt-4 rounded-t-2xl border border-b-0 px-5 py-3 text-[1.05rem] font-semibold ${
      zoneLabel === "Above Higher"
        ? "border-emerald-400/30 bg-emerald-500/10 text-emerald-300"
        : zoneLabel === "Below Lower"
        ? "border-rose-400/30 bg-rose-500/10 text-rose-300"
        : "border-amber-400/30 bg-amber-500/10 text-amber-300"
    }`}
  >
    ●{" "}
    {zoneLabel === "Above Higher"
      ? `PRICE IS ABOVE YOUR HIGHER BARRIER (${higherBarrierValue.toFixed(pip)})`
      : zoneLabel === "Below Lower"
      ? `PRICE IS BELOW YOUR LOWER BARRIER (${lowerBarrierValue.toFixed(pip)})`
      : `PRICE IS BETWEEN YOUR BARRIERS (${lowerBarrierValue.toFixed(pip)} - ${higherBarrierValue.toFixed(pip)})`}
  </div>

  <div className="rounded-b-2xl border border-white/10 bg-slate-900/35 overflow-hidden">
    <div className="p-5">
      <div className="h-[300px] sm:h-[320px] lg:h-[340px] w-full rounded-2xl border border-white/5 bg-[linear-gradient(180deg,rgba(32,44,78,0.8),rgba(21,29,56,0.9))] px-3 py-4 sm:px-4">
        <svg viewBox="0 0 100 100" preserveAspectRatio="none" className="h-full w-full overflow-visible">
          <defs>
            <linearGradient id="mspiderAreaFill" x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor="rgba(255,66,99,0.18)" />
              <stop offset="100%" stopColor="rgba(255,66,99,0.02)" />
            </linearGradient>
            <linearGradient id="mspiderHigherBand" x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor="rgba(16,185,129,0.20)" />
              <stop offset="100%" stopColor="rgba(16,185,129,0.06)" />
            </linearGradient>
            <linearGradient id="mspiderLowerBand" x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor="rgba(244,63,94,0.22)" />
              <stop offset="100%" stopColor="rgba(244,63,94,0.06)" />
            </linearGradient>
            <linearGradient id="mspiderLatestBand" x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor="rgba(56,189,248,0.18)" />
              <stop offset="100%" stopColor="rgba(56,189,248,0.04)" />
            </linearGradient>
          </defs>

          {[20, 40, 60, 80].map((y) => (
            <line
              key={`grid-${y}`}
              x1="0"
              y1={y}
              x2="100"
              y2={y}
              stroke="rgba(96,165,250,0.12)"
              strokeDasharray="2 2"
              vectorEffect="non-scaling-stroke"
            />
          ))}

          <rect
            x="0"
            y={higherBandTop}
            width="100"
            height={higherBandHeight}
            fill="url(#mspiderHigherBand)"
          />
          <rect
            x="0"
            y={lowerBandTop}
            width="100"
            height={lowerBandHeight}
            fill="url(#mspiderLowerBand)"
          />
          <rect
            x="0"
            y={latestBandTop}
            width="100"
            height={latestBandHeight}
            fill="url(#mspiderLatestBand)"
          />

          <line
            x1="0"
            y1={higherY}
            x2="100"
            y2={higherY}
            stroke="#34d399"
            strokeWidth="1.4"
            strokeDasharray="5 2"
            vectorEffect="non-scaling-stroke"
          />
          <g>
            <rect
              x="1"
              y={higherLabelY - 5.8}
              width="28"
              height="8.4"
              rx="1.9"
              fill="rgba(6,78,59,0.88)"
              stroke="rgba(52,211,153,0.95)"
              strokeWidth="0.45"
              vectorEffect="non-scaling-stroke"
            />
            <text
              x="2.2"
              y={higherLabelY}
              fill="#6ee7b7"
              fontSize="3.35"
              fontWeight="800"
            >
              HIGHER {higherBarrierValue.toFixed(pip)}
            </text>
          </g>

          <line
            x1="0"
            y1={lowerY}
            x2="100"
            y2={lowerY}
            stroke="#fb7185"
            strokeWidth="1.4"
            strokeDasharray="5 2"
            vectorEffect="non-scaling-stroke"
          />
          <g>
            <rect
              x="70"
              y={lowerLabelY - 5.8}
              width="29"
              height="8.4"
              rx="1.9"
              fill="rgba(127,29,29,0.88)"
              stroke="rgba(251,113,133,0.95)"
              strokeWidth="0.45"
              vectorEffect="non-scaling-stroke"
            />
            <text
              x="71.2"
              y={lowerLabelY}
              fill="#fda4af"
              fontSize="3.35"
              fontWeight="800"
            >
              LOWER {lowerBarrierValue.toFixed(pip)}
            </text>
          </g>

          {pathD && (
            <>
              <path d={`${pathD} L100,100 L0,100 Z`} fill="url(#mspiderAreaFill)" stroke="none" />
              <path
                d={pathD}
                fill="none"
                stroke="#ff4263"
                strokeWidth="0.9"
                vectorEffect="non-scaling-stroke"
              />
            </>
          )}

          {chartQuotes.length > 0 && (
  <>
    <g>
      <rect
        x="1"
        y={latestLabelY - 5.2}
        width="20"
        height="7.6"
        rx="1.8"
        fill="rgba(8,47,73,0.88)"
        stroke="rgba(56,189,248,0.9)"
        strokeWidth="0.4"
        vectorEffect="non-scaling-stroke"
      />
      <text
        x="2.2"
        y={latestLabelY}
        fill="#67e8f9"
        fontSize="3.2"
        fontWeight="800"
      >
        PRICE {latestQuote.toFixed(pip)}
      </text>
    </g>
    <circle
      cx="100"
      cy={latestY}
      r="1.5"
      fill="#0f172a"
      stroke="#ff4263"
      strokeWidth="0.8"
      vectorEffect="non-scaling-stroke"
    />
  </>
)}
        </svg>
      </div>

      <div className="mt-4 flex flex-wrap items-center justify-between gap-3 border-t border-white/5 pt-4">
        <div className="flex flex-wrap items-center gap-6 text-[1.05rem]">
          <span className="text-cyan-200">
            <span className="mr-2 text-cyan-300">▭</span>Current Price Band
          </span>
          <span className="text-emerald-300">
            <span className="mr-2 text-emerald-300">▭</span>Higher Barrier Zone
          </span>
          <span className="text-rose-300">
            <span className="mr-2 text-rose-300">▭</span>Lower Barrier Zone
          </span>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-3 gap-2 w-full lg:w-auto lg:min-w-[360px]">
          <button
            type="button"
            className={`rounded-xl border px-4 py-2.5 text-[1rem] font-semibold transition ${
              zoneLabel === "Above Higher"
                ? "border-emerald-400/40 bg-emerald-500/10 text-emerald-300"
                : "border-white/10 bg-slate-800/55 text-white/45"
            }`}
          >
            Above Higher
          </button>
          <button
            type="button"
            className={`rounded-xl border px-4 py-2.5 text-[1rem] font-semibold transition ${
              zoneLabel === "Between"
                ? "border-amber-400/40 bg-amber-500/10 text-amber-300"
                : "border-white/10 bg-slate-800/55 text-white/45"
            }`}
          >
            Between
          </button>
          <button
            type="button"
            className={`rounded-xl border px-4 py-2.5 text-[1rem] font-semibold transition ${
              zoneLabel === "Below Lower"
                ? "border-rose-400/40 bg-rose-500/10 text-rose-300"
                : "border-white/10 bg-slate-800/55 text-white/45"
            }`}
          >
            Below Lower
          </button>
        </div>
      </div>
    </div>
  </div>
</div>

<div className="mt-6 grid grid-cols-1 gap-4 md:grid-cols-2">
  <div className="rounded-[24px] border border-emerald-400/25 bg-[linear-gradient(90deg,rgba(16,185,129,0.08),rgba(15,23,42,0.25))] p-6">
    <div className="text-[1.05rem] font-medium text-emerald-300">↗ Higher</div>
    <div className="mt-4 text-[3rem] font-bold leading-none text-emerald-300">
      {higherPct.toFixed(1)}%
    </div>
    <div className="mt-3 text-[1.35rem] text-white/75">{higherCount} ticks</div>
  </div>

  <div className="rounded-[24px] border border-rose-400/25 bg-[linear-gradient(90deg,rgba(244,63,94,0.08),rgba(15,23,42,0.25))] p-6">
    <div className="text-[1.05rem] font-medium text-rose-300">↘ Lower</div>
    <div className="mt-4 text-[3rem] font-bold leading-none text-rose-300">
      {lowerPct.toFixed(1)}%
    </div>
    <div className="mt-3 text-[1.35rem] text-white/75">{lowerCount} ticks</div>
  </div>
</div>

<div className="mt-6 rounded-[24px] border border-white/10 bg-slate-900/25 p-6">
  <div className="flex items-center gap-3">
    <div className="text-cyan-300 text-2xl">⌗</div>
    <div className="text-[1.1rem] font-semibold text-white/90">Recent Moves</div>
  </div>

  <div className="mt-5 flex flex-wrap gap-3">
    {recentMoves.length ? (
      recentMoves.map((move) => (
        <div
          key={move.key}
          className={`flex h-11 min-w-[42px] items-center justify-center rounded-xl border px-3 text-[1.1rem] font-semibold ${
            move.dir === "H"
              ? "border-emerald-400/30 bg-emerald-500/10 text-emerald-300"
              : "border-rose-400/30 bg-rose-500/10 text-rose-300"
          }`}
        >
          {move.dir}
        </div>
      ))
    ) : (
      <div className="text-white/45">Waiting for price movement data...</div>
    )}
  </div>
</div>

<div className="mt-6 rounded-[24px] border border-rose-400/25 bg-[linear-gradient(90deg,rgba(244,63,94,0.08),rgba(15,23,42,0.25))] p-6">
  <div className="flex items-center justify-between gap-4">
    <div className="flex items-center gap-3">
      <div className="text-cyan-300 text-2xl">◎</div>
      <div className="text-[1.1rem] font-semibold text-white/90">Prediction</div>
    </div>
    <div className="text-[1.15rem] font-bold text-amber-300">
      {confidence.toFixed(0)}% confidence
    </div>
  </div>

  <div className="mt-5 flex items-center gap-4">
    <div
      className={`flex h-14 w-14 items-center justify-center rounded-full border text-3xl ${
        prediction === "LOWER"
          ? "border-rose-400/40 text-rose-300"
          : "border-emerald-400/40 text-emerald-300"
      }`}
    >
      {prediction === "LOWER" ? "↓" : "↑"}
    </div>

    <div>
      <div
        className={`text-[2rem] font-bold leading-none ${
          prediction === "LOWER" ? "text-rose-300" : "text-emerald-300"
        }`}
      >
        {prediction}
      </div>
      <div className="mt-2 text-[1.2rem] text-white/75">
        {prediction === "LOWER"
          ? "Next tick predicted to go lower than current"
          : "Next tick predicted to go higher than current"}
      </div>
    </div>
  </div>

  <div className="mt-6 h-3 w-full overflow-hidden rounded-full bg-slate-800/80">
    <div
      className={`h-full rounded-full ${
        prediction === "LOWER" ? "bg-rose-500" : "bg-emerald-500"
      }`}
      style={{ width: `${Math.max(12, Math.min(100, confidence))}%` }}
    />
  </div>
</div>

<div className="mt-6 grid grid-cols-1 gap-4 md:grid-cols-2">
  <button
    type="button"
    onClick={() => {
      flashSelectedTradeAction("higher");
      onPlaceHigherLowerTrade({
        direction: "Higher",
        durationValue: duration,
        barrier: higherDisplay,
        customStake: stake,
      });
    }}
    className={`rounded-[22px] border px-6 py-5 text-left transition ${
      selectedTradeAction === "higher"
        ? "border-emerald-300/70 bg-[linear-gradient(135deg,rgba(6,78,59,0.96),rgba(4,47,46,0.96))] shadow-[0_0_0_1px_rgba(52,211,153,0.28),0_0_26px_rgba(16,185,129,0.20)]"
        : "border-emerald-900/70 bg-[linear-gradient(135deg,rgba(3,44,44,0.96),rgba(5,24,39,0.98))] hover:border-emerald-400/45 hover:bg-[linear-gradient(135deg,rgba(5,57,51,0.98),rgba(7,31,48,0.98))]"
    }`}
  >
    <div className="text-[1.2rem] font-bold tracking-wide text-white/80">HIGHER</div>
    <div className="mt-2 text-[1.1rem] text-white/65">Payout: ${higherPayout.toFixed(2)}</div>
    <div className="mt-1 text-[1.1rem] font-semibold text-white/75">Profit: {higherProfit >= 0 ? "+" : ""}${higherProfit.toFixed(2)}</div>
  </button>

  <button
    type="button"
    onClick={() => {
      flashSelectedTradeAction("lower");
      onPlaceHigherLowerTrade({
        direction: "Lower",
        durationValue: duration,
        barrier: lowerDisplay,
        customStake: lowerStake,
      });
    }}
    className={`rounded-[22px] border px-6 py-5 text-left transition ${
      selectedTradeAction === "lower"
        ? "border-rose-300/70 bg-[linear-gradient(135deg,rgba(88,28,45,0.96),rgba(76,5,25,0.96))] shadow-[0_0_0_1px_rgba(251,113,133,0.28),0_0_26px_rgba(244,63,94,0.20)]"
        : "border-rose-950/70 bg-[linear-gradient(135deg,rgba(54,18,31,0.96),rgba(24,10,25,0.98))] hover:border-rose-400/45 hover:bg-[linear-gradient(135deg,rgba(72,22,39,0.98),rgba(36,10,29,0.98))]"
    }`}
  >
    <div className="text-[1.2rem] font-bold tracking-wide text-white/80">LOWER</div>
    <div className="mt-2 text-[1.1rem] text-white/65">Payout: ${lowerPayout.toFixed(2)}</div>
    <div className="mt-1 text-[1.1rem] font-semibold text-white/75">Profit: {lowerProfit >= 0 ? "+" : ""}${lowerProfit.toFixed(2)}</div>
  </button>
</div>

<button
  type="button"
  onClick={() => {
    flashSelectedTradeAction("both");
    onPlaceHigherLowerTrade({
      direction: "Higher",
      durationValue: duration,
      barrier: higherDisplay,
      customStake: stake,
    });

    onPlaceHigherLowerTrade({
      direction: "Lower",
      durationValue: duration,
      barrier: lowerDisplay,
      customStake: lowerStake,
    });
  }}
  className={`mt-4 w-full rounded-[22px] border px-6 py-6 text-center transition ${
    selectedTradeAction === "both"
      ? "border-amber-300/70 bg-[linear-gradient(135deg,rgba(120,53,15,0.96),rgba(127,29,29,0.96))] shadow-[0_0_0_1px_rgba(251,191,36,0.25),0_0_28px_rgba(251,146,60,0.22)]"
      : "border-amber-950/70 bg-[linear-gradient(135deg,rgba(66,32,14,0.96),rgba(57,20,20,0.98))] hover:border-amber-400/45 hover:bg-[linear-gradient(135deg,rgba(84,41,16,0.98),rgba(77,24,24,0.98))]"
  }`}
>
  <div className="text-[1.2rem] font-bold tracking-wide text-white/80">HIGHER & LOWER</div>
  <div className="mt-3 text-[1.15rem] text-white/60">
    Total Stake: ${combinedStake.toFixed(2)}
    <span className="mx-4 text-white/30">•</span>
    Combined Payout: ${combinedPayout.toFixed(2)}
  </div>
</button>

<div className="mt-6 rounded-[24px] border border-white/10 bg-slate-950/35 p-6">
  <div className="flex items-start justify-between gap-4">
    <div>
      <div className="text-[1.35rem] font-semibold text-white/85">Auto Trading</div>
    </div>

    <button
      type="button"
      onClick={() => setAutoTradingEnabled((v) => !v)}
      className="inline-flex items-center"
    >
      <span className={`relative h-9 w-[74px] rounded-full transition ${autoTradingEnabled ? "bg-cyan-500/35" : "bg-slate-700/80"}`}>
        <span className={`absolute top-1 h-7 w-7 rounded-full transition ${autoTradingEnabled ? "left-[38px] bg-cyan-300" : "left-1 bg-white/70"}`} />
      </span>
    </button>
  </div>

  <div className="mt-5 flex flex-wrap items-center gap-2">
    <button
      type="button"
      onClick={() => setAutoTradeMode("both")}
      className={`rounded-xl border px-5 py-2.5 text-[1.05rem] font-medium transition ${
        autoTradeMode === "both"
          ? "border-cyan-400/35 bg-sky-500/20 text-cyan-200"
          : "border-white/10 bg-slate-800/55 text-white/40"
      }`}
    >
      H&L (2)
    </button>

    <button
      type="button"
      onClick={() => setAutoTradeMode("higher")}
      className={`rounded-xl border px-5 py-2.5 text-[1.05rem] font-medium transition ${
        autoTradeMode === "higher"
          ? "border-emerald-400/35 bg-emerald-500/18 text-emerald-200"
          : "border-white/10 bg-slate-800/55 text-white/40"
      }`}
    >
      H
    </button>

    <button
      type="button"
      onClick={() => setAutoTradeMode("lower")}
      className={`rounded-xl border px-5 py-2.5 text-[1.05rem] font-medium transition ${
        autoTradeMode === "lower"
          ? "border-rose-400/35 bg-rose-500/18 text-rose-200"
          : "border-white/10 bg-slate-800/55 text-white/40"
      }`}
    >
      L
    </button>

    <span className="ml-2 text-[1.05rem] text-white/45">Min:</span>

    {[55, 60, 65, 70, 75].map((pct) => (
      <button
        key={pct}
        type="button"
        onClick={() => setAutoTradeMinConfidence(pct)}
        className={`rounded-xl border px-4 py-2.5 text-[1.05rem] font-medium transition ${
          autoTradeMinConfidence === pct
            ? "border-cyan-400/35 bg-sky-500/20 text-cyan-200"
            : "border-white/10 bg-slate-800/55 text-white/40"
        }`}
      >
        {pct}%
      </button>
    ))}
  </div>

  <div className="mt-5 space-y-3">
    <p className="max-w-4xl text-[1.1rem] leading-9 text-white/45">
      When enabled, Auto Trading places {autoTradeMode === "both" ? "1 Higher and 1 Lower trade together" : autoTradeMode === "higher" ? "1 Higher trade" : "1 Lower trade"} using the selected duration of {selectedDurationLabel} and the current stake amount
      {autoTradeMode === "both"
        ? `s of $${stake.toFixed(2)} for Higher and $${lowerStake.toFixed(2)} for Lower`
        : autoTradeMode === "higher"
        ? ` of $${stake.toFixed(2)} for Higher`
        : ` of $${lowerStake.toFixed(2)} for Lower`}
      whenever prediction confidence reaches the selected threshold, then waits 30 seconds before the next round.
    </p>

    <div className="text-[1rem] text-white/55">
      Status:{" "}
      <span className={autoTradeReady ? "text-emerald-300" : "text-amber-300"}>
        {autoTradeReady
          ? `Ready to place ${autoTradeMode === "both" ? "H&L" : autoTradeMode === "higher" ? "H" : "L"} on ${selectedDurationLabel}`
          : `Waiting for ${autoTradeMinConfidence}% confidence or cooldown`}
      </span>
    </div>
    {autoTradeCoolingDown && (
      <div className="text-[0.98rem] text-cyan-300">
        Cooldown: next auto trade in {autoTradeCooldownSeconds}s
      </div>
    )}
    <div className="text-[0.98rem] text-white/40">
      Auto trade setup: Duration {selectedDurationLabel} • Higher stake ${stake.toFixed(2)} • Lower stake ${lowerStake.toFixed(2)}
    </div>
  </div>
</div>
      <div className="mt-6">{tradeHistoryPanel}</div>
    </div>
  );
}
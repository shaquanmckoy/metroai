"use client";

import React, { useEffect, useMemo, useRef, useState } from "react";
import type { Pair } from "@/app/dashboard/page";

type PairOption = { code: string; label: string };

type PairGroups = {
  volatility: PairOption[];
  jump: PairOption[];
};

type EvenOddTrade = {
  id: number;
  source?: string;
  type?: string;
  result?: "Win" | "Loss" | "Pending";
  profit?: number;
  createdAt?: number;
};

type EvenOddPanelProps = {
  indexGroups: PairGroups;
  ticks: number[];
  selectedPair: Pair;
  setSelectedPair: (pair: Pair) => void;
  stake: number;
  setStake: (value: number) => void;
  currency: string;
  connected: boolean;
  tradeHistory: EvenOddTrade[];
  tradeHistoryPanel: React.ReactNode;
  onPlaceTrade: (type: "Even" | "Odd", duration: number, stake?: number) => void;
};

const AUTO_TRADE_DELAY_MS = 750;

export default function EvenOddPanel({
  indexGroups,
  ticks,
  selectedPair,
  setSelectedPair,
  stake,
  setStake,
  currency,
  connected,
  tradeHistory,
  tradeHistoryPanel,
  onPlaceTrade,
}: EvenOddPanelProps) {
  const [direction, setDirection] = useState<"Even" | "Odd">("Even");
  const [duration, setDuration] = useState(1);
  const [profitTarget, setProfitTarget] = useState("10");
  const [lossLimit, setLossLimit] = useState("10");
  const [martingaleEnabled, setMartingaleEnabled] = useState(false);
  const [martingaleMultiplier, setMartingaleMultiplier] = useState("2");
  const [maxRecoverySteps, setMaxRecoverySteps] = useState("3");
  const [maxMartingaleStake, setMaxMartingaleStake] = useState("25");
  const [autoRunning, setAutoRunning] = useState(false);
  const [sessionStartedAt, setSessionStartedAt] = useState<number | null>(null);
  const [sessionBaseStake, setSessionBaseStake] = useState<number | null>(null);
  const [autoStatus, setAutoStatus] = useState("Auto Trade is off.");
  const autoTimerRef = useRef<number | null>(null);
  const autoRunningRef = useRef(false);
  const placeTradeRef = useRef(onPlaceTrade);

  const recentDigits = ticks.slice(-100);
  const last20 = ticks.slice(-20);
  const evenCount = recentDigits.filter((digit) => digit % 2 === 0).length;
  const evenPercent = recentDigits.length ? (evenCount / recentDigits.length) * 100 : 0;
  const oddPercent = recentDigits.length ? 100 - evenPercent : 0;

  const evenOddTrades = useMemo(
    () => tradeHistory.filter((trade) => trade.source === "Even/Odd"),
    [tradeHistory]
  );

  const sessionTrades = useMemo(() => {
    if (sessionStartedAt === null) return [];
    return evenOddTrades.filter((trade) => Number(trade.createdAt ?? 0) >= sessionStartedAt);
  }, [evenOddTrades, sessionStartedAt]);

  const sessionNet = sessionTrades.reduce(
    (total, trade) => total + (trade.result === "Pending" ? 0 : Number(trade.profit ?? 0)),
    0
  );
  const sessionSettledCount = sessionTrades.filter((trade) => trade.result !== "Pending").length;
  const hasPendingTrade = sessionTrades.some((trade) => trade.result === "Pending");
  const hasAnyPendingEvenOddTrade = evenOddTrades.some((trade) => trade.result === "Pending");
  const profitTargetValue = Number(profitTarget);
  const lossLimitValue = Number(lossLimit);
  const martingaleMultiplierValue = Number(martingaleMultiplier);
  const maxRecoveryStepsValue = Number(maxRecoverySteps);
  const maxMartingaleStakeValue = Number(maxMartingaleStake);
  const baseAutoStake = sessionBaseStake ?? stake;
  const settledSessionTrades = useMemo(
    () =>
      sessionTrades
        .filter((trade) => trade.result === "Win" || trade.result === "Loss")
        .sort((a, b) => Number(a.createdAt ?? 0) - Number(b.createdAt ?? 0)),
    [sessionTrades]
  );
  const consecutiveLosses = (() => {
    let losses = 0;
    for (let index = settledSessionTrades.length - 1; index >= 0; index--) {
      if (settledSessionTrades[index].result !== "Loss") break;
      losses++;
    }
    return losses;
  })();
  const martingaleStep = martingaleEnabled ? consecutiveLosses : 0;
  const nextAutoStake = Number(
    (baseAutoStake * Math.pow(martingaleMultiplierValue, martingaleStep)).toFixed(2)
  );
  const remainingLossCapacity = lossLimitValue + sessionNet;
  const martingaleStepsExceeded =
    martingaleEnabled && consecutiveLosses > maxRecoveryStepsValue;
  const martingaleStakeExceeded =
    martingaleEnabled && nextAutoStake > maxMartingaleStakeValue;
  const lossLimitWouldBeExceeded =
    Number.isFinite(nextAutoStake) && nextAutoStake > Math.max(0, remainingLossCapacity);
  const projectedMartingaleStakes =
    martingaleEnabled &&
    Number.isFinite(martingaleMultiplierValue) &&
    martingaleMultiplierValue > 1 &&
    Number.isInteger(maxRecoveryStepsValue) &&
    maxRecoveryStepsValue >= 1 &&
    maxRecoveryStepsValue <= 10
      ? Array.from({ length: maxRecoveryStepsValue + 1 }, (_, step) =>
          Number((stake * Math.pow(martingaleMultiplierValue, step)).toFixed(2))
        )
      : [];

  useEffect(() => {
    autoRunningRef.current = autoRunning;
  }, [autoRunning]);

  useEffect(() => {
    placeTradeRef.current = onPlaceTrade;
  }, [onPlaceTrade]);

  useEffect(() => {
    if (!autoRunning || sessionStartedAt === null) return;

    if (!connected) {
      const stopTimer = window.setTimeout(() => {
        setAutoRunning(false);
        setAutoStatus("Auto Trade stopped because Deriv disconnected.");
      }, 0);
      return () => window.clearTimeout(stopTimer);
    }

    if (sessionNet >= profitTargetValue) {
      const stopTimer = window.setTimeout(() => {
        setAutoRunning(false);
        setAutoStatus(`Profit target reached: +${sessionNet.toFixed(2)} ${currency}`);
      }, 0);
      return () => window.clearTimeout(stopTimer);
    }

    if (sessionNet <= -lossLimitValue) {
      const stopTimer = window.setTimeout(() => {
        setAutoRunning(false);
        setAutoStatus(`Loss limit reached: ${sessionNet.toFixed(2)} ${currency}`);
      }, 0);
      return () => window.clearTimeout(stopTimer);
    }

    if (martingaleStepsExceeded) {
      const stopTimer = window.setTimeout(() => {
        setAutoRunning(false);
        setAutoStatus(
          `Martingale stopped after ${consecutiveLosses} consecutive losses. Maximum recovery steps reached.`
        );
      }, 0);
      return () => window.clearTimeout(stopTimer);
    }

    if (martingaleStakeExceeded) {
      const stopTimer = window.setTimeout(() => {
        setAutoRunning(false);
        setAutoStatus(
          `Martingale stopped because the next stake (${nextAutoStake.toFixed(2)} ${currency}) exceeds your maximum stake.`
        );
      }, 0);
      return () => window.clearTimeout(stopTimer);
    }

    if (lossLimitWouldBeExceeded) {
      const stopTimer = window.setTimeout(() => {
        setAutoRunning(false);
        setAutoStatus(
          `Auto Trade stopped because the next stake (${nextAutoStake.toFixed(2)} ${currency}) could exceed your loss limit.`
        );
      }, 0);
      return () => window.clearTimeout(stopTimer);
    }

    if (hasPendingTrade || autoTimerRef.current !== null) return;

    autoTimerRef.current = window.setTimeout(() => {
      autoTimerRef.current = null;
      if (!autoRunningRef.current) return;
      placeTradeRef.current(direction, duration, nextAutoStake);
    }, AUTO_TRADE_DELAY_MS);

    return () => {
      if (autoTimerRef.current !== null) {
        window.clearTimeout(autoTimerRef.current);
        autoTimerRef.current = null;
      }
    };
  }, [
    autoRunning,
    connected,
    currency,
    consecutiveLosses,
    direction,
    duration,
    hasPendingTrade,
    lossLimitValue,
    lossLimitWouldBeExceeded,
    martingaleStakeExceeded,
    martingaleStepsExceeded,
    nextAutoStake,
    profitTargetValue,
    sessionNet,
    sessionStartedAt,
  ]);

  useEffect(() => {
    return () => {
      autoRunningRef.current = false;
      if (autoTimerRef.current !== null) window.clearTimeout(autoTimerRef.current);
    };
  }, []);

  const startAutoTrade = () => {
    if (!connected) return alert("Connect your Deriv account first");
    if (!Number.isFinite(stake) || stake <= 0) return alert("Enter a valid stake amount");
    if (!Number.isFinite(profitTargetValue) || profitTargetValue <= 0) {
      return alert("Enter a profit target greater than 0");
    }
    if (!Number.isFinite(lossLimitValue) || lossLimitValue <= 0) {
      return alert("Enter a loss limit greater than 0");
    }
    if (stake > lossLimitValue) {
      return alert("Your starting stake must not be greater than your loss limit");
    }
    if (martingaleEnabled) {
      if (!Number.isFinite(martingaleMultiplierValue) || martingaleMultiplierValue <= 1) {
        return alert("Enter a Martingale multiplier greater than 1");
      }
      if (
        !Number.isInteger(maxRecoveryStepsValue) ||
        maxRecoveryStepsValue < 1 ||
        maxRecoveryStepsValue > 10
      ) {
        return alert("Maximum recovery steps must be a whole number from 1 to 10");
      }
      if (!Number.isFinite(maxMartingaleStakeValue) || maxMartingaleStakeValue < stake) {
        return alert("Maximum Martingale stake must be at least your starting stake");
      }
    }
    if (hasAnyPendingEvenOddTrade) return alert("Wait for the current Even/Odd trade to settle");

    setSessionStartedAt(Date.now());
    setSessionBaseStake(stake);
    setAutoStatus(`Auto Trade started with ${direction}.`);
    setAutoRunning(true);
  };

  const stopAutoTrade = () => {
    autoRunningRef.current = false;
    setAutoRunning(false);
    setAutoStatus("Auto Trade stopped. An open contract will still settle normally.");
    if (autoTimerRef.current !== null) {
      window.clearTimeout(autoTimerRef.current);
      autoTimerRef.current = null;
    }
  };

  const placeManualTrade = (type: "Even" | "Odd") => {
    if (!connected) return alert("Connect your Deriv account first");
    if (!Number.isFinite(stake) || stake <= 0) return alert("Enter a valid stake amount");
    if (hasAnyPendingEvenOddTrade) return alert("Wait for the current Even/Odd trade to settle");
    onPlaceTrade(type, duration, stake);
  };

  const displayedAutoStatus = autoRunning
    ? hasPendingTrade
      ? "Waiting for the current contract to settle..."
      : `Preparing ${direction.toLowerCase()} with ${nextAutoStake.toFixed(2)} ${currency}${
          martingaleEnabled ? ` • Martingale step ${martingaleStep}/${maxRecoveryStepsValue}` : ""
        }...`
    : autoStatus;

  return (
    <div className="space-y-6 bg-[radial-gradient(circle_at_top_left,rgba(168,85,247,0.18),rgba(15,23,42,0.96)_45%,rgba(2,6,23,0.99))] p-6">
      <div className="flex flex-col gap-4 md:flex-row md:items-start md:justify-between">
        <div>
          <p className="text-2xl font-bold text-white">Even/Odd Strategy</p>
          <p className="mt-1 max-w-2xl text-sm text-white/55">
            Trade one contract at a time and stop automatically when your session reaches the profit target or loss limit.
          </p>
        </div>

        <div className="flex flex-wrap gap-2 text-xs font-semibold">
          <span className="rounded-full border border-purple-400/25 bg-purple-500/10 px-3 py-1 text-purple-200">
            {selectedPair}
          </span>
          <span className="rounded-full border border-white/10 bg-white/5 px-3 py-1 text-white/70">
            {stake.toFixed(2)} {currency}
          </span>
          <span
            className={`rounded-full border px-3 py-1 ${
              connected
                ? "border-emerald-400/25 bg-emerald-500/10 text-emerald-200"
                : "border-red-400/25 bg-red-500/10 text-red-200"
            }`}
          >
            {connected ? "Deriv connected" : "Deriv disconnected"}
          </span>
        </div>
      </div>

      <div className="grid gap-4 md:grid-cols-3">
        <div className="rounded-2xl border border-white/10 bg-black/20 p-4">
          <p className="text-xs uppercase tracking-[0.18em] text-white/45">Recent Even</p>
          <p className="mt-2 text-2xl font-bold text-sky-300">{evenPercent.toFixed(1)}%</p>
        </div>
        <div className="rounded-2xl border border-white/10 bg-black/20 p-4">
          <p className="text-xs uppercase tracking-[0.18em] text-white/45">Recent Odd</p>
          <p className="mt-2 text-2xl font-bold text-purple-300">{oddPercent.toFixed(1)}%</p>
        </div>
        <div className="rounded-2xl border border-white/10 bg-black/20 p-4">
          <p className="text-xs uppercase tracking-[0.18em] text-white/45">Auto Session P/L</p>
          <p className={`mt-2 text-2xl font-bold ${sessionNet >= 0 ? "text-emerald-300" : "text-red-300"}`}>
            {sessionNet >= 0 ? "+" : ""}{sessionNet.toFixed(2)} {currency}
          </p>
          <p className="mt-1 text-xs text-white/45">{sessionSettledCount} settled contract(s)</p>
        </div>
      </div>

      <div className="rounded-2xl border border-white/10 bg-black/20 p-5">
        <div className="grid gap-4 md:grid-cols-2">
          <label className="space-y-2 text-sm text-white/75">
            <span className="block text-xs uppercase tracking-[0.18em] text-white/45">Index</span>
            <select
              value={selectedPair}
              disabled={autoRunning}
              onChange={(event) => setSelectedPair(event.target.value as Pair)}
              className="w-full rounded-xl border border-white/10 bg-[#0b1220] px-4 py-3 text-white outline-none disabled:opacity-60"
            >
              <optgroup label="Volatility Indices">
                {indexGroups.volatility.map((item) => (
                  <option key={item.code} value={item.code}>{item.label}</option>
                ))}
              </optgroup>
              <optgroup label="Jump Indices">
                {indexGroups.jump.map((item) => (
                  <option key={item.code} value={item.code}>{item.label}</option>
                ))}
              </optgroup>
            </select>
          </label>

          <label className="space-y-2 text-sm text-white/75">
            <span className="block text-xs uppercase tracking-[0.18em] text-white/45">Duration</span>
            <select
              value={duration}
              disabled={autoRunning}
              onChange={(event) => setDuration(Number(event.target.value))}
              className="w-full rounded-xl border border-white/10 bg-[#0b1220] px-4 py-3 text-white outline-none disabled:opacity-60"
            >
              {[1, 2, 3, 5, 10].map((value) => (
                <option key={value} value={value}>{value} tick{value === 1 ? "" : "s"}</option>
              ))}
            </select>
          </label>

          <label className="space-y-2 text-sm text-white/75">
            <span className="block text-xs uppercase tracking-[0.18em] text-white/45">Stake Amount</span>
            <input
              type="number"
              min="0.1"
              step="0.1"
              value={stake}
              disabled={autoRunning}
              onChange={(event) => setStake(Number(event.target.value))}
              className="w-full rounded-xl border border-white/10 bg-[#0b1220] px-4 py-3 text-white outline-none disabled:opacity-60"
            />
          </label>

          <div className="space-y-2 text-sm text-white/75">
            <span className="block text-xs uppercase tracking-[0.18em] text-white/45">Auto Direction</span>
            <div className="grid grid-cols-2 gap-2">
              {(["Even", "Odd"] as const).map((type) => (
                <button
                  key={type}
                  type="button"
                  disabled={autoRunning}
                  onClick={() => setDirection(type)}
                  className={`rounded-xl border px-4 py-3 font-semibold transition disabled:opacity-60 ${
                    direction === type
                      ? "border-purple-400/40 bg-purple-500/20 text-purple-100"
                      : "border-white/10 bg-white/5 text-white/70 hover:bg-white/10"
                  }`}
                >
                  {type}
                </button>
              ))}
            </div>
          </div>

          <label className="space-y-2 text-sm text-white/75">
            <span className="block text-xs uppercase tracking-[0.18em] text-white/45">Profit Target</span>
            <input
              type="number"
              min="0.01"
              step="0.01"
              value={profitTarget}
              disabled={autoRunning}
              onChange={(event) => setProfitTarget(event.target.value)}
              className="w-full rounded-xl border border-emerald-400/20 bg-[#0b1220] px-4 py-3 text-white outline-none disabled:opacity-60"
            />
          </label>

          <label className="space-y-2 text-sm text-white/75">
            <span className="block text-xs uppercase tracking-[0.18em] text-white/45">Loss Limit</span>
            <input
              type="number"
              min="0.01"
              step="0.01"
              value={lossLimit}
              disabled={autoRunning}
              onChange={(event) => setLossLimit(event.target.value)}
              className="w-full rounded-xl border border-red-400/20 bg-[#0b1220] px-4 py-3 text-white outline-none disabled:opacity-60"
            />
          </label>
        </div>

        <div className="mt-5 rounded-2xl border border-amber-400/20 bg-amber-500/[0.06] p-4">
          <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
            <div>
              <p className="font-semibold text-amber-100">Optional Martingale</p>
              <p className="mt-1 text-xs text-white/55">
                Increase the next Auto Trade stake after a loss and reset to the starting stake after a win.
              </p>
            </div>
            <button
              type="button"
              disabled={autoRunning}
              onClick={() => setMartingaleEnabled((enabled) => !enabled)}
              className={`rounded-full border px-4 py-2 text-xs font-bold transition disabled:opacity-60 ${
                martingaleEnabled
                  ? "border-amber-300/40 bg-amber-400/20 text-amber-100"
                  : "border-white/10 bg-white/5 text-white/65 hover:bg-white/10"
              }`}
            >
              {martingaleEnabled ? "Martingale On" : "Martingale Off"}
            </button>
          </div>

          {martingaleEnabled && (
            <div className="mt-4 space-y-4">
              <div className="grid gap-3 md:grid-cols-3">
                <label className="space-y-2 text-sm text-white/75">
                  <span className="block text-xs uppercase tracking-[0.14em] text-white/45">Multiplier</span>
                  <input
                    type="number"
                    min="1.01"
                    max="10"
                    step="0.01"
                    value={martingaleMultiplier}
                    disabled={autoRunning}
                    onChange={(event) => setMartingaleMultiplier(event.target.value)}
                    className="w-full rounded-xl border border-amber-400/20 bg-[#0b1220] px-4 py-3 text-white outline-none disabled:opacity-60"
                  />
                </label>

                <label className="space-y-2 text-sm text-white/75">
                  <span className="block text-xs uppercase tracking-[0.14em] text-white/45">Max Recovery Steps</span>
                  <input
                    type="number"
                    min="1"
                    max="10"
                    step="1"
                    value={maxRecoverySteps}
                    disabled={autoRunning}
                    onChange={(event) => setMaxRecoverySteps(event.target.value)}
                    className="w-full rounded-xl border border-amber-400/20 bg-[#0b1220] px-4 py-3 text-white outline-none disabled:opacity-60"
                  />
                </label>

                <label className="space-y-2 text-sm text-white/75">
                  <span className="block text-xs uppercase tracking-[0.14em] text-white/45">Maximum Stake</span>
                  <input
                    type="number"
                    min="0.1"
                    step="0.01"
                    value={maxMartingaleStake}
                    disabled={autoRunning}
                    onChange={(event) => setMaxMartingaleStake(event.target.value)}
                    className="w-full rounded-xl border border-amber-400/20 bg-[#0b1220] px-4 py-3 text-white outline-none disabled:opacity-60"
                  />
                </label>
              </div>

              {projectedMartingaleStakes.length > 0 && (
                <div>
                  <p className="text-xs uppercase tracking-[0.14em] text-white/45">Projected Stake Ladder</p>
                  <div className="mt-2 flex flex-wrap gap-2">
                    {projectedMartingaleStakes.map((projectedStake, step) => {
                      const exceedsMaximum = projectedStake > maxMartingaleStakeValue;
                      return (
                        <span
                          key={`${step}-${projectedStake}`}
                          className={`rounded-lg border px-3 py-2 text-xs font-semibold ${
                            exceedsMaximum
                              ? "border-red-400/30 bg-red-500/10 text-red-200"
                              : "border-amber-400/20 bg-amber-500/10 text-amber-100"
                          }`}
                        >
                          {step === 0 ? "Base" : `Step ${step}`}: {projectedStake.toFixed(2)} {currency}
                          {exceedsMaximum ? " • STOP" : ""}
                        </span>
                      );
                    })}
                  </div>
                </div>
              )}

              <p className="text-xs leading-relaxed text-amber-100/70">
                A 2× multiplier may not recover every Deriv loss because the winning profit can be less than the stake. Martingale does not guarantee profit. Auto Trade stops instead of exceeding your recovery-step, maximum-stake, or loss limits.
              </p>
            </div>
          )}
        </div>

        <div className="mt-5 grid grid-cols-2 gap-3">
          <button
            type="button"
            disabled={autoRunning || hasAnyPendingEvenOddTrade}
            onClick={() => placeManualTrade("Even")}
            className="rounded-xl bg-sky-600 px-4 py-3 font-semibold text-white transition hover:bg-sky-700 disabled:cursor-not-allowed disabled:opacity-50"
          >
            Trade Even
          </button>
          <button
            type="button"
            disabled={autoRunning || hasAnyPendingEvenOddTrade}
            onClick={() => placeManualTrade("Odd")}
            className="rounded-xl bg-purple-600 px-4 py-3 font-semibold text-white transition hover:bg-purple-700 disabled:cursor-not-allowed disabled:opacity-50"
          >
            Trade Odd
          </button>
        </div>

        <button
          type="button"
          onClick={autoRunning ? stopAutoTrade : startAutoTrade}
          className={`mt-3 w-full rounded-xl px-4 py-4 font-bold text-white transition ${
            autoRunning ? "bg-red-600 hover:bg-red-700" : "bg-emerald-600 hover:bg-emerald-700"
          }`}
        >
          {autoRunning ? "Stop Auto Trade" : "Start Auto Trade"}
        </button>

        <p className="mt-3 text-center text-xs text-white/55">{displayedAutoStatus}</p>
        <p className="mt-2 text-center text-[11px] text-amber-200/70">
          Recent digit percentages are descriptive only and do not guarantee the next result. Auto Trade never opens overlapping contracts
          {martingaleEnabled ? " and resets the stake after a win." : " and uses a fixed stake."}
        </p>
      </div>

      <div className="rounded-2xl border border-white/10 bg-black/20 p-4">
        <p className="mb-3 text-xs uppercase tracking-[0.18em] text-white/45">Last 20 Digits</p>
        <div className="flex flex-wrap gap-2">
          {last20.length ? (
            last20.map((digit, index) => (
              <span
                key={`${index}-${digit}`}
                className={`flex h-8 w-8 items-center justify-center rounded-lg border text-xs font-bold ${
                  digit % 2 === 0
                    ? "border-sky-400/20 bg-sky-500/10 text-sky-200"
                    : "border-purple-400/20 bg-purple-500/10 text-purple-200"
                }`}
              >
                {digit}
              </span>
            ))
          ) : (
            <p className="text-sm text-white/50">Connect Deriv to collect live digits.</p>
          )}
        </div>
      </div>

      {tradeHistoryPanel}
    </div>
  );
}

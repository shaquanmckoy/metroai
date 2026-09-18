"use client";

import React, { useEffect, useMemo, useRef, useState } from "react";
import type { Pair } from "@/app/dashboard/page";
import {
  analyzeFixedDirectionConfidence,
  analyzeEvenOddSignal,
  buildAdaptiveRecoveryLadder,
  buildExecutableRecoverySequence,
  buildMultiplierRecoveryLadder,
  roundStakeUp,
  type EvenOddDirection,
  type SignalProfile,
} from "@/components/dashboard/strategies/even-odd-engine";

type PairOption = { code: string; label: string };

type PairGroups = {
  volatility: PairOption[];
  jump: PairOption[];
};

type PairScanResult = {
  pair: Pair;
  label: string;
  winRate: number;
  confidenceLowerBound: number;
  samples: number;
};

type EvenOddTrade = {
  id: number;
  source?: string;
  symbol?: Pair;
  type?: string;
  result?: "Win" | "Loss" | "Pending";
  stake?: number;
  durationTicks?: number;
  profit?: number;
  expectedPayout?: number;
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
  requestPayoutPreview: (options: {
    direction: EvenOddDirection;
    durationTicks: number;
    customStake: number;
  }) => Promise<{ payout: number; askPrice: number; profitRate: number }>;
  pairDigitsByPair: Partial<Record<Pair, number[]>>;
  onRequestPairScanFeeds: () => void;
  onAutoSelectPair: (pair: Pair) => void;
};

const AUTO_TRADE_DELAY_MS = 750;
const PRESET_RECOVERY_STEPS = 2;

const formatCooldownTime = (seconds: number): string => {
  const safeSeconds = Math.max(0, Math.floor(seconds));
  const minutes = Math.floor(safeSeconds / 60);
  const remainingSeconds = safeSeconds % 60;
  return `${minutes}:${String(remainingSeconds).padStart(2, "0")}`;
};

type MartingalePreset = {
  id: "starter" | "standard";
  label: string;
  baseStake: number;
  profitTarget: number;
  lossLimit: number | null;
  autoMode: "smart" | "fixed";
  recoveryMode: "adaptive" | "multiplier";
  multiplier: number;
  recoverySteps: number;
  maximumStake: number | null;
  maximumTrades: number;
  description: string;
};

const MARTINGALE_PRESETS: readonly MartingalePreset[] = [
  {
    id: "starter",
    label: "Starter",
    baseStake: 0.35,
    profitTarget: 1,
    lossLimit: 1000,
    autoMode: "fixed",
    recoveryMode: "multiplier",
    multiplier: 2.5,
    recoverySteps: 10,
    maximumStake: 1000,
    maximumTrades: 20,
    description: "Fixed entry • 2.5x recovery • 10 steps • 20 trades max",
  },
  {
    id: "standard",
    label: "Standard",
    baseStake: 1,
    profitTarget: 2,
    lossLimit: null,
    autoMode: "smart",
    recoveryMode: "adaptive",
    multiplier: 2,
    recoverySteps: PRESET_RECOVERY_STEPS,
    maximumStake: null,
    maximumTrades: 10,
    description: "Research entry • 2 payout-aware recovery steps",
  },
];

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
  requestPayoutPreview,
  pairDigitsByPair,
  onRequestPairScanFeeds,
  onAutoSelectPair,
}: EvenOddPanelProps) {
  const [direction, setDirection] = useState<EvenOddDirection>("Even");
  const [autoMode, setAutoMode] = useState<"smart" | "fixed">("smart");
  const [signalProfile, setSignalProfile] = useState<SignalProfile>("conservative");
  const [duration, setDuration] = useState(1);
  const [profitTarget, setProfitTarget] = useState("10");
  const [lossLimit, setLossLimit] = useState("10");
  const [martingaleEnabled, setMartingaleEnabled] = useState(false);
  const [recoveryMode, setRecoveryMode] = useState<"adaptive" | "multiplier">("adaptive");
  const [martingaleMultiplier, setMartingaleMultiplier] = useState("2");
  const [maxRecoverySteps, setMaxRecoverySteps] = useState("3");
  const [maxMartingaleStake, setMaxMartingaleStake] = useState("25");
  const [maxSessionTrades, setMaxSessionTrades] = useState("10");
  const [martingaleDetailsOpen, setMartingaleDetailsOpen] = useState(true);
  const [profitCooldownMinutes, setProfitCooldownMinutes] = useState("2");
  const [profitCooldownRemainingSeconds, setProfitCooldownRemainingSeconds] = useState<
    number | null
  >(null);
  const [pairScannerEnabled, setPairScannerEnabled] = useState(false);
  const [pairScannerStatus, setPairScannerStatus] = useState(
    "Best Pair Scan is off."
  );
  const [autoRunning, setAutoRunning] = useState(false);
  const [sessionStartedAt, setSessionStartedAt] = useState<number | null>(null);
  const [sessionBaseStake, setSessionBaseStake] = useState<number | null>(null);
  const [autoStatus, setAutoStatus] = useState("Auto Trade is off.");
  const [selectedPresetId, setSelectedPresetId] = useState<MartingalePreset["id"] | null>(null);
  const [presetConfiguration, setPresetConfiguration] = useState<{
    id: MartingalePreset["id"];
    pair: Pair;
    duration: number;
    stake: number;
    live: boolean;
  } | null>(null);
  const [presetLoading, setPresetLoading] = useState(false);
  const [presetStatus, setPresetStatus] = useState(
    "Choose a preset to calculate its limits from the current Deriv payout."
  );
  const [payoutPreview, setPayoutPreview] = useState<{
    pair: Pair;
    duration: number;
    stake: number;
    settledCount: number;
    profitRate: number;
    evenProfitRate: number;
    oddProfitRate: number;
  } | null>(null);
  const [payoutQuoteLoading, setPayoutQuoteLoading] = useState(false);
  const [lastAutoTradeTickDisplay, setLastAutoTradeTickDisplay] = useState(-1);
  const [resumeAfterTickDisplay, setResumeAfterTickDisplay] = useState(0);
  const autoTimerRef = useRef<number | null>(null);
  const autoRunningRef = useRef(false);
  const placeTradeRef = useRef(onPlaceTrade);
  const requestPayoutPreviewRef = useRef(requestPayoutPreview);
  const lastAutoTradeTickRef = useRef(-1);
  const lastHandledSettlementRef = useRef<number | null>(null);
  const resumeAfterTickRef = useRef(0);
  const scannerLockedPairRef = useRef<Pair | null>(null);

  const recentDigits = ticks.slice(-100);
  const last20 = ticks.slice(-20);
  const evenCount = recentDigits.filter((digit) => digit % 2 === 0).length;
  const evenPercent = recentDigits.length ? (evenCount / recentDigits.length) * 100 : 0;
  const oddPercent = recentDigits.length ? 100 - evenPercent : 0;
  const pairScanRankings = useMemo(() => {
    const pairOptions = [...indexGroups.volatility, ...indexGroups.jump];

    return pairOptions
      .map((option): PairScanResult | null => {
        const pair = option.code as Pair;
        const confidence = analyzeFixedDirectionConfidence(
          pairDigitsByPair[pair] ?? [],
          direction
        );
        if (!confidence.ready) return null;

        return {
          pair,
          label: option.label,
          winRate: confidence.winRate,
          confidenceLowerBound: confidence.confidenceLowerBound,
          samples: confidence.samples,
        };
      })
      .filter((result): result is PairScanResult => result !== null)
      .sort(
        (a, b) =>
          b.confidenceLowerBound - a.confidenceLowerBound ||
          b.winRate - a.winRate ||
          b.samples - a.samples
      );
  }, [direction, indexGroups.jump, indexGroups.volatility, pairDigitsByPair]);
  const bestScannedPair = pairScanRankings[0] ?? null;
  const totalPairScanCandidates = indexGroups.volatility.length + indexGroups.jump.length;
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
  const maxSessionTradesValue = Number(maxSessionTrades);
  const profitCooldownMinutesValue = Number(profitCooldownMinutes);
  const baseAutoStake = sessionBaseStake ?? stake;
  const settledSessionTrades = useMemo(
    () =>
      sessionTrades
        .filter((trade) => trade.result === "Win" || trade.result === "Loss")
        .sort((a, b) => Number(a.createdAt ?? 0) - Number(b.createdAt ?? 0)),
    [sessionTrades]
  );
  const latestSettledTrade = settledSessionTrades[settledSessionTrades.length - 1];
  const consecutiveLosses = (() => {
    let losses = 0;
    for (let index = settledSessionTrades.length - 1; index >= 0; index--) {
      if (settledSessionTrades[index].result !== "Loss") break;
      losses++;
    }
    return losses;
  })();
  const trailingLossAmount = (() => {
    let total = 0;
    for (let index = settledSessionTrades.length - 1; index >= 0; index--) {
      const trade = settledSessionTrades[index];
      if (trade.result !== "Loss") break;
      const recordedLoss = Math.abs(Math.min(0, Number(trade.profit ?? 0)));
      total += recordedLoss > 0 ? recordedLoss : Number(trade.stake ?? 0);
    }
    return total;
  })();
  const payoutRateSamples = evenOddTrades
    .filter(
      (trade) =>
        trade.symbol === selectedPair &&
        trade.durationTicks === duration &&
        Number(trade.stake ?? 0) > 0 &&
        Number(trade.expectedPayout ?? 0) > Number(trade.stake ?? 0)
    )
    .sort((a, b) => Number(b.createdAt ?? 0) - Number(a.createdAt ?? 0))
    .slice(0, 5)
    .map(
      (trade) =>
        (Number(trade.expectedPayout) - Number(trade.stake)) / Number(trade.stake)
    )
    .filter((rate) => Number.isFinite(rate) && rate > 0);
  const currentPreviewRate =
    payoutPreview?.pair === selectedPair &&
    payoutPreview.duration === duration &&
    Math.abs(payoutPreview.stake - stake) < 0.005 &&
    payoutPreview.settledCount === sessionSettledCount
      ? payoutPreview.profitRate
      : null;
  const selectedPreset = MARTINGALE_PRESETS.find(
    (preset) => preset.id === selectedPresetId
  );
  const presetRequiresRefresh =
    selectedPresetId !== null &&
    selectedPreset?.recoveryMode === "adaptive" &&
    connected &&
    (currentPreviewRate === null ||
      presetConfiguration === null ||
      !presetConfiguration.live ||
      presetConfiguration.id !== selectedPresetId ||
      presetConfiguration.pair !== selectedPair ||
      presetConfiguration.duration !== duration ||
      Math.abs(presetConfiguration.stake - stake) >= 0.005);
  const estimatedProfitRate = (() => {
    if (!payoutRateSamples.length) return 0.9;
    const sorted = [...payoutRateSamples].sort((a, b) => a - b);
    return sorted[Math.floor(sorted.length / 2)];
  })();
  const recoveryProfitRate = currentPreviewRate ?? estimatedProfitRate;
  const smartSignal = useMemo(
    () => analyzeEvenOddSignal(ticks, signalProfile, recoveryProfitRate),
    [recoveryProfitRate, signalProfile, ticks]
  );
  const smartEntryReady = currentPreviewRate !== null && smartSignal.ready;
  const adaptivePayoutReady =
    !martingaleEnabled || recoveryMode !== "adaptive" || currentPreviewRate !== null;
  const martingaleStep = martingaleEnabled ? consecutiveLosses : 0;
  const adaptiveRecoveryStake =
    martingaleStep > 0
      ? roundStakeUp(
          (trailingLossAmount + baseAutoStake * recoveryProfitRate) / recoveryProfitRate
        )
      : roundStakeUp(baseAutoStake);
  const nextAutoStake = martingaleEnabled
    ? recoveryMode === "adaptive"
      ? adaptiveRecoveryStake
      : roundStakeUp(baseAutoStake * Math.pow(martingaleMultiplierValue, martingaleStep))
    : roundStakeUp(baseAutoStake);
  const remainingLossCapacity = lossLimitValue + sessionNet;
  const martingaleStepsExceeded =
    martingaleEnabled && consecutiveLosses > maxRecoveryStepsValue;
  const martingaleStakeExceeded =
    martingaleEnabled && nextAutoStake > maxMartingaleStakeValue;
  const lossLimitWouldBeExceeded =
    Number.isFinite(nextAutoStake) &&
    nextAutoStake > Math.max(0, remainingLossCapacity) + 0.005;
  const projectedMartingaleStakes = (() => {
    if (
      !martingaleEnabled ||
      !Number.isInteger(maxRecoveryStepsValue) ||
      maxRecoveryStepsValue < 1 ||
      maxRecoveryStepsValue > 10
    ) {
      return [];
    }
    if (
      recoveryMode === "multiplier" &&
      (!Number.isFinite(martingaleMultiplierValue) || martingaleMultiplierValue <= 1)
    ) {
      return [];
    }

    if (recoveryMode === "adaptive") {
      return buildAdaptiveRecoveryLadder(stake, recoveryProfitRate, maxRecoveryStepsValue);
    }

    return buildMultiplierRecoveryLadder(
      stake,
      martingaleMultiplierValue,
      maxRecoveryStepsValue
    );
  })();
  const projectedSequenceStakes = martingaleEnabled
    ? buildExecutableRecoverySequence(
        projectedMartingaleStakes,
        maxMartingaleStakeValue,
        lossLimitValue
      )
    : [roundStakeUp(stake)];
  const projectedTotalExposure = roundStakeUp(
    projectedSequenceStakes.reduce((total, projectedStake) => total + projectedStake, 0)
  );
  const sessionTradeLimitReached = sessionSettledCount >= maxSessionTradesValue;
  const sequenceFailureProbability =
    projectedSequenceStakes.length > 0
      ? Math.pow(0.5, projectedSequenceStakes.length)
      : 0;
  const autoDirection = autoMode === "smart" ? smartSignal.direction : direction;
  const recoveryPauseRemaining = Math.max(0, resumeAfterTickDisplay - ticks.length);

  useEffect(() => {
    autoRunningRef.current = autoRunning;
  }, [autoRunning]);

  useEffect(() => {
    placeTradeRef.current = onPlaceTrade;
  }, [onPlaceTrade]);

  useEffect(() => {
    requestPayoutPreviewRef.current = requestPayoutPreview;
  }, [requestPayoutPreview]);

  useEffect(() => {
    let cancelled = false;

    if (!connected || !Number.isFinite(stake) || stake <= 0) {
      const resetTimer = window.setTimeout(() => {
        setPayoutPreview(null);
        setPayoutQuoteLoading(false);
      }, 0);
      return () => window.clearTimeout(resetTimer);
    }

    const quoteTimer = window.setTimeout(() => {
      setPayoutPreview(null);
      setPayoutQuoteLoading(true);
      void Promise.all([
        requestPayoutPreviewRef.current({
          direction: "Even",
          durationTicks: duration,
          customStake: stake,
        }),
        requestPayoutPreviewRef.current({
          direction: "Odd",
          durationTicks: duration,
          customStake: stake,
        }),
      ])
        .then(([evenPreview, oddPreview]) => {
          if (cancelled) return;
          const rates = [evenPreview.profitRate, oddPreview.profitRate];
          if (rates.some((rate) => !Number.isFinite(rate) || rate <= 0)) {
            setPayoutPreview(null);
            return;
          }

          setPayoutPreview({
            pair: selectedPair,
            duration,
            stake,
            settledCount: sessionSettledCount,
            profitRate: Math.min(...rates),
            evenProfitRate: evenPreview.profitRate,
            oddProfitRate: oddPreview.profitRate,
          });
        })
        .catch(() => {
          if (!cancelled) setPayoutPreview(null);
        })
        .finally(() => {
          if (!cancelled) setPayoutQuoteLoading(false);
        });
    }, 450);

    return () => {
      cancelled = true;
      window.clearTimeout(quoteTimer);
    };
  }, [connected, duration, selectedPair, sessionSettledCount, stake]);

  useEffect(() => {
    if (!autoRunning || sessionStartedAt === null) return;

    if (
      latestSettledTrade &&
      latestSettledTrade.id !== lastHandledSettlementRef.current
    ) {
      lastHandledSettlementRef.current = latestSettledTrade.id;
      scannerLockedPairRef.current = null;
      resumeAfterTickRef.current =
        latestSettledTrade.result === "Loss" ? ticks.length + 2 : ticks.length;
      window.setTimeout(() => setResumeAfterTickDisplay(resumeAfterTickRef.current), 0);
    }

    if (!connected) {
      const stopTimer = window.setTimeout(() => {
        setAutoRunning(false);
        setAutoStatus("Auto Trade stopped because Deriv disconnected.");
      }, 0);
      return () => window.clearTimeout(stopTimer);
    }

    if (profitCooldownRemainingSeconds !== null) return;

    if (sessionNet >= profitTargetValue) {
      const cooldownTimer = window.setTimeout(() => {
        const cooldownSeconds = profitCooldownMinutesValue * 60;
        setProfitCooldownRemainingSeconds(cooldownSeconds);
        setAutoStatus(
          `Profit target reached: +${sessionNet.toFixed(2)} ${currency}. Cooling down for ${profitCooldownMinutesValue} minutes.`
        );
      }, 0);
      return () => window.clearTimeout(cooldownTimer);
    }

    if (sessionNet <= -lossLimitValue) {
      const stopTimer = window.setTimeout(() => {
        setAutoRunning(false);
        setAutoStatus(`Loss limit reached: ${sessionNet.toFixed(2)} ${currency}`);
      }, 0);
      return () => window.clearTimeout(stopTimer);
    }

    if (sessionTradeLimitReached) {
      const stopTimer = window.setTimeout(() => {
        setAutoRunning(false);
        setAutoStatus(
          `Session trade cap reached after ${sessionSettledCount} settled contracts.`
        );
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
    if (ticks.length < resumeAfterTickRef.current) return;
    if (pairScannerEnabled && autoMode === "fixed") {
      if (!bestScannedPair) return;

      const scannerTarget = scannerLockedPairRef.current ?? bestScannedPair.pair;
      scannerLockedPairRef.current = scannerTarget;

      if (scannerTarget !== selectedPair) {
        const targetResult = pairScanRankings.find(
          (result) => result.pair === scannerTarget
        );
        const targetTickCount = pairDigitsByPair[scannerTarget]?.length ?? 0;
        const switchTimer = window.setTimeout(() => {
          lastAutoTradeTickRef.current = targetTickCount;
          setLastAutoTradeTickDisplay(targetTickCount);
          onAutoSelectPair(scannerTarget);
          setPairScannerStatus(
            targetResult
              ? `Switched to ${targetResult.label}: ${(targetResult.winRate * 100).toFixed(1)}% ${direction.toLowerCase()} win rate with a ${(targetResult.confidenceLowerBound * 100).toFixed(1)}% confidence floor.`
              : `Switched to ${scannerTarget}.`
          );
        }, 0);
        return () => window.clearTimeout(switchTimer);
      }
    }
    if (ticks.length <= lastAutoTradeTickRef.current) return;
    if (!adaptivePayoutReady) return;
    if (autoMode === "smart" && !smartEntryReady) return;

    autoTimerRef.current = window.setTimeout(() => {
      autoTimerRef.current = null;
      if (!autoRunningRef.current) return;
      lastAutoTradeTickRef.current = ticks.length;
      setLastAutoTradeTickDisplay(ticks.length);
      placeTradeRef.current(autoDirection, duration, nextAutoStake);
    }, AUTO_TRADE_DELAY_MS);

    return () => {
      if (autoTimerRef.current !== null) {
        window.clearTimeout(autoTimerRef.current);
        autoTimerRef.current = null;
      }
    };
  }, [
    autoRunning,
    autoDirection,
    autoMode,
    adaptivePayoutReady,
    connected,
    currency,
    consecutiveLosses,
    direction,
    duration,
    hasPendingTrade,
    latestSettledTrade,
    lossLimitValue,
    lossLimitWouldBeExceeded,
    martingaleStakeExceeded,
    martingaleStepsExceeded,
    nextAutoStake,
    onAutoSelectPair,
    pairDigitsByPair,
    pairScannerEnabled,
    pairScanRankings,
    profitCooldownMinutesValue,
    profitCooldownRemainingSeconds,
    profitTargetValue,
    sessionNet,
    sessionSettledCount,
    sessionStartedAt,
    sessionTradeLimitReached,
    selectedPair,
    smartEntryReady,
    bestScannedPair,
    ticks.length,
  ]);

  useEffect(() => {
    if (!autoRunning || profitCooldownRemainingSeconds === null) return;

    if (profitCooldownRemainingSeconds <= 0) {
      const restartTimer = window.setTimeout(() => {
        const nextSessionBoundary =
          Math.max(
            Number(latestSettledTrade?.createdAt ?? 0),
            Number(sessionStartedAt ?? 0)
          ) + 1;
        setSessionStartedAt(nextSessionBoundary);
        setProfitCooldownRemainingSeconds(null);
        scannerLockedPairRef.current = null;
        lastAutoTradeTickRef.current = ticks.length;
        setLastAutoTradeTickDisplay(ticks.length);
        lastHandledSettlementRef.current = null;
        resumeAfterTickRef.current = ticks.length;
        setResumeAfterTickDisplay(ticks.length);
        setAutoStatus("Profit cooldown finished. Auto Trade is waiting for a fresh entry.");
      }, 0);
      return () => window.clearTimeout(restartTimer);
    }

    const countdownTimer = window.setInterval(() => {
      setProfitCooldownRemainingSeconds((remaining) =>
        remaining === null ? null : Math.max(0, remaining - 1)
      );
    }, 1000);

    return () => window.clearInterval(countdownTimer);
  }, [
    autoRunning,
    latestSettledTrade?.createdAt,
    profitCooldownRemainingSeconds,
    sessionStartedAt,
    ticks.length,
  ]);

  useEffect(() => {
    return () => {
      autoRunningRef.current = false;
      if (autoTimerRef.current !== null) window.clearTimeout(autoTimerRef.current);
    };
  }, []);

  const configurePreset = (
    preset: MartingalePreset,
    profitRate: number,
    status: string,
    live: boolean
  ) => {
    const ladder =
      preset.recoveryMode === "adaptive"
        ? buildAdaptiveRecoveryLadder(
            preset.baseStake,
            profitRate,
            preset.recoverySteps
          )
        : buildMultiplierRecoveryLadder(
            preset.baseStake,
            preset.multiplier,
            preset.recoverySteps
          );
    const totalExposure = roundStakeUp(
      ladder.reduce((total, ladderStake) => total + ladderStake, 0)
    );

    setStake(preset.baseStake);
    setProfitTarget(String(preset.profitTarget));
    setLossLimit(String(preset.lossLimit ?? totalExposure.toFixed(2)));
    setAutoMode(preset.autoMode);
    setPairScannerEnabled(false);
    setPairScannerStatus("Best Pair Scan is off.");
    scannerLockedPairRef.current = null;
    setMartingaleEnabled(true);
    setRecoveryMode(preset.recoveryMode);
    setMartingaleMultiplier(String(preset.multiplier));
    setMaxRecoverySteps(String(preset.recoverySteps));
    setMaxMartingaleStake(
      String(preset.maximumStake ?? ladder[ladder.length - 1] ?? preset.baseStake)
    );
    setMaxSessionTrades(String(preset.maximumTrades));
    setMartingaleDetailsOpen(true);
    setSelectedPresetId(preset.id);
    setPresetConfiguration({
      id: preset.id,
      pair: selectedPair,
      duration,
      stake: preset.baseStake,
      live,
    });
    setPresetStatus(status);
  };

  const applyMartingalePreset = async (preset: MartingalePreset) => {
    if (autoRunning) return;
    if (hasAnyPendingEvenOddTrade) {
      return alert("Wait for the current Even/Odd trade to settle");
    }

    setPresetLoading(true);

    try {
      if (!connected) {
        setPayoutPreview(null);
        configurePreset(
          preset,
          0.9,
          preset.recoveryMode === "multiplier"
            ? "Starter applied with fixed entry and 2.5x recovery. Connect Deriv before starting Auto Trade."
            : "Preset applied with a temporary 90% return estimate. Connect Deriv and re-apply it to use live payouts.",
          false
        );
        return;
      }

      const [evenPreview, oddPreview] = await Promise.all([
        requestPayoutPreview({
          direction: "Even",
          durationTicks: duration,
          customStake: preset.baseStake,
        }),
        requestPayoutPreview({
          direction: "Odd",
          durationTicks: duration,
          customStake: preset.baseStake,
        }),
      ]);
      const validRates = [evenPreview.profitRate, oddPreview.profitRate].filter(
        (rate) => Number.isFinite(rate) && rate > 0
      );

      if (validRates.length !== 2) {
        throw new Error("Deriv did not return usable Even and Odd payouts.");
      }

      const conservativeProfitRate = Math.min(...validRates);
      setPayoutPreview({
        pair: selectedPair,
        duration,
        stake: preset.baseStake,
        settledCount: sessionSettledCount,
        profitRate: conservativeProfitRate,
        evenProfitRate: evenPreview.profitRate,
        oddProfitRate: oddPreview.profitRate,
      });
      configurePreset(
        preset,
        conservativeProfitRate,
        preset.recoveryMode === "adaptive"
          ? `Live payout loaded: Even ${(evenPreview.profitRate * 100).toFixed(1)}%, Odd ${(oddPreview.profitRate * 100).toFixed(1)}%. The ladder uses the lower return.`
          : `Starter applied: fixed entry, 2.5x recovery, 10 recovery steps, 1,000 ${currency} loss and maximum-stake limits, and 20 trades maximum.`,
        true
      );
    } catch (error) {
      setPayoutPreview(null);
      configurePreset(
        preset,
        0.9,
        preset.recoveryMode === "multiplier"
          ? `${error instanceof Error ? error.message : "Could not load the live payout."} Starter fixed settings were still applied; the live quote will retry automatically.`
          : `${error instanceof Error ? error.message : "Could not load the live payout."} Preset applied with a temporary 90% return estimate; re-apply before trading.`,
        false
      );
    } finally {
      setPresetLoading(false);
    }
  };

  const markPresetCustomized = () => {
    setSelectedPresetId(null);
    setPresetConfiguration(null);
    setPresetStatus("Custom Martingale settings are active. Choose a preset to restore its calculated limits.");
  };

  const startAutoTrade = (startedAt: number) => {
    if (!connected) return alert("Connect your Deriv account first");
    if (autoMode === "smart" && payoutQuoteLoading) {
      return alert("Wait for the current live Even/Odd payout quote");
    }
    if (autoMode === "smart" && currentPreviewRate === null) {
      return alert("A valid live Deriv payout is required before Research Auto can start");
    }
    if (martingaleEnabled && recoveryMode === "adaptive" && currentPreviewRate === null) {
      return alert("A valid live Deriv payout is required for adaptive recovery sizing");
    }
    if (presetRequiresRefresh) {
      return alert(
        "Re-apply the selected preset to refresh its live Deriv payout for this index and duration."
      );
    }
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
    if (
      !Number.isInteger(maxSessionTradesValue) ||
      maxSessionTradesValue < 1 ||
      maxSessionTradesValue > 50
    ) {
      return alert("Maximum session trades must be a whole number from 1 to 50");
    }
    if (![2, 5, 7, 10].includes(profitCooldownMinutesValue)) {
      return alert("Choose a profit cooldown of 2, 5, 7, or 10 minutes");
    }
    if (martingaleEnabled) {
      if (
        recoveryMode === "multiplier" &&
        (!Number.isFinite(martingaleMultiplierValue) || martingaleMultiplierValue <= 1)
      ) {
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

    setSessionStartedAt(startedAt);
    setProfitCooldownRemainingSeconds(null);
    scannerLockedPairRef.current = null;
    setSessionBaseStake(stake);
    lastAutoTradeTickRef.current = ticks.length;
    setLastAutoTradeTickDisplay(ticks.length);
    lastHandledSettlementRef.current = null;
    resumeAfterTickRef.current = ticks.length;
    setResumeAfterTickDisplay(ticks.length);
    setAutoStatus(
      autoMode === "smart"
        ? "Research Auto started. Waiting for a fresh payout-qualified signal."
        : `Fixed Auto started with ${direction}.`
    );
    setAutoRunning(true);
  };

  const stopAutoTrade = () => {
    autoRunningRef.current = false;
    setAutoRunning(false);
    setProfitCooldownRemainingSeconds(null);
    scannerLockedPairRef.current = null;
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
    ? profitCooldownRemainingSeconds !== null
      ? `Profit target reached. Auto Trade restarts in ${formatCooldownTime(profitCooldownRemainingSeconds)}.`
      : hasPendingTrade
      ? "Waiting for the current contract to settle..."
      : recoveryPauseRemaining > 0
        ? `Recovery cooldown: waiting ${recoveryPauseRemaining} more tick${recoveryPauseRemaining === 1 ? "" : "s"}.`
        : pairScannerEnabled && autoMode === "fixed" && !bestScannedPair
          ? `Best Pair Scan: ${pairScanRankings.length}/${totalPairScanCandidates} pairs have at least 120 live digits.`
          : pairScannerEnabled &&
              autoMode === "fixed" &&
              bestScannedPair &&
              bestScannedPair.pair !== selectedPair
            ? `Best Pair Scan is preparing ${bestScannedPair.label} for fixed ${direction}.`
        : !adaptivePayoutReady
          ? "Waiting for a fresh live Deriv payout before sizing the next recovery trade."
        : autoMode === "smart" && !smartEntryReady
          ? currentPreviewRate === null
            ? "Scanning: waiting for a valid live Deriv payout quote."
            : `Scanning: ${smartSignal.reason}`
          : ticks.length <= lastAutoTradeTickDisplay
            ? "Waiting for a fresh tick before the next entry..."
            : `Preparing ${autoDirection.toLowerCase()} with ${nextAutoStake.toFixed(2)} ${currency}${
                martingaleEnabled ? ` • Recovery step ${martingaleStep}/${maxRecoveryStepsValue}` : ""
              }...`
    : autoStatus;

  return (
    <div className="space-y-6 bg-[radial-gradient(circle_at_top_left,rgba(168,85,247,0.18),rgba(15,23,42,0.96)_45%,rgba(2,6,23,0.99))] p-6">
      <div className="flex flex-col gap-4 md:flex-row md:items-start md:justify-between">
        <div>
          <p className="text-2xl font-bold text-white">Even/Odd Strategy</p>
          <p className="mt-1 max-w-2xl text-sm text-white/55">
            Use live payout break-even checks, independent validation, and hard recovery stops. Historical digit patterns remain experimental, not a guaranteed edge.
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

      <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
        <div className="rounded-2xl border border-white/10 bg-black/20 p-4">
          <p className="text-xs uppercase tracking-[0.18em] text-white/45">Recent Even</p>
          <p className="mt-2 text-2xl font-bold text-sky-300">{evenPercent.toFixed(1)}%</p>
        </div>
        <div className="rounded-2xl border border-white/10 bg-black/20 p-4">
          <p className="text-xs uppercase tracking-[0.18em] text-white/45">Recent Odd</p>
          <p className="mt-2 text-2xl font-bold text-purple-300">{oddPercent.toFixed(1)}%</p>
        </div>
        <div className="rounded-2xl border border-white/10 bg-black/20 p-4">
          <p className="text-xs uppercase tracking-[0.18em] text-white/45">Research Gate</p>
          <p className={`mt-2 text-2xl font-bold ${smartEntryReady ? "text-emerald-300" : "text-amber-200"}`}>
            {smartEntryReady ? smartSignal.direction : "No trade"}
          </p>
          <p className="mt-1 text-xs text-white/45">
            {currentPreviewRate !== null
              ? `${(smartSignal.breakEvenWinRate * 100).toFixed(1)}% live break-even`
              : payoutQuoteLoading
                ? "Loading live payout"
                : "Live payout unavailable"}
          </p>
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
        <div className="mb-5 rounded-2xl border border-cyan-400/20 bg-cyan-500/[0.06] p-4">
          <div className="flex flex-col gap-2 sm:flex-row sm:items-start sm:justify-between">
            <div>
              <p className="font-semibold text-cyan-100">Payout-aware Martingale Presets</p>
              <p className="mt-1 max-w-3xl text-xs leading-relaxed text-white/55">
                Presets load a complete Auto Trade configuration. Adaptive recovery uses Deriv&apos;s lower live Even/Odd return; fixed recovery follows its selected multiplier. Both remain subject to hard loss, stake, recovery-step, and trade-count stops.
              </p>
            </div>
            <span className="rounded-full border border-cyan-400/20 bg-cyan-500/10 px-3 py-1 text-[11px] font-bold text-cyan-100">
              {currentPreviewRate !== null
                ? "LIVE PAYOUT"
                : presetRequiresRefresh
                  ? "REFRESH REQUIRED"
                  : "ESTIMATE UNTIL CONNECTED"}
            </span>
          </div>

          <div className="mt-4 grid gap-3 md:grid-cols-2">
            {MARTINGALE_PRESETS.map((preset) => (
              <button
                key={preset.id}
                type="button"
                disabled={autoRunning || presetLoading}
                onClick={() => void applyMartingalePreset(preset)}
                className={`rounded-xl border p-4 text-left transition disabled:cursor-wait disabled:opacity-60 ${
                  selectedPresetId === preset.id
                    ? "border-cyan-300/45 bg-cyan-400/15"
                    : "border-white/10 bg-black/20 hover:border-cyan-400/30 hover:bg-cyan-500/[0.07]"
                }`}
              >
                <div className="flex items-center justify-between gap-3">
                  <div>
                    <p className="text-xs uppercase tracking-[0.16em] text-white/45">{preset.label}</p>
                    <p className="mt-1 text-lg font-bold text-white">
                      {preset.baseStake.toFixed(2)} {currency} start
                    </p>
                  </div>
                  <span className="rounded-lg bg-emerald-500/10 px-3 py-2 text-sm font-bold text-emerald-200">
                    {preset.profitTarget.toFixed(2)} {currency} target
                  </span>
                </div>
                <p className="mt-3 text-xs text-white/50">
                  {preset.description}
                </p>
              </button>
            ))}
          </div>

          <p className={`mt-3 text-xs ${selectedPresetId ? "text-cyan-100/75" : "text-white/45"}`}>
            {presetLoading
              ? "Requesting current Even and Odd payouts from Deriv..."
              : presetRequiresRefresh
                ? "The index or duration changed. Re-apply the preset to refresh its live payout before starting Auto Trade."
                : presetStatus}
          </p>
        </div>

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
              onChange={(event) => {
                markPresetCustomized();
                setStake(Number(event.target.value));
              }}
              className="w-full rounded-xl border border-white/10 bg-[#0b1220] px-4 py-3 text-white outline-none disabled:opacity-60"
            />
          </label>

          <div className="space-y-2 text-sm text-white/75">
            <span className="block text-xs uppercase tracking-[0.18em] text-white/45">Auto Entry</span>
            <div className="grid grid-cols-2 gap-2">
              {(["smart", "fixed"] as const).map((mode) => (
                <button
                  key={mode}
                  type="button"
                  disabled={autoRunning}
                  onClick={() => {
                    markPresetCustomized();
                    setAutoMode(mode);
                    if (mode === "smart") {
                      setPairScannerEnabled(false);
                      setPairScannerStatus("Best Pair Scan is off.");
                      scannerLockedPairRef.current = null;
                    }
                  }}
                  className={`rounded-xl border px-4 py-3 font-semibold transition disabled:opacity-60 ${
                    autoMode === mode
                      ? "border-purple-400/40 bg-purple-500/20 text-purple-100"
                      : "border-white/10 bg-white/5 text-white/70 hover:bg-white/10"
                  }`}
                >
                  {mode === "smart" ? "Research Signal" : "Fixed"}
                </button>
              ))}
            </div>
          </div>

          {autoMode === "smart" ? (
            <label className="space-y-2 text-sm text-white/75">
              <span className="block text-xs uppercase tracking-[0.18em] text-white/45">Signal Profile</span>
              <select
                value={signalProfile}
                disabled={autoRunning}
                onChange={(event) => setSignalProfile(event.target.value as SignalProfile)}
                className="w-full rounded-xl border border-purple-400/20 bg-[#0b1220] px-4 py-3 text-white outline-none disabled:opacity-60"
              >
                <option value="conservative">Conservative — recommended</option>
                <option value="balanced">Balanced — fewer checks</option>
                <option value="responsive">Responsive — more entries</option>
              </select>
            </label>
          ) : (
            <div className="space-y-2 text-sm text-white/75">
              <span className="block text-xs uppercase tracking-[0.18em] text-white/45">Fixed Direction</span>
              <div className="grid grid-cols-2 gap-2">
                {(["Even", "Odd"] as const).map((type) => (
                  <button
                    key={type}
                    type="button"
                    disabled={autoRunning}
                    onClick={() => {
                      setDirection(type);
                      scannerLockedPairRef.current = null;
                      if (pairScannerEnabled) {
                        setPairScannerStatus(`Scanning all pairs for fixed ${type}...`);
                      }
                    }}
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
              <button
                type="button"
                onClick={() => {
                  const nextEnabled = !pairScannerEnabled;
                  setPairScannerEnabled(nextEnabled);
                  scannerLockedPairRef.current = null;
                  if (nextEnabled) {
                    onRequestPairScanFeeds();
                    setPairScannerStatus(
                      `Collecting at least 120 live digits per pair for fixed ${direction}...`
                    );
                  } else {
                    setPairScannerStatus("Best Pair Scan is off.");
                  }
                }}
                className={`mt-2 w-full rounded-xl border px-4 py-3 text-xs font-bold transition ${
                  pairScannerEnabled
                    ? "border-cyan-300/40 bg-cyan-400/15 text-cyan-100"
                    : "border-white/10 bg-white/5 text-white/65 hover:bg-white/10"
                }`}
              >
                {pairScannerEnabled ? "Best Pair Scan On" : "Best Pair Scan Off"}
              </button>
              <p className="mt-2 text-[11px] leading-relaxed text-white/45">
                {pairScannerEnabled && bestScannedPair
                  ? `Best now: ${bestScannedPair.label} • ${(bestScannedPair.winRate * 100).toFixed(1)}% ${direction.toLowerCase()} wins • ${(bestScannedPair.confidenceLowerBound * 100).toFixed(1)}% confidence floor • ${bestScannedPair.samples} ticks`
                  : pairScannerEnabled
                    ? `${pairScanRankings.length}/${totalPairScanCandidates} pairs have enough data. ${pairScannerStatus}`
                    : pairScannerStatus}
              </p>
              <p className="mt-1 text-[10px] text-amber-100/60">
                Ranking uses the 95% confidence floor, then observed win rate. It identifies the strongest recent sample, not a guaranteed predictive edge.
              </p>
            </div>
          )}

          <label className="space-y-2 text-sm text-white/75">
            <span className="block text-xs uppercase tracking-[0.18em] text-white/45">Profit Target</span>
            <input
              type="number"
              min="0.01"
              step="0.01"
              value={profitTarget}
              disabled={autoRunning}
              onChange={(event) => {
                markPresetCustomized();
                setProfitTarget(event.target.value);
              }}
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
              onChange={(event) => {
                markPresetCustomized();
                setLossLimit(event.target.value);
              }}
              className="w-full rounded-xl border border-red-400/20 bg-[#0b1220] px-4 py-3 text-white outline-none disabled:opacity-60"
            />
          </label>

          <label className="space-y-2 text-sm text-white/75">
            <span className="block text-xs uppercase tracking-[0.18em] text-white/45">Max Session Trades</span>
            <input
              type="number"
              min="1"
              max="50"
              step="1"
              value={maxSessionTrades}
              disabled={autoRunning}
              onChange={(event) => {
                markPresetCustomized();
                setMaxSessionTrades(event.target.value);
              }}
              className="w-full rounded-xl border border-white/10 bg-[#0b1220] px-4 py-3 text-white outline-none disabled:opacity-60"
            />
          </label>

          <label className="space-y-2 text-sm text-white/75">
            <span className="block text-xs uppercase tracking-[0.18em] text-white/45">
              Profit Target Cooldown
            </span>
            <select
              value={profitCooldownMinutes}
              disabled={autoRunning}
              onChange={(event) => setProfitCooldownMinutes(event.target.value)}
              className="w-full rounded-xl border border-emerald-400/20 bg-[#0b1220] px-4 py-3 text-white outline-none disabled:opacity-60"
            >
              <option value="2">Restart after 2 minutes</option>
              <option value="5">Restart after 5 minutes</option>
              <option value="7">Restart after 7 minutes</option>
              <option value="10">Restart after 10 minutes</option>
            </select>
          </label>
        </div>

        <div
          className={`mt-5 rounded-2xl border p-4 ${
            smartEntryReady
              ? "border-emerald-400/25 bg-emerald-500/[0.07]"
              : "border-white/10 bg-white/[0.03]"
          }`}
        >
          <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
            <div>
              <div className="flex flex-wrap items-center gap-2">
                <p className="font-semibold text-white">Experimental Signal Monitor</p>
                <span
                  className={`rounded-full border px-2.5 py-1 text-[11px] font-bold ${
                    smartEntryReady
                      ? "border-emerald-400/30 bg-emerald-500/10 text-emerald-200"
                      : "border-amber-400/25 bg-amber-500/10 text-amber-100"
                  }`}
                >
                  {smartEntryReady ? `${smartSignal.direction.toUpperCase()} QUALIFIED` : "NO TRADE"}
                </span>
              </div>
              <p className="mt-2 text-sm text-white/60">
                {currentPreviewRate === null
                  ? payoutQuoteLoading
                    ? "Loading current Even and Odd proposals from Deriv."
                    : "No valid live payout is available, so automatic signal entries are blocked."
                  : smartSignal.reason}
              </p>
            </div>
            <div className="grid grid-cols-2 gap-2 text-center text-xs sm:grid-cols-5 lg:min-w-[680px]">
              <div className="rounded-xl border border-white/10 bg-black/20 px-3 py-2">
                <p className="text-white/40">Model</p>
                <p className="mt-1 font-semibold text-white/80">{smartSignal.model}</p>
              </div>
              <div className="rounded-xl border border-white/10 bg-black/20 px-3 py-2">
                <p className="text-white/40">Live break-even</p>
                <p className="mt-1 font-semibold text-white/80">
                  {(smartSignal.breakEvenWinRate * 100).toFixed(1)}%
                </p>
              </div>
              <div className="rounded-xl border border-white/10 bg-black/20 px-3 py-2">
                <p className="text-white/40">Independent holdout</p>
                <p className="mt-1 font-semibold text-white/80">
                  {smartSignal.backtestSamples
                    ? `${(smartSignal.backtestAccuracy * 100).toFixed(1)}% / ${smartSignal.backtestSamples}`
                    : "Collecting"}
                </p>
              </div>
              <div className="rounded-xl border border-white/10 bg-black/20 px-3 py-2">
                <p className="text-white/40">95% lower bound</p>
                <p
                  className={`mt-1 font-semibold ${
                    smartSignal.conservativeExpectedValue > 0
                      ? "text-emerald-200"
                      : "text-amber-100"
                  }`}
                >
                  {smartSignal.backtestSamples
                    ? `${(smartSignal.confidenceLowerBound * 100).toFixed(1)}%`
                    : "Collecting"}
                </p>
              </div>
              <div className="rounded-xl border border-white/10 bg-black/20 px-3 py-2">
                <p className="text-white/40">Conservative EV / 1</p>
                <p
                  className={`mt-1 font-semibold ${
                    smartSignal.conservativeExpectedValue > 0
                      ? "text-emerald-200"
                      : "text-red-200"
                  }`}
                >
                  {smartSignal.backtestSamples
                    ? `${smartSignal.conservativeExpectedValue >= 0 ? "+" : ""}${smartSignal.conservativeExpectedValue.toFixed(3)}`
                    : "Collecting"}
                </p>
              </div>
            </div>
          </div>
          <p className="mt-3 text-xs leading-relaxed text-amber-100/65">
            Deriv describes synthetic-index prices as RNG-generated and warns that apparent historical patterns can be coincidental. This monitor therefore treats recent-digit models as research only and requires a positive payout-adjusted result on data kept out of model selection.
          </p>
        </div>

        <div className="mt-5 rounded-2xl border border-amber-400/20 bg-amber-500/[0.06] p-4">
          <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
            <div>
              <p className="font-semibold text-amber-100">Optional Martingale</p>
              <p className="mt-1 text-xs text-white/55">
                Increase the next Auto Trade stake after a loss and reset to the starting stake after a win.
              </p>
            </div>
            <div className="flex flex-wrap items-center gap-2">
              <button
                type="button"
                disabled={autoRunning}
                onClick={() => {
                  markPresetCustomized();
                  const nextEnabled = !martingaleEnabled;
                  setMartingaleEnabled(nextEnabled);
                  if (nextEnabled) setMartingaleDetailsOpen(true);
                }}
                className={`rounded-full border px-4 py-2 text-xs font-bold transition disabled:opacity-60 ${
                  martingaleEnabled
                    ? "border-amber-300/40 bg-amber-400/20 text-amber-100"
                    : "border-white/10 bg-white/5 text-white/65 hover:bg-white/10"
                }`}
              >
                {martingaleEnabled ? "Martingale On" : "Martingale Off"}
              </button>
              {martingaleEnabled && (
                <button
                  type="button"
                  aria-expanded={martingaleDetailsOpen}
                  aria-label={
                    martingaleDetailsOpen
                      ? "Collapse Martingale settings"
                      : "Expand Martingale settings"
                  }
                  onClick={() => setMartingaleDetailsOpen((open) => !open)}
                  className="rounded-full border border-amber-300/25 bg-black/20 px-3 py-2 text-xs font-bold text-amber-100 transition hover:bg-amber-400/10"
                >
                  {martingaleDetailsOpen ? "Hide settings ▲" : "Show settings ▼"}
                </button>
              )}
            </div>
          </div>

          {martingaleEnabled && martingaleDetailsOpen && (
            <div className="mt-4 space-y-4">
              <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-4">
                <label className="space-y-2 text-sm text-white/75">
                  <span className="block text-xs uppercase tracking-[0.14em] text-white/45">Recovery Sizing</span>
                  <select
                    value={recoveryMode}
                    disabled={autoRunning}
                    onChange={(event) => {
                      markPresetCustomized();
                      setRecoveryMode(event.target.value as "adaptive" | "multiplier");
                    }}
                    className="w-full rounded-xl border border-amber-400/20 bg-[#0b1220] px-4 py-3 text-white outline-none disabled:opacity-60"
                  >
                    <option value="adaptive">Adaptive payout-aware</option>
                    <option value="multiplier">Fixed multiplier</option>
                  </select>
                </label>

                {recoveryMode === "multiplier" && (
                  <label className="space-y-2 text-sm text-white/75">
                    <span className="block text-xs uppercase tracking-[0.14em] text-white/45">Multiplier</span>
                    <input
                      type="number"
                      min="1.01"
                      max="10"
                      step="0.01"
                      value={martingaleMultiplier}
                      disabled={autoRunning}
                      onChange={(event) => {
                        markPresetCustomized();
                        setMartingaleMultiplier(event.target.value);
                      }}
                      className="w-full rounded-xl border border-amber-400/20 bg-[#0b1220] px-4 py-3 text-white outline-none disabled:opacity-60"
                    />
                  </label>
                )}

                <label className="space-y-2 text-sm text-white/75">
                  <span className="block text-xs uppercase tracking-[0.14em] text-white/45">Max Recovery Steps</span>
                  <input
                    type="number"
                    min="1"
                    max="10"
                    step="1"
                    value={maxRecoverySteps}
                    disabled={autoRunning}
                    onChange={(event) => {
                      markPresetCustomized();
                      setMaxRecoverySteps(event.target.value);
                    }}
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
                    onChange={(event) => {
                      markPresetCustomized();
                      setMaxMartingaleStake(event.target.value);
                    }}
                    className="w-full rounded-xl border border-amber-400/20 bg-[#0b1220] px-4 py-3 text-white outline-none disabled:opacity-60"
                  />
                </label>

                {recoveryMode === "adaptive" && (
                  <div className="rounded-xl border border-amber-400/20 bg-black/20 px-4 py-3 text-sm text-white/75">
                    <span className="block text-xs uppercase tracking-[0.14em] text-white/45">Win Return Used</span>
                    <p className="mt-2 font-semibold text-amber-100">
                      {(recoveryProfitRate * 100).toFixed(1)}% of stake
                    </p>
                    <p className="mt-1 text-[11px] text-white/45">
                      {payoutRateSamples.length
                        ? `Median of ${payoutRateSamples.length} recent quote${payoutRateSamples.length === 1 ? "" : "s"}`
                        : currentPreviewRate !== null
                          ? "Lower of the current live Even and Odd quotes"
                          : "Temporary estimate until a live quote is loaded"}
                    </p>
                  </div>
                )}
              </div>

              {projectedMartingaleStakes.length > 0 && (
                <div>
                  <p className="text-xs uppercase tracking-[0.14em] text-white/45">
                    {recoveryMode === "adaptive" ? "Payout-aware Recovery Ladder" : "Projected Stake Ladder"}
                  </p>
                  <div className="mt-2 flex flex-wrap gap-2">
                    {projectedMartingaleStakes.map((projectedStake, step) => {
                      const exceedsHardStop = step >= projectedSequenceStakes.length;
                      return (
                        <span
                          key={`${step}-${projectedStake}`}
                          className={`rounded-lg border px-3 py-2 text-xs font-semibold ${
                            exceedsHardStop
                              ? "border-red-400/30 bg-red-500/10 text-red-200"
                              : "border-amber-400/20 bg-amber-500/10 text-amber-100"
                          }`}
                        >
                          {step === 0 ? "Base" : `Step ${step}`}: {projectedStake.toFixed(2)} {currency}
                          {exceedsHardStop ? " • STOP" : ""}
                        </span>
                      );
                    })}
                  </div>
                </div>
              )}

              <div className="grid gap-3 sm:grid-cols-2">
                <div className="rounded-xl border border-emerald-400/20 bg-emerald-500/[0.06] px-4 py-3">
                  <p className="text-[11px] uppercase tracking-[0.14em] text-white/45">
                    Full sequence exposure
                  </p>
                  <p className="mt-2 font-bold text-emerald-200">
                    {projectedTotalExposure.toFixed(2)} {currency}
                  </p>
                </div>
                <div className="rounded-xl border border-white/10 bg-black/20 px-4 py-3">
                  <p className="text-[11px] uppercase tracking-[0.14em] text-white/45">
                    Lose whole sequence
                  </p>
                  <p className="mt-2 font-bold text-amber-100">
                    {(sequenceFailureProbability * 100).toFixed(2)}%
                  </p>
                  <p className="mt-1 text-[10px] text-white/40">If each result is independent 50/50</p>
                </div>
              </div>

              <p className="text-xs leading-relaxed text-amber-100/70">
                Adaptive sizing uses live proposal returns to target accumulated losses plus one base-trade profit; fixed sizing uses the selected multiplier. Neither changes the contract&apos;s expected value or accuracy. After a loss, Auto Trade waits two fresh ticks; recovery-step, maximum-stake, trade-count, and session-loss limits remain enforced.
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
          onClick={
            autoRunning
              ? stopAutoTrade
              : (event) =>
                  startAutoTrade(
                    event.timeStamp > 1_000_000_000_000
                      ? event.timeStamp
                      : performance.timeOrigin + event.timeStamp
                  )
          }
          className={`mt-3 w-full rounded-xl px-4 py-4 font-bold text-white transition ${
            autoRunning ? "bg-red-600 hover:bg-red-700" : "bg-emerald-600 hover:bg-emerald-700"
          }`}
        >
          {autoRunning ? "Stop Auto Trade" : "Start Auto Trade"}
        </button>

        <p className="mt-3 text-center text-xs text-white/55">{displayedAutoStatus}</p>
        <p className="mt-2 text-center text-[11px] text-amber-200/70">
          Signal estimates describe recent ticks and cannot guarantee the next result. Research Auto requires a live payout, an independent holdout result above break-even, and never opens overlapping contracts
          {martingaleEnabled ? ", then resets recovery after a win." : "."}
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

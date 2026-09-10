export type EvenOddDirection = "Even" | "Odd";

export type SignalProfile = "conservative" | "balanced" | "responsive";

export type EvenOddSignal = {
  ready: boolean;
  direction: EvenOddDirection;
  model: string;
  estimatedProbability: number;
  backtestAccuracy: number;
  backtestSamples: number;
  modelSamples: number;
  dataPoints: number;
  reason: string;
};

type ModelKey = "rolling-bias" | "last-parity" | "two-parity-pattern";

type ModelEstimate = {
  direction: EvenOddDirection;
  probability: number;
  samples: number;
};

type ModelEvaluation = {
  model: ModelKey;
  estimate: ModelEstimate;
  accuracy: number;
  adjustedAccuracy: number;
  trials: number;
};

const MODEL_LABELS: Record<ModelKey, string> = {
  "rolling-bias": "Rolling parity bias",
  "last-parity": "Last-parity transition",
  "two-parity-pattern": "Two-parity pattern",
};

const PROFILE_RULES: Record<
  SignalProfile,
  {
    minDigits: number;
    minModelSamples: number;
    minBacktestSamples: number;
    minProbability: number;
    minAdjustedAccuracy: number;
  }
> = {
  conservative: {
    minDigits: 120,
    minModelSamples: 28,
    minBacktestSamples: 36,
    minProbability: 0.61,
    minAdjustedAccuracy: 0.59,
  },
  balanced: {
    minDigits: 80,
    minModelSamples: 18,
    minBacktestSamples: 28,
    minProbability: 0.59,
    minAdjustedAccuracy: 0.57,
  },
  responsive: {
    minDigits: 50,
    minModelSamples: 12,
    minBacktestSamples: 20,
    minProbability: 0.56,
    minAdjustedAccuracy: 0.55,
  },
};

const parity = (digit: number): 0 | 1 => (digit % 2 === 0 ? 0 : 1);

const estimateDirection = (evenOutcomes: number, samples: number): ModelEstimate => {
  // A small symmetric prior keeps short, noisy samples close to 50/50.
  const evenProbability = (evenOutcomes + 2) / (samples + 4);
  const direction: EvenOddDirection = evenProbability >= 0.5 ? "Even" : "Odd";

  return {
    direction,
    probability: direction === "Even" ? evenProbability : 1 - evenProbability,
    samples,
  };
};

const getModelEstimate = (digits: number[], model: ModelKey): ModelEstimate | null => {
  if (!digits.length) return null;

  if (model === "rolling-bias") {
    const window = digits.slice(-100);
    const evenOutcomes = window.filter((digit) => parity(digit) === 0).length;
    return estimateDirection(evenOutcomes, window.length);
  }

  if (model === "last-parity") {
    if (digits.length < 2) return null;
    const window = digits.slice(-180);
    const currentParity = parity(window[window.length - 1]);
    let samples = 0;
    let evenOutcomes = 0;

    for (let index = 1; index < window.length; index++) {
      if (parity(window[index - 1]) !== currentParity) continue;
      samples++;
      if (parity(window[index]) === 0) evenOutcomes++;
    }

    return samples ? estimateDirection(evenOutcomes, samples) : null;
  }

  if (digits.length < 3) return null;
  const window = digits.slice(-220);
  const currentPattern = [
    parity(window[window.length - 2]),
    parity(window[window.length - 1]),
  ] as const;
  let samples = 0;
  let evenOutcomes = 0;

  for (let index = 2; index < window.length; index++) {
    if (
      parity(window[index - 2]) !== currentPattern[0] ||
      parity(window[index - 1]) !== currentPattern[1]
    ) {
      continue;
    }
    samples++;
    if (parity(window[index]) === 0) evenOutcomes++;
  }

  return samples ? estimateDirection(evenOutcomes, samples) : null;
};

const evaluateModel = (digits: number[], model: ModelKey): ModelEvaluation | null => {
  const estimate = getModelEstimate(digits, model);
  if (!estimate) return null;

  const firstPredictionIndex = Math.max(24, digits.length - 70);
  let wins = 0;
  let trials = 0;

  for (let index = firstPredictionIndex; index < digits.length; index++) {
    const historicalEstimate = getModelEstimate(digits.slice(0, index), model);
    if (!historicalEstimate || historicalEstimate.samples < 8) continue;
    trials++;
    const actualDirection: EvenOddDirection = parity(digits[index]) === 0 ? "Even" : "Odd";
    if (historicalEstimate.direction === actualDirection) wins++;
  }

  if (!trials) return null;
  const accuracy = wins / trials;
  // Shrink the displayed result toward chance so small backtests cannot dominate.
  const adjustedAccuracy = (wins + 8) / (trials + 16);

  return { model, estimate, accuracy, adjustedAccuracy, trials };
};

export function analyzeEvenOddSignal(
  sourceDigits: number[],
  profile: SignalProfile
): EvenOddSignal {
  const digits = sourceDigits
    .filter((digit) => Number.isInteger(digit) && digit >= 0 && digit <= 9)
    .slice(-240);
  const rules = PROFILE_RULES[profile];
  const fallbackDirection: EvenOddDirection =
    digits.length && parity(digits[digits.length - 1]) === 0 ? "Odd" : "Even";

  if (digits.length < rules.minDigits) {
    return {
      ready: false,
      direction: fallbackDirection,
      model: "Collecting data",
      estimatedProbability: 0.5,
      backtestAccuracy: 0.5,
      backtestSamples: 0,
      modelSamples: digits.length,
      dataPoints: digits.length,
      reason: `Collecting ${rules.minDigits - digits.length} more live digits for the ${profile} profile.`,
    };
  }

  const models: ModelKey[] = ["rolling-bias", "last-parity", "two-parity-pattern"];
  const evaluations = models
    .map((model) => evaluateModel(digits, model))
    .filter((evaluation): evaluation is ModelEvaluation => evaluation !== null)
    .sort((a, b) => {
      const aScore = a.adjustedAccuracy + Math.min(a.estimate.samples, 100) / 10_000;
      const bScore = b.adjustedAccuracy + Math.min(b.estimate.samples, 100) / 10_000;
      return bScore - aScore;
    });
  const best = evaluations[0];

  if (!best) {
    return {
      ready: false,
      direction: fallbackDirection,
      model: "No qualified model",
      estimatedProbability: 0.5,
      backtestAccuracy: 0.5,
      backtestSamples: 0,
      modelSamples: 0,
      dataPoints: digits.length,
      reason: "Waiting for enough repeated parity patterns to evaluate a signal.",
    };
  }

  const enoughModelSamples = best.estimate.samples >= rules.minModelSamples;
  const enoughBacktestSamples = best.trials >= rules.minBacktestSamples;
  const strongCurrentEstimate = best.estimate.probability >= rules.minProbability;
  const validatedAccuracy = best.adjustedAccuracy >= rules.minAdjustedAccuracy;
  const ready =
    enoughModelSamples && enoughBacktestSamples && strongCurrentEstimate && validatedAccuracy;

  let reason = `${MODEL_LABELS[best.model]} currently favors ${best.estimate.direction.toLowerCase()}.`;
  if (!enoughModelSamples) {
    reason = `Waiting for ${rules.minModelSamples - best.estimate.samples} more matching model samples.`;
  } else if (!enoughBacktestSamples) {
    reason = `Waiting for ${rules.minBacktestSamples - best.trials} more walk-forward checks.`;
  } else if (!strongCurrentEstimate) {
    reason = `No trade: the current estimate is below the ${(rules.minProbability * 100).toFixed(0)}% threshold.`;
  } else if (!validatedAccuracy) {
    reason = `No trade: recent walk-forward accuracy is below the ${(rules.minAdjustedAccuracy * 100).toFixed(0)}% quality threshold.`;
  }

  return {
    ready,
    direction: best.estimate.direction,
    model: MODEL_LABELS[best.model],
    estimatedProbability: best.estimate.probability,
    backtestAccuracy: best.accuracy,
    backtestSamples: best.trials,
    modelSamples: best.estimate.samples,
    dataPoints: digits.length,
    reason,
  };
}

export function roundStakeUp(value: number): number {
  if (!Number.isFinite(value) || value <= 0) return 0;
  return Math.ceil((value - Number.EPSILON) * 100) / 100;
}

export function buildAdaptiveRecoveryLadder(
  baseStake: number,
  profitRate: number,
  recoverySteps: number
): number[] {
  if (
    !Number.isFinite(baseStake) ||
    baseStake <= 0 ||
    !Number.isFinite(profitRate) ||
    profitRate <= 0 ||
    !Number.isInteger(recoverySteps) ||
    recoverySteps < 0
  ) {
    return [];
  }

  const ladder: number[] = [];
  let accumulatedLoss = 0;

  for (let step = 0; step <= recoverySteps; step++) {
    const nextStake =
      step === 0
        ? roundStakeUp(baseStake)
        : roundStakeUp(
            (accumulatedLoss + baseStake * profitRate) / profitRate
          );
    ladder.push(nextStake);
    accumulatedLoss += nextStake;
  }

  return ladder;
}

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
  breakEvenWinRate: number;
  confidenceLowerBound: number;
  conservativeExpectedValue: number;
  confidenceLevel: number;
  reason: string;
};

export type FixedDirectionConfidence = {
  ready: boolean;
  direction: EvenOddDirection;
  winRate: number;
  confidenceLowerBound: number;
  wins: number;
  samples: number;
};

type ModelKey = "rolling-bias" | "last-parity" | "two-parity-pattern";

type ModelEstimate = {
  direction: EvenOddDirection;
  probability: number;
  samples: number;
};

type ModelEvaluation = {
  model: ModelKey;
  accuracy: number;
  adjustedAccuracy: number;
  trials: number;
  wins: number;
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
    selectionWindow: number;
    validationWindow: number;
    minModelSamples: number;
    minValidationSamples: number;
    currentProbabilityMargin: number;
    payoutSafetyMargin: number;
  }
> = {
  conservative: {
    minDigits: 300,
    selectionWindow: 140,
    validationWindow: 120,
    minModelSamples: 40,
    minValidationSamples: 100,
    currentProbabilityMargin: 0.025,
    payoutSafetyMargin: 0.015,
  },
  balanced: {
    minDigits: 240,
    selectionWindow: 110,
    validationWindow: 90,
    minModelSamples: 30,
    minValidationSamples: 75,
    currentProbabilityMargin: 0.02,
    payoutSafetyMargin: 0.01,
  },
  responsive: {
    minDigits: 180,
    selectionWindow: 80,
    validationWindow: 60,
    minModelSamples: 20,
    minValidationSamples: 50,
    currentProbabilityMargin: 0.015,
    payoutSafetyMargin: 0.005,
  },
};

const ONE_SIDED_95_PERCENT_Z = 1.6448536269514722;

const parity = (digit: number): 0 | 1 => (digit % 2 === 0 ? 0 : 1);

export function calculateBreakEvenWinRate(profitRate: number): number {
  if (!Number.isFinite(profitRate) || profitRate <= 0) return 1;
  return 1 / (1 + profitRate);
}

export function wilsonLowerBound(
  wins: number,
  trials: number,
  z = ONE_SIDED_95_PERCENT_Z
): number {
  if (
    !Number.isFinite(wins) ||
    !Number.isFinite(trials) ||
    trials <= 0 ||
    wins < 0 ||
    wins > trials
  ) {
    return 0;
  }

  const proportion = wins / trials;
  const zSquared = z * z;
  const denominator = 1 + zSquared / trials;
  const centre = proportion + zSquared / (2 * trials);
  const spread =
    z *
    Math.sqrt(
      (proportion * (1 - proportion) + zSquared / (4 * trials)) / trials
    );

  return Math.max(0, (centre - spread) / denominator);
}

export function analyzeFixedDirectionConfidence(
  sourceDigits: number[],
  direction: EvenOddDirection,
  minimumSamples = 120
): FixedDirectionConfidence {
  const digits = sourceDigits
    .filter((digit) => Number.isInteger(digit) && digit >= 0 && digit <= 9)
    .slice(-400);
  const samples = digits.length;
  const wins = digits.filter((digit) =>
    direction === "Even" ? parity(digit) === 0 : parity(digit) === 1
  ).length;
  const winRate = samples ? wins / samples : 0.5;

  return {
    ready: samples >= minimumSamples,
    direction,
    winRate,
    confidenceLowerBound: samples ? wilsonLowerBound(wins, samples) : 0,
    wins,
    samples,
  };
}

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

const evaluateWindow = (
  digits: number[],
  model: ModelKey,
  startIndex: number,
  endIndex: number
): ModelEvaluation | null => {
  let wins = 0;
  let trials = 0;

  for (let index = Math.max(24, startIndex); index < endIndex; index++) {
    const historicalEstimate = getModelEstimate(digits.slice(0, index), model);
    if (!historicalEstimate || historicalEstimate.samples < 8) continue;
    trials++;
    const actualDirection: EvenOddDirection = parity(digits[index]) === 0 ? "Even" : "Odd";
    if (historicalEstimate.direction === actualDirection) wins++;
  }

  if (!trials) return null;
  const accuracy = wins / trials;
  // Shrink model-selection scores toward chance so short samples cannot dominate.
  const adjustedAccuracy = (wins + 8) / (trials + 16);

  return { model, accuracy, adjustedAccuracy, trials, wins };
};

export function analyzeEvenOddSignal(
  sourceDigits: number[],
  profile: SignalProfile,
  payoutProfitRate = 0.9
): EvenOddSignal {
  const digits = sourceDigits
    .filter((digit) => Number.isInteger(digit) && digit >= 0 && digit <= 9)
    .slice(-800);
  const rules = PROFILE_RULES[profile];
  const profitRate =
    Number.isFinite(payoutProfitRate) && payoutProfitRate > 0
      ? payoutProfitRate
      : 0.9;
  const breakEvenWinRate = calculateBreakEvenWinRate(profitRate);
  const fallbackDirection: EvenOddDirection =
    digits.length && parity(digits[digits.length - 1]) === 0 ? "Odd" : "Even";
  const emptyResult = (reason: string, model = "Collecting data"): EvenOddSignal => ({
    ready: false,
    direction: fallbackDirection,
    model,
    estimatedProbability: 0.5,
    backtestAccuracy: 0.5,
    backtestSamples: 0,
    modelSamples: digits.length,
    dataPoints: digits.length,
    breakEvenWinRate,
    confidenceLowerBound: 0,
    conservativeExpectedValue: -1,
    confidenceLevel: 0.95,
    reason,
  });

  if (digits.length < rules.minDigits) {
    return emptyResult(
      `Collecting ${rules.minDigits - digits.length} more live digits for independent validation.`
    );
  }

  const validationStart = digits.length - rules.validationWindow;
  const selectionStart = Math.max(24, validationStart - rules.selectionWindow);
  const models: ModelKey[] = ["rolling-bias", "last-parity", "two-parity-pattern"];
  const selectionEvaluations = models
    .map((model) => evaluateWindow(digits, model, selectionStart, validationStart))
    .filter((evaluation): evaluation is ModelEvaluation => evaluation !== null)
    .sort((a, b) => {
      const aScore = a.adjustedAccuracy + Math.min(a.trials, 100) / 10_000;
      const bScore = b.adjustedAccuracy + Math.min(b.trials, 100) / 10_000;
      return bScore - aScore;
    });
  const selected = selectionEvaluations[0];

  if (!selected) {
    return emptyResult(
      "Waiting for enough earlier observations to select a model without using the validation window.",
      "No qualified model"
    );
  }

  // Judge the selected model only on later observations that were not used to
  // choose it. The same data is never reported as both selection and proof.
  const validation = evaluateWindow(
    digits,
    selected.model,
    validationStart,
    digits.length
  );
  const liveEstimate = getModelEstimate(digits, selected.model);

  if (!validation || !liveEstimate) {
    return emptyResult(
      "The selected model does not yet have a complete independent validation window.",
      MODEL_LABELS[selected.model]
    );
  }

  const confidenceLowerBound = wilsonLowerBound(validation.wins, validation.trials);
  const conservativeExpectedValue =
    confidenceLowerBound * profitRate - (1 - confidenceLowerBound);
  const enoughModelSamples = liveEstimate.samples >= rules.minModelSamples;
  const enoughValidationSamples = validation.trials >= rules.minValidationSamples;
  const strongCurrentEstimate =
    liveEstimate.probability >= breakEvenWinRate + rules.currentProbabilityMargin;
  const clearsPayoutGate =
    confidenceLowerBound >= breakEvenWinRate + rules.payoutSafetyMargin;
  const ready =
    enoughModelSamples &&
    enoughValidationSamples &&
    strongCurrentEstimate &&
    clearsPayoutGate &&
    conservativeExpectedValue > 0;

  let reason = `${MODEL_LABELS[selected.model]} favors ${liveEstimate.direction.toLowerCase()} and clears the live payout gate.`;
  if (!enoughModelSamples) {
    reason = `Waiting for ${rules.minModelSamples - liveEstimate.samples} more matching model samples.`;
  } else if (!enoughValidationSamples) {
    reason = `Waiting for ${rules.minValidationSamples - validation.trials} more out-of-sample checks.`;
  } else if (!strongCurrentEstimate) {
    reason = `No trade: the current estimate does not clear the ${(
      (breakEvenWinRate + rules.currentProbabilityMargin) *
      100
    ).toFixed(1)}% payout-adjusted entry threshold.`;
  } else if (!clearsPayoutGate || conservativeExpectedValue <= 0) {
    reason = `No trade: the 95% lower confidence bound does not clear the ${(
      (breakEvenWinRate + rules.payoutSafetyMargin) *
      100
    ).toFixed(1)}% payout-adjusted safety threshold.`;
  }

  return {
    ready,
    direction: liveEstimate.direction,
    model: MODEL_LABELS[selected.model],
    estimatedProbability: liveEstimate.probability,
    backtestAccuracy: validation.accuracy,
    backtestSamples: validation.trials,
    modelSamples: liveEstimate.samples,
    dataPoints: digits.length,
    breakEvenWinRate,
    confidenceLowerBound,
    conservativeExpectedValue,
    confidenceLevel: 0.95,
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

export function buildMultiplierRecoveryLadder(
  baseStake: number,
  multiplier: number,
  recoverySteps: number
): number[] {
  if (
    !Number.isFinite(baseStake) ||
    baseStake <= 0 ||
    !Number.isFinite(multiplier) ||
    multiplier <= 1 ||
    !Number.isInteger(recoverySteps) ||
    recoverySteps < 0
  ) {
    return [];
  }

  return Array.from({ length: recoverySteps + 1 }, (_, step) =>
    roundStakeUp(baseStake * Math.pow(multiplier, step))
  );
}

export function buildExecutableRecoverySequence(
  ladder: number[],
  maximumStake: number,
  lossLimit: number
): number[] {
  if (
    !Number.isFinite(maximumStake) ||
    maximumStake <= 0 ||
    !Number.isFinite(lossLimit) ||
    lossLimit <= 0
  ) {
    return [];
  }

  const executable: number[] = [];
  let exposure = 0;

  for (const ladderStake of ladder) {
    if (!Number.isFinite(ladderStake) || ladderStake <= 0) break;
    if (ladderStake > maximumStake + 0.005) break;
    if (exposure + ladderStake > lossLimit + 0.005) break;
    executable.push(ladderStake);
    exposure += ladderStake;
  }

  return executable;
}

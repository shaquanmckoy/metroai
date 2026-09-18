import assert from "node:assert/strict";
import test from "node:test";

import {
  analyzeEvenOddSignal,
  analyzeFixedDirectionConfidence,
  buildAdaptiveRecoveryLadder,
  buildExecutableRecoverySequence,
  buildMultiplierRecoveryLadder,
  calculateBreakEvenWinRate,
  wilsonLowerBound,
} from "../components/dashboard/strategies/even-odd-engine.ts";

test("calculates payout-adjusted break-even win rates", () => {
  assert.equal(calculateBreakEvenWinRate(1), 0.5);
  assert.ok(Math.abs(calculateBreakEvenWinRate(0.9) - 0.5263157895) < 1e-9);
  assert.ok(Math.abs(calculateBreakEvenWinRate(0.8) - 0.5555555556) < 1e-9);
});

test("uses a conservative confidence bound instead of raw accuracy", () => {
  assert.ok(wilsonLowerBound(50, 100) < 0.5);
  assert.ok(wilsonLowerBound(65, 100) > calculateBreakEvenWinRate(0.9));
  assert.equal(wilsonLowerBound(0, 0), 0);
});

test("adaptive ladder recovers prior losses plus one base-trade profit", () => {
  const baseStake = 0.35;
  const profitRate = 0.9;
  const ladder = buildAdaptiveRecoveryLadder(baseStake, profitRate, 2);
  assert.deepEqual(ladder, [0.35, 0.74, 1.57]);

  let priorLoss = 0;
  for (let step = 1; step < ladder.length; step++) {
    priorLoss += ladder[step - 1];
    assert.ok(
      ladder[step] * profitRate - priorLoss >= baseStake * profitRate - 0.005
    );
  }
});

test("fixed Starter ladder stops before its maximum stake or loss limit", () => {
  const ladder = buildMultiplierRecoveryLadder(0.35, 2.5, 10);
  assert.deepEqual(ladder, [
    0.35,
    0.88,
    2.19,
    5.47,
    13.68,
    34.18,
    85.45,
    213.63,
    534.06,
    1335.15,
    3337.87,
  ]);

  const executable = buildExecutableRecoverySequence(ladder, 1000, 1000);
  assert.deepEqual(executable, ladder.slice(0, 9));
  assert.equal(
    Number(executable.reduce((total, value) => total + value, 0).toFixed(2)),
    889.89
  );
});

test("fixed-direction pair confidence supports the 15-tick scanner threshold", () => {
  const collecting = analyzeFixedDirectionConfidence(
    Array.from({ length: 14 }, () => 2),
    "Even",
    15
  );
  assert.equal(collecting.ready, false);

  const qualifyingEven = analyzeFixedDirectionConfidence(
    [...Array.from({ length: 9 }, () => 2), ...Array.from({ length: 6 }, () => 3)],
    "Even",
    15
  );
  const belowThresholdEven = analyzeFixedDirectionConfidence(
    [...Array.from({ length: 8 }, () => 2), ...Array.from({ length: 7 }, () => 3)],
    "Even",
    15
  );
  assert.equal(qualifyingEven.ready, true);
  assert.equal(qualifyingEven.samples, 15);
  assert.equal(qualifyingEven.winRate, 0.6);
  assert.ok(belowThresholdEven.winRate < 0.6);
  assert.ok(
    qualifyingEven.confidenceLowerBound > belowThresholdEven.confidenceLowerBound
  );
});

test("does not qualify before the independent validation sample is available", () => {
  const signal = analyzeEvenOddSignal(Array.from({ length: 239 }, () => 2), "balanced", 0.9);
  assert.equal(signal.ready, false);
  assert.match(signal.reason, /Collecting/);
});

test("qualifies only when a strong artificial edge clears live payout break-even", () => {
  const signal = analyzeEvenOddSignal(Array.from({ length: 360 }, () => 2), "conservative", 0.9);
  assert.equal(signal.ready, true);
  assert.equal(signal.direction, "Even");
  assert.ok(signal.confidenceLowerBound > signal.breakEvenWinRate);
  assert.ok(signal.conservativeExpectedValue > 0);
});

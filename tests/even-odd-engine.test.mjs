import assert from "node:assert/strict";
import test from "node:test";

import {
  analyzeEvenOddSignal,
  buildAdaptiveRecoveryLadder,
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

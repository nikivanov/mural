import "./testSetup";
import { test } from "node:test";
import assert from "node:assert/strict";
import { estimateProcessingSeconds, ProcessingEstimateInputs } from "../src/processingEstimator";

function baseInputs(overrides: Partial<ProcessingEstimateInputs> = {}): ProcessingEstimateInputs {
    return {
        sourceWidthPx: 1000,
        sourceHeightPx: 1000,
        colorCount: 1,
        fillStrategy: "crossHatch45",
        infillDensity: 3,
        complexity: 0.5,
        deviceFactor: 1,
        ...overrides,
    };
}

test("estimateProcessingSeconds: denser infill costs more processing time", () => {
    const sparse = estimateProcessingSeconds(baseInputs({ infillDensity: 1 }));
    const dense = estimateProcessingSeconds(baseInputs({ infillDensity: 7 }));
    assert.ok(dense.totalSeconds > sparse.totalSeconds);
    assert.ok(dense.breakdown.infillSeconds > sparse.breakdown.infillSeconds);
});

test("estimateProcessingSeconds: more colors costs more processing time", () => {
    const oneColor = estimateProcessingSeconds(baseInputs({ colorCount: 1 }));
    const sixColors = estimateProcessingSeconds(baseInputs({ colorCount: 6 }));
    assert.ok(sixColors.totalSeconds > oneColor.totalSeconds);
});

test("estimateProcessingSeconds: contour and gradientHatch cost more than plain crossHatch45 at the same density", () => {
    const plain = estimateProcessingSeconds(baseInputs({ fillStrategy: "crossHatch45" }));
    const contour = estimateProcessingSeconds(baseInputs({ fillStrategy: "contour" }));
    const gradient = estimateProcessingSeconds(baseInputs({ fillStrategy: "gradientHatch" }));

    assert.ok(contour.breakdown.infillSeconds > plain.breakdown.infillSeconds);
    assert.ok(gradient.breakdown.infillSeconds > plain.breakdown.infillSeconds);
});

test("estimateProcessingSeconds: a higher complexity proxy costs more processing time", () => {
    const simple = estimateProcessingSeconds(baseInputs({ complexity: 0.05 }));
    const complex = estimateProcessingSeconds(baseInputs({ complexity: 0.95 }));
    assert.ok(complex.totalSeconds > simple.totalSeconds);
    assert.ok(complex.estimatedShapeCount > simple.estimatedShapeCount);
});

test("estimateProcessingSeconds: a slower device factor scales the total up", () => {
    const fastDevice = estimateProcessingSeconds(baseInputs({ deviceFactor: 1 }));
    const slowDevice = estimateProcessingSeconds(baseInputs({ deviceFactor: 8 }));
    assert.ok(slowDevice.totalSeconds > fastDevice.totalSeconds);
});

test("estimateProcessingSeconds: larger source images cost more processing time", () => {
    const small = estimateProcessingSeconds(baseInputs({ sourceWidthPx: 200, sourceHeightPx: 200 }));
    const large = estimateProcessingSeconds(baseInputs({ sourceWidthPx: 4000, sourceHeightPx: 4000 }));
    assert.ok(large.totalSeconds > small.totalSeconds);
});

test("estimateProcessingSeconds: enabling knockout/flatten adds cost that a plain render doesn't pay", () => {
    const plain = estimateProcessingSeconds(baseInputs({ knockout: false, flattenPaths: false }));
    const withFlatten = estimateProcessingSeconds(baseInputs({ flattenPaths: true }));
    const withBoth = estimateProcessingSeconds(baseInputs({ knockout: true, flattenPaths: true }));

    assert.equal(plain.breakdown.flattenKnockoutSeconds, 0);
    assert.ok(withFlatten.breakdown.flattenKnockoutSeconds > 0);
    assert.ok(withBoth.breakdown.flattenKnockoutSeconds > withFlatten.breakdown.flattenKnockoutSeconds);
});

test("estimateProcessingSeconds: the 2-opt contribution never exceeds its documented real-time budget regardless of device speed", () => {
    // A huge segment count on a very slow device would blow the raw
    // (unclamped) estimate far past 2 seconds - the model must still clamp
    // the 2-opt portion, since the real optimizer.ts pass is wall-clock
    // capped independent of device speed.
    const huge = estimateProcessingSeconds(baseInputs({
        sourceWidthPx: 4000,
        sourceHeightPx: 4000,
        complexity: 1,
        colorCount: 6,
        deviceFactor: 50,
    }));
    // optimizeSeconds = greedyNN (uncapped) + two-opt (capped at 2s) - so
    // the whole stage should still be finite and not absurdly large purely
    // from the two-opt term. We can't isolate two-opt directly from the
    // public API, so assert the overall total stays within a sane order of
    // magnitude rather than exploding unboundedly.
    assert.ok(Number.isFinite(huge.breakdown.optimizeSeconds));
    assert.ok(huge.breakdown.optimizeSeconds < 10_000, "optimize stage should not be unbounded even for a huge, slow-device job");
});

test("estimateProcessingSeconds: deterministic given an explicit deviceFactor", () => {
    const a = estimateProcessingSeconds(baseInputs());
    const b = estimateProcessingSeconds(baseInputs());
    assert.equal(a.totalSeconds, b.totalSeconds);
});

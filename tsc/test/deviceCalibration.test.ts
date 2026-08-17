import "./testSetup";
import { test } from "node:test";
import assert from "node:assert/strict";
import {
    calibrateDeviceSpeed,
    measureCalibrationBenchmark,
    resetDeviceCalibrationCache,
    getCachedDeviceCalibration,
} from "../src/deviceCalibration";

test("calibrateDeviceSpeed: deterministic given a fixed benchmark duration", () => {
    const a = calibrateDeviceSpeed({ benchmarkMs: 24 });
    const b = calibrateDeviceSpeed({ benchmarkMs: 24 });
    assert.equal(a.factor, b.factor);
    assert.equal(a.benchmarkMs, 24);
});

test("calibrateDeviceSpeed: factor scales proportionally with benchmark duration", () => {
    const fast = calibrateDeviceSpeed({ benchmarkMs: 6 });
    const slow = calibrateDeviceSpeed({ benchmarkMs: 60 });
    assert.ok(slow.factor > fast.factor, "a slower benchmark run should produce a larger (slower) device factor");
    // 10x the wall-clock duration should produce ~10x the factor (both are
    // well inside the clamp range, so no clamping should kick in).
    assert.ok(Math.abs(slow.factor / fast.factor - 10) < 0.5);
});

test("calibrateDeviceSpeed: clamps implausible outliers into a plausible range", () => {
    const tinyBenchmark = calibrateDeviceSpeed({ benchmarkMs: 0.00001 });
    const hugeBenchmark = calibrateDeviceSpeed({ benchmarkMs: 1_000_000 });
    assert.ok(tinyBenchmark.factor > 0, "factor must stay positive even for a near-zero benchmark duration");
    assert.ok(tinyBenchmark.factor >= 0.1);
    assert.ok(hugeBenchmark.factor <= 50);
});

test("calibrateDeviceSpeed: a supplied benchmarkMs is never cached", () => {
    resetDeviceCalibrationCache();
    calibrateDeviceSpeed({ benchmarkMs: 100 });
    assert.equal(getCachedDeviceCalibration(), undefined, "explicit overrides must not pollute the memoized real-measurement cache");
});

test("calibrateDeviceSpeed: without an override, runs and caches a real benchmark producing a plausible factor", () => {
    resetDeviceCalibrationCache();
    const result = calibrateDeviceSpeed();
    assert.ok(Number.isFinite(result.factor));
    assert.ok(result.factor > 0);
    assert.ok(result.factor >= 0.1 && result.factor <= 50);
    assert.ok(result.benchmarkMs >= 0);

    const second = calibrateDeviceSpeed();
    assert.equal(second, result, "a second call with no override should reuse the memoized calibration");
});

test("measureCalibrationBenchmark: returns a small, non-negative duration well under the 'few hundred ms' ceiling", () => {
    const elapsed = measureCalibrationBenchmark();
    assert.ok(elapsed >= 0);
    // Generous upper bound - this workload is sized to be cheap even on a
    // very slow device; a CI machine should clear it with room to spare.
    assert.ok(elapsed < 2000, `calibration workload took implausibly long: ${elapsed}ms`);
});

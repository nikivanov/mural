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
    // These two values must both land well inside [MIN_DEVICE_FACTOR,
    // MAX_DEVICE_FACTOR] once divided by REFERENCE_BENCHMARK_MS (currently
    // 134 - see that constant's comment), or the clamp kicks in and breaks
    // the proportionality this test checks. Picked relative to that
    // constant rather than as fixed literals so a future re-measurement of
    // REFERENCE_BENCHMARK_MS (expected - see its own comment) doesn't
    // silently push one of these into the clamp range again.
    const fast = calibrateDeviceSpeed({ benchmarkMs: 60 });
    const slow = calibrateDeviceSpeed({ benchmarkMs: 600 });
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

// Regression test for the actual incident: REFERENCE_BENCHMARK_MS was
// hardcoded to 12 (undocumented, never measured) when the real value on the
// primary M5 Pro dev machine is ~134ms - an ~11x error that alone produced
// a device factor of ~10 on that exact machine instead of ~1.0, before
// processingEstimator.ts's own (separately broken) coefficients even ran.
// Nothing here could have caught that: calibrateDeviceSpeed's other tests
// above all supply an explicit benchmarkMs override specifically to be
// deterministic/environment-independent, so none of them ever exercised
// REFERENCE_BENCHMARK_MS against a real measurement on the machine it
// claims to describe. This test deliberately runs the REAL, unmocked
// benchmark (no benchmarkMs override) so a future edit to
// REFERENCE_BENCHMARK_MS that drifts far from this machine's actual speed
// fails loudly instead of shipping silently, the way the 12ms value did.
//
// The bound is loose (0.4x-3x, not ~1.0 exactly) to tolerate normal
// machine-to-machine and run-to-run variance (thermal state, background
// load, CI runner class) while still catching an order-of-magnitude error
// like the one this regresses against.
test("calibrateDeviceSpeed: a real (unmocked) run on this machine reports a factor near 1.0", () => {
    resetDeviceCalibrationCache();
    const result = calibrateDeviceSpeed();
    assert.ok(
        result.factor >= 0.4 && result.factor <= 3.0,
        `expected a device factor near 1.0 on the reference machine, got ${result.factor} ` +
        `(benchmarkMs=${result.benchmarkMs}) - if this machine's speed genuinely changed, or ` +
        `CALIBRATION_ITERATIONS/the workload shape changed, re-measure REFERENCE_BENCHMARK_MS ` +
        `(see its comment in deviceCalibration.ts) rather than loosening this bound.`,
    );
});

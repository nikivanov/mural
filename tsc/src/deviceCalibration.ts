// Device-speed calibration for the processing-time estimator
// (processingEstimator.ts).
//
// The rendering pipeline (toCommands.ts) runs entirely client-side in a
// browser Web Worker - vectorizing, k-means quantization, boolean
// knockout, infill generation, and a 2-opt path-optimization pass are all
// plain synchronous JS/CPU work. The primary user's desktop (an M5 Pro)
// and a visitor's phone can easily differ by 5-10x in how fast that CPU
// work runs, so any processing-time estimate that assumes one specific
// machine's speed is close to useless on the other.
//
// Rather than hardcode a device class (desktop/phone) or read
// navigator.hardwareConcurrency (a core count, not a speed - and
// unavailable/unreliable across browsers), this measures the *current*
// device directly: run a small, cheap, representative CPU workload once,
// time it, and compare against a fixed reference duration measured on the
// primary dev machine. That ratio becomes `factor` - a single multiplier
// every cost formula in processingEstimator.ts scales its (M5-Pro-shaped)
// base coefficients by.
export type DeviceCalibration = {
    // How many times slower (>1) or faster (<1) this device is than the
    // M5 Pro reference machine the base coefficients in
    // processingEstimator.ts were tuned against. Every processing-time
    // formula multiplies its raw estimate by this.
    factor: number;
    // The raw measured wall-clock duration (ms) of the calibration
    // workload on this device - exposed for diagnostics/telemetry, not
    // itself consumed by the cost formulas (they only use `factor`).
    benchmarkMs: number;
    // Date.now() at the moment this calibration was produced - lets a
    // caller decide whether a cached calibration is stale (e.g. the tab
    // has been open for hours and thermal throttling may have kicked in).
    measuredAt: number;
};

// Wall-clock duration (ms) that CALIBRATION_ITERATIONS of
// runCalibrationWorkload() took on the primary M5 Pro development
// machine. This is the "factor 1.0" baseline every other device's
// measurement is divided by. If the workload below is ever changed,
// this MUST be re-measured on that reference machine and updated -
// it is not derived from anything else.
//
// MEASURED 2026-08-18 on the primary M5 Pro dev machine, by calling the
// real measureCalibrationBenchmark() (via the compiled dist-test build,
// so it's the actual shipped code path, not a re-implementation) 15-25
// times per process across 15 separate `node` invocations (330 samples
// total, first 3 samples of each process run discarded as JIT warm-up),
// then taking the pooled median: 133.6ms (p25=132.5ms, p75=135.8ms,
// mean=136.4ms - a handful of >150ms outliers from OS scheduling/thermal
// jitter pull the mean up but don't move the median). 134 is that median
// rounded to a whole ms.
//
// The previous value here (12ms) was never actually measured - it was
// off by ~11x, which alone produced a device factor of ~10 on this exact
// machine instead of ~1.0, before the cost-model coefficients in
// processingEstimator.ts even ran. See the git history of this file/PR
// for the incident.
//
// Re-measure and update this constant whenever runCalibrationWorkload()
// or CALIBRATION_ITERATIONS changes - it is a snapshot of one specific
// workload on one specific machine, not something that can be derived
// from the new workload's shape. To re-measure: build the test output
// (`npx tsc -p tsconfig.test.json` from tsc/), then call
// `measureCalibrationBenchmark()` from dist-test/src/deviceCalibration.js
// repeatedly (ideally across several separate `node` process
// invocations, to average out JIT-warmup and OS-scheduling variance) and
// take the median, discarding the first few samples of each process as
// warm-up.
const REFERENCE_BENCHMARK_MS = 134;

// Iteration count for the calibration workload. Chosen so the workload
// itself finishes in single-digit milliseconds on the reference machine
// and comfortably under "a few hundred ms" (the task's own ceiling) even
// on a device 10-20x slower - large enough that Date.now()/performance.now()
// resolution doesn't dominate the measurement, small enough to never be a
// perceptible delay before the UI can show an estimate.
const CALIBRATION_ITERATIONS = 4_000_000;

// Clamp bounds for the derived factor. A factor is a ratio of two
// wall-clock measurements, so background-tab timer throttling, a GC pause
// landing mid-benchmark, or plain clock-resolution jitter on a very fast
// run can all produce an implausible outlier; every formula downstream
// multiplies by this value directly, so an unclamped fluke (e.g. an
// accidental near-zero factor) would silently produce a nonsense estimate
// rather than a merely-imprecise one.
const MIN_DEVICE_FACTOR = 0.1; // floor: nothing plausibly renders >10x faster than the reference desktop
const MAX_DEVICE_FACTOR = 50; // ceiling: the task's own "5-10x slower" phone guidance, times a generous safety margin

function now(): number {
    // `performance.now()` is available in every environment this pipeline
    // actually runs in (browser main thread and Web Worker); Date.now() is
    // the plain-Node fallback so this module (and its tests) also work
    // outside a browser/worker context without any shimming.
    return typeof performance !== 'undefined' && typeof performance.now === 'function'
        ? performance.now()
        : Date.now();
}

// The calibration workload itself: repeated trig + sqrt over a tight
// numeric loop. Deliberately shaped after the kind of scalar
// floating-point math the real pipeline is full of - k-means' repeated
// squared-distance comparisons (vectorizer.ts), optimizer.ts's
// getDistance() calls in both the greedy nearest-neighbour pass and the
// bounded 2-opt pass, gradientHatch's per-step atan2/sqrt sampling
// (fillStrategies/gradientHatch.ts) - rather than e.g. array-allocation-
// heavy or DOM-heavy work that wouldn't be representative of what actually
// dominates render time.
function runCalibrationWorkload(iterations: number): number {
    let acc = 0;
    for (let i = 0; i < iterations; i++) {
        const t = i * 0.0001;
        acc += Math.sqrt(Math.abs(Math.sin(t) * Math.cos(t * 1.0001))) + (acc % 3);
    }
    return acc;
}

// Runs the calibration workload once and returns its measured wall-clock
// duration in ms. Exposed separately from calibrateDeviceSpeed() so a
// caller (or a test) can measure independently of the caching/clamping
// logic below.
export function measureCalibrationBenchmark(iterations: number = CALIBRATION_ITERATIONS): number {
    const start = now();
    const guard = runCalibrationWorkload(iterations);
    const elapsed = now() - start;

    // Reference `guard` so an aggressive bundler/minifier can never prove
    // the loop is dead code and eliminate it - the actual value is
    // otherwise unused.
    if (!Number.isFinite(guard)) {
        throw new Error('unreachable: calibration workload produced a non-finite result');
    }

    return elapsed;
}

// Memoized across calls with no explicit `benchmarkMs` override - running
// the real benchmark is cheap (a few ms to a few hundred ms, see above) but
// still unnecessary work to repeat on every estimate call within the same
// session/device.
let cachedCalibration: DeviceCalibration | undefined;

export type CalibrateDeviceSpeedOptions = {
    // Supplies a pre-measured benchmark duration instead of running the
    // workload - the seam tests use for deterministic, environment-
    // independent assertions (see this file's test). A caller-supplied
    // value is never cached (it's a one-off, e.g. a fixture value in a
    // test), so it doesn't clobber a previously cached real measurement.
    benchmarkMs?: number;
    // Overrides the iteration count used when actually running the
    // workload (ignored if `benchmarkMs` is supplied). Mainly for tests
    // that want a faster/slower real run.
    iterations?: number;
};

// Produces this device's calibration: either from a supplied benchmark
// duration (deterministic, for tests) or by actually running the
// calibration workload (memoized after the first real run).
export function calibrateDeviceSpeed(options: CalibrateDeviceSpeedOptions = {}): DeviceCalibration {
    if (options.benchmarkMs === undefined && cachedCalibration) {
        return cachedCalibration;
    }

    const benchmarkMs = options.benchmarkMs !== undefined
        ? options.benchmarkMs
        : measureCalibrationBenchmark(options.iterations);

    const rawFactor = benchmarkMs / REFERENCE_BENCHMARK_MS;
    const factor = Math.min(MAX_DEVICE_FACTOR, Math.max(MIN_DEVICE_FACTOR, rawFactor));

    const calibration: DeviceCalibration = {
        factor,
        benchmarkMs,
        measuredAt: Date.now(),
    };

    if (options.benchmarkMs === undefined) {
        cachedCalibration = calibration;
    }

    return calibration;
}

// Clears the memoized real-measurement cache. Tests use this to get a
// fresh measurement per test case; a long-lived UI session could also call
// this occasionally (e.g. on a "re-check my device speed" action) if
// thermal throttling is suspected of having changed the device's actual
// speed mid-session.
export function resetDeviceCalibrationCache(): void {
    cachedCalibration = undefined;
}

export function getCachedDeviceCalibration(): DeviceCalibration | undefined {
    return cachedCalibration;
}

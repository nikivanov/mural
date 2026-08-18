// Processing-time estimator: wall-clock seconds the browser Web Worker will
// spend running the render pipeline (toCommands.ts: generatePaths ->
// flatten -> knockout -> generateInfills -> optimizePaths incl. 2-opt ->
// renderPathsToCommands -> RDP simplify -> dedupe -> measure), given only
// the inputs a user picks BEFORE rendering.
//
// This is a calibrated analytical model, not a simulation: each pipeline
// stage gets one explicit, documented, easily-retuned coefficient (see the
// `export const ..._COEFFICIENT`/`..._US_PER_...` constants throughout),
// and the whole thing is scaled by a per-device speed factor
// (deviceCalibration.ts) so the same formula produces a sane number on
// both the primary M5 Pro desktop and a much slower phone. If real-world
// measurements later show a stage's coefficient is off, only that one
// constant needs retuning - the formula shapes themselves are meant to be
// stable.
import { InfillDensity } from './types';
import { FillStrategyName } from './fillStrategyNames';
import { spacingMmForDensity, projectSegmentCounts, SegmentProjection } from './segmentModel';
import { calibrateDeviceSpeed, DeviceCalibration } from './deviceCalibration';

export type ProcessingEstimateInputs = {
    // Source raster dimensions - drives every per-pixel stage (vectorize's
    // k-means quantization + Potrace tracing + fringe resolution).
    sourceWidthPx: number;
    sourceHeightPx: number;
    // Number of pens/colors. 1 means single-color/grayscale (no k-means,
    // one trace pass). vectorizeImageDataColor's k-means quantization
    // (vectorizer.ts) only runs when this is >1.
    colorCount: number;
    fillStrategy: FillStrategyName;
    infillDensity: InfillDensity;
    // 0 (flat/simple - e.g. a few large solid regions) to 1 (highly
    // detailed - e.g. dense linework or fine photographic texture). A cheap
    // proxy for how many distinct traced paths the vectorizer will produce
    // at a given resolution; imageCharacteristics.ts's
    // analyzeImageCharacteristics() derives a value that plugs directly in
    // here (see costEstimator.ts's estimateAndRecommend), but any 0..1
    // number works standalone.
    complexity: number;
    // Whether huePalette.ts's hue-grouping ran. This is cheap (pure
    // hex/HSL math over the palette, not a per-pixel or per-path pass), so
    // it only adds a small fixed-per-color overhead rather than scaling
    // any of the big per-pixel/per-path stages.
    hueGrouping?: boolean;
    // Cross-layer knockout (flattener.ts's flattenPathsAcrossLayers,
    // toCommands.ts's `!request.colorOverprint` branch) - boolean
    // path-subtraction across every pair of shapes in different color
    // layers.
    knockout?: boolean;
    // Intra-layer knockout (flattener.ts's flattenPaths) - boolean
    // path-subtraction across every pair of shapes within one layer.
    flattenPaths?: boolean;
    // When set (>1), vectorizeImageDataGrayscale traces this many nested
    // luminance-band levels instead of one; each level re-scans every
    // pixel, same as an extra "color". Mutually exclusive with colorCount>1
    // in the real pipeline (vectorizer.ts) - if both are set here, the
    // larger of the two is used as the effective per-pixel-stage
    // multiplier, matching "whichever one actually re-scans the raster
    // more times".
    grayscaleLevels?: number;
    // Overrides device calibration (e.g. a UI that already ran/cached
    // calibrateDeviceSpeed() once for the session). Omit to calibrate (or
    // reuse the cached calibration) automatically.
    deviceFactor?: number;
};

export type ProcessingEstimateBreakdown = {
    vectorizeSeconds: number;
    flattenKnockoutSeconds: number;
    infillSeconds: number;
    optimizeSeconds: number;
    renderSimplifyDedupeSeconds: number;
};

export type ProcessingEstimate = {
    totalSeconds: number;
    breakdown: ProcessingEstimateBreakdown;
    deviceCalibration: DeviceCalibration;
    estimatedShapeCount: number;
    estimatedTotalDrawSegments: number;
};

// --- Stage 1: vectorize (vectorizer.ts) --------------------------------
//
// k-means quantization (colorCount>1 only), Potrace tracing, and
// classifyWithFringeResolution's per-pixel classification+growth pass are
// all O(pixels); none dominates enough on its own to warrant separate
// tuning, so they share one blended per-pixel-per-level coefficient.
//
// MEASURED 2026-08-18 on the M5 Pro reference machine via
// tsc/bench/runBenchmarks.js (see that file's header for how to re-run):
// vectorizeImageDataGrayscale (pure per-level trace cost, no k-means) timed
// across Brown-Horse-Clipart-GraphicsFairy.jpg at two raster sizes
// (~317K and ~1.27M px) and levels=1..4 (8 data points), fit by
// least-squares through the origin against pixels*levels. Predicted vs.
// measured ranged 0.69x-1.12x across those 8 points - well within this
// estimator's +-2x accuracy bar. The previous value here (1.6) was never
// measured and was ~13x too high.
export const VECTORIZE_US_PER_PIXEL_PER_LEVEL = 0.12;

// k-means (vectorizer.ts's kMeansQuantize) runs up to K_MEANS_MAX_ITERATIONS
// (10, mirrored here) full reassignment passes over every sampled
// (non-background) pixel, additional to the per-pixel trace/classify cost
// above, and only when no fixed palette is supplied (colorCount>1, no
// palette).
export const KMEANS_ITERATIONS = 10; // mirrors vectorizer.ts's K_MEANS_MAX_ITERATIONS
// MEASURED 2026-08-18 (same session as VECTORIZE_US_PER_PIXEL_PER_LEVEL
// above): vectorizeImageDataColor timed on Bluey_Hero.png at two sizes
// (~490K and ~1.96M px) x colorCount in {2,3,4,6}, with the per-pixel
// trace cost (colorCount x VECTORIZE_US_PER_PIXEL_PER_LEVEL, since each
// color mask is its own independent trace pass) subtracted out first, then
// the remainder fit against pixels*KMEANS_ITERATIONS. k-means's actual
// iteration count varies run to run (it stops early on convergence, see
// kMeansQuantize), so this is noisier than the trace-only fit above
// (ratios 0.58x-1.37x across 8 points) but still within the accuracy bar.
// Previous value (0.05) was ~8x too high.
export const KMEANS_US_PER_PIXEL_PER_ITERATION = 0.006;

// Hue-grouping (huePalette.ts) is pure per-color hex/HSL/tone math, not a
// per-pixel pass - a small fixed cost per color, not scaled by pixel count.
// MEASURED 2026-08-18: applyHueGrouping timed on synthetic palettes of
// 2/3/6/10/16 colors (tsc/bench/runBenchmarks.js's benchHueGrouping) -
// converges to ~1.2-1.3us/color once past the first (JIT-warmup-inflated)
// sample; this stage is sub-millisecond even at 16 colors, so its accuracy
// barely matters to the total estimate either way. Previous value (200)
// was ~150x too high.
export const HUE_GROUPING_US_PER_COLOR = 1.5;

function estimateVectorizeSeconds(inputs: ProcessingEstimateInputs, pixels: number, levels: number): number {
    const traceSeconds = (pixels * levels * VECTORIZE_US_PER_PIXEL_PER_LEVEL) / 1e6;

    const kMeansSeconds = inputs.colorCount > 1
        ? (pixels * KMEANS_ITERATIONS * KMEANS_US_PER_PIXEL_PER_ITERATION) / 1e6
        : 0;

    const hueGroupingSeconds = inputs.hueGrouping
        ? (Math.max(1, inputs.colorCount) * HUE_GROUPING_US_PER_COLOR) / 1e6
        : 0;

    return traceSeconds + kMeansSeconds + hueGroupingSeconds;
}

// --- Estimating how many paths the vectorizer will produce --------------
//
// Needed to cost every downstream stage (knockout, infill, optimize,
// render/simplify/dedupe), all of which scale with path/segment count
// rather than raw pixel count. BASE_PATHS_PER_MEGAPIXEL is the path count
// assumed for a "medium complexity" (complexity=0.5) single-color
// 1-megapixel image - deliberately conservative and the single knob to
// retune against real traced output.
export const BASE_PATHS_PER_MEGAPIXEL = 150;

// complexity=0 must still trace to at least a handful of paths (a "flat"
// image is not a blank one), so complexity is remapped onto this floor..1
// range rather than multiplying by complexity directly (which would send a
// complexity=0 image's path count to zero).
const MIN_COMPLEXITY_FACTOR = 0.15;

function estimateShapeCount(inputs: ProcessingEstimateInputs, pixels: number): number {
    const complexity = Math.min(1, Math.max(0, inputs.complexity));
    const complexityFactor = MIN_COMPLEXITY_FACTOR + (1 - MIN_COMPLEXITY_FACTOR) * complexity;
    const megapixels = pixels / 1e6;
    const colorMultiplier = Math.max(1, inputs.colorCount);

    return Math.max(1, Math.round(BASE_PATHS_PER_MEGAPIXEL * megapixels * complexityFactor * colorMultiplier));
}

// --- Stage 2: knockout/flatten (flattener.ts) ---------------------------
//
// Boolean path subtraction (paper.js's unite/subtract, wrapped by
// flattener.ts's applyWhiteKnockout/flattenPaths/flattenPathsAcrossLayers)
// is checked pairwise across shapes sharing paint order, so this scales
// with shapeCount^2 - by far the most expensive per-pair operation in the
// whole pipeline (general polygon boolean ops, not a cheap distance
// comparison), hence the much larger per-pair coefficient than the
// optimizer's below.
//
// MEASURED 2026-08-18: flattenPaths (intra-layer) timed on SVG_Logo.svg's
// traced paths at shapeCount in {2,4,7,10,13} (tsc/bench/runBenchmarks.js's
// benchFlatten), fit by least-squares through the origin against
// shapeCount^2. Previous value (25) was ~11x too low.
//
// KNOWN LIMITATION, not fixed by this recalibration: this coefficient (and
// the shapeCount^2 formula generally) only knows shape *count*, not shape
// *complexity*. A raster color-separation mask traced from a detailed
// image (e.g. a busy cartoon) can come back as ONE compound path per color
// with thousands of internal sub-loops from Potrace - shapeCount stays
// tiny (1 per layer) but a single subtract() between two such paths is
// dramatically more expensive than this formula assumes. Measured
// end-to-end on Bluey_Hero.png (500px, 2-4 colors, cross-layer knockout):
// real cost was 3-14 SECONDS against a shapeCount of only 2-4 per side -
// three to four orders of magnitude beyond what shapeCount^2 x this
// coefficient would predict. There is no pre-render signal available to
// this estimator (which only knows requested colorCount, not what Potrace
// will actually produce) that would let it see this coming; fixing it
// properly would need either a post-vectorize complexity signal (e.g. real
// traced point count) threaded into the estimate, or a pipeline-side fix
// (flattener.ts operating on decomposed sub-paths instead of whole
// compound paths). Flagged separately rather than addressed here.
export const FLATTEN_US_PER_SHAPE_PAIR = 280;

function estimateFlattenKnockoutSeconds(inputs: ProcessingEstimateInputs, shapeCount: number): number {
    if (!inputs.flattenPaths && !inputs.knockout) {
        return 0;
    }
    // Both intra-layer (flattenPaths) and cross-layer (knockout) passes run
    // when both are requested (toCommands.ts's renderMultiColor runs
    // flattenPaths per layer, then flattenPathsAcrossLayers across layers)
    // - so cost doubles when both are on rather than being deduplicated.
    const passes = (inputs.flattenPaths ? 1 : 0) + (inputs.knockout ? 1 : 0);
    return (passes * shapeCount * shapeCount * FLATTEN_US_PER_SHAPE_PAIR) / 1e6;
}

// --- Stage 3: infill (infill.ts + fillStrategies/*) ---------------------
//
// Per-path cost at a reference spacing (INFILL_BASE_SPACING_MM, density
// level 3), for each registered strategy - see each strategy's own file
// for what the coefficient approximates:
//   - crossHatch45/crossHatchAngled: two-direction line-grid build + clip
//     (hatchGrid.ts/hatchClip.ts).
//   - singleDirectionHatch: the same machinery, one direction only - about
//     half crossHatch45's cost.
//   - jitteredHatch: crossHatchAngled's grid plus a small per-line seeded-
//     random perturbation.
//   - spiral: point-sampling + path.contains() tests along one continuous
//     curve - broadly similar per-unit-length cost to a hatch line's own
//     clip test, no grid setup.
//   - gradientHatch: BY FAR the most expensive per unit - each seed walks a
//     multi-step streamline, resampling the gradient field and testing
//     containment at every step (fillStrategies/streamline.ts), on top of
//     the one-time Sobel pass (imageGradient.ts) amortized elsewhere.
//   - contour: Clipper integer-polygon offsetting per ring
//     (fillStrategies/contour.ts) - general polygon-offset math, the next
//     most expensive strategy after gradientHatch.
// MEASURED 2026-08-18 via tsc/bench/runBenchmarks.js's benchFillStrategiesMatrix:
// generateInfills timed per strategy x density {1,3,5} x 3 geometries
// (SVG_Logo.svg at 300mm/900mm, Brown-Horse-Clipart-GraphicsFairy.jpg
// traced at 300mm), fit by least-squares through the origin against
// (real infillSegmentCount) x (INFILL_BASE_SPACING_MM / actual spacing),
// using only the higher-segment-count runs (>=100 segments) to avoid
// being dominated by each strategy's own fixed per-call setup cost (grid
// construction, Clipper initialization, etc.) - see this constant's
// section in the harness/PR notes for the full per-strategy ratio table.
// At very low segment counts (a handful of segments on a small/simple
// shape) that fixed setup cost can dominate the *absolute* time (tens of
// ms) even though it's a poor fit for the *proportional* model here; since
// those cases are trivially fast in absolute terms regardless, this
// under-modeling doesn't meaningfully affect the total estimate.
//
// gradientHatch specifically: neither benchmark geometry above carries a
// source luminance gradient field (see gradientHatch.ts's header - it
// falls back to crossHatch45's cheap path for pure vector-origin SVGs or
// gradient-free rasters), so the matrix run alone would have measured the
// *fallback*, not the real gradient-follow algorithm - and did, the first
// time this was run (it came back ~identical to crossHatch45, contradicting
// gradientHatch's own header comment that it's "BY FAR the most expensive").
// Corrected via a separate targeted measurement: vectorizeImageData +
// withGradientField on Brown-Horse-Clipart-GraphicsFairy.jpg (600px, so
// generateInfills's gradientField lookup actually finds real field data),
// generateInfills with fillMethod='gradientHatch' at density {1,3,5} ->
// 352/258/424 us/segment-at-base-spacing; 350 used below.
export const INFILL_US_PER_SEGMENT_AT_BASE_SPACING: Record<FillStrategyName, number> = {
    crossHatch45: 30,
    crossHatchAngled: 85,
    singleDirectionHatch: 88,
    jitteredHatch: 87,
    spiral: 286,
    gradientHatch: 350,
    contour: 344,
};
export const INFILL_BASE_SPACING_MM = 10; // density level 3 - the coefficients above are calibrated at this spacing

function estimateInfillSeconds(inputs: ProcessingEstimateInputs, segments: SegmentProjection): number {
    const spacingMm = spacingMmForDensity(inputs.infillDensity);
    if (spacingMm <= 0 || segments.infillSegmentCount === 0) {
        return 0;
    }
    // Generating a finer (smaller spacingMm) hatch/ring/streamline grid
    // costs proportionally more per unit length - infill.ts's own comment
    // on infillDensityToSpacingMap notes "ink laid per unit area scales
    // roughly as 1/spacing", and computing that ink is the dominant cost
    // here, so the same 1/spacing scaling is used for compute cost.
    const densityScale = INFILL_BASE_SPACING_MM / spacingMm;
    const usPerSegment = INFILL_US_PER_SEGMENT_AT_BASE_SPACING[inputs.fillStrategy];

    return (segments.infillSegmentCount * usPerSegment * densityScale) / 1e6;
}

// --- Stage 4: optimize (optimizer.ts) ------------------------------------
//
// The greedy nearest-neighbour pass (optimizePaths' outer while loop,
// getClosestInfilledPath) rescans every remaining shape on each iteration -
// O(shapeCount^2) simple distance comparisons (cheap per pair, unlike
// flatten's boolean ops above).
// MEASURED 2026-08-18: this harness's geometries (SVG_Logo.svg: 13 shapes;
// the horse trace: 1 shape) don't vary shapeCount enough to isolate the
// greedy pass's own O(shapeCount^2) cost from the 2-opt pass's
// O(totalDrawSegments^2) cost below - optimizePaths() only exposes their
// combined wall time. Both loops do the same kind of work (a plain
// paper.Point#getDistance comparison per pair - see optimizer.ts's
// getClosestPath/getClosestInfilledPath and twoOptOptimize), so, lacking
// data to separate them, this reuses the single per-pair coefficient fit
// below for TWO_OPT_US_PER_SEGMENT_PAIR rather than guessing a different
// number for this one. Re-deriving them separately would need a benchmark
// geometry matrix that varies shapeCount independently of
// totalDrawSegments (e.g. many small shapes vs. few large ones at matched
// total segment counts) - flagged as a follow-up, not done here.
export const GREEDY_NN_US_PER_SHAPE_PAIR = 0.31;

// The bounded 2-opt pass (twoOptOptimize) is also O(totalDrawSegments^2) in
// the worst case, but - unlike every other stage in this model - it has a
// hard REAL wall-clock cap (TWO_OPT_TIME_BUDGET_MS = 2000ms in
// optimizer.ts, checked via Date.now(), not scaled by device speed): a slow
// device simply completes fewer 2-opt improvement passes within that same
// 2 real seconds, it doesn't take proportionally longer. So this stage's
// raw (device-scaled) estimate is calculated first and then clamped to the
// budget, rather than the budget itself being scaled - see
// estimateOptimizeSeconds below.
//
// MEASURED 2026-08-18 via the same fill-strategy matrix as the infill
// section above: optimizePaths() timed alongside generateInfills(), fit
// against totalDrawSegments^2 using the median per-pair implied
// coefficient across all 63 runs (least-squares through the origin was
// skewed by a few large runs; see this constant's PR notes for the full
// table). Actual optimizePaths cost depends on how infill segments
// distribute across shapes, not just their total count (optimizer.ts's
// outer loop only compares within one shape's own infill lines at a time -
// see getClosestInfilledPath/getClosestPath), so a single geometry with
// many small shapes and one with few large shapes at the same
// totalDrawSegments can genuinely cost differently; this coefficient is a
// calibrated average across both regimes present in the benchmark data,
// not an exact model. Measured ratios: median 1.2x, p90 3x, worst case
// 9.8x (a 900mm/density-5/gradientHatch run) - the worst case exceeds this
// estimator's usual +-2x target; see the PR notes for why a linear-in-
// totalDrawSegments model can't fully capture this stage.
export const TWO_OPT_US_PER_SEGMENT_PAIR = 0.31;
export const TWO_OPT_TIME_BUDGET_SECONDS = 2; // mirrors optimizer.ts's TWO_OPT_TIME_BUDGET_MS

function estimateOptimizeSeconds(deviceFactor: number, shapeCount: number, totalDrawSegments: number): number {
    const greedyNnSeconds = deviceFactor * (shapeCount * shapeCount * GREEDY_NN_US_PER_SHAPE_PAIR) / 1e6;

    const rawTwoOptSeconds = deviceFactor * (totalDrawSegments * totalDrawSegments * TWO_OPT_US_PER_SEGMENT_PAIR) / 1e6;
    const twoOptSeconds = Math.min(rawTwoOptSeconds, TWO_OPT_TIME_BUDGET_SECONDS);

    return greedyNnSeconds + twoOptSeconds;
}

// --- Stage 5: render + RDP simplify + dedupe + measure -------------------
//
// renderPathsToCommands (renderer.ts), simplifyPaths' RDP pass
// (simplifier.ts), dedupeCommands (deduplicator.ts), and measureDistance
// (measurer.ts) are all a single linear walk over the command/point list,
// so they're modeled together as one per-segment coefficient. (Note: in
// the real pipeline, toCommands.ts's simplifyPaths call actually runs
// *before* infill, not after render like this stage's name suggests - see
// toCommands.ts. It's bundled here anyway, against whichever stage its
// cost is attributed to in the model, rather than left completely
// unmodeled.)
//
// MEASURED 2026-08-18 via the same fill-strategy matrix as the two stages
// above: rdpSimplify + render + dedupe + measure times summed, divided by
// totalDrawSegments (path count, not point count - see caveat below),
// median across 63 runs. Previous value (8) was in the right order of
// magnitude and is only revised down slightly here.
//
// KNOWN LIMITATION, not fixed by this recalibration: totalDrawSegments
// counts *paths* (pen-down/pen-up brackets), not the *points* within them.
// For strategies whose infill paths carry many points per path (spiral's
// continuous curve in particular), the real cost of this stage - which
// walks every point, not every path - can run well ahead of what this
// per-path coefficient predicts. Compounding that: measurer.ts's
// measureDistance has a confirmed O(n^2) algorithmic bug (it calls
// `dedupedCommands.slice(0, i)` inside its own O(n) loop, on every
// iteration), which shows up as a real, measured multi-second stall on
// large/dense spiral renders (e.g. a 900mm/density-5 spiral job measured
// several REAL seconds in this stage alone). That bug is a pipeline
// performance issue, not an estimator-calibration one - flagged
// separately rather than fixed here - but it means this coefficient
// (fit against moderate-sized runs) will under-predict badly on very
// large, point-dense renders until the underlying bug is fixed.
export const RENDER_SIMPLIFY_DEDUPE_US_PER_SEGMENT = 3.5;

function estimateRenderSimplifyDedupeSeconds(totalDrawSegments: number): number {
    return (totalDrawSegments * RENDER_SIMPLIFY_DEDUPE_US_PER_SEGMENT) / 1e6;
}

export function estimateProcessingSeconds(inputs: ProcessingEstimateInputs): ProcessingEstimate {
    // Defensive: every numeric input feeds a multiplication chain, so a single
    // missing or non-finite one propagates NaN all the way to totalSeconds -
    // which the UI would render verbatim as "NaNs" in a user-facing warning.
    // TypeScript makes that unreachable for typed callers, but data/www is
    // plain untypechecked JS, so a future caller assembling this object by
    // hand could omit a field and see that. Substitute a neutral value
    // instead: a wrong-but-plausible estimate degrades far better than NaN.
    inputs = {
        ...inputs,
        sourceWidthPx: Number.isFinite(inputs.sourceWidthPx) ? inputs.sourceWidthPx : 0,
        sourceHeightPx: Number.isFinite(inputs.sourceHeightPx) ? inputs.sourceHeightPx : 0,
        colorCount: Number.isFinite(inputs.colorCount) ? inputs.colorCount : 1,
        complexity: Number.isFinite(inputs.complexity) ? inputs.complexity : 0.5,
    };

    const deviceCalibration = inputs.deviceFactor !== undefined
        ? { factor: inputs.deviceFactor, benchmarkMs: 0, measuredAt: Date.now() }
        : calibrateDeviceSpeed();
    const deviceFactor = deviceCalibration.factor;

    const pixels = Math.max(0, inputs.sourceWidthPx) * Math.max(0, inputs.sourceHeightPx);
    const levels = Math.max(1, inputs.grayscaleLevels ?? 1, inputs.colorCount);

    const shapeCount = estimateShapeCount(inputs, pixels);
    const avgShapeSpanMm = estimateAvgShapeSpanMmFromPixelDensity(pixels, shapeCount);
    const segments = projectSegmentCounts({
        shapeCount,
        avgShapeSpanMm,
        fillStrategy: inputs.fillStrategy,
        infillDensity: inputs.infillDensity,
    });

    const breakdown: ProcessingEstimateBreakdown = {
        vectorizeSeconds: deviceFactor * estimateVectorizeSeconds(inputs, pixels, levels),
        flattenKnockoutSeconds: deviceFactor * estimateFlattenKnockoutSeconds(inputs, shapeCount),
        infillSeconds: deviceFactor * estimateInfillSeconds(inputs, segments),
        optimizeSeconds: estimateOptimizeSeconds(deviceFactor, shapeCount, segments.totalDrawSegments),
        renderSimplifyDedupeSeconds: deviceFactor * estimateRenderSimplifyDedupeSeconds(segments.totalDrawSegments),
    };

    const totalSeconds = Object.values(breakdown).reduce((sum, v) => sum + v, 0);

    return {
        totalSeconds,
        breakdown,
        deviceCalibration,
        estimatedShapeCount: shapeCount,
        estimatedTotalDrawSegments: segments.totalDrawSegments,
    };
}

// Without a physical output size, avgShapeSpanMm (segmentModel.ts's
// per-shape "diameter", used for infill segment-count projection) is
// approximated purely from pixel density: assume shapes are, on average,
// spread evenly across the source raster in pixel terms, take a nominal
// SOURCE_PX_TO_MM_ASSUMPTION px-per-mm scale (a mid-range print/display
// resolution) to translate that into mm, and treat the whole thing as
// square. costEstimator.ts's estimateAndRecommend() instead derives
// avgShapeSpanMm from the caller's actual requested physical output size
// when one is known - prefer that whenever it's available; this fallback
// only exists so estimateProcessingSeconds() is usable standalone.
const SOURCE_PX_TO_MM_ASSUMPTION = 4; // ~100 DPI-ish; only affects the standalone fallback above

function estimateAvgShapeSpanMmFromPixelDensity(pixels: number, shapeCount: number): number {
    if (shapeCount <= 0) return 0;
    const avgAreaPx = pixels / shapeCount;
    return Math.sqrt(avgAreaPx) / SOURCE_PX_TO_MM_ASSUMPTION;
}

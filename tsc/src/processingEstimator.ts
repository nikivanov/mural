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
// Order-of-magnitude starting point: low single-digit microseconds per
// pixel per traced level on the M5 Pro reference device - retune against
// real measured vectorize() calls.
export const VECTORIZE_US_PER_PIXEL_PER_LEVEL = 1.6;

// k-means (vectorizer.ts's kMeansQuantize) runs up to K_MEANS_MAX_ITERATIONS
// (10, mirrored here) full reassignment passes over every sampled
// (non-background) pixel, additional to the per-pixel trace/classify cost
// above, and only when no fixed palette is supplied (colorCount>1, no
// palette).
export const KMEANS_ITERATIONS = 10; // mirrors vectorizer.ts's K_MEANS_MAX_ITERATIONS
export const KMEANS_US_PER_PIXEL_PER_ITERATION = 0.05;

// Hue-grouping (huePalette.ts) is pure per-color hex/HSL/tone math, not a
// per-pixel pass - a small fixed cost per color, not scaled by pixel count.
export const HUE_GROUPING_US_PER_COLOR = 200;

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
export const FLATTEN_US_PER_SHAPE_PAIR = 25;

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
export const INFILL_US_PER_SEGMENT_AT_BASE_SPACING: Record<FillStrategyName, number> = {
    crossHatch45: 18,
    crossHatchAngled: 19,
    singleDirectionHatch: 12,
    jitteredHatch: 22,
    spiral: 15,
    gradientHatch: 45,
    contour: 60,
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
export const GREEDY_NN_US_PER_SHAPE_PAIR = 0.15;

// The bounded 2-opt pass (twoOptOptimize) is also O(totalDrawSegments^2) in
// the worst case, but - unlike every other stage in this model - it has a
// hard REAL wall-clock cap (TWO_OPT_TIME_BUDGET_MS = 2000ms in
// optimizer.ts, checked via Date.now(), not scaled by device speed): a slow
// device simply completes fewer 2-opt improvement passes within that same
// 2 real seconds, it doesn't take proportionally longer. So this stage's
// raw (device-scaled) estimate is calculated first and then clamped to the
// budget, rather than the budget itself being scaled - see
// estimateOptimizeSeconds below.
export const TWO_OPT_US_PER_SEGMENT_PAIR = 0.08;
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
// so they're modeled together as one per-segment coefficient.
export const RENDER_SIMPLIFY_DEDUPE_US_PER_SEGMENT = 8;

function estimateRenderSimplifyDedupeSeconds(totalDrawSegments: number): number {
    return (totalDrawSegments * RENDER_SIMPLIFY_DEDUPE_US_PER_SEGMENT) / 1e6;
}

export function estimateProcessingSeconds(inputs: ProcessingEstimateInputs): ProcessingEstimate {
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

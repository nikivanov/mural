// Shared "how many drawable path segments will this render produce"
// projection, used by both the processing-time estimator
// (processingEstimator.ts, to cost the optimizer/render/dedupe stages
// before any actual path exists) and the plotting-time estimator
// (plottingEstimator.ts, to project pen-lift count and ink/travel distance
// before rendering). Deliberately paper.js-free (see fillStrategyNames.ts's
// header for why) - this only ever reasons about counts and average
// lengths in mm, never real geometry.
//
// This is an order-of-magnitude *projection*, not a simulation: it exists
// so a user can see a plausible cost BEFORE committing to a render (the
// whole point of this module - see the task brief). Once a real render has
// happened, prefer measuring the actual command list directly
// (plottingEstimator.ts's estimatePlottingSecondsFromCommands, backed by
// the existing measurer.ts) over anything projected here.
import { InfillDensity } from './types';
import { FillStrategyName } from './fillStrategyNames';

// Hatch spacing (mm) per density level. MUST mirror infill.ts's
// `infillDensityToSpacingMap` exactly - duplicated here (rather than
// imported) because infill.ts calls loadPaper() at import time, which this
// paper.js-free module must not depend on (see fillStrategyNames.ts).
// fillStrategies.test.ts's guarded suite cross-checks this against the
// real map so the two can't silently drift.
export const INFILL_DENSITY_TO_SPACING_MM: Record<InfillDensity, number> = {
    0: 0,
    1: 20,
    2: 15,
    3: 10,
    4: 7,
    5: 5,
    6: 3.5,
    7: 2.5,
};

export function spacingMmForDensity(density: InfillDensity): number {
    return INFILL_DENSITY_TO_SPACING_MM[density];
}

export type SegmentProjectionInputs = {
    // Number of distinct traced/flattened outline shapes about to be
    // filled - e.g. processingEstimator.ts's estimatedPathCount.
    shapeCount: number;
    // Average bounding "diameter" (mm) of one shape - drives how many
    // hatch lines/rings/streamlines fit across it. Typically
    // sqrt(totalDrawAreaMm2 / shapeCount); see costEstimator.ts for how the
    // public entry point derives this from the requested physical output
    // size.
    avgShapeSpanMm: number;
    fillStrategy: FillStrategyName;
    infillDensity: InfillDensity;
    // 0 (clean/low-detail trace - each shape is close to a simple
    // convex-ish blob) .. 1 (highly detailed source - each traced shape is
    // likely a compound path with many internal sub-loops/holes, e.g.
    // Potrace's output for a busy colour-separation mask). Corrects a
    // structural blind spot in the per-shape split-factor constants below
    // (the hatch "1.3" concavity factor, spiral's
    // SPIRAL_CONCAVITY_SPLIT_FACTOR): those were calibrated against
    // moderate-detail single shapes, and badly under-predict when a shape
    // is actually a multi-hole compound path - shapeCount alone can't see
    // this (a raster colour separation traces to very FEW shapes that are
    // individually enormous), so this is a second, independent signal.
    // Pass processingEstimator.ts's/costEstimator.ts's `complexity` input
    // (0..1, itself derived from imageCharacteristics.ts's flat/edge
    // fractions) directly - see processingEstimator.ts's call site.
    // Optional/defaults to 0 (no correction) so existing standalone callers
    // keep their prior behavior.
    shapeComplexity?: number;
};

export type SegmentProjection = {
    shapeCount: number;
    // Total number of separate infill stroke/line/ring paths across every
    // shape - each one is its own pen-down/pen-up bracket at render time
    // (see renderPathsToCommands, renderer.ts: every paper.Path in the
    // optimized list gets exactly one leading 'p0' and one 'p1').
    infillSegmentCount: number;
    // shapeCount (one outline per shape) + infillSegmentCount - the total
    // number of paths renderPathsToCommands will emit, i.e. the total
    // number of (pen-down, pen-up) pairs.
    totalDrawSegments: number;
    // Rough average length (mm) of one infill segment, used by the
    // plotting-time projection to turn a segment count into an ink-length
    // estimate. Exposed here (rather than recomputed) since it's a natural
    // byproduct of the per-strategy model below.
    avgInfillSegmentLengthMm: number;
};

// Per-strategy segment-count model. Each strategy's actual geometry is
// described in tsc/src/fillStrategies/*.ts; the comments below cite the
// specific mechanism each coefficient approximates.
//
// spacingMm === 0 (density 0, "no infill") always yields zero infill
// segments regardless of strategy - handled once, up front, rather than in
// each branch.
function estimateInfillSegmentsForOneShape(
    strategy: FillStrategyName,
    spacingMm: number,
    avgShapeSpanMm: number,
    shapeComplexity: number,
): { count: number; avgLengthMm: number } {
    if (spacingMm <= 0 || avgShapeSpanMm <= 0) {
        return { count: 0, avgLengthMm: 0 };
    }

    // How many hatch-line-spacing periods fit across the shape's span -
    // the shared quantity every straight-hatch strategy's line count scales
    // with (buildHatchLines, fillStrategies/hatchGrid.ts).
    const linesAcrossSpan = avgShapeSpanMm / spacingMm;

    switch (strategy) {
        case 'singleDirectionHatch':
            // One hatch direction (fillStrategies/singleDirectionHatch.ts):
            // ~linesAcrossSpan lines, each clipped to the shape and
            // typically split into ~1.3 runs by non-convex boundaries
            // (a deliberately mild, order-of-magnitude split factor - most
            // shapes traced from real art are close enough to convex along
            // any one hatch line that a full extra split per line would
            // overstate this).
            return { count: Math.max(1, Math.round(linesAcrossSpan * 1.3)), avgLengthMm: avgShapeSpanMm * 0.6 };

        case 'crossHatch45':
        case 'crossHatchAngled':
            // Two hatch directions 90 degrees apart (crossHatch45.ts /
            // hatchGrid.ts's 'cross' mode) - double singleDirectionHatch's
            // line count at the same spacing.
            return { count: Math.max(1, Math.round(linesAcrossSpan * 2 * 1.3)), avgLengthMm: avgShapeSpanMm * 0.6 };

        case 'jitteredHatch':
            // Same two-direction grid as crossHatchAngled
            // (fillStrategies/jitteredHatch.ts builds on crossHatchAngled's
            // shape), so the same line/segment count - the jitter perturbs
            // endpoints, it doesn't add or remove lines.
            return { count: Math.max(1, Math.round(linesAcrossSpan * 2 * 1.3)), avgLengthMm: avgShapeSpanMm * 0.6 };

        case 'spiral': {
            // spiralFill.ts's whole point: one continuous Archimedean
            // spiral, so a genuinely convex, single-loop shape collapses to
            // essentially one run - SPIRAL_CONCAVITY_SPLIT_FACTOR is the
            // floor for that clean case.
            //
            // MEASURED 2026-08-18 (task brief's under-read bug): that floor
            // is only realistic for low-detail shapes. A shape traced from
            // detailed/edge-dense source content (e.g. Potrace's output for
            // a busy colour-separation mask) is typically a compound path
            // with many internal sub-loops/holes, and spiralFill's own
            // re-entry handling produces roughly one extra run per
            // sub-loop the spiral's growing radius crosses - which scales
            // with BOTH how finely spaced the spiral is (linesAcrossSpan)
            // AND how hole-dense the shape is (shapeComplexity, 0..1 - see
            // SegmentProjectionInputs' own doc comment).
            //
            // Fit end-to-end against real totals (shapeCount x this
            // per-shape count vs. measured total infill segment count),
            // NOT against the real per-shape average directly - this
            // formula is always evaluated against THIS module's own
            // (over-)estimated shapeCount (colour separation traces to far
            // fewer real shapes than estimateShapeCount predicts - see
            // processingEstimator.ts's estimateShapeCount, a known,
            // separately-flagged limitation), so calibrating the per-shape
            // factor to cancel that over-count, rather than to match a real
            // per-shape average that a smaller real shapeCount would need
            // multiplied by, is what makes the *product* land close to
            // reality. tsc/bench/runBenchmarks.js's benchColorSeparationMatrix
            // on SVG_Logo.svg (2 colour groups, 18 real shapes vs. this
            // estimator's own shapeCount=50 for that same image,
            // complexity=0.306), density 1/3/5 (3 points), least-squares
            // through the origin: predicted vs. measured total infill
            // segments 0.94x/0.90x/0.99x (using this module's own
            // avgShapeSpanMm at shapeCount=50). Only calibrated against one
            // image at one complexity level and one shapeCount-over-count
            // ratio (~2.8x) - a very different over/under-count ratio would
            // need this re-derived; flagged as a follow-up, not fixed here.

            const SPIRAL_CONCAVITY_SPLIT_FACTOR = 2;
            const SPIRAL_COMPLEXITY_LINES_PER_SPACING_UNIT = 5.6;
            const complexityRuns = Math.round(linesAcrossSpan * shapeComplexity * SPIRAL_COMPLEXITY_LINES_PER_SPACING_UNIT);
            return { count: Math.max(SPIRAL_CONCAVITY_SPLIT_FACTOR, complexityRuns), avgLengthMm: avgShapeSpanMm * Math.PI };
        }

        case 'gradientHatch': {
            // Seeded on a roughly square grid across the shape's *area*
            // (buildSeedGrid, fillStrategies/gradientHatch.ts), spaced
            // spacingMm apart in both axes - so seed count scales with
            // (span/spacing)^2, not linearly like a straight hatch, WHEN a
            // real source luminance gradient field is present. Each
            // surviving seed produces one short stroke
            // (STROKE_LENGTH_SPACING_MULTIPLIER=3x spacing long, that
            // file's own constant); GRADIENT_SEED_SURVIVAL_FRACTION
            // accounts for seeds skipped by the containment/flat-magnitude
            // checks in that file. This quadratic-in-1/spacing scaling,
            // combined with each stroke being individually short, is
            // exactly the "many short disconnected segments" case the task
            // brief calls out as pen-lift-pathological.
            //
            // BUT gradientHatch.ts's own header is explicit that it only
            // does this when a real gradient field exists (raster-origin
            // content with genuine local shading) - "for pure vector-origin
            // SVGs, or for a raster-origin path whose local gradient is
            // genuinely flat, there's nothing directional to follow", so it
            // delegates straight to crossHatch45's linear-in-linesAcrossSpan
            // machinery instead. Which case a given pre-render image will
            // hit isn't knowable from this module's inputs (no gradient-
            // field-presence signal reaches here) - and every real
            // measurement available (tsc/bench/runBenchmarks.js's
            // benchFillStrategiesMatrix, none of whose geometries carry a
            // gradient field - see that section's own comment) exercises
            // only the crossHatch45 fallback, where this quadratic formula
            // badly OVER-predicts once avgShapeSpanMm reflects the real
            // physical size (e.g. 900mm) rather than the old, much smaller,
            // pixel-density guess. With no calibration data for the true
            // gradient-follow path at all, and confirmed data showing the
            // fallback is common and must not be over-predicted, this
            // capped to whichever of the two is cheaper: the quadratic
            // seed-grid projection when it happens to predict FEWER
            // segments than the crossHatch45 fallback would (genuinely fine
            // spacing on a small shape), and the crossHatch45-equivalent
            // linear count otherwise (the common case) - a deliberately
            // conservative choice given the missing calibration data, not a
            // claim that the quadratic model is wrong for a true
            // gradient-follow render. Flagged as a follow-up needing a real
            // gradient-field measurement (mirroring
            // INFILL_US_PER_SEGMENT_AT_BASE_SPACING's own gradientHatch
            // note above), not fully fixed here.
            const GRADIENT_SEED_SURVIVAL_FRACTION = 0.55;
            const seedCount = linesAcrossSpan * linesAcrossSpan;
            const quadraticCount = Math.max(1, Math.round(seedCount * GRADIENT_SEED_SURVIVAL_FRACTION));
            const fallbackCount = Math.max(1, Math.round(linesAcrossSpan * 2 * 1.3)); // crossHatch45-equivalent
            return {
                count: Math.min(quadraticCount, fallbackCount),
                avgLengthMm: spacingMm * 3,
            };
        }

        case 'contour': {
            // Concentric inset rings (contour.ts): ring count is bounded by
            // roughly (max(width,height) / (2*spacing)) + 2, per that
            // file's own `sizeBoundedRings` formula - each ring is one
            // closed path.
            const rings = Math.ceil(avgShapeSpanMm / (2 * spacingMm)) + 2;
            return { count: Math.max(1, rings), avgLengthMm: avgShapeSpanMm * Math.PI * 0.5 };
        }
    }
}

export function projectSegmentCounts(inputs: SegmentProjectionInputs): SegmentProjection {
    const shapeCount = Math.max(0, Math.round(inputs.shapeCount));
    const spacingMm = spacingMmForDensity(inputs.infillDensity);

    const shapeComplexity = Math.min(1, Math.max(0, inputs.shapeComplexity ?? 0));
    const perShape = estimateInfillSegmentsForOneShape(inputs.fillStrategy, spacingMm, inputs.avgShapeSpanMm, shapeComplexity);

    const infillSegmentCount = shapeCount * perShape.count;
    const totalDrawSegments = shapeCount + infillSegmentCount;

    return {
        shapeCount,
        infillSegmentCount,
        totalDrawSegments,
        avgInfillSegmentLengthMm: perShape.avgLengthMm,
    };
}

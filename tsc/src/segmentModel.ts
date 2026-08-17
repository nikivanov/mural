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
            // spiral, so a convex shape collapses to essentially one run.
            // SPIRAL_CONCAVITY_SPLIT_FACTOR is a small constant (not
            // spacing-dependent) standing in for the handful of extra runs
            // a non-convex shape's boundary re-entries produce - this is
            // exactly the strategy the task brief singles out as the
            // pen-lift-minimizing choice, so its segment count must stay
            // roughly constant (not grow with density) to reflect that.
            const SPIRAL_CONCAVITY_SPLIT_FACTOR = 2;
            return { count: SPIRAL_CONCAVITY_SPLIT_FACTOR, avgLengthMm: avgShapeSpanMm * Math.PI };
        }

        case 'gradientHatch': {
            // Seeded on a roughly square grid across the shape's *area*
            // (buildSeedGrid, fillStrategies/gradientHatch.ts), spaced
            // spacingMm apart in both axes - so seed count scales with
            // (span/spacing)^2, not linearly like a straight hatch. Each
            // surviving seed produces one short stroke
            // (STROKE_LENGTH_SPACING_MULTIPLIER=3x spacing long, that
            // file's own constant); GRADIENT_SEED_SURVIVAL_FRACTION
            // accounts for seeds skipped by the containment/flat-magnitude
            // checks in that file. This quadratic-in-1/spacing scaling,
            // combined with each stroke being individually short, is
            // exactly the "many short disconnected segments" case the task
            // brief calls out as pen-lift-pathological.
            const GRADIENT_SEED_SURVIVAL_FRACTION = 0.55;
            const seedCount = linesAcrossSpan * linesAcrossSpan;
            return {
                count: Math.max(1, Math.round(seedCount * GRADIENT_SEED_SURVIVAL_FRACTION)),
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

    const perShape = estimateInfillSegmentsForOneShape(inputs.fillStrategy, spacingMm, inputs.avgShapeSpanMm);

    const infillSegmentCount = shapeCount * perShape.count;
    const totalDrawSegments = shapeCount + infillSegmentCount;

    return {
        shapeCount,
        infillSegmentCount,
        totalDrawSegments,
        avgInfillSegmentLengthMm: perShape.avgLengthMm,
    };
}

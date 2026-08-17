// The registered fill-strategy names (fillStrategies/registry.ts), mirrored
// here as a plain, paper.js-free literal union/array.
//
// The estimator modules (processingEstimator.ts, segmentModel.ts) need to
// key cost tables by strategy name, but must NOT import
// fillStrategies/registry.ts (or anything under fillStrategies/) directly:
// every one of those modules calls loadPaper() at import time (via
// '../paperLoader'), which requires a compiled native `canvas` addon to
// work outside a browser/worker context (see test/testSetup.ts's header for
// the full story) - importing that chain here would make the cost
// estimator's own tests hostage to whether `canvas` happens to be built in
// the current environment, which defeats the point of a pure-logic,
// easily-testable module.
//
// This file is intentionally the single place that duplicates the
// strategy-name list; fillStrategies.test.ts (guarded exactly like the
// existing fill-strategy tests: skips when `canvas`/paper.js isn't
// available) cross-checks it against the real registry so the two can't
// silently drift.
export type FillStrategyName =
    | 'crossHatch45'
    | 'singleDirectionHatch'
    | 'crossHatchAngled'
    | 'jitteredHatch'
    | 'spiral'
    | 'gradientHatch'
    | 'contour';

export const FILL_STRATEGY_NAMES: FillStrategyName[] = [
    'crossHatch45',
    'singleDirectionHatch',
    'crossHatchAngled',
    'jitteredHatch',
    'spiral',
    'gradientHatch',
    'contour',
];

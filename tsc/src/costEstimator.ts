// PUBLIC ENTRY POINT for the cost-estimation module.
//
// This module answers two questions a user needs BEFORE they commit to a
// render:
//   (a) PROCESSING time - how long the browser will grind through
//       vectorizing/quantizing/knocking-out/infilling/optimizing/rendering
//       the image (processingEstimator.ts), scaled for the current
//       device's actual speed (deviceCalibration.ts).
//   (b) PLOTTING time - how long the physical plotter will take to draw the
//       result (plottingEstimator.ts), including the pen-lift cost that
//       dominates on strategies that produce many short disconnected
//       segments.
// It also answers a third, related question: what settings should this
// particular image use by default, so it "just works" without the user
// needing to understand fill strategies or hatch density
// (smartDefaults.ts, driven by imageCharacteristics.ts's cheap image
// stats).
//
// -------------------------------------------------------------------
// USAGE (for the UI branch consuming this module)
// -------------------------------------------------------------------
//
//   import { estimateAndRecommend } from './costEstimator';
//
//   const result = estimateAndRecommend(imageData, {
//       // Any of these override the corresponding smart default; omit to
//       // use the recommended value.
//       colorCount: 4,
//       fillStrategy: 'crossHatch45',
//       infillDensity: 3,
//       hueGrouping: false,
//       knockout: true,
//       flattenPaths: true,
//       grayscaleLevels: undefined,
//       // Physical size the job will actually be drawn at - used to turn
//       // path/segment *counts* into real mm draw/travel distances for the
//       // plotting-time projection. Defaults to a generic mural-sized
//       // guess (see DEFAULT_DRAW_WIDTH_MM/HEIGHT_MM below) if omitted -
//       // supply the real planned size for an accurate plotting estimate.
//       drawWidthMm: 900,
//       drawHeightMm: 1200,
//       // Plotter speed profile (see plottingEstimator.ts's header for why
//       // this is a required-to-think-about parameter, not a baked-in
//       // constant - the pen-up travel speed is mid-migration between two
//       // firmware behaviors on a sibling branch).
//       speeds: CURRENT_FIRMWARE_SPEEDS, // the default; see plottingEstimator.ts
//   });
//
//   result.characteristics   // ImageCharacteristics - the raw image stats
//   result.recommendations   // SmartDefaults - value + human-readable rationale, per field
//   result.deviceCalibration // DeviceCalibration - this device's measured speed factor
//   result.processing        // ProcessingEstimate - seconds + per-stage breakdown
//   result.plotting          // PlottingTimeEstimate - seconds + draw/travel/pen-lift breakdown
//
// Every option is independent: pass none to get pure recommendations run
// through both estimators; override just `fillStrategy` to see how a
// user's manual choice compares to the recommended one, etc.
import { InfillDensity } from './types';
import { FillStrategyName } from './fillStrategyNames';
import { analyzeImageCharacteristics, ImageCharacteristics } from './imageCharacteristics';
import { recommendDefaults, SmartDefaults } from './smartDefaults';
import { calibrateDeviceSpeed, DeviceCalibration } from './deviceCalibration';
import { estimateProcessingSeconds, ProcessingEstimate } from './processingEstimator';
import {
    estimatePlottingSeconds,
    PlottingTimeEstimate,
    PlotterSpeedProfile,
    CURRENT_FIRMWARE_SPEEDS,
} from './plottingEstimator';
import { projectSegmentCounts, spacingMmForDensity } from './segmentModel';

export {
    // Re-exported so a caller only needs one import for the common path,
    // while every module remains independently importable/testable.
    analyzeImageCharacteristics,
    recommendDefaults,
    calibrateDeviceSpeed,
    estimateProcessingSeconds,
    estimatePlottingSeconds,
    CURRENT_FIRMWARE_SPEEDS,
};
export type { ImageCharacteristics, SmartDefaults, DeviceCalibration, ProcessingEstimate, PlottingTimeEstimate, PlotterSpeedProfile };

// Generic fallback physical size (mm) used only when the caller doesn't yet
// know the actual planned draw size (e.g. showing a rough estimate before
// the user has picked a canvas size). A mid-size mural - purely a
// placeholder for turning path *counts* into ink-length mm; pass real
// drawWidthMm/drawHeightMm for an accurate plotting estimate.
export const DEFAULT_DRAW_WIDTH_MM = 900;
export const DEFAULT_DRAW_HEIGHT_MM = 1200;

export type CostEstimatorOptions = {
    // Render settings. Each defaults to the corresponding smart
    // recommendation (see `recommendations` in the result) when omitted.
    colorCount?: number;
    fillStrategy?: FillStrategyName;
    infillDensity?: InfillDensity;
    hueGrouping?: boolean;
    // Cross-layer / intra-layer knockout (see processingEstimator.ts's
    // ProcessingEstimateInputs for what each controls). Not covered by
    // smart defaults (they're structural render choices, not
    // image-derived) - default false/off.
    knockout?: boolean;
    flattenPaths?: boolean;
    grayscaleLevels?: number;
    // A cheap 0..1 image-complexity proxy for the processing estimate.
    // Defaults to (1 - flatFraction) from the computed characteristics -
    // the fraction of the image that ISN'T a large uniform region, a
    // reasonable stand-in for "how much tracing work is here" (see
    // processingEstimator.ts's `complexity` doc comment).
    complexity?: number;
    // Skips live device calibration in favor of a caller-supplied value
    // (e.g. a UI that already calibrated once this session).
    deviceFactor?: number;
    // Physical output size (mm) - see DEFAULT_DRAW_WIDTH_MM/HEIGHT_MM above.
    drawWidthMm?: number;
    drawHeightMm?: number;
    speeds?: PlotterSpeedProfile;
};

export type CostEstimateAndRecommendation = {
    characteristics: ImageCharacteristics;
    recommendations: SmartDefaults;
    deviceCalibration: DeviceCalibration;
    processing: ProcessingEstimate;
    plotting: PlottingTimeEstimate;
};

// Rough fraction of an outline shape's own bounding "diameter" that its
// drawn boundary length works out to, on average, across typical traced
// shapes (a mix of roughly circular/blobby and roughly rectangular forms) -
// used only to turn a projected shape count into a projected outline ink
// length for the pre-render plotting estimate. A circle's circumference is
// pi*diameter (~3.14); a square's perimeter is 4*side (~4x its diagonal's
// 0.7 share... i.e. ~2.8x its diameter) - 3.0 sits between those two common
// cases.
const OUTLINE_PERIMETER_PER_SPAN = 3.0;

export function estimateAndRecommend(imageData: ImageData, options: CostEstimatorOptions = {}): CostEstimateAndRecommendation {
    const characteristics = analyzeImageCharacteristics(imageData);
    const recommendations = recommendDefaults(characteristics);

    const colorCount = options.colorCount ?? recommendations.colorCount.value;
    const fillStrategy = options.fillStrategy ?? recommendations.fillStrategy.value;
    const infillDensity = options.infillDensity ?? recommendations.infillDensity.value;
    const hueGrouping = options.hueGrouping ?? recommendations.hueGrouping.value;
    const complexity = options.complexity ?? (1 - characteristics.flatFraction);

    const deviceCalibration = options.deviceFactor !== undefined
        ? { factor: options.deviceFactor, benchmarkMs: 0, measuredAt: Date.now() }
        : calibrateDeviceSpeed();

    const processing = estimateProcessingSeconds({
        sourceWidthPx: characteristics.widthPx,
        sourceHeightPx: characteristics.heightPx,
        colorCount,
        fillStrategy,
        infillDensity,
        complexity,
        hueGrouping,
        knockout: options.knockout,
        flattenPaths: options.flattenPaths,
        grayscaleLevels: options.grayscaleLevels,
        deviceFactor: deviceCalibration.factor,
    });

    const drawWidthMm = options.drawWidthMm ?? DEFAULT_DRAW_WIDTH_MM;
    const drawHeightMm = options.drawHeightMm ?? DEFAULT_DRAW_HEIGHT_MM;
    const drawAreaMm2 = Math.max(0, drawWidthMm) * Math.max(0, drawHeightMm);
    const avgShapeSpanMm = processing.estimatedShapeCount > 0
        ? Math.sqrt(drawAreaMm2 / processing.estimatedShapeCount)
        : 0;

    const segments = projectSegmentCounts({
        shapeCount: processing.estimatedShapeCount,
        avgShapeSpanMm,
        fillStrategy,
        infillDensity,
    });

    // Outline ink: one boundary length per shape. Infill ink: segment count
    // times each strategy's own average-segment-length model
    // (segmentModel.ts). Both are order-of-magnitude projections - see
    // plottingEstimator.ts's estimatePlottingSecondsFromCommands for the
    // exact alternative once a real render/command list exists.
    const outlineDrawDistanceMm = segments.shapeCount * avgShapeSpanMm * OUTLINE_PERIMETER_PER_SPAN;
    const infillDrawDistanceMm = segments.infillSegmentCount * segments.avgInfillSegmentLengthMm;
    const drawDistanceMm = outlineDrawDistanceMm + infillDrawDistanceMm;

    // Pen-up travel between consecutive drawn segments: bounded 2-opt
    // (optimizer.ts) minimizes this but doesn't eliminate it: assume, on
    // average, half a shape-span of travel between one segment's end and
    // the next segment's start - a deliberately simple stand-in for
    // "however far apart the optimizer's chosen ordering leaves adjacent
    // segments", since actually simulating the optimizer's output isn't
    // available before a real render.
    const travelDistanceMm = segments.totalDrawSegments * (avgShapeSpanMm / 2);

    // Every drawn path/segment gets its own pen-down + pen-up bracket (see
    // plottingEstimator.ts's PlottingTimeInputs doc comment, citing
    // renderer.ts).
    const penTransitionCount = segments.totalDrawSegments * 2;

    // Pen swaps: one boundary between each pair of colors when multi-color
    // rendering is in play (toCommands.ts's renderMultiColor emits N-1
    // `c<index>` markers for N colors/layers).
    const penSwapCount = Math.max(0, colorCount - 1);

    const plotting = estimatePlottingSeconds(
        { drawDistanceMm, travelDistanceMm, penTransitionCount, penSwapCount },
        { speeds: options.speeds },
    );

    return { characteristics, recommendations, deviceCalibration, processing, plotting };
}

// Re-exported for callers that already have a computed InfillDensity and
// want the same spacing table this module's estimators use internally
// (e.g. to show "X mm hatch spacing" in a UI alongside the density slider).
export { spacingMmForDensity };

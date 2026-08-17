// Strategy registry: name -> FillStrategy. This is the seam follow-up
// branches (single-direction hatch, per-layer angle, jitter, spiral fill,
// contour/offset fill, gradient-directed hatch) plug into - each adds its
// own module and registers it here.
//
// crossHatch45 remains the default and is untouched (always 45 degrees,
// two directions, no jitter - see that file's header). The three strategies
// below it share crossHatch45's clip/split-on-gaps machinery via
// hatchClip.ts and its (generalized) line-grid construction via
// hatchGrid.ts, rather than reimplementing either:
//   - singleDirectionHatch: one hatch direction instead of two (half the
//     coverage of crossHatch45 at the same spacingMm).
//   - crossHatchAngled: crossHatch45's own shape (two directions, 90
//     degrees apart) but at an arbitrary angle, read from
//     PathDensityData.hatchAngleDegrees (default 45).
//   - jitteredHatch: crossHatchAngled's angled cross-hatch with each line's
//     endpoints perturbed by a small seeded-random offset.
// All three honor PathDensityData.hatchAngleDegrees, so "angle" is a
// parameter available on every non-default strategy rather than a 4th
// separate named strategy - see each file's header for why.
import { FillStrategy } from './types';
import { crossHatch45 } from './crossHatch45';
import { spiralFill } from './spiralFill';
import { singleDirectionHatch } from './singleDirectionHatch';
import { crossHatchAngled } from './crossHatchAngled';
import { jitteredHatch } from './jitteredHatch';
import { gradientHatch } from './gradientHatch';

export const defaultFillStrategyName = crossHatch45.name;

export const fillStrategies: Record<string, FillStrategy> = {
    [crossHatch45.name]: crossHatch45,
    [spiralFill.name]: spiralFill,
    [singleDirectionHatch.name]: singleDirectionHatch,
    [crossHatchAngled.name]: crossHatchAngled,
    [jitteredHatch.name]: jitteredHatch,
    [gradientHatch.name]: gradientHatch,
};

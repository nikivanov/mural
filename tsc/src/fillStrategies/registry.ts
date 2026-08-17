// Strategy registry: name -> FillStrategy. This is the seam follow-up
// branches (single-direction hatch, per-layer angle, jitter, spiral fill,
// contour/offset fill, gradient-directed hatch) plug into - each adds its
// own module and registers it here. Only the one working entry exists today;
// do not stub out future strategies' internals in this branch.
import { FillStrategy } from './types';
import { crossHatch45 } from './crossHatch45';

export const defaultFillStrategyName = crossHatch45.name;

export const fillStrategies: Record<string, FillStrategy> = {
    [crossHatch45.name]: crossHatch45,
};

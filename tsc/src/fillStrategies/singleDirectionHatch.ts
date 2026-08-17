// A single-diagonal hatch: reuses crossHatch45's clip/split machinery (via
// hatchClip.ts) but builds only one direction of hatch line instead of two,
// via hatchGrid.ts's generalized line-grid builder.
//
// Coverage relationship to spacingMm: at a given spacingMm this strategy
// lays one pass of parallel lines where crossHatch45 lays two (its own
// diagonal plus the mirrored one), so single-direction coverage is roughly
// HALF of crossHatch45's at the same spacingMm - this does not change what
// spacingMm means for crossHatch45 itself (that formula/behavior is
// untouched), it's just a documented fact about this strategy: a caller
// wanting cross-hatch-equivalent visual density needs to pass roughly half
// the spacing.
//
// Why this exists as its own option: crossHatch45's two overlapping
// directions waste ink at very tight spacings (near-solid density levels),
// since both passes darken the same area. A single direction can go
// noticeably denser before that overdraw sets in, which is what gives finer
// control at the light end of the tone range (see huePalette.ts's
// tone-derived spacing model, which this is a natural fit for at low
// coverage targets).
import { PathDensityData } from '../types';
import { FillContext, FillParams, FillStrategy } from './types';
import { buildHatchLines, defaultHatchAngleDegrees } from './hatchGrid';
import { clipHatchLinesToPath } from './hatchClip';

export const singleDirectionHatch: FillStrategy = {
    name: 'singleDirectionHatch',

    generateFill(path: paper.PathItem, params: FillParams, ctx: FillContext): paper.Path[] {
        const { spacingMm, minInfillLength } = params;
        const { view, boundsPath, cache } = ctx;

        const data = path.data as PathDensityData | undefined;
        const angleDegrees = data?.hatchAngleDegrees ?? defaultHatchAngleDegrees;

        const cacheKey = `singleDirectionHatch:${angleDegrees}:${spacingMm}`;
        let lines = cache.get(cacheKey) as paper.Path.Line[] | undefined;
        if (!lines) {
            lines = buildHatchLines(view, angleDegrees, spacingMm, 'single');
            cache.set(cacheKey, lines);
        }

        return clipHatchLinesToPath(path, lines, boundsPath, minInfillLength);
    },
};

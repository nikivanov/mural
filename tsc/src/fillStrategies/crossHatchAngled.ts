// crossHatch45 generalized to an arbitrary angle instead of the hardcoded
// 45 degrees - registered as its own strategy (rather than changing
// crossHatch45 itself) so crossHatch45's byte-identical density 1-4
// regression test is trivially unaffected: that file is not touched at all.
//
// Reads the angle from PathDensityData.hatchAngleDegrees (types.ts),
// defaulting to 45 degrees (crossHatch45's own angle) when unset, so a path
// that never opts in renders the same cross-hatch shape crossHatch45 would
// (not byte-identical to it - this uses the direction/normal-vector line
// builder in hatchGrid.ts rather than crossHatch45's own tan()-based one -
// but geometrically equivalent).
//
// Why this matters (see docs/multi-color.md, and the nib-contamination
// discussion in earlier multi-color work): each colour layer in multi-color
// mode can get its own hatch angle via this strategy, so overlapping layers
// read as distinct texture instead of visual mud, and non-parallel layers'
// hatch lines cross at fewer, cleaner points than two identical 45-degree
// grids stacked on top of each other would. See generator.ts's
// assignHatchAnglesPerColorGroup, which is what actually assigns a distinct
// angle (and this strategy) to each color group's paths.
import { PathDensityData } from '../types';
import { FillContext, FillParams, FillStrategy } from './types';
import { buildHatchLines, defaultHatchAngleDegrees } from './hatchGrid';
import { clipHatchLinesToPath } from './hatchClip';

export const crossHatchAngled: FillStrategy = {
    name: 'crossHatchAngled',

    generateFill(path: paper.PathItem, params: FillParams, ctx: FillContext): paper.Path[] {
        const { spacingMm, minInfillLength } = params;
        const { view, boundsPath, cache } = ctx;

        const data = path.data as PathDensityData | undefined;
        const angleDegrees = data?.hatchAngleDegrees ?? defaultHatchAngleDegrees;

        const cacheKey = `crossHatchAngled:${angleDegrees}:${spacingMm}`;
        let lines = cache.get(cacheKey) as paper.Path.Line[] | undefined;
        if (!lines) {
            lines = buildHatchLines(view, angleDegrees, spacingMm, 'cross');
            cache.set(cacheKey, lines);
        }

        return clipHatchLinesToPath(path, lines, boundsPath, minInfillLength);
    },
};

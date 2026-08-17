// A cross-hatch (see crossHatchAngled.ts) whose line endpoints are
// perturbed by a small random offset before clipping, so the output stops
// reading as a mechanically perfect grid - real pen strokes on paper have
// exactly this kind of small irregularity, and a dead-regular grid is one
// of the more obvious "a machine drew this" tells at higher densities.
//
// Randomness: seeded (mulberry32, seededRandom.ts), not Math.random() - see
// that file's header for why. The RNG is seeded once per generateInfills()
// call (stored in ctx.cache, which is itself fresh per call - see
// fillStrategies/types.ts) and then drawn from sequentially across every
// line of every path using this strategy in that call, so re-running the
// exact same request reproduces exactly the same jittered geometry, but
// different paths/lines within one render don't all get an identical
// jitter pattern.
//
// Jitter magnitude: JITTER_MM is a fraction of a mm (default 0.15mm, per
// the task's suggested ceiling), applied independently to each endpoint's x
// and y, i.e. up to ~0.21mm (0.15 * sqrt2) of diagonal displacement at the
// corners - small relative to nib width (~1.2mm, see infill.ts) so it reads
// as texture rather than visibly broken hatching.
import { PathDensityData } from '../types';
import { FillContext, FillParams, FillStrategy } from './types';
import { buildHatchLines, defaultHatchAngleDegrees } from './hatchGrid';
import { clipHatchLinesToPath } from './hatchClip';
import { mulberry32, Random } from './seededRandom';
import { loadPaper } from '../paperLoader';

const paper = loadPaper();

// Small fraction of a mm, per the task's guidance ("up to ~0.15mm"). Fixed
// rather than derived from spacingMm: the goal is to break up mechanical
// regularity, not to scale with density, and a jitter that grew with
// spacing could visibly distort very sparse hatching.
const JITTER_MM = 0.15;

// Fixed seed: deterministic across runs (see file header) rather than
// varying per render, which is the simplest thing that satisfies
// "reproducible" - a caller wanting a different-looking jitter pattern for
// the same input would need to plumb a seed through FillParams, which
// nothing currently needs.
const JITTER_SEED = 0x5EED_1E17;

export const jitteredHatch: FillStrategy = {
    name: 'jitteredHatch',

    generateFill(path: paper.PathItem, params: FillParams, ctx: FillContext): paper.Path[] {
        const { spacingMm, minInfillLength } = params;
        const { view, boundsPath, cache } = ctx;

        const data = path.data as PathDensityData | undefined;
        const angleDegrees = data?.hatchAngleDegrees ?? defaultHatchAngleDegrees;

        const gridCacheKey = `jitteredHatch:grid:${angleDegrees}:${spacingMm}`;
        let baseLines = cache.get(gridCacheKey) as paper.Path.Line[] | undefined;
        if (!baseLines) {
            baseLines = buildHatchLines(view, angleDegrees, spacingMm, 'cross');
            cache.set(gridCacheKey, baseLines);
        }

        const rngCacheKey = 'jitteredHatch:rng';
        let random = cache.get(rngCacheKey) as Random | undefined;
        if (!random) {
            random = mulberry32(JITTER_SEED);
            cache.set(rngCacheKey, random);
        }

        const jitterOffset = () => (random!() * 2 - 1) * JITTER_MM;

        const jitteredLines = baseLines.map(line => {
            const start = line.firstSegment.point;
            const end = line.lastSegment.point;
            return new paper.Path.Line(
                { x: start.x + jitterOffset(), y: start.y + jitterOffset() },
                { x: end.x + jitterOffset(), y: end.y + jitterOffset() },
            );
        });

        return clipHatchLinesToPath(path, jitteredLines, boundsPath, minInfillLength);
    },
};

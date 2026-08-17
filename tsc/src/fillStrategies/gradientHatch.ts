// Engraving-style hatch: short strokes that follow the LOCAL image gradient
// (see imageGradient.ts/vectorizer.ts's withGradientField and infill.ts's
// wiring) rather than crossing the shape at one fixed angle - so hatching
// flows along the form (e.g. wrapping around a haunch) instead of ignoring
// it, the way a real engraver's cross-contour hatching does.
//
// Only makes sense where a source luminance gradient actually exists
// (raster-origin content - the Vector->Raster->Vector path, or a
// grayscale/color raster separation). For pure vector-origin SVGs, or for
// a raster-origin path whose local gradient is genuinely flat, there's
// nothing directional to follow, so this strategy delegates straight to
// crossHatch45 - the same shared clip/split machinery every other fixed-
// angle strategy uses, rather than reinventing straight-line hatching.
import { loadPaper } from '../paperLoader';
import { FillContext, FillParams, FillStrategy, GradientFieldLookup } from './types';
import { crossHatch45 } from './crossHatch45';
import { streamlineLength, traceStreamline } from './streamline';

const paper = loadPaper();

// A field magnitude below this fraction of the field's own maximum (see
// imageGradient.ts's normalization) is treated as "no meaningful local
// direction here" - e.g. a flat sky or a solid mid-tone patch, where a
// fixed-angle fallback looks exactly as good and avoids manufacturing a
// spurious direction out of sensor/quantization noise. Not a delicate
// choice: comfortably above the noise floor a near-uniform region produces
// after the blur+Sobel pass, comfortably below any actual edge/shading
// transition worth following.
const FLAT_MAGNITUDE_THRESHOLD = 0.08;

// Each stroke's target length, as a multiple of the hatch spacing - within
// the "2-5x spacingMm" range the task calls for. 3x sits in the middle:
// long enough to read as a directional mark rather than a dot, short
// enough to bend to genuinely local curvature instead of averaging over a
// region where the gradient direction has already moved on.
const STROKE_LENGTH_SPACING_MULTIPLIER = 3;

// A stroke advances in this many steps per spacing unit - coarse enough to
// stay cheap (each step re-samples the field and tests containment), fine
// enough that STROKE_LENGTH_SPACING_MULTIPLIER's worth of curvature isn't
// approximated by just one or two straight segments.
const STEPS_PER_SPACING_UNIT = 4;

// Caps how sharply a stroke's heading can bend between steps, so a noisy
// field produces a gently curved line rather than a jagged zig-zag.
const MAX_TURN_PER_STEP_RADIANS = (25 * Math.PI) / 180;

// Hard cap on the seed grid's cell count, independent of spacingMm - keeps
// worst-case cost (a large path filled at a fine spacing) bounded rather
// than quadratic in 1/spacingMm over the path's full bounding box. Above
// this, the seed grid (not the visual hatch spacing used for stroke
// length/direction) is coarsened just enough to stay under the cap.
const MAX_SEED_GRID_CELLS = 20000;

function normalizeAngle(angle: number): number {
    let a = angle;
    while (a > Math.PI) a -= 2 * Math.PI;
    while (a <= -Math.PI) a += 2 * Math.PI;
    return a;
}

// Cheap per-path check for whether there's anything worth following:
// samples a handful of points across the path's bounds (corners, edge
// midpoints, center) rather than every seed, so a genuinely flat region
// (or a path sitting outside the source raster's data entirely) is
// recognized and routed to the fixed-angle fallback before any streamline
// work is attempted.
function pathHasUsableGradient(path: paper.PathItem, gradientField: GradientFieldLookup, viewSize: paper.Size): boolean {
    const bounds = path.bounds;
    const probePoints = [
        bounds.center,
        bounds.topLeft, bounds.topCenter, bounds.topRight,
        bounds.leftCenter, bounds.rightCenter,
        bounds.bottomLeft, bounds.bottomCenter, bounds.bottomRight,
    ];

    for (const point of probePoints) {
        const sample = gradientField.sampleAt(point, viewSize);
        if (sample && sample.magnitude >= FLAT_MAGNITUDE_THRESHOLD) {
            return true;
        }
    }
    return false;
}

function buildSeedGrid(bounds: paper.Rectangle, spacingMm: number): paper.Point[] {
    let seedSpacing = spacingMm;
    const rawCols = Math.max(1, Math.ceil(bounds.width / seedSpacing) + 1);
    const rawRows = Math.max(1, Math.ceil(bounds.height / seedSpacing) + 1);
    if (rawCols * rawRows > MAX_SEED_GRID_CELLS) {
        seedSpacing = spacingMm * Math.sqrt((rawCols * rawRows) / MAX_SEED_GRID_CELLS);
    }

    const seeds: paper.Point[] = [];
    let rowIndex = 0;
    for (let y = bounds.top; y <= bounds.bottom; y += seedSpacing, rowIndex++) {
        // Stagger alternate rows by half the spacing so seeds don't line
        // up into an obviously rectangular grid before the streamline
        // walk even starts - a small touch toward a less mechanical look.
        const xOffset = (rowIndex % 2 === 0) ? 0 : seedSpacing / 2;
        for (let x = bounds.left + xOffset; x <= bounds.right; x += seedSpacing) {
            seeds.push(new paper.Point(x, y));
        }
    }
    return seeds;
}

export const gradientHatch: FillStrategy = {
    name: 'gradientHatch',

    generateFill(path: paper.PathItem, params: FillParams, ctx: FillContext): paper.Path[] {
        const { spacingMm, minInfillLength } = params;
        const { view, boundsPath, gradientField } = ctx;

        if (spacingMm === 0) {
            return [];
        }

        // No raster-origin gradient data at all (vector-origin SVG, or a
        // render that never called vectorize()) - nothing to follow.
        if (!gradientField) {
            return crossHatch45.generateFill(path, params, ctx);
        }

        // A raster-origin path whose local gradient is genuinely flat -
        // same fallback, chosen per-path rather than per-image since one
        // image can easily contain both richly-shaded and flat regions.
        if (!pathHasUsableGradient(path, gradientField, view.size)) {
            return crossHatch45.generateFill(path, params, ctx);
        }

        const strokeLength = spacingMm * STROKE_LENGTH_SPACING_MULTIPLIER;
        const stepSize = spacingMm / STEPS_PER_SPACING_UNIT;

        const isInside = (x: number, y: number): boolean => {
            const point = new paper.Point(x, y);
            return point.isInside(boundsPath.bounds) && path.contains(point);
        };
        const directionAt = (x: number, y: number): number | undefined => {
            const sample = gradientField.sampleAt(new paper.Point(x, y), view.size);
            if (!sample) return undefined;
            // Strokes follow the ISOPHOTE (constant-luminance direction,
            // perpendicular to the gradient) - the classic engraving look,
            // wrapping around the form rather than cutting across it. A
            // locally flat spot re-samples fine (it just contributes an
            // arbitrary-looking direction) - pathHasUsableGradient already
            // filtered out paths that are flat everywhere; a small flat
            // patch inside an otherwise-shaded path is a rare enough
            // corner case not to special-case per step.
            return normalizeAngle(sample.angle + Math.PI / 2);
        };

        const seeds = buildSeedGrid(path.bounds, spacingMm);
        const infillPaths: paper.Path[] = [];

        for (const seed of seeds) {
            if (!isInside(seed.x, seed.y)) continue;

            const sample = gradientField.sampleAt(seed, view.size);
            if (!sample || sample.magnitude < FLAT_MAGNITUDE_THRESHOLD) continue;

            const startDirection = normalizeAngle(sample.angle + Math.PI / 2);
            const points = traceStreamline(seed.x, seed.y, startDirection, {
                stepSize,
                maxTotalLength: strokeLength,
                maxTurnPerStep: MAX_TURN_PER_STEP_RADIANS,
                isInside,
                directionAt,
            });

            if (points.length < 2) continue;
            if (streamlineLength(points) <= minInfillLength) continue;

            const strokePath = new paper.Path({
                segments: points.map(p => new paper.Point(p.x, p.y)),
            });
            infillPaths.push(strokePath);
        }

        // If every seed ended up skipped or too short (e.g. an oddly
        // shaped sliver where the streamline walk can't find room to grow
        // before leaving the path), fall back rather than leave the
        // region entirely unfilled - crossHatch45's own clip/split logic
        // is far more robust to awkward shapes than a seed-point walk.
        if (infillPaths.length === 0) {
            return crossHatch45.generateFill(path, params, ctx);
        }

        return infillPaths;
    },
};

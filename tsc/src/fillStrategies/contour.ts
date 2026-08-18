// Contour/offset fill: repeatedly insets the region's own outline by
// `params.spacingMm` and draws the resulting rings, so the shape shades
// itself in its own form (like a topographic map / engraving following the
// silhouette) instead of an arbitrary hatch direction.
//
// paper.js has no robust general polygon-offsetting primitive, and
// hand-rolling one (miter/bevel joins, self-intersection handling, hole
// handling) is a well-known hard geometry problem that WILL produce garbage
// on concave shapes or holes if done naively. Instead this strategy converts
// the flattened path boundary to Clipper's integer polygon representation
// and uses the `clipper-lib` package (a pure-JS port of Angus Johnson's
// Clipper library, no native/WASM dependencies) to do the actual offsetting:
// Clipper.SimplifyPolygons resolves whatever the flattened boundary is
// (including self-intersections and multiple/hole subpaths) into its
// canonical simple-polygon-with-holes form, and ClipperOffset then insets
// that robustly at each ring depth. This is why no separate "conservative
// fallback / detect-and-skip" path is needed here (unlike the case where no
// suitable library exists): Clipper's offsetting is safe on arbitrary,
// including concave and multiply-connected, input.
import { loadPaper } from '../paperLoader';
import { FillContext, FillParams, FillStrategy } from './types';
import * as ClipperLib from 'clipper-lib';

const paper = loadPaper();

// Clipper operates on integer coordinates. Paper-space coordinates in this
// pipeline are already in mm (see crossHatch45's spacingMm usage, applied
// directly as paper units), so scale up for sub-micron precision on the
// integer grid and scale back down when converting rings back to paper
// paths.
const CLIPPER_SCALE = 1000;

// Flattening tolerance (mm) for approximating curves as polylines before
// handing them to Clipper, which only understands straight-edged polygons.
// Small relative to the smallest spacing on the density ladder (2.5mm, see
// infill.ts) so it doesn't visibly facet the rings.
const FLATTEN_TOLERANCE_MM = 0.15;

// Hard ceiling on rings per path regardless of geometry, so a pathological
// (e.g. enormous or degenerate) shape can't spin the offset loop forever in
// the worker. In the normal case the loop terminates much earlier, as soon
// as Execute() reports the region is fully consumed (empty solution).
const MAX_RINGS = 2000;

function pathItemToClipperPaths(path: paper.PathItem): ClipperLib.Paths {
    const clone = path.clone({insert: false}) as paper.PathItem;
    clone.flatten(FLATTEN_TOLERANCE_MM);

    const subpaths: paper.Path[] = clone instanceof paper.CompoundPath
        ? clone.children.filter((child): child is paper.Path => child instanceof paper.Path)
        : [clone as paper.Path];

    const clipperPaths: ClipperLib.Paths = [];
    for (const subpath of subpaths) {
        if (subpath.segments.length < 3) {
            continue;
        }
        const clipperPath: ClipperLib.Path = subpath.segments.map(segment => ({
            X: Math.round(segment.point.x * CLIPPER_SCALE),
            Y: Math.round(segment.point.y * CLIPPER_SCALE),
        }));
        clipperPaths.push(clipperPath);
    }

    clone.remove();
    return clipperPaths;
}

function clipperPathToPaperPath(clipperPath: ClipperLib.Path): paper.Path {
    const points = clipperPath.map(point => new paper.Point(point.X / CLIPPER_SCALE, point.Y / CLIPPER_SCALE));
    const ring = new paper.Path(points);
    ring.closed = true;
    return ring;
}

export const contour: FillStrategy = {
    name: 'contour',

    generateFill(path: paper.PathItem, params: FillParams, _ctx: FillContext): paper.Path[] {
        const {spacingMm, minInfillLength} = params;

        // Mirrors crossHatch45's density-0 "no infill" handling.
        if (spacingMm <= 0) {
            return [];
        }

        const rawPaths = pathItemToClipperPaths(path);
        if (rawPaths.length === 0) {
            return [];
        }

        // Resolve the (possibly self-intersecting, multi-contour) flattened
        // outline into Clipper's canonical simple-polygon-with-holes form
        // before offsetting. This is what lets contour fill handle concave
        // shapes, notches, and holes correctly without a hand-rolled offset
        // algorithm.
        const simplified = ClipperLib.Clipper.SimplifyPolygons(rawPaths, ClipperLib.PolyFillType.pftNonZero);
        if (simplified.length === 0) {
            return [];
        }

        // Bound ring count by the region's own size relative to spacing, so
        // a spacing much smaller than the shape can't run away; the normal
        // terminator is Execute() returning an empty solution once the
        // region is fully consumed, which will almost always fire first.
        const bounds = path.bounds;
        const sizeBoundedRings = Math.ceil(Math.max(bounds.width, bounds.height) / (2 * spacingMm)) + 2;
        const ringCap = Math.min(MAX_RINGS, Math.max(1, sizeBoundedRings));

        const offset = new ClipperLib.ClipperOffset();
        offset.AddPaths(simplified, ClipperLib.JoinType.jtRound, ClipperLib.EndType.etClosedPolygon);

        const deltaPerRing = -spacingMm * CLIPPER_SCALE;
        const rings: paper.Path[] = [];

        for (let ring = 1; ring <= ringCap; ring++) {
            const solution: ClipperLib.Paths = [];
            offset.Execute(solution, deltaPerRing * ring);

            if (solution.length === 0) {
                break;
            }

            for (const ringPath of solution) {
                const paperRing = clipperPathToPaperPath(ringPath);
                if (paperRing.length > minInfillLength) {
                    rings.push(paperRing);
                } else {
                    paperRing.remove();
                }
            }
        }

        return rings;
    },
};
